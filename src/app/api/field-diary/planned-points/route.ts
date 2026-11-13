import { requireApiSession } from "@/lib/api-auth";
import { buildCampaignPlannedPoints } from "@/lib/nearest-point";
import { readPrivateCampaignPoints } from "@/lib/private-campaign-points";
import { getLatestPublishedCampaignImport } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Pontos de coleta com a coordenada planejada, para o registro de campo achar o
 * ponto mais próximo do celular, também sem sinal (o aparelho guarda a última
 * cópia). Só para quem pode registrar coleta, como /api/field-diary/planned-coordinate;
 * a lista de pontos do formulário continua sem coordenadas.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;

  const localPoints = readPrivateCampaignPoints();
  const points = localPoints.length ? localPoints : (await getLatestPublishedCampaignImport())?.points ?? [];

  return Response.json(
    { points: buildCampaignPlannedPoints(points) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
