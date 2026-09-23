import { requireApiSession } from "@/lib/api-auth";
import { readPrivateCampaignPoints } from "@/lib/private-campaign-points";
import { buildFieldDiaryPointOptions } from "@/components/field-diary/helpers";
import { getLatestPublishedCampaignImport } from "@/lib/supabase";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const localPoints = readPrivateCampaignPoints();
  const points = localPoints.length ? localPoints : (await getLatestPublishedCampaignImport())?.points ?? [];
  const options = buildFieldDiaryPointOptions(points);
  return Response.json({ options }, { status: options.length ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
