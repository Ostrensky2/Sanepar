"use client";

import { RotateCcw } from "lucide-react";
import { CampaignFieldParametersPanel } from "@/components/campaign-field-parameters-panel";
import {
  COLLECTION_TEXT_MAX_LENGTH,
  MAX_DEFAULT_REPLICAS,
  currentConservationTypes,
  destinationLabs,
  nonNegativeNumber,
  sampleObjectives,
  sampleTypes,
  waterMatrices,
  type CollectionDefaults,
  type ConservationType,
  type DestinationLab,
  type SampleObjective,
  type SampleTypeDefaults,
  type SampleTypeId,
  type WaterMatrix,
} from "@/lib/field-standard";

const selectClassName =
  "rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]";
const cellInputClassName =
  "w-full rounded-lg border border-[var(--line-strong)] bg-white px-2 py-1.5 text-xs font-semibold text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]";

/**
 * Padrões de coleta da campanha: o que o registro de campo já traz preenchido, para
 * ninguém digitar projeto, laboratório ou conservação em cada ponto.
 */
export function CampaignCollectionDefaultsPanel({
  defaults,
  sourceLabel,
  isOwn,
  onChange,
  onReset,
}: {
  defaults: CollectionDefaults;
  /** De onde vêm os valores mostrados (ex.: "desta campanha", "da 3ª Campanha"). */
  sourceLabel: string;
  /** true quando os padrões foram gravados nesta campanha. */
  isOwn: boolean;
  onChange: (next: CollectionDefaults) => void;
  onReset: () => void;
}) {
  function updateSampleType(id: SampleTypeId, patch: Partial<SampleTypeDefaults>) {
    onChange({
      ...defaults,
      sampleTypes: {
        ...defaults.sampleTypes,
        [id]: { ...defaults.sampleTypes[id], ...patch },
      },
    });
  }

  return (
    <section className="glass-panel radius-panel p-5" aria-labelledby="collection-defaults-title">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="type-eyebrow text-[var(--brand-teal)]">Registro de campo</p>
          <h2
            id="collection-defaults-title"
            className="heading-font type-section-title mt-1 text-[var(--brand-navy-strong)]"
          >
            Padrões de coleta
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-soft)]">
            O que está aqui já vem preenchido nas amostras do registro de campo. Vale para esta campanha e
            para as seguintes, até alguém mudar.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <p role="status" className="type-metadata text-[var(--ink-soft)]">
            Em uso: padrões {sourceLabel}
          </p>
          {isOwn ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-xs font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar a usar os padrões anteriores
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.45fr)]">
        <div className="grid content-start gap-3 rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
          <dl className="grid grid-cols-3 gap-3 rounded-xl bg-[var(--surface-soft)] p-3 text-sm">
            <div>
              <dt className="text-caption font-bold text-slate-500">Projeto</dt>
              <dd className="font-black text-[var(--brand-navy-strong)]">{defaults.projectCode}</dd>
            </div>
            <div>
              <dt className="text-caption font-bold text-slate-500">Sigla</dt>
              <dd className="font-black text-[var(--brand-navy-strong)]">{defaults.projectShortName}</dd>
            </div>
            <div>
              <dt className="text-caption font-bold text-slate-500">Empresa</dt>
              <dd className="font-black text-[var(--brand-navy-strong)]">{defaults.company}</dd>
            </div>
          </dl>

          <label className="grid gap-2 text-caption font-bold text-slate-500">
            Laboratório de destino
            <select
              className={selectClassName}
              value={defaults.destinationLab}
              onChange={(event) =>
                onChange({ ...defaults, destinationLab: event.target.value as DestinationLab })
              }
            >
              {destinationLabs.map((lab) => (
                <option key={lab} value={lab}>
                  {lab}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-caption font-bold text-slate-500">
            Objetivo da coleta
            <select
              className={selectClassName}
              value={defaults.objective}
              onChange={(event) => onChange({ ...defaults, objective: event.target.value as SampleObjective })}
            >
              {sampleObjectives.map((objective) => (
                <option key={objective.value} value={objective.value}>
                  {objective.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-caption font-bold text-slate-500">
            Matriz das amostras de água
            <select
              className={selectClassName}
              value={defaults.waterMatrix}
              onChange={(event) => onChange({ ...defaults, waterMatrix: event.target.value as WaterMatrix })}
            >
              {waterMatrices.map((matrix) => (
                <option key={matrix.value} value={matrix.value}>
                  {matrix.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--line-ghost)] bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <caption className="sr-only">Padrões por tipo de amostra</caption>
            <thead>
              <tr className="border-b border-[var(--line-ghost)] text-caption text-slate-500">
                <th scope="col" className="px-3 py-3">Tipo de amostra</th>
                <th scope="col" className="px-3 py-3">Amostras sugeridas por ponto</th>
                <th scope="col" className="px-3 py-3">Conservante</th>
                <th scope="col" className="px-3 py-3">Qual, se for “Outro”</th>
                <th scope="col" className="px-3 py-3">Armazenamento</th>
                <th scope="col" className="px-3 py-3">Volume ou massa</th>
                <th scope="col" className="px-3 py-3">Profundidade (m)</th>
                <th scope="col" className="px-3 py-3">Especificação</th>
              </tr>
            </thead>
            <tbody>
              {sampleTypes.map((type) => {
                const row = defaults.sampleTypes[type.id];

                return (
                  <tr key={type.id} className="border-b border-[var(--line-ghost)] align-top">
                    <th scope="row" className="px-3 py-3 font-bold text-[var(--brand-navy-strong)]">
                      {type.label}
                      <span className="ml-2 text-xs font-semibold text-slate-400">{type.code}</span>
                    </th>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        max={MAX_DEFAULT_REPLICAS}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Amostras de ${type.label} por ponto`}
                        className={`${cellInputClassName} max-w-20`}
                        value={row.replicas}
                        onChange={(event) => {
                          const replicas = Math.trunc(Number(event.target.value));
                          updateSampleType(type.id, {
                            replicas:
                              Number.isFinite(replicas) && replicas >= 0
                                ? Math.min(replicas, MAX_DEFAULT_REPLICAS)
                                : 0,
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Conservante de ${type.label}`}
                        className={cellInputClassName}
                        value={row.conservation}
                        onChange={(event) => {
                          const conservation = event.target.value as ConservationType;
                          updateSampleType(
                            type.id,
                            conservation === "OUTRO" ? { conservation } : { conservation, preservative: "" },
                          );
                        }}
                      >
                        {currentConservationTypes.map((conservation) => (
                          <option key={conservation.value} value={conservation.value}>
                            {conservation.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {row.conservation === "OUTRO" ? (
                        <input
                          aria-label={`Qual conservante de ${type.label}`}
                          className={cellInputClassName}
                          value={row.preservative}
                          maxLength={COLLECTION_TEXT_MAX_LENGTH}
                          placeholder="Ex.: RNAlater"
                          onChange={(event) => updateSampleType(type.id, { preservative: event.target.value })}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Não se aplica</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        aria-label={`Armazenamento de ${type.label}`}
                        className={cellInputClassName}
                        value={row.packaging}
                        maxLength={COLLECTION_TEXT_MAX_LENGTH}
                        placeholder="Ex.: Criobox"
                        onChange={(event) => updateSampleType(type.id, { packaging: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          aria-label={`${type.quantityLabel} padrão de ${type.label}, em ${type.quantityUnit}`}
                          className={`${cellInputClassName} max-w-24`}
                          value={row.quantity ?? ""}
                          onChange={(event) =>
                            updateSampleType(type.id, { quantity: nonNegativeNumber(event.target.value) })
                          }
                        />
                        <span className="text-xs font-semibold text-slate-500">{type.quantityUnit}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {type.usesDepth ? (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          aria-label={`Profundidade padrão de ${type.label}, em metros`}
                          className={`${cellInputClassName} max-w-24`}
                          value={row.depthM ?? ""}
                          placeholder="0 = superfície"
                          onChange={(event) =>
                            updateSampleType(type.id, { depthM: nonNegativeNumber(event.target.value) })
                          }
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Não se aplica</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        aria-label={`Especificação padrão de ${type.label}`}
                        className={cellInputClassName}
                        value={row.specification}
                        maxLength={COLLECTION_TEXT_MAX_LENGTH}
                        placeholder="Ex.: filtro 0,45 µm"
                        onChange={(event) => updateSampleType(type.id, { specification: event.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-3 py-3 text-xs text-[var(--ink-soft)]">
            Em &quot;Amostras por ponto&quot;, 0 significa que o tipo não é coletado de rotina. Profundidade 0 é
            superfície. O branco é o controle negativo do ponto e tem código próprio (BR1).
          </p>
        </div>
      </div>

      <CampaignFieldParametersPanel
        selectedIds={defaults.fieldParameterIds}
        onChange={(fieldParameterIds) => onChange({ ...defaults, fieldParameterIds })}
      />
    </section>
  );
}
