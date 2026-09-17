export type SavedOrder = { id: string; number: string; token: string; savedAt: string };
const key = 'street-doces-orders-v1';

export function savedOrders(): SavedOrder[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => item?.id && item?.token && item?.number).slice(0, 8) : [];
  } catch { return []; }
}

export function rememberOrder(order: Omit<SavedOrder, 'savedAt'>) {
  try {
    const next = [{ ...order, savedAt: new Date().toISOString() }, ...savedOrders().filter((item) => item.id !== order.id)].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(next));
  } catch { /* O link permanece na tela mesmo se o navegador bloquear o armazenamento. */ }
}

export function orderHref(order: Pick<SavedOrder, 'id' | 'token'>) {
  return `/pedido/${encodeURIComponent(order.id)}?token=${encodeURIComponent(order.token)}`;
}
