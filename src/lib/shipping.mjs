/**
 * Normaliza cotações reais antes de escolher a entrega. Não impõe raio máximo:
 * cada parceiro informa se atende o endereço de destino.
 * @typedef {{provider:'uber'|'99', feeCents:number, currency:string, etaMinutes?:number, expiresAt?:string, available?:boolean, quoteId:string}} DeliveryQuote
 */

/** @param {DeliveryQuote[]} quotes */
export function chooseDeliveryQuote(quotes, { orderValueCents = 0, now = Date.now() } = {}) {
  const candidates = quotes.filter((quote) => {
    if (!['uber', '99'].includes(quote.provider)) return false;
    if (quote.available === false || typeof quote.currency !== 'string' || quote.currency.toUpperCase() !== 'BRL') return false;
    if (!Number.isInteger(quote.feeCents) || quote.feeCents < 0 || typeof quote.quoteId !== 'string' || !quote.quoteId) return false;
    if (quote.expiresAt && (!Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= now)) return false;
    // Limite informado publicamente pela 99Entrega para o valor do item enviado.
    if (quote.provider === '99' && orderValueCents > 50_000) return false;
    return true;
  });

  candidates.sort((a, b) =>
    a.feeCents - b.feeCents ||
    (a.etaMinutes ?? Infinity) - (b.etaMinutes ?? Infinity) ||
    a.provider.localeCompare(b.provider),
  );

  return candidates[0] ?? null;
}

/** @param {'pickup'|'delivery'} mode @param {DeliveryQuote[]} quotes */
export function resolveFulfillment(mode, quotes, options = {}) {
  if (mode === 'pickup') return { method: 'pickup', feeCents: 0, provider: null, quoteId: null };
  const best = chooseDeliveryQuote(quotes, options);
  return best
    ? { method: 'delivery', feeCents: best.feeCents, provider: best.provider, quoteId: best.quoteId }
    : { method: 'manual-quote', feeCents: null, provider: null, quoteId: null };
}
