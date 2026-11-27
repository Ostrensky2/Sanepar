import { tapeHandler } from "@/lib/integrations/tape/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = tapeHandler;
export const POST = tapeHandler;
export const DELETE = tapeHandler;
