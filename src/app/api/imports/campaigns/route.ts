import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

// A importação de planilhas de campo é feita só pelo Diário de campo (/api/field-diary/import).
// Esta rota mantém apenas a exclusão administrativa dos dados de uma campanha.

export async function DELETE(request: Request) {
  const auth = await requireApiSession(request, "data.delete");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignName = searchParams.get("campaignName")?.trim();
    const campaignKey = searchParams.get("campaignKey")?.trim();

    if (!campaignName) {
      return NextResponse.json(
        { error: "O nome da campanha é obrigatório para a exclusão." },
        { status: 400 },
      );
    }

    const supabase = createOptionalSupabaseClient();

    if (supabase) {
      // Antes de apagar qualquer coisa: registro com amostra não é apagado (a amostra
      // tem etiqueta escrita). Sem esta conferência, o histórico sairia e os registros
      // ficariam, porque o banco recusa apagar registro com amostra.
      const collected = await countCollectedData(supabase, campaignName);

      if (collected === null) {
        return NextResponse.json(
          { error: "Não foi possível conferir as amostras da campanha. Nada foi apagado." },
          { status: 500 },
        );
      }

      if (collected > 0) {
        return NextResponse.json(
          {
            error:
              `A campanha "${campaignName}" tem ${collected === 1 ? "1 amostra registrada" : `${collected} amostras registradas`} ` +
              "nos registros de campo. Nada foi apagado. Retire as amostras dos registros antes de excluir a campanha.",
          },
          { status: 409 },
        );
      }

      // 1. Apagar histórico de alterações do Diário de campo
      const { error: errorLog } = await supabase
        .from("field_diary_change_log")
        .delete()
        .eq("campaign_name", campaignName);

      if (errorLog) {
        throw new Error(`Falha ao excluir histórico de alterações: ${errorLog.message}`);
      }

      // 2. Apagar diário de campo
      const { error: errorEntries } = await supabase
        .from("field_diary_entries")
        .delete()
        .eq("campaign_name", campaignName);

      if (errorEntries) {
        throw new Error(`Falha ao excluir registros do diário de campo: ${errorEntries.message}`);
      }

      // 3. Apagar importações de campanhas (pontos/mapa)
      const keyToUse = campaignKey || campaignName.trim().toLowerCase();
      const { error: errorImports } = await supabase
        .from("campaign_imports")
        .delete()
        .eq("campaign_key", keyToUse);

      if (errorImports) {
        throw new Error(`Falha ao excluir importações da campanha: ${errorImports.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Todos os dados da campanha "${campaignName}" foram excluídos com sucesso.`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível excluir os dados da campanha.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type SupabaseClient = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;

// Tabelas ligadas ao registro de campo que impedem a exclusão dele.
const COLLECTED_TABLES = ["field_diary_samples"] as const;
const PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 100;

/**
 * Quantas amostras existem nos registros de campo da campanha. null = não deu para
 * conferir. Tabela que ainda não existe no banco conta como vazia.
 */
async function countCollectedData(supabase: SupabaseClient, campaignName: string): Promise<number | null> {
  const entryIds: string[] = [];

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

  let total = 0;

  for (const table of COLLECTED_TABLES) {
    for (let start = 0; start < entryIds.length; start += ID_BATCH_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .in("entry_id", entryIds.slice(start, start + ID_BATCH_SIZE))
        .returns<Array<{ id: string }>>();

      if (error) {
        // PGRST205 / 42P01: a tabela ainda não existe, então não há o que proteger.
        if (error.code === "PGRST205" || error.code === "42P01") {
          break;
        }
        return null;
      }

      total += (data ?? []).length;
    }
  }

  return total;
}

