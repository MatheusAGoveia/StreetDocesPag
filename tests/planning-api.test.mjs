import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { handleApi } from "../server/api.mjs";
import { createPostgresStorage } from "../server/postgres-storage.mjs";

process.env.ADMIN_EMAIL = "planning@test.local";
process.env.ADMIN_PASSWORD_HASH = `planning-salt:${scryptSync("a-long-planning-password", "planning-salt", 64).toString("hex")}`;
process.env.SESSION_SECRET = "planning-test-session-secret-longer-than-32-characters";

async function withStore(run) {
  const db = new PGlite();
  const storage = createPostgresStorage(async (sql, params) => (await db.query(sql, params)).rows);
  async function call(path, method = "GET", body, cookie = "") {
    const response = await handleApi(new Request(`http://localhost:5173/api/${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), storage);
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  try { await run(call); } finally { await db.close(); }
}

async function adminCookie(call) {
  const login = await call("admin/login", "POST", { email: "planning@test.local", password: "a-long-planning-password" });
  assert.equal(login.status, 200);
  return login.cookie;
}

const futureDate = () => {
  const date = new Date(Date.now() + 7 * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
};
const currentDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

test("encomenda e evento alimentam agenda, financeiro, checklist e produção", async () => {
  await withStore(async (call) => {
    assert.equal((await call("admin/planning")).status, 401);
    const admin = await adminCookie(call);
    const created = await call("admin/planning/bookings", "POST", {
      kind: "event", title: "Festa de aniversário", customerName: "Ana Souza",
      customerPhone: "31999999999", scheduledDate: futureDate(), scheduledTime: "16:00",
      fulfillment: "delivery", address: "Rua das Flores, 100, Betim",
      guestCount: 80, theme: "Jardim", responsible: "Luiz", deliveryFeeCents: 2500,
      depositCents: 5000,
      items: [
        { productId: "mano-brownie", name: "Brownie", quantity: 100, unitPriceCents: 600, produce: true },
        { name: "Refrigerante", quantity: 10, unitPriceCents: 900, produce: false },
      ],
    }, admin);
    assert.equal(created.status, 201);
    assert.equal(created.data.booking.totalCents, 71500);
    assert.equal(created.data.booking.paidCents, 5000);
    assert.equal(created.data.tasks.length, 1);

    const view = await call("admin/planning", "GET", undefined, admin);
    assert.equal(view.status, 200);
    assert.equal(view.data.summary.activeEvents, 1);
    assert.equal(view.data.summary.openTasks, 1);
    assert.equal(view.data.summary.receivableCents, 66500);
    assert.equal(view.data.agenda.length, 2);
    const finance = await call(`admin/business?from=${currentDate()}&to=${currentDate()}`, "GET", undefined, admin);
    assert.equal(finance.data.summary.planningReceiptsCents, 5000);
    assert.equal(finance.data.summary.cashReceiptsCents, 5000);

    const booking = view.data.bookings[0];
    const checked = await call(`admin/planning/bookings/${booking.id}/checklist/${booking.checklist[0].id}`, "PATCH", {
      expectedUpdatedAt: booking.updatedAt, done: true,
    }, admin);
    assert.equal(checked.status, 200);
    assert.equal(checked.data.booking.checklist[0].done, true);

    const payment = await call(`admin/planning/bookings/${booking.id}/payments`, "POST", {
      expectedUpdatedAt: checked.data.booking.updatedAt, amountCents: 10000, method: "pix", paidAt: futureDate(),
    }, admin);
    assert.equal(payment.status, 200);
    assert.equal(payment.data.booking.balanceCents, 56500);
    assert.equal((await call(`admin/planning/bookings/${booking.id}/payments`, "POST", {
      amountCents: 60000, method: "cash", paidAt: futureDate(),
    }, admin)).status, 400);

    const task = view.data.tasks[0];
    const partial = await call(`admin/planning/tasks/${task.id}`, "PATCH", {
      expectedUpdatedAt: task.updatedAt, completedQuantity: 35, responsible: "Maria",
    }, admin);
    assert.equal(partial.status, 200);
    assert.equal(partial.data.task.status, "in_progress");
    const finished = await call(`admin/planning/tasks/${task.id}`, "PATCH", {
      expectedUpdatedAt: partial.data.task.updatedAt, completedQuantity: 100, responsible: "Maria",
    }, admin);
    assert.equal(finished.status, 200);
    const after = await call("admin/planning", "GET", undefined, admin);
    assert.equal(after.data.tasks[0].status, "done");
    assert.equal(after.data.bookings[0].status, "ready");
    assert.equal(after.data.bookings[0].checklist.find((item) => item.label === "Produção finalizada").done, true);
  });
});
