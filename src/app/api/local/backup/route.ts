import { NextResponse } from "next/server";
import {
  createLocalAppBackup,
  isLocalBackupRequestAllowed,
} from "@/lib/local-backup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isLocalBackupRequestAllowed(request.headers.get("host"))) {
    return NextResponse.json(
      {
        error:
          "Backup local disponível apenas em localhost. Esta ação não funciona em ambiente de nuvem.",
      },
      { status: 403 },
    );
  }

  try {
    const backup = await createLocalAppBackup();

    return NextResponse.json({
      ...backup,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível gerar o backup local do aplicativo.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
