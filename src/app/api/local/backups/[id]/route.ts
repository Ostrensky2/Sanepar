import { NextResponse } from "next/server";
import {
  deleteBackupById,
  isLocalBackupRequestAllowed,
} from "@/lib/local-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  if (!isLocalBackupRequestAllowed(request.headers.get("host"))) {
    return NextResponse.json({ error: "Operação permitida apenas em localhost." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    await deleteBackupById(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível excluir o backup.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
