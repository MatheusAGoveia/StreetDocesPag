import { handleApi } from "./api.mjs";
import { localStorage } from "./storage.mjs";

export default function streetApi() {
  return {
    name: "street-doces-local-api",
    configureServer(server) {
      server.middlewares.use("/api", async (incoming, outgoing) => {
        try {
          const chunks = [];
          let size = 0;
          const limit = incoming.url?.startsWith("/admin/media")
            ? 4 * 1024 * 1024
            : 32768;
          for await (const chunk of incoming) {
            chunks.push(chunk);
            size += chunk.length;
            if (size > limit) {
              outgoing.writeHead(413).end();
              return;
            }
          }
          if (!incoming.headers.host) {
            outgoing.writeHead(400).end();
            return;
          }
          const url = new URL(`/api${incoming.url || ""}`, `http://${incoming.headers.host}`);
          const request = new Request(url, {
            method: incoming.method,
            headers: incoming.headers,
            body: ["GET", "HEAD"].includes(incoming.method)
              ? undefined
              : Buffer.concat(chunks),
          });
          const response = await handleApi(request, localStorage);
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
          );
          outgoing.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.ssrFixStacktrace?.(error);
          outgoing.writeHead(500, { "content-type": "application/json" });
          outgoing.end(JSON.stringify({ error: "Erro interno." }));
        }
      });
    },
  };
}
