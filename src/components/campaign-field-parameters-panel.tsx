"use client";

import { ChevronDown, ChevronUp, Pencil, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ParameterForm } from "@/components/field-diary/parameter-form";
import {
  MAX_FIELD_PARAMETERS,
  describeParameterRange,
  sortCatalog,
  type FieldParameter,
  type FieldParameterInput,
} from "@/lib/field-parameters";
import {
  createFieldParameter,
  fetchParameterCatalog,
  updateFieldParameter,
  type ParameterSaveResult,
} from "@/lib/field-parameters-client";
import { cacheCatalog } from "@/lib/field-parameters-device";
import { MAX_DEFAULT_FIELD_PARAMETERS, sampleTypes } from "@/lib/field-standard";

const smallButtonClassName =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-xs font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] disabled:opacity-60";

type Notice = { tone: "ok" | "problem"; text: string };

/**
 * Parte dos padrões de coleta que trata dos parâmetros medidos em campo: quais já
 * aparecem prontos para preencher em todo ponto (vale para a campanha) e o catálogo
 * de parâmetros (vale para toda a equipe, e grava na hora).
 */
export function CampaignFieldParametersPanel({
  selectedIds,
  onChange,
}: {
  /** Parâmetros que o registro de campo propõe em todo ponto desta campanha. */
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [catalog, setCatalog] = useState<FieldParameter[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [loadCount, setLoadCount] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let active = true;

    void fetchParameterCatalog().then((result) => {
      if (!active) {
        return;
      }

      if (!result.ok) {
        setStatus("error");
        return;
      }

      setCatalog(sortCatalog(result.parameters));
      setStatus(result.available ? "ready" : "unavailable");
    });

    return () => {
      active = false;
    };
  }, [loadCount]);

  const activeParameters = catalog.filter((parameter) => parameter.active);
  const inactiveParameters = catalog.filter((parameter) => !parameter.active);
  const selected = new Set(selectedIds);
  const selectedCount = activeParameters.filter((parameter) => selected.has(parameter.id)).length;
  const isAtLimit = selectedIds.length >= MAX_DEFAULT_FIELD_PARAMETERS;

  /** A lista gravada segue a ordem do catálogo; o que não está nele fica no fim, sem se perder. */
  function select(ids: Set<string>, inCatalog: FieldParameter[] = catalog) {
    const known = sortCatalog(inCatalog)
      .filter((parameter) => ids.has(parameter.id))
      .map((parameter) => parameter.id);
    const unknown = selectedIds.filter((id) => ids.has(id) && !known.includes(id));

    onChange([...known, ...unknown]);
  }

  function toggleSelected(parameterId: string, checked: boolean) {
    const next = new Set(selectedIds);

    if (checked) next.add(parameterId);
    else next.delete(parameterId);

    select(next);
  }

  function putInCatalog(parameter: FieldParameter) {
    const next = sortCatalog([...catalog.filter((item) => item.id !== parameter.id), parameter]);

    setCatalog(next);
    cacheCatalog(next);
    return next;
  }

  async function setActive(parameter: FieldParameter, active: boolean) {
    setBusyId(parameter.id);
    setNotice(null);
    const result = await updateFieldParameter(parameter.id, { active });
    setBusyId("");

    if (!result.ok) {
      setNotice({ tone: "problem", text: result.error });
      return;
    }

    putInCatalog(result.parameter);

    if (!active && selected.has(parameter.id)) {
      toggleSelected(parameter.id, false);
    }

    setNotice({
      tone: "ok",
      text: active
        ? `“${parameter.label}” voltou para o catálogo.`
        : `“${parameter.label}” foi desativado: não aparece mais para medir. As medições já gravadas continuam.`,
    });
  }

  async function create(input: FieldParameterInput) {
    const result = await createFieldParameter(input);

    if (!result.ok) {
      return describeSameName(result);
    }

    const next = putInCatalog(result.parameter);
    const marks = !isAtLimit;

    if (marks) {
      select(new Set([...selectedIds, result.parameter.id]), next);
    }

    setIsCreating(false);
    setNotice({
      tone: "ok",
      text: marks
        ? `“${result.parameter.label}” entrou no catálogo e já está marcado para todo ponto. Desmarque se não for o caso.`
        : `“${result.parameter.label}” entrou no catálogo.`,
    });
    return "";
  }

  async function change(parameter: FieldParameter, input: FieldParameterInput) {
    const result = await updateFieldParameter(parameter.id, input);

    if (!result.ok) {
      return describeSameName(result);
    }

    putInCatalog(result.parameter);
    setEditingId("");
    setNotice({ tone: "ok", text: `“${result.parameter.label}” foi alterado.` });
    return "";
  }

  /** Nome repetido de um parâmetro desativado: mostra onde ele está. */
  function describeSameName(result: Extract<ParameterSaveResult, { ok: false }>) {
    if (result.existing && !result.existing.active) {
      setShowInactive(true);
      return `Já existe um parâmetro chamado “${result.existing.label}”, mas ele está desativado. Reative na lista de desativados, logo abaixo.`;
    }

    return result.error;
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--line-ghost)] bg-white p-4" role="group" aria-labelledby="default-field-parameters-title">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 id="default-field-parameters-title" className="text-sm font-black text-[var(--brand-navy-strong)]">
            Parâmetros medidos em todo ponto
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-soft)]">
            Os marcados já aparecem prontos para preencher no registro de campo, depois de “Iniciar coleta”. Os
            outros continuam disponíveis em “+ Medição”.
          </p>
        </div>
        {status === "ready" ? (
          <p role="status" className="type-metadata shrink-0 text-[var(--ink-soft)]">
            {selectedCount === 0
              ? "Nenhum marcado"
              : selectedCount === 1
                ? "1 marcado"
                : `${selectedCount} marcados`}
          </p>
        ) : null}
      </div>

      {status === "loading" ? (
        <p className="mt-3 text-sm text-[var(--ink-soft)]">Carregando o catálogo de parâmetros…</p>
      ) : status === "error" ? (
        <div role="alert" className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm font-semibold text-[var(--brand-danger)]">
            Não foi possível carregar o catálogo de parâmetros.
          </p>
          <button
            type="button"
            className={smallButtonClassName}
            onClick={() => {
              setStatus("loading");
              setLoadCount((count) => count + 1);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      ) : status === "unavailable" ? (
        <p className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-[var(--ink-soft)]">
          O banco ainda não recebeu a atualização dos parâmetros de campo. Os parâmetros aparecem aqui assim que
          ela for aplicada.
        </p>
      ) : (
        <>
          {notice ? (
            <p
              role={notice.tone === "problem" ? "alert" : "status"}
              className={`mt-3 rounded-xl p-3 text-sm font-semibold ${
                notice.tone === "problem"
                  ? "bg-red-50 text-[var(--brand-danger)]"
                  : "bg-[var(--surface-soft)] text-[var(--brand-navy-strong)]"
              }`}
            >
              {notice.text}
            </p>
          ) : null}

          <ul className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {activeParameters.map((parameter) => {
              const isSelected = selected.has(parameter.id);

              return (
                <li key={parameter.id} className="rounded-xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-3">
                  {editingId === parameter.id ? (
                    <ParameterForm
                      parameter={parameter}
                      onCancel={() => setEditingId("")}
                      onCreate={(input) => change(parameter, input)}
                    />
                  ) : (
                    <>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0"
                          checked={isSelected}
                          disabled={!isSelected && isAtLimit}
                          onChange={(event) => toggleSelected(parameter.id, event.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-[var(--brand-navy-strong)]">
                            {parameter.label}
                            {parameter.unit ? (
                              <span className="ml-2 text-xs font-semibold text-slate-500">{parameter.unit}</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                            {describeParameter(parameter)}
                          </span>
                        </span>
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {parameter.isBase ? null : (
                          <button
                            type="button"
                            className={smallButtonClassName}
                            onClick={() => {
                              setIsCreating(false);
                              setEditingId(parameter.id);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Alterar
                            <span className="sr-only"> {parameter.label}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className={smallButtonClassName}
                          disabled={busyId === parameter.id}
                          onClick={() => void setActive(parameter, false)}
                        >
                          {busyId === parameter.id ? "Desativando…" : "Desativar"}
                          <span className="sr-only"> {parameter.label}</span>
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {isAtLimit ? (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              Dá para marcar até {MAX_DEFAULT_FIELD_PARAMETERS} parâmetros para todo ponto.
            </p>
          ) : null}

          {isCreating ? (
            <ParameterForm onCancel={() => setIsCreating(false)} onCreate={create} />
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={smallButtonClassName}
                disabled={catalog.length >= MAX_FIELD_PARAMETERS}
                onClick={() => {
                  setEditingId("");
                  setNotice(null);
                  setIsCreating(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Parâmetro
              </button>
              {inactiveParameters.length ? (
                <button
                  type="button"
                  className={smallButtonClassName}
                  aria-expanded={showInactive}
                  aria-controls="inactive-field-parameters"
                  onClick={() => setShowInactive((current) => !current)}
                >
                  {showInactive ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Desativados ({inactiveParameters.length})
                </button>
              ) : null}
            </div>
          )}

          {showInactive && inactiveParameters.length ? (
            <ul id="inactive-field-parameters" className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {inactiveParameters.map((parameter) => (
                <li
                  key={parameter.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--line-strong)] bg-white p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-500">
                      {parameter.label}
                      {parameter.unit ? <span className="ml-2 text-xs font-semibold">{parameter.unit}</span> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">Desativado</span>
                  </span>
                  <button
                    type="button"
                    className={smallButtonClassName}
                    disabled={busyId === parameter.id}
                    onClick={() => void setActive(parameter, true)}
                  >
                    {busyId === parameter.id ? "Reativando…" : "Reativar"}
                    <span className="sr-only"> {parameter.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            O que está marcado vale para esta campanha e para as seguintes. O catálogo (criar, alterar, desativar)
            vale para toda a equipe e é gravado na hora. Os parâmetros do padrão de coleta não mudam de nome nem
            de unidade.
          </p>
        </>
      )}
    </div>
  );
}

/** "Faixa esperada 0 a 14 · Água, Plâncton e Solo · criado pela equipe". */
function describeParameter(parameter: FieldParameter) {
  const range = describeParameterRange(parameter);
  // Sempre na ordem do padrão (Água, Solo, Ar, Tecido, Plâncton), como o banco tiver guardado.
  const types = sampleTypes.filter((type) => parameter.appliesTo.includes(type.id)).map((type) => type.label);

  return [
    range ? `Faixa esperada ${range}` : "",
    types.length ? new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(types) : "",
    parameter.isBase ? "" : "criado pela equipe",
  ]
    .filter(Boolean)
    .join(" · ");
}
