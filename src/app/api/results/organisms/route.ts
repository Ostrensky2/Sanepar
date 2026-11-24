import { requireApiSession } from "@/lib/api-auth";
import { captureFichas } from "@/lib/capture-index";
import { organismDocument, organismOccurrences, organismsCampaign } from "@/lib/results-organisms";
import { ORGANISM_LEVELS, type OrganismLevel, type OrganismMarker } from "@/lib/results-organisms/contract";

export const runtime = "nodejs";
// A primeira consulta de cada campanha baixa e lê a planilha unificada (alguns segundos); as seguintes usam a memória.
export const maxDuration = 60;
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fichaLevel: Partial<Record<OrganismLevel, string>> = { genero: "genus", familia: "family" };

/** Organismos detectados numa campanha, pela planilha unificada do acervo privado, que traz as matrizes por SIA do laboratório
 * (gênero, família, grupos de risco e exóticas em espécie).
 * Sem `taxon`: lista do nível pedido. Com `taxon`: os SIAs em que ele ocorre. Uma campanha por consulta; nada é somado entre campanhas. */
export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.view");
  if (!auth.ok) return auth.response;
  const query = new URL(request.url).searchParams;
  const allowed = new Set(["campaign", "marker", "level", "taxon"]);
  const campaignText = query.get("campaign") ?? "", marker = (query.get("marker") ?? "16S") as OrganismMarker;
  const level = (query.get("level") ?? ORGANISM_LEVELS[marker]?.[0]) as OrganismLevel, taxon = query.get("taxon");
  if ([...query.keys()].some(key => !allowed.has(key) || query.getAll(key).length > 1) || !/^[1-9]$/.test(campaignText)
    || !(marker in ORGANISM_LEVELS) || !ORGANISM_LEVELS[marker].includes(level) || (taxon !== null && (!taxon.trim() || taxon.length > 200)))
    return Response.json({ error: "Opção inválida." }, { status: 422, headers: noStore });
  const campaign = Number(campaignText);
  let document;
  try { document = await organismDocument(campaign); }
  catch (error) {
    console.error("[organisms] planilha unificada indisponível:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Planilha unificada da campanha indisponível no momento. Tente de novo em instantes." }, { status: 503, headers: noStore });
  }
  if (!document) return Response.json({ error: "Esta campanha ainda não tem planilha unificada. Ela é gerada em Central de dados › Planilhas de resultados." }, { status: 404, headers: noStore });
  if (taxon !== null) {
    const occurrences = organismOccurrences(document, marker, level, taxon);
    return occurrences ? Response.json(occurrences, { headers: noStore }) : Response.json({ error: "Organismo não encontrado nesta campanha." }, { status: 404, headers: noStore });
  }
  const data = organismsCampaign(document);
  // Efeito no índice: só fichas que pontuam (não contestadas, com aplicabilidade) e no mesmo nível (gênero ou família); nas exóticas, pelo gênero da espécie.
  const fichas = captureFichas().filter(ficha => !ficha.contested && (ficha.applicability ?? 0) > 0);
  const effects = (name: string) => fichas.filter(ficha => level === "exoticas" ? ficha.taxon === name || ficha.taxon === name.split(" ")[0]
    : ficha.level === fichaLevel[level] && ficha.taxon === name).map(ficha => ({ id: ficha.id, domain: ficha.domain }));
  const info = data.markers[marker];
  return Response.json({ campaign, source: data.source, marker, level,
    summary: Object.fromEntries((["16S", "COI"] as const).map(key => [key, { points: data.markers[key].points, usablePoints: data.markers[key].usablePoints, inconclusive: data.markers[key].inconclusive, runs: data.markers[key].runs }])),
    rows: (info.levels[level] ?? []).map(row => ({ ...row, effects: effects(row.name) })) }, { headers: noStore });
}
