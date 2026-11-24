import { requireApiSession } from "@/lib/api-auth";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const RETIRED = "A planilha antiga do laboratório não é mais lida nem publicada. Os resultados vêm das matrizes por SIA, em Central de dados › Planilhas de resultados.";

/** Fluxo antigo de publicação da planilha do laboratório (banco em espécie, de setembro de 2026): desativado em 24/11/2026.
 * Nada do que foi publicado por ele é lido. As consultas respondem como "sem publicação", para as telas que ainda perguntam;
 * os resultados exibidos vêm do índice de captação (`/api/results/capture-index`) e das matrizes por SIA (`/api/results/organisms`). */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const query = new URL(request.url).searchParams;
  if (query.get("source") === "preparation") return Response.json({ error: RETIRED, code: "legacy_results_retired" }, { status: 410, headers: noStore });
  if (query.get("inventory") === "1")
    return Response.json({ campaigns: [], totalCampaigns: 9, publishedCount: 0, expectedHeads: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`C${index + 1}`, null])), historicalPublications: [] }, { headers: noStore });
  if (!query.get("campaignId")?.trim() && !query.get("campaignNumber")?.trim()) return Response.json({ error: "Informe campaignId ou campaignNumber." }, { status: 400, headers: noStore });
  return Response.json({ status: "empty", publication: null, campaign: null, viewModel: null }, { headers: noStore });
}

async function retired(request: Request, permission: "data.import" | "data.delete") {
  const auth = await requireApiSession(request, permission);
  if (!auth.ok) return auth.response;
  return Response.json({ error: RETIRED, code: "legacy_results_retired" }, { status: 410, headers: noStore });
}
export async function POST(request: Request) { return retired(request, "data.import"); }
export async function DELETE(request: Request) { return retired(request, "data.delete"); }
