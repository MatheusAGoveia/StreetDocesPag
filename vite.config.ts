import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error O plugin local é um módulo JavaScript de servidor.
import streetApi from "./server/vite-plugin.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const nodeProcess = globalThis as typeof globalThis & {
    process: { env: Record<string, string | undefined> };
  };
  for (const key of ["ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "SESSION_SECRET"]) {
    if (env[key]) nodeProcess.process.env[key] = env[key];
  }
  return {
    plugins: [react(), streetApi()],
    server: { fs: { deny: [".env", ".env.*", ".local-data/**"] } },
  };
});
