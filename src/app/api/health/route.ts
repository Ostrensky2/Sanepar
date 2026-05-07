import { NextResponse } from "next/server";
import { getCloudRuntimeMode } from "@/lib/supabase";

export function GET() {
  const runtimeMode = getCloudRuntimeMode();

  return NextResponse.json({
    status: "ok",
    app: "yvae-monitoramento",
    checkedAt: new Date().toISOString(),
    runtimeMode,
    services: {
      vercel: "ready",
      supabase: runtimeMode === "nuvem pronta" ? "configured" : "pending",
      storage: "dropbox-external-links",
    },
  });
}
