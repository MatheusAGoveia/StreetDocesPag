import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, Copy, MapPin, PackageCheck, RefreshCw, ShieldCheck, ShoppingBag, Truck, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatPrice } from './catalog';
import AccountAccess from './account/AccountAccess';
import { useAccount } from './account/AccountContext';
import { orderHref, rememberOrder, savedOrders, type SavedOrder } from './lib/orderLinks';
import './tracking.css';

type Status = 'new' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'completed' | 'cancelled';
type PaymentStatus = 'unpaid' | 'review' | 'paid' | 'refunded';
type Order = {
  id: string; number: string; createdAt: string; updatedAt: string;
  status: Status; paymentStatus: PaymentStatus; customerName: string;
  fulfillment: 'pickup' | 'delivery'; address: string; pickupAddress: string;
  items: { productId: string; name: string; image: string; quantity: number; priceCents: number; totalCents: number }[];
  subtotalCents: number; deliveryFeeCents: number | null; totalCents: number;
  deliveryPartner: string; history: { at: string; label: string }[];
  paymentReportedAt: string | null;
  pix: { key: string; txid: string; amountCents: number; payload: string } | null;
};
type AccountOrder = { id: string; number: string; createdAt: string; status: Status; paymentStatus: PaymentStatus; totalCents: number; fulfillment: 'pickup' | 'delivery' };

const statuses: { key: Status; label: string; note: string }[] = [
  { key: 'new', label: 'Recebido', note: 'Seu pedido chegou à Street.' },
  { key: 'confirmed', label: 'Confirmado', note: 'Disponibilidade e valor final confirmados.' },
  { key: 'preparing', label: 'Em preparo', note: 'A cozinha está no corre.' },
  { key: 'ready', label: 'Pronto', note: 'Seu pedido está pronto.' },
  { key: 'dispatched', label: 'A caminho', note: 'Saiu para entrega.' },
  { key: 'completed', label: 'Entregue', note: 'Doce entregue. Aproveite!' },
  { key: 'cancelled', label: 'Cancelado', note: 'O pedido foi cancelado.' },
];
const dateTime = (date: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date));

async function responseJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({ error: 'Resposta inválida do servidor.' }));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Não foi possível carregar o pedido.'), { status: response.status });
  return result as T;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="tracking-page">
    <div className="tracking-topline"><span>STREET DOCES ✳ BETIM, MG</span><span>SEU DOCE ESTÁ NO CAMINHO</span></div>
    <header className="tracking-header">
      <a href="/" className="tracking-logo" aria-label="Street Doces, voltar à loja"><span>✳</span> STREET<span>DOCES</span></a>
      <a href="/" className="tracking-back"><ArrowLeft size={17} /> Voltar para a loja</a>
    </header>
    {children}
    <footer className="tracking-footer"><span>STREET DOCES © {new Date().getFullYear()}</span><span>FEITO COM VONTADE EM BETIM ✳</span></footer>
  </div>;
}

function Lookup() {
  const { customer, loading: accountLoading, logout } = useAccount();
  const [number, setNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [recent] = useState(savedOrders);
  useEffect(() => {
    if (!customer) { setOrders([]); return; }
    let active = true;
    setOrdersLoading(true);
    fetch('/api/account/orders', { cache: 'no-store' })
      .then((response) => responseJson<{ orders: AccountOrder[] }>(response))
      .then((result) => { if (active) setOrders(result.orders); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seus pedidos.'); })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
  }, [customer?.id]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await responseJson<SavedOrder>(await fetch('/api/orders/lookup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ number: number.trim(), phone: phone.trim() }),
      }));
      rememberOrder(result);
      await responseJson(await fetch('/api/account/orders/claim', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: result.id, token: result.token }),
      }));
      window.location.assign(`/pedido/${encodeURIComponent(result.id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível encontrar o pedido.'); }
    finally { setBusy(false); }
  }
  return <Shell>
    <main className="tracking-lookup">
      <section className="lookup-editorial">
        <span className="tracking-kicker">01 / UM DOCE DE CADA VEZ</span>
        <h1>Fique por <i>dentro</i><span>.</span></h1>
        <p>Veja cada etapa, confira o valor final e faça o Pix por aqui quando seu pedido estiver confirmado.</p>
        <div className="lookup-orbit" aria-hidden="true"><span>✳</span><small>DO PEDIDO<br />À PRIMEIRA<br />MORDIDA</small></div>
      </section>
      {accountLoading ? <section className="lookup-card"><p>Verificando sua conta…</p></section> : !customer ? <AccountAccess /> : <section className="lookup-card account-orders-card">
        <span className="tracking-kicker">MINHA CONTA / STREET DOCES</span>
        <h2>Oi, {customer.name.split(' ')[0]}<span>.</span></h2>
        <p>Seus pedidos ficam vinculados à sua conta e podem ser acompanhados em qualquer dispositivo.</p>
        <div className="account-identity"><span>{customer.email}</span><button type="button" disabled={logoutBusy} onClick={async () => { setLogoutBusy(true); try { await logout(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível sair.'); } finally { setLogoutBusy(false); } }}>Sair da conta</button></div>
        <div className="account-order-list"><span className="tracking-kicker">PEDIDOS DA SUA CONTA</span>
          {ordersLoading ? <p>Carregando pedidos…</p> : orders.length ? orders.map((item) => <a key={item.id} href={`/pedido/${encodeURIComponent(item.id)}`} className="account-order-link"><span><strong>{item.number}</strong><small>{dateTime(item.createdAt)} · {statuses.find((status) => status.key === item.status)?.label}</small></span><b>{formatPrice(item.totalCents)}</b><ArrowRight size={18} /></a>) : <p>Ainda não há pedidos nesta conta. <a href="/">Escolha seu primeiro doce.</a></p>}
        </div>
        <div className="legacy-claim"><span className="tracking-kicker">PEDIDO ANTERIOR</span><h3>Tem um pedido antigo?</h3><p>Vincule um pedido feito antes da criação da sua conta usando o número e telefone cadastrados nele.</p>
          <form onSubmit={submit}>
            <label htmlFor="order-number">Número do pedido</label>
            <input id="order-number" autoComplete="off" placeholder="SD-260917-ABCD" value={number} onChange={(event) => setNumber(event.target.value.toUpperCase())} required />
            <label htmlFor="order-phone">Telefone com DDD</label>
            <input id="order-phone" inputMode="tel" autoComplete="tel" placeholder="(31) 99999-9999" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            {error && <p className="tracking-error" role="alert">{error}</p>}
            <button className="tracking-primary" type="submit" disabled={busy}>{busy ? 'Vinculando…' : 'Vincular pedido'} <ArrowRight size={18} /></button>
          </form>
          {recent.length > 0 && <div className="lookup-recent"><span>LINKS ANTIGOS NESTE NAVEGADOR</span>{recent.map((item) => <a href={orderHref(item)} key={item.id}>{item.number} <ArrowRight size={16} /></a>)}</div>}
        </div>
      </section>}
    </main>
  </Shell>;
}

function StatusTimeline({ order }: { order: Order }) {
  if (order.status === 'cancelled') return <div className="tracking-cancelled"><XCircle size={24} /><div><strong>Pedido cancelado</strong><p>Entre em contato com a loja se precisar de ajuda.</p></div></div>;
  const path = statuses.filter((item) => order.fulfillment === 'delivery' || item.key !== 'dispatched').filter((item) => item.key !== 'cancelled');
  const currentIndex = path.findIndex((item) => item.key === order.status);
  return <ol className="tracking-timeline">{path.map((item, index) => <li key={item.key} className={index < currentIndex ? 'done' : index === currentIndex ? 'current' : ''}>
    <span className="timeline-marker">{index < currentIndex ? <Check size={15} /> : String(index + 1).padStart(2, '0')}</span>
    <div><strong>{item.label}</strong><small>{item.note}</small></div>
    {index === currentIndex && <span className="timeline-now">AGORA</span>}
  </li>)}</ol>;
}

function Payment({ order, token, onUpdate }: { order: Order; token: string | null; onUpdate: (order: Order) => void }) {
  const [copied, setCopied] = useState<'payload' | 'key' | null>(null);
  const [busy, setBusy] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [error, setError] = useState('');
  async function copy(value: string, type: 'payload' | 'key') {
    try { await navigator.clipboard.writeText(value); setCopied(type); window.setTimeout(() => setCopied(null), 2500); }
    catch { setError('Não foi possível copiar automaticamente. Selecione o código abaixo.'); }
  }
  async function report() {
    setBusy(true); setError('');
    try {
      const result = await responseJson<{ order: Order }>(await fetch(`/api/orders/${order.id}/payment-report`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, payerName }),
      }));
      onUpdate(result.order);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível informar o pagamento.'); }
    finally { setBusy(false); }
  }
  if (order.status === 'cancelled') return <section className="tracking-payment"><span className="tracking-kicker">PAGAMENTO</span><h2>Pedido cancelado.</h2><p>O Pix não está disponível para este pedido.</p></section>;
  if (order.paymentStatus === 'refunded') return <section className="tracking-payment payment-done"><span className="payment-symbol"><ShieldCheck size={30} /></span><span className="tracking-kicker">PAGAMENTO REEMBOLSADO</span><h2>Reembolso <i>registrado.</i></h2><p>A equipe marcou este pagamento como reembolsado. Se tiver dúvidas, fale com a Street Doces.</p></section>;
  if (order.paymentStatus === 'paid') return <section className="tracking-payment payment-done"><span className="payment-symbol"><ShieldCheck size={30} /></span><span className="tracking-kicker">PAGAMENTO CONFIRMADO</span><h2>Pix recebido. <i>Boa!</i></h2><p>A Street Doces confirmou seu pagamento. Acompanhe o andamento ao lado.</p><strong>{formatPrice(order.totalCents)}</strong></section>;
  if (order.paymentStatus === 'review') return <section className="tracking-payment payment-review"><span className="payment-symbol"><Clock3 size={30} /></span><span className="tracking-kicker">PIX INFORMADO</span><h2>Estamos <i>conferindo.</i></h2><p>Recebemos seu aviso de pagamento. A equipe vai conferir o crédito na conta e atualizar este pedido.</p><small>Marcar “já paguei” não confirma automaticamente o recebimento.</small></section>;
  if (!order.pix) return <section className="tracking-payment payment-wait"><span className="payment-symbol"><Clock3 size={30} /></span><span className="tracking-kicker">PAGAMENTO / PRÓXIMA ETAPA</span><h2>Espere o <i>valor final.</i></h2><p>{order.status === 'new' ? 'A loja vai confirmar a disponibilidade do seu pedido.' : order.fulfillment === 'delivery' && order.deliveryFeeCents == null ? 'A loja está definindo o parceiro e o valor da entrega.' : 'O pagamento ainda não está disponível.'}</p><div className="payment-wait-note">O QR Code aparece aqui quando o pedido estiver confirmado{order.fulfillment === 'delivery' ? ' e o frete definido' : ''}.</div></section>;
  return <section className="tracking-payment payment-ready">
    <span className="tracking-kicker">PAGUE POR PIX / VALOR FINAL</span>
    <h2>Agora é <i>com você.</i></h2>
    <div className="payment-amount"><span>TOTAL DO PEDIDO</span><strong>{formatPrice(order.pix.amountCents)}</strong></div>
    <div className="payment-qr"><QRCodeSVG value={order.pix.payload} size={218} level="M" marginSize={4} title={`QR Code Pix do pedido ${order.number}`} /><span>Escaneie com o app do seu banco</span></div>
    <button type="button" className="tracking-primary" onClick={() => copy(order.pix!.payload, 'payload')}><Copy size={17} /> {copied === 'payload' ? 'Código copiado!' : 'Copiar código Pix'} <ArrowRight size={17} /></button>
    <label className="pix-code-label" htmlFor="pix-code">PIX COPIA E COLA</label>
    <textarea id="pix-code" className="pix-code" rows={3} value={order.pix.payload} readOnly onFocus={(event) => event.target.select()} />
    <div className="pix-key"><div><span>CHAVE PIX DA LOJA</span><strong>{order.pix.key}</strong></div><button type="button" onClick={() => copy(order.pix!.key, 'key')} aria-label="Copiar chave Pix">{copied === 'key' ? <Check size={18} /> : <Copy size={18} />}</button></div>
    <p className="pix-check">Confira no app do banco a chave, o destinatário e o valor antes de confirmar. Identificador: <strong>{order.pix.txid}</strong>.</p>
    <div className="report-payment"><span className="tracking-kicker">DEPOIS DO PAGAMENTO</span><p>Fez o Pix? Avise a equipe para conferirmos o recebimento.</p><label htmlFor="payer-name">Nome de quem pagou <small>(opcional)</small></label><input id="payer-name" value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="Nome que aparece no comprovante" /><button type="button" onClick={report} disabled={busy}>{busy ? 'Enviando aviso…' : 'Já fiz o Pix'} <Check size={17} /></button></div>
    {error && <p className="tracking-error" role="alert">{error}</p>}
  </section>;
}

function OrderView({ id, token }: { id: string; token: string | null }) {
  const { customer, loading: accountLoading, expire } = useAccount();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const reload = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const url = `/api/orders/${encodeURIComponent(id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const result = await responseJson<{ order: Order }>(await fetch(url, { cache: 'no-store' }));
      setOrder(result.order); setError('');
      if (token) rememberOrder({ id, token, number: result.order.number });
    } catch (cause) {
      if (!token && (cause as { status?: number }).status === 401) expire();
      setOrder(null);
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o pedido.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [id, token]);
  useEffect(() => {
    if (!token && accountLoading) return;
    if (!token && !customer) { setLoading(false); return; }
    void reload(true);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, 25000);
    const visible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [reload, token, accountLoading, customer?.id]);
  if (!token && !accountLoading && !customer) return <Shell><main className="tracking-lookup"><section className="lookup-editorial"><span className="tracking-kicker">ACOMPANHAMENTO</span><h1>Seu pedido<span>.</span></h1><p>Entre na sua conta para ver os detalhes e acompanhar o pagamento.</p></section><AccountAccess /></main></Shell>;
  if (loading) return <Shell><main className="tracking-loading"><span className="tracking-spinner" /> Carregando seu pedido…</main></Shell>;
  if (!order) return <Shell><main className="tracking-loading"><h1>Não achamos esse pedido.</h1><p>{error}</p><a href="/acompanhar" className="tracking-primary">Buscar meu pedido <ArrowRight size={17} /></a></main></Shell>;
  const status = statuses.find((item) => item.key === order.status)!;
  return <Shell><main className="tracking-order">
    <div className="tracking-order-head"><div><span className="tracking-kicker">PEDIDO {order.number} / {dateTime(order.createdAt)}</span><h1>{order.status === 'cancelled' ? 'Vamos conversar.' : order.status === 'completed' ? 'Doce entregue.' : 'Tá rolando.'}<span>✳</span></h1><p>Oi, {order.customerName.split(' ')[0]}. {status.note} Esta página se atualiza automaticamente.</p></div><div className="order-current"><span>ETAPA ATUAL</span><strong>{status.label}</strong><button type="button" onClick={() => reload()} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'is-spinning' : ''} /> Atualizar</button></div></div>
    {error && <p className="tracking-error" role="alert">{error}</p>}
    <div className="tracking-order-grid"><div className="tracking-order-left">
      <section className="tracking-panel progress-panel"><div className="tracking-panel-head"><span className="tracking-kicker">01 / A JORNADA DO SEU DOCE</span><PackageCheck size={22} /></div><h2>De onde está<br />até você<span>.</span></h2><StatusTimeline order={order} /></section>
      <section className="tracking-panel items-panel"><div className="tracking-panel-head"><span className="tracking-kicker">02 / O QUE VOCÊ PEDIU</span><ShoppingBag size={21} /></div><h2>Seu corre,<br /><i>seus doces.</i></h2><div className="tracking-items">{order.items.map((item) => <div className="tracking-item" key={item.productId}><img src={item.image} alt="" /><div><strong>{item.name}</strong><span>{item.quantity} × {formatPrice(item.priceCents)}</span></div><b>{formatPrice(item.totalCents)}</b></div>)}</div><div className="tracking-totals"><div><span>Doces</span><strong>{formatPrice(order.subtotalCents)}</strong></div><div><span>{order.fulfillment === 'pickup' ? 'Retirada' : 'Entrega'}</span><strong>{order.fulfillment === 'pickup' ? 'Grátis' : order.deliveryFeeCents == null ? 'A confirmar' : formatPrice(order.deliveryFeeCents)}</strong></div><div className="total"><span>Total {order.deliveryFeeCents == null && order.fulfillment === 'delivery' ? 'parcial' : ''}</span><strong>{formatPrice(order.totalCents)}</strong></div></div></section>
      <section className="tracking-panel delivery-panel"><div className="tracking-panel-head"><span className="tracking-kicker">03 / RECEBIMENTO</span>{order.fulfillment === 'pickup' ? <MapPin size={22} /> : <Truck size={22} />}</div><h2>{order.fulfillment === 'pickup' ? 'Retirada na Street.' : 'A caminho de você.'}</h2><p>{order.fulfillment === 'pickup' ? order.pickupAddress : order.address}</p>{order.deliveryPartner && <small>Entrega por {order.deliveryPartner}</small>}</section>
      <section className="tracking-history"><span className="tracking-kicker">HISTÓRICO DO PEDIDO</span>{[...order.history].reverse().map((event, index) => <div key={`${event.at}-${index}`}><span>{dateTime(event.at)}</span><p>{event.label}</p></div>)}</section>
    </div><Payment order={order} token={token} onUpdate={setOrder} /></div>
    <div className="tracking-help"><span>PRECISA DE AJUDA?</span><p>Tenha o número <strong>{order.number}</strong> em mãos ao falar com a Street Doces.</p><a href="/acompanhar">Ver outros pedidos <ArrowRight size={17} /></a></div>
  </main></Shell>;
}

export default function TrackingApp() {
  useEffect(() => {
    document.title = 'Acompanhe seu pedido | Street Doces';
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex, nofollow'; document.head.appendChild(robots);
    const referrer = document.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer'; document.head.appendChild(referrer);
    return () => { robots.remove(); referrer.remove(); };
  }, []);
  const match = window.location.pathname.match(/^\/pedido\/([a-f0-9-]{36})$/);
  const token = new URLSearchParams(window.location.search).get('token');
  return match ? <OrderView id={match[1]} token={token} /> : <Lookup />;
}
