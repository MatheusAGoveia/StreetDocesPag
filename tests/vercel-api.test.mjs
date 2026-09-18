import test from "node:test";
import assert from "node:assert/strict";
import { handleVercelRequest } from "../api/handler.mjs";
import { createVercelBlobStorage } from "../server/vercel-storage.mjs";

function fakeBlob() {
  class BlobPreconditionFailedError extends Error {}
  const files = new Map();
  let sequence = 0;
  return {
    BlobPreconditionFailedError,
    async get(path, options) {
      assert.equal(options.access, "private");
      assert.equal(options.useCache, false);
      const file = files.get(path);
      return file ? {
        statusCode: 200,
        stream: new Response(file.body).body,
        blob: { etag: file.etag },
      } : null;
    },
    async put(path, body, options) {
      assert.equal(options.access, "private");
      const old = files.get(path);
      if (options.ifMatch && old?.etag !== options.ifMatch)
        throw new BlobPreconditionFailedError();
      if (!options.allowOverwrite && old)
        throw new Error("Blob already exists");
      files.set(path, { body, etag: `etag-${++sequence}` });
    },
    async list({ prefix, cursor }) {
      const paths = [...files.keys()].filter((path) => path.startsWith(prefix)).sort();
      const start = Number(cursor || 0);
      const batch = paths.slice(start, start + 1);
      return {
        blobs: batch.map((pathname) => ({ pathname })),
        hasMore: start + 1 < paths.length,
        cursor: String(start + 1),
      };
    },
    async del(path) { files.delete(path); },
  };
}

test("adaptador Vercel mantém dados privados, pagina pedidos e evita edição concorrente", async () => {
  const storage = createVercelBlobStorage(fakeBlob());
  assert.deepEqual(await storage.getWithEtag("orders/one"), { data: null, etag: null });
  assert.equal(await storage.set("orders/one", { status: "new" }, null), true);
  assert.equal(await storage.set("orders/one", { status: "wrong" }, null), false);
  const first = await storage.getWithEtag("orders/one");
  assert.deepEqual(first.data, { status: "new" });
  assert.equal(await storage.set("orders/one", { status: "confirmed" }, first.etag), true);
  assert.equal(await storage.set("orders/one", { status: "stale" }, first.etag), false);
  assert.equal(await storage.set("orders/two", { status: "new" }, null), true);
  assert.deepEqual(await storage.list("orders/"), ["orders/one", "orders/two"]);
  await storage.delete("orders/two");
  assert.deepEqual(await storage.list("orders/"), ["orders/one"]);
});

test("função Vercel preserva rotas relativas e consulta de acompanhamento", async () => {
  const storage = createVercelBlobStorage(fakeBlob());
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
