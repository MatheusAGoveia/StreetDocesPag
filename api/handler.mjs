import { handleApi } from "../server/api.mjs";
import { vercelBlobStorage } from "../server/vercel-storage.mjs";

export async function handleVercelRequest(request, storage) {
  const route = new URL(request.url).searchParams.get("route");
  if (!route || !/^[a-z0-9/_-]+$/i.test(route) || route.includes(".."))
    return Response.json({ error: "Rota não encontrada." }, { status: 404 });
  return handleApi(request, storage, `/api/${route}`);
}

export default {
  async fetch(request) {
    try {
      return await handleVercelRequest(request, await vercelBlobStorage());
    } catch (error) {
      if (error.message === "VERCEL_BLOB_NOT_CONFIGURED")
        return Response.json(
          { error: "Armazenamento privado da loja não configurado na Vercel." },
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
