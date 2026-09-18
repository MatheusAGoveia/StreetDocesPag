import { neon } from "@neondatabase/serverless";

const table = "street_doces_data";
const schema = `
  CREATE TABLE IF NOT EXISTS ${table} (
    storage_key text PRIMARY KEY,
    data jsonb NOT NULL,
    version bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

function safeKey(key) {
  if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes(".."))
    throw new Error("Chave inválida");
  return key;
}

// query(text, params) returns rows. This small seam also lets tests execute
// the exact statements against an in-memory PostgreSQL engine.
export function createPostgresStorage(query) {
  let initialized;
  async function ready() {
    if (!initialized) {
      initialized = query(schema, []).catch((error) => {
        initialized = undefined;
        throw error;
      });
    }
    await initialized;
  }
  async function rows(text, params = []) {
    await ready();
    return query(text, params);
  }

  return {
    async get(key) {
      return (await this.getWithEtag(key)).data;
    },
    async getWithEtag(key) {
      const result = await rows(
        `SELECT data, version::text AS version FROM ${table} WHERE storage_key = $1`,
        [safeKey(key)],
      );
      return result.length
        ? { data: result[0].data, etag: result[0].version }
        : { data: null, etag: null };
    },
    async set(key, data, expectedEtag) {
      const name = safeKey(key);
      const value = JSON.stringify(data);
      let result;
      if (expectedEtag === null) {
        result = await rows(
          `INSERT INTO ${table} (storage_key, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (storage_key) DO NOTHING RETURNING version`,
          [name, value],
        );
      } else if (expectedEtag === undefined) {
        result = await rows(
          `INSERT INTO ${table} (storage_key, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (storage_key) DO UPDATE SET
             data = EXCLUDED.data, version = ${table}.version + 1,
             updated_at = now() RETURNING version`,
          [name, value],
        );
      } else {
        if (!/^\d+$/.test(expectedEtag)) return false;
        result = await rows(
          `UPDATE ${table} SET data = $2::jsonb, version = version + 1,
             updated_at = now()
           WHERE storage_key = $1 AND version = $3::bigint RETURNING version`,
          [name, value, expectedEtag],
        );
      }
      return result.length > 0;
    },
    async list(prefix) {
      const result = await rows(
        `SELECT storage_key FROM ${table}
         WHERE left(storage_key, length($1)) = $1 ORDER BY storage_key`,
        [safeKey(prefix)],
      );
      return result.map((row) => row.storage_key);
    },
    async listValues(prefix) {
      const result = await rows(
        `SELECT data FROM ${table}
         WHERE left(storage_key, length($1)) = $1 ORDER BY storage_key`,
        [safeKey(prefix)],
      );
      return result.map((row) => row.data);
    },
    async delete(key) {
      await rows(`DELETE FROM ${table} WHERE storage_key = $1`, [safeKey(key)]);
    },
  };
}

let liveStorage;
let liveUrl;
export function postgresStorage() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("POSTGRES_NOT_CONFIGURED");
  if (!liveStorage || liveUrl !== url) {
    const sql = neon(url);
    liveStorage = createPostgresStorage((text, params) => sql.query(text, params));
    liveUrl = url;
  }
  return liveStorage;
}
