import "server-only";
import { campaignFromQuery } from "@/lib/campaign-identity";
import { createOptionalSupabaseClient } from "@/lib/supabase";

type DiaryScope = { campaign_id: string | null; campaign_name: string; sia: string | null };
export function diaryContainsPoint(rows: DiaryScope[], campaign: number, sia: number) {
  const target = campaignFromQuery(String(campaign));
  if (!target || !Number.isSafeInteger(sia) || sia < 0) return false;
  const aliases = new Set([target.id, target.name, String(campaign), `C${campaign}`, `Campanha ${campaign}`]);
  return rows.some(row => {
    const id = row.campaign_id?.trim(), name = row.campaign_name?.trim();
    // Conflicting identifiers never inherit the other field's identity.
    if ((!id && !name) || (id && !aliases.has(id)) || (name && !aliases.has(name))) return false;
    const match = /^(?:SIA[-\s]*)?(\d{1,6})$/i.exec(row.sia?.trim() ?? "");
    return Boolean(match && Number(match[1]) === sia);
  });
}

/** Called only after the route's data.view + campaigns.view checks. No index or writes. */
export async function authorizedDiaryPointExists(campaign: number, sia: number) {
  const client = createOptionalSupabaseClient();
  if (!client) throw Error("Diary unavailable");
  const { data, error } = await client.from("field_diary_entries")
    .select("campaign_id,campaign_name,sia").limit(10001).returns<DiaryScope[]>();
  if (error || !data || data.length > 10000) throw Error("Diary scope unavailable");
  return diaryContainsPoint(data, campaign, sia);
}

/** Same check as authorizedDiaryPointExists, for many SIAs of one campaign with a single read. */
export async function authorizedDiarySias(campaign: number, sias: number[]) {
  const client = createOptionalSupabaseClient();
  if (!client) throw Error("Diary unavailable");
  const { data, error } = await client.from("field_diary_entries")
    .select("campaign_id,campaign_name,sia").limit(10001).returns<DiaryScope[]>();
  if (error || !data || data.length > 10000) throw Error("Diary scope unavailable");
  return new Set(sias.filter(sia => diaryContainsPoint(data, campaign, sia)));
}
