import test from "node:test";
import assert from "node:assert/strict";
import { createPixPayload } from "../server/pix.mjs";

test("BR Code estático segue o exemplo com CRC do Banco Central", () => {
  assert.equal(
    createPixPayload({
      key: "123e4567-e12b-12d1-a456-426655440000",
      merchantName: "Fulano de Tal",
      city: "BRASILIA",
    }),
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  );
  const payload = createPixPayload({
    key: "matheusaagd2@gmail.com",
    amountCents: 2700,
    txid: "SD20260917ABC123",
  });
  assert.match(payload, /^000201/);
  assert.ok(payload.includes("0014br.gov.bcb.pix"));
  assert.ok(payload.includes("0122matheusaagd2@gmail.com"));
  assert.ok(payload.includes("540527.00"));
  assert.ok(payload.includes("0516SD20260917ABC123"));
  assert.match(payload, /6304[0-9A-F]{4}$/);
});
