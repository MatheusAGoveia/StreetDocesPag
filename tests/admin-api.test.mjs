import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
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

  const stalePrice = await call(storage, "orders", "POST", {
    name: "Cliente Teste",
    phone: "31999999999",
    fulfillment: "pickup",
    items: [{ id: "miss-sensacao", quantity: 2 }],
    expectedTotalCents: 1,
  });
  assert.equal(stalePrice.response.status, 409);

  const order = await call(storage, "orders", "POST", {
    name: "Cliente Teste",
    phone: "31999999999",
    fulfillment: "pickup",
    items: [{ id: "miss-sensacao", quantity: 2, priceCents: 1 }],
  });
  assert.equal(order.response.status, 201);
  assert.equal(order.data.subtotalCents, 2000);
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
  const order = await call(storage, "orders", "POST", {
    name: "Cliente Teste",
    phone: "31999999999",
    fulfillment: "pickup",
    items: [{ id: product.id, quantity: 1 }],
  });
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
  const login = await call(storage, "admin/login", "POST", {
    email: "admin@test.local", password: "a-long-test-password",
  });
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  const created = await call(storage, "orders", "POST", {
    name: "Cliente de Teste", phone: "31999998888", fulfillment: "delivery",
    address: "Rua de Teste, 123, Betim MG", items: [{ id: "miss-sensacao", quantity: 2 }],
  });
  assert.equal(created.response.status, 201);
  assert.ok(created.data.token.length >= 32);
  const endpoint = `orders/${created.data.id}`;
  assert.equal((await call(storage, endpoint)).response.status, 404);
  assert.equal((await call(storage, `${endpoint}?token=wrong`)).response.status, 404);
  const initial = await call(storage, `${endpoint}?token=${created.data.token}`);
  assert.equal(initial.data.order.status, "new");
  assert.equal(initial.data.order.pix, null);
  assert.equal("adminNotes" in initial.data.order, false);
  assert.equal("customer" in initial.data.order, false);
  assert.equal((await call(storage, `${endpoint}/payment-report`, "POST", { token: created.data.token })).response.status, 409);

  const confirmed = await call(storage, `admin/orders/${created.data.id}`, "PATCH", { status: "confirmed" }, cookie);
  assert.equal(confirmed.response.status, 200);
  assert.equal((await call(storage, `${endpoint}?token=${created.data.token}`)).data.order.pix, null);
  const quoted = await call(storage, `admin/orders/${created.data.id}`, "PATCH", {
    status: "confirmed", deliveryFeeCents: 850, deliveryPartner: "Uber",
  }, cookie);
  assert.equal(quoted.response.status, 200);
  const payable = await call(storage, `${endpoint}?token=${created.data.token}`);
  assert.equal(payable.data.order.totalCents, 2850);
  assert.equal(payable.data.order.pix.amountCents, 2850);
  assert.ok(payable.data.order.pix.payload.includes("540528.50"));
  assert.ok(payable.data.order.pix.payload.includes("matheusaagd2@gmail.com"));
  const report = await call(storage, `${endpoint}/payment-report`, "POST", {
    token: created.data.token, payerName: "Pagador Teste",
  });
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
  assert.equal((await call(storage, `${endpoint}?token=${created.data.token}`)).data.order.paymentStatus, "paid");
});

test("pedido anterior pode ser recuperado com número e telefone", async () => {
  const storage = memoryStorage();
  const created = await call(storage, "orders", "POST", {
    name: "Cliente Antigo", phone: "31987654321", fulfillment: "pickup",
    items: [{ id: "lil-palha", quantity: 1 }],
  });
  const key = `orders/${created.data.id}`;
  const { data: old, etag } = await storage.getWithEtag(key);
  delete old.trackingToken;
  await storage.set(key, old, etag);
  const wrong = await call(storage, "orders/lookup", "POST", { number: created.data.number, phone: "31999999999" });
  assert.equal(wrong.response.status, 404);
  const found = await call(storage, "orders/lookup", "POST", { number: created.data.number, phone: "31987654321" });
  assert.equal(found.response.status, 200);
  assert.ok(found.data.token);
  const tracked = await call(storage, `orders/${created.data.id}?token=${found.data.token}`);
  assert.equal(tracked.data.order.number, created.data.number);
});
