import { handleApi } from "../server/api.mjs";
import { postgresStorage } from "../server/postgres-storage.mjs";

export async function handleVercelRequest(request, storage) {
  const route = new URL(request.url).searchParams.get("route");
  if (!route || !/^[a-z0-9/_-]+$/i.test(route) || route.includes(".."))
    return Response.json({ error: "Rota não encontrada." }, { status: 404 });
  return handleApi(request, storage, `/api/${route}`);
}

export default {
  async fetch(request) {
    try {
      return await handleVercelRequest(request, postgresStorage());
    } catch (error) {
      if (error.message === "POSTGRES_NOT_CONFIGURED")
        return Response.json(
          { error: "Banco PostgreSQL não configurado na Vercel. Conecte o Neon e configure DATABASE_URL." },
          { status: 503, headers: { "cache-control": "no-store" } },
        );
      console.error("Street Doces Vercel Function:", error);
      return Response.json(
        { error: "Não foi possível acessar a loja agora." },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }
  },
};
