export type Category = string;

export type Product = {
  id: string;
  name: string;
  category: Category;
  flavor: string;
  description: string;
  priceCents: number;
  image: string;
  accent: string;
  tag?: string;
  active?: boolean;
  trackStock?: boolean;
  stock?: number;
  lowStockThreshold?: number;
};

export type StoreSettings = {
  storeName: string;
  tagline: string;
  instagramUrl: string;
  whatsapp: string;
  pixKey: string;
  pickupAddress: string;
  announcement: string;
  acceptsOrders: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryNotice: string;
};

export const products: Product[] = [
  {
    id: 'miss-sensacao',
    name: 'Miss Sensação',
    category: 'Mousses',
    flavor: 'Morango + chocolate',
    description: 'Mousse de morango com chocolate. Uma dupla que acerta em cheio.',
    priceCents: 1000,
    image: '/images/miss-sensacao.webp',
    accent: '#f6b3ab',
    tag: 'Queridinho',
  },
  {
    id: 'lil-palha',
    name: 'Lil Palha',
    category: 'Palhas',
    flavor: 'Chocolate',
    description: 'Palha italiana de chocolate, cremosa e com aquela mordida marcante.',
    priceCents: 700,
    image: '/images/lil-palha.webp',
    accent: '#d9ad81',
  },
  {
    id: 'maradon',
    name: 'MARADON',
    category: 'Mousses',
    flavor: 'Maracujá + chocolate',
    description: 'Mousse de maracujá com chocolate. O azedinho encontra o intenso.',
    priceCents: 1000,
    image: '/images/maradon.webp',
    accent: '#f4d480',
    tag: 'Contraste perfeito',
  },
  {
    id: 'mano-brownie',
    name: 'MANO BROWNIE',
    category: 'Brownie',
    flavor: 'Chocolate',
    description: 'Brownie de chocolate com sabor intenso e textura irresistível.',
    priceCents: 600,
    image: '/images/mano-brownie.webp',
    accent: '#bd8d73',
  },
  {
    id: 'ninho-abravanel',
    name: 'Ninho Abravanel',
    category: 'Palhas',
    flavor: 'Leite ninho',
    description: 'Palha italiana de leite ninho para quem ama um doce cremoso.',
    priceCents: 700,
    image: '/images/ninho-abravanel.webp',
    accent: '#f0dfbd',
  },
];

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export const pickupAddress = 'Rua Estocolmo, 136 — Duque de Caxias, Betim/MG';
export const instagramUrl = 'https://www.instagram.com/street_doces/';
