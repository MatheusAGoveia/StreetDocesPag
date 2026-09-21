export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: "Resposta inválida do servidor." }));
  if (response.status === 401 && path !== "login" && path !== "session")
    window.dispatchEvent(new Event("street-admin-expired"));
  if (!response.ok)
    throw new Error(result.error || "Não foi possível concluir a operação.");
  return result as T;
}
