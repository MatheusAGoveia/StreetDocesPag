import { randomBytes, scryptSync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

function readPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Execute em um terminal interativo ou use --generate.");
  }
  process.stdout.write("Nova senha do administrador (mínimo 12 caracteres): ");
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.off("data", onData);
      process.stdin.pause();
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (character === "\b" || character === "\u007f")
          value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

const emailArg = process.argv.find((arg) => arg.startsWith("--email="));
const adminEmail = (
  emailArg?.slice(8) || "admin@streetdoces.local"
).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  throw new Error("Informe um e-mail válido com --email=.");
}
const generated = process.argv.includes("--generate");
const password = generated
  ? randomBytes(18).toString("base64url")
  : await readPassword();
if (password.length < 12) {
  console.error("A senha precisa ter pelo menos 12 caracteres.");
  process.exit(1);
}
const salt = randomBytes(24).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
const secret = randomBytes(48).toString("hex");
let existing = "";
try {
  existing = await readFile(".env.local", "utf8");
} catch {
  /* primeiro acesso */
}
const retained = existing
  .split(/\r?\n/)
  .filter(
    (line) =>
      line && !/^(ADMIN_EMAIL|ADMIN_PASSWORD_HASH|SESSION_SECRET)=/.test(line),
  );
await writeFile(
  ".env.local",
  [
    ...retained,
    `ADMIN_EMAIL=${adminEmail}`,
    `ADMIN_PASSWORD_HASH=${salt}:${hash}`,
    `SESSION_SECRET=${secret}`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(`Administrador configurado: ${adminEmail}`);
if (generated) console.log(`Senha gerada (guarde agora): ${password}`);
console.log(
  "Reinicie npm run dev para ativar as credenciais. Em produção, configure as três variáveis no Netlify.",
);
