import "server-only";
import path from "node:path";
import { stat } from "node:fs/promises";
import { workbookStore } from "@/lib/sia-workbook-store";
import { cloudWorkbookStore } from "@/lib/sia-workbook-cloud";
import { createOptionalSupabaseClient } from "@/lib/supabase";

/** Acervo privado das planilhas unificadas por campanha (Central de dados › Planilhas de resultados).
 * Em produção, o bucket privado do projeto; na cópia local, a pasta `.local-nuvem/artifacts/sia-workbooks`.
 * Nunca há leitura de outro ambiente: produção fora do projeto oficial ou cópia local sem a pasta falham. */
export async function siaWorkbookStore() {
  if (process.env.VERCEL === "1") {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") !== "https://uoptbbmfgfiuhbmicofp.supabase.co" || process.env.VERCEL_ENV !== "production") throw Error("PRIVATE_STORE_UNAVAILABLE");
    const client = createOptionalSupabaseClient();
    if (!client) throw Error("PRIVATE_STORE_UNAVAILABLE");
    return cloudWorkbookStore(client);
  }
  const base = path.resolve(process.cwd(), "../.local-nuvem");
  if (!(await stat(path.join(base, "rodar-local.ps1"))).isFile()) throw Error("LOCAL_STORE_UNAVAILABLE");
  return workbookStore(path.join(base, "artifacts", "sia-workbooks"));
}
