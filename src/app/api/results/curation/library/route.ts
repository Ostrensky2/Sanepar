import "server-only";
import { requireApiSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.view");
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
  if (!auth.ok) {
    return new Response(null, { status: auth.response.status, headers });
  }
  const { scientificLibrary } = await import("@/lib/observed-curation/scientific-library.server");
  return Response.json(scientificLibrary, { headers });
}
