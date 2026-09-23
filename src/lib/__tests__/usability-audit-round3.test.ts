import { describe, expect, it } from "vitest";
import { humanReportTables, reportConditionText, summaryReportTables } from "@/modules/results/report-export";
import type { ReportRecord } from "@/modules/results/report-snapshot";

const evidenceColumns = ["Conjunto analisado", "Número de Reads", "Proporção no conjunto", "Evidência: _sourceRow", "Evidência: ID organismo", "Evidência: Organismo do banco", "Evidência: Domínio", "Evidência: Score bibliográfico", "Evidência: Efeito ou mecanismo documentado", "Evidência: Toxicidade em animais", "Evidência: Toxina ou composto", "Evidência: Referências bibliográficas completas", "Evidência: DOI ou URL"];
const record: ReportRecord = { id: "p", title: "SIA-0001", tables: [
  { title: "Identificação e condição de uso", columns: ["Campo", "Valor"], rows: [["SIA", "SIA-0001"], ["Completude", "complete"], ["Conjuntos utilizados", 3], ["Condição de uso", "Provisório; qualidade não informada"]] },
  { title: "Índices e intervalos publicados (0–1)", columns: ["Domínio", "Índice", "Limite inferior", "Limite superior"], rows: [["Geral", 0.5, 0.5, 0.5]] },
  { title: "Componentes e qualidade — campos originais", columns: ["Conjunto", "Situação analítica", "Incluir na síntese (0/1)", "Motivo / observação analítica"], rows: [["COI", "Disponível", 1, "Mesmo motivo"], ["Cianobactérias", "Disponível", 1, "Mesmo motivo"]] },
  { title: "Ocorrências moleculares — campos originais", columns: ["Conjunto analisado", "Espécie", "Número de Reads", "Proporção no conjunto"], rows: [["Cianobactérias", "Pouco", 10, 0.01], ["Cianobactérias", "Dominante", 900, 0.9], ["Cianobactérias", "Ausente", 0, 0]] },
  { title: "Associações bibliográficas relacionadas — não confirmação local", columns: evidenceColumns, rows: [
    ["Bactérias", 3, 0.0004, 1, "T1", "Raro", "Saúde humana", 2, "Efeito raro", "Não documentada nas fontes selecionadas.", "Não identificado ou não aplicável.", "Ref A", "https://doi.org/a"],
    ["Cianobactérias", 900, 0.9, 2, "T2", "Dominante", "Saúde humana", 3, "Efeito forte", "Sem ensaio animal selecionado.", "Microcistinas.", "Ref B https://doi.org/b", "https://doi.org/b https://who.int/x"],
    ["Cianobactérias", 900, 0.9, 3, "T2", "Dominante", "Ambiental", 2, "Efeito ambiental", null, null, "Ref B https://doi.org/b", null],
  ] },
] };

describe("auditoria de usabilidade — 3ª rodada: fichas", () => {
  it("põe primeiro o que mais pesou e resume o que quase não pesou", () => {
    const tables = humanReportTables(record);
    const titles = tables.map((table) => table.title);
    expect(titles.indexOf("Dominante — Saúde humana")).toBeLessThan(titles.indexOf("Dominante — Ambiental"));
    expect(titles).not.toContain("Raro — Saúde humana");
    const minor = tables.find((table) => table.title === "Associações de menor peso")!;
    expect(minor.rows[0]).toEqual(["Raro", "Saúde humana", 3, "0,04%", 2, "Efeito raro"]);
    const top = tables.find((table) => table.title === "O que mais pesou no índice")!;
    expect(top.rows[0].slice(0, 5)).toEqual(["Dominante", "Cianobactérias", "Saúde humana", "90%", 3]);
    expect(top.rows[0][5]).toBeCloseTo(0.9);
  });

  it("tira frases de ausência do corpo, não repete referências nem links", () => {
    const tables = humanReportTables(record);
    const strong = tables.find((table) => table.title === "Dominante — Saúde humana")!;
    expect(strong.rows[0][0]).toBe("No ponto");
    expect(strong.rows.map(([name]) => name)).not.toContain("Toxicidade em animais");
    expect(strong.rows).toContainEqual(["Sem registro nas fontes", "toxicidade em animais"]);
    expect(strong.rows).toContainEqual(["Toxina ou composto", "Microcistinas."]);
    expect(strong.rows).toContainEqual(["DOI ou URL", "https://who.int/x"]);
    const second = tables.find((table) => table.title === "Dominante — Ambiental")!;
    expect(second.rows).toContainEqual(["Referências bibliográficas completas", "As mesmas de «Dominante — Saúde humana»."]);
  });

  it("síntese traz organismos dominantes, conjuntos em ordem fixa e observações sem repetição", () => {
    const summary = summaryReportTables(record);
    expect(summary.find((table) => table.title === "Organismos dominantes")!.rows).toEqual([["Cianobactérias", "Dominante", 900, "90%"], ["Cianobactérias", "Pouco", 10, "1%"]]);
    const sets = summary.find((table) => table.title === "Conjuntos analíticos")!;
    expect(sets.columns).not.toContain("Situação analítica");
    expect(sets.rows.map(([name]) => name)).toEqual(["Cianobactérias", "COI"]);
    expect(summary.find((table) => table.title === "Observações analíticas")!.rows).toEqual([["Situação (todos os conjuntos)", "Disponível"], ["Todos os conjuntos", "Mesmo motivo"]]);
    expect(summary.find((table) => table.title === "Índices publicados (escala 0–1)")!.columns).toEqual(["Domínio", "Índice"]);
    expect(JSON.stringify(summary)).not.toContain("Conjuntos analíticos utilizados");
    expect(reportConditionText("Provisório; qualidade não informada")).toBe("Provisório — o laboratório ainda não informou a qualidade dos conjuntos; os valores podem mudar");
  });
});
