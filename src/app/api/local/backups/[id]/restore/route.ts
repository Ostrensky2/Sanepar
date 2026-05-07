import { NextResponse } from "next/server";
import {
  isLocalBackupRequestAllowed,
  restoreDatabaseBackup,
} from "@/lib/local-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  if (!isLocalBackupRequestAllowed(request.headers.get("host"))) {
    return NextResponse.json({ error: "Operação permitida apenas em localhost." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as { confirmation?: string };
    const result = await restoreDatabaseBackup(id, payload.confirmation ?? "");

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível restaurar o backup.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
