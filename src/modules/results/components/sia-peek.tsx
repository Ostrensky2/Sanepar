"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import type { ResultDomain, ResultPoint, ResultsCampaign } from "@/modules/results";
import { bands, fixedBandIndex } from "./capture-map-scale";

export type PeekPoint = { sia: string; value: number | null; place: string | null };
export type PeekMetric = "overall" | ResultDomain;

const bySia = (a: PeekPoint, b: PeekPoint) => a.sia.localeCompare(b.sia, "pt-BR", { numeric: true });

/** Pontos de cada campanha, com a nota 0.8 de cada um. Só leitura; serve para dizer quais SIAs formam uma barra ou um número. */
export function useCampaignPoints() {
  const [points, setPoints] = useState<Record<string, ResultPoint[]>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/results/capture-index/campaigns", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { campaigns: ResultsCampaign[] } | null) => {
        if (body && !controller.signal.aborted) setPoints(Object.fromEntries(body.campaigns.map((campaign) => [campaign.campaignCode, campaign.points])));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return points;
}

/** Separa os pontos de uma campanha pelas faixas da escala fixa, do maior para o menor índice. Nenhuma nota é recalculada. */
export function peekMembers(points: ResultPoint[] | undefined, metric: PeekMetric = "overall") {
  const all: PeekPoint[] = (points ?? []).map((point) => ({
    sia: point.siaCode,
    value: metric === "overall" ? point.overall.value : point.domains[metric].value,
    place: point.municipality || point.waterBody || null,
  }));
  const scored = all.filter((point) => point.value !== null).sort((a, b) => b.value! - a.value! || bySia(a, b));
  return {
    scored,
    missing: all.filter((point) => point.value === null).sort(bySia),
    bands: bands.map((_, index) => scored.filter((point) => fixedBandIndex(point.value) === index)),
    intervals: Array.from({ length: 40 }, (_, index) => scored.filter((point) => Math.min(39, Math.floor(point.value! * 40)) === index)),
    attention: scored.filter((point) => fixedBandIndex(point.value) >= 2),
    top: scored.filter((point) => point.value === scored[0]?.value),
  };
}

type Props = {
  /** Cabeçalho do balão, por exemplo "C2 · Atenção". */
  title: string;
  campaign: number;
  points: PeekPoint[];
  /** Contagem mostrada no gráfico. A lista só aparece quando tem exatamente esse número de pontos. */
  expected?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  label?: string;
};

/**
 * Barra ou número que diz quais SIAs o formam. Passar o mouse mostra a lista; clicar ou tocar fixa o balão;
 * cada SIA leva à ficha do ponto. Sem pontos, ou se a lista não bate com a contagem, fica só o conteúdo.
 */
export function SiaPeek(props: Props) {
  const usable = props.points.length > 0 && (props.expected === undefined || props.expected === props.points.length);
  if (!usable) return <span className={props.className} style={props.style} aria-label={props.label} role={props.label ? "img" : undefined}>{props.children}</span>;
  return <Peek {...props} />;
}

function Peek({ title, campaign, points, children, className = "", style, label }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [box, setBox] = useState<CSSProperties>();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const show = useCallback(() => {
    clearTimeout(timer.current);
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = window.innerHeight - rect.bottom, above = rect.top;
    setBox(below >= 260 || below >= above
      ? { left, width, top: rect.bottom + 6, maxHeight: Math.max(140, Math.min(360, below - 16)) }
      : { left, width, bottom: window.innerHeight - rect.top + 6, maxHeight: Math.max(140, Math.min(360, above - 16)) });
    setOpen(true);
  }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); setOpen(false); setPinned(false); }, []);
  const hideSoon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => { setOpen(false); setPinned(false); }, 180); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { hide(); trigger.current?.focus(); } };
    const outside = (event: Event) => { const target = event.target as Node; if (!trigger.current?.contains(target) && !panel.current?.contains(target)) hide(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", outside, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return <>
    <button
      ref={trigger}
      type="button"
      className={className}
      style={style}
      data-peek=""
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") show(); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse" && !pinned) hideSoon(); }}
      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) show(); }}
      onBlur={(event) => { if (!pinned && !panel.current?.contains(event.relatedTarget as Node | null)) hideSoon(); }}
      onClick={() => { if (open && pinned) hide(); else { show(); setPinned(true); } }}
    >{children}</button>
    {open && box && createPortal(
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-label={title}
        data-peek-panel=""
        style={{ position: "fixed", zIndex: 70, ...box }}
        className="flex flex-col overflow-hidden rounded-xl border border-[var(--line-strong)] bg-white text-left shadow-[0_16px_36px_-14px_rgba(8,47,73,0.45)]"
        onPointerEnter={() => clearTimeout(timer.current)}
        onPointerLeave={(event) => { if (event.pointerType === "mouse" && !pinned) hideSoon(); }}
      >
        <p className="border-b border-[var(--line-ghost)] px-3 py-2 text-sm font-bold text-[var(--brand-navy-strong)]">{title}
          <span className="block text-xs font-normal text-[var(--ink-soft)]">{points.length} {points.length === 1 ? "ponto" : "pontos"} · clique no SIA para abrir a ficha</span>
        </p>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5 text-sm">
          {points.map((point) => <li key={point.sia}>
            <Link href={`/campanhas/resultados?campaign=${campaign}&sia=${encodeURIComponent(point.sia)}`} className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]">
              <span className="min-w-0"><strong className="text-[var(--brand-navy-strong)]">SIA {point.sia}</strong>{point.place && <span className="ml-2 text-[var(--ink-soft)]">{point.place}</span>}</span>
              {point.value !== null && <span className="shrink-0 font-semibold tabular-nums text-[var(--ink)]">{formatCaptureIndex(point.value)}</span>}
            </Link>
          </li>)}
        </ul>
      </div>, document.body)}
  </>;
}
