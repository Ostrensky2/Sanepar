"use client";

import { useId, useState, type ReactNode } from "react";

export type ScientificFilterOption = { value: string; label: string; count?: number };

export const scientificControl = "min-h-11 min-w-0 rounded border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)] disabled:opacity-50";

export function ScientificViews({ views, selected, onChange }: {
  views: Array<{ value: string; label: string }>;
  selected: string;
  onChange: (value: string) => void;
}) {
  return <nav aria-label="Visões da consulta" className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-[var(--surface-soft)] p-1">
    {views.map((view) => <button key={view.value} type="button" aria-current={selected === view.value ? "page" : undefined} className={`min-h-11 rounded-md px-4 text-sm focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)] ${selected === view.value ? "bg-[var(--surface-panel)] font-bold text-[var(--brand-navy-strong)] shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--brand-navy-strong)]"}`} onClick={() => onChange(view.value)}>{view.label}</button>)}
  </nav>;
}

export function ScientificRecordDetail({ groups, children }: {
  groups: Array<{ title: string; fields: Array<{ label: string; value: string | number | null }> }>;
  children?: ReactNode;
}) {
  return <div className="space-y-5">
    {groups.map((group) => <section key={group.title} className="space-y-2">
      <h3 className="type-panel-title text-[var(--brand-navy-strong)]">{group.title}</h3>
      <dl className="divide-y divide-[var(--line-ghost)]">{group.fields.map((field) => <div key={field.label} className="py-2">
        <dt className="type-label">{field.label}</dt>
        <dd className="type-metadata mt-1 whitespace-pre-wrap break-words">{field.value === null || field.value === "" ? "Não informado na fonte" : field.value}</dd>
      </div>)}</dl>
    </section>)}
    {children}
  </div>;
}

export function safeScientificHref(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function ScientificSourceLinks({ originalText, links, needsReview }: {
  originalText: string | null;
  links: Array<{ href: string; label: string }>;
  needsReview: boolean;
}) {
  return <div className="space-y-2">
    <p className="type-metadata whitespace-pre-wrap break-words">{originalText || "Referência não informada."}</p>
    <ul className="space-y-1">{links.map((link, index) => {
      const href = safeScientificHref(link.href);
      return <li key={`${link.href}:${index}`} className="min-w-0 break-words">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="type-metadata inline-block min-h-11 py-2 text-[var(--brand-navy-strong)] underline">{link.label || href}</a> : <span className="type-metadata">Endereço não navegável: {link.href}</span>}</li>;
    })}</ul>
    {needsReview && <p role="status" className="type-metadata">Separação ou correspondência entre citação e links requer conferência. O texto original foi preservado; a posição do link não comprova a associação.</p>}
  </div>;
}

export function searchScientificOptions(options: ScientificFilterOption[], query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const term = normalize(query.trim());
  return options.filter((option) => normalize(`${option.label} ${option.value}`).includes(term));
}

// Native details and checkboxes preserve keyboard behavior without a custom listbox.
export function ScientificMultiFilter({ label, options, selected, onChange, disabled = false }: {
  label: string;
  options: ScientificFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const filtered = searchScientificOptions(options, query);
  return <details className="min-w-0 rounded border border-[var(--line-ghost)] bg-[var(--surface-panel)]">
    <summary className="type-label min-h-11 cursor-pointer px-3 py-3">{label}{selected.length ? ` (${selected.length})` : " — todos"}</summary>
    <fieldset disabled={disabled} className="min-w-0 space-y-2 border-t border-[var(--line-ghost)] p-3">
      <legend className="sr-only">{label} — seleção múltipla, opções combinadas por OU</legend>
      <label className="type-label block" htmlFor={id}>Pesquisar em {label.toLocaleLowerCase("pt-BR")}</label>
      <input id={id} type="search" className={`${scientificControl} w-full`} value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="max-h-60 overflow-y-auto">
        {filtered.map((option) => <label key={option.value} className="type-metadata flex min-h-11 cursor-pointer items-start gap-2 py-2">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((value) => value !== option.value))} />
          <span className="min-w-0 break-words">{option.label}{option.count === undefined ? null : <span className="tabular-nums text-[var(--ink-soft)]"> · {option.count.toLocaleString("pt-BR")}</span>}</span>
        </label>)}
      </div>
      {!filtered.length && <p role="status" className="type-metadata">Nenhuma opção encontrada.</p>}
      {selected.length > 0 && <button type="button" className={scientificControl} onClick={() => onChange([])}>Limpar {label.toLocaleLowerCase("pt-BR")}</button>}
    </fieldset>
  </details>;
}

export function ScientificActiveFilters({ filters, onRemove, onClear }: {
  filters: Array<{ key: string; label: string; values: ScientificFilterOption[] }>;
  onRemove: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const active = filters.filter((filter) => filter.values.length);
  if (!active.length) return null;
  return <div className="flex flex-wrap gap-2" aria-label="Filtros ativos">
    {active.flatMap((filter) => filter.values.map((option) => <button key={`${filter.key}:${option.value}`} type="button" className={`${scientificControl} max-w-full break-words bg-[var(--surface-soft)] text-left`} aria-label={`Remover ${filter.label}: ${option.label}`} onClick={() => onRemove(filter.key, option.value)}>{filter.label}: {option.label} ×</button>))}
    <button type="button" className={`${scientificControl} font-semibold`} onClick={onClear}>Limpar filtros</button>
  </div>;
}
