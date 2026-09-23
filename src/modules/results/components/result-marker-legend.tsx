"use client";

import { useEffect, useRef } from "react";
import { drawResultMarker, RESULT_PALETTE, type ResultMarkerVisual } from "./result-visual";

const examples: Array<{ label: string; visual: ResultMarkerVisual }> = [
  { label: "Completo — 3/3", visual: { value: 0.4, lower: 0.4, upper: 0.4, included: [true, true, true] } },
  { label: "Parcial — 2/3", visual: { value: null, lower: 0.4, upper: 0.8, included: [true, false, true] } },
  { label: "Parcial — 1/3", visual: { value: null, lower: 0.2, upper: 0.8, included: [false, true, false] } },
  { label: "Indisponível — 0/3", visual: { value: null, lower: 0, upper: 1, included: [false, false, false] } },
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
    <div className="max-w-sm">
      <div className="h-3 rounded border border-[var(--line-strong)]" style={{ background: `linear-gradient(to right, ${RESULT_PALETTE.map(([value, color]) => `${color} ${value * 100}%`).join(", ")})` }} />
      <div className="flex justify-between font-semibold tabular-nums">{RESULT_PALETTE.map(([value]) => <span key={value}>{value.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</span>)}</div>
    </div>
    <div className="grid grid-cols-2 gap-x-2 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-3">{examples.map(({ label, visual }) => <span key={label} className="inline-flex min-w-0 items-center gap-1"><ResultMarkerSample visual={visual} /><span>{label}</span></span>)}</div>
  </div>;
}
