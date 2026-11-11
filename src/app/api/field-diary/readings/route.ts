import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  MAX_READINGS_PER_ENTRY,
  describeReadingDepth,
  describeReadingsForLog,
  findParameter,
  normalizeReadingInput,
  sortReadings,
  type FieldParameter,
  type FieldReading,
  type ReadingInput,
} from "@/lib/field-parameters";
import {
  READINGS_TABLE,
  isMissingTable,
  readParameterCatalog,
  toNumber,
} from "@/lib/field-parameters-server";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_ID_LENGTH = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE_MESSAGE =
  "O banco ainda não recebeu a atualização dos parâmetros de campo. O registro de campo foi salvo; as medições não.";

type ReadingRow = {
  id: string;
  entry_id: string;
  parameter_id: string;
  value: number | string;
  unit: string | null;
  depth_m: number | string | null;
  measured_time: string | null;
  equipment: string | null;
};

type EntryRow = { id: string; campaign_name: string | null };

/**
 * Parâmetros medidos num registro de campo.
 *
 * GET  ?entryId=…  devolve o catálogo de parâmetros e as medições gravadas no
 *                  registro. `available: false` quando o banco ainda não tem as
 *                  tabelas (migration 20261111140000 não aplicada): o formulário
 *                  segue funcionando sem o bloco de parâmetros. Sem entryId, vem
 *                  só o catálogo.
 * PUT              grava as medições do registro. A unidade é copiada do catálogo
 *                  aqui. Um parâmetro só tem uma medição por profundidade: se outro
 *                  aparelho já gravou a mesma, devolve 409 sem mexer em nada.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const entryId = (new URL(request.url).searchParams.get("entryId") ?? "").trim().slice(0, MAX_ID_LENGTH);
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ available: false, parameters: [], readings: [] }, { headers: NO_STORE });
  }

  const catalog = await readParameterCatalog(supabase);

  if (!catalog.ok) {
    return NextResponse.json({ error: "Não foi possível consultar o catálogo de parâmetros." }, { status: 500 });
  }

  if (!catalog.available) {
    return NextResponse.json({ available: false, parameters: catalog.parameters, readings: [] }, { headers: NO_STORE });
  }

  if (!entryId) {
    return NextResponse.json({ available: true, parameters: catalog.parameters, readings: [] }, { headers: NO_STORE });
  }

  const { data, error } = await supabase.from(READINGS_TABLE).select("*").eq("entry_id", entryId).returns<ReadingRow[]>();

  if (error) {
    return isMissingTable(error)
      ? NextResponse.json({ available: false, parameters: catalog.parameters, readings: [] }, { headers: NO_STORE })
      : NextResponse.json({ error: "Não foi possível consultar as medições deste registro." }, { status: 500 });
  }

  return NextResponse.json(
    { available: true, parameters: catalog.parameters, readings: sortReadings(fromRows(data ?? []), catalog.parameters) },
    { headers: NO_STORE },
  );
}

export async function PUT(request: Request) {
  try {
    return await writeReadings(request);
  } catch (error) {
    console.error("[field-diary/readings] falha inesperada ao gravar", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Não foi possível salvar as medições por uma falha no servidor." },
      { status: 500 },
    );
  }
}

async function writeReadings(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado para salvar as medições." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const entryId = typeof body?.entryId === "string" ? body.entryId.trim().slice(0, MAX_ID_LENGTH) : "";
  const rawReadings = Array.isArray(body?.readings) ? body.readings : null;
  const removedIds = Array.isArray(body?.removedIds)
    ? body.removedIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
    : [];

  if (!entryId || !rawReadings || rawReadings.length > MAX_READINGS_PER_ENTRY) {
    return NextResponse.json({ error: "As medições enviadas são inválidas." }, { status: 400 });
  }

  const inputs: ReadingInput[] = [];

  for (const raw of rawReadings) {
    const input = normalizeReadingInput(raw);

    if (!input) {
      return NextResponse.json(
        { error: "Uma das medições tem dado inválido (valor, profundidade, hora ou equipamento)." },
        { status: 400 },
      );
    }

    inputs.push(input);
  }

  const catalog = await readParameterCatalog(supabase);

  if (!catalog.ok) {
    return NextResponse.json({ error: "Não foi possível consultar o catálogo de parâmetros." }, { status: 500 });
  }

  if (!catalog.available) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE, available: false }, { status: 503 });
  }

  // Parâmetro sem profundidade (temperatura do ar) nunca guarda profundidade.
  const readings: ReadingInput[] = [];

  for (const input of inputs) {
    const parameter = findParameter(catalog.parameters, input.parameterId);

    if (!parameter) {
      return NextResponse.json(
        { error: "Uma das medições é de um parâmetro que não está no catálogo. As medições não foram salvas." },
        { status: 400 },
      );
    }

    readings.push(parameter.usesDepth ? input : { ...input, depthM: null });
  }

  const keys = readings.map(readingKey);

  if (new Set(readings.map((reading) => reading.id)).size !== readings.length) {
    return NextResponse.json({ error: "Há medições repetidas no envio. Remova a repetida." }, { status: 400 });
  }

  const repeatedKey = keys.find((key, index) => keys.indexOf(key) !== index);

  if (repeatedKey) {
    const repeated = readings[keys.indexOf(repeatedKey)];

    return NextResponse.json(
      { error: `${describeTarget(repeated, catalog.parameters)} aparece duas vezes. Mude a profundidade de uma ou remova a repetida.` },
      { status: 400 },
    );
  }

  const { data: entry, error: entryError } = await supabase
    .from("field_diary_entries")
    .select("id, campaign_name")
    .eq("id", entryId)
    .maybeSingle<EntryRow>();

  if (entryError) {
    return NextResponse.json({ error: "Não foi possível consultar o registro de campo das medições." }, { status: 500 });
  }

  if (!entry) {
    return NextResponse.json(
      { error: "O registro de campo destas medições não foi encontrado. Salve o registro antes das medições." },
      { status: 404 },
    );
  }

  const existing = await supabase.from(READINGS_TABLE).select("*").eq("entry_id", entryId).returns<ReadingRow[]>();

  if (existing.error) {
    return isMissingTable(existing.error)
      ? NextResponse.json({ error: UNAVAILABLE_MESSAGE, available: false }, { status: 503 })
      : NextResponse.json({ error: "Não foi possível consultar as medições deste registro." }, { status: 500 });
  }

  const existingReadings = fromRows(existing.data ?? []);
  const ownIds = new Set(existingReadings.map((reading) => reading.id));
  const idsToRemove = removedIds.filter((id) => ownIds.has(id) && !readings.some((reading) => reading.id === id));

  if (readings.length) {
    // Uma medição só pode ser regravada no registro a que pertence.
    const foreign = await supabase
      .from(READINGS_TABLE)
      .select("id, entry_id")
      .in("id", readings.map((reading) => reading.id))
      .returns<Array<Pick<ReadingRow, "id" | "entry_id">>>();

    if (foreign.error) {
      return NextResponse.json({ error: "Não foi possível conferir as medições." }, { status: 500 });
    }

    if ((foreign.data ?? []).some((row) => row.entry_id !== entryId)) {
      return NextResponse.json({ error: "Uma das medições pertence a outro registro de campo." }, { status: 400 });
    }

    // O mesmo parâmetro, na mesma profundidade, já gravado neste registro por outro aparelho.
    const removed = new Set(idsToRemove);
    const taken = new Map(
      existingReadings.filter((reading) => !removed.has(reading.id)).map((reading) => [readingKey(reading), reading.id]),
    );
    const clash = readings.find((reading) => {
      const owner = taken.get(readingKey(reading));
      return owner && owner !== reading.id && !readings.some((other) => other.id === owner);
    });

    if (clash) {
      return NextResponse.json(
        {
          error:
            `${describeTarget(clash, catalog.parameters)} já tem medição gravada neste registro por outro aparelho. ` +
            "Nada foi alterado nas medições.",
          conflict: true,
          readings: sortReadings(existingReadings, catalog.parameters),
        },
        { status: 409 },
      );
    }
  }

  // Medição gravada que mudou de profundidade sai antes de entrar de novo: assim a
  // regra "uma por parâmetro e profundidade" não esbarra na própria medição antiga
  // (ex.: a de 0 m passou para 5 m e entrou outra em 0 m).
  const savedKeyById = new Map(existingReadings.map((reading) => [reading.id, readingKey(reading)]));
  const idsToRewrite = readings
    .filter((reading) => savedKeyById.has(reading.id) && savedKeyById.get(reading.id) !== readingKey(reading))
    .map((reading) => reading.id);
  const idsToDelete = [...idsToRemove, ...idsToRewrite];

  if (idsToDelete.length) {
    const removal = await supabase.from(READINGS_TABLE).delete().eq("entry_id", entryId).in("id", idsToDelete);

    if (removal.error) {
      return NextResponse.json({ error: "Não foi possível remover as medições retiradas." }, { status: 500 });
    }
  }

  if (readings.length) {
    const now = new Date().toISOString();
    const saved = await supabase.from(READINGS_TABLE).upsert(
      readings.map((reading) => ({
        id: reading.id,
        entry_id: entryId,
        parameter_id: reading.parameterId,
        value: reading.value,
        unit: findParameter(catalog.parameters, reading.parameterId)?.unit ?? "",
        depth_m: reading.depthM,
        measured_time: reading.measuredTime || null,
        equipment: reading.equipment || null,
        updated_at: now,
      })),
      { onConflict: "id" },
    );

    if (saved.error) {
      console.error("[field-diary/readings] gravação recusada pelo banco", {
        entryId,
        code: saved.error.code,
        message: saved.error.message,
      });

      return saved.error.code === "23505"
        ? NextResponse.json(
            {
              error:
                "Outro aparelho acabou de gravar a mesma medição neste registro. Abra o registro de novo para ver o que ficou gravado.",
              conflict: true,
            },
            { status: 409 },
          )
        : NextResponse.json({ error: "Não foi possível salvar as medições." }, { status: 500 });
    }
  }

  const after = await supabase.from(READINGS_TABLE).select("*").eq("entry_id", entryId).returns<ReadingRow[]>();
  const savedReadings = sortReadings(
    after.error
      ? readings.map((reading) => ({
          ...reading,
          entryId,
          unit: findParameter(catalog.parameters, reading.parameterId)?.unit ?? "",
        }))
      : fromRows(after.data ?? []),
    catalog.parameters,
  );

  await logReadingChange(supabase, {
    entry,
    before: describeReadingsForLog(existingReadings, catalog.parameters),
    after: describeReadingsForLog(savedReadings, catalog.parameters),
    changedBy: auth.session?.name || auth.session?.email || null,
  });

  return NextResponse.json({ available: true, readings: savedReadings }, { headers: NO_STORE });
}

type SupabaseClient = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;

/** Histórico do registro: uma linha quando as medições mudam. */
async function logReadingChange(
  supabase: SupabaseClient,
  input: { entry: EntryRow; before: string; after: string; changedBy: string | null },
) {
  if (input.before === input.after) {
    return;
  }

  // O histórico é complementar: se falhar, as medições já estão gravadas.
  const { error } = await supabase.from("field_diary_change_log").insert({
    entry_id: input.entry.id,
    campaign_name: input.entry.campaign_name ?? "",
    field_name: "Parâmetros",
    old_value: input.before || null,
    new_value: input.after || null,
    origin: "app",
    changed_by: input.changedBy,
  });

  if (error) {
    console.warn("[field-diary/readings] histórico das medições não gravado", { code: error.code });
  }
}

/** Parâmetro + profundidade: o que não pode se repetir num registro. */
function readingKey(reading: Pick<ReadingInput, "parameterId" | "depthM">) {
  return `${reading.parameterId}@${reading.depthM === null ? "" : reading.depthM}`;
}

/** "pH na superfície", "Condutividade a 5 m de profundidade", "Temperatura do ar". */
function describeTarget(reading: Pick<ReadingInput, "parameterId" | "depthM">, catalog: FieldParameter[]) {
  const label = findParameter(catalog, reading.parameterId)?.label ?? reading.parameterId;

  if (reading.depthM === null) {
    return label;
  }

  return reading.depthM === 0 ? `${label} na superfície` : `${label} a ${describeReadingDepth(reading.depthM)}`;
}

function fromRows(rows: ReadingRow[]): FieldReading[] {
  const readings: FieldReading[] = [];

  for (const row of rows) {
    const value = toNumber(row.value);

    // Linha fora do padrão (não deveria existir: o banco confere): fica de fora
    // em vez de derrubar a tela.
    if (value === null || !row.id || !row.parameter_id) {
      continue;
    }

    readings.push({
      id: row.id,
      entryId: row.entry_id,
      parameterId: row.parameter_id,
      value,
      unit: row.unit ?? "",
      depthM: toNumber(row.depth_m),
      measuredTime: row.measured_time ?? "",
      equipment: row.equipment ?? "",
    });
  }

  return readings;
}
