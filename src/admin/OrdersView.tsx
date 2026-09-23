import { useMemo, useState } from "react";
import {
  ArrowRight, Check, CircleAlert, Columns3, Download, Eye, List,
  MapPin, PackageCheck, Search, ShoppingBag, Truck,
} from "lucide-react";
import { formatPrice } from "../catalog";
import type { Order, PaymentStatus, Status } from "./AdminApp";
import { api } from "./api";
import "./orders.css";

type Scope = "active" | "attention" | "review" | "dispatch" | "all" | Status;
type View = "board" | "list";

const statusLabels: Record<Status, string> = {
  new: "Novo", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto",
  dispatched: "Em rota", completed: "Concluído", cancelled: "Cancelado",
};
const paymentLabels: Record<PaymentStatus, string> = {
  unpaid: "Pagamento pendente", review: "Pix a conferir", paid: "Pago", refunded: "Reembolsado",
};
const dateTime = (date: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date));

function elapsed(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

function nextAction(order: Order): { status: Status; label: string } | null {
  if (order.paymentStatus === "refunded") return null;
  if (order.status === "new") return { status: "confirmed", label: "Confirmar pedido" };
  if (order.status === "confirmed") return { status: "preparing", label: "Começar preparo" };
  if (order.status === "preparing") return { status: "ready", label: "Marcar como pronto" };
  if (order.status === "ready") return order.fulfillment === "delivery"
    ? { status: "dispatched", label: "Saiu para entrega" }
    : { status: "completed", label: "Concluir retirada" };
  if (order.status === "dispatched") return { status: "completed", label: order.fulfillment === "delivery" ? "Marcar entregue" : "Concluir retirada" };
  return null;
}

function paymentTone(status: PaymentStatus) {
  return status === "review" ? "review" : status === "paid" ? "paid" : status === "refunded" ? "refunded" : "unpaid";
}

function OrderCard({ order, busy, onOpen, onAdvance }: {
  order: Order; busy: boolean; onOpen: (order: Order) => void; onAdvance: (order: Order, status: Status) => void;
}) {
  const action = nextAction(order);
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const itemText = order.items.slice(0, 2).map((item) => `${item.quantity}× ${item.name}`).join(" · ");
  const more = order.items.length > 2 ? ` +${order.items.length - 2}` : "";
  const total = order.subtotalCents + (order.deliveryFeeCents || 0);
  const needsShipping = order.fulfillment === "delivery" && order.deliveryFeeCents == null;
  return <article className={`order-ops-card order-ops-${order.status} ${order.paymentStatus === "review" ? "order-ops-urgent" : ""}`}>
    <button className="order-card-main" onClick={() => onOpen(order)}>
      <div className="order-card-top"><span>{order.number}</span><time>{elapsed(order.createdAt)}</time></div>
      <div className="order-card-client"><div><strong>{order.customer.name}</strong><small>{order.customer.phone}</small></div><b>{formatPrice(total)}</b></div>
      <div className="order-card-items"><span>{quantity} {quantity === 1 ? "item" : "itens"}</span><p>{itemText}{more}</p></div>
      <div className="order-card-meta">
        <span className={`order-payment order-payment-${paymentTone(order.paymentStatus)}`}>{order.paymentStatus === "review" && <CircleAlert size={13} />}{paymentLabels[order.paymentStatus]}</span>
        <span>{order.fulfillment === "pickup" ? <PackageCheck size={14} /> : <Truck size={14} />}{order.fulfillment === "pickup" ? "Retirada" : needsShipping ? "Frete pendente" : "Entrega"}</span>
      </div>
      {order.notes && <div className="order-card-note"><strong>OBS.</strong> {order.notes}</div>}
    </button>
    <div className="order-card-actions">
      <button onClick={() => onOpen(order)}><Eye size={15} /> {order.paymentStatus === "review" ? "Conferir Pix" : "Detalhes"}</button>
      {action && order.paymentStatus !== "review" && <button className="order-card-next" disabled={busy} onClick={() => onAdvance(order, action.status)}>{busy ? "Atualizando…" : action.label} <ArrowRight size={15} /></button>}
    </div>
  </article>;
}

function CompactOrder({ order, busy, onOpen, onAdvance }: {
  order: Order; busy: boolean; onOpen: (order: Order) => void; onAdvance: (order: Order, status: Status) => void;
}) {
  const action = nextAction(order);
  const total = order.subtotalCents + (order.deliveryFeeCents || 0);
  return <article className={`order-compact order-compact-${order.status}`}>
    <button className="order-compact-main" onClick={() => onOpen(order)}>
      <span className="order-compact-code"><strong>{order.number}</strong><small>{dateTime(order.createdAt)} · {elapsed(order.createdAt)}</small></span>
      <span className="order-compact-customer"><strong>{order.customer.name}</strong><small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} itens · {order.fulfillment === "pickup" ? "Retirada" : "Entrega"}</small></span>
      <span className={`order-status order-status-${order.status}`}>{statusLabels[order.status]}</span>
      <span className={`order-payment order-payment-${paymentTone(order.paymentStatus)}`}>{paymentLabels[order.paymentStatus]}</span>
      <strong className="order-compact-total">{formatPrice(total)}</strong>
    </button>
    <div className="order-compact-actions"><button onClick={() => onOpen(order)} aria-label={`Abrir ${order.number}`}><Eye size={16} /></button>{action && order.paymentStatus !== "review" && <button disabled={busy} onClick={() => onAdvance(order, action.status)}>{action.label} <ArrowRight size={15} /></button>}</div>
  </article>;
}

const columns: { key: string; title: string; subtitle: string; statuses: Status[] }[] = [
  { key: "incoming", title: "Entrada", subtitle: "Confirmar com o cliente", statuses: ["new"] },
  { key: "confirmed", title: "Confirmados", subtitle: "Próximos da fila", statuses: ["confirmed"] },
  { key: "production", title: "Em preparo", subtitle: "Na cozinha agora", statuses: ["preparing"] },
  { key: "dispatch", title: "Prontos e saída", subtitle: "Retirar ou entregar", statuses: ["ready", "dispatched"] },
  { key: "closed", title: "Finalizados", subtitle: "Concluídos e cancelados", statuses: ["completed", "cancelled"] },
];

export default function OrdersView({ orders, onOpen, refresh, notify }: {
  orders: Order[]; onOpen: (order: Order) => void; refresh: () => Promise<void>; notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [view, setView] = useState<View>("board");
  const [busy, setBusy] = useState("");
  const counts = useMemo(() => ({
    active: orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length,
    attention: orders.filter((order) => order.status === "new" || order.paymentStatus === "review").length,
    review: orders.filter((order) => order.paymentStatus === "review").length,
    preparing: orders.filter((order) => order.status === "preparing").length,
    ready: orders.filter((order) => ["ready", "dispatched"].includes(order.status)).length,
    completed: orders.filter((order) => order.status === "completed").length,
  }), [orders]);
  const visible = useMemo(() => orders.filter((order) => {
    const matchesSearch = `${order.number} ${order.customer.name} ${order.customer.phone} ${order.items.map((item) => item.name).join(" ")}`.toLowerCase().includes(query.toLowerCase());
    if (!matchesSearch) return false;
    if (scope === "all") return true;
    if (scope === "active") return !["completed", "cancelled"].includes(order.status);
    if (scope === "attention") return order.status === "new" || order.paymentStatus === "review";
    if (scope === "review") return order.paymentStatus === "review";
    if (scope === "dispatch") return ["ready", "dispatched"].includes(order.status);
    return order.status === scope;
  }).sort((a, b) => {
    const priority = (entry: Order) => entry.paymentStatus === "review" ? 0 : entry.status === "new" ? 1 : 2;
    return priority(a) - priority(b) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [orders, query, scope]);

  async function advance(order: Order, status: Status) {
    setBusy(order.id);
    try {
      await api(`orders/${order.id}`, "PATCH", { expectedUpdatedAt: order.updatedAt, status });
      await refresh(); notify(`Pedido ${order.number}: ${statusLabels[status]}.`);
    } catch (cause) { notify(cause instanceof Error ? cause.message : "Não foi possível atualizar o pedido."); }
    finally { setBusy(""); }
  }
  function exportCsv() {
    const rows = [["Pedido", "Data", "Cliente", "Telefone", "Itens", "Recebimento", "Status", "Pagamento", "Total"], ...visible.map((order) => [
      order.number, order.createdAt, order.customer.name, order.customer.phone,
      order.items.map((item) => `${item.quantity}x ${item.name}`).join(" | "),
      order.fulfillment === "pickup" ? "Retirada" : "Entrega", statusLabels[order.status], paymentLabels[order.paymentStatus],
      ((order.subtotalCents + (order.deliveryFeeCents || 0)) / 100).toFixed(2),
    ])];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `street-doces-pedidos-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  const scopes: { key: Scope; label: string; count?: number }[] = [
    { key: "active", label: "Em andamento", count: counts.active },
    { key: "attention", label: "Exigem ação", count: counts.attention },
    { key: "review", label: "Pix a conferir", count: counts.review },
    { key: "completed", label: "Concluídos", count: counts.completed },
    { key: "cancelled", label: "Cancelados", count: orders.filter((order) => order.status === "cancelled").length },
    { key: "all", label: "Todos", count: orders.length },
  ];
  const boardColumns = columns.filter((column) =>
    scope === "all" || (scope === "active" && column.key !== "closed") ||
    visible.some((order) => column.statuses.includes(order.status)));
  return <div className="admin-page-stack orders-ops-page">
    <div className="admin-page-head orders-head"><div><span className="admin-overline">CENTRAL OPERACIONAL</span><h2>Pedidos<span className="heading-dot">.</span></h2><p>Veja prioridades, pagamento, produção e entrega sem perder o contexto.</p></div><button className="admin-secondary" onClick={exportCsv}><Download size={17} /> Exportar visão</button></div>
    <div className="orders-pulse">
      <button className={scope === "attention" ? "active" : ""} onClick={() => setScope("attention")}><span><CircleAlert size={17} /> Exigem ação</span><strong>{counts.attention}</strong><small>Novos pedidos ou Pix informado</small></button>
      <button className={scope === "new" ? "active" : ""} onClick={() => setScope("new")}><span><ShoppingBag size={17} /> Aguardam confirmação</span><strong>{orders.filter((order) => order.status === "new").length}</strong><small>Responder e confirmar disponibilidade</small></button>
      <button className={scope === "preparing" ? "active" : ""} onClick={() => setScope("preparing")}><span><PackageCheck size={17} /> Em preparo</span><strong>{counts.preparing}</strong><small>Pedidos na cozinha</small></button>
      <button className={scope === "dispatch" ? "active" : ""} onClick={() => setScope("dispatch")}><span><Truck size={17} /> Prontos ou em rota</span><strong>{counts.ready}</strong><small>Última etapa antes da conclusão</small></button>
    </div>
    <section className="orders-workspace">
      <div className="orders-toolbar"><div className="orders-search"><Search size={17} /><input aria-label="Buscar pedidos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, cliente, telefone ou produto" /></div><div className="orders-view-toggle" aria-label="Modo de visualização"><button className={view === "board" ? "active" : ""} onClick={() => setView("board")} title="Quadro"><Columns3 size={17} /><span>Quadro</span></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="Lista"><List size={17} /><span>Lista</span></button></div></div>
      <div className="orders-scopes">{scopes.map((item) => <button key={item.key} className={scope === item.key ? "active" : ""} onClick={() => setScope(item.key)}>{item.label}<b>{item.count}</b></button>)}</div>
      <div className="orders-result-line"><span>{visible.length} {visible.length === 1 ? "pedido encontrado" : "pedidos encontrados"}</span>{scope === "review" && <strong><CircleAlert size={14} /> Confira o extrato antes de marcar como pago.</strong>}</div>
      {!visible.length ? <div className="orders-empty"><Search size={25} /><strong>Nenhum pedido nesta visão</strong><p>Ajuste o filtro ou a busca para continuar.</p></div> : view === "board" ? <div className="orders-board">{boardColumns.map((column) => {
        const entries = visible.filter((order) => column.statuses.includes(order.status));
        return <section className={`orders-column orders-column-${column.key}`} key={column.key}><header><div><span>{column.title}</span><small>{column.subtitle}</small></div><b>{entries.length}</b></header><div>{entries.map((order) => <OrderCard key={order.id} order={order} busy={busy === order.id} onOpen={onOpen} onAdvance={advance} />)}{!entries.length && <p className="orders-column-empty">Nenhum pedido aqui.</p>}</div></section>;
      })}</div> : <div className="orders-compact-list">{visible.map((order) => <CompactOrder key={order.id} order={order} busy={busy === order.id} onOpen={onOpen} onAdvance={advance} />)}</div>}
    </section>
    <div className="orders-legend"><span><MapPin size={14} /> Entrega sem frete definido aparece como pendência.</span><span><Check size={14} /> Use as ações rápidas para mover o pedido para a próxima etapa.</span></div>
  </div>;
}
