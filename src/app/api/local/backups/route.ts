import { NextResponse } from "next/server";
import {
  createDailyBackup,
  createDatabaseBackup,
  createLocalAppBackup,
  enforceRetentionPolicy,
  getOperationLogs,
  isLocalBackupRequestAllowed,
  listBackupHistory,
} from "@/lib/local-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLocalBackupRequestAllowed(request.headers.get("host"))) {
    return blockedResponse();
  }

  try {
    const [backups, logs] = await Promise.all([listBackupHistory(), getOperationLogs()]);

    return NextResponse.json({ ok: true, backups, logs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!isLocalBackupRequestAllowed(request.headers.get("host"))) {
    return blockedResponse();
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as { action?: string };

    switch (payload.action) {
      case "app":
        return NextResponse.json(await createLocalAppBackup());
      case "database":
        return NextResponse.json(await createDatabaseBackup());
      case "daily":
        return NextResponse.json(await createDailyBackup());
      case "cleanup":
        return NextResponse.json(await enforceRetentionPolicy());
      default:
        return NextResponse.json({ error: "Ação de backup inválida." }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}

function blockedResponse() {
  return NextResponse.json(
    {
      error:
        "Backups locais disponíveis apenas em localhost. Esta ação não funciona em ambiente de nuvem.",
    },
    { status: 403 },
  );
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Não foi possível executar a operação de backup.";

  return NextResponse.json({ error: message }, { status: 500 });
}
