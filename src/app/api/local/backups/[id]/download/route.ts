import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  getBackupForDownload,
  isLocalBackupRequestAllowed,
} from "@/lib/local-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!isLocalBackupRequestAllowed(request.headers.get("host"))) {
    return NextResponse.json({ error: "Operação permitida apenas em localhost." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const backup = await getBackupForDownload(id);
    const fileStat = await stat(backup.path);
    const stream = createReadStream(backup.path);

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Length": String(fileStat.size),
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(backup.filename)}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível baixar o backup.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
