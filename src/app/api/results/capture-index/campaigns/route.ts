import { requireApiSession } from "@/lib/api-auth";
import { captureIndexMeta } from "@/lib/capture-index";
import { captureIndexResultsCampaigns, placeKey, type CapturePointPlace } from "@/lib/capture-index/results-adapter";
import { loadDashboardData } from "@/lib/dashboard-data";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Índice de captação no formato das telas de resultados (mapa, ranking, municípios, evolução).
 * As coordenadas e os nomes vêm dos pontos de campo, só leitura; sem eles o ponto aparece nas tabelas e fica fora do mapa. */
export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.view");
  if (!auth.ok) return auth.response;
  const places = new Map<string, CapturePointPlace>();
  try {
    for (const point of (await loadDashboardData()).campaignPoints) {
      if (!point.effective) continue;
      const place = { latitude: point.effective.lat, longitude: point.effective.lon, waterBody: point.waterBody || null, municipality: point.municipality || null };
      // A coordenada da própria campanha tem prioridade; a de outra campanha só serve de reserva para o mesmo código SIA.
      const campaign = Number(String(point.campaign ?? "").match(/\d+/)?.[0]);
      if (campaign >= 1 && campaign <= 9 && !places.has(placeKey(point.code, campaign))) places.set(placeKey(point.code, campaign), place);
      if (!places.has(placeKey(point.code))) places.set(placeKey(point.code), place);
    }
  } catch {
    // Sem os pontos de campo o índice continua disponível, apenas sem localização.
  }
  return Response.json({ version: captureIndexMeta.version, status: captureIndexMeta.status, campaigns: captureIndexResultsCampaigns(places) }, { headers: noStore });
}
