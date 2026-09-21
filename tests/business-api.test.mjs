import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { handleApi } from "../server/api.mjs";
import { financialSummary } from "../server/business.mjs";
import { createPostgresStorage } from "../server/postgres-storage.mjs";

process.env.ADMIN_EMAIL = "finance@test.local";
process.env.ADMIN_PASSWORD_HASH = `finance-salt:${scryptSync("a-long-finance-password", "finance-salt", 64).toString("hex")}`;
process.env.SESSION_SECRET = "finance-test-session-secret-longer-than-32-characters";

async function withStore(run) {
  const db = new PGlite();
  const storage = createPostgresStorage(async (sql, params) => (await db.query(sql, params)).rows);
  async function call(path, method = "GET", body, cookie = "") {
    const response = await handleApi(new Request(`http://localhost:5173/api/${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), storage);
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  try { await run(call); } finally { await db.close(); }
}

async function adminCookie(call) {
  const login = await call("admin/login", "POST", {
    email: "finance@test.local", password: "a-long-finance-password",
  });
  assert.equal(login.status, 200);
  return login.cookie;
}

async function customerCookie(call) {
  const created = await call("account/register", "POST", {
    name: "Cliente Teste", email: `finance-${Math.random()}@test.local`,
    phone: "31999999999", password: "senha-de-cliente-com-mais-de-doze",
  });
  assert.equal(created.status, 200);
  return created.cookie;
}

test("compras, ficha técnica e despesas apuram lucro sem contar compras duas vezes", async () => {
  await withStore(async (call) => {
    assert.equal((await call("admin/business")).status, 401);
    const admin = await adminCookie(call);
    const supplier = await call("admin/business/suppliers", "POST", {
      name: "Distribuidora Betim", contact: "31999999999", active: true,
    }, admin);
    assert.equal(supplier.status, 201);
    const material = await call("admin/business/materials", "POST", {
      name: "Chocolate", unit: "g", active: true,
    }, admin);
    assert.equal(material.status, 201);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const purchase = await call("admin/business/purchases", "POST", {
      supplierId: supplier.data.supplier.id, materialId: material.data.material.id,
      quantityMilli: 1_000_000, totalCents: 2000, purchasedAt: date,
      reference: "NF 123",
    }, admin);
    assert.equal(purchase.status, 201);
    const costing = await call("admin/business/costings/miss-sensacao", "PUT", {
      mode: "recipe", extraCostCents: 50,
      ingredients: [{ materialId: material.data.material.id, quantityMilli: 100_000 }],
    }, admin);
    assert.equal(costing.status, 200);
    const expense = await call("admin/business/expenses", "POST", {
      description: "Conta de luz", category: "energia", amountCents: 300,
      spentAt: date,
    }, admin);
    assert.equal(expense.status, 201);
    const customer = await customerCookie(call);
    const created = await call("orders", "POST", {
      fulfillment: "pickup", items: [{ id: "miss-sensacao", quantity: 2 }],
    }, customer);
    assert.equal(created.status, 201);
    const id = created.data.id;
    const dashboard = await call("admin/dashboard", "GET", undefined, admin);
    const order = dashboard.data.orders.find((entry) => entry.id === id);
    assert.equal(order.items[0].unitCostCents, 250);
    const paid = await call(`admin/orders/${id}`, "PATCH", {
      expectedUpdatedAt: order.updatedAt, status: "confirmed", paymentStatus: "paid",
    }, admin);
    assert.equal(paid.status, 200);
    const publicOrder = await call(`orders/${id}`, "GET", undefined, customer);
    assert.equal(publicOrder.status, 200);
    assert.equal("unitCostCents" in publicOrder.data.order.items[0], false);
    const view = await call(`admin/business?from=${date}&to=${date}`, "GET", undefined, admin);
    assert.equal(view.status, 200);
    assert.equal(view.data.summary.revenueCents, 2000);
    assert.equal(view.data.summary.cogsCents, 500);
    assert.equal(view.data.summary.expenseCents, 300);
    assert.equal(view.data.summary.purchaseCents, 2000);
    assert.equal(view.data.summary.profitCents, 1200);
    assert.equal(view.data.summary.cashAfterOutflowsCents, -300);
    assert.equal(view.data.materialTotals[0].purchasedQuantityMilli, 1_000_000);
    assert.equal(view.data.productCosts.find((entry) => entry.productId === "miss-sensacao").marginPercent, 75);
    const voided = await call(`admin/business/purchases/${purchase.data.purchase.id}/void`, "PATCH", {
      reason: "Nota duplicada",
    }, admin);
    assert.equal(voided.status, 200);
    const afterVoid = await call(`admin/business?from=${date}&to=${date}`, "GET", undefined, admin);
    assert.equal(afterVoid.data.summary.purchaseCents, 0);
    assert.equal(afterVoid.data.summary.cogsCents, 500);
    assert.equal(afterVoid.data.summary.cashAfterOutflowsCents, 1700);
    assert.equal(afterVoid.data.productCosts.find((entry) => entry.productId === "miss-sensacao").unitCostCents, null);
    const stale = await call(`admin/business/suppliers/${supplier.data.supplier.id}`, "PUT", {
      name: "Novo nome", expectedUpdatedAt: "antigo",
    }, admin);
    assert.equal(stale.status, 409);
  });
});

test("distribuição exige custo real para fechar resultado de entrega paga", async () => {
  await withStore(async (call) => {
    const admin = await adminCookie(call);
    const customer = await customerCookie(call);
    await call("admin/business/costings/miss-sensacao", "PUT", {
      mode: "manual", manualCostCents: 400,
    }, admin);
    const created = await call("orders", "POST", {
      fulfillment: "delivery", address: "Rua Exemplo, 123, Betim, MG",
      items: [{ id: "miss-sensacao", quantity: 1 }],
    }, customer);
    assert.equal(created.status, 201);
    const id = created.data.id;
    const dashboard = await call("admin/dashboard", "GET", undefined, admin);
    const order = dashboard.data.orders.find((entry) => entry.id === id);
    const paid = await call(`admin/orders/${id}`, "PATCH", {
      expectedUpdatedAt: order.updatedAt, status: "confirmed", paymentStatus: "paid",
      deliveryFeeCents: 500, deliveryPartner: "Uber",
    }, admin);
    assert.equal(paid.status, 200);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const incomplete = await call(`admin/business?from=${date}&to=${date}`, "GET", undefined, admin);
    assert.equal(incomplete.data.summary.profitCents, null);
    assert.equal(incomplete.data.summary.missingDeliveryCostOrders, 1);
    const updated = await call(`admin/orders/${id}`, "PATCH", {
      expectedUpdatedAt: paid.data.order.updatedAt, deliveryCostCents: 300,
    }, admin);
    assert.equal(updated.status, 200);
    const complete = await call(`admin/business?from=${date}&to=${date}`, "GET", undefined, admin);
    assert.equal(complete.data.summary.profitCents, 800);
    assert.equal(complete.data.distributions[0].deliveryPartner, "Uber");
    assert.equal(complete.data.distributions[0].deliveryCostCents, 300);
  });
});

test("resultado considera a data do pagamento em Betim", () => {
  const order = {
    paymentStatus: "paid", status: "confirmed", fulfillment: "pickup",
    createdAt: "2026-09-21T01:00:00.000Z", paidAt: "2026-09-21T02:00:00.000Z",
    subtotalCents: 1000, items: [{ productId: "doce", quantity: 1, totalCents: 1000, unitCostCents: 400 }],
  };
  const summary = financialSummary([order], [], [], [], new Map(), "2026-09-20", "2026-09-20");
  assert.equal(summary.paidOrderCount, 1);
  assert.equal(summary.profitCents, 600);
});
