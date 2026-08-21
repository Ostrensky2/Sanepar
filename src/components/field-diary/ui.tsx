"use client";

import { ClipboardList, Eye, FileText, Plus, Sheet, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  operationalStageClassNames,
  operationalStageLabels,
  type OperationalStage,
} from "@/components/field-diary/constants";

export function OperationalMetric({
  icon: Icon,
  label,
  value,
  detail,
  compact = false,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <article className={`glass-panel radius-panel ${compact ? "p-3" : "p-5"}`}>
      <div className={`flex items-start justify-between ${compact ? "gap-3" : "gap-4"}`}>
        <div>
          <p className="type-label uppercase tracking-[0.1em] text-slate-500">{label}</p>
          <p className={`heading-font type-kpi text-[var(--brand-navy-strong)] ${compact ? "mt-2" : "mt-3"}`}>{value}</p>
        </div>
        <span className={`rounded-2xl bg-[var(--brand-blue-soft)] text-[var(--brand-navy-strong)] ${compact ? "p-2" : "p-3"}`}>
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
      </div>
      <p className={`type-metadata ${compact ? "mt-2" : "mt-4"} text-[var(--ink-soft)]`}>{detail}</p>
    </article>
  );
}

export function StageBadge({ stage }: { stage: OperationalStage }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${operationalStageClassNames[stage]}`}>
      {operationalStageLabels[stage]}
    </span>
  );
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-5xl radius-panel bg-white p-5 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.45)]">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-[var(--brand-blue-soft)] p-3 text-[var(--brand-navy-strong)]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-[var(--surface-soft)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Checklist({
  label,
  options,
  values,
  onChange,
  required,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="rounded-2xl border border-[var(--line-ghost)] p-4">
      <legend className="type-label px-1 uppercase tracking-[0.1em] text-slate-500">
        {label}{required ? " *" : ""}
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => {
          const checked = values.includes(option);

          return (
            <label key={option} className="flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--ink-soft)]">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...values, option]
                      : values.filter((value) => value !== option),
                  )
                }
                className="h-4 w-4 accent-[var(--brand-navy)]"
              />
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="type-label grid gap-2 uppercase tracking-[0.1em] text-slate-500">
      {label}{required ? " *" : ""}
      {children}
    </label>
  );
}

export function ImportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
    >
      <Sheet className="h-4 w-4" />
      Importar planilha
    </button>
  );
}

export function NewEntryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white shadow-[0_18px_38px_-28px_rgba(0,66,98,0.6)] transition hover:bg-[var(--brand-navy)]"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

export function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Eye;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg border border-[var(--line-ghost)] bg-white p-2 text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center radius-panel border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <FileText className="mb-3 h-9 w-9 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2">
      <p className="type-caption font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--brand-navy-strong)]">{value}</p>
    </div>
  );
}

export function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="type-caption font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}
