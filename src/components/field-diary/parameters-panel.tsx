"use client";

import { ChevronDown, ChevronUp, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { inputClassName } from "@/components/field-diary/constants";
import { ParameterForm } from "@/components/field-diary/parameter-form";
import { Field } from "@/components/field-diary/ui";
import type { ReadingsPanelStatus } from "@/components/field-diary/use-entry-readings";
import { MAX_SAMPLE_DEPTH_M, parseSampleNumber } from "@/lib/field-samples";
import {
  MAX_READINGS_PER_ENTRY,
  READING_EQUIPMENT_MAX_LENGTH,
  describeParameterRange,
  describeReadingDetails,
  findParameter,
  isFilledReading,
  parseReadingNumber,
  rangeWarning,
  type FieldParameter,
  type FieldParameterInput,
  type ReadingDraft,
} from "@/lib/field-parameters";

// Dentro do cartão o campo nunca passa da largura do celular.
const fieldClassName = `${inputClassName} w-full min-w-0`;

const secondaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)] disabled:opacity-60";

export function readingValueInputId(readingId: string) {
  return `reading-value-${readingId}`;
}

/**
 * Bloco "Parâmetros medidos" do registro de campo: cada medição é um número com
 * unidade, e não um texto. Só mostra e pergunta; quem guarda as medições e grava é
 * o formulário.
 */
export function ParametersPanel({
  status,
  catalog,
  readings,
  removedCount,
  message,
  hasConflict,
  expandedIds,
  defaultParameterCount,
  onToggle,
  onAdd,
  onChange,
  onRemove,
  onUndoRemove,
  onUseDefaults,
  onCreateParameter,
  onKeepSaved,
  onOverwriteSaved,
  onRetry,
}: {
  status: ReadingsPanelStatus;
  catalog: FieldParameter[];
  readings: ReadingDraft[];
  /** Medições já gravadas que saem do registro quando ele for salvo. */
  removedCount: number;
  message: string;
  /** true = outro aparelho já gravou a mesma medição neste registro. */
  hasConflict: boolean;
  expandedIds: string[];
  /** Quantos parâmetros a campanha mede em todo ponto; 0 = nenhum marcado. */
  defaultParameterCount: number;
  onToggle: (id: string) => void;
  onAdd: (parameterId: string) => void;
  onChange: (id: string, patch: Partial<ReadingDraft>) => void;
  onRemove: (id: string) => void;
  onUndoRemove: () => void;
  onUseDefaults: () => void;
  /** Cria o parâmetro no catálogo. Devolve o motivo quando não cria. */
  onCreateParameter: (input: FieldParameterInput) => Promise<string>;
  onKeepSaved: () => void;
  onOverwriteSaved: () => void;
  onRetry: () => void;
}) {
  const activeParameters = catalog.filter((parameter) => parameter.active);
  const [parameterToAdd, setParameterToAdd] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const selectedToAdd = activeParameters.some((parameter) => parameter.id === parameterToAdd)
    ? parameterToAdd
    : (activeParameters.find((parameter) => !readings.some((reading) => reading.parameterId === parameter.id))?.id ??
      activeParameters[0]?.id ??
      "");
  const filledCount = readings.filter(isFilledReading).length;
  const canAdd = readings.length < MAX_READINGS_PER_ENTRY && Boolean(selectedToAdd);

  return (
    <section
      id="field-diary-parameters"
      aria-labelledby="field-diary-parameters-title"
      className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-4"
    >
      <h3 id="field-diary-parameters-title" className="text-sm font-black text-[var(--brand-navy-strong)]">
        Parâmetros medidos
      </h3>

      {status === "loading" ? (
        <p role="status" className="mt-1 text-sm text-[var(--ink-soft)]">
          Carregando os parâmetros…
        </p>
      ) : null}

      {status === "unavailable" ? (
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Os parâmetros medidos entram depois da atualização do banco de dados. O registro pode ser salvo
          normalmente.
        </p>
      ) : null}

      {status === "failed" ? (
        <div role="alert" className="mt-2">
          <p className="text-sm font-semibold text-[var(--brand-danger)]">
            Não foi possível carregar as medições já gravadas neste registro. Sem elas o aplicativo não mexe nas
            medições, para não gravar em dobro.
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
            {readings.length
              ? `${describeCount(filledCount)} Digite só o número; linha sem valor não é gravada.`
              : "Nenhuma medição neste registro. Cada parâmetro é gravado como número, com a unidade."}
          </p>

          {readings.length ? (
            <ul className="mt-3 grid gap-2">
              {readings.map((reading) => (
                <ReadingCard
                  key={reading.id}
                  reading={reading}
                  parameter={findParameter(catalog, reading.parameterId)}
                  isExpanded={expandedIds.includes(reading.id)}
                  onToggle={() => onToggle(reading.id)}
                  onChange={(patch) => onChange(reading.id, patch)}
                  onRemove={() => onRemove(reading.id)}
                />
              ))}
            </ul>
          ) : null}

          {removedCount ? (
            <p role="status" className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]">
              {removedCount === 1
                ? "1 medição já gravada sai do registro quando você salvar."
                : `${removedCount} medições já gravadas saem do registro quando você salvar.`}
              <button
                type="button"
                onClick={onUndoRemove}
                className="rounded-lg px-2 py-1 font-bold text-[var(--brand-navy-strong)] underline"
              >
                Desfazer
              </button>
            </p>
          ) : null}

          {message && hasConflict ? (
            <div role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{message}</span>
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onKeepSaved}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
                >
                  Ficar com as medições já gravadas
                </button>
                <button
                  type="button"
                  onClick={onOverwriteSaved}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
                >
                  Gravar as minhas por cima
                </button>
              </div>
            </div>
          ) : null}

          {message && !hasConflict ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-[var(--brand-danger)]">
              {message}
            </p>
          ) : null}

          {isCreating ? (
            <ParameterForm
              onCancel={() => setIsCreating(false)}
              onCreate={async (input) => {
                const problem = await onCreateParameter(input);

                if (!problem) {
                  setIsCreating(false);
                }

                return problem;
              }}
            />
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {!readings.length && defaultParameterCount ? (
                <button
                  type="button"
                  onClick={onUseDefaults}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)]"
                >
                  Usar os parâmetros da campanha ({defaultParameterCount})
                </button>
              ) : null}
              <div className="flex gap-2">
                <select
                  aria-label="Parâmetro a medir"
                  value={selectedToAdd}
                  onChange={(event) => setParameterToAdd(event.target.value)}
                  className={`${inputClassName} min-h-12 min-w-0 flex-1`}
                >
                  {activeParameters.map((parameter) => (
                    <option key={parameter.id} value={parameter.id}>
                      {parameter.unit ? `${parameter.label} (${parameter.unit})` : parameter.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(selectedToAdd);
                    setParameterToAdd("");
                  }}
                  disabled={!canAdd}
                  className={`${secondaryButtonClassName} shrink-0`}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Medição
                </button>
              </div>
              <button type="button" onClick={() => setIsCreating(true)} className={secondaryButtonClassName}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Parâmetro
              </button>
              <p className="text-xs text-[var(--ink-soft)]">
                “+ Parâmetro” cria um que ainda não está na lista. Ele fica disponível nos próximos pontos, para toda
                a equipe.
              </p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function describeCount(filled: number) {
  if (!filled) {
    return "Nenhum valor digitado ainda.";
  }

  return filled === 1 ? "1 medição com valor." : `${filled} medições com valor.`;
}

function ReadingCard({
  reading,
  parameter,
  isExpanded,
  onToggle,
  onChange,
  onRemove,
}: {
  reading: ReadingDraft;
  parameter: FieldParameter | null;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ReadingDraft>) => void;
  onRemove: () => void;
}) {
  const label = parameter?.label ?? "Parâmetro fora do catálogo";
  const usesDepth = parameter?.usesDepth !== false;
  const value = parseReadingNumber(reading.value);
  const depth = usesDepth ? parseSampleNumber(reading.depthM, MAX_SAMPLE_DEPTH_M) : { value: null, valid: true };
  const warning = parameter && value.valid ? rangeWarning(parameter, value.value) : "";
  const details = describeReadingDetails({
    depthM: depth.value,
    measuredTime: reading.measuredTime,
    equipment: reading.equipment.trim(),
  });
  const range = parameter ? describeParameterRange(parameter) : "";
  const detailsId = `reading-details-${reading.id}`;
  const inputId = readingValueInputId(reading.id);
  // Duas medições do mesmo parâmetro se distinguem pela profundidade.
  const depthTag = usesDepth && depth.value ? `, ${reading.depthM.trim()} m` : "";

  return (
    <li className="rounded-xl border border-[var(--line-ghost)] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="min-w-0 text-sm font-bold text-[var(--brand-navy-strong)]">
          {label}
          {depthTag}
        </label>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            aria-label={`${isExpanded ? "Fechar" : "Editar"} os detalhes de ${label}${depthTag}`}
            className="inline-flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            {isExpanded ? "Fechar" : "Detalhes"}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover a medição de ${label}${depthTag}`}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-[var(--brand-danger)] transition hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={inputId}
          value={reading.value}
          onChange={(event) => onChange({ value: event.target.value })}
          className={`${inputClassName} min-h-12 w-32 min-w-0 text-base font-black`}
          inputMode="decimal"
          autoComplete="off"
          placeholder={range ? `${range}` : "Valor"}
          maxLength={14}
          aria-invalid={!value.valid}
          aria-describedby={warning || !value.valid ? `${inputId}-note` : undefined}
        />
        <span className="text-sm font-bold text-slate-500">{parameter?.unit ?? ""}</span>
      </div>

      {details ? <p className="mt-1 text-sm text-[var(--ink-soft)]">{details}</p> : null}

      {!value.valid ? (
        <p id={`${inputId}-note`} role="alert" className="mt-2 text-sm font-semibold text-[var(--brand-danger)]">
          O valor deve ser um número (ex.: 7,2).
        </p>
      ) : warning ? (
        <p id={`${inputId}-note`} role="status" className="mt-2 flex items-start gap-2 text-sm font-semibold text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      ) : null}

      {isExpanded ? (
        <div id={detailsId} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {usesDepth ? (
            <Field label="Profundidade (m), 0 = superfície">
              <input
                value={reading.depthM}
                onChange={(event) => onChange({ depthM: event.target.value })}
                className={fieldClassName}
                inputMode="decimal"
                placeholder="0"
                maxLength={8}
                aria-invalid={!depth.valid}
              />
            </Field>
          ) : null}
          <Field label="Hora da medição">
            <input
              type="time"
              value={reading.measuredTime}
              onChange={(event) => onChange({ measuredTime: event.target.value })}
              className={fieldClassName}
            />
          </Field>
          <Field label="Equipamento ou método">
            <input
              value={reading.equipment}
              onChange={(event) => onChange({ equipment: event.target.value })}
              className={fieldClassName}
              placeholder="Ex: Sonda multiparâmetro"
              maxLength={READING_EQUIPMENT_MAX_LENGTH}
            />
          </Field>
        </div>
      ) : null}
    </li>
  );
}
