import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays, Check, ChevronRight, CircleDollarSign, ClipboardCheck,
  Factory, MapPin, PackageCheck, PartyPopper, Plus, RefreshCw,
  Save, Search, UserRound, X,
} from "lucide-react";
import { formatPrice, type Product } from "../catalog";
import { api } from "./api";
import "./operations.css";

export type OperationsSection = "bookings" | "events" | "production" | "agenda";
type BookingStatus = "planned" | "confirmed" | "in_production" | "ready" | "completed" | "cancelled";
type Booking = {
  id: string; code: string; kind: "order" | "event"; title: string;
  customerName: string; customerPhone: string; scheduledDate: string; scheduledTime: string;
  fulfillment: "pickup" | "delivery"; address: string; guestCount: number; theme: string;
  responsible: string; notes: string; status: BookingStatus; createdAt: string; updatedAt: string;
  items: { id: string; productId: string; name: string; quantity: number; unitPriceCents: number; totalCents: number; produce: boolean }[];
  subtotalCents: number; deliveryFeeCents: number; totalCents: number; paidCents: number; balanceCents: number;
  payments: { id: string; amountCents: number; method: string; paidAt: string; note: string }[];
  checklist: { id: string; label: string; done: boolean; doneAt: string | null }[];
  history: { at: string; label: string }[];
};
type ProductionTask = {
  id: string; bookingId: string; bookingCode: string; title: string; productId: string;
  targetQuantity: number; completedQuantity: number; dueDate: string; dueTime: string;
  responsible: string; status: "pending" | "in_progress" | "done" | "cancelled";
  updatedAt: string;
};
type AgendaEntry = {
  id: string; date: string; time: string; kind: "order" | "event" | "production";
  title: string; detail: string; status: string; bookingId: string;
};
type PlanningData = {
  bookings: Booking[]; tasks: ProductionTask[]; agenda: AgendaEntry[];
  summary: { activeOrders: number; activeEvents: number; openTasks: number; receivableCents: number };
};

const statusLabels: Record<BookingStatus, string> = {
  planned: "Planejado", confirmed: "Confirmado", in_production: "Em produção",
  ready: "Pronto", completed: "Concluído", cancelled: "Cancelado",
};
const paymentLabels: Record<string, string> = { pix: "Pix", cash: "Dinheiro", card: "Cartão", transfer: "Transferência", other: "Outro" };
const taskLabels: Record<string, string> = { pending: "Pendente", in_progress: "Em produção", done: "Concluído", cancelled: "Cancelado" };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const shortDate = (value: string) => value.split("-").reverse().join("/");
const moneyText = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
function parseMoney(value: string) {
  const raw = value.trim().replace(/\s|R\$/g, "");
  const number = Number(raw.includes(",") ? raw.replaceAll(".", "").replace(",", ".") : raw);
  return raw && Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";

function PageHead({ section, onCreate }: { section: OperationsSection; onCreate?: () => void }) {
  const content = {
    bookings: ["PEDIDOS COM DATA MARCADA", "Encomendas", "Organize pedidos antecipados, valores, produção e retirada ou entrega."],
    events: ["OPERAÇÃO DE PONTA A PONTA", "Eventos", "Controle festas, convidados, pagamentos, produção e checklist final."],
    production: ["FILA DA COZINHA", "Produção", "Veja o que precisa ser feito e registre o avanço real de cada item."],
    agenda: ["PRÓXIMOS COMPROMISSOS", "Agenda", "Encomendas, eventos e tarefas de produção em ordem cronológica."],
  }[section];
  return <div className="admin-page-head operations-page-head"><div>
    <span className="admin-overline">{content[0]}</span><h2>{content[1]}<span className="heading-dot">.</span></h2><p>{content[2]}</p>
  </div>{onCreate && <button className="admin-primary" onClick={onCreate}><Plus size={17} /> Novo registro</button>}</div>;
}

function Summary({ data }: { data: PlanningData }) {
  return <div className="operations-summary">
    <div><span>Encomendas ativas</span><strong>{data.summary.activeOrders}</strong></div>
    <div><span>Eventos ativos</span><strong>{data.summary.activeEvents}</strong></div>
    <div><span>Tarefas abertas</span><strong>{data.summary.openTasks}</strong></div>
    <div className="operations-summary-money"><span>A receber</span><strong>{formatPrice(data.summary.receivableCents)}</strong></div>
  </div>;
}

export function OperationsOverview({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<PlanningData | null>(null);
  useEffect(() => { let live = true; api<PlanningData>("planning").then((value) => { if (live) setData(value); }).catch(() => {}); return () => { live = false; }; }, []);
  const next = data?.agenda.find((entry) => entry.date >= today());
  return <button className="operations-overview" onClick={onOpen}>
    <span className="operations-overview-icon"><CalendarDays size={23} /></span>
    <span><small>PLANEJAMENTO</small><strong>{data ? `${data.summary.activeOrders + data.summary.activeEvents} compromissos ativos` : "Abrir agenda"}</strong><em>{next ? `Próximo: ${shortDate(next.date)} às ${next.time} · ${next.title}` : "Encomendas, eventos e produção no mesmo fluxo"}</em></span>
    <span className="operations-overview-link">Ver agenda <ChevronRight size={18} /></span>
  </button>;
}

type DraftLine = { productId: string; name: string; quantity: string; price: string; produce: boolean };
const blankLine = (): DraftLine => ({ productId: "", name: "", quantity: "1", price: "0,00", produce: true });

function CreateBooking({ kind, products, busy, onClose, onCreated, notify }: {
  kind: "order" | "event"; products: Product[]; busy: boolean;
  onClose: () => void; onCreated: () => Promise<void>; notify: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [scheduledDate, setScheduledDate] = useState(today());
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [guestCount, setGuestCount] = useState("20");
  const [theme, setTheme] = useState("");
  const [responsible, setResponsible] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0,00");
  const [deposit, setDeposit] = useState("0,00");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftLine[]>([blankLine()]);
  function updateLine(index: number, patch: Partial<DraftLine>) {
    setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = items.map((line) => ({
      productId: line.productId, name: line.name, quantity: Number(line.quantity),
      unitPriceCents: parseMoney(line.price), produce: line.produce,
    }));
    const deliveryFeeCents = parseMoney(deliveryFee);
    const depositCents = parseMoney(deposit);
    if (normalized.some((line) => !line.name.trim() || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.unitPriceCents === null) || deliveryFeeCents === null || depositCents === null) {
      notify("Confira os itens, quantidades e valores."); return;
    }
    setSubmitting(true);
    try {
      await api("planning/bookings", "POST", {
        kind, title, customerName, customerPhone, scheduledDate, scheduledTime,
        fulfillment, address, guestCount: Number(guestCount), theme, responsible,
        deliveryFeeCents, depositCents, notes, items: normalized,
      });
      await onCreated(); notify(kind === "event" ? "Evento registrado." : "Encomenda registrada."); onClose();
    } catch (cause) { notify(errorText(cause)); }
    finally { setSubmitting(false); }
  }
  return <div className="admin-modal-backdrop" onMouseDown={onClose}><form className="admin-modal operations-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
    <div className="admin-modal-head"><div><span className="admin-overline">NOVO PLANEJAMENTO</span><h2>{kind === "event" ? "Registrar evento" : "Registrar encomenda"}</h2></div><button type="button" onClick={onClose}><X size={21} /></button></div>
    <div className="operations-form">
      <div className="operations-form-grid"><label>Nome do {kind === "event" ? "evento" : "pedido"}<input required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "event" ? "Aniversário de 15 anos" : "Bolo e cento de doces"} /></label>
        <label>Cliente<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
        <label>WhatsApp com DDD<input required value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
        <label>Responsável interno<input value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Quem acompanha esta entrega" /></label>
        <label>Data<input type="date" min={today()} required value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label>
        <label>Horário<input type="time" required value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
        {kind === "event" && <><label>Convidados<input type="number" min="1" required value={guestCount} onChange={(event) => setGuestCount(event.target.value)} /></label><label>Tema<input value={theme} onChange={(event) => setTheme(event.target.value)} /></label></>}
      </div>
      <div className="operations-receiving"><button type="button" className={fulfillment === "pickup" ? "active" : ""} onClick={() => setFulfillment("pickup")}>Retirada</button><button type="button" className={fulfillment === "delivery" ? "active" : ""} onClick={() => setFulfillment("delivery")}>Entrega</button></div>
      {fulfillment === "delivery" && <div className="operations-form-grid"><label className="operations-span-2">Endereço<input required value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>Taxa de entrega<input inputMode="decimal" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} /></label></div>}
      <div className="operations-items-head"><div><span className="admin-overline">ITENS CONTRATADOS</span><strong>Produtos e produção</strong></div><button type="button" onClick={() => setItems((current) => [...current, blankLine()])}><Plus size={16} /> Adicionar item</button></div>
      <div className="operations-item-editor">{items.map((line, index) => <div className="operations-item-row" key={index}>
        <label>Produto do catálogo<select value={line.productId} onChange={(event) => {
          const product = products.find((entry) => entry.id === event.target.value);
          updateLine(index, { productId: event.target.value, name: product?.name || line.name, price: product ? moneyText(product.priceCents) : line.price });
        }}><option value="">Item personalizado</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Descrição<input required value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} /></label>
        <label>Quantidade<input type="number" min="1" required value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
        <label>Preço unitário<input inputMode="decimal" required value={line.price} onChange={(event) => updateLine(index, { price: event.target.value })} /></label>
        <label className="operations-produce"><input type="checkbox" checked={line.produce} onChange={(event) => updateLine(index, { produce: event.target.checked })} /> Exige produção</label>
        {items.length > 1 && <button type="button" aria-label="Remover item" onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X size={17} /></button>}
      </div>)}</div>
      <div className="operations-form-grid"><label>Sinal já recebido<input inputMode="decimal" value={deposit} onChange={(event) => setDeposit(event.target.value)} /></label><label className="operations-span-2">Observações<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>
      <button className="admin-primary" disabled={busy || submitting} type="submit"><Save size={17} /> {submitting ? "Salvando…" : "Salvar e criar produção"}</button>
    </div>
  </form></div>;
}

function BookingCards({ entries, search, onOpen }: { entries: Booking[]; search: string; onOpen: (id: string) => void }) {
  const filtered = entries.filter((entry) => `${entry.code} ${entry.title} ${entry.customerName}`.toLowerCase().includes(search.toLowerCase()));
  if (!filtered.length) return <div className="operations-empty"><ClipboardCheck size={28} /><strong>Nenhum registro encontrado</strong><p>Crie o primeiro planejamento ou ajuste sua busca.</p></div>;
  return <div className="operations-booking-list">{filtered.map((entry) => {
    const done = entry.checklist.filter((item) => item.done).length;
    return <button key={entry.id} className="operations-booking-card" onClick={() => onOpen(entry.id)}>
      <div className="operations-card-date"><strong>{entry.scheduledDate.slice(8, 10)}</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${entry.scheduledDate}T12:00:00Z`)).replace(".", "")}</span><small>{entry.scheduledTime}</small></div>
      <div className="operations-card-copy"><span>{entry.code} · {statusLabels[entry.status]}</span><h3>{entry.title}</h3><p>{entry.customerName}{entry.kind === "event" ? ` · ${entry.guestCount} convidados` : ""}</p><div className="operations-progress"><i style={{ width: `${entry.checklist.length ? done / entry.checklist.length * 100 : 0}%` }} /></div><small>{done}/{entry.checklist.length} itens conferidos</small></div>
      <div className="operations-card-finance"><span>Saldo</span><strong>{formatPrice(entry.balanceCents)}</strong><small>de {formatPrice(entry.totalCents)}</small></div><ChevronRight size={19} />
    </button>;
  })}</div>;
}

function TaskEditor({ task, busy, onSave }: { task: ProductionTask; busy: boolean; onSave: (task: ProductionTask, quantity: number, responsible: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState(String(task.completedQuantity));
  const [responsible, setResponsible] = useState(task.responsible);
  useEffect(() => { setQuantity(String(task.completedQuantity)); setResponsible(task.responsible); }, [task.updatedAt]);
  const percent = task.targetQuantity ? Math.round(task.completedQuantity / task.targetQuantity * 100) : 0;
  return <div className={`production-task production-${task.status}`}><div className="production-task-head"><span>{task.bookingCode} · {shortDate(task.dueDate)} às {task.dueTime}</span><b>{taskLabels[task.status]}</b></div>
    <h3>{task.title}</h3><div className="production-progress"><i style={{ width: `${percent}%` }} /></div><small>{task.completedQuantity} de {task.targetQuantity} concluídos · {percent}%</small>
    {task.status !== "cancelled" && <div className="production-task-edit"><label>Produzidos<input type="number" min="0" max={task.targetQuantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Responsável<input value={responsible} onChange={(event) => setResponsible(event.target.value)} /></label><button className="admin-secondary" disabled={busy} onClick={() => onSave(task, Number(quantity), responsible)}><Save size={15} /> Atualizar</button></div>}
  </div>;
}

function BookingDetail({ booking, tasks, busy, onClose, onRefresh, notify }: {
  booking: Booking; tasks: ProductionTask[]; busy: string; onClose: () => void;
  onRefresh: () => Promise<void>; notify: (message: string) => void;
}) {
  const [payment, setPayment] = useState(moneyText(booking.balanceCents));
  const [method, setMethod] = useState("pix");
  async function changeStatus(status: BookingStatus) {
    try { await api(`planning/bookings/${booking.id}`, "PATCH", { expectedUpdatedAt: booking.updatedAt, status }); await onRefresh(); notify("Situação atualizada."); }
    catch (cause) { notify(errorText(cause)); }
  }
  async function toggle(item: Booking["checklist"][number]) {
    try { await api(`planning/bookings/${booking.id}/checklist/${item.id}`, "PATCH", { expectedUpdatedAt: booking.updatedAt, done: !item.done }); await onRefresh(); }
    catch (cause) { notify(errorText(cause)); }
  }
  async function addPayment(event: FormEvent) {
    event.preventDefault(); const amountCents = parseMoney(payment);
    if (!amountCents) { notify("Informe um valor de pagamento válido."); return; }
    try { await api(`planning/bookings/${booking.id}/payments`, "POST", { expectedUpdatedAt: booking.updatedAt, amountCents, method, paidAt: today() }); await onRefresh(); notify("Pagamento registrado."); }
    catch (cause) { notify(errorText(cause)); }
  }
  return <div className="admin-modal-backdrop" onMouseDown={onClose}><div className="admin-modal operations-detail" onMouseDown={(event) => event.stopPropagation()}>
    <div className="admin-modal-head"><div><span className="admin-overline">{booking.code}</span><h2>{booking.title}</h2></div><button onClick={onClose}><X size={21} /></button></div>
    <div className="operations-detail-body">
      <div className="operations-detail-top"><div><CalendarDays size={19} /><span>Data</span><strong>{shortDate(booking.scheduledDate)} às {booking.scheduledTime}</strong></div><div><UserRound size={19} /><span>Cliente</span><strong>{booking.customerName}</strong><small>{booking.customerPhone}</small></div><div><MapPin size={19} /><span>Recebimento</span><strong>{booking.fulfillment === "pickup" ? "Retirada" : "Entrega"}</strong><small>{booking.address}</small></div></div>
      <label className="operations-status">Situação<select value={booking.status} onChange={(event) => changeStatus(event.target.value as BookingStatus)} disabled={Boolean(busy)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="operations-finance"><div><span>Total</span><strong>{formatPrice(booking.totalCents)}</strong></div><div><span>Recebido</span><strong>{formatPrice(booking.paidCents)}</strong></div><div><span>Saldo</span><strong>{formatPrice(booking.balanceCents)}</strong></div></div>
      {booking.balanceCents > 0 && booking.status !== "cancelled" && <form className="operations-payment" onSubmit={addPayment}><label>Registrar recebimento<input inputMode="decimal" value={payment} onChange={(event) => setPayment(event.target.value)} /></label><label>Forma<select value={method} onChange={(event) => setMethod(event.target.value)}>{Object.entries(paymentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="admin-primary"><CircleDollarSign size={16} /> Registrar</button></form>}
      <section><span className="admin-overline">ITENS CONTRATADOS</span><div className="operations-detail-items">{booking.items.map((item) => <div key={item.id}><span><strong>{item.quantity} × {item.name}</strong><small>{item.produce ? "Entra na produção" : "Item de revenda"}</small></span><b>{formatPrice(item.totalCents)}</b></div>)}</div></section>
      <section><span className="admin-overline">CHECKLIST OPERACIONAL</span><div className="operations-checklist">{booking.checklist.map((item) => <button key={item.id} className={item.done ? "done" : ""} onClick={() => toggle(item)}><span>{item.done && <Check size={14} />}</span>{item.label}</button>)}</div></section>
      <section><span className="admin-overline">PRODUÇÃO VINCULADA</span><div className="operations-linked-tasks">{tasks.length ? tasks.map((task) => <div key={task.id}><Factory size={16} /><span><strong>{task.title}</strong><small>{task.completedQuantity}/{task.targetQuantity} · {taskLabels[task.status]}</small></span></div>) : <p>Este registro não possui itens de produção.</p>}</div></section>
      {booking.notes && <section><span className="admin-overline">OBSERVAÇÕES</span><p className="operations-notes">{booking.notes}</p></section>}
      {!!booking.payments.length && <section><span className="admin-overline">PAGAMENTOS</span><div className="operations-payments">{booking.payments.map((entry) => <div key={entry.id}><span>{shortDate(entry.paidAt)} · {paymentLabels[entry.method] || entry.method}</span><strong>{formatPrice(entry.amountCents)}</strong></div>)}</div></section>}
    </div>
  </div></div>;
}

function Agenda({ entries, onOpen }: { entries: AgendaEntry[]; onOpen: (id: string) => void }) {
  const groups = useMemo(() => entries.reduce<Record<string, AgendaEntry[]>>((result, entry) => {
    (result[entry.date] ||= []).push(entry); return result;
  }, {}), [entries]);
  if (!entries.length) return <div className="operations-empty"><CalendarDays size={28} /><strong>Agenda livre</strong><p>Os próximos compromissos aparecerão aqui.</p></div>;
  return <div className="operations-agenda">{Object.entries(groups).map(([date, items]) => <section key={date}><div className="operations-agenda-date"><strong>{date === today() ? "Hoje" : shortDate(date)}</strong><span>{items.length} compromissos</span></div><div>{items.map((entry) => <button key={entry.id} onClick={() => onOpen(entry.bookingId)}><time>{entry.time}</time><span className={`agenda-icon agenda-${entry.kind}`}>{entry.kind === "production" ? <Factory size={17} /> : entry.kind === "event" ? <PartyPopper size={17} /> : <PackageCheck size={17} />}</span><span><strong>{entry.title}</strong><small>{entry.detail}</small></span><ChevronRight size={17} /></button>)}</div></section>)}</div>;
}

export default function OperationsApp({ section, products, notify }: { section: OperationsSection; products: Product[]; notify: (message: string) => void }) {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  async function refresh() { setData(await api<PlanningData>("planning")); }
  useEffect(() => { let live = true; setLoading(true); api<PlanningData>("planning").then((value) => { if (live) setData(value); }).catch((cause) => { if (live) notify(errorText(cause)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, []);
  const selected = data?.bookings.find((entry) => entry.id === selectedId);
  async function saveTask(task: ProductionTask, completedQuantity: number, responsible: string) {
    if (!Number.isSafeInteger(completedQuantity) || completedQuantity < 0 || completedQuantity > task.targetQuantity) { notify("Informe uma quantidade válida."); return; }
    setBusy(task.id); try { await api(`planning/tasks/${task.id}`, "PATCH", { expectedUpdatedAt: task.updatedAt, completedQuantity, responsible }); await refresh(); notify("Produção atualizada."); } catch (cause) { notify(errorText(cause)); } finally { setBusy(""); }
  }
  if (loading && !data) return <div className="operations-loading"><RefreshCw size={21} /> Carregando planejamento...</div>;
  if (!data) return null;
  const isList = section === "bookings" || section === "events";
  const entries = data.bookings.filter((entry) => entry.kind === (section === "events" ? "event" : "order"));
  return <div className="admin-page-stack">
    <PageHead section={section} onCreate={isList ? () => setCreating(true) : undefined} />
    <Summary data={data} />
    {isList && <><div className="operations-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, cliente ou nome" /></div><BookingCards entries={entries} search={search} onOpen={setSelectedId} /></>}
    {section === "production" && <div className="operations-production-grid">{data.tasks.length ? data.tasks.map((task) => <TaskEditor key={task.id} task={task} busy={busy === task.id} onSave={saveTask} />) : <div className="operations-empty"><Factory size={28} /><strong>Nenhuma produção planejada</strong><p>Itens marcados como produção nas encomendas e eventos aparecerão aqui.</p></div>}</div>}
    {section === "agenda" && <Agenda entries={data.agenda} onOpen={setSelectedId} />}
    {creating && <CreateBooking kind={section === "events" ? "event" : "order"} products={products} busy={Boolean(busy)} onClose={() => setCreating(false)} onCreated={refresh} notify={notify} />}
    {selected && <BookingDetail booking={selected} tasks={data.tasks.filter((task) => task.bookingId === selected.id)} busy={busy} onClose={() => setSelectedId("")} onRefresh={refresh} notify={notify} />}
  </div>;
}
