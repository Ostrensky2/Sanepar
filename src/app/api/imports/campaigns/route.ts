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
