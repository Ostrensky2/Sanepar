import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  isEmergencyProblemId,
  normalizeEmergencyEventInput,
  parseStoredEmergencyVisits,
  sortEmergencyEvents,
  type EmergencyEvent,
  type EmergencyEventInput,
} from "@/lib/emergency-events";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const TABLE = "emergency_events";
const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE_MESSAGE =
  "O banco ainda não recebeu a atualização dos eventos emergenciais. Peça ao administrador para aplicá-la.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string;
  name: string;
  reported_date: string;
  visits: unknown;
  main_problem: string;
  main_problem_other: string | null;
  sia: string | null;
  location: string | null;
  description: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseClient = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;

/**
 * Eventos emergenciais.
 *
 * GET    lista todos (quem vê os dados). `available: false` quando o banco ainda não
 *        tem a tabela (migration 20261125120000 não aplicada).
 * POST   cria um evento (quem lança dados).
 * PATCH  altera um evento: `{ id, expectedUpdatedAt, ...campos }` (quem lança dados).
 *        `expectedUpdatedAt` é o `updatedAt` do evento quando a tela o abriu: se
 *        alguém gravou depois disso, nada é gravado e a resposta é 409 com o evento
 *        atual, para a tela juntar as duas edições sem apagar a ida de ninguém.
 * DELETE `?id=` apaga um evento (quem pode excluir dados).
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.view");
  if (!auth.ok) return auth.response;

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ available: false, events: [] }, { headers: NO_STORE });
  }

  const { data, error } = await supabase.from(TABLE).select("*").returns<Row[]>();

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ available: false, events: [] }, { headers: NO_STORE });
    }

    console.error("[emergency-events] leitura recusada pelo banco", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Não foi possível consultar os eventos emergenciais." }, { status: 500 });
  }

  return NextResponse.json(
    { available: true, events: sortEmergencyEvents((data ?? []).map(fromRow)) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  return guarded(request, "data.import", async (supabase, body, changedBy) => {
    const checked = normalizeEmergencyEventInput(body);

    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, field: checked.field, visitIndex: checked.visitIndex },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const inserted = await supabase
      .from(TABLE)
      .insert({ id: randomUUID(), ...toRow(checked.event), created_by: changedBy, updated_by: changedBy, created_at: now, updated_at: now })
      .select("*")
      .returns<Row[]>();

    if (inserted.error || !inserted.data?.[0]) {
      return databaseFailure("criação", inserted.error, "Não foi possível salvar o evento.");
    }

    return NextResponse.json({ event: fromRow(inserted.data[0]) }, { status: 201, headers: NO_STORE });
  });
}

export async function PATCH(request: Request) {
  return guarded(request, "data.import", async (supabase, body, changedBy) => {
    const id = typeof body.id === "string" ? body.id : "";

    if (!UUID.test(id)) {
      return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
    }

    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";

    if (!expectedUpdatedAt) {
      // Tela aberta antes desta versão: grava só quem sabe qual versão do evento editou.
      return NextResponse.json(
        { error: "Esta página está desatualizada. Recarregue a página e faça a alteração de novo.", conflict: true },
        { status: 409 },
      );
    }

    const checked = normalizeEmergencyEventInput(body);

    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, field: checked.field, visitIndex: checked.visitIndex },
        { status: 400 },
      );
    }

    // Só grava se o evento ainda está como esta tela o viu (mesmo updated_at): a troca
    // da lista de idas nunca apaga, sem aviso, a ida que outra pessoa acabou de gravar.
    const updated = await supabase
      .from(TABLE)
      .update({ ...toRow(checked.event), updated_by: changedBy, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .select("*")
      .returns<Row[]>();

    if (updated.error) {
      return databaseFailure("alteração", updated.error, "Não foi possível salvar a alteração do evento.");
    }

    if (!updated.data?.[0]) {
      const current = await supabase.from(TABLE).select("*").eq("id", id).returns<Row[]>();

      if (current.error) {
        return databaseFailure("alteração", current.error, "Não foi possível salvar a alteração do evento.");
      }

      if (current.data?.[0]) {
        return NextResponse.json(
          {
            error: "Outra pessoa salvou este evento enquanto você editava.",
            conflict: true,
            event: fromRow(current.data[0]),
          },
          { status: 409, headers: NO_STORE },
        );
      }

      return NextResponse.json(
        { error: "Este evento não existe mais. Alguém pode tê-lo apagado. Recarregue a página." },
        { status: 404 },
      );
    }

    return NextResponse.json({ event: fromRow(updated.data[0]) }, { headers: NO_STORE });
  });
}

export async function DELETE(request: Request) {
  return guarded(request, "data.delete", async (supabase) => {
    const id = new URL(request.url).searchParams.get("id") ?? "";

    if (!UUID.test(id)) {
      return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
    }

    const removed = await supabase.from(TABLE).delete().eq("id", id).select("id").returns<{ id: string }[]>();

    if (removed.error) {
      return databaseFailure("exclusão", removed.error, "Não foi possível apagar o evento.");
    }

    if (!removed.data?.length) {
      return NextResponse.json({ error: "Este evento já tinha sido apagado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }, { readsBody: false });
}

async function guarded(
  request: Request,
  privilege: "data.import" | "data.delete",
  handle: (supabase: SupabaseClient, body: Record<string, unknown>, changedBy: string | null) => Promise<NextResponse>,
  { readsBody = true }: { readsBody?: boolean } = {},
) {
  try {
    const auth = await requireApiSession(request, privilege);
    if (!auth.ok) return auth.response;

    const supabase = createOptionalSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ error: "Supabase não configurado para os eventos emergenciais." }, { status: 503 });
    }

    let body: Record<string, unknown> = {};

    if (readsBody) {
      const parsed = (await request.json().catch(() => null)) as unknown;

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Os dados do evento são inválidos." }, { status: 400 });
      }

      body = parsed as Record<string, unknown>;
    }

    return await handle(supabase, body, auth.session?.name || auth.session?.email || null);
  } catch (error) {
    console.error("[emergency-events] falha inesperada", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
  }
}

function databaseFailure(action: string, error: { code?: string; message?: string } | null, message: string) {
  if (error && isMissingTable(error)) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE, available: false }, { status: 503 });
  }

  console.error(`[emergency-events] ${action} recusada pelo banco`, { code: error?.code, message: error?.message });
  return NextResponse.json({ error: message }, { status: 500 });
}

function isMissingTable(error: { code?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

function toRow(event: EmergencyEventInput) {
  return {
    name: event.name,
    reported_date: event.reportedDate,
    visits: event.visits,
    main_problem: event.mainProblem,
    main_problem_other: event.mainProblemOther || null,
    sia: event.sia || null,
    location: event.location || null,
    description: event.description,
  };
}

function fromRow(row: Row): EmergencyEvent {
  return {
    id: row.id,
    name: row.name,
    reportedDate: String(row.reported_date ?? "").slice(0, 10),
    visits: parseStoredEmergencyVisits(row.visits),
    // Código que saiu da lista do app continua visível como "Outro problema".
    mainProblem: isEmergencyProblemId(row.main_problem) ? row.main_problem : "other",
    mainProblemOther: isEmergencyProblemId(row.main_problem) ? row.main_problem_other ?? "" : row.main_problem,
    sia: row.sia ?? "",
    location: row.location ?? "",
    description: row.description,
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
