import { randomUUID } from "node:crypto";
import { BusinessError } from "./business.mjs";

const clean = (value, limit = 250) => String(value ?? "").trim().slice(0, limit);
const integer = (value, min = 0, max = 1_000_000_000) =>
  Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const stamp = () => new Date().toISOString();
const currency = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const result = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function bodyOf(request) {
  const raw = await request.text();
  if (raw.length > 64_000) throw new BusinessError("Dados muito grandes.");
  try {
    const body = JSON.parse(raw || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new BusinessError("Dados inválidos."); }
}

async function records(storage, prefix) {
  const values = storage.listValues
    ? await storage.listValues(prefix)
    : await Promise.all((await storage.list(prefix)).map((key) => storage.get(key)));
  return values.filter(Boolean);
}

const bookingStatuses = ["planned", "confirmed", "in_production", "ready", "completed", "cancelled"];
const paymentMethods = ["pix", "cash", "card", "transfer", "other"];

function bookingInput(input, products) {
  const kind = clean(input.kind, 12);
  const customerName = clean(input.customerName, 120);
  const customerPhone = clean(input.customerPhone, 30);
  const title = clean(input.title, 140);
  const scheduledDate = clean(input.scheduledDate, 10);
  const scheduledTime = clean(input.scheduledTime, 5);
  const fulfillment = clean(input.fulfillment, 10);
  if (!["order", "event"].includes(kind)) throw new BusinessError("Tipo de planejamento inválido.");
  if (customerName.length < 2 || customerPhone.replace(/\D/g, "").length < 10)
    throw new BusinessError("Informe o cliente e um telefone com DDD.");
  if (title.length < 3) throw new BusinessError("Informe o nome da encomenda ou evento.");
  if (!validDate(scheduledDate) || !validTime(scheduledTime))
    throw new BusinessError("Informe data e horário válidos.");
  if (!["pickup", "delivery"].includes(fulfillment)) throw new BusinessError("Forma de recebimento inválida.");
  const address = clean(input.address, 300);
  if (fulfillment === "delivery" && address.length < 8) throw new BusinessError("Informe o endereço da entrega.");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 60)
    throw new BusinessError("Adicione de 1 a 60 itens.");
  const items = input.items.map((line) => {
    const productId = clean(line.productId, 80);
    const product = products.find((entry) => entry.id === productId);
    const name = clean(line.name || product?.name, 140);
    const quantity = integer(line.quantity, 1, 100_000);
    const unitPriceCents = integer(line.unitPriceCents, 0, 100_000_000);
    if (name.length < 2 || quantity === null || unitPriceCents === null)
      throw new BusinessError("Confira os itens, quantidades e valores.");
    return {
      id: randomUUID(), productId: product?.id || "", name, quantity, unitPriceCents,
      totalCents: quantity * unitPriceCents, produce: line.produce !== false,
    };
  });
  const deliveryFeeCents = fulfillment === "delivery" ? integer(input.deliveryFeeCents, 0, 10_000_000) : 0;
  if (deliveryFeeCents === null) throw new BusinessError("Taxa de entrega inválida.");
  const guestCount = kind === "event" ? integer(input.guestCount, 1, 100_000) : 0;
  if (kind === "event" && guestCount === null) throw new BusinessError("Informe a quantidade de convidados.");
  return {
    kind, title, customerName, customerPhone, scheduledDate, scheduledTime,
    fulfillment, address, guestCount: guestCount || 0, theme: clean(input.theme, 120),
    responsible: clean(input.responsible, 100), notes: clean(input.notes, 1200), items,
    subtotalCents: items.reduce((sum, line) => sum + line.totalCents, 0), deliveryFeeCents,
  };
}

function publicBooking(entry) {
  const paidCents = entry.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { ...entry, paidCents, balanceCents: Math.max(0, entry.totalCents - paidCents) };
}

function bookingCode(kind) {
  const date = new Date();
  const part = `${String(date.getUTCFullYear()).slice(2)}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return `${kind === "event" ? "EVT" : "ENC"}-${part}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

function baseChecklist(kind) {
  const labels = kind === "event"
    ? ["Pagamento conferido", "Endereço confirmado", "Produção finalizada", "Embalagem conferida", "Equipe e transporte confirmados", "Entrega realizada"]
    : ["Pagamento conferido", "Detalhes confirmados com o cliente", "Produção finalizada", "Embalagem conferida", "Retirada ou entrega realizada"];
  return labels.map((label) => ({ id: randomUUID(), label, done: false, doneAt: null }));
}

function makeTask(booking, item) {
  const now = stamp();
  return {
    id: randomUUID(), bookingId: booking.id, bookingCode: booking.code,
    title: item.name, productId: item.productId, targetQuantity: item.quantity,
    completedQuantity: 0, dueDate: booking.scheduledDate, dueTime: booking.scheduledTime,
    responsible: booking.responsible, status: "pending", createdAt: now, updatedAt: now,
  };
}

async function planningView(storage) {
  const [bookings, tasks] = await Promise.all([
    records(storage, "bookings/"), records(storage, "production-tasks/"),
  ]);
  const visibleBookings = bookings.map(publicBooking).sort((a, b) =>
    `${a.scheduledDate}T${a.scheduledTime}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime}`));
  const visibleTasks = tasks.sort((a, b) =>
    `${a.dueDate}T${a.dueTime}`.localeCompare(`${b.dueDate}T${b.dueTime}`));
  const active = visibleBookings.filter((entry) => !["completed", "cancelled"].includes(entry.status));
  const agenda = [
    ...active.map((entry) => ({
      id: `booking-${entry.id}`, date: entry.scheduledDate, time: entry.scheduledTime,
      kind: entry.kind, title: entry.title, detail: `${entry.code} · ${entry.customerName}`,
      status: entry.status, bookingId: entry.id,
    })),
    ...visibleTasks.filter((task) => task.status !== "cancelled").map((task) => ({
      id: `task-${task.id}`, date: task.dueDate, time: task.dueTime, kind: "production",
      title: `Produzir ${task.targetQuantity} × ${task.title}`,
      detail: `${task.bookingCode} · ${task.completedQuantity}/${task.targetQuantity} concluídos`,
      status: task.status, bookingId: task.bookingId,
    })),
  ].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  return {
    bookings: visibleBookings, tasks: visibleTasks, agenda,
    summary: {
      activeOrders: active.filter((entry) => entry.kind === "order").length,
      activeEvents: active.filter((entry) => entry.kind === "event").length,
      openTasks: visibleTasks.filter((task) => !["done", "cancelled"].includes(task.status)).length,
      receivableCents: active.reduce((sum, entry) => sum + entry.balanceCents, 0),
    },
  };
}

async function updateEntry(storage, prefix, id, input, mutate) {
  const key = `${prefix}/${id}`;
  const { data: previous, etag } = await storage.getWithEtag(key);
  if (!previous) throw new BusinessError("Registro não encontrado.", 404);
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== previous.updatedAt)
    throw new BusinessError("O registro mudou. Atualize a página.", 409);
  const next = { ...previous, ...mutate(previous), updatedAt: stamp() };
  if (!(await storage.set(key, next, etag))) throw new BusinessError("O registro mudou. Atualize a página.", 409);
  return next;
}

export async function handlePlanningApi(request, storage, path, productsOf) {
  if (!path.startsWith("/api/admin/planning")) return null;
  const method = request.method.toUpperCase();
  if (path === "/api/admin/planning" && method === "GET") return result(await planningView(storage));
  if (path === "/api/admin/planning/bookings" && method === "POST") {
    const input = await bodyOf(request);
    const normalized = bookingInput(input, await productsOf());
    const depositCents = integer(input.depositCents ?? 0, 0, normalized.subtotalCents + normalized.deliveryFeeCents);
    if (depositCents === null) throw new BusinessError("Valor do sinal inválido.");
    const now = stamp();
    const booking = {
      ...normalized, id: randomUUID(), code: bookingCode(normalized.kind),
      totalCents: normalized.subtotalCents + normalized.deliveryFeeCents,
      status: "planned", payments: depositCents ? [{
        id: randomUUID(), amountCents: depositCents, method: "pix", paidAt: now.slice(0, 10), note: "Sinal inicial", createdAt: now,
      }] : [],
      checklist: baseChecklist(normalized.kind),
      history: [{ at: now, label: `${normalized.kind === "event" ? "Evento" : "Encomenda"} registrado` }],
      createdAt: now, updatedAt: now,
    };
    if (!(await storage.set(`bookings/${booking.id}`, booking, null))) throw new BusinessError("Não foi possível salvar.", 409);
    const tasks = booking.items.filter((item) => item.produce).map((item) => makeTask(booking, item));
    await Promise.all(tasks.map((task) => storage.set(`production-tasks/${task.id}`, task, null)));
    return result({ booking: publicBooking(booking), tasks }, 201);
  }
  const bookingMatch = path.match(/^\/api\/admin\/planning\/bookings\/([a-f0-9-]{36})$/);
  if (bookingMatch && method === "PATCH") {
    const input = await bodyOf(request);
    const status = clean(input.status, 20);
    if (!bookingStatuses.includes(status)) throw new BusinessError("Situação inválida.");
    const now = stamp();
    const booking = await updateEntry(storage, "bookings", bookingMatch[1], input, (previous) => ({
      status, responsible: input.responsible === undefined ? previous.responsible : clean(input.responsible, 100),
      history: status === previous.status ? previous.history : [...previous.history, { at: now, label: `Situação alterada para ${status}` }],
    }));
    if (status === "cancelled") {
      const tasks = (await records(storage, "production-tasks/")).filter((task) => task.bookingId === booking.id && task.status !== "done");
      await Promise.all(tasks.map((task) => updateEntry(storage, "production-tasks", task.id, {}, () => ({ status: "cancelled" }))));
    } else {
      const tasks = (await records(storage, "production-tasks/")).filter((task) => task.bookingId === booking.id && task.status === "cancelled");
      await Promise.all(tasks.map((task) => updateEntry(storage, "production-tasks", task.id, {}, (previous) => ({
        status: previous.completedQuantity >= previous.targetQuantity ? "done" : previous.completedQuantity > 0 ? "in_progress" : "pending",
      }))));
    }
    return result({ booking: publicBooking(booking) });
  }
  const paymentMatch = path.match(/^\/api\/admin\/planning\/bookings\/([a-f0-9-]{36})\/payments$/);
  if (paymentMatch && method === "POST") {
    const input = await bodyOf(request);
    const amountCents = integer(input.amountCents, 1, 100_000_000);
    const methodName = clean(input.method, 20);
    const paidAt = clean(input.paidAt, 10);
    if (amountCents === null || !paymentMethods.includes(methodName) || !validDate(paidAt))
      throw new BusinessError("Confira valor, forma e data do pagamento.");
    const booking = await updateEntry(storage, "bookings", paymentMatch[1], input, (previous) => {
      if (previous.status === "cancelled") throw new BusinessError("Não é possível registrar pagamento em um pedido cancelado.", 409);
      const paid = previous.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      if (paid + amountCents > previous.totalCents) throw new BusinessError("O pagamento ultrapassa o saldo restante.");
      const payment = { id: randomUUID(), amountCents, method: methodName, paidAt, note: clean(input.note, 180), createdAt: stamp() };
      return { payments: [...previous.payments, payment], history: [...previous.history, { at: stamp(), label: `Pagamento de ${currency(amountCents)} registrado` }] };
    });
    return result({ booking: publicBooking(booking) });
  }
  const checklistMatch = path.match(/^\/api\/admin\/planning\/bookings\/([a-f0-9-]{36})\/checklist\/([a-f0-9-]{36})$/);
  if (checklistMatch && method === "PATCH") {
    const input = await bodyOf(request);
    const booking = await updateEntry(storage, "bookings", checklistMatch[1], input, (previous) => {
      if (!previous.checklist.some((item) => item.id === checklistMatch[2])) throw new BusinessError("Item não encontrado.", 404);
      return { checklist: previous.checklist.map((item) => item.id === checklistMatch[2]
        ? { ...item, done: input.done === true, doneAt: input.done === true ? stamp() : null } : item) };
    });
    return result({ booking: publicBooking(booking) });
  }
  const taskMatch = path.match(/^\/api\/admin\/planning\/tasks\/([a-f0-9-]{36})$/);
  if (taskMatch && method === "PATCH") {
    const input = await bodyOf(request);
    const task = await updateEntry(storage, "production-tasks", taskMatch[1], input, (previous) => {
      const completedQuantity = integer(input.completedQuantity, 0, previous.targetQuantity);
      if (completedQuantity === null) throw new BusinessError("Quantidade concluída inválida.");
      return {
        completedQuantity,
        responsible: input.responsible === undefined ? previous.responsible : clean(input.responsible, 100),
        status: completedQuantity >= previous.targetQuantity ? "done" : completedQuantity > 0 ? "in_progress" : "pending",
      };
    });
    const siblingTasks = (await records(storage, "production-tasks/")).filter((entry) => entry.bookingId === task.bookingId);
    if (siblingTasks.length && siblingTasks.every((entry) => ["done", "cancelled"].includes(entry.status))) {
      const booking = await storage.get(`bookings/${task.bookingId}`);
      if (booking && !["completed", "cancelled"].includes(booking.status)) {
        await updateEntry(storage, "bookings", booking.id, {}, (previous) => ({
          status: "ready",
          checklist: previous.checklist.map((item) => item.label === "Produção finalizada"
            ? { ...item, done: true, doneAt: item.doneAt || stamp() } : item),
          history: [...previous.history, { at: stamp(), label: "Produção finalizada automaticamente" }],
        }));
      }
    }
    return result({ task });
  }
  throw new BusinessError("Rota não encontrada.", 404);
}
