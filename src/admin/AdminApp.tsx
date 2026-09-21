import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  CircleDollarSign,
  Download,
  Factory,
  ExternalLink,
  Eye,
  EyeOff,
  Instagram,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  ReceiptText,
  SlidersHorizontal,
  Sparkles,
  Store,
  Truck,
  Users,
  UserRoundCheck,
  Warehouse,
  X,
} from "lucide-react";
import { formatPrice, type Product, type StoreSettings } from "../catalog";
import { api } from "./api";
import BusinessApp, { BusinessOverview, type BusinessSection } from "./BusinessApp";
import "./admin.css";

type Status =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "dispatched"
  | "completed"
  | "cancelled";
type PaymentStatus = "unpaid" | "review" | "paid" | "refunded";
type Order = {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  status: Status;
  paymentStatus: PaymentStatus;
  paymentReportedAt?: string;
  payerName?: string;
  customerId?: string;
  customer: { name: string; phone: string; email?: string };
  fulfillment: "pickup" | "delivery";
  address: string;
  notes: string;
  items: {
    productId: string;
    name: string;
    image: string;
    quantity: number;
    priceCents: number;
    totalCents: number;
  }[];
  subtotalCents: number;
  deliveryFeeCents: number | null;
  deliveryCostCents?: number | null;
  deliveryPartner: string;
  adminNotes: string;
  history: { at: string; label: string }[];
};
type Dashboard = {
  orders: Order[];
  products: Product[];
  settings: StoreSettings;
};
type Tab =
  "overview" | "orders" | "products" | "inventory" | "customers" | "settings" | BusinessSection;

const tabs: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Visão geral", icon: LayoutDashboard },
  { key: "orders", label: "Pedidos", icon: ShoppingBag },
  { key: "products", label: "Produtos", icon: Package },
  { key: "inventory", label: "Estoque", icon: Warehouse },
  { key: "customers", label: "Clientes", icon: Users },
  { key: "finance", label: "Finanças", icon: CircleDollarSign },
  { key: "costing", label: "Custos e margens", icon: Factory },
  { key: "purchases", label: "Compras e insumos", icon: PackageCheck },
  { key: "suppliers", label: "Fornecedores", icon: UserRoundCheck },
  { key: "distribution", label: "Distribuição", icon: Truck },
  { key: "expenses", label: "Despesas", icon: ReceiptText },
  { key: "settings", label: "Configurações", icon: Settings },
];
const statusLabels: Record<Status, string> = {
  new: "Novo",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  dispatched: "Em rota",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const paymentLabels: Record<PaymentStatus, string> = {
  unpaid: "Pendente",
  review: "Pix a conferir",
  paid: "Pago",
  refunded: "Reembolsado",
};
const dateTime = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
const dateOnly = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(date),
  );

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;
}
function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={status}>{statusLabels[status]}</Badge>;
}
function Empty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Package;
  title: string;
  description: string;
}) {
  return (
    <div className="admin-empty">
      <span>
        <Icon size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ email: string }>("login", "POST", {
        email,
        password,
      });
      onLogin(result.email);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-login">
      <div className="login-editorial">
        <a href="/" className="admin-back">
          <ArrowLeft size={17} /> Voltar para a loja
        </a>
        <div className="login-editorial-center">
          <span className="login-kicker">STREET DOCES / BACKSTAGE</span>
          <h1>
            O CORRE
            <br />
            ACONTECE
            <br />
            <i>AQUI.</i>
          </h1>
          <p>Um lugar para cuidar de cada pedido, cada doce e cada cliente.</p>
        </div>
        <div className="login-editorial-bottom">
          <span>BETIM, MG ✳ FEITO COM ATITUDE</span>
          <span>ÁREA RESTRITA / 01</span>
        </div>
        <div className="login-orbit" aria-hidden="true">
          ✳
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-form-wrap">
          <span className="admin-logo">
            <span>✳</span> STREET<span>DOCES</span>
          </span>
          <div className="login-copy">
            <span className="admin-overline">PAINEL DE GESTÃO</span>
            <h2>
              Bem-vindo
              <br />
              de volta.
            </h2>
            <p>Entre com seu acesso administrativo para continuar.</p>
          </div>
          <form onSubmit={submit} className="admin-form">
            <label htmlFor="admin-email">E-mail</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              placeholder="seu@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="admin-password">Senha</label>
            <div className="password-field">
              <input
                id="admin-password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {error && (
              <p className="admin-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="admin-primary login-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? "Entrando…" : "Entrar no painel"} <ArrowRight size={19} />
            </button>
          </form>
          <p className="login-help">Acesso exclusivo da equipe Street Doces.</p>
        </div>
      </div>
    </div>
  );
}

function Overview({
  data,
  setTab,
  setSelected,
  ordersRevision,
}: {
  data: Dashboard;
  setTab: (tab: Tab) => void;
  setSelected: (order: Order) => void;
  ordersRevision: string;
}) {
  const { orders, products } = data;
  const open = orders.filter(
    (order) => !["completed", "cancelled"].includes(order.status),
  );
  const newOrders = orders.filter((order) => order.status === "new").length;
  const reviewCount = orders.filter((order) => order.paymentStatus === "review").length;
  const paid = orders.filter(
    (order) => order.paymentStatus === "paid" && order.status !== "cancelled",
  );
  const revenue = paid.reduce(
    (sum, order) => sum + order.subtotalCents + (order.deliveryFeeCents || 0),
    0,
  );
  const low = products.filter(
    (product) =>
      product.active &&
      product.trackStock &&
      product.stock! <= product.lowStockThreshold!,
  );
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now - (6 - index) * 86400000);
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
        .format(day)
        .replace(".", ""),
      count: orders.filter((order) => order.createdAt.slice(0, 10) === key)
        .length,
    };
  });
  const max = Math.max(1, ...days.map((day) => day.count));
  return (
    <div className="admin-page-stack">
      <div className="overview-hero">
        <div>
          <span className="admin-overline">SEU PAINEL, SEU RITMO</span>
          <h2>
            O que está
            <br />
            <i>rolando hoje?</i>
          </h2>
          <p>Pedidos, sabores e operação em um só lugar.</p>
        </div>
        <span className="overview-hero-star">✳</span>
        <button className="admin-light-button" onClick={() => setTab("orders")}>
          Ver pedidos <ArrowUpRight size={18} />
        </button>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span>
            Pedidos em andamento <ShoppingBag size={18} />
          </span>
          <strong>{open.length.toString().padStart(2, "0")}</strong>
          <small>{newOrders} aguardando confirmação · {reviewCount} Pix para conferir</small>
        </div>
        <div className="metric">
          <span>
            Faturamento registrado <CreditCard size={18} />
          </span>
          <strong>{formatPrice(revenue)}</strong>
          <small>Pedidos marcados como pagos</small>
        </div>
        <div className="metric">
          <span>
            Total de pedidos <Package size={18} />
          </span>
          <strong>{orders.length.toString().padStart(2, "0")}</strong>
          <small>Desde o primeiro pedido</small>
        </div>
        <div className="metric">
          <span>
            Atenção ao estoque <Warehouse size={18} />
          </span>
          <strong>{low.length.toString().padStart(2, "0")}</strong>
          <small>
            {low.length
              ? "Produtos no limite ou esgotados"
              : "Tudo sob controle"}
          </small>
        </div>
      </div>
      <BusinessOverview onOpen={() => setTab("finance")} ordersRevision={ordersRevision} />
      <div className="overview-split">
        <section className="admin-panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="admin-overline">MOVIMENTO</span>
              <h3>Últimos 7 dias</h3>
            </div>
            <Badge>
              {
                orders.filter(
                  (order) =>
                    now - new Date(order.createdAt).getTime() < 7 * 86400000,
                ).length
              }{" "}
              pedidos
            </Badge>
          </div>
          <div className="mini-chart">
            {days.map((day) => (
              <div
                className="chart-day"
                key={day.key}
                title={`${day.count} pedido(s)`}
              >
                <span>{day.count || ""}</span>
                <div className="chart-track">
                  <div
                    style={{
                      height: `${Math.max(8, (day.count / max) * 100)}%`,
                    }}
                  />
                </div>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel attention-panel">
          <div className="panel-heading">
            <div>
              <span className="admin-overline">PRIORIDADES</span>
              <h3>Pra olhar agora</h3>
            </div>
            <Sparkles size={20} />
          </div>
          <button onClick={() => setTab("orders")}>
            <span className="attention-icon peach">
              <Bell size={20} />
            </span>
            <span>
              <strong>
                {newOrders} {newOrders === 1 ? "novo pedido" : "novos pedidos"}
              </strong>
              <small>Confira os detalhes e confirme com o cliente.</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <button onClick={() => setTab("inventory")}>
            <span className="attention-icon yellow">
              <Warehouse size={20} />
            </span>
            <span>
              <strong>{low.length} itens em atenção</strong>
              <small>Revise quantidades no controle de estoque.</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        </section>
      </div>
      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span className="admin-overline">ACOMPANHAMENTO</span>
            <h3>Pedidos recentes</h3>
          </div>
          <button
            className="admin-text-button"
            onClick={() => setTab("orders")}
          >
            Ver todos <ArrowRight size={17} />
          </button>
        </div>
        {orders.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id} onClick={() => setSelected(order)}>
                    <td>
                      <strong>{order.number}</strong>
                    </td>
                    <td>{order.customer.name}</td>
                    <td>{dateTime(order.createdAt)}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>
                      <strong>{formatPrice(order.subtotalCents)}</strong>
                    </td>
                    <td>
                      <ArrowUpRight size={17} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={ShoppingBag}
            title="Os pedidos vão aparecer aqui"
            description="Assim que um cliente registrar a primeira solicitação, ela entra nesta lista."
          />
        )}
      </section>
    </div>
  );
}

function Orders({
  orders,
  setSelected,
}: {
  orders: Order[];
  setSelected: (order: Order) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status | "review">("all");
  const visible = orders.filter(
    (order) =>
      (filter === "all" || (filter === "review" ? order.paymentStatus === "review" : order.status === filter)) &&
      `${order.number} ${order.customer.name} ${order.customer.phone}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function exportCsv() {
    const rows = [
      [
        "Pedido",
        "Data",
        "Cliente",
        "Telefone",
        "Recebimento",
        "Status",
        "Pagamento",
        "Subtotal",
        "Frete",
      ],
      ...visible.map((order) => [
        order.number,
        order.createdAt,
        order.customer.name,
        order.customer.phone,
        order.fulfillment === "pickup" ? "Retirada" : "Entrega",
        statusLabels[order.status],
        paymentLabels[order.paymentStatus],
        (order.subtotalCents / 100).toFixed(2),
        order.deliveryFeeCents == null
          ? ""
          : (order.deliveryFeeCents / 100).toFixed(2),
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `street-doces-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="admin-page-stack">
      <div className="admin-page-head">
        <div>
          <span className="admin-overline">GESTÃO DE VENDAS</span>
          <h2>
            Pedidos<span className="heading-dot">.</span>
          </h2>
          <p>Acompanhe cada pedido, do primeiro contato até a entrega.</p>
        </div>
        <button className="admin-secondary" onClick={exportCsv}>
          <Download size={18} /> Exportar CSV
        </button>
      </div>
      <section className="admin-panel order-list">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={18} />
            <input
              aria-label="Buscar pedidos"
              placeholder="Buscar por pedido, cliente ou telefone"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="select-wrap">
            <SlidersHorizontal size={17} />
            <select
              aria-label="Filtrar status"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as "all" | Status | "review")
              }
            >
              <option value="all">Todos os status</option>
              <option value="review">Pix a conferir</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
        {visible.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Produtos</th>
                  <th>Recebimento</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr key={order.id} onClick={() => setSelected(order)}>
                    <td>
                      <strong>{order.number}</strong>
                    </td>
                    <td>
                      <strong>{order.customer.name}</strong>
                      <small>{order.customer.phone}</small>
                    </td>
                    <td>
                      {order.items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}{" "}
                      itens
                    </td>
                    <td>
                      {order.fulfillment === "pickup" ? "Retirada" : "Entrega"}
                    </td>
                    <td>{dateTime(order.createdAt)}</td>
                    <td>
                      <StatusBadge status={order.status} />
                      {order.paymentStatus === "review" && <Badge tone="low">Pix a conferir</Badge>}
                    </td>
                    <td>
                      <strong>
                        {formatPrice(
                          order.subtotalCents + (order.deliveryFeeCents || 0),
                        )}
                      </strong>
                    </td>
                    <td>
                      <ArrowUpRight size={17} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={ShoppingBag}
            title="Nenhum pedido encontrado"
            description="Tente outro termo ou status para encontrar o que procura."
          />
        )}
      </section>
    </div>
  );
}

const emptyProduct: Product = {
  id: "",
  name: "",
  category: "Mousses",
  flavor: "",
  description: "",
  priceCents: 1000,
  image: "/images/miss-sensacao.webp",
  accent: "#f6b3ab",
  tag: "",
  active: true,
  trackStock: false,
  stock: 0,
  lowStockThreshold: 5,
};
function Products({
  products,
  refresh,
  notify,
}: {
  products: Product[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [priceText, setPriceText] = useState("");
  function open(product: Product) {
    setEditing({ ...product });
    setPriceText((product.priceCents / 100).toFixed(2).replace(".", ","));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const priceCents = Math.round(Number(priceText.replace(",", ".")) * 100);
      await api(
        editing.id ? `products/${editing.id}` : "products",
        editing.id ? "PUT" : "POST",
        { ...editing, priceCents },
      );
      await refresh();
      setEditing(null);
      notify("Produto salvo no cardápio.");
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function uploadImage(file: File) {
    if (!editing) return;
    if (file.size > 3 * 1024 * 1024) {
      notify("A foto precisa ter até 3 MB.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: form,
      });
      const result = await response
        .json()
        .catch(() => ({ error: "Falha ao enviar imagem." }));
      if (!response.ok)
        throw new Error(result.error || "Falha ao enviar imagem.");
      setEditing({ ...editing, image: result.url });
      notify("Imagem enviada. Salve o produto para publicar.");
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar a imagem.",
      );
    } finally {
      setUploading(false);
    }
  }
  const visible = products.filter((product) =>
    `${product.name} ${product.category} ${product.flavor}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="admin-page-stack">
      <div className="admin-page-head">
        <div>
          <span className="admin-overline">CARDÁPIO DA STREET</span>
          <h2>
            Produtos<span className="heading-dot">.</span>
          </h2>
          <p>Edite o que aparece na loja: nomes, fotos, preços e detalhes.</p>
        </div>
        <button className="admin-primary" onClick={() => open(emptyProduct)}>
          <Plus size={19} /> Novo produto
        </button>
      </div>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={18} />
            <input
              aria-label="Buscar produtos"
              placeholder="Buscar sabor ou categoria"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Badge>
            {products.filter((product) => product.active).length} ativos
          </Badge>
        </div>
        <div className="product-management-grid">
          {visible.map((product) => (
            <button
              className="management-product"
              key={product.id}
              onClick={() => open(product)}
            >
              <div
                className="management-product-image"
                style={{ backgroundColor: product.accent }}
              >
                <img src={product.image} alt="" />
              </div>
              <div className="management-product-copy">
                <span>
                  {product.category} · {product.active ? "Publicado" : "Oculto"}
                </span>
                <h3>{product.name}</h3>
                <p>{product.flavor}</p>
                <strong>{formatPrice(product.priceCents)}</strong>
              </div>
              <ArrowUpRight size={19} />
            </button>
          ))}
        </div>
        {!visible.length && (
          <Empty
            icon={Package}
            title="Nenhum produto encontrado"
            description="Crie um novo doce ou tente outra busca."
          />
        )}
      </section>
      {editing && (
        <div
          className="admin-modal-backdrop"
          onMouseDown={() => setEditing(null)}
        >
          <div
            className="admin-modal product-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-head">
              <div>
                <span className="admin-overline">CARDÁPIO / EDITAR</span>
                <h2 id="edit-title">
                  {editing.id ? "Editar produto" : "Novo produto"}
                </h2>
              </div>
              <button onClick={() => setEditing(null)} aria-label="Fechar">
                <X size={22} />
              </button>
            </div>
            <form onSubmit={save} className="editor-form">
              <div
                className="editor-preview"
                style={{ background: editing.accent }}
              >
                <img src={editing.image} alt="Prévia do produto" />
              </div>
              <div className="editor-fields">
                <label>
                  Nome
                  <input
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                    required
                    maxLength={80}
                  />
                </label>
                <div className="field-pair">
                  <label>
                    Categoria
                    <input
                      value={editing.category}
                      onChange={(event) =>
                        setEditing({ ...editing, category: event.target.value })
                      }
                      required
                      maxLength={40}
                    />
                  </label>
                  <label>
                    Preço (R$)
                    <input
                      inputMode="decimal"
                      value={priceText}
                      onChange={(event) => setPriceText(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <label>
                  Sabor
                  <input
                    value={editing.flavor}
                    onChange={(event) =>
                      setEditing({ ...editing, flavor: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Descrição
                  <textarea
                    value={editing.description}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        description: event.target.value,
                      })
                    }
                    rows={3}
                    required
                    maxLength={500}
                  />
                </label>
                <label>
                  Foto do produto
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                    }}
                  />
                  <small>
                    {uploading
                      ? "Enviando imagem…"
                      : "JPG, PNG ou WebP, até 3 MB."}
                  </small>
                </label>
                <label>
                  URL da imagem
                  <input
                    value={editing.image}
                    onChange={(event) =>
                      setEditing({ ...editing, image: event.target.value })
                    }
                    required
                  />
                  <small>Imagem enviada, /images/ ou URL HTTPS.</small>
                </label>
                <div className="field-pair">
                  <label>
                    Etiqueta
                    <input
                      value={editing.tag || ""}
                      onChange={(event) =>
                        setEditing({ ...editing, tag: event.target.value })
                      }
                      placeholder="Ex.: Queridinho"
                    />
                  </label>
                  <label>
                    Cor de apoio
                    <input
                      type="color"
                      value={editing.accent}
                      onChange={(event) =>
                        setEditing({ ...editing, accent: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="admin-switch-row">
                  <span>
                    <strong>Publicado na loja</strong>
                    <small>
                      Produtos ocultos deixam de aparecer para clientes.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={editing.active !== false}
                    onChange={(event) =>
                      setEditing({ ...editing, active: event.target.checked })
                    }
                  />
                </label>
                <div className="editor-actions">
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => setEditing(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="admin-primary"
                    disabled={saving || uploading}
                  >
                    {uploading
                      ? "Enviando foto…"
                      : saving
                        ? "Salvando…"
                        : "Salvar produto"}{" "}
                    <Check size={18} />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Inventory({
  products,
  refresh,
  notify,
}: {
  products: Product[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState<
    Record<
      string,
      { stock: number; lowStockThreshold: number; trackStock: boolean }
    >
  >({});
  const [busy, setBusy] = useState("");
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        products.map((product) => [
          product.id,
          {
            stock: product.stock || 0,
            lowStockThreshold: product.lowStockThreshold ?? 5,
            trackStock: product.trackStock || false,
          },
        ]),
      ),
    );
  }, [products]);
  async function save(id: string) {
    setBusy(id);
    try {
      await api(`inventory/${id}`, "PATCH", draft[id]);
      await refresh();
      notify("Estoque atualizado.");
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="admin-page-stack">
      <div className="admin-page-head">
        <div>
          <span className="admin-overline">CONTROLE DE DISPONIBILIDADE</span>
          <h2>
            Estoque<span className="heading-dot">.</span>
          </h2>
          <p>Defina quantidades disponíveis e receba alertas de reposição.</p>
        </div>
        <Badge tone="info">
          {products.filter((product) => product.trackStock).length} controlados
        </Badge>
      </div>
      <div className="inventory-note">
        <Warehouse size={20} />
        <p>
          O estoque é atualizado pela equipe. Pedidos entram como solicitação e
          não baixam unidades automaticamente; confirme disponibilidade antes de
          aceitar.
        </p>
      </div>
      <section className="admin-panel inventory-list">
        {products.map((product) => {
          const item = draft[product.id];
          if (!item) return null;
          const low = item.trackStock && item.stock <= item.lowStockThreshold;
          return (
            <div className="inventory-row" key={product.id}>
              <img src={product.image} alt="" />
              <div className="inventory-name">
                <strong>{product.name}</strong>
                <small>
                  {product.category} · {product.active ? "Publicado" : "Oculto"}
                </small>
              </div>
              <label className="inventory-track">
                <input
                  type="checkbox"
                  checked={item.trackStock}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [product.id]: {
                        ...item,
                        trackStock: event.target.checked,
                      },
                    })
                  }
                />{" "}
                Controlar
              </label>
              <label className="inventory-count">
                Em estoque
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={item.stock}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [product.id]: {
                        ...item,
                        stock: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="inventory-count">
                Alerta em
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={item.lowStockThreshold}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [product.id]: {
                        ...item,
                        lowStockThreshold: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              {low ? (
                <Badge tone="low">
                  {item.stock === 0 ? "Esgotado" : "Baixo"}
                </Badge>
              ) : (
                <Badge tone={item.trackStock ? "active" : "neutral"}>
                  {item.trackStock ? "Ok" : "Livre"}
                </Badge>
              )}
              <button
                className="admin-small-button"
                onClick={() => save(product.id)}
                disabled={busy === product.id}
              >
                {busy === product.id ? "…" : "Salvar"}
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Customers({ orders }: { orders: Order[] }) {
  const [query, setQuery] = useState("");
  const customers = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        phone: string;
        email?: string;
        id: string;
        orders: number;
        total: number;
        last: string;
      }
    >();
    orders.forEach((order) => {
      const key = order.customerId || order.customer.phone.replace(/\D/g, "");
      const old = map.get(key);
      map.set(key, {
        name: order.customer.name,
        phone: order.customer.phone,
        email: order.customer.email,
        id: key,
        orders: (old?.orders || 0) + 1,
        total: (old?.total || 0) + order.subtotalCents,
        last:
          old?.last && old.last > order.createdAt ? old.last : order.createdAt,
      });
    });
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [orders]);
  const visible = customers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.email || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="admin-page-stack">
      <div className="admin-page-head">
        <div>
          <span className="admin-overline">QUEM CHEGA JUNTO</span>
          <h2>
            Clientes<span className="heading-dot">.</span>
          </h2>
          <p>Histórico de quem já pediu um doce com a Street.</p>
        </div>
        <Badge tone="info">{customers.length} clientes</Badge>
      </div>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={18} />
            <input
              aria-label="Buscar clientes"
              placeholder="Buscar nome, e-mail ou telefone"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {visible.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>Pedidos</th>
                  <th>Valor solicitado</th>
                  <th>Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                      {customer.email && <small style={{ display: "block", marginTop: 4 }}>{customer.email}</small>}
                    </td>
                    <td>{customer.phone}</td>
                    <td>{customer.orders}</td>
                    <td>{formatPrice(customer.total)}</td>
                    <td>{dateOnly(customer.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Users}
            title="Sem clientes por aqui"
            description="Os clientes aparecem automaticamente quando fazem um pedido."
          />
        )}
      </section>
    </div>
  );
}

function StoreSettingsPage({
  settings,
  refresh,
  notify,
}: {
  settings: StoreSettings;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  function field<K extends keyof StoreSettings>(
    key: K,
    value: StoreSettings[K],
  ) {
    setDraft({ ...draft, [key]: value });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("settings", "PUT", draft);
      await refresh();
      notify("Configurações publicadas na loja.");
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-page-stack">
      <div className="admin-page-head">
        <div>
          <span className="admin-overline">O JEITO STREET DE VENDER</span>
          <h2>
            Configurações<span className="heading-dot">.</span>
          </h2>
          <p>Dados que ajudam o cliente a pedir sem dúvidas.</p>
        </div>
      </div>
      <form className="settings-grid" onSubmit={save}>
        <section className="admin-panel settings-panel">
          <div className="panel-heading">
            <div>
              <span className="admin-overline">01 / IDENTIDADE</span>
              <h3>Informações da loja</h3>
            </div>
            <Store size={21} />
          </div>
          <label>
            Nome da loja
            <input
              value={draft.storeName}
              onChange={(event) => field("storeName", event.target.value)}
              required
            />
          </label>
          <label>
            Frase da marca
            <input
              value={draft.tagline}
              onChange={(event) => field("tagline", event.target.value)}
            />
          </label>
          <label>
            Mensagem da faixa superior
            <input
              value={draft.announcement}
              onChange={(event) => field("announcement", event.target.value)}
            />
          </label>
          <label>
            Instagram
            <div className="field-with-icon">
              <Instagram size={18} />
              <input
                type="url"
                value={draft.instagramUrl}
                onChange={(event) => field("instagramUrl", event.target.value)}
                required
              />
            </div>
          </label>
          <label>
            WhatsApp da loja
            <input
              inputMode="tel"
              value={draft.whatsapp}
              onChange={(event) => field("whatsapp", event.target.value)}
              placeholder="5531999999999"
            />
            <small>
              Informe 13 dígitos com DDI e DDD. Deixe vazio enquanto o número
              não estiver confirmado.
            </small>
          </label>
        </section>
        <section className="admin-panel settings-panel">
          <div className="panel-heading">
            <div>
              <span className="admin-overline">02 / OPERAÇÃO</span>
              <h3>Pedidos e recebimento</h3>
            </div>
            <Truck size={21} />
          </div>
          <label className="admin-switch-row">
            <span>
              <strong>Receber novos pedidos</strong>
              <small>Quando desligado, a finalização fica pausada.</small>
            </span>
            <input
              type="checkbox"
              checked={draft.acceptsOrders}
              onChange={(event) => field("acceptsOrders", event.target.checked)}
            />
          </label>
          <label className="admin-switch-row">
            <span>
              <strong>Permitir retirada</strong>
              <small>O cliente escolhe buscar no endereço abaixo.</small>
            </span>
            <input
              type="checkbox"
              checked={draft.pickupEnabled}
              onChange={(event) => field("pickupEnabled", event.target.checked)}
            />
          </label>
          <label className="admin-switch-row">
            <span>
              <strong>Permitir entrega</strong>
              <small>Frete combinado pela equipe após o pedido.</small>
            </span>
            <input
              type="checkbox"
              checked={draft.deliveryEnabled}
              onChange={(event) =>
                field("deliveryEnabled", event.target.checked)
              }
            />
          </label>
          <label>
            Endereço para retirada
            <textarea
              rows={2}
              value={draft.pickupAddress}
              onChange={(event) => field("pickupAddress", event.target.value)}
              required
            />
          </label>
          <label>
            Chave Pix da loja (e-mail)
            <input
              type="email"
              value={draft.pixKey || ""}
              onChange={(event) => field("pixKey", event.target.value)}
              required
            />
            <small>Usada no QR Code e no Pix Copia e Cola após a confirmação do pedido. Confira se está vinculada à conta da loja.</small>
          </label>
          <label>
            Informação sobre a entrega
            <textarea
              rows={3}
              value={draft.deliveryNotice}
              onChange={(event) => field("deliveryNotice", event.target.value)}
            />
          </label>
          <div className="settings-save">
            <button className="admin-primary" type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar alterações"} <Check size={18} />
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}

function OrderDetail({
  order,
  onClose,
  refresh,
  notify,
}: {
  order: Order;
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(order);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(order), [order]);
  async function save() {
    setBusy(true);
    try {
      await api(`orders/${order.id}`, "PATCH", {
        expectedUpdatedAt: order.updatedAt,
        status: draft.status,
        paymentStatus: draft.paymentStatus,
        deliveryPartner: draft.deliveryPartner,
        deliveryFeeCents: draft.deliveryFeeCents,
        deliveryCostCents: draft.deliveryCostCents ?? null,
        adminNotes: draft.adminNotes,
      });
      await refresh();
      onClose();
      notify("Pedido atualizado.");
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  const contact = order.customer.phone.replace(/\D/g, "");
  return (
    <div className="admin-detail-backdrop" onMouseDown={onClose}>
      <aside
        className="order-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-head">
          <div>
            <span className="admin-overline">DETALHES DO PEDIDO</span>
            <h2 id="order-detail-title">{order.number}</h2>
            <p>{dateTime(order.createdAt)}</p>
          </div>
          <button aria-label="Fechar" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <div className="detail-scroll">
          <div className="detail-status-row">
            <StatusBadge status={order.status} />
            <Badge tone={order.paymentStatus === "paid" ? "active" : order.paymentStatus === "review" ? "low" : "neutral"}>
              {paymentLabels[order.paymentStatus]}
            </Badge>
          </div>
          {order.paymentStatus === "review" && (
            <section className="detail-section payment-review">
              <span className="admin-overline">PIX INFORMADO PELO CLIENTE</span>
              <h3>Confira o crédito na conta antes de marcar como pago.</h3>
              <p>Valor esperado: <strong>{formatPrice(order.subtotalCents + (order.fulfillment === "delivery" ? order.deliveryFeeCents || 0 : 0))}</strong></p>
              {order.payerName && <p>Nome informado por quem pagou: <strong>{order.payerName}</strong></p>}
              {order.paymentReportedAt && <p>Informado em {dateTime(order.paymentReportedAt)}</p>}
            </section>
          )}
          <section className="detail-section">
            <span className="admin-overline">CLIENTE</span>
            <h3>{order.customer.name}</h3>
            <p>{order.customer.phone}</p>
            {contact.length >= 10 && (
              <a
                href={`https://wa.me/${contact.startsWith("55") ? contact : `55${contact}`}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir conversa <ExternalLink size={15} />
              </a>
            )}
          </section>
          <section className="detail-section">
            <span className="admin-overline">RECEBIMENTO</span>
            <h3>
              {order.fulfillment === "pickup"
                ? "Retirada na loja"
                : "Entrega por parceiro"}
            </h3>
            {order.address && <p>{order.address}</p>}
            {order.notes && (
              <p>
                <strong>Observações:</strong> {order.notes}
              </p>
            )}
          </section>
          <section className="detail-section">
            <span className="admin-overline">ITENS DO PEDIDO</span>
            {order.items.map((item) => (
              <div className="detail-item" key={item.productId}>
                <img src={item.image} alt="" />
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.quantity} × {formatPrice(item.priceCents)}
                  </small>
                </div>
                <b>{formatPrice(item.totalCents)}</b>
              </div>
            ))}
            <div className="detail-totals">
              <span>Doces</span>
              <strong>{formatPrice(order.subtotalCents)}</strong>
              <span>Frete</span>
              <strong>
                {order.fulfillment === "pickup"
                  ? "Grátis"
                  : draft.deliveryFeeCents == null
                    ? "A confirmar"
                    : formatPrice(draft.deliveryFeeCents)}
              </strong>
              <span>Total</span>
              <strong>
                {formatPrice(
                  order.subtotalCents + (draft.deliveryFeeCents || 0),
                )}
              </strong>
            </div>
          </section>
          <section className="detail-section detail-edit">
            <span className="admin-overline">GERENCIAR</span>
            <div className="field-pair">
              <label>
                Status
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({ ...draft, status: event.target.value as Status })
                  }
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pagamento
                <select
                  value={draft.paymentStatus}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      paymentStatus: event.target.value as PaymentStatus,
                    })
                  }
                >
                  {Object.entries(paymentLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {order.fulfillment === "delivery" && (
              <>
                <div className="field-pair">
                  <label>
                    Parceiro
                    <input
                      value={draft.deliveryPartner}
                      onChange={(event) => setDraft({ ...draft, deliveryPartner: event.target.value })}
                      placeholder="99 ou Uber"
                    />
                  </label>
                  <label>
                    Frete cobrado (R$)
                    <input
                      type="number" step="0.01" min="0"
                      disabled={["review", "paid", "refunded"].includes(order.paymentStatus)}
                      value={draft.deliveryFeeCents == null ? "" : draft.deliveryFeeCents / 100}
                      onChange={(event) => setDraft({ ...draft,
                        deliveryFeeCents: event.target.value === "" ? null : Math.round(Number(event.target.value) * 100),
                      })}
                      placeholder="A confirmar"
                    />
                  </label>
                </div>
                <label>
                  Custo real do parceiro (R$)
                  <input
                    type="number" step="0.01" min="0"
                    value={draft.deliveryCostCents == null ? "" : draft.deliveryCostCents / 100}
                    onChange={(event) => setDraft({ ...draft,
                      deliveryCostCents: event.target.value === "" ? null : Math.round(Number(event.target.value) * 100),
                    })}
                    placeholder="Preencha após contratar o parceiro"
                  />
                  <small>Usado no resultado financeiro; não muda o valor cobrado do cliente.</small>
                </label>
              </>
            )}
            <label>
              Notas internas
              <textarea
                rows={3}
                value={draft.adminNotes}
                onChange={(event) =>
                  setDraft({ ...draft, adminNotes: event.target.value })
                }
                placeholder="Informações só para a equipe"
              />
            </label>
          </section>
          <section className="detail-section">
            <span className="admin-overline">HISTÓRICO</span>
            <div className="detail-history">
              {order.history.map((entry, index) => (
                <div key={`${entry.at}-${index}`}>
                  <span />
                  <p>
                    <strong>{entry.label}</strong>
                    <small>{dateTime(entry.at)}</small>
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="detail-footer">
          <button className="admin-primary" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar pedido"} <Check size={18} />
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function AdminApp() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<Order | null>(null);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Gestão | Street Doces";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    const expired = () => {
      setEmail(null);
      setData(null);
      setSelected(null);
    };
    window.addEventListener("street-admin-expired", expired);
    return () => {
      document.title = previousTitle;
      robots.remove();
      window.removeEventListener("street-admin-expired", expired);
    };
  }, []);
  async function refresh() {
    const result = await api<Dashboard>("dashboard");
    setData(result);
  }
  useEffect(() => {
    api<{ email: string }>("session")
      .then(async (result) => {
        setEmail(result.email);
        await refresh();
      })
      .catch(() => setEmail(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!email || selected || (tab !== "overview" && tab !== "orders")) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [email, selected, tab]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3800);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next: Tab) {
    setTab(next);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }
  async function logout() {
    try {
      await api("logout", "POST");
    } finally {
      setEmail(null);
      setData(null);
    }
  }
  if (loading)
    return (
      <div className="admin-loading">
        <span>✳</span>
        <p>ABRINDO O BACKSTAGE</p>
      </div>
    );
  if (!email)
    return (
      <Login
        onLogin={async (loginEmail) => {
          setEmail(loginEmail);
          try {
            await refresh();
          } catch (cause) {
            setToast(
              cause instanceof Error
                ? cause.message
                : "Falha ao carregar dados.",
            );
          }
        }}
      />
    );
  const newCount =
    data?.orders.filter((order) => order.status === "new").length || 0;
  const reviewCount =
    data?.orders.filter((order) => order.paymentStatus === "review").length || 0;
  const selectedCurrent =
    selected && data?.orders.find((order) => order.id === selected.id);
  const ordersRevision = data?.orders.map((entry) => `${entry.id}:${entry.updatedAt}`).join("|") || "";
  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <span>✳</span>
          <strong>
            STREET<span>DOCES</span>
            <small>GESTÃO / BACKSTAGE</small>
          </strong>
          <button
            className="sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Navegação administrativa">
          {tabs.map(({ key, label, icon: Icon }) => (
            <div key={key}>
              {key === "finance" && <div className="sidebar-section-label sidebar-sub-label">NEGÓCIO</div>}
              {key === "settings" && <div className="sidebar-section-label sidebar-sub-label">SISTEMA</div>}
              <button className={tab === key ? "active" : ""} onClick={() => navigate(key)}>
                <Icon size={20} /><span>{label}</span>
                {key === "orders" && newCount + reviewCount > 0 && <b>{newCount + reviewCount}</b>}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Store size={19} /> Ver loja <ArrowUpRight size={16} />
          </a>
          <button onClick={logout}>
            <LogOut size={19} /> Sair do painel
          </button>
          <div className="sidebar-account">
            <span>{email.charAt(0).toUpperCase()}</span>
            <div>
              <strong>Administrador</strong>
              <small>{email}</small>
            </div>
          </div>
        </div>
      </aside>
      {menuOpen && (
        <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />
      )}
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-menu-toggle"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={23} />
          </button>
          <div className="admin-breadcrumb">
            STREET DOCES <span>/</span>{" "}
            {tabs.find((item) => item.key === tab)?.label.toUpperCase()}
          </div>
          <div className="topbar-right">
            <span className="topbar-date">
              <Clock3 size={16} /> {dateOnly(new Date().toISOString())}
            </span>
            <button
              className="topbar-refresh"
              onClick={() =>
                refresh().catch(() => setToast("Falha ao atualizar."))
              }
              aria-label="Atualizar dados"
            >
              <RefreshCw size={18} />
            </button>
            <span className="topbar-avatar">
              {email.charAt(0).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="admin-content">
          {data ? (
            <>
              {tab === "overview" && (
                <Overview
                  data={data}
                  setTab={navigate}
                  setSelected={setSelected}
                  ordersRevision={ordersRevision}
                />
              )}
              {tab === "orders" && (
                <Orders orders={data.orders} setSelected={setSelected} />
              )}
              {tab === "products" && (
                <Products
                  products={data.products}
                  refresh={refresh}
                  notify={setToast}
                />
              )}
              {tab === "inventory" && (
                <Inventory
                  products={data.products}
                  refresh={refresh}
                  notify={setToast}
                />
              )}
              {tab === "customers" && <Customers orders={data.orders} />}
              {(["finance", "costing", "purchases", "suppliers", "distribution", "expenses"] as Tab[]).includes(tab) &&
                <BusinessApp key={tab} section={tab as BusinessSection} products={data.products}
                  ordersRevision={ordersRevision}
                  onNavigate={navigate} onOrdersChanged={refresh}
                  onOpenOrder={(id) => {
                    const order = data.orders.find((entry) => entry.id === id);
                    if (order) setSelected(order);
                  }} notify={setToast} />}
              {tab === "settings" && (
                <StoreSettingsPage
                  settings={data.settings}
                  refresh={refresh}
                  notify={setToast}
                />
              )}
            </>
          ) : (
            <Empty
              icon={RefreshCw}
              title="Não foi possível carregar os dados"
              description="Atualize a página para tentar novamente."
            />
          )}
        </main>
        <footer className="admin-footer">
          <span>STREET DOCES / GESTÃO</span>
          <span>FEITO EM BETIM ✳</span>
        </footer>
      </div>
      {selectedCurrent && (
        <OrderDetail
          order={selectedCurrent}
          onClose={() => setSelected(null)}
          refresh={refresh}
          notify={setToast}
        />
      )}
      {toast && (
        <div className="admin-toast" role="status">
          <Sparkles size={18} /> {toast}
          <button onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
