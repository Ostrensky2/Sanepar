import { countLabel, formatNumber, isCoordinateField } from "@/lib/number-format";
import { defaultCampaigns } from "@/lib/campaign-management";
import { isHiddenVersionField } from "./hidden-fields";
import { reportIndexColumn, reportText, type ReportRecord, type ReportSnapshot, type ReportTable, type ReportValue } from "./report-snapshot";

export function isReportIndex(table: ReportTable, row: ReportValue[], column: number) { return !!table.indexColumns?.includes(column) || (table.columns[0] === "Campo" && column === 1 && reportIndexColumn(String(row[0]))); }
/** Texto de PDF/impressão: índices com três casas fixas; demais números com no máximo três casas, exceto coordenadas (completas). O XLSX mantém os valores brutos. */
export function reportCell(table: ReportTable, row: ReportValue[], column: number) { const value = row[column]; const field = table.columns[0] === "Campo" ? String(row[0]) : table.columns[column]; return typeof value === "number" && !isCoordinateField(field) ? isReportIndex(table, row, column) ? indexText(value) : formatNumber(value) : reportText(value); }
// Roboto bundled with pdfmake lacks U+2192; PDF-only textual equivalent, never source/XLSX mutation.
export const pdfText = (text: string) => text.replaceAll("→", "->");
function assertSnapshot(snapshot: ReportSnapshot) { if (!snapshot.records.length || snapshot.records.length !== snapshot.selectedIds.length || snapshot.records.some((record, index) => record.id !== snapshot.selectedIds[index])) throw new Error("Escopo explícito do relatório incompatível."); }

export type ReportMode = "summary" | "detailed";
/** Notas curtas de leitura, ao final do documento. Detalhes técnicos de origem ficam somente na aba Rastreabilidade do XLSX. */
export const reportNotes = [
  "Índices em escala de 0 a 1, apresentados com três casas decimais.",
  "Pontos parciais mostram uma faixa possível, sem valor único, e ficam fora de médias e rankings.",
  "Detectar DNA não comprova abundância, viabilidade, toxina ou dano no local. A literatura descreve efeitos possíveis; não os confirma no ponto. Organismo sem nota não conta como zero.",
];

const COLOR = { navy: "#004262", teal: "#008e9c", ink: "#17354c", muted: "#5b6f7f", line: "#d5e0e7", soft: "#f2f6f8" };
const indexText = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const isFieldTable = (table: ReportTable) => table.columns[0] === "Campo" && table.columns[1] === "Valor";
const isPointRecord = (record: ReportRecord) => record.tables.some((table) => table.title === "Identificação e condição de uso");

/** Data/hora de emissão legível (pt-BR, horário de Brasília); textos não ISO permanecem como estão. */
export function reportDate(value: string) {
  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} às ${part("hour")}:${part("minute")}`;
}
/** "C2" → "2ª Campanha · Outono 2026 (C2)". */
export function reportCampaignLabel(code: ReportValue | undefined) {
  const match = String(code ?? "").match(/^C(\d+)$/);
  const title = match ? defaultCampaigns[Number(match[1]) - 1]?.title : undefined;
  return title ? `${title.replace(" - ", " · ")} (${code})` : reportText(code ?? null);
}
function fieldDate(value: ReportValue) {
  if (typeof value !== "string") return value;
  const time = value.match(/^1899-12-3[01]T(\d{2}):(\d{2})/);
  if (time) return `${time[1]}:${time[2]}`;
  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
  return day ? `${day[3]}/${day[2]}/${day[1]}` : value;
}
const coordinate = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
/** Célula de tabela: vazio vira travessão para não repetir "Não informado" em cada coluna. */
const tableCell = (table: ReportTable, row: ReportValue[], column: number) => row[column] === null ? "—" : reportCell(table, row, column);
const range = (lower: ReportValue, upper: ReportValue) => typeof lower === "number" && typeof upper === "number" ? `${indexText(lower)} – ${indexText(upper)}` : "—";
const completenessLabels: Record<string, string> = { complete: "Completo — 3/3", partial_2: "Parcial — 2/3", partial_1: "Parcial — 1/3", unavailable: "Indisponível — 0/3" };
const reportHeadingText = (snapshot: ReportSnapshot) => snapshot.provenance.Campanha ?? snapshot.provenance["Contexto de campanha"];

// Campos técnicos de rastreabilidade: não entram na leitura humana (PDF/impressão).
const technicalRows = new Set(["SHA-256", "Publicação", "Revisão", "ID", "Aba", "Linha", "Método técnico", "Catálogo técnico"]);
const evidenceHidden = new Set(["_sourceRow", "Chave organismo-domínio", "Organismo do banco", "ID organismo", "Domínio", "Código do efeito", "Score na versão anterior", "Data da revisão", "Situação da associação", "Conteúdo acessado"]);
const summaryTitles = ["Identificação do ponto", "Índices publicados (escala 0–1)", "O que mais pesou no índice", "Organismos dominantes", "Conjuntos analíticos", "Observações analíticas", "Contexto de campo informado"];
/** Frases da fonte que só dizem que não há registro: saem do corpo da ficha e viram uma linha "Sem registro nas fontes". */
const EMPTY_EVIDENCE = /^(não documentad|não identificad|não informad|não se aplica|não aplicável|sem\s|nenhum registro|registro de infecção\/doença, não de toxicidade|efeito em humanos não demonstrado)/i;
const EMPTY_EVIDENCE_FIELDS = new Set(["Toxicidade em humanos", "Toxicidade em animais", "Toxina ou composto"]);
/** Contribuição mínima para a associação ganhar o texto integral; abaixo disso entra na tabela de menor peso. */
const DETAIL_MIN_CONTRIBUTION = 0.005;
const SET_ORDER = ["cian", "bact", "coi", "euc"];
const setRank = (value: ReportValue) => { const text = reportText(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(); const index = SET_ORDER.findIndex((prefix) => text.startsWith(prefix)); return index < 0 ? SET_ORDER.length : Math.min(index, 2); };
const percent = (value: number) => `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: value < 0.01 ? 2 : 1 })}%`;
/** "Provisório; qualidade não informada" → frase que qualquer leitor entende. */
export function reportConditionText(value: ReportValue) {
  if (value === null) return null;
  const [label, ...rest] = String(value).split(";").map((part) => part.trim()).filter(Boolean);
  const detail = rest.map((part) => /qualidade não informada/i.test(part) ? "o laboratório ainda não informou a qualidade dos conjuntos; os valores podem mudar" : part).join("; ");
  return detail ? `${label} — ${detail}` : label ?? String(value);
}

export function summaryReportTables(record: ReportRecord): ReportTable[] {
  const tables = humanReportTables(record);
  if (isPointRecord(record)) return tables.filter((table) => summaryTitles.includes(table.title));
  const selected = tables.filter((table) => table.title === "Proveniência do registro").map((table) => ({ ...table, title: "Vínculos do registro", rows: table.rows.filter(([key]) => ["Organismos", "Associações"].includes(String(key))) }));
  const fields = record.tables.find((table) => table.title === "Campos semânticos completos");
  const labels: Record<string, string> = { organismLabel: "Organismo", domain: "Domínio", effectLabel: "Efeito", score: "Score bibliográfico", evidenceType: "Tipo de evidência", campaign: "Campanha", sia: "Ponto SIA", analyticalStatus: "Situação analítica" };
  if (fields) selected.unshift({ title: "Identificação e contexto", columns: ["Campo", "Valor"], rows: fields.rows.filter(([key, value]) => Object.hasOwn(labels, String(key)) && value !== null).map(([key, value]) => [labels[String(key)], key === "campaign" ? reportCampaignLabel(value) : value]) });
  return selected.filter((table) => table.rows.length);
}

const reportTables = (record: ReportRecord, mode: ReportMode) => mode === "detailed" ? humanReportTables(record) : summaryReportTables(record);

/** Presentation projection only. Neither the collected snapshot nor the full XLSX is changed. */
export function humanReportTables(record: ReportRecord): ReportTable[] {
  if (!isPointRecord(record)) return record.tables.filter((table) => !["Campos semânticos completos", "Campos originais"].includes(table.title)).map((table) => isFieldTable(table) ? { ...table, rows: table.rows.filter(([key]) => !technicalRows.has(String(key)) && !isHiddenVersionField(String(key))) } : table).filter((table) => table.rows.length || !isFieldTable(table));
  const pick = (table: ReportTable, row: ReportValue[], name: string) => row[table.columns.indexOf(name)] ?? null;
  const result: ReportTable[] = [];
  const identity = record.tables.find((table) => table.title === "Identificação e condição de uso");
  if (identity) {
    const value = (name: string) => identity.rows.find(([key]) => key === name)?.[1] ?? null;
    const latitude = value("Latitude"), longitude = value("Longitude");
    const used = value("Conjuntos utilizados");
    const rows: ReportValue[][] = [
      ["Ponto (SIA)", value("SIA")], ["Manancial", value("Manancial")], ["Município", value("Município")],
      ["Campanha", reportCampaignLabel(value("Campanha"))],
      ["Completude", completenessLabels[String(value("Completude"))] ?? value("Completude")],
      // "Completo — 3/3" já diz quantos conjuntos entraram; a contagem só aparece se a completude faltar.
      ...(value("Completude") === null && used !== null ? [["Conjuntos analíticos utilizados", typeof used === "number" ? `${used} de 3` : used]] : []),
      ...(typeof latitude === "number" && typeof longitude === "number" ? [["Coordenadas", `Lat. ${coordinate(latitude)} · Long. ${coordinate(longitude)}`]] : []),
      ...(value("Condição de uso") !== null ? [["Condição de uso", reportConditionText(value("Condição de uso"))]] : []),
      ...(value("Observações") !== null && value("Observações") !== "" ? [["Observações", value("Observações")]] : []),
    ];
    result.push({ title: "Identificação do ponto", columns: ["Campo", "Valor"], rows });
  }
  const indices = record.tables.find((table) => table.title === "Índices e intervalos publicados (0–1)");
  if (indices) {
    // A coluna de faixa só aparece quando algum domínio não tem valor único (ponto parcial).
    const partial = indices.rows.some(([, value]) => value === null);
    result.push(partial
      ? { title: "Índices publicados (escala 0–1)", columns: ["Domínio", "Índice", "Faixa possível"], indexColumns: [1], rows: indices.rows.map(([name, value, lower, upper]) => [name, value === null ? "Sem valor pontual" : value, value === null ? range(lower, upper) : "—"]) }
      : { title: "Índices publicados (escala 0–1)", columns: ["Domínio", "Índice"], indexColumns: [1], rows: indices.rows.map(([name, value]) => [name, value]) });
  }
  const evidence = record.tables.find((table) => table.title === "Associações bibliográficas relacionadas — não confirmação local");
  const molecular = record.tables.find((table) => table.title === "Ocorrências moleculares — campos originais");
  const weights = evidence ? evidenceWeights(evidence) : [];
  const weighted = weights.filter((item) => item.contribution !== null && item.contribution > 0).sort((a, b) => (b.contribution as number) - (a.contribution as number));
  if (weighted.length) result.push({ title: "O que mais pesou no índice", columns: ["Organismo", "Conjunto", "Domínio", "Fatia dos reads", "Nota", "Contribuição"], indexColumns: [5], rows: weighted.slice(0, 6).map((item) => [item.organism, item.set, item.domain, item.proportion === null ? null : percent(item.proportion), item.score, item.contribution]) });
  if (molecular && ["Conjunto analisado", "Espécie", "Número de Reads"].every((name) => molecular.columns.includes(name))) {
    const bySet = new Map<string, { organism: ReportValue; reads: number; proportion: number | null }[]>();
    for (const row of molecular.rows) {
      const reads = pick(molecular, row, "Número de Reads");
      if (typeof reads !== "number" || reads <= 0) continue;
      const set = reportText(pick(molecular, row, "Conjunto analisado"));
      const proportion = pick(molecular, row, "Proporção no conjunto");
      bySet.set(set, [...(bySet.get(set) ?? []), { organism: pick(molecular, row, "Espécie"), reads, proportion: typeof proportion === "number" ? proportion : null }]);
    }
    const rows = [...bySet].sort(([a], [b]) => setRank(a) - setRank(b)).flatMap(([set, items]) => [...items].sort((a, b) => b.reads - a.reads).slice(0, 3).map((item) => [set, item.organism, item.reads, item.proportion === null ? null : percent(item.proportion)] as ReportValue[]));
    if (rows.length) result.push({ title: "Organismos dominantes", columns: ["Conjunto", "Organismo", "Reads", "Fatia no conjunto"], rows });
  }
  const components = record.tables.find((table) => table.title === "Componentes e qualidade — campos originais");
  if (components) {
    const usedText = (value: ReportValue) => value === 1 || value === "1" || value === true ? "Sim" : value === 0 || value === "0" || value === false ? "Não" : value;
    const ordered = [...components.rows].sort((a, b) => setRank(pick(components, a, "Conjunto")) - setRank(pick(components, b, "Conjunto")));
    const statuses = new Set(ordered.map((row) => reportText(pick(components, row, "Situação analítica"))));
    const sameStatus = statuses.size === 1 && ordered.length > 1;
    result.push({ title: "Conjuntos analíticos", columns: ["Conjunto", ...(sameStatus ? [] : ["Situação analítica"]), "Entrou no índice", "Ambiental", "Operacional", "Saúde humana"], indexColumns: sameStatus ? [2, 3, 4] : [3, 4, 5], rows: ordered.map((row) => [pick(components, row, "Conjunto"), ...(sameStatus ? [] : [pick(components, row, "Situação analítica")]), usedText(pick(components, row, "Incluir na síntese (0/1)")), pick(components, row, "Componente ambiental utilizado"), pick(components, row, "Componente operacional utilizado"), pick(components, row, "Componente saúde utilizado")]) });
    // Mesma observação em todos os conjuntos aparece uma vez só.
    const reasons = ordered.flatMap((row) => { const reason = pick(components, row, "Motivo / observação analítica"); return reason === null || reason === "" ? [] : [[pick(components, row, "Conjunto"), reason] as ReportValue[]]; });
    const sameReason = reasons.length > 1 && reasons.length === ordered.length && new Set(reasons.map(([, reason]) => reason)).size === 1;
    const notes: ReportValue[][] = [...(sameStatus ? [["Situação (todos os conjuntos)", [...statuses][0]]] : []), ...(sameReason ? [["Todos os conjuntos", reasons[0][1]]] : reasons)];
    if (notes.length) result.push({ title: "Observações analíticas", columns: ["Campo", "Valor"], rows: notes });
  }
  if (molecular) {
    const context = ["Data", "Hora", "Acessibilidade do Ponto"].flatMap((name) => {
      const values = [...new Set(molecular.rows.map((row) => fieldDate(pick(molecular, row, name))).filter((value) => value !== null && value !== ""))];
      return values.map((value) => [name === "Acessibilidade do Ponto" ? "Acessibilidade do ponto" : name, value]);
    });
    if (context.length) result.push({ title: "Contexto de campo informado", columns: ["Campo", "Valor"], rows: context });
  }
  if (evidence) {
    const associations = new Map<string, { title: string; fields: ReportValue[][]; sets: Set<string>; weight: EvidenceWeight }>();
    evidence.rows.forEach((row, index) => {
      const fields = evidence.columns.flatMap((name, column) => name.startsWith("Evidência: ") ? [[name.slice(11), row[column] ?? null] as ReportValue[]] : []);
      const line = pick(evidence, row, "Evidência: _sourceRow");
      const organism = pick(evidence, row, "Evidência: ID organismo");
      // Only the same evidence source row, organism, domain AND full evidence text may collapse.
      const key = line !== null && organism !== null ? JSON.stringify([line, organism, pick(evidence, row, "Evidência: Domínio"), fields]) : `unresolved-${index}`;
      const existing = associations.get(key);
      const weight = weights[index];
      if (existing) {
        existing.sets.add(weight.set);
        if ((weight.contribution ?? -1) > (existing.weight.contribution ?? -1)) existing.weight = weight;
      } else associations.set(key, { title: `${reportText(pick(evidence, row, "Evidência: Organismo do banco"))} — ${reportText(pick(evidence, row, "Evidência: Domínio"))}`, fields, sets: new Set([weight.set]), weight });
    });
    // Mais peso no índice primeiro; peso desconhecido fica junto dos detalhados, nunca escondido.
    const ordered = [...associations.values()].sort((a, b) => (b.weight.contribution ?? Infinity) - (a.weight.contribution ?? Infinity));
    const detailed = ordered.filter((item) => item.weight.contribution === null || item.weight.contribution >= DETAIL_MIN_CONTRIBUTION);
    const minor = ordered.filter((item) => !detailed.includes(item));
    result.push({ title: "Evidências da literatura", columns: ["Campo", "Valor"], rows: [
      ["Associações encontradas", ordered.length],
      ["Ordem", "Da que mais pesou no índice para a que menos pesou (fatia dos reads × nota ÷ 3)."],
      ...(minor.length ? [["Menor peso", `${countLabel(minor.length, "associação", "associações")} com contribuição abaixo de ${indexText(DETAIL_MIN_CONTRIBUTION)} aparecem resumidas no fim.`]] : []),
      ["Leitura", "Cada associação resume o que a literatura descreve para o organismo detectado. Não confirma efeito no ponto."],
    ] });
    // Mesmo bloco de referências já impresso para outro domínio do organismo: aponta para ele em vez de repetir.
    const printedReferences = new Map<string, string>();
    for (const item of detailed) {
      const rows = evidenceRows(item.fields, item.sets, item.weight).map((row): ReportValue[] => {
        if (row[0] !== "Referências bibliográficas completas") return row;
        const earlier = printedReferences.get(String(row[1]));
        if (earlier) return [row[0], `As mesmas de «${earlier}».`];
        printedReferences.set(String(row[1]), item.title);
        return row;
      });
      result.push({ title: item.title, columns: ["Campo", "Valor"], rows });
    }
    if (minor.length) result.push({ title: "Associações de menor peso", columns: ["Organismo", "Domínio", "Reads", "Fatia dos reads", "Nota", "Efeito descrito"], rows: minor.map((item) => [item.weight.organism, item.weight.domain, item.weight.reads, item.weight.proportion === null ? null : percent(item.weight.proportion), item.weight.score, item.fields.find(([name]) => name === "Efeito ou mecanismo documentado")?.[1] ?? null]) });
  }
  return result;
}

type EvidenceWeight = { organism: ReportValue; domain: ReportValue; set: string; reads: number | null; proportion: number | null; score: number | null; contribution: number | null };
/** Peso de cada linha de evidência no índice do ponto: fatia dos reads × nota ÷ 3 (o mesmo q da ficha). */
function evidenceWeights(evidence: ReportTable): EvidenceWeight[] {
  const at = (row: ReportValue[], name: string) => { const index = evidence.columns.indexOf(name); return index < 0 ? null : row[index] ?? null; };
  return evidence.rows.map((row) => {
    const reads = at(row, "Número de Reads"), proportion = at(row, "Proporção no conjunto"), score = at(row, "Evidência: Score bibliográfico");
    const numericProportion = typeof proportion === "number" && Number.isFinite(proportion) ? proportion : null;
    const numericScore = typeof score === "number" && [1, 2, 3].includes(score) ? score : null;
    return { organism: at(row, "Evidência: Organismo do banco"), domain: at(row, "Evidência: Domínio"), set: reportText(at(row, "Conjunto analisado")), reads: typeof reads === "number" ? reads : null, proportion: numericProportion, score: numericScore, contribution: numericProportion !== null && numericScore !== null ? numericProportion * numericScore / 3 : null };
  });
}

/** DOI/URL que ainda não aparecem na referência completa; os repetidos saem. */
function newLinks(value: ReportValue, references: string): ReportValue[][] {
  if (value === null) return [];
  const links = String(value).split(/\s+/).filter((link) => link && !references.includes(link));
  return links.length ? [["DOI ou URL", links.join(" ")]] : [];
}

/** Linhas de uma associação: primeiro o que aconteceu no ponto, depois só os campos com conteúdo; frases de ausência viram uma linha. */
function evidenceRows(fields: ReportValue[][], sets: Set<string>, weight: EvidenceWeight): ReportValue[][] {
  const visible = fields.filter(([name, value]) => value !== null && value !== "" && !evidenceHidden.has(String(name)) && !isHiddenVersionField(String(name)));
  const empty = visible.filter(([name, value]) => EMPTY_EVIDENCE_FIELDS.has(String(name)) && EMPTY_EVIDENCE.test(String(value)));
  const text = (name: string) => visible.find(([key]) => key === name)?.[1] ?? null;
  const references = reportText(text("Referências bibliográficas completas"));
  const rows = visible.filter((row) => !empty.includes(row)).filter(([name, value]) =>
    !(name === "Score bibliográfico") &&
    // "Resolução" repete "Contexto do estudo" com frequência; DOI repete a referência completa.
    !(name === "Resolução da associação taxonômica" && value === text("Contexto do estudo")) &&
    name !== "DOI ou URL").concat(newLinks(text("DOI ou URL"), references));
  const where = [[...sets].join("; "), weight.reads === null ? null : `${formatNumber(weight.reads)} reads`, weight.proportion === null ? null : `${percent(weight.proportion)} do conjunto`, weight.score === null ? null : `nota ${weight.score}`, weight.contribution === null ? null : `contribuição ${indexText(weight.contribution)}`].filter(Boolean).join(" · ");
  return [["No ponto", where], ...rows, ...(empty.length ? [["Sem registro nas fontes", empty.map(([name]) => String(name).toLocaleLowerCase("pt-BR")).join("; ")]] : [])];
}

/* ------------------------------------------------------------------ XLSX */

type Worksheet = import("exceljs").Worksheet;
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
const thin = { style: "thin" as const, color: { argb: argb(COLOR.line) } };
function sheetName(index: number, title: string, used: Set<string>) {
  const base = `${String(index + 1).padStart(2, "0")} ${title.split(" · ")[0]}`.replace(/[\\/?*[\]:]/g, "-").trim().slice(0, 31);
  let name = base, suffix = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 27)} (${suffix++})`;
  used.add(name.toLowerCase());
  return name;
}
function sheetHeader(sheet: Worksheet, title: string, subtitle: string, width: number) {
  sheet.addRow([title]); sheet.mergeCells(1, 1, 1, width);
  sheet.getRow(1).font = { name: "Arial", size: 15, bold: true, color: { argb: argb(COLOR.navy) } }; sheet.getRow(1).height = 24;
  sheet.addRow([subtitle]); sheet.mergeCells(2, 1, 2, width);
  sheet.getRow(2).font = { name: "Arial", size: 10, color: { argb: argb(COLOR.muted) } };
  sheet.getRow(2).border = { bottom: { style: "medium", color: { argb: argb(COLOR.teal) } } };
}
function sheetTable(sheet: Worksheet, table: ReportTable, width: number) {
  sheet.addRow([]);
  const title = sheet.addRow([table.title]); sheet.mergeCells(title.number, 1, title.number, width);
  title.font = { name: "Arial", size: 12, bold: true, color: { argb: argb(COLOR.navy) } };
  const header = sheet.addRow(table.columns);
  header.eachCell((cell) => { cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(COLOR.navy) } }; cell.border = { top: thin, bottom: thin, left: thin, right: thin }; });
  if (!table.rows.length) { sheet.addRow(["Nenhum registro nesta seleção."]).font = { name: "Arial", size: 10, italic: true, color: { argb: argb(COLOR.muted) } }; return; }
  table.rows.forEach((row, index) => {
    // ExcelJS string values are shared strings, never formula objects (including =,+,-,@).
    const added = sheet.addRow(row.map((value, column) => value === null ? "Não informado" : isFieldTable(table) && column === 1 && row[0] === "Completude" ? completenessLabels[String(value)] ?? value : value));
    added.eachCell({ includeEmpty: true }, (cell, column) => {
      if (column > table.columns.length) return;
      cell.font = { name: "Arial", size: 10, bold: isFieldTable(table) && column === 1, color: { argb: argb(COLOR.ink) } };
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      if (index % 2 === 1 || (isFieldTable(table) && column === 1)) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(COLOR.soft) } };
    });
    row.forEach((value, column) => { if (typeof value === "number" && isReportIndex(table, row, column)) added.getCell(column + 1).numFmt = "0.000"; });
  });
}
function fitColumns(sheet: Worksheet, tables: ReportTable[], width: number) {
  for (let column = 0; column < width; column++) {
    const longest = Math.max(12, ...tables.flatMap((table) => [table.columns[column] ?? "", ...table.rows.map((row) => row[column] === undefined ? "" : reportText(row[column]))]).map((text) => Math.min(text.length, 80)));
    sheet.getColumn(column + 1).width = Math.min(60, longest + 2);
  }
}

/** Quadro de abertura da aba Leitura: um ponto por linha, na ordem exportada. Só quando há mais de um ponto. */
export function readingOverview(records: ReportRecord[]): ReportTable | null {
  if (records.length < 2 || !records.every(isPointRecord)) return null;
  const rows = records.map((record) => {
    const tables = humanReportTables(record);
    const field = (title: string, name: string) => tables.find((table) => table.title === title)?.rows.find(([key]) => key === name)?.[1] ?? null;
    // Ponto parcial traz "Sem valor pontual" no lugar do número.
    const index = (name: string) => field("Índices publicados (escala 0–1)", name);
    const top = tables.find((table) => table.title === "O que mais pesou no índice")?.rows[0];
    return [field("Identificação do ponto", "Ponto (SIA)"), field("Identificação do ponto", "Manancial"), field("Identificação do ponto", "Município"), index("Geral"), index("Ambiental"), index("Operacional"), index("Saúde humana"), field("Identificação do ponto", "Completude"), top ? `${reportText(top[0])} (${reportText(top[2])})` : null];
  });
  return { title: `Pontos exportados (${records.length})`, columns: ["Ponto", "Manancial", "Município", "Geral", "Ambiental", "Operacional", "Saúde humana", "Completude", "O que mais pesou"], indexColumns: [3, 4, 5, 6], rows };
}

export async function reportWorkbook(snapshot: ReportSnapshot) {
  assertSnapshot(snapshot);
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yva’e";
  const campaign = reportHeadingText(snapshot);
  const subtitle = [campaign ? reportCampaignLabel(campaign) : null, `Emitido em ${reportDate(snapshot.generatedAt)}`].filter(Boolean).join("  ·  ");
  const used = new Set<string>(["leitura", "resumo", "rastreabilidade"]);
  const names = snapshot.records.map((record, index) => sheetName(index, record.title, used));

  // Primeira aba: a mesma leitura da ficha-síntese (o que mais pesou, dominantes…); as abas numeradas seguem integrais.
  const reading = workbook.addWorksheet("Leitura", { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb(COLOR.teal) } } });
  const overview = readingOverview(snapshot.records);
  const readingTables = snapshot.records.map((record) => summaryReportTables(record));
  const readingWidth = Math.max(2, overview?.columns.length ?? 0, ...readingTables.flat().map((table) => table.columns.length));
  sheetHeader(reading, `Leitura · ${snapshot.title}`, `${subtitle}  ·  Mesma ordem da ficha. As abas numeradas trazem todos os campos da fonte.`, readingWidth);
  if (overview) sheetTable(reading, overview, readingWidth);
  snapshot.records.forEach((record, position) => {
    reading.addRow([]);
    const heading = reading.addRow([`${position + 1}. ${record.title}`]); reading.mergeCells(heading.number, 1, heading.number, readingWidth);
    heading.font = { name: "Arial", size: 13, bold: true, color: { argb: argb(COLOR.teal) } };
    heading.border = { bottom: { style: "thin", color: { argb: argb(COLOR.teal) } } };
    for (const table of readingTables[position]) sheetTable(reading, table, readingWidth);
  });
  fitColumns(reading, [...(overview ? [overview] : []), ...readingTables.flat()], readingWidth);

  const summary = workbook.addWorksheet("Resumo", { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb(COLOR.navy) } } });
  sheetHeader(summary, snapshot.title, subtitle, 3);
  const index: ReportTable = { title: `Fichas incluídas (${snapshot.records.length})`, columns: ["Nº", "Ficha", "Aba"], rows: snapshot.records.map((record, position) => [position + 1, record.title, names[position]]) };
  sheetTable(summary, index, 3); fitColumns(summary, [index], 3);

  for (const [position, record] of snapshot.records.entries()) {
    const tables = record.tables.filter((table) => table.title !== "Foto de campo");
    const width = Math.max(2, ...tables.map((table) => table.columns.length));
    const sheet = workbook.addWorksheet(names[position], { views: [{ showGridLines: false }] });
    sheetHeader(sheet, record.title, subtitle, width);
    if (record.photoUrl) { const image = workbook.addImage({ base64: record.photoUrl, extension: record.photoUrl.startsWith("data:image/png") ? "png" : "jpeg" }); sheet.addRow([]); sheet.addImage(image, { tl: { col: 0, row: sheet.rowCount }, ext: { width: 320, height: 180 } }); for (let i = 0; i < 10; i++) sheet.addRow([]); }
    for (const table of tables) sheetTable(sheet, table, width);
    fitColumns(sheet, tables, width);
  }

  const trace = workbook.addWorksheet("Rastreabilidade", { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb(COLOR.muted) } } });
  sheetHeader(trace, "Rastreabilidade da exportação", subtitle, 2);
  const origin: ReportTable = { title: "Origem dos dados", columns: ["Campo", "Valor"], rows: [["Unidade de seleção", snapshot.unit], ["Quantidade selecionada", snapshot.records.length], ...Object.entries(snapshot.provenance), ...snapshot.selectedIds.map((id) => ["Identidade selecionada", id])] };
  const notes: ReportTable = { title: "Notas", columns: ["Campo", "Valor"], rows: [...reportNotes, ...snapshot.limitations].map((text, position) => [`Nota ${position + 1}`, text]) };
  sheetTable(trace, origin, 2); sheetTable(trace, notes, 2);
  trace.getColumn(1).width = 28; trace.getColumn(2).width = 100;

  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true, ...cell.alignment }; }));
    sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
    sheet.headerFooter = { oddFooter: "&L&8Yva’e&R&8Página &P de &N" };
  });
  return workbook;
}

/* ------------------------------------------------------------------ PDF */

type PdfNode = Record<string, unknown>;
type LayoutNode = { table: { body: unknown[] } };
const fieldLayout = { hLineWidth: (i: number, node: LayoutNode) => i === 0 || i === node.table.body.length ? 0 : 0.5, vLineWidth: () => 0, hLineColor: () => COLOR.line, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 };
const dataLayout = { ...fieldLayout, fillColor: (row: number) => row === 0 ? COLOR.navy : row % 2 === 0 ? COLOR.soft : null };
const rule = (width = 523, color = COLOR.teal, lineWidth = 1.5) => ({ canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth, lineColor: color }] });

function pdfFieldTable(table: ReportTable): PdfNode {
  return { table: { widths: [150, "*"], body: table.rows.map((row) => [{ text: pdfText(reportText(row[0])), style: "fieldLabel", fillColor: COLOR.soft }, { text: pdfText(reportCell(table, row, 1)) }]) }, layout: fieldLayout, fontSize: 9.5 };
}
function pdfTable(table: ReportTable): PdfNode[] {
  if (!table.rows.length) return [{ text: "Nenhum registro nesta seleção.", style: "muted" }];
  if (isFieldTable(table)) return [pdfFieldTable(table)];
  if (table.columns.length <= 6 && table.rows.every((row) => row.every((value) => reportText(value).length < 150))) {
    return [{ table: { headerRows: 1, widths: table.columns.map((_, i) => i === 0 ? "auto" : "*"), body: [table.columns.map((text) => ({ text: pdfText(text), style: "tableHeader" })), ...table.rows.map((row) => row.map((_, i) => ({ text: pdfText(tableCell(table, row, i)), alignment: isReportIndex(table, row, i) ? "right" : "left" })))] }, layout: dataLayout, fontSize: 9 }];
  }
  return table.rows.flatMap((row, index) => [{ text: `Registro ${index + 1}`, style: "muted", bold: true, margin: [0, 6, 0, 2] }, pdfFieldTable({ ...table, columns: ["Campo", "Valor"], rows: row.map((value, i) => [table.columns[i], typeof value === "number" && isReportIndex(table, row, i) ? indexText(value) : value]) })]);
}

export function reportPdfDefinition(snapshot: ReportSnapshot, mode: ReportMode = "summary") {
  assertSnapshot(snapshot);
  const campaign = reportHeadingText(snapshot);
  const campaignLabel = campaign ? reportCampaignLabel(campaign) : "";
  const issued = reportDate(snapshot.generatedAt);
  const count = snapshot.records.length;
  const content: PdfNode[] = [
    { text: (mode === "detailed" ? "Relatório detalhado" : "Ficha-síntese").toUpperCase(), style: "eyebrow" },
    { text: pdfText(snapshot.title), style: "title" },
    { text: [campaignLabel, `Emitido em ${issued}`, `${count} ${count === 1 ? "ficha" : "fichas"}`].filter(Boolean).join("   ·   "), style: "meta" },
    { ...rule(), margin: [0, 8, 0, 4] },
  ];
  snapshot.records.forEach((record, recordIndex) => {
    content.push({ stack: [{ text: pdfText(record.title), style: "recordTitle" }, { ...rule(523, COLOR.line, 0.75), margin: [0, 4, 0, 0] }], ...(recordIndex ? { pageBreak: "before" } : {}), margin: [0, 14, 0, 4] });
    if (record.photoUrl && mode === "detailed") content.push({ image: record.photoUrl, fit: [480, 240], margin: [0, 6, 0, 6] });
    for (const table of reportTables(record, mode)) {
      const heading = { text: pdfText(table.title), headlineLevel: 2, style: "sectionTitle" };
      const body = pdfTable(table);
      // Heading and short tables stay together; long scientific text remains splittable.
      const short = table.rows.length <= 12 && table.rows.every((row) => row.every((value) => reportText(value).length < 150));
      if (short) content.push({ stack: [heading, ...body], unbreakable: true });
      else content.push(heading, ...body);
    }
  });
  content.push({ stack: [{ text: "Notas de leitura", style: "sectionTitle" }, { ul: reportNotes.map((text) => pdfText(text)), style: "muted" }], unbreakable: true, margin: [0, 16, 0, 0] });
  return {
    pageBreakBefore: (node: { headlineLevel?: number }, nodes: { getFollowingNodesOnPage: () => unknown[] }) => node.headlineLevel === 2 && nodes.getFollowingNodesOnPage().length === 0,
    info: { title: snapshot.title, author: "Yva’e" }, pageSize: "A4", pageMargins: [36, 48, 36, 44],
    defaultStyle: { font: "Roboto", fontSize: 10, color: COLOR.ink, lineHeight: 1.2 },
    styles: {
      eyebrow: { fontSize: 8.5, bold: true, color: COLOR.teal, characterSpacing: 1 },
      title: { fontSize: 20, bold: true, color: COLOR.navy, margin: [0, 2, 0, 4] },
      meta: { fontSize: 9.5, color: COLOR.muted },
      recordTitle: { fontSize: 15, bold: true, color: COLOR.navy },
      sectionTitle: { fontSize: 11, bold: true, color: COLOR.navy, margin: [0, 12, 0, 5] },
      tableHeader: { bold: true, color: "#ffffff", fontSize: 8.5 },
      fieldLabel: { bold: true, color: COLOR.navy },
      muted: { fontSize: 8.5, color: COLOR.muted },
    },
    header: { columns: [{ text: "Yva’e · Monitoramento de mananciais por eDNA", bold: true, color: COLOR.navy }, { text: pdfText(campaignLabel), alignment: "right", color: COLOR.muted }], margin: [36, 20, 36, 0], fontSize: 8 },
    footer: (page: number, pages: number) => ({ columns: [{ text: `Emitido em ${issued}`, color: COLOR.muted }, { text: `Página ${page} de ${pages}`, alignment: "right", color: COLOR.muted }], margin: [36, 12, 36, 0], fontSize: 8 }),
    content,
  };
}

export async function reportPdfBlob(snapshot: ReportSnapshot, mode: ReportMode = "summary") {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  pdfMake.addVirtualFileSystem(fonts);
  return pdfMake.createPdf(reportPdfDefinition(snapshot, mode)).getBlob();
}

export function downloadReport(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

/* ------------------------------------------------------------------ Impressão */

const printStyle = `body{font:12px/1.45 Arial,sans-serif;color:${COLOR.ink};margin:0}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:.08em;color:${COLOR.teal};text-transform:uppercase;margin:0}
h1{font-size:24px;color:${COLOR.navy};margin:2px 0 4px}
.meta{color:${COLOR.muted};margin:0 0 10px;padding-bottom:10px;border-bottom:2px solid ${COLOR.teal}}
h2{font-size:18px;color:${COLOR.navy};margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid ${COLOR.line};break-after:avoid}
h3{font-size:13px;color:${COLOR.navy};margin:14px 0 5px;break-after:avoid}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th,td{text-align:left;vertical-align:top;padding:5px 7px;border-bottom:1px solid ${COLOR.line};overflow-wrap:anywhere}
thead th{background:${COLOR.navy};color:#fff;font-size:11px}
tbody tr:nth-child(even) td{background:${COLOR.soft}}
table.fields th{width:180px;background:${COLOR.soft};color:${COLOR.navy}}
td.num{text-align:right;font-variant-numeric:tabular-nums}
thead{display:table-header-group}tr{break-inside:avoid}
article+article{break-before:page}
.notes{margin-top:18px;color:${COLOR.muted};font-size:11px}
@page{size:A4;margin:15mm}`;

export async function printReport(snapshot: ReportSnapshot, target: Window, mode: ReportMode = "summary") {
  assertSnapshot(snapshot);
  const doc = target.document; doc.title = snapshot.title; doc.documentElement.lang = "pt-BR"; doc.body.replaceChildren();
  const style = doc.createElement("style"); style.textContent = printStyle; doc.head.append(style);
  const text = (parent: HTMLElement, tag: string, value: string, className?: string) => { const node = doc.createElement(tag); node.textContent = value; if (className) node.className = className; parent.append(node); return node; };
  const campaign = reportHeadingText(snapshot);
  text(doc.body, "p", mode === "detailed" ? "Relatório detalhado" : "Ficha-síntese", "eyebrow");
  text(doc.body, "h1", snapshot.title);
  text(doc.body, "p", [campaign ? reportCampaignLabel(campaign) : null, `Emitido em ${reportDate(snapshot.generatedAt)}`, `${snapshot.records.length} ${snapshot.records.length === 1 ? "ficha" : "fichas"}`].filter(Boolean).join("  ·  "), "meta");
  snapshot.records.forEach((record) => {
    const article = text(doc.body, "article", ""); text(article, "h2", record.title);
    if (record.photoUrl && mode === "detailed") { const image = doc.createElement("img"); image.src = record.photoUrl; image.alt = `Foto de campo: ${record.title}`; image.width = 320; article.append(image); }
    for (const table of reportTables(record, mode)) {
      text(article, "h3", table.title);
      if (!table.rows.length) { text(article, "p", "Nenhum registro nesta seleção."); continue; }
      if (isFieldTable(table)) { const element = text(article, "table", "", "fields"); const body = text(element, "tbody", ""); table.rows.forEach((row) => { const tr = text(body, "tr", ""); text(tr, "th", reportText(row[0])); text(tr, "td", reportCell(table, row, 1)); }); continue; }
      const element = text(article, "table", ""); const head = text(element, "thead", ""); const tr = text(head, "tr", ""); table.columns.forEach((column) => text(tr, "th", column));
      const body = text(element, "tbody", ""); table.rows.forEach((row) => { const line = text(body, "tr", ""); row.forEach((_, i) => text(line, "td", tableCell(table, row, i), isReportIndex(table, row, i) ? "num" : undefined)); });
    }
  });
  const notes = text(doc.body, "section", "", "notes"); text(notes, "h3", "Notas de leitura"); const list = text(notes, "ul", ""); reportNotes.forEach((note) => text(list, "li", note));
  await Promise.all(Array.from(doc.images).map((image) => Promise.race([image.decode().catch(() => { image.remove(); }), new Promise<void>((resolve) => setTimeout(resolve, 3000))])));
  target.focus(); target.print();
}
