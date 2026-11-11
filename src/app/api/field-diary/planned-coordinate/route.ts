import { requireApiSession } from "@/lib/api-auth";
import { findPlannedCoordinate } from "@/lib/planned-coordinate";
import { readPrivateCampaignPoints } from "@/lib/private-campaign-points";
import { getLatestPublishedCampaignImport } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_PARAM_LENGTH = 200;

/**
 * Coordenada planejada de UM ponto, para o botão "Iniciar coleta" do registro de
 * campo. Só para quem pode registrar coleta (mesma permissão de gravar o registro);
 * a lista de pontos do formulário continua sem coordenadas.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const read = (name: string) => (params.get(name) ?? "").slice(0, MAX_PARAM_LENGTH);
  const localPoints = readPrivateCampaignPoints();
  const points = localPoints.length ? localPoints : (await getLatestPublishedCampaignImport())?.points ?? [];
  const planned = findPlannedCoordinate(points, {
    sia: read("sia"),
    locationName: read("locationName"),
    municipality: read("municipality"),
    campaignId: read("campaignId"),
    campaignName: read("campaignName"),
  });

  return Response.json({ planned }, { headers: { "Cache-Control": "no-store" } });
}
