import { requireApiSession } from "@/lib/api-auth";
import { captureIndexAuditCsv, captureIndexCampaigns, captureIndexCsv, captureIndexExportName, captureIndexMeta, captureIndexRows, captureIndexView, sha256Hex } from "@/lib/capture-index";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** O painel recebe os pontos em ordem de prioridade (posição na campanha). Painel (JSON), exportação de leitura (csv) e de auditoria (audit) saem da mesma saída versionada; nada é recalculado aqui. */
export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.view");
  if (!auth.ok) return auth.response;
  const query = new URL(request.url).searchParams;
  const allowed = new Set(["campaign", "format"]);
  const campaignText = query.get("campaign"), format = query.get("format") ?? "json";
  if ([...query.keys()].some(key => !allowed.has(key) || query.getAll(key).length > 1)
    || (campaignText !== null && !/^[1-9]$/.test(campaignText)) || !["json", "csv", "audit"].includes(format)) {
    return Response.json({ error: "Opção inválida." }, { status: 422, headers: noStore });
  }
  const campaign = campaignText === null ? undefined : Number(campaignText);
  const rows = captureIndexRows(campaign);
  if (format !== "json") {
    const body = format === "csv" ? captureIndexCsv(rows) : captureIndexAuditCsv(rows);
    return new Response(body, { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${captureIndexExportName(format === "csv" ? "leitura" : "auditoria", campaign)}"`,
      "X-Rows-SHA256": captureIndexMeta.rowsSha256, "X-Export-SHA256": sha256Hex(body) } });
  }
  return Response.json({ meta: captureIndexMeta, campaigns: captureIndexCampaigns(), rows: campaign === undefined ? [] : [...rows].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)).map(captureIndexView) }, { headers: noStore });
}
