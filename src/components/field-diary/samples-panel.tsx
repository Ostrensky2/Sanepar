"use client";

import { ChevronDown, ChevronUp, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { inputClassName } from "@/components/field-diary/constants";
import { Field } from "@/components/field-diary/ui";
import {
  MAX_SAMPLES_PER_ENTRY,
  SAMPLE_POSITION_MAX_LENGTH,
  describeSampleCounts,
  describeSampleDraft,
  exportedDateLabel,
  sampleCodeOf,
  sampleCodeProblem,
  sampleShortLabel,
  type SampleCodeConflict,
  type SampleCodeContext,
  type SampleDraft,
} from "@/lib/field-samples";
import {
  COLLECTION_TEXT_MAX_LENGTH,
  conservationTypes,
  getSampleType,
  sampleTypes,
  type ConservationType,
  type SampleTypeId,
} from "@/lib/field-standard";

/** "loading": consultando a nuvem; "unavailable": o banco ainda não aceita amostras. */
export type SamplesPanelStatus = "loading" | "ready" | "unavailable" | "failed";

// Dentro do cartão o campo nunca passa da largura do celular, mesmo com opção comprida.
const fieldClassName = `${inputClassName} w-full min-w-0`;

const secondaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)] disabled:opacity-60";

/**
 * Bloco "Amostras do ponto" do registro de campo. Só mostra e pergunta; quem guarda
 * as amostras e grava é o formulário.
 */
export function SamplesPanel({
  status,
  samples,
  context,
  defaultsDescription,
  removedCount,
  conflicts,
  message,
  expandedIds,
  onToggle,
  onAdd,
  onChange,
  onRemove,
  onUndoRemove,
  onUseDefaults,
  onUseSuggestions,
  onKeepSaved,
  onRetry,
}: {
  status: SamplesPanelStatus;
  samples: SampleDraft[];
  context: SampleCodeContext;
  /** O que a campanha propõe por ponto ("3 de Água e 1 de Plâncton"); vazio = nada. */
  defaultsDescription: string;
  /** Amostras já gravadas que saem do registro quando ele for salvo. */
  removedCount: number;
  conflicts: SampleCodeConflict[];
  message: string;
  expandedIds: string[];
  onToggle: (id: string) => void;
  onAdd: (sampleType: SampleTypeId) => void;
  onChange: (id: string, patch: Partial<SampleDraft>) => void;
  onRemove: (id: string) => void;
  onUndoRemove: () => void;
  onUseDefaults: () => void;
  onUseSuggestions: () => void;
  onKeepSaved: () => void;
  onRetry: () => void;
}) {
  const [typeToAdd, setTypeToAdd] = useState<SampleTypeId>("water");
  const codeProblem = sampleCodeProblem(samples, context);
  const conflictIds = new Set(conflicts.map((conflict) => conflict.sampleId));
  const canAdd = samples.length < MAX_SAMPLES_PER_ENTRY;

  return (
    <section
      id="field-diary-samples"
      aria-labelledby="field-diary-samples-title"
      className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-4"
    >
      <h3 id="field-diary-samples-title" className="text-sm font-black text-[var(--brand-navy-strong)]">
        Amostras do ponto
      </h3>

      {status === "loading" ? (
        <p role="status" className="mt-1 text-sm text-[var(--ink-soft)]">
          Carregando as amostras…
        </p>
      ) : null}

      {status === "unavailable" ? (
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          As amostras do ponto entram depois da atualização do banco de dados. O registro pode ser salvo
          normalmente.
        </p>
      ) : null}

      {status === "failed" ? (
        <div role="alert" className="mt-2">
          <p className="text-sm font-semibold text-[var(--brand-danger)]">
            Não foi possível carregar as amostras já gravadas neste registro. Sem elas o aplicativo não mexe nas
            amostras, para não repetir código.
          </p>
          <button type="button" onClick={onRetry} className={`${secondaryButtonClassName} mt-3`}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      ) : null}

      {status === "ready" ? (
        <>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {samples.length
              ? `${describeSampleCounts(samples)}. O código é o que vai na etiqueta.`
              : "Nenhuma amostra neste registro. O aplicativo gera o código da etiqueta de cada uma."}
          </p>

          {codeProblem ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-amber-900">
              {codeProblem}
            </p>
          ) : null}

          {samples.length ? (
            <ul className="mt-3 grid gap-2">
              {samples.map((sample) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  context={context}
                  isExpanded={expandedIds.includes(sample.id)}
                  hasConflict={conflictIds.has(sample.id)}
                  onToggle={() => onToggle(sample.id)}
                  onChange={(patch) => onChange(sample.id, patch)}
                  onRemove={() => onRemove(sample.id)}
                />
              ))}
            </ul>
          ) : null}

          {conflicts.length ? (
            <ConflictAlert
              conflicts={conflicts}
              onUseSuggestions={onUseSuggestions}
              onKeepSaved={onKeepSaved}
            />
          ) : null}

          {removedCount ? (
            <p role="status" className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]">
              {removedCount === 1
                ? "1 amostra já gravada sai do registro quando você salvar."
                : `${removedCount} amostras já gravadas saem do registro quando você salvar.`}
              <button
                type="button"
                onClick={onUndoRemove}
                className="rounded-lg px-2 py-1 font-bold text-[var(--brand-navy-strong)] underline"
              >
                Desfazer
              </button>
            </p>
          ) : null}

          {message ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-[var(--brand-danger)]">
              {message}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            {!samples.length && defaultsDescription ? (
              <button
                type="button"
                onClick={onUseDefaults}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)]"
              >
                Usar o padrão da campanha ({defaultsDescription})
              </button>
            ) : null}
            <div className="flex gap-2">
              <select
                aria-label="Tipo da amostra a acrescentar"
                value={typeToAdd}
                onChange={(event) => setTypeToAdd(event.target.value as SampleTypeId)}
                className={`${inputClassName} min-h-12 min-w-0 flex-1 sm:flex-none`}
              >
                {sampleTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onAdd(typeToAdd)}
                disabled={!canAdd}
                className={secondaryButtonClassName}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Amostra
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SampleCard({
  sample,
  context,
  isExpanded,
  hasConflict,
  onToggle,
  onChange,
  onRemove,
}: {
  sample: SampleDraft;
  context: SampleCodeContext;
  isExpanded: boolean;
  hasConflict: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<SampleDraft>) => void;
  onRemove: () => void;
}) {
  const type = getSampleType(sample.sampleType);
  const shortLabel = sampleShortLabel(sample);
  const { code } = sampleCodeOf(sample, context);
  const details = describeSampleDraft(sample);
  const codeChanged = Boolean(sample.savedCode && code && sample.savedCode !== code);
  const exportedOn = exportedDateLabel(sample.exportedAt);
  const detailsId = `sample-details-${sample.id}`;

  return (
    <li
      className={`rounded-xl border bg-white p-3 ${hasConflict ? "border-amber-400" : "border-[var(--line-ghost)]"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-500">
          {type.label} {sample.sequence}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            aria-label={`${isExpanded ? "Fechar" : "Editar"} a amostra ${shortLabel}`}
            className="inline-flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            {isExpanded ? "Fechar" : "Editar"}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover a amostra ${shortLabel}`}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-[var(--brand-danger)] transition hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* O código ocupa a largura toda do cartão, para caber numa linha no celular. */}
      <p className="overflow-x-auto whitespace-nowrap font-mono text-base font-black text-[var(--brand-navy-strong)]">
        {code || `…-${shortLabel}`}
      </p>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{details || "Sem detalhes informados."}</p>

      {codeChanged ? (
        <p role="status" className="mt-2 flex items-start gap-2 text-sm font-semibold text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            O código gravado era {sample.savedCode}. Mudou junto com a data, o ponto ou o número da amostra: se a
            etiqueta já foi escrita, corrija a etiqueta.
          </span>
        </p>
      ) : null}

      {sample.exportedAt ? (
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Já saiu na planilha do Biolog{exportedOn ? ` em ${exportedOn}` : ""}. O código não muda mais; se retirar a
          amostra aqui, retire também no Biolog.
        </p>
      ) : null}

      {isExpanded ? (
        <div id={detailsId} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {type.usesDepth ? (
            <Field label="Profundidade (m), 0 = superfície">
              <input
                value={sample.depthM}
                onChange={(event) => onChange({ depthM: event.target.value })}
                className={fieldClassName}
                inputMode="decimal"
                placeholder="0"
                maxLength={8}
              />
            </Field>
          ) : null}
          <Field label={`${type.quantityLabel} (${type.quantityUnit})`}>
            <input
              value={sample.quantity}
              onChange={(event) => onChange({ quantity: event.target.value })}
              className={fieldClassName}
              inputMode="decimal"
              maxLength={10}
            />
          </Field>
          <Field label="Conservação">
            <select
              value={sample.conservation}
              onChange={(event) => onChange({ conservation: event.target.value as ConservationType })}
              className={fieldClassName}
            >
              {conservationTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Acondicionamento">
            <input
              value={sample.packaging}
              onChange={(event) => onChange({ packaging: event.target.value })}
              className={fieldClassName}
              placeholder="Ex: Isopor com gelo"
              maxLength={COLLECTION_TEXT_MAX_LENGTH}
            />
          </Field>
          <Field label="Especificação">
            <input
              value={sample.specification}
              onChange={(event) => onChange({ specification: event.target.value })}
              className={fieldClassName}
              placeholder="Ex: filtro 0,45 µm"
              maxLength={COLLECTION_TEXT_MAX_LENGTH}
            />
          </Field>
          <Field label="Posição na caixa">
            <input
              value={sample.boxPosition}
              onChange={(event) => onChange({ boxPosition: event.target.value })}
              className={fieldClassName}
              placeholder="Ex: A3"
              maxLength={SAMPLE_POSITION_MAX_LENGTH}
            />
          </Field>
        </div>
      ) : null}
    </li>
  );
}

function ConflictAlert({
  conflicts,
  onUseSuggestions,
  onKeepSaved,
}: {
  conflicts: SampleCodeConflict[];
  onUseSuggestions: () => void;
  onKeepSaved: () => void;
}) {
  const inThisRecord = conflicts.some((conflict) => conflict.sameEntry);
  const codes = conflicts.map((conflict) => conflict.code).join(", ");
  const suggestions = conflicts.map((conflict) => conflict.suggestedCode.split("-").pop()).join(", ");

  return (
    <div role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {conflicts.length === 1 ? "Este código já existe" : "Estes códigos já existem"}
          {inThisRecord ? " neste mesmo registro, gravado por outro aparelho" : " em outro registro"}: {codes}. As
          amostras ainda não foram salvas.
        </span>
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onUseSuggestions}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
        >
          Usar o próximo número livre ({suggestions})
        </button>
        {inThisRecord ? (
          <button
            type="button"
            onClick={onKeepSaved}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
          >
            Ficar com as amostras já gravadas
          </button>
        ) : null}
      </div>
    </div>
  );
}
