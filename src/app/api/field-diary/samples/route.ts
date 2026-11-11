import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  MAX_SAMPLES_PER_ENTRY,
  normalizeSampleInput,
  safeProjectCode,
  sortSamples,
  type FieldSample,
  type SampleCodeConflict,
  type SampleInput,
} from "@/lib/field-samples";
import {
  SAMPLES_TABLE as TABLE,
  isMissingSamplesTable,
  samplesFromRows as fromRows,
  type SampleRow,
} from "@/lib/field-samples-server";
import { FieldStandardError, buildSampleCode, isSampleTypeId, nextSampleSequence } from "@/lib/field-standard";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_ID_LENGTH = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE_MESSAGE =
  "O banco ainda não recebeu a atualização das amostras do ponto. O registro de campo foi salvo; as amostras não.";

type EntryRow = {
  id: string;
  campaign_name: string | null;
  entry_date: string;
  sia: string | null;
};

/**
 * Amostras de um registro de campo.
 *
 * GET  ?entryId=…  lista as amostras gravadas. `available: false` quando o banco
 *                  ainda não tem a tabela (migration 20261111130000 não aplicada):
 *                  o formulário segue funcionando sem o bloco de amostras. Sem
 *                  entryId, só responde se o banco já aceita amostras.
 * PUT              grava as amostras do registro. O código de cada etiqueta é
 *                  calculado aqui, pela data e pelo ponto que estão no registro
 *                  gravado, e nunca repetido: se já existir, devolve 409 com o
 *                  próximo número livre. Amostra que já saiu na planilha do
 *                  Biolog fica com o código, o tipo e o número que tinha.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const entryId = (new URL(request.url).searchParams.get("entryId") ?? "").trim().slice(0, MAX_ID_LENGTH);
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ available: false, samples: [] }, { headers: NO_STORE });
  }

  // Sem registro (formulário de um registro novo): só diz se o banco aceita amostras.
  const query = entryId
    ? supabase.from(TABLE).select("*").eq("entry_id", entryId)
    : supabase.from(TABLE).select("*").limit(0);
  const { data, error } = await query.returns<SampleRow[]>();

  if (error) {
    if (isMissingSamplesTable(error)) {
      return NextResponse.json({ available: false, samples: [] }, { headers: NO_STORE });
    }

    return NextResponse.json({ error: "Não foi possível consultar as amostras deste registro." }, { status: 500 });
  }

  return NextResponse.json({ available: true, samples: fromRows(data ?? []) }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  try {
    return await writeSamples(request);
  } catch (error) {
    console.error("[field-diary/samples] falha inesperada ao gravar", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Não foi possível salvar as amostras por uma falha no servidor." },
      { status: 500 },
    );
  }
}

async function writeSamples(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado para salvar as amostras." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const entryId = typeof body?.entryId === "string" ? body.entryId.trim().slice(0, MAX_ID_LENGTH) : "";
  const projectCode = safeProjectCode(body?.projectCode);
  const rawSamples = Array.isArray(body?.samples) ? body.samples : null;
  const removedIds = Array.isArray(body?.removedIds)
    ? body.removedIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
    : [];

  if (!entryId || !projectCode || !rawSamples || rawSamples.length > MAX_SAMPLES_PER_ENTRY) {
    return NextResponse.json({ error: "As amostras enviadas são inválidas." }, { status: 400 });
  }

  const inputs: SampleInput[] = [];

  for (const raw of rawSamples) {
    const input = normalizeSampleInput(raw);

    if (!input) {
      return NextResponse.json(
        { error: "Uma das amostras tem dado inválido (tipo, número, profundidade ou quantidade)." },
        { status: 400 },
      );
    }

    inputs.push(input);
  }

  const { data: entry, error: entryError } = await supabase
    .from("field_diary_entries")
    .select("id, campaign_name, entry_date, sia")
    .eq("id", entryId)
    .maybeSingle<EntryRow>();

  if (entryError) {
    return NextResponse.json({ error: "Não foi possível consultar o registro de campo das amostras." }, { status: 500 });
  }

  if (!entry) {
    return NextResponse.json(
      { error: "O registro de campo destas amostras não foi encontrado. Salve o registro antes das amostras." },
      { status: 404 },
    );
  }

  const existing = await supabase.from(TABLE).select("*").eq("entry_id", entryId).returns<SampleRow[]>();

  if (existing.error) {
    return isMissingSamplesTable(existing.error)
      ? NextResponse.json({ error: UNAVAILABLE_MESSAGE, available: false }, { status: 503 })
      : NextResponse.json({ error: "Não foi possível consultar as amostras deste registro." }, { status: 500 });
  }

  // Amostra que já saiu na planilha do Biolog: o código, o tipo e o número ficam os
  // que foram exportados, mesmo que a data ou o ponto do registro tenham mudado.
  const exportedById = new Map(
    (existing.data ?? []).filter((row) => row.exported_at && isSampleTypeId(row.sample_type)).map((row) => [row.id, row]),
  );

  // Para as outras, o código vale o que está no registro GRAVADO (data e ponto), não
  // o que o aparelho mandou: é ele que vai para a etiqueta e para a planilha.
  const entryDate = String(entry.entry_date ?? "").slice(0, 10);
  const codeTarget = { projectCode, date: entryDate, point: entry.sia ?? "" };
  const samples: SampleInput[] = [];

  try {
    for (const input of inputs) {
      const exported = exportedById.get(input.id);

      samples.push(
        exported && isSampleTypeId(exported.sample_type)
          ? { ...input, sampleType: exported.sample_type, sequence: Number(exported.sequence), code: exported.sample_code }
          : { ...input, code: buildSampleCode({ ...codeTarget, sampleType: input.sampleType, sequence: input.sequence }) },
      );
    }
  } catch (error) {
    if (error instanceof FieldStandardError) {
      return NextResponse.json({ error: `${error.message} As amostras não foram salvas.` }, { status: 422 });
    }
    throw error;
  }

  // A etiqueta de uma amostra exportada já foi escrita com o código que ficou; só as
  // outras precisam conferir com o que o aparelho mostrou.
  const shownDifferent = samples.find(
    (sample, index) => !exportedById.has(sample.id) && inputs[index].code && inputs[index].code !== sample.code,
  );

  if (shownDifferent) {
    return NextResponse.json(
      {
        error:
          "O código das amostras mudou, porque a data ou o ponto gravados no registro são outros. " +
          "Feche o registro, abra de novo e confira as etiquetas antes de salvar.",
      },
      { status: 422 },
    );
  }

  const codes = samples.map((sample) => sample.code);

  if (new Set(codes).size !== codes.length || new Set(samples.map((sample) => sample.id)).size !== samples.length) {
    return NextResponse.json({ error: "Há amostras repetidas no envio. Remova a repetida." }, { status: 400 });
  }

  const existingRows = existing.data ?? [];
  const ownIds = new Set(existingRows.map((row) => row.id));
  const idsToRemove = removedIds.filter((id) => ownIds.has(id) && !samples.some((sample) => sample.id === id));

  if (samples.length) {
    // Uma amostra só pode ser regravada no registro a que pertence.
    const foreign = await supabase
      .from(TABLE)
      .select("id, entry_id")
      .in("id", samples.map((sample) => sample.id))
      .returns<Array<Pick<SampleRow, "id" | "entry_id">>>();

    if (foreign.error) {
      return NextResponse.json({ error: "Não foi possível conferir as amostras." }, { status: 500 });
    }

    if ((foreign.data ?? []).some((row) => row.entry_id !== entryId)) {
      return NextResponse.json({ error: "Uma das amostras pertence a outro registro de campo." }, { status: 400 });
    }

    const conflicts = await findCodeConflicts(supabase, { entryId, samples, idsToRemove, codeTarget });

    if ("error" in conflicts) {
      return NextResponse.json({ error: "Não foi possível conferir os códigos das amostras." }, { status: 500 });
    }

    if (conflicts.length) {
      return NextResponse.json(
        {
          error: "Há código de amostra que já existe. Nada foi alterado nas amostras.",
          conflicts,
          samples: fromRows(existingRows),
        },
        { status: 409 },
      );
    }
  }

  if (idsToRemove.length) {
    const removal = await supabase.from(TABLE).delete().eq("entry_id", entryId).in("id", idsToRemove);

    if (removal.error) {
      return NextResponse.json({ error: "Não foi possível remover as amostras retiradas." }, { status: 500 });
    }
  }

  if (samples.length) {
    const now = new Date().toISOString();
    const saved = await supabase
      .from(TABLE)
      .upsert(
        samples.map((sample) => toRow(sample, entryId, exportedById.get(sample.id)?.project_code ?? projectCode, now)),
        { onConflict: "id" },
      );

    if (saved.error) {
      console.error("[field-diary/samples] gravação recusada pelo banco", {
        entryId,
        code: saved.error.code,
        message: saved.error.message,
      });

      return saved.error.code === "23505"
        ? NextResponse.json(
            {
              error:
                "Outro aparelho acabou de gravar uma amostra com o mesmo código. Salve de novo para ver o próximo número livre.",
            },
            { status: 409 },
          )
        : NextResponse.json({ error: "Não foi possível salvar as amostras." }, { status: 500 });
    }
  }

  const after = await supabase.from(TABLE).select("*").eq("entry_id", entryId).returns<SampleRow[]>();
  const savedSamples = after.error
    ? sortSamples(samples.map((sample) => ({ ...sample, entryId, projectCode })))
    : fromRows(after.data ?? []);

  await logSampleChange(supabase, {
    entry,
    before: fromRows(existingRows),
    after: savedSamples,
    changedBy: auth.session?.name || auth.session?.email || null,
  });

  return NextResponse.json({ available: true, samples: savedSamples }, { headers: NO_STORE });
}

type SupabaseClient = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;

/**
 * Códigos deste envio que já pertencem a outra amostra (de outro registro, ou
 * deste mesmo, gravada por outro aparelho). Para cada um, propõe o próximo número
 * livre do mesmo tipo, ponto e dia.
 */
async function findCodeConflicts(
  supabase: SupabaseClient,
  input: {
    entryId: string;
    samples: SampleInput[];
    idsToRemove: string[];
    codeTarget: { projectCode: string; date: string; point: string };
  },
): Promise<SampleCodeConflict[] | { error: true }> {
  const owners = await supabase
    .from(TABLE)
    .select("id, entry_id, sample_code")
    .in("sample_code", input.samples.map((sample) => sample.code))
    .returns<Array<Pick<SampleRow, "id" | "entry_id" | "sample_code">>>();

  if (owners.error) {
    return { error: true };
  }

  const removed = new Set(input.idsToRemove);
  const ownerByCode = new Map(
    (owners.data ?? []).filter((row) => !removed.has(row.id)).map((row) => [row.sample_code, row]),
  );
  const conflicting = input.samples.filter((sample) => {
    const owner = ownerByCode.get(sample.code);
    return owner && owner.id !== sample.id;
  });

  if (!conflicting.length) {
    return [];
  }

  // Todos os códigos do mesmo projeto, dia e ponto que já existem no banco.
  const prefix = conflicting[0].code.replace(/[A-Z]{2}\d+$/, "");
  const taken = await supabase
    .from(TABLE)
    .select("sample_code")
    .like("sample_code", `${prefix}%`)
    .returns<Array<Pick<SampleRow, "sample_code">>>();

  if (taken.error) {
    return { error: true };
  }

  const pool: string[] = [...(taken.data ?? []).map((row) => row.sample_code), ...input.samples.map((sample) => sample.code)];

  return conflicting.map((sample) => {
    const suggestedSequence = nextSampleSequence(pool, { ...input.codeTarget, sampleType: sample.sampleType });
    const suggestedCode = buildSampleCode({
      ...input.codeTarget,
      sampleType: sample.sampleType,
      sequence: suggestedSequence,
    });

    pool.push(suggestedCode);

    return {
      sampleId: sample.id,
      code: sample.code,
      suggestedSequence,
      suggestedCode,
      sameEntry: ownerByCode.get(sample.code)?.entry_id === input.entryId,
    };
  });
}

/** Histórico do registro: uma linha quando a lista de amostras muda. */
async function logSampleChange(
  supabase: SupabaseClient,
  input: { entry: EntryRow; before: FieldSample[]; after: FieldSample[]; changedBy: string | null },
) {
  const describe = (samples: FieldSample[]) => samples.map((sample) => sample.code).join(", ");
  const oldValue = describe(input.before);
  const newValue = describe(input.after);

  if (oldValue === newValue) {
    return;
  }

  // O histórico é complementar: se falhar, as amostras já estão gravadas.
  const { error } = await supabase.from("field_diary_change_log").insert({
    entry_id: input.entry.id,
    campaign_name: input.entry.campaign_name ?? "",
    field_name: "Amostras",
    old_value: oldValue || null,
    new_value: newValue || null,
    origin: "app",
    changed_by: input.changedBy,
  });

  if (error) {
    console.warn("[field-diary/samples] histórico das amostras não gravado", { code: error.code });
  }
}

function toRow(sample: SampleInput, entryId: string, projectCode: string, updatedAt: string) {
  return {
    id: sample.id,
    entry_id: entryId,
    sample_code: sample.code,
    project_code: projectCode,
    sample_type: sample.sampleType,
    sequence: sample.sequence,
    depth_m: sample.depthM,
    quantity: sample.quantity,
    quantity_unit: sample.quantityUnit,
    specification: sample.specification || null,
    conservation: sample.conservation,
    packaging: sample.packaging || null,
    box_position: sample.boxPosition || null,
    updated_at: updatedAt,
  };
}
