"use client";

import { useId, useState } from "react";
import { inputClassName } from "@/components/field-diary/constants";
import { Field } from "@/components/field-diary/ui";
import { normalizeParameterInput, type FieldParameter, type FieldParameterInput } from "@/lib/field-parameters";
import { numberToInput } from "@/lib/field-samples";
import {
  FIELD_PARAMETER_LABEL_MAX_LENGTH,
  FIELD_PARAMETER_UNIT_MAX_LENGTH,
  sampleTypes,
  type SampleTypeId,
} from "@/lib/field-standard";

// Dentro do cartão o campo nunca passa da largura do celular.
const fieldClassName = `${inputClassName} w-full min-w-0`;

const secondaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)] disabled:opacity-60";

/**
 * Formulário de um parâmetro do catálogo. Sem `parameter`, cria um novo (botão
 * "+ Parâmetro"); com ele, altera um parâmetro criado pela equipe.
 *
 * `onCreate` devolve o motivo quando não deu para gravar, ou "" quando gravou (e
 * aí quem chamou fecha o formulário).
 */
export function ParameterForm({
  parameter,
  onCreate,
  onCancel,
}: {
  parameter?: FieldParameter;
  onCreate: (input: FieldParameterInput) => Promise<string>;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [label, setLabel] = useState(parameter?.label ?? "");
  const [unit, setUnit] = useState(parameter?.unit ?? "");
  const [min, setMin] = useState(numberToInput(parameter?.min));
  const [max, setMax] = useState(numberToInput(parameter?.max));
  const [appliesTo, setAppliesTo] = useState<SampleTypeId[]>(parameter?.appliesTo ?? ["water", "plankton"]);
  const [usesDepth, setUsesDepth] = useState(parameter?.usesDepth ?? true);
  const [problem, setProblem] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (isSaving) {
      return;
    }

    const checked = normalizeParameterInput({ label, unit, min, max, appliesTo, usesDepth });

    if (!checked.ok) {
      setProblem(checked.error);
      return;
    }

    setIsSaving(true);
    setProblem("");
    const failure = await onCreate(checked.parameter);

    // Gravado: o formulário já foi fechado por quem chamou.
    if (failure) {
      setProblem(failure);
      setIsSaving(false);
    }
  }

  // Enter aqui grava o parâmetro, em vez de salvar a tela inteira em volta.
  function saveOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="mt-3 rounded-xl border border-[var(--line-strong)] bg-white p-3"
    >
      <p id={titleId} className="text-sm font-black text-[var(--brand-navy-strong)]">
        {parameter ? `Alterar “${parameter.label}”` : "Novo parâmetro"}
      </p>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        {parameter
          ? "A mudança vale para toda a equipe. As medições já gravadas continuam com a unidade em que foram feitas."
          : "Entra no catálogo e fica disponível nos próximos pontos, para toda a equipe."}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" required>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={saveOnEnter}
            className={fieldClassName}
            placeholder="Ex: Clorofila a"
            maxLength={FIELD_PARAMETER_LABEL_MAX_LENGTH}
            autoFocus
          />
        </Field>
        <Field label="Unidade">
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            onKeyDown={saveOnEnter}
            className={fieldClassName}
            placeholder="Ex: µg/L"
            maxLength={FIELD_PARAMETER_UNIT_MAX_LENGTH}
          />
        </Field>
        <Field label="Faixa esperada: mínimo">
          <input
            value={min}
            onChange={(event) => setMin(event.target.value)}
            onKeyDown={saveOnEnter}
            className={fieldClassName}
            inputMode="decimal"
            placeholder="Opcional"
            maxLength={14}
          />
        </Field>
        <Field label="Faixa esperada: máximo">
          <input
            value={max}
            onChange={(event) => setMax(event.target.value)}
            onKeyDown={saveOnEnter}
            className={fieldClassName}
            inputMode="decimal"
            placeholder="Opcional"
            maxLength={14}
          />
        </Field>
      </div>

      <fieldset className="mt-3">
        <legend className="type-label text-slate-500">Medido em amostras de</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {sampleTypes.map((type) => (
            <label key={type.id} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand-navy-strong)]">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={appliesTo.includes(type.id)}
                onChange={(event) =>
                  setAppliesTo((current) =>
                    event.target.checked ? [...current, type.id] : current.filter((item) => item !== type.id),
                  )
                }
              />
              {type.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand-navy-strong)]">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={usesDepth}
          onChange={(event) => setUsesDepth(event.target.checked)}
        />
        Medido numa profundidade (ex.: sonda na água)
      </label>

      {problem ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-[var(--brand-danger)]">
          {problem}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:opacity-60"
        >
          {parameter ? (isSaving ? "Gravando…" : "Gravar alteração") : isSaving ? "Criando…" : "Criar parâmetro"}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving} className={secondaryButtonClassName}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
