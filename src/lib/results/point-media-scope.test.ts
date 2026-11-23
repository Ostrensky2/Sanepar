import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:vi.fn()}));
import { diaryContainsPoint } from "./point-media-scope";
it("requires a matching neutral diary campaign and point, not a supplied identifier alone",()=>{
  const rows=[{campaign_id:"campanha-2-outono-2026",campaign_name:"2ª Campanha - Outono 2026",sia:"SIA 000123"}];
  expect(diaryContainsPoint(rows,2,123)).toBe(true);
  expect(diaryContainsPoint(rows,1,123)).toBe(false);
  expect(diaryContainsPoint(rows,2,124)).toBe(false);
  expect(diaryContainsPoint([],2,123)).toBe(false);
  expect(diaryContainsPoint([{...rows[0],campaign_name:"Campanha 1"}],2,123)).toBe(false);
  expect(diaryContainsPoint([{...rows[0],sia:"123 / 456"}],2,123)).toBe(false);
});
