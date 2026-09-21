import { randomUUID } from "node:crypto";

export class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const clean = (value, limit = 250) => String(value ?? "").trim().slice(0, limit);
const whole = (value, min = 0, max = 1_000_000_000) =>
  Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const businessDay = (value) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const field = (type) => parts.find((part) => part.type === type).value;
  return `${field("year")}-${field("month")}-${field("day")}`;
};
const today = () => businessDay(Date.now());
const stamp = () => new Date().toISOString();
const result = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });

async function bodyOf(request) {
  if (Number(request.headers.get("content-length") || 0) > 32768)
    throw new BusinessError("Dados muito grandes.");
  const raw = await request.text();
  if (raw.length > 32768) throw new BusinessError("Dados muito grandes.");
  try {
    const body = JSON.parse(raw || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BusinessError("Dados inválidos.");
    return body;
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw new BusinessError("Dados inválidos.");
  }
}

async function records(storage, prefix) {
  const values = storage.listValues
    ? await storage.listValues(prefix)
    : await Promise.all((await storage.list(prefix)).map((key) => storage.get(key)));
  return values.filter(Boolean);
}

async function create(storage, prefix, data) {
  const now = stamp();
  const entry = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
  if (!(await storage.set(`${prefix}/${entry.id}`, entry, null)))
    throw new BusinessError("Não foi possível salvar o registro.", 409);
  return entry;
}

async function update(storage, prefix, id, input, normalize) {
  const key = `${prefix}/${id}`;
  const { data: previous, etag } = await storage.getWithEtag(key);
  if (!previous) throw new BusinessError("Registro não encontrado.", 404);
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== previous.updatedAt)
    throw new BusinessError("O registro mudou. Atualize a página.", 409);
  const next = { ...previous, ...normalize(input, previous), updatedAt: stamp() };
  if (!(await storage.set(key, next, etag)))
    throw new BusinessError("O registro mudou. Atualize a página.", 409);
  return next;
}

async function voidRecord(storage, prefix, id, input) {
  const reason = clean(input.reason, 200);
  if (reason.length < 3) throw new BusinessError("Informe o motivo do estorno.");
  const key = `${prefix}/${id}`;
  const { data: previous, etag } = await storage.getWithEtag(key);
  if (!previous) throw new BusinessError("Registro não encontrado.", 404);
  if (previous.voidedAt) return previous;
  const next = { ...previous, voidedAt: stamp(), voidReason: reason, updatedAt: stamp() };
  if (!(await storage.set(key, next, etag)))
    throw new BusinessError("O registro mudou. Atualize a página.", 409);
  return next;
}

function supplierInput(input) {
  const name = clean(input.name, 100);
  if (name.length < 2) throw new BusinessError("Informe o nome do fornecedor.");
  return {
    name,
    contact: clean(input.contact, 100),
    notes: clean(input.notes, 500),
    active: input.active !== false,
  };
}

function materialInput(input) {
  const name = clean(input.name, 100);
  const unit = clean(input.unit, 3);
  if (name.length < 2 || !["g", "ml", "un"].includes(unit))
    throw new BusinessError("Informe o insumo e sua unidade (g, ml ou un).");
  return { name, unit, active: input.active !== false };
}

function transactionDate(input, field) {
  const value = clean(input[field], 10);
  if (!validDate(value)) throw new BusinessError("Data inválida.");
  return value;
}

function purchaseInput(input) {
  const quantityMilli = whole(input.quantityMilli, 1);
  const totalCents = whole(input.totalCents, 1);
  if (quantityMilli === null || totalCents === null)
    throw new BusinessError("Confira a quantidade e o valor da compra.");
  return {
    supplierId: clean(input.supplierId, 36),
    materialId: clean(input.materialId, 36),
    quantityMilli,
    totalCents,
    purchasedAt: transactionDate(input, "purchasedAt"),
    reference: clean(input.reference, 80),
    notes: clean(input.notes, 300),
    voidedAt: null,
  };
}

function expenseInput(input) {
  const amountCents = whole(input.amountCents, 1);
  const category = clean(input.category, 30);
  if (amountCents === null || ![
    "embalagem", "energia", "marketing", "transporte", "taxas", "outros",
  ].includes(category))
    throw new BusinessError("Confira a categoria e o valor da despesa.");
  const description = clean(input.description, 160);
  if (description.length < 3) throw new BusinessError("Descreva a despesa.");
  return {
    description,
    category,
    amountCents,
    spentAt: transactionDate(input, "spentAt"),
    supplierId: clean(input.supplierId, 36),
    notes: clean(input.notes, 300),
    voidedAt: null,
  };
}

function costingInput(input, materials) {
  const mode = clean(input.mode, 10);
  if (mode === "manual") {
    const manualCostCents = whole(input.manualCostCents, 0, 10_000_000);
    if (manualCostCents === null) throw new BusinessError("Informe o custo unitário.");
    return { mode, manualCostCents, extraCostCents: 0, ingredients: [] };
  }
  if (mode !== "recipe" || !Array.isArray(input.ingredients) ||
      input.ingredients.length < 1 || input.ingredients.length > 30)
    throw new BusinessError("Adicione de 1 a 30 insumos à ficha técnica.");
  const extraCostCents = whole(input.extraCostCents, 0, 10_000_000);
  if (extraCostCents === null) throw new BusinessError("Custo adicional inválido.");
  const seen = new Set();
  const ingredients = input.ingredients.map((item) => {
    const materialId = clean(item.materialId, 36);
    const quantityMilli = whole(item.quantityMilli, 1);
    if (!materials.some((material) => material.id === materialId) ||
        quantityMilli === null || seen.has(materialId))
      throw new BusinessError("Confira os insumos e quantidades da ficha técnica.");
    seen.add(materialId);
    return { materialId, quantityMilli };
  });
  return { mode, manualCostCents: null, extraCostCents, ingredients };
}

export function calculateCosts(materials, purchases, costings, products) {
  const materialTotals = new Map(materials.map((material) => [material.id, {
    materialId: material.id,
    purchasedQuantityMilli: 0,
    purchasedCents: 0,
    averageCentsPerMilli: null,
  }]));
  for (const purchase of purchases) {
    if (purchase.voidedAt) continue;
    const entry = materialTotals.get(purchase.materialId);
    if (!entry) continue;
    entry.purchasedQuantityMilli += purchase.quantityMilli;
    entry.purchasedCents += purchase.totalCents;
  }
  for (const entry of materialTotals.values()) {
    if (entry.purchasedQuantityMilli)
      entry.averageCentsPerMilli = entry.purchasedCents / entry.purchasedQuantityMilli;
  }
  const byProduct = new Map();
  const costingByProduct = new Map(costings.map((item) => [item.productId, item]));
  for (const product of products) {
    const costing = costingByProduct.get(product.id);
    let unitCostCents = null;
    if (costing?.mode === "manual") unitCostCents = costing.manualCostCents;
    if (costing?.mode === "recipe") {
      const lines = costing.ingredients.map((line) => {
        const average = materialTotals.get(line.materialId)?.averageCentsPerMilli;
        return average == null ? null : average * line.quantityMilli;
      });
      if (lines.every((value) => value !== null))
        unitCostCents = Math.round(lines.reduce((sum, value) => sum + value, 0) + costing.extraCostCents);
    }
    byProduct.set(product.id, {
      productId: product.id,
      unitCostCents,
      unitProfitCents: unitCostCents === null ? null : product.priceCents - unitCostCents,
      marginPercent: unitCostCents === null ? null :
        Math.round(((product.priceCents - unitCostCents) / product.priceCents) * 1000) / 10,
      mode: costing?.mode || null,
    });
  }
  return { materialTotals: [...materialTotals.values()], byProduct };
}

export async function loadCostMap(storage, products) {
  const [materials, purchases, costings] = await Promise.all([
    records(storage, "materials/"),
    records(storage, "purchases/"),
    records(storage, "costings/"),
  ]);
  return calculateCosts(materials, purchases, costings, products).byProduct;
}

function inPeriod(date, from, to) {
  return date >= from && date <= to;
}

export function financialSummary(orders, products, purchases, expenses, costs, from, to) {
  const paid = orders.filter((order) =>
    order.paymentStatus === "paid" && order.status !== "cancelled" &&
    inPeriod(businessDay(order.paidAt || order.createdAt), from, to));
  const activePurchases = purchases.filter((entry) =>
    !entry.voidedAt && inPeriod(entry.purchasedAt, from, to));
  const activeExpenses = expenses.filter((entry) =>
    !entry.voidedAt && inPeriod(entry.spentAt, from, to));
  const productRevenueCents = paid.reduce((sum, order) => sum + order.subtotalCents, 0);
  const shippingRevenueCents = paid.reduce((sum, order) =>
    sum + (order.fulfillment === "delivery" ? order.deliveryFeeCents || 0 : 0), 0);
  const revenueCents = productRevenueCents + shippingRevenueCents;
  const purchaseCents = activePurchases.reduce((sum, entry) => sum + entry.totalCents, 0);
  const expenseCents = activeExpenses.reduce((sum, entry) => sum + entry.amountCents, 0);
  let cogsCents = 0;
  let deliveryCostCents = 0;
  let missingCostOrders = 0;
  let estimatedCostOrders = 0;
  let missingDeliveryCostOrders = 0;
  const sales = new Map(products.map((product) => [product.id, {
    productId: product.id, quantity: 0, revenueCents: 0,
  }]));
  for (const order of paid) {
    let missing = false;
    let estimated = false;
    for (const item of order.items) {
      const snapshot = Number.isSafeInteger(item.unitCostCents) ? item.unitCostCents : null;
      const unitCost = snapshot ?? costs.get(item.productId)?.unitCostCents ?? null;
      if (unitCost === null) missing = true;
      else cogsCents += unitCost * item.quantity;
      if (snapshot === null && unitCost !== null) estimated = true;
      const entry = sales.get(item.productId);
      if (entry) {
        entry.quantity += item.quantity;
        entry.revenueCents += item.totalCents;
      }
    }
    if (missing) missingCostOrders++;
    if (estimated) estimatedCostOrders++;
    if (order.fulfillment === "delivery") {
      if (!Number.isSafeInteger(order.deliveryCostCents)) missingDeliveryCostOrders++;
      else deliveryCostCents += order.deliveryCostCents;
    }
  }
  const complete = missingCostOrders === 0 && missingDeliveryCostOrders === 0;
  return {
    from, to, paidOrderCount: paid.length, productRevenueCents,
    shippingRevenueCents, revenueCents, cogsCents, deliveryCostCents,
    purchaseCents, expenseCents,
    profitCents: complete ? revenueCents - cogsCents - deliveryCostCents - expenseCents : null,
    cashAfterOutflowsCents: missingDeliveryCostOrders === 0
      ? revenueCents - purchaseCents - deliveryCostCents - expenseCents : null,
    missingCostOrders, missingDeliveryCostOrders, estimatedCostOrders,
    sales: [...sales.values()],
  };
}

async function businessView(storage, products, orders, from, to) {
  const [suppliers, materials, purchases, expenses, costings] = await Promise.all([
    records(storage, "suppliers/"), records(storage, "materials/"),
    records(storage, "purchases/"), records(storage, "expenses/"),
    records(storage, "costings/"),
  ]);
  const { materialTotals, byProduct } = calculateCosts(materials, purchases, costings, products);
  return {
    suppliers: suppliers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    materials: materials.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    purchases: purchases.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
    expenses: expenses.sort((a, b) => b.spentAt.localeCompare(a.spentAt)),
    costings,
    materialTotals,
    productCosts: [...byProduct.values()],
    summary: financialSummary(orders, products, purchases, expenses, byProduct, from, to),
    distributions: orders.filter((order) => order.fulfillment === "delivery")
      .map((order) => ({
        id: order.id, number: order.number, createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customerName: order.customer.name, address: order.address,
        status: order.status, paymentStatus: order.paymentStatus,
        deliveryPartner: order.deliveryPartner,
        deliveryFeeCents: order.deliveryFeeCents,
        deliveryCostCents: order.deliveryCostCents ?? null,
      })),
  };
}

export async function handleBusinessApi(request, storage, path, productsOf, ordersOf) {
  if (!path.startsWith("/api/admin/business")) return null;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  if (path === "/api/admin/business" && method === "GET") {
    const from = url.searchParams.get("from") || `${today().slice(0, 7)}-01`;
    const to = url.searchParams.get("to") || today();
    if (!validDate(from) || !validDate(to) || from > to)
      throw new BusinessError("Período inválido.");
    const [products, orders] = await Promise.all([productsOf(), ordersOf()]);
    return result(await businessView(storage, products, orders, from, to));
  }
  if (path === "/api/admin/business/suppliers" && method === "POST")
    return result({ supplier: await create(storage, "suppliers", supplierInput(await bodyOf(request))) }, 201);
  if (path === "/api/admin/business/materials" && method === "POST")
    return result({ material: await create(storage, "materials", materialInput(await bodyOf(request))) }, 201);
  if (path === "/api/admin/business/purchases" && method === "POST") {
    const input = purchaseInput(await bodyOf(request));
    const [supplier, material] = await Promise.all([
      storage.get(`suppliers/${input.supplierId}`),
      storage.get(`materials/${input.materialId}`),
    ]);
    if (!supplier?.active || !material?.active)
      throw new BusinessError("Escolha um fornecedor e um insumo ativos.");
    return result({ purchase: await create(storage, "purchases", input) }, 201);
  }
  if (path === "/api/admin/business/expenses" && method === "POST") {
    const input = expenseInput(await bodyOf(request));
    if (input.supplierId && !(await storage.get(`suppliers/${input.supplierId}`)))
      throw new BusinessError("Fornecedor não encontrado.");
    return result({ expense: await create(storage, "expenses", input) }, 201);
  }
  const entityMatch = path.match(/^\/api\/admin\/business\/(suppliers|materials)\/([a-f0-9-]{36})$/);
  if (entityMatch && method === "PUT") {
    const [, kind, id] = entityMatch;
    const input = await bodyOf(request);
    if (kind === "materials") {
      const previous = await storage.get(`materials/${id}`);
      if (!previous) throw new BusinessError("Insumo não encontrado.", 404);
      const normalized = materialInput(input);
      if (previous.unit !== normalized.unit &&
          ((await records(storage, "purchases/")).some((entry) => entry.materialId === id && !entry.voidedAt) ||
           (await records(storage, "costings/")).some((entry) => entry.ingredients?.some((line) => line.materialId === id))))
        throw new BusinessError("A unidade não pode mudar após uma compra ou ficha técnica.", 409);
      return result({ material: await update(storage, "materials", id, input, () => normalized) });
    }
    return result({ supplier: await update(storage, "suppliers", id, input, supplierInput) });
  }
  const voidMatch = path.match(/^\/api\/admin\/business\/(purchases|expenses)\/([a-f0-9-]{36})\/void$/);
  if (voidMatch && method === "PATCH") {
    const [, kind, id] = voidMatch;
    const entry = await voidRecord(storage, kind, id, await bodyOf(request));
    return result({ [kind === "purchases" ? "purchase" : "expense"]: entry });
  }
  const costingMatch = path.match(/^\/api\/admin\/business\/costings\/([a-z0-9-]+)$/);
  if (costingMatch && method === "PUT") {
    const productId = costingMatch[1];
    if (!(await productsOf()).some((product) => product.id === productId))
      throw new BusinessError("Produto não encontrado.", 404);
    const input = await bodyOf(request);
    const normalized = costingInput(input, await records(storage, "materials/"));
    const key = `costings/${productId}`;
    const { data: previous, etag } = await storage.getWithEtag(key);
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== previous?.updatedAt)
      throw new BusinessError("A ficha técnica mudou. Atualize a página.", 409);
    const now = stamp();
    const costing = {
      productId, ...normalized,
      createdAt: previous?.createdAt || now, updatedAt: now,
    };
    if (!(await storage.set(key, costing, etag)))
      throw new BusinessError("A ficha técnica mudou. Atualize a página.", 409);
    return result({ costing });
  }
  throw new BusinessError("Rota não encontrada.", 404);
}
