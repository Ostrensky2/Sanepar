import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const rootEnvPath = new URL("../../.vercel/.env.production.local", import.meta.url);
const webEnvPath = new URL("../.vercel/.env.production.local", import.meta.url);

const localUrl = "http://127.0.0.1:54321";

const tables = [
  "campaign_imports",
  "point_actions",
  "app_documents",
  "auth_users",
  "support_requests",
  "field_diary_entries",
];

const env = {
  ...(await readEnvFile(rootEnvPath).catch(() => ({}))),
  ...(await readEnvFile(webEnvPath).catch(() => ({}))),
};

const cloudUrl = sanitize(env.NEXT_PUBLIC_SUPABASE_URL);
const cloudKey = sanitize(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const localSecretKey = sanitize(
  process.env.LOCAL_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.LOCAL_SUPABASE_SECRET_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY,
);

if (!cloudUrl || !cloudKey) {
  throw new Error("Credenciais NEXT_PUBLIC_SUPABASE_URL/KEY nao encontradas nos arquivos .vercel.");
}

if (!localSecretKey) {
  throw new Error("Configure LOCAL_SUPABASE_SECRET_KEY para sincronizar com o Supabase local.");
}

const cloud = createClient(cloudUrl, cloudKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const local = createClient(localUrl, localSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const downloaded = new Map();

for (const table of tables) {
  const rows = await fetchAllRows(table);
  downloaded.set(table, rows);
  console.log(`${table}: ${rows.length} registro(s) baixado(s)`);
}

for (const table of tables) {
  const { error } = await local.from(table).delete().not("id", "is", null);
  if (error) {
    throw new Error(`Falha ao limpar ${table} no localhost: ${error.message}`);
  }
}

for (const table of tables) {
  const rows = downloaded.get(table) ?? [];

  if (!rows.length) {
    console.log(`${table}: localhost limpo`);
    continue;
  }

  for (const chunk of chunkRows(rows, 250)) {
    const { error } = await local.from(table).upsert(chunk);
    if (error) {
      throw new Error(`Falha ao gravar ${table} no localhost: ${error.message}`);
    }
  }

  console.log(`${table}: ${rows.length} registro(s) gravado(s) no localhost`);
}

async function fetchAllRows(table) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await cloud.from(table).select("*").range(from, to);

    if (error) {
      if (isMissingTableError(error)) {
        console.log(`${table}: tabela ausente/inacessivel na nuvem, usando lista vazia`);
        return [];
      }

      throw new Error(`Falha ao ler ${table} na nuvem: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      return rows;
    }
  }
}

async function readEnvFile(fileUrl) {
  const content = await readFile(fileUrl, "utf8");
  const entries = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    entries[key] = valueParts.join("=");
  }

  return entries;
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function sanitize(value) {
  return value?.replace(/\\r\\n|\\n|\\r/g, "").replace(/[\r\n]/g, "").trim().replace(/^["']|["']$/g, "");
}

function isMissingTableError(error) {
  return error.code === "42P01" || /Could not find the table|does not exist/i.test(error.message);
}
