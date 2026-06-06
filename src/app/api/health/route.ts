import { NextResponse } from "next/server";
import { createOptionalSupabaseClient, getCloudRuntimeMode } from "@/lib/supabase";

export async function GET() {
  const runtimeMode = getCloudRuntimeMode();
  const supabase = createOptionalSupabaseClient();
  let supabaseStatus: "configured" | "pending" | "unavailable" =
    runtimeMode === "nuvem pronta" ? "configured" : "pending";
  let supabaseMessage = supabaseStatus === "configured"
    ? "Supabase configurado e respondendo."
    : "Supabase não configurado neste ambiente.";

  if (supabase) {
    const { error } = await supabase
      .from("campaign_imports")
      .select("id", { head: true })
      .limit(1);

    if (error) {
      supabaseStatus = "unavailable";
      supabaseMessage = `Supabase configurado, mas indisponível: ${error.message}`;
    }
  }

  return NextResponse.json({
    status: supabaseStatus === "unavailable" ? "degraded" : "ok",
    app: "yvae-monitoramento",
    checkedAt: new Date().toISOString(),
    runtimeMode,
    services: {
      vercel: "ready",
      supabase: supabaseStatus,
      storage: "dropbox-external-links",
    },
    messages: {
      supabase: supabaseMessage,
    },
  });
}
