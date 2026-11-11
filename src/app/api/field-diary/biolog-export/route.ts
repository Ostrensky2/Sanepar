import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { baseParameterCatalog, sortReadings } from "@/lib/field-parameters";
import {
  READINGS_TABLE,
  isMissingTable,
  readParameterCatalog,
  readingsFromRows,
  type ReadingRow,
} from "@/lib/field-parameters-server";
import {
  SAMPLES_TABLE,
  isMissingExportedColumn,
  isMissingSamplesTable,
  samplesFromRows,
  type SampleRow,
} from "@/lib/field-samples-server";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CAMPAIGNS = 60;
const MAX_CAMPAIGN_NAME_LENGTH = 200;
const MAX_SAMPLE_IDS = 20000;
const PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 100;
const LOG_BATCH_SIZE = 500;

type SupabaseClient = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;
type DatabaseError = { code?: string; message?: string };
type Read<Row> = { rows: Row[] } | { error: DatabaseError };

/**
 * Exportação para o Biolog (seção 8 do padrão de coleta).
 *
 * GET  ?campaign=…&campaign=…  devolve, de uma vez, as amostras e as medições de
 *      todos os registros de campo das campanhas pedidas, mais o catálogo de
 *      parâmetros. A planilha é montada no aparelho (lib/biolog-export).
 *      `available: false` quando o banco ainda não tem a tabela das amostras.
 * POST { sampleIds }  marca as amostras como exportadas. Daí em diante o código
 *      delas não muda mais. Quem já estava marcada fica com a data que tinha.
 *      Enquanto o banco não tiver a coluna da marca (migration 20261111150000),
 *      responde `available: false` sem erro: a planilha vale do mesmo jeito.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const campaigns = [
    ...new Set(
      new URL(request.url).searchParams
        .getAll("campaign")
        .map((name) => name.trim())
        .filter((name) => name && name.length <= MAX_CAMPAIGN_NAME_LENGTH),
    ),
  ];

  if (!campaigns.length || campaigns.length > MAX_CAMPAIGNS) {
    return NextResponse.json({ error: "Informe as campanhas da exportação." }, { status: 400 });
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(unavailable(), { headers: NO_STORE });
  }

  const entryIds = await readEntryIds(supabase, campaigns);

  if (!entryIds) {
    return NextResponse.json({ error: "Não foi possível consultar os registros de campo das campanhas." }, { status: 500 });
  }

  const samples = await readByEntry<SampleRow>(supabase, SAMPLES_TABLE, entryIds);

  if ("error" in samples) {
    return isMissingSamplesTable(samples.error)
      ? NextResponse.json(unavailable(), { headers: NO_STORE })
      : NextResponse.json({ error: "Não foi possível consultar as amostras das campanhas." }, { status: 500 });
  }

  const catalog = await readParameterCatalog(supabase);

  if (!catalog.ok) {
    return NextResponse.json({ error: "Não foi possível consultar o catálogo de parâmetros." }, { status: 500 });
  }

  // Sem as tabelas dos parâmetros (migration 20261111140000), a planilha sai só com as amostras.
  let readingRows: ReadingRow[] = [];

  if (catalog.available) {
    const readings = await readByEntry<ReadingRow>(supabase, READINGS_TABLE, entryIds);

    if ("error" in readings) {
      if (!isMissingTable(readings.error)) {
        return NextResponse.json({ error: "Não foi possível consultar as medições das campanhas." }, { status: 500 });
      }
    } else {
      readingRows = readings.rows;
    }
  }

  return NextResponse.json(
    {
      available: true,
      samples: samplesFromRows(samples.rows),
      readings: sortReadings(readingsFromRows(readingRows), catalog.parameters),
      parameters: catalog.parameters,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado para marcar as amostras." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rawIds = Array.isArray(body?.sampleIds) ? body.sampleIds : null;

  if (!rawIds || !rawIds.length || rawIds.length > MAX_SAMPLE_IDS || rawIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return NextResponse.json({ error: "As amostras enviadas são inválidas." }, { status: 400 });
  }

  const sampleIds = [...new Set(rawIds as string[])];
  const exportedAt = new Date().toISOString();
  const marked: Array<Pick<SampleRow, "id" | "entry_id" | "sample_code">> = [];

  for (let start = 0; start < sampleIds.length; start += ID_BATCH_SIZE) {
    // Só as que ainda não tinham a marca: a data da primeira exportação é a que fica.
    const { data, error } = await supabase
      .from(SAMPLES_TABLE)
      .update({ exported_at: exportedAt })
      .in("id", sampleIds.slice(start, start + ID_BATCH_SIZE))
      .is("exported_at", null)
      .select("id, entry_id, sample_code")
      .returns<Array<Pick<SampleRow, "id" | "entry_id" | "sample_code">>>();

    if (error) {
      if (isMissingExportedColumn(error) || isMissingSamplesTable(error)) {
        return NextResponse.json({ available: false, marked: 0 }, { headers: NO_STORE });
      }

      console.error("[field-diary/biolog-export] marca de exportação recusada pelo banco", {
        code: error.code,
        message: error.message,
      });

      return NextResponse.json(
        { error: "Não foi possível marcar as amostras como exportadas.", marked: marked.length },
        { status: 500 },
      );
    }

    marked.push(...(data ?? []));
  }

  await logExport(supabase, marked, auth.session?.name || auth.session?.email || null);

  return NextResponse.json({ available: true, marked: marked.length, exportedAt }, { headers: NO_STORE });
}

function unavailable() {
  return { available: false, samples: [], readings: [], parameters: baseParameterCatalog() };
}

async function readEntryIds(supabase: SupabaseClient, campaigns: string[]): Promise<string[] | null> {
  const entryIds: string[] = [];

  for (const campaignName of campaigns) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("field_diary_entries")
        .select("id")
        .eq("campaign_name", campaignName)
        .order("id")
        .range(from, from + PAGE_SIZE - 1)
        .returns<Array<{ id: string }>>();

      if (error) {
        return null;
      }

      entryIds.push(...(data ?? []).map((row) => row.id));

      if ((data ?? []).length < PAGE_SIZE) {
        break;
      }
    }
  }

  return entryIds;
}

/** Todas as linhas da tabela que pertencem aos registros dados, em lotes e páginas. */
async function readByEntry<Row>(supabase: SupabaseClient, table: string, entryIds: string[]): Promise<Read<Row>> {
  const rows: Row[] = [];

  // Sem registro nenhum, ainda vale uma consulta vazia: é ela que diz se a tabela existe.
  if (!entryIds.length) {
    const { error } = await supabase.from(table).select("*").limit(0).returns<Row[]>();

    return error ? { error } : { rows };
  }

  const batches = Array.from({ length: Math.ceil(entryIds.length / ID_BATCH_SIZE) }, (_, index) =>
    entryIds.slice(index * ID_BATCH_SIZE, (index + 1) * ID_BATCH_SIZE),
  );

  for (const batch of batches) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .in("entry_id", batch)
        .order("id")
        .range(from, from + PAGE_SIZE - 1)
        .returns<Row[]>();

      if (error) {
        return { error };
      }

      rows.push(...(data ?? []));

      if ((data ?? []).length < PAGE_SIZE) {
        break;
      }
    }
  }

  return { rows };
}

/** Histórico de cada registro: quais amostras saíram na planilha, e por quem. */
async function logExport(
  supabase: SupabaseClient,
  marked: Array<Pick<SampleRow, "entry_id" | "sample_code">>,
  changedBy: string | null,
) {
  if (!marked.length) {
    return;
  }

  const codesByEntry = new Map<string, string[]>();

  for (const row of marked) {
    codesByEntry.set(row.entry_id, [...(codesByEntry.get(row.entry_id) ?? []), row.sample_code]);
  }

  const entryIds = [...codesByEntry.keys()];
  const campaignByEntry = new Map<string, string>();

  for (let start = 0; start < entryIds.length; start += ID_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("field_diary_entries")
      .select("id, campaign_name")
      .in("id", entryIds.slice(start, start + ID_BATCH_SIZE))
      .returns<Array<{ id: string; campaign_name: string | null }>>();

    // O histórico é complementar: se falhar, as amostras já estão marcadas.
    if (error) {
      console.warn("[field-diary/biolog-export] histórico da exportação não gravado", { code: error.code });
      return;
    }

    for (const row of data ?? []) {
      campaignByEntry.set(row.id, row.campaign_name ?? "");
    }
  }

  const lines = entryIds.map((entryId) => ({
    entry_id: entryId,
    campaign_name: campaignByEntry.get(entryId) ?? "",
    field_name: "Exportação para o Biolog",
    old_value: null,
    new_value: (codesByEntry.get(entryId) ?? []).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).join(", "),
    origin: "app",
    changed_by: changedBy,
  }));

  for (let start = 0; start < lines.length; start += LOG_BATCH_SIZE) {
    const { error } = await supabase.from("field_diary_change_log").insert(lines.slice(start, start + LOG_BATCH_SIZE));

    if (error) {
      console.warn("[field-diary/biolog-export] histórico da exportação não gravado", { code: error.code });
      return;
    }
  }
}
