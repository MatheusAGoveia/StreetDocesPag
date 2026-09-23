import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { handleApi } from "../server/api.mjs";

process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD_HASH = `test-salt:${scryptSync("a-long-test-password", "test-salt", 64).toString("hex")}`;
process.env.SESSION_SECRET =
  "a-long-test-session-secret-with-more-than-32-characters";

function memoryStorage() {
  const records = new Map();
  const getWithEtag = async (key) => {
    const entry = records.get(key);
    return { data: entry?.data ?? null, etag: entry?.etag ?? null };
  };
  return {
    get: async (key) => records.get(key)?.data ?? null,
    getWithEtag,
    async set(key, data, expectedEtag) {
      const current = await getWithEtag(key);
      if (expectedEtag !== undefined && current.etag !== expectedEtag)
        return false;
      records.set(key, { data, etag: String((Number(current.etag) || 0) + 1) });
      return true;
    },
    list: async (prefix) =>
      [...records.keys()].filter((key) => key.startsWith(prefix)),
    delete: async (key) => records.delete(key),
  };
}
async function call(storage, path, method = "GET", body, cookie = "") {
  const response = await handleApi(
    new Request(`http://localhost:5173/api/${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    storage,
  );
  return { response, data: await response.json() };
}
async function register(storage, email = "cliente@test.local", name = "Cliente Teste", phone = "31999999999") {
  const result = await call(storage, "account/register", "POST", {
    name, email, phone, password: "uma-senha-forte-de-teste",
  });
  assert.equal(result.response.status, 200);
  return result.response.headers.get("set-cookie").split(";")[0];
}

test("conta exige senha, mantém sessão entre dispositivos e encerra o acesso ao sair", async () => {
  const storage = memoryStorage();
  const cookie = await register(storage, "minha-conta@test.local");
  const duplicate = await call(storage, "account/register", "POST", {
    name: "Cliente Teste", email: "MINHA-CONTA@test.local", phone: "31999999999",
    password: "outra-senha-de-teste-forte",
  });
  assert.equal(duplicate.response.status, 409);
  const session = await call(storage, "account/session", "GET", undefined, cookie);
  assert.equal(session.data.customer.email, "minha-conta@test.local");
  assert.equal("passwordHash" in session.data.customer, false);
  const wrong = await call(storage, "account/login", "POST", {
    email: "minha-conta@test.local", password: "senha-errada",
  });
  assert.equal(wrong.response.status, 401);
  const login = await call(storage, "account/login", "POST", {
    email: "minha-conta@test.local", password: "uma-senha-forte-de-teste",
  });
  assert.equal(login.response.status, 200);
  const secondCookie = login.response.headers.get("set-cookie").split(";")[0];
  assert.notEqual(secondCookie, cookie);
  assert.equal((await call(storage, "account/session", "GET", undefined, secondCookie)).response.status, 200);
  assert.equal((await call(storage, "account/logout", "POST", {}, cookie)).response.status, 200);
  assert.equal((await call(storage, "account/session", "GET", undefined, cookie)).response.status, 401);
  assert.equal((await call(storage, "account/session", "GET", undefined, secondCookie)).response.status, 200);
});

test("pedido usa preços do servidor e aparece somente no painel autenticado", async () => {
  const storage = memoryStorage();
  const publicCatalog = await call(storage, "storefront");
  assert.equal(publicCatalog.response.status, 200);
  assert.equal(publicCatalog.data.products.length, 5);

  const denied = await call(storage, "admin/dashboard");
  assert.equal(denied.response.status, 401);
  const badLogin = await call(storage, "admin/login", "POST", {
    email: "admin@test.local",
    password: "wrong",
  });
  assert.equal(badLogin.response.status, 401);
  const login = await call(storage, "admin/login", "POST", {
    email: "admin@test.local",
    password: "a-long-test-password",
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get("set-cookie").split(";")[0];

  const guestOrder = await call(storage, "orders", "POST", {
    fulfillment: "pickup", items: [{ id: "miss-sensacao", quantity: 1 }],
  });
  assert.equal(guestOrder.response.status, 401);
  const customerCookie = await register(storage);

  const stalePrice = await call(storage, "orders", "POST", {
    name: "Cliente Teste",
    phone: "31999999999",
    fulfillment: "pickup",
    items: [{ id: "miss-sensacao", quantity: 2 }],
    expectedTotalCents: 1,
  }, customerCookie);
  assert.equal(stalePrice.response.status, 409);

  const order = await call(storage, "orders", "POST", {
    name: "Cliente Teste",
    phone: "31999999999",
    fulfillment: "pickup",
    items: [{ id: "miss-sensacao", quantity: 2, priceCents: 1 }],
  }, customerCookie);
  assert.equal(order.response.status, 201);
  assert.equal(order.data.token, undefined);
  assert.equal(order.data.subtotalCents, 2000);
  const secondLogin = await call(storage, "account/login", "POST", {
    email: "cliente@test.local", password: "uma-senha-forte-de-teste",
  });
  const secondDevice = secondLogin.response.headers.get("set-cookie").split(";")[0];
  const myOrders = await call(storage, "account/orders", "GET", undefined, secondDevice);
  assert.equal(myOrders.data.orders[0].number, order.data.number);
  const dashboard = await call(
    storage,
    "admin/dashboard",
    "GET",
    undefined,
    cookie,
  );
  assert.equal(dashboard.data.orders.length, 1);
  assert.equal(dashboard.data.orders[0].number, order.data.number);
  assert.equal(dashboard.data.orders[0].paymentStatus, "unpaid");
  assert.equal(dashboard.data.orders[0].customer.email, "cliente@test.local");
  assert.equal(dashboard.data.orders[0].customerId,
    (await call(storage, "account/session", "GET", undefined, customerCookie)).data.customer.id);

  const updated = await call(
    storage,
    `admin/orders/${order.data.id}`,
    "PATCH",
    { status: "confirmed", adminNotes: "Separar para retirada" },
    cookie,
  );
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.order.status, "confirmed");
  assert.equal(updated.data.order.deliveryFeeCents, null);
  assert.equal(updated.data.order.history.length, 2);
});

test("edição do produto e pausa de pedidos afetam a loja", async () => {
  const storage = memoryStorage();
  const login = await call(storage, "admin/login", "POST", {
    email: "admin@test.local",
    password: "a-long-test-password",
  });
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  const dashboard = await call(
    storage,
    "admin/dashboard",
    "GET",
    undefined,
    cookie,
  );
  const product = dashboard.data.products[0];
  const edit = await call(
    storage,
    `admin/products/${product.id}`,
    "PUT",
    { ...product, priceCents: 1250 },
    cookie,
  );
  assert.equal(edit.response.status, 200);
  const afterEdit = await call(storage, "storefront");
  assert.equal(afterEdit.data.products[0].priceCents, 1250);

  const settings = { ...dashboard.data.settings, acceptsOrders: false };
  const saved = await call(storage, "admin/settings", "PUT", settings, cookie);
  assert.equal(saved.response.status, 200);
  const customerCookie = await register(storage);
  const order = await call(storage, "orders", "POST", {
    name: "Cliente Teste",
    phone: "31999999999",
    fulfillment: "pickup",
    items: [{ id: product.id, quantity: 1 }],
  }, customerCookie);
  assert.equal(order.response.status, 409);
});

test("upload de imagem exige sessão e serve apenas formatos permitidos", async () => {
  const storage = memoryStorage();
  const form = new FormData();
  form.append(
    "image",
    new File(
      [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0])],
      "doce.png",
      { type: "image/png" },
    ),
  );
  const denied = await handleApi(
    new Request("http://localhost:5173/api/admin/media", {
      method: "POST",
      body: form,
    }),
    storage,
  );
  assert.equal(denied.status, 401);
  const login = await call(storage, "admin/login", "POST", {
    email: "admin@test.local",
    password: "a-long-test-password",
  });
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  const uploaded = await handleApi(
    new Request("http://localhost:5173/api/admin/media", {
      method: "POST",
      body: form,
      headers: { cookie },
    }),
    storage,
  );
  assert.equal(uploaded.status, 201);
  const { url } = await uploaded.json();
  const image = await handleApi(
    new Request(`http://localhost:5173${url}`),
    storage,
  );
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal((await image.arrayBuffer()).byteLength, 16);
});

test("cliente acompanha pedido, paga Pix pelo valor final e equipe confere o crédito", async () => {
  const storage = memoryStorage();
  const customerCookie = await register(storage, "comprador@test.local", "Cliente de Teste", "31999998888");
  const login = await call(storage, "admin/login", "POST", {
    email: "admin@test.local", password: "a-long-test-password",
  });
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  const created = await call(storage, "orders", "POST", {
    name: "Cliente de Teste", phone: "31999998888", fulfillment: "delivery",
    address: "Rua de Teste, 123, Betim MG", items: [{ id: "miss-sensacao", quantity: 2 }],
  }, customerCookie);
  assert.equal(created.response.status, 201);
  assert.equal(created.data.token, undefined);
  const endpoint = `orders/${created.data.id}`;
  assert.equal((await call(storage, endpoint)).response.status, 401);
  const anotherCookie = await register(storage, "outro@test.local", "Outro Cliente", "31977777777");
  assert.equal((await call(storage, endpoint, "GET", undefined, anotherCookie)).response.status, 404);
  const initial = await call(storage, endpoint, "GET", undefined, customerCookie);
  assert.equal(initial.data.order.status, "new");
  assert.equal(initial.data.order.pix, null);
  assert.equal("adminNotes" in initial.data.order, false);
  assert.equal("customer" in initial.data.order, false);
  assert.equal((await call(storage, `${endpoint}/payment-report`, "POST", {}, anotherCookie)).response.status, 404);
  assert.equal((await call(storage, `${endpoint}/payment-report`, "POST", {}, customerCookie)).response.status, 409);

  const confirmed = await call(storage, `admin/orders/${created.data.id}`, "PATCH", { status: "confirmed" }, cookie);
  assert.equal(confirmed.response.status, 200);
  assert.equal((await call(storage, endpoint, "GET", undefined, customerCookie)).data.order.pix, null);
  const quoted = await call(storage, `admin/orders/${created.data.id}`, "PATCH", {
    status: "confirmed", deliveryFeeCents: 850, deliveryPartner: "Uber",
  }, cookie);
  assert.equal(quoted.response.status, 200);
  const payable = await call(storage, endpoint, "GET", undefined, customerCookie);
  assert.equal(payable.data.order.totalCents, 2850);
  assert.equal(payable.data.order.pix.amountCents, 2850);
  assert.ok(payable.data.order.pix.payload.includes("540528.50"));
  assert.ok(payable.data.order.pix.payload.includes("matheusaagd2@gmail.com"));
  const report = await call(storage, `${endpoint}/payment-report`, "POST", {
    payerName: "Pagador Teste",
  }, customerCookie);
  assert.equal(report.response.status, 200);
  assert.equal(report.data.order.paymentStatus, "review");
  assert.equal(report.data.order.pix, null);
  const stale = await call(storage, `admin/orders/${created.data.id}`, "PATCH", {
    expectedUpdatedAt: quoted.data.order.updatedAt, paymentStatus: "paid",
  }, cookie);
  assert.equal(stale.response.status, 409);
  const feeChange = await call(storage, `admin/orders/${created.data.id}`, "PATCH", {
    deliveryFeeCents: 900,
  }, cookie);
  assert.equal(feeChange.response.status, 409);
  const dashboard = await call(storage, "admin/dashboard", "GET", undefined, cookie);
  assert.equal(dashboard.data.orders[0].payerName, "Pagador Teste");
  const paid = await call(storage, `admin/orders/${created.data.id}`, "PATCH", { paymentStatus: "paid" }, cookie);
  assert.equal(paid.response.status, 200);
  assert.equal((await call(storage, endpoint, "GET", undefined, customerCookie)).data.order.paymentStatus, "paid");

  const cancelCandidate = await call(storage, "orders", "POST", {
    fulfillment: "pickup", items: [{ id: "miss-sensacao", quantity: 1 }],
  }, customerCookie);
  assert.equal(cancelCandidate.response.status, 201);
  const cancelEndpoint = `orders/${cancelCandidate.data.id}`;
  const cancellable = await call(storage, cancelEndpoint, "GET", undefined, customerCookie);
  assert.equal(cancellable.data.order.canCancel, true);
  assert.equal((await call(storage, `${cancelEndpoint}/cancel`, "POST", { reason: "" }, customerCookie)).response.status, 400);
  assert.equal((await call(storage, `${cancelEndpoint}/cancel`, "POST", { reason: "Mudei de ideia" }, anotherCookie)).response.status, 404);
  const cancelled = await call(storage, `${cancelEndpoint}/cancel`, "POST", {
    reason: "Escolhi itens ou quantidades erradas",
  }, customerCookie);
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.data.order.status, "cancelled");
  assert.equal(cancelled.data.order.canCancel, false);
  assert.equal(cancelled.data.order.cancellationReason, "Escolhi itens ou quantidades erradas");
  assert.match(cancelled.data.order.history.at(-1).label, /cancelado pelo cliente/);
  const repeated = await call(storage, `${cancelEndpoint}/cancel`, "POST", {
    reason: "Mudei de ideia",
  }, customerCookie);
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.data.order.history.length, cancelled.data.order.history.length);

  const preparing = await call(storage, "orders", "POST", {
    fulfillment: "pickup", items: [{ id: "miss-sensacao", quantity: 1 }],
  }, customerCookie);
  await call(storage, `admin/orders/${preparing.data.id}`, "PATCH", { status: "preparing" }, cookie);
  const deniedPreparing = await call(storage, `orders/${preparing.data.id}/cancel`, "POST", {
    reason: "Mudei de ideia",
  }, customerCookie);
  assert.equal(deniedPreparing.response.status, 409);

  const paidNotice = await call(storage, "orders", "POST", {
    fulfillment: "pickup", items: [{ id: "lil-palha", quantity: 1 }],
  }, customerCookie);
  await call(storage, `admin/orders/${paidNotice.data.id}`, "PATCH", { status: "confirmed" }, cookie);
  await call(storage, `orders/${paidNotice.data.id}/payment-report`, "POST", {}, customerCookie);
  const deniedPayment = await call(storage, `orders/${paidNotice.data.id}/cancel`, "POST", {
    reason: "Mudei de ideia",
  }, customerCookie);
  assert.equal(deniedPayment.response.status, 409);
});

test("pedido anterior pode ser recuperado e vinculado à conta", async () => {
  const storage = memoryStorage();
  const originalCookie = await register(storage, "original@test.local", "Cliente Antigo", "31987654321");
  const created = await call(storage, "orders", "POST", {
    name: "Cliente Antigo", phone: "31987654321", fulfillment: "pickup",
    items: [{ id: "lil-palha", quantity: 1 }],
  }, originalCookie);
  const key = `orders/${created.data.id}`;
  const { data: old, etag } = await storage.getWithEtag(key);
  delete old.customerId;
  old.trackingToken = randomBytes(24).toString("base64url");
  await storage.set(key, old, etag);
  const wrong = await call(storage, "orders/lookup", "POST", { number: created.data.number, phone: "31999999999" });
  assert.equal(wrong.response.status, 404);
  const found = await call(storage, "orders/lookup", "POST", { number: created.data.number, phone: "31987654321" });
  assert.equal(found.response.status, 200);
  assert.ok(found.data.token);
  const tracked = await call(storage, `orders/${created.data.id}?token=${found.data.token}`);
  assert.equal(tracked.data.order.number, created.data.number);
  const newCookie = await register(storage, "novo@test.local", "Cliente Novo", "31911111111");
  const claim = await call(storage, "account/orders/claim", "POST", { id: created.data.id, token: found.data.token }, newCookie);
  assert.equal(claim.response.status, 200);
  const linked = await call(storage, "account/orders", "GET", undefined, newCookie);
  assert.equal(linked.data.orders[0].number, created.data.number);
  assert.equal((await call(storage, "orders/lookup", "POST", { number: created.data.number, phone: "31987654321" })).response.status, 404);
  assert.equal((await call(storage, `orders/${created.data.id}`, "GET", undefined, newCookie)).response.status, 200);
  assert.equal((await call(storage, `orders/${created.data.id}`, "GET", undefined, originalCookie)).response.status, 404);
});
