import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Instagram, MapPin, Menu, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import { formatPrice, instagramUrl, pickupAddress, products as initialProducts, type Category, type Product, type StoreSettings } from './catalog';
import { cartTotal, loadCart, saveCart, type CartItem } from './lib/cart';
import { orderHref, rememberOrder } from './lib/orderLinks';
import ExperiencePage from './ExperiencePage';

type Filter = 'Todos' | Category;
type Fulfillment = 'pickup' | 'delivery';

const initialSettings: StoreSettings = { storeName: 'Street Doces', tagline: 'Doces que restauram sua essência.', instagramUrl, whatsapp: '', pixKey: 'matheusaagd2@gmail.com', pickupAddress, announcement: 'FEITO À MÃO EM BETIM, MG', acceptsOrders: true, pickupEnabled: true, deliveryEnabled: true, deliveryNotice: 'A loja confirma disponibilidade, parceiro (99 ou Uber) e valor da entrega no atendimento.' };

function Logo({ light = false }: { light?: boolean }) {
  return (
    <a className={`logo ${light ? 'logo-light' : ''}`} href="#inicio" aria-label="Street Doces, início">
      <span className="logo-mark">✳</span>
      <span className="logo-type">STREET<span>DOCES</span></span>
      <span className="logo-dot">®</span>
    </a>
  );
}

function QtyControl({ value, onChange, compact = false }: { value: number; onChange: (next: number) => void; compact?: boolean }) {
  return (
    <div className={`qty-control ${compact ? 'qty-compact' : ''}`} aria-label="Quantidade">
      <button type="button" aria-label="Diminuir quantidade" onClick={() => onChange(Math.max(0, value - 1))}><Minus size={14} /></button>
      <span>{value}</span>
      <button type="button" aria-label="Aumentar quantidade" onClick={() => onChange(Math.min(99, value + 1))}><Plus size={14} /></button>
    </div>
  );
}

function ProductDialog({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (id: string, quantity: number) => void }) {
  const [quantity, setQuantity] = useState(1);
  const soldOut = product.trackStock && (product.stock || 0) < 1;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Fechar detalhes"><X size={22} /></button>
        <div className="dialog-image" style={{ backgroundColor: product.accent }}><img src={product.image} alt={`${product.name}, ${product.flavor}`} /></div>
        <div className="dialog-content">
          <span className="eyebrow dark">{product.category} / Street Doces</span>
          <h2 id="dialog-title">{product.name}</h2>
          <p className="dialog-flavor">{product.flavor}</p>
          <p>{product.description}</p>
          <div className="dialog-rule" />
          <p className="dialog-note">Feito artesanalmente em Betim. Imagem ilustrativa; a apresentação pode variar.</p>
          <div className="dialog-purchase">
            {!soldOut && <QtyControl value={quantity} onChange={(next) => setQuantity(Math.max(1, Math.min(product.trackStock ? product.stock || 1 : 99, next)))} />}
            <button className="button button-dark" onClick={() => onAdd(product.id, quantity)} type="button" disabled={soldOut}>{soldOut ? 'Esgotado no momento' : `Adicionar · ${formatPrice(product.priceCents * quantity)}`} <ArrowRight size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({ cart, products, settings, onClose, onQuantity, onComplete }: { cart: CartItem[]; products: Product[]; settings: StoreSettings; onClose: () => void; onQuantity: (id: string, quantity: number) => void; onComplete: () => void }) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [fulfillment, setFulfillment] = useState<Fulfillment>(settings.pickupEnabled ? 'pickup' : 'delivery');
  const [name, setName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [trackingHref, setTrackingHref] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const total = cartTotal(cart, products);
  const phoneDigits = settings.whatsapp.replace(/\D/g, '');
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => { if (step === 'checkout') nameRef.current?.focus(); }, [step]);

  function orderMessage() {
    const list = cart.map((item) => {
      const product = products.find((entry) => entry.id === item.id)!;
      return `• ${item.quantity}x ${product.name} — ${formatPrice(product.priceCents * item.quantity)}`;
    }).join('\n');
    return [
      'Oi, Street Doces! Quero fazer um pedido 🍫',
      '',
      list,
      '',
      `Subtotal dos doces: ${formatPrice(total)}`,
      `Recebimento: ${fulfillment === 'pickup' ? 'Retirada na loja' : 'Entrega por parceiro (frete a confirmar)'}`,
      fulfillment === 'delivery' ? `Endereço: ${address.trim()}` : `Retirada: ${settings.pickupAddress}`,
      `Nome: ${name.trim()}`,
      `Telefone: ${customerPhone.trim()}`,
      notes.trim() ? `Observações: ${notes.trim()}` : '',
      '',
      'Aguardo a confirmação de disponibilidade, prazo e valor final. Vou acompanhar e pagar pelo site.',
    ].filter(Boolean).join('\n');
  }

  async function sendOrder(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!name.trim() || customerPhone.replace(/\D/g, '').length < 10) {
      setError('Preencha seu nome e um telefone com DDD.');
      return;
    }
    if (fulfillment === 'delivery' && address.trim().length < 12) {
      setError('Informe rua, número, bairro, cidade e CEP para a entrega.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, phone: customerPhone, fulfillment, address, notes, items: cart, expectedTotalCents: total }) });
      const result = await response.json().catch(() => ({ error: 'Resposta inválida do servidor.' }));
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar o pedido.');
      setConfirmationMessage(orderMessage());
      setOrderNumber(result.number);
      const saved = { id: result.id, number: result.number, token: result.token };
      rememberOrder(saved);
      setTrackingHref(orderHref(saved));
      setStep('success');
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao registrar o pedido. Tente novamente.');
    } finally { setSubmitting(false); }
  }

  async function copyOrder() {
    try {
      await navigator.clipboard.writeText(orderMessage());
      setError('Resumo copiado. Envie à loja pelo Instagram.');
    } catch {
      setError('Não foi possível copiar. Tente novamente.');
    }
  }

  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow dark">Street Doces / Seu momento</span>
            <h2 id="cart-title">{step === 'cart' ? 'Meu carrinho' : step === 'success' ? 'Pedido recebido' : 'Seu pedido'}</h2>
          </div>
          <button type="button" className="icon-close" onClick={onClose} aria-label="Fechar carrinho"><X size={22} /></button>
        </div>
        {step === 'checkout' && <button className="back-link" type="button" onClick={() => setStep('cart')}><ArrowLeft size={16} /> Voltar ao carrinho</button>}
        {step === 'success' ? <div className="order-success"><span className="order-success-mark"><Check size={42} /></span><span className="eyebrow dark">SOLICITAÇÃO REGISTRADA</span><h3>Seu doce já está no nosso radar.</h3><p>Pedido <strong>{orderNumber}</strong> recebido. A Street Doces vai confirmar disponibilidade, prazo e, se for entrega, o valor do frete pelo contato informado.</p><p className="success-small">Acompanhe o pedido e pague por Pix nesta página quando a loja confirmar o valor final. Seu link foi salvo neste navegador.</p>{trackingHref && <a className="button button-dark full" href={trackingHref}>Acompanhar e pagar <ArrowRight size={18} /></a>}{phoneDigits.length === 13 && <a className="button button-dark full" href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Olá! Acabei de registrar o pedido ${orderNumber}. ${confirmationMessage}`)}`} target="_blank" rel="noopener noreferrer">Conversar no WhatsApp <ArrowRight size={18} /></a>}<button className="text-link" type="button" onClick={onClose}>Continuar explorando <ArrowRight size={17} /></button></div> : step === 'cart' ? (
          <>
            <div className="drawer-scroll">
              {cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={42} strokeWidth={1.2} /><h3>Seu carrinho pede um doce.</h3><p>Escolha seus favoritos e a gente cuida do resto.</p><button className="text-link" type="button" onClick={onClose}>Explorar o cardápio <ArrowRight size={17} /></button></div> : cart.map((item) => {
                const product = products.find((entry) => entry.id === item.id);
                if (!product) return null;
                return <div className="cart-line" key={item.id}>
                  <img src={product.image} alt="" />
                  <div className="cart-line-main"><span className="cart-category">{product.category}</span><h3>{product.name}</h3><span>{formatPrice(product.priceCents)}</span><QtyControl compact value={item.quantity} onChange={(next) => onQuantity(item.id, next)} /></div>
                  <strong>{formatPrice(product.priceCents * item.quantity)}</strong>
                </div>;
              })}
            </div>
            {cart.length > 0 && <div className="drawer-bottom"><div className="subtotal"><span>Subtotal <small>{count} {count === 1 ? 'item' : 'itens'}</small></span><strong>{formatPrice(total)}</strong></div><p>Entrega, quando escolhida, é cotada e confirmada antes do pagamento.</p><button className="button button-dark full" type="button" onClick={() => setStep('checkout')}>Continuar pedido <ArrowRight size={18} /></button></div>}
          </>
        ) : (
          <form className="checkout-form" onSubmit={sendOrder}>
            <div className="drawer-scroll checkout-scroll">
              <div className="checkout-intro"><span className="step-number">01 / 02</span><h3>Como você quer receber?</h3></div>
              <div className="fulfillment-options">
                {settings.pickupEnabled && <button type="button" className={`fulfillment ${fulfillment === 'pickup' ? 'selected' : ''}`} onClick={() => setFulfillment('pickup')}><span className="fulfillment-icon"><MapPin size={19} /></span><span><strong>Retirar na Street</strong><small>Em Betim · sem frete</small></span><span className="radio" /></button>}
                {settings.deliveryEnabled && <button type="button" className={`fulfillment ${fulfillment === 'delivery' ? 'selected' : ''}`} onClick={() => setFulfillment('delivery')}><span className="fulfillment-icon"><ArrowRight size={19} /></span><span><strong>Receber em casa</strong><small>Frete cotado antes da confirmação</small></span><span className="radio" /></button>}
              </div>
              {fulfillment === 'pickup' ? <p className="fulfillment-note"><MapPin size={16} /> {settings.pickupAddress}. O horário é combinado com a loja.</p> : <><label className="field-label" htmlFor="address">Endereço completo *</label><textarea id="address" placeholder="Rua, número, bairro, cidade, CEP e complemento" value={address} onChange={(event) => setAddress(event.target.value)} rows={3} required /><p className="fulfillment-note">{settings.deliveryNotice} Nenhum frete é cobrado agora.</p></>}
              <div className="checkout-intro second"><span className="step-number">02 / 02</span><h3>Pra gente falar com você</h3></div>
              <label className="field-label" htmlFor="name">Seu nome *</label><input ref={nameRef} id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos te chamar?" required />
              <label className="field-label" htmlFor="phone">Seu WhatsApp com DDD *</label><input id="phone" autoComplete="tel" inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(31) 99999-9999" required />
              <label className="field-label" htmlFor="notes">Observações <span>(opcional)</span></label><textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Presente, horário preferido, alguma dúvida..." />
              <div className="order-summary"><span>Doces</span><strong>{formatPrice(total)}</strong><span>{fulfillment === 'pickup' ? 'Retirada' : 'Entrega'}</span><strong>{fulfillment === 'pickup' ? 'Grátis' : 'A confirmar'}</strong><div className="summary-total"><span>Subtotal</span><strong>{formatPrice(total)}</strong></div></div>
              <p className="checkout-disclaimer">Vamos registrar sua solicitação. A Street Doces confirma disponibilidade e valor final; então você poderá pagar por Pix na página de acompanhamento.</p>
              {error && <p className="form-message" role="alert">{error} <button type="button" onClick={copyOrder}>Copiar resumo</button></p>}
            </div>
            <div className="drawer-bottom"><button className="button button-dark full" type="submit" disabled={submitting || !settings.acceptsOrders}>{submitting ? 'Registrando pedido…' : settings.acceptsOrders ? 'Registrar pedido' : 'Pedidos pausados'} <ArrowRight size={18} /></button></div>
          </form>
        )}
      </aside>
    </div>
  );
}

export default function App() {
  const [filter, setFilter] = useState<Filter>('Todos');
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [catalogReady, setCatalogReady] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(loadCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const visible = useMemo(() => filter === 'Todos' ? products : products.filter((product) => product.category === filter), [filter, products]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const phoneDigits = settings.whatsapp.replace(/\D/g, '');

  useEffect(() => {
    fetch('/api/storefront').then((response) => response.ok ? response.json() : Promise.reject()).then((data: { products: Product[]; settings: StoreSettings }) => { setProducts(data.products); setSettings(data.settings); }).catch(() => setSettings({ ...initialSettings, acceptsOrders: false })).finally(() => setCatalogReady(true));
  }, []);
  useEffect(() => { if (catalogReady) setCart((current) => current.filter((item) => products.some((product) => product.id === item.id))); }, [products, catalogReady]);
  useEffect(() => saveCart(cart), [cart]);
  useEffect(() => { document.body.style.overflow = (cartOpen || selected) ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [cartOpen, selected]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(id); }, [toast]);

  function addItem(id: string, quantity = 1) {
    const product = products.find((entry) => entry.id === id);
    if (!product || (product.trackStock && (product.stock || 0) === 0)) { setToast('Produto indisponível no momento'); return; }
    setCart((current) => {
      const existing = current.find((item) => item.id === id);
      const max = product.trackStock ? Math.min(99, product.stock || 0) : 99;
      return existing ? current.map((item) => item.id === id ? { ...item, quantity: Math.min(max, item.quantity + quantity) } : item) : [...current, { id, quantity: Math.min(max, quantity) }];
    });
    setSelected(null);
    setToast('Adicionado ao carrinho');
  }

  function changeQuantity(id: string, quantity: number) {
    const product = products.find((entry) => entry.id === id);
    const next = product?.trackStock ? Math.min(quantity, product.stock || 0) : quantity;
    setCart((current) => next === 0 ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? { ...item, quantity: next } : item));
  }

  return (
    <>
      <div className="announcement"><span>{settings.announcement}</span><span className="announcement-star">✳</span><span>UM DOCE NO SEU RITMO</span><span className="announcement-star">✳</span><span>STREET DOCES</span></div>
      <header className="site-header" id="inicio">
        <Logo light />
        <nav className={`nav-links ${menuOpen ? 'nav-open' : ''}`} aria-label="Navegação principal">
          <a href="#cardapio" onClick={() => setMenuOpen(false)}>Cardápio</a><a href="#sobre" onClick={() => setMenuOpen(false)}>Nossa essência</a><a href="#como-funciona" onClick={() => setMenuOpen(false)}>Como pedir</a><a href="/acompanhar" onClick={() => setMenuOpen(false)}>Acompanhar pedido</a>
        </nav>
        <div className="header-actions"><button className="menu-button" type="button" aria-label="Abrir menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={23} /> : <Menu size={23} />}</button><button className="cart-trigger" type="button" onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`}><ShoppingBag size={19} /><span className="cart-label">Meu carrinho</span><span className="cart-badge">{cartCount}</span></button></div>
      </header>
      <ExperiencePage filter={filter} setFilter={setFilter} visible={visible} products={products} onAdd={addItem} onSelect={setSelected} onCartOpen={() => setCartOpen(true)} cartCount={cartCount} />
      <footer className="footer"><div className="container"><div className="footer-top"><div><Logo light /><p>{settings.tagline}<br />Feitos em Betim, com carinho e muito sabor.</p></div><div className="footer-links"><div><span>EXPLORE</span><a href="#cardapio">Cardápio</a><a href="#sobre">Nossa história</a><a href="#como-funciona">Como pedir</a></div><div><span>ENCONTRE A GENTE</span><a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer"><Instagram size={17} /> Instagram</a>{phoneDigits.length === 13 && <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer">WhatsApp da loja</a>}<p>{settings.pickupAddress}</p></div></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} STREET DOCES. TODOS OS DIREITOS RESERVADOS.</span><span>FEITO COM VONTADE EM BETIM, MG <span className="footer-spark">✳</span></span></div></div></footer>
      <button type="button" className="floating-cart" onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`}><ShoppingBag size={17} /><span>VER CARRINHO</span><span className="floating-cart-count">{cartCount}</span></button>
      <button type="button" className="mobile-cart-bar" onClick={() => setCartOpen(true)}><ShoppingBag size={18} /> <span>Meu carrinho</span><span>{cartCount} {cartCount === 1 ? 'item' : 'itens'}</span><ArrowRight size={17} /></button>
      {toast && <div className="toast" role="status"><Check size={17} />{toast}<button type="button" onClick={() => setCartOpen(true)}>Ver carrinho</button></div>}
      {selected && <ProductDialog key={selected.id} product={selected} onClose={() => setSelected(null)} onAdd={addItem} />}
      {cartOpen && <CartDrawer cart={cart} products={products} settings={settings} onClose={() => setCartOpen(false)} onQuantity={changeQuantity} onComplete={() => setCart([])} />}
    </>
  );
}
