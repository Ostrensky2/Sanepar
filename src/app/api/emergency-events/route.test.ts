import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

// Eventos emergenciais: Central de dados › Eventos emergenciais.

const auth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: fake } = await import("@/test/fake-supabase");
  return { createOptionalSupabaseClient: () => fake.client() };
});

import { DELETE, GET, PATCH, POST } from "@/app/api/emergency-events/route";

const TABLE = "emergency_events";
const URL = "https://example.test/api/emergency-events";
const ID = "4f0f3c1e-8a55-4c55-9d3e-1d1a2b3c4d5e";

const input = {
  name: "Filtros entupindo na ETA Iraí",
  reportedDate: "2026-11-20",
  visits: [
    { id: "ida-1", date: "2026-11-21", objective: "Primeira vistoria", activities: ["water", "edna", "photos"], notes: "" },
  ],
  mainProblem: "filter_clogging",
  sia: "780",
  location: "Captação ETA Iraí · Pinhais",
  description: "A operação avisou que os filtros entupiram duas vezes no mesmo dia.",
};

function send(handler: (request: Request) => Promise<Response>, method: string, body?: unknown, query = "") {
  return handler(
    new Request(URL + query, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  auth.mockReset();
  auth.mockResolvedValue({ ok: true, session: { name: "Vilmar" } });
  fakeSupabase.reset();
  fakeSupabase.seed(TABLE, []);
});

describe("/api/emergency-events", () => {
  it("cria, lista, altera e apaga um evento", async () => {
    const created = await send(POST, "POST", input);
    expect(created.status).toBe(201);
    const { event } = (await created.json()) as { event: Record<string, unknown> };
    expect(event).toMatchObject({
      name: input.name,
      reportedDate: "2026-11-20",
      visits: [
        {
          id: "ida-1",
          date: "2026-11-21",
          objective: "Primeira vistoria",
          activities: ["edna", "water", "photos"],
          activityOther: "",
          notes: "",
        },
      ],
      mainProblem: "filter_clogging",
      sia: "780",
      createdBy: "Vilmar",
    });
    expect(String(event.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(auth).toHaveBeenLastCalledWith(expect.any(Request), "data.import");

    const listed = await (await GET(new Request(URL))).json();
    expect(listed.available).toBe(true);
    expect(listed.events).toHaveLength(1);
    expect(auth).toHaveBeenLastCalledWith(expect.any(Request), "data.view");

    // Nova ida ao local, outro dia e com outro objetivo.
    const secondVisit = { id: "ida-2", date: "2026-11-25", objective: "Nova coleta", activities: ["plankton", "other"], activityOther: "Coleta de macrófitas" };
    const updated = await send(PATCH, "PATCH", {
      ...input,
      id: event.id,
      visits: [...input.visits, secondVisit],
      mainProblem: "other",
      mainProblemOther: "Rompimento de adutora",
    });
    expect(updated.status).toBe(200);
    const saved = (await updated.json()).event;
    expect(saved).toMatchObject({ mainProblem: "other", mainProblemOther: "Rompimento de adutora" });
    expect(saved.visits.map((visit: { id: string }) => visit.id)).toEqual(["ida-1", "ida-2"]);
    expect(saved.visits[1]).toMatchObject({ activities: ["plankton", "other"], activityOther: "Coleta de macrófitas" });
    expect(fakeSupabase.rows(TABLE)[0]).toMatchObject({ updated_by: "Vilmar" });
    expect((fakeSupabase.rows(TABLE)[0] as { visits: unknown[] }).visits).toHaveLength(2);

    const removed = await send(DELETE, "DELETE", undefined, `?id=${event.id}`);
    expect(removed.status).toBe(200);
    expect(auth).toHaveBeenLastCalledWith(expect.any(Request), "data.delete");
    expect(fakeSupabase.rows(TABLE)).toHaveLength(0);
  });

  it("recusa formulário incompleto apontando o campo, sem gravar", async () => {
    const response = await send(POST, "POST", { ...input, description: " " });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "description" });
    const visit = await send(POST, "POST", { ...input, visits: [{ objective: "Sem data" }] });
    expect(visit.status).toBe(400);
    expect(await visit.json()).toMatchObject({ field: "visits.date", visitIndex: 0 });
    expect(fakeSupabase.rows(TABLE)).toHaveLength(0);
  });

  it("não deixa gravar sem a permissão de lançar dados", async () => {
    auth.mockResolvedValue({ ok: false, response: Response.json({ error: "sem permissão" }, { status: 403 }) });
    expect((await send(POST, "POST", input)).status).toBe(403);
    expect(fakeSupabase.rows(TABLE)).toHaveLength(0);
  });

  it("avisa quando o banco ainda não tem a tabela", async () => {
    fakeSupabase.setMissing(TABLE);
    expect(await (await GET(new Request(URL))).json()).toEqual({ available: false, events: [] });
    const response = await send(POST, "POST", input);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false });
  });

  it("responde 404 ao alterar ou apagar evento que não existe mais", async () => {
    expect((await send(PATCH, "PATCH", { ...input, id: ID })).status).toBe(404);
    expect((await send(DELETE, "DELETE", undefined, `?id=${ID}`)).status).toBe(404);
    expect((await send(DELETE, "DELETE", undefined, "?id=nao-e-id")).status).toBe(400);
  });

  it("um problema que saiu da lista continua visível como 'Outro problema'", async () => {
    fakeSupabase.seed(TABLE, [{
      id: ID, name: "Antigo", reported_date: "2026-10-01", visits: [{ id: "v1", date: "2026-10-02", activities: ["edna", "sumiu"] }],
      main_problem: "problema_antigo", main_problem_other: null, sia: null, location: null,
      description: "x", created_by: null, updated_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    }]);
    const { events } = await (await GET(new Request(URL))).json();
    expect(events[0]).toMatchObject({ mainProblem: "other", mainProblemOther: "problema_antigo" });
    expect(events[0].visits).toEqual([{ id: "v1", date: "2026-10-02", objective: "", activities: ["edna"], activityOther: "", notes: "" }]);
  });
});
