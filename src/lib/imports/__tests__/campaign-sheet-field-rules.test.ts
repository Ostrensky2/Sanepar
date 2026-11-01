import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseCampaignWorkbook } from "@/lib/imports/campaigns";
import { campaignPointToFieldDiaryPayload } from "@/lib/imports/field-spreadsheet-to-diary";

const HEADERS = [
  "Campanha", "Cód. SIA", "Ponto", "Dia", "Data", "Manancial / Corpo Hídrico", "Município",
  "Latitude Original", "Longitude Original", "Latitude efetiva", "Longitude Efetiva",
  "Acessibilidade do Ponto", "Condições visuais da água (;)", "Condições Climaticas", "Problemas Enfrentados",
  "Amostras e Réplicas", "ID Zooplacton", "Hora de coleta", "Equipe", "Atividades realizadas (;)",
  "Houve ocorrência?", "Tipo de ocorrência", "Descrição da ocorrência", "Exige acompanhamento?",
  "Pendência / Encaminhamento", "Resumo do dia", "Status",
  // Colunas 28 e 29: posições que o leitor usava como padrão para links de Drive/Dropbox.
  "Situação do ponto", "Motivo da realocação",
];

function row(values: Partial<Record<string, string>>) {
  const base: Record<string, string> = {
    "Campanha": "2", "Dia": "1", "Data": "01/06/2026", "Manancial / Corpo Hídrico": "Rio Pequeno",
    "Município": "Curitiba", "Atividades realizadas (;)": "Coleta realizada", "Hora de coleta": "08:00",
    "Condições Climaticas": "Sol", "Acessibilidade do Ponto": "Fácil",
  };
  return HEADERS.map((header) => values[header] ?? base[header] ?? "");
}

async function workbook(rows: string[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Campanhas");
  sheet.addRow(HEADERS);
  rows.forEach((values) => sheet.addRow(values));
  const buffer = await book.xlsx.writeBuffer();
  return parseCampaignWorkbook(buffer as ArrayBuffer, "campo.xlsx");
}

describe("planilha de campo: coordenada e situação conferidas na importação", () => {
  it("aceita vírgula e recusa, com a linha, coordenada inválida e par incompleto", async () => {
    const result = await workbook([
      row({ "Cód. SIA": "1", "Latitude efetiva": "-25,4819", "Longitude Efetiva": "-49,1925" }),
      row({ "Cód. SIA": "2", "Latitude efetiva": "abc", "Longitude Efetiva": "-49.19", "Latitude Original": "-25.48", "Longitude Original": "-49.18" }),
      row({ "Cód. SIA": "3", "Latitude efetiva": "-25.48", "Longitude Efetiva": "", "Latitude Original": "-25.48", "Longitude Original": "-49.18" }),
      row({ "Cód. SIA": "4", "Latitude efetiva": "-95", "Longitude Efetiva": "-49.1", "Latitude Original": "-25.48", "Longitude Original": "-49.18" }),
    ]);

    expect(result.points.find((point) => point.code === "SIA-0001")?.effective).toEqual({ lat: -25.4819, lon: -49.1925 });
    expect(result.points.find((point) => point.code === "SIA-0002")?.effective).toBeNull();
    expect(result.rowIssues).toEqual([
      "Linha 3 (SIA-0002): latitude efetiva “abc” não é um número válido. A coordenada efetiva não foi importada.",
      "Linha 4 (SIA-0003): longitude efetiva em branco; latitude e longitude precisam vir em par. A coordenada efetiva não foi importada.",
      "Linha 5 (SIA-0004): latitude efetiva “-95” está fora da faixa permitida (entre -90 e 90). A coordenada efetiva não foi importada.",
    ]);
  });

  it("recusa a situação Realocado sem motivo e aceita com motivo", async () => {
    const result = await workbook([
      row({ "Cód. SIA": "5", "Latitude efetiva": "-25.48", "Longitude Efetiva": "-49.19", "Situação do ponto": "Realocado" }),
      row({
        "Cód. SIA": "6", "Latitude efetiva": "-25.49", "Longitude Efetiva": "-49.2",
        "Situação do ponto": "Realocado", "Motivo da realocação": "Ponte caída; coleta 300 m a jusante",
      }),
      row({ "Cód. SIA": "7", "Latitude efetiva": "-25.5", "Longitude Efetiva": "-49.3", "Situação do ponto": "Não realizado" }),
    ]);

    const [withoutReason, withReason, notRealized] = result.points;
    expect(withoutReason.executionStatus).toBeUndefined();
    expect(withReason).toMatchObject({ executionStatus: "relocated", relocationReason: "Ponte caída; coleta 300 m a jusante" });
    expect(notRealized.executionStatus).toBe("not_realized");
    expect(result.rowIssues).toEqual([
      "Linha 2 (SIA-0005): Informe o motivo da realocação: um ponto realocado precisa de justificativa. A situação “Realocado” não foi importada.",
    ]);
    // As colunas de situação não podem ser lidas como link de foto/Drive/Dropbox.
    expect(withReason).toMatchObject({ driveUrl: "", dropboxUrl: "", photoUrl: "" });

    expect(campaignPointToFieldDiaryPayload(withReason)).toMatchObject({
      executionStatus: "relocated",
      relocationReason: "Ponte caída; coleta 300 m a jusante",
      weatherConditions: "Céu limpo",
      pointAccessibility: "Acesso normal",
      activities: ["Coleta de eDNA"],
    });
  });
});
