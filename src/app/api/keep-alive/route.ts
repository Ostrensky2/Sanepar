import { NextRequest, NextResponse } from "next/server";
import { createOptionalSupabaseClient } from "@/lib/supabase";

// Called by Vercel Cron every 4 days to prevent Supabase free-tier auto-pause.
// Vercel passes the CRON_SECRET header automatically; we validate it so external
// callers cannot trigger the route.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({
      status: "skipped",
      reason: "Supabase not configured — running in local mode",
      checkedAt: new Date().toISOString(),
    });
  }

  const start = Date.now();

  const { error } = await supabase
    .from("campaign_imports")
    .select("id")
    .limit(1)
    .maybeSingle();

  const latencyMs = Date.now() - start;

  if (error && error.code !== "PGRST116") {
    return NextResponse.json(
      {
        status: "error",
        error: error.message,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: "ok",
    message: "Supabase keep-alive ping successful",
    latencyMs,
    checkedAt: new Date().toISOString(),
  });
}
