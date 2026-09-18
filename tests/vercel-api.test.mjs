import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { handleVercelRequest } from "../api/handler.mjs";
import { createPostgresStorage } from "../server/postgres-storage.mjs";

async function withDatabase(run) {
  const database = new PGlite();
  const storage = createPostgresStorage(async (statement, params) =>
    (await database.query(statement, params)).rows,
  );
  try {
    await run(storage);
  } finally {
    await database.close();
  }
}

test("PostgreSQL protege inserção, atualização concorrente e leitura por prefixo", async () => {
  await withDatabase(async (storage) => {
    assert.deepEqual(await storage.getWithEtag("orders/one"), { data: null, etag: null });
    assert.equal(await storage.set("orders/one", { status: "new" }, null), true);
    assert.equal(await storage.set("orders/one", { status: "wrong" }, null), false);
    const first = await storage.getWithEtag("orders/one");
    assert.deepEqual(first.data, { status: "new" });
    assert.equal(await storage.set("orders/one", { status: "confirmed" }, first.etag), true);
    assert.equal(await storage.set("orders/one", { status: "stale" }, first.etag), false);
    assert.equal(await storage.set("orders/two", { status: "new" }, null), true);
    assert.deepEqual(await storage.list("orders/"), ["orders/one", "orders/two"]);
    assert.deepEqual(await storage.listValues("orders/"), [
      { status: "confirmed" }, { status: "new" },
    ]);
    await storage.delete("orders/two");
    assert.deepEqual(await storage.list("orders/"), ["orders/one"]);
    assert.equal(await storage.set("catalog", [{ id: "custom" }]), true);
    assert.deepEqual(await storage.get("catalog"), [{ id: "custom" }]);
    await assert.rejects(storage.get("../secrets"), /Chave inválida/);
  });
});

test("função Vercel grava conta e associa pedido no PostgreSQL", async () => {
  await withDatabase(async (storage) => {
    const base = "https://street-doces-pag.vercel.app/api/handler?route=";
    const catalog = await handleVercelRequest(new Request(`${base}storefront`), storage);
    assert.equal(catalog.status, 200);
    assert.equal((await catalog.json()).products.length, 5);
    const registered = await handleVercelRequest(new Request(`${base}account/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Cliente Vercel", email: "cliente@vercel.test", phone: "31999999999",
        password: "senha-de-teste-muito-forte",
      }),
    }), storage);
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get("set-cookie").split(";")[0];
    const created = await handleVercelRequest(new Request(`${base}orders`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Cliente Vercel", phone: "31999999999", fulfillment: "pickup",
        items: [{ id: "miss-sensacao", quantity: 1 }],
      }),
    }), storage);
    assert.equal(created.status, 201);
    const order = await created.json();
    const tracked = await handleVercelRequest(
      new Request(`${base}orders/${order.id}`, { headers: { cookie } }), storage,
    );
    assert.equal(tracked.status, 200);
    assert.equal((await tracked.json()).order.number, order.number);
    assert.equal((await handleVercelRequest(new Request(`${base}../secrets`), storage)).status, 404);
  });
});
