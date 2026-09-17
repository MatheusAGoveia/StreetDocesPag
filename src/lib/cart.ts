import { products, type Product } from '../catalog';

export type CartItem = { id: string; quantity: number };
const CART_KEY = 'street-doces-cart-v1';

export function loadCart(): CartItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item): item is CartItem =>
      Boolean(item && typeof item.id === 'string' && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99),
    );
  } catch {
    return [];
  }
}

export function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function cartTotal(cart: CartItem[], catalog: Product[] = products) {
  return cart.reduce((sum, item) => sum + (catalog.find((product) => product.id === item.id)?.priceCents || 0) * item.quantity, 0);
}
