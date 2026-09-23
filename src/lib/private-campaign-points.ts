import "server-only";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";

const HASH = "3430B70EECB413C7B162093232E448696C5704009D2D11AAEC1D131DA94B6377";

// Private local fallback. A deployment without this source must use published data.
export function readPrivateCampaignPoints(): CampaignMapPoint[] {
  try {
    const bytes = readFileSync(path.resolve(process.cwd(), "../private-results", `campaign-map-points.json.${HASH}`));
    if (createHash("sha256").update(bytes).digest("hex").toUpperCase() !== HASH) return [];
    const data: unknown = JSON.parse(bytes.toString("utf8"));
    return Array.isArray(data) ? data as CampaignMapPoint[] : [];
  } catch { return []; }
}
