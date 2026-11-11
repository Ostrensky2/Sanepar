import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

// Exclusão administrativa dos dados de uma campanha: ou apaga tudo, ou não apaga nada.

const auth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: fake } = await import("@/test/fake-supabase");
  return { createOptionalSupabaseClient: () => fake.client() };
});

import { DELETE } from "@/app/api/imports/campaigns/route";

const CAMPAIGN = "4ª Campanha";

function remove(campaignName = CAMPAIGN) {
  return DELETE(
    new Request(`https://example.test/api/imports/campaigns?campaignName=${encodeURIComponent(campaignName)}`, {
      method: "DELETE",
    }),
  );
}

beforeEach(() => {
  auth.mockReset();
  auth.mockResolvedValue({ ok: true, session: { name: "Admin" } });
  fakeSupabase.reset();
  fakeSupabase.seed("field_diary_entries", [
    { id: "e1", campaign_name: CAMPAIGN },
    { id: "e2", campaign_name: CAMPAIGN },
    { id: "e3", campaign_name: "3ª Campanha" },
  ]);
  fakeSupabase.seed("field_diary_change_log", [
    { id: 1, campaign_name: CAMPAIGN },
    { id: 2, campaign_name: "3ª Campanha" },
  ]);
  fakeSupabase.seed("campaign_imports", [{ id: 1, campaign_key: CAMPAIGN.toLowerCase() }]);
  fakeSupabase.seed("field_diary_samples", []);
});

describe("DELETE /api/imports/campaigns", () => {
  it("pede a permissão de apagar dados", async () => {
    await remove();

    expect(auth).toHaveBeenCalledWith(expect.any(Request), "data.delete");
  });

  it("apaga histórico, registros e importações de uma campanha sem amostras", async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    expect(fakeSupabase.rows("field_diary_entries").map((row) => row.id)).toEqual(["e3"]);
    expect(fakeSupabase.rows("field_diary_change_log").map((row) => row.id)).toEqual([2]);
    expect(fakeSupabase.rows("campaign_imports")).toEqual([]);
  });

  it("não apaga nada quando a campanha tem amostra registrada", async () => {
    fakeSupabase.seed("field_diary_samples", [{ id: "s1", entry_id: "e2" }]);

    const response = await remove();
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(payload.error).toContain("1 amostra registrada");
    expect(payload.error).toContain("Nada foi apagado");
    expect(fakeSupabase.rows("field_diary_entries")).toHaveLength(3);
    expect(fakeSupabase.rows("field_diary_change_log")).toHaveLength(2);
    expect(fakeSupabase.rows("campaign_imports")).toHaveLength(1);
    expect(fakeSupabase.operations().filter((operation) => operation.endsWith(":delete"))).toEqual([]);
  });

  it("não se importa com amostra de outra campanha", async () => {
    fakeSupabase.seed("field_diary_samples", [{ id: "s1", entry_id: "e3" }]);

    const response = await remove();

    expect(response.status).toBe(200);
    expect(fakeSupabase.rows("field_diary_entries").map((row) => row.id)).toEqual(["e3"]);
  });

  it("segue como antes quando o banco ainda não tem a tabela de amostras", async () => {
    fakeSupabase.setMissing("field_diary_samples");

    const response = await remove();

    expect(response.status).toBe(200);
    expect(fakeSupabase.rows("field_diary_entries").map((row) => row.id)).toEqual(["e3"]);
  });

  it("não apaga nada quando não consegue conferir as amostras", async () => {
    fakeSupabase.failOn("field_diary_samples", "select", { code: "57014", message: "timeout" });

    const response = await remove();

    expect(response.status).toBe(500);
    expect(fakeSupabase.rows("field_diary_entries")).toHaveLength(3);
    expect(fakeSupabase.rows("field_diary_change_log")).toHaveLength(2);
  });

  it("recusa o pedido sem nome de campanha", async () => {
    const response = await remove("");

    expect(response.status).toBe(400);
    expect(fakeSupabase.rows("field_diary_entries")).toHaveLength(3);
  });
});
