const safeKey = (key) => {
  if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes(".."))
    throw new Error("Chave inválida");
  return key;
};
const pathname = (key) => `street-doces/${safeKey(key)}.json`;

export function createVercelBlobStorage(blob) {
  return {
    async get(key) {
      return (await this.getWithEtag(key)).data;
    },
    async getWithEtag(key) {
      const result = await blob.get(pathname(key), {
        access: "private",
        useCache: false,
      });
      if (!result) return { data: null, etag: null };
      if (result.statusCode !== 200 || !result.stream)
        throw new Error("Não foi possível ler os dados da loja.");
      const data = await new Response(result.stream).json();
      return { data, etag: result.blob.etag };
    },
    async set(key, data, expectedEtag) {
      if (expectedEtag === null && (await this.get(key)) !== null)
        return false;
      try {
        await blob.put(pathname(key), JSON.stringify(data), {
          access: "private",
          contentType: "application/json",
          allowOverwrite: expectedEtag !== null,
          cacheControlMaxAge: 60,
          ...(expectedEtag ? { ifMatch: expectedEtag } : {}),
        });
        return true;
      } catch (error) {
        if (expectedEtag && error instanceof blob.BlobPreconditionFailedError)
          return false;
        throw error;
      }
    },
    async list(prefix) {
      const names = [];
      let cursor;
      do {
        const page = await blob.list({ prefix: `street-doces/${safeKey(prefix)}`, cursor, limit: 1000 });
        for (const entry of page.blobs) {
          if (entry.pathname.endsWith(".json"))
            names.push(entry.pathname.slice("street-doces/".length, -".json".length));
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return names;
    },
    async delete(key) {
      await blob.del(pathname(key));
    },
  };
}

export async function vercelBlobStorage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN &&
      !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN))
    throw new Error("VERCEL_BLOB_NOT_CONFIGURED");
  return createVercelBlobStorage(await import("@vercel/blob"));
}
