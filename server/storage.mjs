import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const projectKey = createHash("sha256")
  .update(process.cwd().toLowerCase())
  .digest("hex")
  .slice(0, 12);
const root =
  process.env.STREET_DATA_DIR || join(homedir(), ".street-doces", projectKey);
const safeKey = (key) => {
  if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes(".."))
    throw new Error("Chave inválida");
  return key;
};
const fileFor = (key) => join(root, `${safeKey(key)}.json`);
const etag = (data) =>
  `"${createHash("sha256").update(JSON.stringify(data)).digest("hex")}"`;

export const localStorage = {
  async get(key) {
    try {
      return JSON.parse(await readFile(fileFor(key), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  },
  async getWithEtag(key) {
    const data = await this.get(key);
    return { data, etag: data === null ? null : etag(data) };
  },
  async set(key, data, expectedEtag) {
    const file = fileFor(key);
    const current = await this.get(key);
    if (
      expectedEtag !== undefined &&
      (current === null ? null : etag(current)) !== expectedEtag
    )
      return false;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data, null, 2), "utf8");
    return true;
  },
  async list(prefix) {
    const folder = join(root, safeKey(prefix));
    try {
      return (await readdir(folder))
        .filter((name) => name.endsWith(".json"))
        .map((name) => `${prefix}${name.slice(0, -5)}`);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  },
  async delete(key) {
    await rm(fileFor(key), { force: true });
  },
};

export async function blobStorage() {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "street-doces-data", consistency: "strong" });
  return {
    get: (key) => store.get(safeKey(key), { type: "json" }),
    async getWithEtag(key) {
      const entry = await store.getWithMetadata(safeKey(key), { type: "json" });
      return { data: entry?.data ?? null, etag: entry?.etag ?? null };
    },
    async set(key, data, expectedEtag) {
      const options =
        expectedEtag === undefined
          ? {}
          : expectedEtag === null
            ? { onlyIfNew: true }
            : { onlyIfMatch: expectedEtag };
      const result = await store.setJSON(safeKey(key), data, options);
      return result.modified;
    },
    async list(prefix) {
      const keys = [];
      for await (const page of store.list({ prefix: safeKey(prefix), paginate: true }))
        keys.push(...page.blobs.map((entry) => entry.key));
      return keys;
    },
    delete: (key) => store.delete(safeKey(key)),
  };
}
