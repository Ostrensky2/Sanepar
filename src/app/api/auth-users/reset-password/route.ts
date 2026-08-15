import { NextResponse } from "next/server";
import { checkRateLimit, requireTrustedOrigin } from "@/lib/api-auth";
import { createRequestAuthClient } from "@/lib/supabase-auth";

export const runtime = "nodejs";
const UNIFORM = { ok: true, message: "Se o endereço estiver autorizado, as instruções serão enviadas." };

export async function POST(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const limit = await checkRateLimit("recovery", request, email || "invalid", 5, 3600, 3600);
  if (limit.unavailable) return NextResponse.json({ error: "Proteção de acesso indisponível." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json(UNIFORM, { status: 202 });
  const auth = createRequestAuthClient(request); const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!auth || !appOrigin) return NextResponse.json({ error: "Recuperação indisponível." }, { status: 503 });
  if (email && email.length <= 254) await auth.client.auth.resetPasswordForEmail(email, { redirectTo: `${appOrigin}/auth/callback?type=recovery&next=/definir-senha` });
  return NextResponse.json(UNIFORM, { status: 202, headers: { "Cache-Control": "no-store" } });
}
