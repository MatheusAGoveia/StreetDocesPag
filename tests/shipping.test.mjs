import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDeliveryQuote, resolveFulfillment } from '../src/lib/shipping.mjs';

const now = Date.parse('2026-09-16T12:00:00Z');
const quotes = [
  { provider: 'uber', quoteId: 'uber-1', feeCents: 1350, currency: 'BRL', etaMinutes: 35, expiresAt: '2026-09-16T12:15:00Z' },
  { provider: '99', quoteId: '99-1', feeCents: 1050, currency: 'BRL', etaMinutes: 45, expiresAt: '2026-09-16T12:10:00Z' },
];

test('escolhe a cotação válida mais barata, sem limitar a distância', () => {
  assert.equal(chooseDeliveryQuote(quotes, { now, orderValueCents: 2_000 })?.provider, '99');
});

test('desconsidera cotações expiradas e o limite público de valor da 99Entrega', () => {
  assert.equal(chooseDeliveryQuote(quotes, { now, orderValueCents: 60_000 })?.provider, 'uber');
  assert.equal(chooseDeliveryQuote(quotes, { now: Date.parse('2026-09-16T12:20:00Z') }), null);
});

test('retirada é gratuita e entrega sem cotação permanece pendente', () => {
  assert.deepEqual(resolveFulfillment('pickup', quotes), { method: 'pickup', feeCents: 0, provider: null, quoteId: null });
  assert.deepEqual(resolveFulfillment('delivery', []), { method: 'manual-quote', feeCents: null, provider: null, quoteId: null });
});

test('empate de preço prioriza a entrega mais rápida', () => {
  const tied = quotes.map((quote) => ({ ...quote, feeCents: 1000 }));
  assert.equal(chooseDeliveryQuote(tied, { now })?.provider, 'uber');
});

test('ignora cotação malformada e moeda estrangeira', () => {
  const invalid = [
    { provider: '99', quoteId: 'broken', feeCents: 1, expiresAt: 'sem-data' },
    { provider: 'uber', quoteId: 'usd', feeCents: 100, currency: 'USD' },
  ];
  assert.equal(chooseDeliveryQuote(invalid, { now }), null);
});
