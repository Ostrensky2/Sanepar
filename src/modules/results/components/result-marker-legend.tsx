"use client";

import { useEffect, useRef } from "react";
import { drawResultMarker, RESULT_BANDS, type ResultMarkerVisual } from "./result-visual";

const examples: Array<{ label: string; visual: ResultMarkerVisual }> = [
  { label: "16S, algas e COI — 3/3", visual: { value: 0.2, lower: 0.2, upper: 0.2, included: [true, true, true] } },
  { label: "Sem o COI — 2/3", visual: { value: 0.4, lower: 0.4, upper: 0.4, included: [true, true, false] } },
  { label: "Só o COI — 1/3", visual: { value: 0.08, lower: 0.08, upper: 0.08, included: [false, false, true] } },
  { label: "Sem medição — 0/3", visual: { value: null, lower: 0, upper: 0, included: [false, false, false] } },
];

export function ResultMarkerSample({ visual }: { visual: ResultMarkerVisual }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    context.setTransform(2, 0, 0, 2, 0, 0);
    context.clearRect(0, 0, 48, 58);
    drawResultMarker(context, 24, 21, visual);
  }, [visual]);
  return <canvas ref={ref} width={96} height={116} className="h-[58px] w-12 shrink-0" aria-hidden="true" />;
}

export function ResultMarkerLegend() {
  return <div className="mt-3 space-y-2 type-caption text-[var(--ink)]" aria-label="Legenda dos índices e conjuntos utilizados">
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Faixas do índice">
      {RESULT_BANDS.map((band) => <li key={band.label} className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-5 rounded border border-[var(--line-strong)]" style={{ backgroundColor: band.color }} />
        <span><strong>{band.label}</strong> · {band.range}</span>
      </li>)}
    </ul>
    <p>Cinza não quer dizer água boa: quer dizer que os organismos que o índice sabe avaliar apareceram pouco.</p>
    <div className="grid grid-cols-2 gap-x-2 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-3">{examples.map(({ label, visual }) => <span key={label} className="inline-flex min-w-0 items-center gap-1"><ResultMarkerSample visual={visual} /><span>{label}</span></span>)}</div>
  </div>;
}
