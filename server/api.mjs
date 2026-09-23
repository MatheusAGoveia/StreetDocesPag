import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { seedProducts, seedSettings } from "./seed.mjs";
import { createPixPayload } from "./pix.mjs";
import { BusinessError, handleBusinessApi, loadCostMap } from "./business.mjs";

const statuses = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "dispatched",
  "completed",
  "cancelled",
];
const payments = ["unpaid", "review", "paid", "refunded"];
const attempts = new Map();
const message = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      ...headers,
    },
  });
const fail = (error, status = 400) => message({ error }, status);
const clean = (value, limit = 250) =>
  String(value ?? "")
    .trim()
    .slice(0, limit);
const integer = (value, min = 0, max = 999999) =>
  Number.isInteger(Number(value)) &&
  Number(value) >= min &&
  Number(value) <= max
    ? Number(value)
    : null;
const email = () => process.env.ADMIN_EMAIL?.trim().toLowerCase();
const configured = () =>
  Boolean(
    email() &&
    process.env.ADMIN_PASSWORD_HASH &&
    process.env.SESSION_SECRET?.length >= 32,
  );

function sessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ email: email(), exp: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}
function sessionValid(request) {
  if (!configured()) return false;
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)sd_admin=([^;]+)/)?.[1];
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(signature),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return parsed.email === email() && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
function passwordValid(password) {
  try {
    const [salt, expected] = process.env.ADMIN_PASSWORD_HASH.split(":");
    const actual = scryptSync(String(password), salt, 64);
    const expectedBytes = Buffer.from(expected, "hex");
    return (
      expectedBytes.length === actual.length &&
      timingSafeEqual(actual, expectedBytes)
    );
  } catch {
    return false;
  }
}
function rateLimited(request, key, max, windowMs) {
  const ip =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "local";
  const bucket = `${key}:${ip}`;
  const now = Date.now();
  const recent = (attempts.get(bucket) || []).filter(
    (time) => now - time < windowMs,
  );
  recent.push(now);
  attempts.set(bucket, recent);
  return recent.length > max;
}
async function bodyOf(request) {
  if (Number(request.headers.get("content-length") || 0) > 32768)
    throw new Error("Dados muito grandes.");
  const raw = await request.text();
  if (raw.length > 32768) throw new Error("Dados muito grandes.");
  return JSON.parse(raw || "{}");
}
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
async function catalogOf(storage) {
  return (await storage.get("catalog")) || seedProducts;
}
async function settingsOf(storage) {
  return { ...seedSettings, ...(await storage.get("settings")) };
}
async function ordersOf(storage) {
  const orders = storage.listValues
    ? (await storage.listValues("orders/")).filter(Boolean)
    : (await Promise.all((await storage.list("orders/")).map((key) => storage.get(key)))).filter(Boolean);
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
const newTrackingToken = () => randomBytes(24).toString("base64url");
const customerSessionDays = 14;
const accountKey = (address) =>
  `customers/${createHash("sha256").update(address).digest("hex")}`;
const customerSessionKey = (token) =>
  `customer-sessions/${createHash("sha256").update(token).digest("hex")}`;
const customerCookie = (request, token, maxAge) => {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `sd_customer=${token}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=${maxAge}${secure}`;
};
const publicCustomer = (customer) => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
});
function customerPasswordValid(password, customer) {
  try {
    const [salt, expected] = customer.passwordHash.split(":");
    const actual = scryptSync(String(password), salt, 64);
    const bytes = Buffer.from(expected, "hex");
    return bytes.length === actual.length && timingSafeEqual(actual, bytes);
  } catch {
    return false;
  }
}
async function customerSession(request, storage) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)sd_customer=([A-Za-z0-9_-]+)/)?.[1];
  if (!token || token.length !== 43) return null;
  const session = await storage.get(customerSessionKey(token));
  if (!session || session.expiresAt <= Date.now()) return null;
  const customer = await storage.get(session.accountKey);
  return customer?.id === session.customerId ? customer : null;
}
async function startCustomerSession(request, storage, customer, key) {
  const token = randomBytes(32).toString("base64url");
  const maxAge = customerSessionDays * 24 * 60 * 60;
  const created = await storage.set(customerSessionKey(token), {
    accountKey: key,
    customerId: customer.id,
    expiresAt: Date.now() + maxAge * 1000,
  }, null);
  if (!created) throw new Error("Não foi possível abrir a sessão.");
  return message({ customer: publicCustomer(customer) }, 200, {
    "set-cookie": customerCookie(request, token, maxAge),
  });
}
function trackingValid(order, token) {
  if (!order?.trackingToken || typeof token !== "string") return false;
  const given = Buffer.from(token);
  const expected = Buffer.from(order.trackingToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
function publicOrder(order, settings) {
  const totalCents = order.subtotalCents +
    (order.fulfillment === "delivery" ? order.deliveryFeeCents || 0 : 0);
  const canPay = order.status !== "new" && order.status !== "cancelled" &&
    order.paymentStatus === "unpaid" &&
    (order.fulfillment === "pickup" || order.deliveryFeeCents != null) &&
    Boolean(order.pixKey || settings.pixKey);
  const pixKey = order.pixKey || settings.pixKey;
  const txid = order.pixTxid || order.id.replaceAll("-", "").slice(0, 25).toUpperCase();
  return {
    id: order.id,
    number: order.number,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerName: order.customer.name,
    fulfillment: order.fulfillment,
    address: order.address,
    pickupAddress: settings.pickupAddress,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      image: item.image,
      quantity: item.quantity,
      priceCents: item.priceCents,
      totalCents: item.totalCents,
    })),
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents,
    deliveryPartner: order.deliveryPartner,
    history: order.history,
    canCancel: ["new", "confirmed"].includes(order.status) &&
      order.paymentStatus === "unpaid",
    cancellationReason: order.status === "cancelled"
      ? order.cancellationReason || "Cancelado a pedido do cliente."
      : null,
    paymentReportedAt: order.paymentReportedAt || null,
    pix: canPay ? {
      key: pixKey,
      txid,
      amountCents: totalCents,
      payload: createPixPayload({ key: pixKey, amountCents: totalCents, txid }),
    } : null,
  };
}
function normalizeProduct(data, id, previous) {
  const name = clean(data.name, 80),
    category = clean(data.category, 40),
    flavor = clean(data.flavor, 100);
  const description = clean(data.description, 500),
    image = clean(data.image, 350),
    tag = clean(data.tag, 60);
  const priceCents = integer(data.priceCents, 1, 10000000);
  const stock = integer(data.stock, 0, 100000),
    lowStockThreshold = integer(data.lowStockThreshold, 0, 100000);
  if (
    !name ||
    !category ||
    !flavor ||
    !description ||
    !priceCents ||
    stock === null ||
    lowStockThreshold === null
  )
    throw new Error(
      "Confira nome, categoria, sabor, descrição, preço e estoque.",
    );
  if (!(
    image.startsWith("/images/") ||
    /^\/api\/media\/[a-f0-9-]{36}$/.test(image) ||
    /^https:\/\//.test(image)
  ))
    throw new Error("Use uma imagem enviada, da loja ou uma URL HTTPS.");
  if (!/^#[0-9a-fA-F]{6}$/.test(data.accent)) throw new Error("Cor inválida.");
  return {
    id,
    name,
    category,
    flavor,
    description,
    priceCents,
    image,
    accent: data.accent,
    tag,
    active: data.active !== false,
    trackStock: data.trackStock === true,
    stock,
    lowStockThreshold,
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
async function updateCatalog(storage, transform) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, etag } = await storage.getWithEtag("catalog");
    const next = transform(data || seedProducts);
    if (await storage.set("catalog", next, etag)) return next;
  }
  throw new Error(
    "O catálogo mudou durante a edição. Atualize e tente novamente.",
  );
}
export async function handleApi(request, storage, pathOverride) {
  try {
    const url = new URL(request.url);
    const path = (pathOverride || url.pathname)
      .replace(/^\/.netlify\/functions\/api/, "/api")
      .replace(/\/$/, "");
    const method = request.method.toUpperCase();
    if (!path.startsWith("/api/")) return fail("Rota não encontrada.", 404);
    if (!["GET", "HEAD"].includes(method) && !sameOrigin(request))
      return fail("Origem não permitida.", 403);

    if (path === "/api/storefront" && method === "GET") {
      const [products, settings] = await Promise.all([
        catalogOf(storage),
        settingsOf(storage),
      ]);
      return message({
        products: products.filter((product) => product.active),
        settings,
      });
    }
    const mediaMatch = path.match(/^\/api\/media\/([a-f0-9-]{36})$/);
    if (mediaMatch && method === "GET") {
      const media = await storage.get(`media/${mediaMatch[1]}`);
      if (!media) return fail("Imagem não encontrada.", 404);
      return new Response(Buffer.from(media.base64, "base64"), {
        headers: {
          "content-type": media.mime,
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (path === "/api/account/register" && method === "POST") {
      if (rateLimited(request, "customer-register", 8, 60 * 60 * 1000))
        return fail("Muitas tentativas. Tente mais tarde.", 429);
      const data = await bodyOf(request);
      const name = clean(data.name, 100);
      const address = clean(data.email, 254).toLowerCase();
      const phone = clean(data.phone, 30);
      const digits = phone.replace(/\D/g, "");
      const password = data.password;
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ||
          digits.length < 10 || digits.length > 13 ||
          typeof password !== "string" || password.length < 12 || password.length > 128)
        return fail("Informe nome, e-mail, telefone com DDD e uma senha de 12 a 128 caracteres.");
      const key = accountKey(address);
      const salt = randomBytes(16).toString("hex");
      const customer = {
        id: randomUUID(), name, email: address, phone,
        passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
        createdAt: new Date().toISOString(),
      };
      if (!(await storage.set(key, customer, null)))
        return fail("Já existe uma conta com este e-mail. Entre com sua senha.", 409);
      return startCustomerSession(request, storage, customer, key);
    }
    if (path === "/api/account/login" && method === "POST") {
      if (rateLimited(request, "customer-login", 20, 15 * 60 * 1000))
        return fail("Muitas tentativas. Aguarde alguns minutos.", 429);
      const data = await bodyOf(request);
      const address = clean(data.email, 254).toLowerCase();
      const key = accountKey(address);
      const { data: customer, etag } = await storage.getWithEtag(key);
      const now = Date.now();
      if (customer?.lockedUntil > now)
        return fail("Acesso temporariamente bloqueado. Tente novamente em 15 minutos.", 429);
      if (!customer || !customerPasswordValid(data.password, customer)) {
        if (customer) {
          const count = customer.failedSince && now - customer.failedSince < 15 * 60 * 1000
            ? (customer.failedLogins || 0) + 1 : 1;
          await storage.set(key, {
            ...customer, failedLogins: count, failedSince: count === 1 ? now : customer.failedSince,
            lockedUntil: count >= 5 ? now + 15 * 60 * 1000 : null,
          }, etag);
        }
        return fail("E-mail ou senha incorretos.", 401);
      }
      if (customer.failedLogins || customer.lockedUntil) {
        customer.failedLogins = 0;
        customer.failedSince = null;
        customer.lockedUntil = null;
        await storage.set(key, customer, etag);
      }
      return startCustomerSession(request, storage, customer, key);
    }
    if (path === "/api/account/logout" && method === "POST") {
      const token = request.headers.get("cookie")?.match(/(?:^|;\s*)sd_customer=([A-Za-z0-9_-]+)/)?.[1];
      if (token?.length === 43) await storage.delete(customerSessionKey(token));
      return message({ ok: true }, 200, {
        "set-cookie": customerCookie(request, "", 0),
      });
    }
    if (path === "/api/account/session" && method === "GET") {
      const customer = await customerSession(request, storage);
      return customer ? message({ customer: publicCustomer(customer) })
        : fail("Entre na sua conta para continuar.", 401);
    }
    if (path === "/api/account/orders" && method === "GET") {
      const customer = await customerSession(request, storage);
      if (!customer) return fail("Entre na sua conta para ver os pedidos.", 401);
      const orders = (await ordersOf(storage))
        .filter((order) => order.customerId === customer.id)
        .map((order) => ({
          id: order.id, number: order.number, createdAt: order.createdAt,
          status: order.status, paymentStatus: order.paymentStatus,
          totalCents: order.subtotalCents +
            (order.fulfillment === "delivery" ? order.deliveryFeeCents || 0 : 0),
          fulfillment: order.fulfillment,
        }));
      return message({ orders });
    }
    if (path === "/api/account/orders/claim" && method === "POST") {
      const customer = await customerSession(request, storage);
      if (!customer) return fail("Entre na sua conta para vincular o pedido.", 401);
      const data = await bodyOf(request);
      const id = clean(data.id, 36);
      if (!/^[a-f0-9-]{36}$/.test(id)) return fail("Pedido inválido.");
      const key = `orders/${id}`;
      const { data: order, etag } = await storage.getWithEtag(key);
      if (!order || !trackingValid(order, data.token))
        return fail("Pedido não encontrado ou link inválido.", 404);
      if (order.customerId && order.customerId !== customer.id)
        return fail("Este pedido já pertence a outra conta.", 409);
      if (!order.customerId) {
        if (!(await storage.set(key, { ...order, customerId: customer.id }, etag)))
          return fail("O pedido mudou. Tente novamente.", 409);
      }
      return message({ id: order.id, number: order.number });
    }
    if (path === "/api/orders/lookup" && method === "POST") {
      if (rateLimited(request, "lookup", 20, 60 * 60 * 1000))
        return fail("Muitas buscas. Tente mais tarde.", 429);
      const data = await bodyOf(request);
      const number = clean(data.number, 40).toUpperCase();
      const phone = clean(data.phone, 30).replace(/\D/g, "");
      if (!/^SD-[0-9A-F-]{6,20}$/.test(number) || phone.length < 10)
        return fail("Confira o número do pedido e o telefone com DDD.");
      const order = (await ordersOf(storage)).find((entry) =>
        !entry.customerId && entry.number === number &&
        entry.customer.phone.replace(/\D/g, "") === phone,
      );
      if (!order) return fail("Pedido não encontrado com esses dados.", 404);
      if (!order.trackingToken) {
        const key = `orders/${order.id}`;
        const { data: fresh, etag } = await storage.getWithEtag(key);
        const next = { ...fresh, trackingToken: newTrackingToken() };
        if (!(await storage.set(key, next, etag)))
          return fail("O pedido foi atualizado. Tente novamente.", 409);
        return message({ id: order.id, number: order.number, token: next.trackingToken });
      }
      return message({ id: order.id, number: order.number, token: order.trackingToken });
    }
    const publicOrderMatch = path.match(/^\/api\/orders\/([a-f0-9-]{36})$/);
    if (publicOrderMatch && method === "GET") {
      const customer = await customerSession(request, storage);
      if (!customer && !url.searchParams.get("token"))
        return fail("Entre na sua conta para acompanhar o pedido.", 401);
      const order = await storage.get(`orders/${publicOrderMatch[1]}`);
      if (!order || !(customer?.id === order.customerId ||
          trackingValid(order, url.searchParams.get("token"))))
        return fail("Pedido não encontrado ou link inválido.", 404);
      return message({ order: publicOrder(order, await settingsOf(storage)) });
    }
    const paymentReportMatch = path.match(/^\/api\/orders\/([a-f0-9-]{36})\/payment-report$/);
    if (paymentReportMatch && method === "POST") {
      if (rateLimited(request, "payment-report", 30, 60 * 60 * 1000))
        return fail("Muitas tentativas. Tente mais tarde.", 429);
      const key = `orders/${paymentReportMatch[1]}`;
      const data = await bodyOf(request);
      const customer = await customerSession(request, storage);
      if (!customer && !data.token)
        return fail("Entre na sua conta para informar o pagamento.", 401);
      const { data: order, etag } = await storage.getWithEtag(key);
      if (!order || !(customer?.id === order.customerId || trackingValid(order, data.token)))
        return fail("Pedido não encontrado ou link inválido.", 404);
      if (order.paymentStatus === "review" || order.paymentStatus === "paid")
        return message({ order: publicOrder(order, await settingsOf(storage)) });
      const settings = await settingsOf(storage);
      if (!publicOrder(order, settings).pix)
        return fail("O Pix ainda não está disponível para este pedido.", 409);
      const now = new Date().toISOString();
      const next = {
        ...order,
        paymentStatus: "review",
        paymentReportedAt: now,
        payerName: clean(data.payerName, 100),
        updatedAt: now,
        history: [...order.history, { at: now, label: "Cliente informou pagamento Pix; aguardando conferência" }],
      };
      if (!(await storage.set(key, next, etag)))
        return fail("O pedido mudou. Atualize a página.", 409);
      return message({ order: publicOrder(next, settings) });
    }
    const cancelOrderMatch = path.match(/^\/api\/orders\/([a-f0-9-]{36})\/cancel$/);
    if (cancelOrderMatch && method === "POST") {
      if (rateLimited(request, "cancel-order", 20, 60 * 60 * 1000))
        return fail("Muitas tentativas. Tente mais tarde.", 429);
      const key = `orders/${cancelOrderMatch[1]}`;
      const data = await bodyOf(request);
      const customer = await customerSession(request, storage);
      if (!customer && !data.token)
        return fail("Entre na sua conta para cancelar o pedido.", 401);
      const { data: order, etag } = await storage.getWithEtag(key);
      if (!order || !(customer?.id === order.customerId || trackingValid(order, data.token)))
        return fail("Pedido não encontrado ou link inválido.", 404);
      const settings = await settingsOf(storage);
      if (order.status === "cancelled")
        return message({ order: publicOrder(order, settings) });
      if (!["new", "confirmed"].includes(order.status))
        return fail("Este pedido já entrou em preparo e não pode ser cancelado pelo site. Fale com a Street Doces.", 409);
      if (order.paymentStatus !== "unpaid")
        return fail("O pagamento deste pedido já foi informado. Fale com a Street Doces para solicitar o cancelamento e tratar o reembolso.", 409);
      const reason = clean(data.reason, 180);
      if (reason.length < 3)
        return fail("Selecione ou informe o motivo do cancelamento.");
      const now = new Date().toISOString();
      const next = {
        ...order,
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: "customer",
        cancellationReason: reason,
        updatedAt: now,
        history: [
          ...order.history,
          { at: now, label: `Pedido cancelado pelo cliente — ${reason}` },
        ],
      };
      if (!(await storage.set(key, next, etag)))
        return fail("O pedido mudou. Atualize a página e tente novamente.", 409);
      return message({ order: publicOrder(next, settings) });
    }
    if (path === "/api/orders" && method === "POST") {
      const customer = await customerSession(request, storage);
      if (!customer) return fail("Entre na sua conta antes de finalizar o pedido.", 401);
      if (rateLimited(request, "order", 12, 60 * 60 * 1000))
        return fail("Muitas solicitações. Tente mais tarde.", 429);
      const settings = await settingsOf(storage);
      if (!settings.acceptsOrders)
        return fail("A loja está pausada para novos pedidos.", 409);
      const data = await bodyOf(request);
      const name = customer.name,
        phone = customer.phone,
        address = clean(data.address, 300),
        notes = clean(data.notes, 500);
      const digits = phone.replace(/\D/g, "");
      const fulfillment = data.fulfillment;
      if (name.length < 2 || digits.length < 10 || digits.length > 13)
        return fail("Informe nome e telefone com DDD.");
      if (
        !["pickup", "delivery"].includes(fulfillment) ||
        (fulfillment === "pickup" && !settings.pickupEnabled) ||
        (fulfillment === "delivery" && !settings.deliveryEnabled)
      )
        return fail("Forma de recebimento indisponível.");
      if (fulfillment === "delivery" && address.length < 12)
        return fail("Informe um endereço de entrega completo.");
      if (
        !Array.isArray(data.items) ||
        data.items.length < 1 ||
        data.items.length > 30
      )
        return fail("Carrinho inválido.");
      const catalog = await catalogOf(storage);
      const costs = await loadCostMap(storage, catalog);
      const seen = new Set();
      const items = data.items.map((item) => {
        if (seen.has(item.id)) throw new Error("Item duplicado no carrinho.");
        seen.add(item.id);
        const product = catalog.find(
          (entry) => entry.id === item.id && entry.active,
        );
        const quantity = integer(item.quantity, 1, 99);
        if (!product || quantity === null)
          throw new Error("Um produto do carrinho não está disponível.");
        if (product.trackStock && quantity > product.stock)
          throw new Error(
            `${product.name} não possui essa quantidade disponível.`,
          );
        return {
          productId: product.id,
          name: product.name,
          image: product.image,
          quantity,
          priceCents: product.priceCents,
          totalCents: product.priceCents * quantity,
          unitCostCents: costs.get(product.id)?.unitCostCents ?? null,
        };
      });
      const subtotalCents = items.reduce(
        (sum, item) => sum + item.totalCents,
        0,
      );
      if (
        data.expectedTotalCents !== undefined &&
        data.expectedTotalCents !== subtotalCents
      )
        return fail(
          "O preço do cardápio mudou. Atualize a página e revise o carrinho.",
          409,
        );
      const id = randomUUID();
      const now = new Date().toISOString();
      const order = {
        id,
        number: `SD-${now.slice(2, 10).replaceAll("-", "")}-${id.slice(0, 4).toUpperCase()}`,
        createdAt: now,
        updatedAt: now,
        status: "new",
        paymentStatus: "unpaid",
        customerId: customer.id,
        pixKey: settings.pixKey,
        pixTxid: id.replaceAll("-", "").slice(0, 25).toUpperCase(),
        customer: { name, phone, email: customer.email },
        fulfillment,
        address: fulfillment === "delivery" ? address : "",
        notes,
        items,
        subtotalCents,
        deliveryFeeCents: null,
        deliveryCostCents: null,
        deliveryPartner: "",
        adminNotes: "",
        history: [{ at: now, label: "Pedido recebido" }],
      };
      await storage.set(`orders/${id}`, order, null);
      return message(
        {
          id,
          number: order.number,
          status: order.status,
          subtotalCents: order.subtotalCents,
        },
        201,
      );
    }

    if (path === "/api/admin/login" && method === "POST") {
      if (!configured())
        return fail("Acesso administrativo não configurado no servidor.", 503);
      const data = await bodyOf(request);
      if (
        clean(data.email, 150).toLowerCase() !== email() ||
        !passwordValid(data.password)
      ) {
        if (rateLimited(request, "login", 10, 15 * 60 * 1000))
          return fail("Muitas tentativas. Aguarde alguns minutos.", 429);
        return fail("E-mail ou senha incorretos.", 401);
      }
      const secure =
        new URL(request.url).protocol === "https:" ? "; Secure" : "";
      return message({ email: email() }, 200, {
        "set-cookie": `sd_admin=${sessionToken()}; HttpOnly; Path=/api; SameSite=Strict; Max-Age=28800${secure}`,
      });
    }
    if (!path.startsWith("/api/admin/"))
      return fail("Rota não encontrada.", 404);
    if (!sessionValid(request))
      return fail("Sessão expirada. Entre novamente.", 401);
    if (path === "/api/admin/session" && method === "GET")
      return message({ email: email() });
    if (path === "/api/admin/logout" && method === "POST")
      return message({ ok: true }, 200, {
        "set-cookie":
          "sd_admin=; HttpOnly; Path=/api; SameSite=Strict; Max-Age=0",
      });
    if (path === "/api/admin/dashboard" && method === "GET") {
      const [orders, products, settings] = await Promise.all([
        ordersOf(storage),
        catalogOf(storage),
        settingsOf(storage),
      ]);
      return message({ orders, products, settings });
    }
    if (path.startsWith("/api/admin/business"))
      return await handleBusinessApi(request, storage, path,
        () => catalogOf(storage), () => ordersOf(storage));
    if (path === "/api/admin/media" && method === "POST") {
      const form = await request.formData();
      const file = form.get("image");
      if (
        !file ||
        typeof file.arrayBuffer !== "function" ||
        file.size > 3 * 1024 * 1024 ||
        file.size < 16
      )
        return fail("Envie uma imagem JPG, PNG ou WebP de até 3 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const isJpeg =
        bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPng = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isWebp =
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
      const mime = isJpeg
        ? "image/jpeg"
        : isPng
          ? "image/png"
          : isWebp
            ? "image/webp"
            : "";
      if (!mime)
        return fail("Formato de imagem não permitido. Use JPG, PNG ou WebP.");
      const id = randomUUID();
      await storage.set(
        `media/${id}`,
        {
          mime,
          base64: bytes.toString("base64"),
          createdAt: new Date().toISOString(),
        },
        null,
      );
      return message({ url: `/api/media/${id}` }, 201);
    }
    const orderMatch = path.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})$/);
    if (orderMatch && method === "PATCH") {
      const key = `orders/${orderMatch[1]}`;
      const { data: order, etag } = await storage.getWithEtag(key);
      if (!order) return fail("Pedido não encontrado.", 404);
      const data = await bodyOf(request);
      if (data.expectedUpdatedAt && data.expectedUpdatedAt !== order.updatedAt)
        return fail("Esse pedido mudou. Atualize antes de salvar.", 409);
      const status = data.status ?? order.status,
        paymentStatus = data.paymentStatus ?? order.paymentStatus;
      if (!statuses.includes(status) || !payments.includes(paymentStatus))
        return fail("Status inválido.");
      const feeInput =
        data.deliveryFeeCents === undefined
          ? order.deliveryFeeCents
          : data.deliveryFeeCents;
      const deliveryFeeCents =
        feeInput === null || feeInput === ""
          ? null
          : integer(feeInput, 0, 1000000);
      if (
        deliveryFeeCents === null &&
        data.deliveryFeeCents !== null &&
        data.deliveryFeeCents !== "" &&
        data.deliveryFeeCents !== undefined
      )
        return fail("Frete inválido.");
      const costInput = data.deliveryCostCents === undefined
        ? order.deliveryCostCents ?? null : data.deliveryCostCents;
      const deliveryCostCents = costInput === null || costInput === ""
        ? null : integer(costInput, 0, 1000000);
      if ((costInput !== null && costInput !== "" && deliveryCostCents === null) ||
          (order.fulfillment !== "delivery" && deliveryCostCents !== null))
        return fail("Custo da entrega inválido.");
      if (["review", "paid", "refunded"].includes(order.paymentStatus) &&
          data.deliveryFeeCents !== undefined && deliveryFeeCents !== order.deliveryFeeCents)
        return fail("O frete não pode mudar após o pagamento informado.", 409);
      const next = {
        ...order,
        status,
        paymentStatus,
        deliveryPartner: clean(
          data.deliveryPartner ?? order.deliveryPartner,
          80,
        ),
        deliveryFeeCents,
        deliveryCostCents,
        paidAt: paymentStatus === "paid" && order.paymentStatus !== "paid"
          ? new Date().toISOString() : order.paidAt,
        adminNotes: clean(data.adminNotes ?? order.adminNotes, 1000),
        updatedAt: new Date().toISOString(),
      };
      if (status !== order.status)
        next.history = [
          ...order.history,
          { at: next.updatedAt, label: `Status: ${status}` },
        ];
      if (paymentStatus !== order.paymentStatus)
        next.history = [
          ...next.history,
          { at: next.updatedAt, label: `Pagamento: ${paymentStatus}` },
        ];
      if (!(await storage.set(key, next, etag)))
        return fail(
          "Esse pedido foi alterado em outra sessão. Atualize os dados.",
          409,
        );
      return message({ order: next });
    }
    if (path === "/api/admin/products" && method === "POST") {
      const data = await bodyOf(request);
      const id = randomUUID();
      const product = normalizeProduct(data, id);
      await updateCatalog(storage, (products) => [...products, product]);
      return message({ product }, 201);
    }
    const productMatch = path.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/);
    if (productMatch && method === "PUT") {
      const data = await bodyOf(request);
      let product;
      await updateCatalog(storage, (products) => {
        const old = products.find((entry) => entry.id === productMatch[1]);
        if (!old) throw new Error("Produto não encontrado.");
        product = normalizeProduct(data, old.id, old);
        return products.map((entry) => (entry.id === old.id ? product : entry));
      });
      return message({ product });
    }
    const inventoryMatch = path.match(
      /^\/api\/admin\/inventory\/([a-z0-9-]+)$/,
    );
    if (inventoryMatch && method === "PATCH") {
      const data = await bodyOf(request);
      const stock = integer(data.stock, 0, 100000),
        lowStockThreshold = integer(data.lowStockThreshold, 0, 100000);
      if (stock === null || lowStockThreshold === null)
        return fail("Quantidade inválida.");
      await updateCatalog(storage, (products) => {
        if (!products.some((product) => product.id === inventoryMatch[1]))
          throw new Error("Produto não encontrado.");
        return products.map((product) =>
          product.id === inventoryMatch[1]
            ? {
                ...product,
                stock,
                lowStockThreshold,
                trackStock: data.trackStock === true,
                updatedAt: new Date().toISOString(),
              }
            : product,
        );
      });
      return message({ ok: true });
    }
    if (path === "/api/admin/settings" && method === "PUT") {
      const data = await bodyOf(request);
      const settings = {
        storeName: clean(data.storeName, 80),
        tagline: clean(data.tagline, 180),
        instagramUrl: clean(data.instagramUrl, 250),
        whatsapp: clean(data.whatsapp, 30).replace(/\D/g, ""),
        pixKey: clean(data.pixKey, 77),
        pickupAddress: clean(data.pickupAddress, 250),
        announcement: clean(data.announcement, 120),
        acceptsOrders: data.acceptsOrders === true,
        pickupEnabled: data.pickupEnabled === true,
        deliveryEnabled: data.deliveryEnabled === true,
        deliveryNotice: clean(data.deliveryNotice, 300),
      };
      if (
        !settings.storeName ||
        !settings.pickupAddress ||
        !/^https:\/\//.test(settings.instagramUrl) ||
        (settings.whatsapp && settings.whatsapp.length !== 13)
      )
        return fail("Confira nome, endereço, Instagram e WhatsApp.");
      if (!/^\S+@\S+\.\S+$/.test(settings.pixKey))
        return fail("Informe uma chave Pix de e-mail válida.");
      if (
        settings.acceptsOrders &&
        !settings.pickupEnabled &&
        !settings.deliveryEnabled
      )
        return fail("Ative retirada ou entrega para receber pedidos.");
      const { etag } = await storage.getWithEtag("settings");
      if (!(await storage.set("settings", settings, etag)))
        return fail("Configurações alteradas em outra sessão. Atualize.", 409);
      return message({ settings });
    }
    return fail("Rota não encontrada.", 404);
  } catch (error) {
    if (error instanceof BusinessError) return fail(error.message, error.status);
    if (error instanceof SyntaxError) return fail("JSON inválido.");
    if (error.message?.includes("Chave inválida"))
      return fail("Dados inválidos.");
    if (
      /^(Confira|Use |Cor inválida|O catálogo|Um produto|Item duplicado|Produto não encontrado)/.test(
        error.message || "",
      )
    )
      return fail(error.message, 400);
    console.error("Street Doces API:", error);
    return fail("Não foi possível concluir a operação agora.", 500);
  }
}
