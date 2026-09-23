"use client";

import { useId, useState, type ReactNode } from "react";
import { formatNumber } from "@/lib/number-format";

const cellText = (value: string | number | boolean | null) => value === null ? "Não informado" : typeof value === "number" ? formatNumber(value) : String(value);

export type CampaignColumn<Row> = {
  key: string;
  label: string;
  value: (row: Row) => string | number | boolean | null;
  render?: (row: Row) => ReactNode;
};

export function campaignTableRows<Row>(rows: Row[], columns: CampaignColumn<Row>[], query: string, sort: string, descending: boolean) {
  const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const filtered = rows.filter((row) => columns.some((column) => normalize(column.value(row)).includes(normalize(query))));
  const column = columns.find((item) => item.key === sort);
  if (!column) return filtered;
  return filtered.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = column.value(a.row), right = column.value(b.row);
    if (left === null) return right === null ? a.index - b.index : 1;
    if (right === null) return -1;
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "pt-BR", { numeric: true });
    return (descending ? -order : order) || a.index - b.index;
  }).map(({ row }) => row);
}

/** "Mostrando 1–12 de 56 · 73 no total": linguagem de quem lê, não de banco de dados. */
export function campaignTableCounter(shown: { first: number; last: number }, filtered: number, inTable: number, population: number) {
  const range = shown.last ? `${shown.first}–${shown.last}` : "0";
  const fmt = (value: number) => value.toLocaleString("pt-BR");
  return `Mostrando ${range} de ${fmt(filtered)}${filtered !== inTable ? ` (filtrados de ${fmt(inTable)})` : ""}${population !== inTable ? ` · ${fmt(population)} no total` : ""}`;
}

/** Colunas com o mesmo valor em todas as linhas viram uma nota acima da tabela. */
export function constantColumns<Row>(rows: Row[], columns: CampaignColumn<Row>[]) {
  if (rows.length < 2) return [];
  return columns.filter((column) => {
    const first = cellText(column.value(rows[0]));
    return rows.every((row) => cellText(column.value(row)) === first);
  }).map((column) => ({ key: column.key, label: column.label, text: cellText(column.value(rows[0])) }));
}

export function CampaignDataTable<Row>({ title, rows, columns, rowKey, population = rows.length, onDetail, detailLabel = "Ver detalhe", filter, initialSort, initialDescending = false }: {
  title: string;
  rows: Row[];
  columns: CampaignColumn<Row>[];
  rowKey: (row: Row, index: number) => string;
  population?: number;
  onDetail?: (row: Row) => void;
  detailLabel?: string;
  filter?: { label: string; value: (row: Row) => string };
  initialSort?: string;
  initialDescending?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState(initialSort ?? columns[0]?.key ?? "");
  const [descending, setDescending] = useState(initialDescending);
  const [page, setPage] = useState(0);
  const constant = constantColumns(rows, columns);
  const shownColumns = columns.filter((column) => !constant.some((item) => item.key === column.key));
  const filtered = campaignTableRows(filter && category ? rows.filter((row) => filter.value(row) === category) : rows, columns, query, sort, descending);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * 12, (current + 1) * 12);
  const inputClass = "min-h-11 min-w-0 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]";
  return <section className="app-card min-w-0 p-4" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{title}</h3>
    <div className="my-3 flex flex-wrap items-end gap-2">
      <label className="type-label flex min-w-0 flex-1 flex-col gap-1">Buscar nesta tabela<input type="search" className={inputClass} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
      {filter && <label className="type-label flex flex-col gap-1">{filter.label}<select className={inputClass} value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }}><option value="">Todos</option>{[...new Set(rows.map(filter.value))].sort().map((value) => <option key={value} value={value}>{value || "Não informado"}</option>)}</select></label>}
      <label className="type-label flex flex-col gap-1">Ordenar por<select className={inputClass} value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}>{shownColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <button type="button" className={inputClass} onClick={() => { setDescending(!descending); setPage(0); }}>{descending ? "Decrescente" : "Crescente"}</button>
      <button type="button" className={inputClass} disabled={!query && !category} onClick={() => { setQuery(""); setCategory(""); setPage(0); }}>Limpar</button>
    </div>
    {constant.length > 0 && <p className="type-caption mb-1 text-[var(--ink-soft)]">Em todas as linhas: {constant.map((item) => <span key={item.key} className="mr-3 inline-block"><strong className="text-[var(--ink)]">{item.label}</strong> {item.text}</span>)}</p>}
    <p className="type-caption mb-2 text-[var(--ink-soft)]" role="status">{campaignTableCounter({ first: current * 12 + 1, last: current * 12 + visible.length }, filtered.length, rows.length, population)}</p>
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title}: tabela com rolagem horizontal`}>
      <table className="w-full text-left text-sm"><thead className="bg-[var(--surface-soft)]"><tr>{shownColumns.map((column) => <th key={column.key} scope="col" className="px-3 py-2 font-bold text-[var(--ink)]">{column.label}</th>)}{onDetail && <th scope="col" className="px-3 py-2">Detalhe</th>}</tr></thead>
        <tbody>{visible.map((row, index) => <tr key={rowKey(row, current * 12 + index)} className="border-t border-[var(--line-ghost)]">{shownColumns.map((column) => <td key={column.key} className="max-w-sm break-words px-3 py-2 align-top">{column.render ? column.render(row) : cellText(column.value(row))}</td>)}{onDetail && <td className="px-3 py-2"><button type="button" className="min-h-11 font-bold text-[var(--brand-navy-strong)] underline focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => onDetail(row)}>{detailLabel}</button></td>}</tr>)}</tbody>
      </table>
    </div>
    {!visible.length && <p className="type-body py-4" role="status">{rows.length ? "Nenhum registro corresponde aos filtros." : "Nenhum registro disponível nesta população."}</p>}
    <div className="mt-3 flex items-center justify-between gap-2 text-sm"><button type="button" className={inputClass} disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button><span>Página {current + 1} de {pages}</span><button type="button" className={inputClass} disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Próxima</button></div>
  </section>;
}
