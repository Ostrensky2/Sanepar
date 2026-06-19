import { NextResponse } from "next/server";
import { clearSessionCookie, readSessionFromRequest } from "@/lib/api-auth";
import { getCloudRuntimeMode } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (getCloudRuntimeMode() === "modo local") {
    return NextResponse.json({ active: true, mode: "local" });
  }

  const session = readSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  return NextResponse.json({
    active: true,
    session: {
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
    },
  });
}

export async function DELETE() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
