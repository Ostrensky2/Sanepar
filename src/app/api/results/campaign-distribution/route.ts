import "server-only";
import { requireApiSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireApiSession(request, "data.view");
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
  if (!session.ok) return new Response(null, { status: session.response.status, headers });
  const { results08HomeDistribution } = await import("@/lib/results-08-aggregate");
  return Response.json(results08HomeDistribution(), { headers });
}
