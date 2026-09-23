import { continuousResultColor, resultIntervalStops } from "./result-visual";

/**
 * Desenho da convenção usada em todo o app: ponto completo = um valor (coluna cheia);
 * ponto parcial = faixa possível (gradiente entre o menor e o maior valor).
 * Mostra a forma, não um dado: por isso não traz números.
 */
export function CompleteVsPartialSketch() {
  const partial = { lower: 0.35, upper: 0.7 };
  const stops = resultIntervalStops(partial.lower, partial.upper).map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ");
  return <figure className="flex items-end gap-6" aria-hidden="true">
    {[
      { label: "Completo", sub: "um valor", style: { bottom: "0%", height: "55%", backgroundColor: continuousResultColor(0.55) } },
      { label: "Parcial", sub: "faixa possível", style: { bottom: `${partial.lower * 100}%`, height: `${(partial.upper - partial.lower) * 100}%`, background: `linear-gradient(to top, ${stops})` } },
    ].map((item) => <div key={item.label} className="w-24 text-center">
      <div className="relative mx-auto h-24 w-12 border-y border-[var(--line-strong)] bg-[var(--surface-soft)]">
        <span className="absolute inset-x-1 border-y border-[var(--ink)]" style={item.style} />
      </div>
      <p className="mt-1 text-xs font-bold text-[var(--ink)]">{item.label}</p>
      <p className="text-xs text-[var(--ink-soft)]">{item.sub}</p>
    </div>)}
  </figure>;
}

/** Régua de cor 0–1 usada no mapa, nas barras e nas células. */
export function IndexScaleBar() {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1].map((value) => `${continuousResultColor(value)} ${value * 100}%`).join(", ");
  return <figure aria-hidden="true" className="max-w-xs">
    <span className="block h-3 rounded-sm" style={{ background: `linear-gradient(to right, ${stops})` }} />
    <span className="mt-1 flex justify-between text-xs tabular-nums text-[var(--ink-soft)]"><span>0</span><span>0,5</span><span>1</span></span>
  </figure>;
}
