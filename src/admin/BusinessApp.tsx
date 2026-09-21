import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight, ArrowUpRight, Check, CircleAlert, Download, FileText,
  PackagePlus, Plus, RefreshCw, RotateCcw, Save, Search, Truck,
  Warehouse, X,
} from "lucide-react";
import { formatPrice, type Product } from "../catalog";
import { api } from "./api";
import "./business.css";

export type BusinessSection =
  "finance" | "costing" | "purchases" | "suppliers" | "distribution" | "expenses";

type Supplier = {
  id: string; name: string; contact: string; notes: string; active: boolean;
  createdAt: string; updatedAt: string;
};
type Material = {
  id: string; name: string; unit: "g" | "ml" | "un"; active: boolean;
  createdAt: string; updatedAt: string;
};
type Purchase = {
  id: string; supplierId: string; materialId: string; quantityMilli: number;
  totalCents: number; purchasedAt: string; reference: string; notes: string;
  voidedAt: string | null; voidReason?: string;
};
type Expense = {
  id: string; description: string; category: string; amountCents: number;
  spentAt: string; supplierId: string; notes: string;
  voidedAt: string | null; voidReason?: string;
};
type Costing = {
  productId: string; mode: "manual" | "recipe"; manualCostCents: number | null;
  extraCostCents: number; ingredients: { materialId: string; quantityMilli: number }[];
  updatedAt: string;
};
type ProductCost = {
  productId: string; unitCostCents: number | null; unitProfitCents: number | null;
  marginPercent: number | null; mode: "manual" | "recipe" | null;
};
type Distribution = {
  id: string; number: string; createdAt: string; updatedAt: string;
  customerName: string; address: string; status: string; paymentStatus: string;
  deliveryPartner: string; deliveryFeeCents: number | null;
  deliveryCostCents: number | null;
};
type BusinessData = {
  suppliers: Supplier[]; materials: Material[]; purchases: Purchase[];
  expenses: Expense[]; costings: Costing[];
  materialTotals: {
    materialId: string; purchasedQuantityMilli: number; purchasedCents: number;
    averageCentsPerMilli: number | null;
  }[];
  productCosts: ProductCost[];
  distributions: Distribution[];
  summary: {
    from: string; to: string; paidOrderCount: number;
    productRevenueCents: number; shippingRevenueCents: number; revenueCents: number;
    cogsCents: number; deliveryCostCents: number; purchaseCents: number;
    expenseCents: number; profitCents: number | null;
    cashAfterOutflowsCents: number | null; missingCostOrders: number;
    missingDeliveryCostOrders: number; estimatedCostOrders: number;
    sales: { productId: string; quantity: number; revenueCents: number }[];
  };
};

const day = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const field = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
};
const monthStart = () => `${day().slice(0, 7)}-01`;
const shortDate = (value: string) => value.split("-").reverse().join("/");
const amountText = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
const quantityText = (milli: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(milli / 1000);
function parseDecimal(value: string): number | null {
  const raw = value.trim().replace(/\s|R\$/g, "");
  const normalized = raw.includes(",") ? raw.replaceAll(".", "").replace(",", ".") : raw;
  const number = Number(normalized);
  return raw && Number.isFinite(number) && number >= 0 ? number : null;
}
function parseMoney(value: string): number | null {
  const number = parseDecimal(value);
  return number === null ? null : Math.round(number * 100);
}
function parseQuantity(value: string): number | null {
  const number = parseDecimal(value);
  return number === null ? null : Math.round(number * 1000);
}
function exportCsv(name: string, rows: (string | number)[][]) {
  const csv = "\uFEFF" + rows.map((row) =>
    row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"),
  ).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${day()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";

function PageHead({ overline, title, description, action }: {
  overline: string; title: string; description: string; action?: ReactNode;
}) {
  return <div className="admin-page-head business-page-head">
    <div><span className="admin-overline">{overline}</span><h2>{title}<span className="heading-dot">.</span></h2><p>{description}</p></div>
    {action}
  </div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="business-empty"><Warehouse size={25} /><strong>{title}</strong><p>{text}</p></div>;
}

function Metric({ label, value, detail, tone = "light" }: {
  label: string; value: string; detail: string; tone?: "light" | "peach" | "dark";
}) {
  return <div className={`business-metric business-metric-${tone}`}>
    <span>{label}</span><strong>{value}</strong><small>{detail}</small>
  </div>;
}

export function BusinessOverview({ onOpen, ordersRevision }: {
  onOpen: () => void; ordersRevision: string;
}) {
  const [summary, setSummary] = useState<BusinessData["summary"] | null>(null);
  useEffect(() => {
    let live = true;
    api<BusinessData>("business").then((value) => {
      if (live) setSummary(value.summary);
    }).catch(() => {});
    return () => { live = false; };
  }, [ordersRevision]);
  return <button className="business-overview-strip" onClick={onOpen}>
    <span><small>RESULTADO DO MÊS</small><strong>{summary
      ? summary.profitCents === null ? "A apurar" : formatPrice(summary.profitCents)
      : "Ver finanças"}</strong>
      <em>{summary && (summary.missingCostOrders || summary.missingDeliveryCostOrders)
        ? `${summary.missingCostOrders + summary.missingDeliveryCostOrders} pendências de custo`
        : "Receita, custos, compras e despesas em um só lugar"}</em></span>
    <span className="business-overview-link">Abrir finanças <ArrowUpRight size={18} /></span>
  </button>;
}

function Finance({ data, products, from, to, setFrom, setTo, onNavigate }: {
  data: BusinessData; products: Product[]; from: string; to: string;
  setFrom: (value: string) => void; setTo: (value: string) => void;
  onNavigate: (tab: BusinessSection) => void;
}) {
  const s = data.summary;
  const missing = s.missingCostOrders + s.missingDeliveryCostOrders;
  const current = new Map(data.productCosts.map((entry) => [entry.productId, entry]));
  const sales = new Map(s.sales.map((entry) => [entry.productId, entry]));
  function download() {
    exportCsv("street-doces-resultados", [
      ["Período", `${from} a ${to}`], ["Receita recebida", amountText(s.revenueCents)],
      ["Custo dos produtos vendidos", amountText(s.cogsCents)],
      ["Custo das entregas", amountText(s.deliveryCostCents)],
      ["Despesas operacionais", amountText(s.expenseCents)],
      ["Lucro operacional", s.profitCents === null ? "Incompleto" : amountText(s.profitCents)],
      ["Compras de insumos", amountText(s.purchaseCents)],
      ["Fluxo líquido do período", s.cashAfterOutflowsCents === null ? "Incompleto" : amountText(s.cashAfterOutflowsCents)],
      ["Pedidos sem custo", s.missingCostOrders],
      ["Entregas sem custo do parceiro", s.missingDeliveryCostOrders],
      ["Pedidos com custo estimado", s.estimatedCostOrders],
    ]);
  }
  return <div className="admin-page-stack">
    <PageHead overline="RESULTADOS DA OPERAÇÃO" title="Finanças" description="Recebimentos, custos e margem de cada doce, no mesmo período."
      action={<button className="admin-secondary" onClick={download}><Download size={17} /> Exportar CSV</button>} />
    <div className="business-filter-bar">
      <div><span className="admin-overline">PERÍODO</span><strong>Filtrar resultados</strong></div>
      <label>De <input type="date" value={from} max={to} onChange={(event) => { if (event.target.value) setFrom(event.target.value); }} /></label>
      <label>Até <input type="date" value={to} min={from} onChange={(event) => { if (event.target.value) setTo(event.target.value); }} /></label>
      <span>{s.paidOrderCount} pedidos pagos</span>
    </div>
    <div className="business-period-shortcuts" aria-label="Períodos rápidos">
      <button onClick={() => { setFrom(monthStart()); setTo(day()); }}>Este mês</button>
      <button onClick={() => { setFrom(`${day().slice(0, 4)}-01-01`); setTo(day()); }}>Este ano</button>
      <button onClick={() => { setFrom("1900-01-01"); setTo(day()); }}>Todo o histórico</button>
    </div>
    <section className="business-profit-panel">
      <div><span className="admin-overline">LUCRO OPERACIONAL · {shortDate(from)} A {shortDate(to)}</span>
        <strong>{s.profitCents === null ? "A apurar" : formatPrice(s.profitCents)}</strong>
        <p>Receita recebida − custo dos doces vendidos − custo dos parceiros − despesas operacionais.</p>
      </div>
      <div className="business-profit-side">
        {missing ? <><CircleAlert size={22} /><strong>{missing} pendências de custo</strong>
          <p>Preencha a ficha de custo dos produtos e o valor real das entregas para fechar o lucro.</p>
          <button onClick={() => onNavigate(s.missingCostOrders ? "costing" : "distribution")}>Resolver pendências <ArrowRight size={16} /></button></>
          : <><Check size={22} /><strong>Custos cobertos no período</strong><p>O resultado inclui os custos registrados pela equipe.</p></>}
      </div>
    </section>
    <div className="business-metrics-grid">
      <Metric label="Receita recebida" value={formatPrice(s.revenueCents)} detail="Produtos + frete de pedidos pagos" tone="peach" />
      <Metric label="Custo dos doces" value={formatPrice(s.cogsCents)} detail="Custo unitário × quantidade vendida" />
      <Metric label="Custo das entregas" value={formatPrice(s.deliveryCostCents)} detail="Valor pago aos parceiros" />
      <Metric label="Despesas" value={formatPrice(s.expenseCents)} detail="Gastos operacionais registrados" />
      <Metric label="Compras de insumos" value={formatPrice(s.purchaseCents)} detail="Saída de caixa; não descontada duas vezes do lucro" />
      <Metric label="Fluxo líquido do período" value={s.cashAfterOutflowsCents === null ? "A apurar" : formatPrice(s.cashAfterOutflowsCents)} detail="Recebimentos − compras − entregas − despesas" tone="dark" />
    </div>
    {s.estimatedCostOrders > 0 && <div className="business-callout"><CircleAlert size={19} />
      {s.estimatedCostOrders} {s.estimatedCostOrders === 1 ? "pedido antigo usa o custo atual como estimativa porque não tinha" : "pedidos antigos usam o custo atual como estimativa porque não tinham"} custo gravado na venda.
    </div>}
    <section className="admin-panel">
      <div className="panel-heading"><div><span className="admin-overline">PREÇO X CUSTO</span><h3>Margem por produto</h3></div>
        <button className="admin-text-button" onClick={() => onNavigate("costing")}>Editar custos <ArrowUpRight size={17} /></button></div>
      <div className="admin-table-wrap"><table className="admin-table business-table"><thead><tr>
        <th>Produto</th><th>Preço</th><th>Custo unitário</th><th>Lucro por unidade</th><th>Margem</th><th>Vendidos no período</th>
      </tr></thead><tbody>{products.map((product) => {
        const cost = current.get(product.id);
        const margin = cost?.marginPercent;
        return <tr key={product.id}><td><strong>{product.name}</strong></td><td>{formatPrice(product.priceCents)}</td>
          <td>{cost?.unitCostCents == null ? <span className="business-missing">Sem custo</span> : formatPrice(cost.unitCostCents)}</td>
          <td>{cost?.unitProfitCents == null ? "—" : formatPrice(cost.unitProfitCents)}</td>
          <td>{margin == null ? "—" : <span className={margin < 0 ? "business-negative" : "business-positive"}>{margin.toFixed(1).replace(".", ",")}%</span>}</td>
          <td>{sales.get(product.id)?.quantity || 0}</td></tr>;
      })}</tbody></table></div>
    </section>
    <div className="business-footnote">A margem usa (preço − custo) ÷ preço. Compras abastecem os insumos e entram no caixa; o custo do que foi vendido entra no lucro.</div>
  </div>;
}

type VoidTarget = { kind: "purchases" | "expenses"; id: string; label: string };
type SaveFn = <T = unknown>(key: string, path: string, method: string, payload: unknown, after?: () => void) => Promise<T | null>;

export default function BusinessApp({ section, products, ordersRevision, onNavigate, onOrdersChanged, onOpenOrder, notify }: {
  section: BusinessSection; products: Product[];
  ordersRevision: string;
  onNavigate: (tab: BusinessSection) => void;
  onOrdersChanged: () => Promise<void>;
  onOpenOrder: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<BusinessData | null>(null);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(day);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [voidReason, setVoidReason] = useState("");
  async function refresh() {
    const value = await api<BusinessData>(`business?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    setData(value);
  }
  useEffect(() => {
    let live = true;
    setLoading(true);
    api<BusinessData>(`business?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((value) => { if (live) setData(value); })
      .catch((cause) => { if (live) notify(errorText(cause)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [from, to, ordersRevision]);
  async function save<T>(key: string, path: string, method: string, payload: unknown, after?: () => void): Promise<T | null> {
    setBusy(key);
    try {
      const response = await api<T>(path, method, payload);
      await refresh();
      after?.();
      notify("Registro salvo.");
      return response;
    } catch (cause) {
      notify(errorText(cause));
      return null;
    } finally {
      setBusy("");
    }
  }
  async function voidEntry(event: FormEvent) {
    event.preventDefault();
    if (!voidTarget) return;
    const done = await save("void", `business/${voidTarget.kind}/${voidTarget.id}/void`, "PATCH", { reason: voidReason });
    if (done) { setVoidTarget(null); setVoidReason(""); }
  }
  if (loading && !data) return <div className="business-loading"><RefreshCw size={22} /> Carregando gestão...</div>;
  if (!data) return <EmptyState title="Dados indisponíveis" text="Atualize a página para tentar novamente." />;
  return <>
    {section === "finance" && <Finance data={data} products={products} from={from} to={to} setFrom={setFrom} setTo={setTo} onNavigate={onNavigate} />}
    {section === "costing" && <Costing data={data} products={products} busy={busy} save={save} notify={notify} />}
    {section === "purchases" && <Purchases data={data} busy={busy} save={save} notify={notify} onVoid={setVoidTarget} />}
    {section === "suppliers" && <Suppliers data={data} busy={busy} save={save} />}
    {section === "distribution" && <DistributionPage data={data} busy={busy} notify={notify} onOpenOrder={onOpenOrder}
      onSave={async (entry, deliveryPartner, deliveryCostCents) => {
        const done = await save("delivery-" + entry.id, `orders/${entry.id}`, "PATCH", {
          expectedUpdatedAt: entry.updatedAt, deliveryPartner, deliveryCostCents,
        });
        if (done) await onOrdersChanged();
      }} />}
    {section === "expenses" && <Expenses data={data} busy={busy} save={save} notify={notify} onVoid={setVoidTarget} />}
    {voidTarget && <div className="admin-modal-backdrop" onMouseDown={() => setVoidTarget(null)}>
      <form className="admin-modal business-confirm" onMouseDown={(event) => event.stopPropagation()} onSubmit={voidEntry}>
        <div className="admin-modal-head"><div><span className="admin-overline">CORREÇÃO DE REGISTRO</span><h2>Anular lançamento</h2></div>
          <button type="button" onClick={() => setVoidTarget(null)} aria-label="Fechar"><X size={21} /></button></div>
        <div className="business-confirm-body"><p><strong>{voidTarget.label}</strong> permanecerá no histórico como anulado e deixará de entrar nos cálculos.</p>
          <label>Motivo da anulação <textarea required minLength={3} maxLength={200} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label>
          <button className="admin-primary" type="submit" disabled={busy === "void"}>{busy === "void" ? "Anulando…" : "Confirmar anulação"}</button></div>
      </form></div>}
  </>;
}

function Costing({ data, products, busy, save, notify }: {
  data: BusinessData; products: Product[]; busy: string; save: SaveFn; notify: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(products[0]?.id || "");
  const current = data.costings.find((entry) => entry.productId === selectedId);
  const product = products.find((entry) => entry.id === selectedId);
  const calculated = data.productCosts.find((entry) => entry.productId === selectedId);
  const [mode, setMode] = useState<"manual" | "recipe">("manual");
  const [manual, setManual] = useState("");
  const [extra, setExtra] = useState("0,00");
  const [ingredients, setIngredients] = useState<{ materialId: string; quantity: string }[]>([]);
  useEffect(() => {
    setMode(current?.mode || "manual");
    setManual(amountText(current?.manualCostCents));
    setExtra(amountText(current?.extraCostCents ?? 0));
    setIngredients(current?.ingredients.map((entry) => ({
      materialId: entry.materialId,
      quantity: String(entry.quantityMilli / 1000).replace(".", ","),
    })) || []);
  }, [selectedId, current?.updatedAt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!product) return;
    if (mode === "manual") {
      const manualCostCents = parseMoney(manual);
      if (manualCostCents === null) { notify("Informe um custo unitário válido."); return; }
      await save("costing", `business/costings/${product.id}`, "PUT", {
        expectedUpdatedAt: current?.updatedAt,
        mode, manualCostCents,
      });
    } else {
      const extraCostCents = parseMoney(extra);
      const lines = ingredients.map((entry) => ({
        materialId: entry.materialId,
        quantityMilli: parseQuantity(entry.quantity),
      }));
      if (extraCostCents === null || !lines.length || lines.some((entry) => !entry.materialId || !entry.quantityMilli)) {
        notify("Confira os insumos e as quantidades da ficha técnica."); return;
      }
      await save("costing", `business/costings/${product.id}`, "PUT", {
        expectedUpdatedAt: current?.updatedAt,
        mode, extraCostCents, ingredients: lines,
      });
    }
  }
  const margins = new Map(data.productCosts.map((entry) => [entry.productId, entry]));
  const totals = new Map(data.materialTotals.map((entry) => [entry.materialId, entry]));
  return <div className="admin-page-stack">
    <PageHead overline="FICHA TÉCNICA" title="Custos e margens" description="Defina o custo de cada doce manualmente ou pelos insumos usados em uma unidade." />
    <div className="business-two-column business-costing-layout">
      <section className="admin-panel business-product-list">
        <div className="panel-heading"><div><span className="admin-overline">CARDÁPIO</span><h3>Escolha um produto</h3></div></div>
        {products.map((entry) => {
          const cost = margins.get(entry.id);
          return <button className={selectedId === entry.id ? "business-product-option active" : "business-product-option"}
            key={entry.id} onClick={() => setSelectedId(entry.id)}>
            <img src={entry.image} alt="" /><span><strong>{entry.name}</strong><small>{formatPrice(entry.priceCents)} · {cost?.unitCostCents == null ? "Custo pendente" : `Custo ${formatPrice(cost.unitCostCents)}`}</small></span>
            <b>{cost?.marginPercent == null ? "—" : `${cost.marginPercent.toFixed(1).replace(".", ",")}%`}</b>
          </button>;
        })}
      </section>
      <section className="admin-panel business-editor-panel">
        <div className="panel-heading"><div><span className="admin-overline">CUSTO POR UNIDADE</span><h3>{product?.name || "Selecione um produto"}</h3></div></div>
        {product && <form className="business-form" onSubmit={submit}>
          <div className="business-mode-switch">
            <button type="button" className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>Custo direto</button>
            <button type="button" className={mode === "recipe" ? "active" : ""} onClick={() => setMode("recipe")}>Ficha de insumos</button>
          </div>
          {mode === "manual" ? <>
            <p className="business-form-note">Informe o custo completo de ingredientes, embalagem e mão de obra para fazer uma unidade.</p>
            <label>Custo unitário (R$)<input required inputMode="decimal" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Ex.: 3,20" /></label>
          </> : <>
            <p className="business-form-note">A ficha usa o custo médio das compras registradas. Informe a quantidade de cada insumo usada em uma unidade.</p>
            {ingredients.map((entry, index) => {
              const material = data.materials.find((item) => item.id === entry.materialId);
              const average = totals.get(entry.materialId)?.averageCentsPerMilli;
              return <div className="business-recipe-row" key={index}>
                <label>Insumo<select required value={entry.materialId} onChange={(event) => setIngredients(ingredients.map((line, i) => i === index ? { ...line, materialId: event.target.value } : line))}>
                  <option value="">Selecione</option>{data.materials.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                </select></label>
                <label>Qtd. ({material?.unit || "un"})<input required inputMode="decimal" value={entry.quantity} onChange={(event) => setIngredients(ingredients.map((line, i) => i === index ? { ...line, quantity: event.target.value } : line))} placeholder="Ex.: 50" /></label>
                <button type="button" onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))} aria-label="Remover insumo"><X size={17} /></button>
                {entry.materialId && average == null && <small className="business-missing">Registre uma compra deste insumo para calcular o custo.</small>}
              </div>;
            })}
            <button className="business-inline-button" type="button" onClick={() => setIngredients([...ingredients, { materialId: "", quantity: "" }])}>
              <Plus size={16} /> Adicionar insumo
            </button>
            <label>Embalagem e outros custos por unidade (R$)<input required inputMode="decimal" value={extra} onChange={(event) => setExtra(event.target.value)} /></label>
            {!data.materials.length && <div className="business-callout"><CircleAlert size={17} />Cadastre insumos e compras antes de montar a ficha.</div>}
          </>}
          <div className="business-cost-preview"><span>Preço {formatPrice(product.priceCents)}</span><span>Custo apurado {calculated?.unitCostCents == null ? "—" : formatPrice(calculated.unitCostCents)}</span>
            <strong>Margem atual {calculated?.marginPercent == null ? "—" : `${calculated.marginPercent.toFixed(1).replace(".", ",")}%`}</strong></div>
          <button className="admin-primary" type="submit" disabled={busy === "costing"}>{busy === "costing" ? "Salvando…" : "Salvar custo"} <Save size={17} /></button>
        </form>}
      </section>
    </div>
    <div className="business-footnote">O custo de cada novo pedido é gravado quando o cliente finaliza a compra. Alterações posteriores na ficha não mudam o histórico desses pedidos.</div>
  </div>;
}

function Suppliers({ data, busy, save }: { data: BusinessData; busy: string; save: SaveFn }) {
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [query, setQuery] = useState("");
  function open(entry: Supplier) {
    setEditing(entry); setName(entry.name); setContact(entry.contact); setNotes(entry.notes); setActive(entry.active);
  }
  function clear() { setEditing(null); setName(""); setContact(""); setNotes(""); setActive(true); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await save("supplier", editing ? `business/suppliers/${editing.id}` : "business/suppliers",
      editing ? "PUT" : "POST", { name, contact, notes, active, expectedUpdatedAt: editing?.updatedAt }, clear);
  }
  const visible = data.suppliers.filter((entry) => `${entry.name} ${entry.contact}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="admin-page-stack">
    <PageHead overline="REDE DE COMPRAS" title="Fornecedores" description="Contatos e histórico de compras ligados a cada parceiro." />
    <div className="business-two-column">
      <section className="admin-panel business-editor-panel"><div className="panel-heading"><div><span className="admin-overline">{editing ? "EDITAR CADASTRO" : "NOVO CADASTRO"}</span><h3>{editing ? editing.name : "Adicionar fornecedor"}</h3></div></div>
        <form className="business-form" onSubmit={submit}>
          <label>Nome do fornecedor<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Distribuidora Central" /></label>
          <label>Contato<input maxLength={100} value={contact} onChange={(event) => setContact(event.target.value)} placeholder="WhatsApp, e-mail ou nome do contato" /></label>
          <label>Observações<textarea rows={3} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Prazo, condição de pagamento, entrega..." /></label>
          <label className="business-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Fornecedor ativo para novas compras</label>
          <div className="business-form-actions">{editing && <button type="button" className="admin-secondary" onClick={clear}>Cancelar</button>}
            <button className="admin-primary" type="submit" disabled={busy === "supplier"}>{busy === "supplier" ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar fornecedor"} <Check size={17} /></button></div>
        </form></section>
      <section className="admin-panel"><div className="panel-heading"><div><span className="admin-overline">CADASTRADOS</span><h3>{data.suppliers.length} {data.suppliers.length === 1 ? "fornecedor" : "fornecedores"}</h3></div></div>
        <div className="business-search"><Search size={17} /><input aria-label="Buscar fornecedor" placeholder="Buscar fornecedor" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {visible.length ? <div className="business-card-list">{visible.map((entry) => {
          const spent = data.purchases.filter((purchase) => !purchase.voidedAt && purchase.supplierId === entry.id).reduce((sum, purchase) => sum + purchase.totalCents, 0);
          return <button className="business-list-card" key={entry.id} onClick={() => open(entry)}><span><strong>{entry.name}</strong><small>{entry.contact || "Sem contato"} · {entry.active ? "Ativo" : "Arquivado"}</small></span>
            <span><strong>{formatPrice(spent)}</strong><small>Compras registradas</small></span><ArrowUpRight size={18} /></button>;
        })}</div> : <EmptyState title="Nenhum fornecedor" text="Cadastre um fornecedor para registrar compras de insumos." />}
      </section>
    </div>
  </div>;
}

function Purchases({ data, busy, save, notify, onVoid }: {
  data: BusinessData; busy: string; save: SaveFn; notify: (message: string) => void; onVoid: (target: VoidTarget) => void;
}) {
  const [materialEditing, setMaterialEditing] = useState<Material | null>(null);
  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState<Material["unit"]>("g");
  const [materialActive, setMaterialActive] = useState(true);
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [total, setTotal] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(day);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const materialById = new Map(data.materials.map((entry) => [entry.id, entry]));
  const supplierById = new Map(data.suppliers.map((entry) => [entry.id, entry]));
  const totals = new Map(data.materialTotals.map((entry) => [entry.materialId, entry]));
  const activePurchases = data.purchases.filter((entry) => !entry.voidedAt);
  const allSpend = activePurchases.reduce((sum, entry) => sum + entry.totalCents, 0);
  function clearMaterial() { setMaterialEditing(null); setMaterialName(""); setUnit("g"); setMaterialActive(true); }
  async function saveMaterial(event: FormEvent) {
    event.preventDefault();
    await save("material", materialEditing ? `business/materials/${materialEditing.id}` : "business/materials",
      materialEditing ? "PUT" : "POST", {
        name: materialName, unit, active: materialActive, expectedUpdatedAt: materialEditing?.updatedAt,
      }, clearMaterial);
  }
  async function savePurchase(event: FormEvent) {
    event.preventDefault();
    const quantityMilli = parseQuantity(quantity);
    const totalCents = parseMoney(total);
    if (!quantityMilli || !totalCents) { notify("Informe uma quantidade e um valor maiores que zero."); return; }
    await save("purchase", "business/purchases", "POST", {
      supplierId, materialId, quantityMilli, totalCents, purchasedAt, reference, notes,
    }, () => { setQuantity(""); setTotal(""); setReference(""); setNotes(""); });
  }
  const filtered = data.purchases.filter((entry) =>
    `${materialById.get(entry.materialId)?.name} ${supplierById.get(entry.supplierId)?.name} ${entry.reference}`
      .toLowerCase().includes(query.toLowerCase()));
  function download() {
    exportCsv("street-doces-compras", [["Data", "Insumo", "Quantidade", "Unidade", "Fornecedor", "Valor", "Referência", "Situação"],
      ...data.purchases.map((entry) => [entry.purchasedAt,
        materialById.get(entry.materialId)?.name || "Insumo antigo", quantityText(entry.quantityMilli),
        materialById.get(entry.materialId)?.unit || "", supplierById.get(entry.supplierId)?.name || "Fornecedor antigo",
        amountText(entry.totalCents), entry.reference, entry.voidedAt ? "Anulada" : "Ativa"])]);
  }
  return <div className="admin-page-stack">
    <PageHead overline="ENTRADAS DE INSUMOS" title="Compras e insumos" description="Veja quanto foi comprado, de quem e a que custo. A quantidade aqui é comprada, não estoque disponível."
      action={<button className="admin-secondary" onClick={download}><Download size={17} /> Exportar CSV</button>} />
    <div className="business-metrics-grid business-short-metrics">
      <Metric label="Investido em insumos" value={formatPrice(allSpend)} detail="Todas as compras ativas" tone="peach" />
      <Metric label="Compras lançadas" value={String(activePurchases.length)} detail="Registros válidos" />
      <Metric label="Insumos cadastrados" value={String(data.materials.length)} detail="Unidades padronizadas" />
    </div>
    <div className="business-two-column">
      <section className="admin-panel business-editor-panel"><div className="panel-heading"><div><span className="admin-overline">COMPRA REALIZADA</span><h3>Registrar compra</h3></div><PackagePlus size={21} /></div>
        <form className="business-form" onSubmit={savePurchase}>
          <div className="business-form-grid">
            <label>Fornecedor<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecione</option>{data.suppliers.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            <label>Insumo<select required value={materialId} onChange={(event) => setMaterialId(event.target.value)}><option value="">Selecione</option>{data.materials.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.unit})</option>)}</select></label>
            <label>Quantidade ({materialById.get(materialId)?.unit || "g/ml/un"})<input required inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ex.: 1000" /></label>
            <label>Valor total pago (R$)<input required inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="Ex.: 25,90" /></label>
            <label>Data da compra<input required type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} /></label>
            <label>Nota ou referência<input value={reference} maxLength={80} onChange={(event) => setReference(event.target.value)} placeholder="Opcional" /></label>
          </div>
          <label>Observações<textarea rows={2} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Lote, validade, forma de pagamento..." /></label>
          {(!data.suppliers.some((entry) => entry.active) || !data.materials.some((entry) => entry.active)) &&
            <div className="business-callout"><CircleAlert size={17} /> Cadastre um fornecedor e um insumo ativos antes da primeira compra.</div>}
          <button className="admin-primary" type="submit" disabled={busy === "purchase"}>{busy === "purchase" ? "Salvando…" : "Registrar compra"} <Plus size={17} /></button>
        </form></section>
      <section className="admin-panel business-editor-panel"><div className="panel-heading"><div><span className="admin-overline">CADASTRO</span><h3>{materialEditing ? "Editar insumo" : "Novo insumo"}</h3></div><Warehouse size={21} /></div>
        <form className="business-form" onSubmit={saveMaterial}>
          <div className="business-form-grid"><label>Nome do insumo<input required minLength={2} maxLength={100} value={materialName} onChange={(event) => setMaterialName(event.target.value)} placeholder="Ex.: Chocolate em pó" /></label>
            <label>Unidade de compra e receita<select value={unit} onChange={(event) => setUnit(event.target.value as Material["unit"])}><option value="g">Gramas (g)</option><option value="ml">Mililitros (ml)</option><option value="un">Unidades (un)</option></select></label></div>
          <label className="business-check"><input type="checkbox" checked={materialActive} onChange={(event) => setMaterialActive(event.target.checked)} /> Disponível para novas compras</label>
          <div className="business-form-actions">{materialEditing && <button className="admin-secondary" type="button" onClick={clearMaterial}>Cancelar</button>}
            <button className="admin-primary" type="submit" disabled={busy === "material"}>{busy === "material" ? "Salvando…" : materialEditing ? "Salvar insumo" : "Adicionar insumo"} <Check size={17} /></button></div>
        </form>
        <div className="business-material-list">{data.materials.map((entry) => {
          const stats = totals.get(entry.id);
          return <button key={entry.id} onClick={() => {
            setMaterialEditing(entry); setMaterialName(entry.name); setUnit(entry.unit); setMaterialActive(entry.active);
          }}><span><strong>{entry.name}</strong><small>{entry.active ? "Ativo" : "Arquivado"} · comprado {quantityText(stats?.purchasedQuantityMilli || 0)} {entry.unit}</small></span>
            <span>{formatPrice(stats?.purchasedCents || 0)}</span><ArrowUpRight size={17} /></button>;
        })}</div>
      </section>
    </div>
    <section className="admin-panel"><div className="panel-heading"><div><span className="admin-overline">HISTÓRICO DE ENTRADAS</span><h3>Compras registradas</h3></div></div>
      <div className="business-search"><Search size={17} /><input aria-label="Buscar compras" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar insumo, fornecedor ou nota" /></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-table business-table"><thead><tr><th>Data</th><th>Insumo</th><th>Quantidade</th><th>Fornecedor</th><th>Valor pago</th><th>Referência</th><th></th></tr></thead>
        <tbody>{filtered.map((entry) => <tr key={entry.id} className={entry.voidedAt ? "business-voided" : ""}>
          <td>{shortDate(entry.purchasedAt)}</td><td><strong>{materialById.get(entry.materialId)?.name || "Insumo antigo"}</strong></td>
          <td>{quantityText(entry.quantityMilli)} {materialById.get(entry.materialId)?.unit || ""}</td>
          <td>{supplierById.get(entry.supplierId)?.name || "Fornecedor antigo"}</td><td><strong>{formatPrice(entry.totalCents)}</strong></td>
          <td>{entry.reference || "—"}{entry.voidedAt && <small>Anulada · {entry.voidReason}</small>}</td>
          <td>{!entry.voidedAt && <button className="business-text-danger" onClick={() => onVoid({ kind: "purchases", id: entry.id, label: `${materialById.get(entry.materialId)?.name || "Compra"} · ${formatPrice(entry.totalCents)}` })}><RotateCcw size={15} /> Anular</button>}</td>
        </tr>)}</tbody></table></div> : <EmptyState title="Nenhuma compra registrada" text="Lance a primeira compra para acompanhar preços e quantidades." />}
    </section>
  </div>;
}

const expenseLabels: Record<string, string> = {
  embalagem: "Embalagem", energia: "Energia e estrutura", marketing: "Marketing",
  transporte: "Transporte", taxas: "Taxas", outros: "Outros",
};
function Expenses({ data, busy, save, notify, onVoid }: {
  data: BusinessData; busy: string; save: SaveFn; notify: (message: string) => void; onVoid: (target: VoidTarget) => void;
}) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("embalagem");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(day);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const supplierById = new Map(data.suppliers.map((entry) => [entry.id, entry]));
  const active = data.expenses.filter((entry) => !entry.voidedAt);
  const total = active.reduce((sum, entry) => sum + entry.amountCents, 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoney(amount);
    if (!amountCents) { notify("Informe um valor de despesa maior que zero."); return; }
    await save("expense", "business/expenses", "POST", {
      description, category, amountCents, spentAt, supplierId, notes,
    }, () => { setDescription(""); setAmount(""); setNotes(""); });
  }
  const filtered = data.expenses.filter((entry) =>
    `${entry.description} ${entry.category} ${supplierById.get(entry.supplierId)?.name || ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="admin-page-stack">
    <PageHead overline="SAÍDAS OPERACIONAIS" title="Despesas" description="Registre gastos que não fazem parte do custo direto de cada doce." />
    <div className="business-metrics-grid business-short-metrics"><Metric label="Total registrado" value={formatPrice(total)} detail="Despesas ativas, todos os períodos" tone="peach" />
      <Metric label="Lançamentos" value={String(active.length)} detail="Corrigíveis por anulação" /></div>
    <div className="business-two-column"><section className="admin-panel business-editor-panel"><div className="panel-heading"><div><span className="admin-overline">NOVA SAÍDA</span><h3>Registrar despesa</h3></div><FileText size={21} /></div>
      <form className="business-form" onSubmit={submit}>
        <label>Descrição<input required minLength={3} maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Taxa da maquininha" /></label>
        <div className="business-form-grid"><label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(expenseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Valor pago (R$)<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex.: 18,50" /></label>
          <label>Data<input required type="date" value={spentAt} onChange={(event) => setSpentAt(event.target.value)} /></label>
          <label>Fornecedor, se houver<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Sem fornecedor</option>{data.suppliers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>
        <label>Observações<textarea rows={2} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className="admin-primary" type="submit" disabled={busy === "expense"}>{busy === "expense" ? "Salvando…" : "Registrar despesa"} <Plus size={17} /></button>
      </form></section>
      <section className="admin-panel"><div className="panel-heading"><div><span className="admin-overline">LANÇAMENTOS</span><h3>Histórico</h3></div></div>
        <div className="business-search"><Search size={17} /><input aria-label="Buscar despesas" placeholder="Buscar despesa ou categoria" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {filtered.length ? <div className="business-expense-list">{filtered.map((entry) => <div className={entry.voidedAt ? "business-expense business-voided" : "business-expense"} key={entry.id}>
          <div><strong>{entry.description}</strong><small>{shortDate(entry.spentAt)} · {expenseLabels[entry.category]}{entry.supplierId ? ` · ${supplierById.get(entry.supplierId)?.name || "Fornecedor antigo"}` : ""}</small>
            {entry.voidedAt && <small>Anulada: {entry.voidReason}</small>}</div>
          <b>{formatPrice(entry.amountCents)}</b>
          {!entry.voidedAt && <button className="business-text-danger" onClick={() => onVoid({ kind: "expenses", id: entry.id, label: `${entry.description} · ${formatPrice(entry.amountCents)}` })}>Anular</button>}
        </div>)}</div> : <EmptyState title="Nenhuma despesa" text="Lançamentos operacionais aparecem aqui." />}
      </section></div>
    <div className="business-footnote">Registre ingredientes e embalagens usados na ficha em “Compras e insumos”, e o parceiro em “Distribuição”. Não repita esses custos aqui.</div>
  </div>;
}

function DistributionCard({ entry, busy, notify, onSave, onOpenOrder }: {
  entry: Distribution; busy: string;
  notify: (message: string) => void;
  onSave: (entry: Distribution, partner: string, cost: number | null) => Promise<void>;
  onOpenOrder: (id: string) => void;
}) {
  const [partner, setPartner] = useState(entry.deliveryPartner);
  const [cost, setCost] = useState(amountText(entry.deliveryCostCents));
  useEffect(() => { setPartner(entry.deliveryPartner); setCost(amountText(entry.deliveryCostCents)); }, [entry.updatedAt]);
  const parsedCost = cost.trim() ? parseMoney(cost) : null;
  const difference = entry.deliveryFeeCents != null && parsedCost != null
    ? entry.deliveryFeeCents - parsedCost : null;
  return <article className="business-distribution-card">
    <div className="business-distribution-head"><div><span>{entry.number} · {shortDate(entry.createdAt.slice(0, 10))}</span><h3>{entry.customerName}</h3><p>{entry.address}</p></div>
      <button className="admin-text-button" onClick={() => onOpenOrder(entry.id)}>Ver pedido <ArrowUpRight size={16} /></button></div>
    <div className="business-distribution-data"><span>Status <strong>{entry.status === "dispatched" ? "Em rota" : entry.status === "completed" ? "Concluído" : entry.status === "cancelled" ? "Cancelado" : "A preparar"}</strong></span>
      <span>Frete cobrado <strong>{entry.deliveryFeeCents == null ? "Pendente" : formatPrice(entry.deliveryFeeCents)}</strong></span>
      <span>Diferença <strong className={difference != null && difference < 0 ? "business-negative" : ""}>{difference == null ? "—" : formatPrice(difference)}</strong></span></div>
    <div className="business-distribution-edit"><label>Parceiro<input value={partner} maxLength={80} placeholder="99, Uber ou outro" onChange={(event) => setPartner(event.target.value)} /></label>
      <label>Custo real (R$)<input inputMode="decimal" value={cost} placeholder="A lançar" onChange={(event) => setCost(event.target.value)} /></label>
      <button className="admin-secondary" disabled={busy === "delivery-" + entry.id} onClick={() => {
        if (cost.trim() && parsedCost === null) { notify("Informe um custo de entrega válido."); return; }
        void onSave(entry, partner, parsedCost);
      }}><Save size={16} /> {busy === "delivery-" + entry.id ? "Salvando…" : "Salvar entrega"}</button></div>
  </article>;
}

function DistributionPage({ data, busy, notify, onSave, onOpenOrder }: {
  data: BusinessData; busy: string;
  notify: (message: string) => void;
  onSave: (entry: Distribution, partner: string, cost: number | null) => Promise<void>;
  onOpenOrder: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = data.distributions.filter((entry) =>
    `${entry.number} ${entry.customerName} ${entry.deliveryPartner} ${entry.address}`.toLowerCase().includes(query.toLowerCase()));
  const paid = data.distributions.filter((entry) => entry.paymentStatus === "paid" && entry.status !== "cancelled");
  const missing = paid.filter((entry) => entry.deliveryCostCents == null).length;
  const totalFees = paid.reduce((sum, entry) => sum + (entry.deliveryFeeCents || 0), 0);
  const totalCost = paid.reduce((sum, entry) => sum + (entry.deliveryCostCents || 0), 0);
  return <div className="admin-page-stack">
    <PageHead overline="ENTREGAS DO CARDÁPIO" title="Distribuição" description="Acompanhe destino, parceiro, frete cobrado e custo real de cada entrega." />
    <div className="business-metrics-grid business-short-metrics"><Metric label="Entregas registradas" value={String(data.distributions.length)} detail="Pedidos com recebimento por entrega" tone="peach" />
      <Metric label="Custo por lançar" value={String(missing)} detail="Entregas pagas sem custo do parceiro" />
      <Metric label="Diferença dos fretes" value={missing ? "A apurar" : formatPrice(totalFees - totalCost)} detail="Fretes pagos − custo dos parceiros" /></div>
    <section className="admin-panel"><div className="panel-heading"><div><span className="admin-overline">PEDIDOS DE ENTREGA</span><h3>Roteiro e custos</h3></div><Truck size={22} /></div>
      <div className="business-search"><Search size={17} /><input aria-label="Buscar entregas" placeholder="Buscar pedido, cliente, endereço ou parceiro" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {visible.length ? <div className="business-distribution-list">{visible.map((entry) => <DistributionCard key={entry.id} entry={entry} busy={busy} notify={notify} onSave={onSave} onOpenOrder={onOpenOrder} />)}</div>
        : <EmptyState title="Nenhuma entrega" text="Pedidos de retirada ficam apenas na aba Pedidos." />}
    </section>
    <div className="business-footnote">O custo real é interno e pode ser lançado após a contratação do parceiro. O valor cobrado ao cliente é ajustado no pedido antes do Pix. Não lance o mesmo frete novamente em Despesas.</div>
  </div>;
}
