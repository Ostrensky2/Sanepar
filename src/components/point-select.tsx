"use client";

/**
 * Escolha de ponto (SIA) sempre por lista: o usuário não precisa saber o número do ponto.
 * Opcionalmente a mesma lista oferece os municípios, para filtrar vários pontos de uma vez.
 * Valor: "" (todos), "sia:<código>" ou "mun:<município>".
 */
export type PointOption = { sia: string; municipality?: string | null; waterBody?: string | null };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function pointOptionLabel(option: PointOption) {
  const place = [option.waterBody, option.municipality].filter(Boolean).join(" · ");
  const code = /^\d+$/.test(option.sia) ? `SIA ${option.sia}` : option.sia;
  return place ? `${code} · ${place}` : code;
}

/** O ponto ou o município escolhido inclui este ponto? */
export function matchesPointFilter(filter: string, option: PointOption) {
  if (!filter) return true;
  if (filter.startsWith("sia:")) return option.sia === filter.slice(4);
  if (filter.startsWith("mun:")) return (option.municipality ?? "") === filter.slice(4);
  return true;
}

export function PointSelect({
  label,
  points,
  value,
  onChange,
  allLabel = "Todos os pontos",
  municipalities = false,
  className = "",
  selectClassName = "mt-1 block min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-base font-normal text-[var(--ink)]",
  name,
  required,
  placeholder,
}: {
  label: string;
  points: PointOption[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  municipalities?: boolean;
  className?: string;
  selectClassName?: string;
  /** Em formulário GET: envia só o código do SIA. */
  name?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const unique = [...new Map(points.map((point) => [point.sia, point])).values()].sort((a, b) => collator.compare(a.sia, b.sia));
  const towns = municipalities ? [...new Set(unique.map((point) => point.municipality).filter((town): town is string => Boolean(town)))].sort(collator.compare) : [];
  const plain = Boolean(name);
  return (
    <label className={`block text-sm font-semibold ${className}`}>
      {label}
      <select name={name} required={required} className={selectClassName} value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder ? <option value="" disabled={required}>{placeholder}</option> : <option value="">{allLabel}</option>}
        {towns.length > 0 && <optgroup label="Município">{towns.map((town) => <option key={town} value={`mun:${town}`}>{town}</option>)}</optgroup>}
        {towns.length > 0 ? (
          <optgroup label="Ponto (SIA)">{unique.map((point) => <option key={point.sia} value={plain ? point.sia : `sia:${point.sia}`}>{pointOptionLabel(point)}</option>)}</optgroup>
        ) : unique.map((point) => <option key={point.sia} value={plain ? point.sia : `sia:${point.sia}`}>{pointOptionLabel(point)}</option>)}
      </select>
    </label>
  );
}
