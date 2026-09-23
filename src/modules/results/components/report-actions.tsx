"use client";

import { useEffect, useRef, useState } from "react";
import type { ReportSnapshot, PointReportSource } from "../report-snapshot";
import { buildPointReport, verifyReportCurrent } from "../report-snapshot";
import { campaignControl } from "./campaign-molecular";
import { countLabel } from "@/lib/number-format";

export function ReportActions({ count, build, identity }: { count: number; build: () => Promise<ReportSnapshot>; identity: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detailed, setDetailed] = useState(false);
  const [timings, setTimings] = useState<{ collectionMs: number; revalidationMs: number; generationMs: number; moduleMs: number; reused: boolean } | null>(null);
  const current = useRef(identity); current.current = identity;
  const mounted = useRef(true);
  const cached = useRef<{ identity: string; snapshot: ReportSnapshot } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(format: "pdf" | "xlsx" | "print") {
    const requestedIdentity = identity;
    const printWindow = format === "print" ? window.open("", "_blank") : null;
    if (format === "print" && !printWindow) { setMessage("Permita a janela de impressão para continuar."); return; }
    setBusy(true); setTimings(null); setMessage("Conferindo a seleção e todas as páginas da fonte…");
    try {
      const collectionStart = performance.now();
      const reused = cached.current?.identity === identity;
      const snapshot = reused ? cached.current!.snapshot : await build();
      const collectionMs = performance.now() - collectionStart;
      if (typeof snapshot.provenance.Publicação === "string") cached.current = { identity, snapshot };
      if (!mounted.current || current.current !== requestedIdentity) throw new Error("A seleção ou fonte mudou; exportação cancelada.");
      const moduleStart = performance.now();
      const exports = await import("../report-export");
      const moduleMs = performance.now() - moduleStart;
      const revalidationStart = performance.now();
      await verifyReportCurrent(snapshot);
      const revalidationMs = performance.now() - revalidationStart;
      if (!mounted.current || current.current !== requestedIdentity) throw new Error("A seleção ou fonte mudou; exportação cancelada.");
      const mode = detailed ? "detailed" : "summary";
      const name = `Yvae_${format === "xlsx" ? "completo" : detailed ? "relatorio_detalhado" : "ficha_sintese"}_${snapshot.records.length}_${snapshot.generatedAt.slice(0, 10)}`;
      const generationStart = performance.now();
      if (format === "print") await exports.printReport(snapshot, printWindow!, mode);
      else { const blob = format === "pdf" ? await exports.reportPdfBlob(snapshot, mode) : new Blob([await (await exports.reportWorkbook(snapshot)).xlsx.writeBuffer() as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); if (!mounted.current || current.current !== requestedIdentity) throw new Error("Fonte ou seleção alterada durante a geração."); exports.downloadReport(blob, `${name}.${format}`); }
      setMessage(`${countLabel(snapshot.records.length, "item incluído", "itens incluídos")}, somente a seleção explícita.`);
      setTimings({ collectionMs, revalidationMs, generationMs: performance.now() - generationStart, moduleMs, reused });
    } catch (error) { printWindow?.close(); setMessage(error instanceof Error ? error.message : "Relatório indisponível."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2" data-export-timings={timings ? JSON.stringify(timings) : undefined}><p className="type-metadata">PDF e impressão: {detailed ? "Relatório detalhado" : "Ficha-síntese"}. XLSX sempre completo, com uma aba “Leitura” no início na mesma ordem da ficha.</p><label className="type-label flex min-h-11 items-center gap-2"><input type="checkbox" checked={detailed} disabled={busy} onChange={(event) => setDetailed(event.target.checked)} />Relatório detalhado — incluir evidências e referências integrais no PDF e na impressão</label><div className="flex flex-wrap gap-2">{([ ["print", "Imprimir"], ["pdf", "Exportar PDF"], ["xlsx", "Exportar XLSX"] ] as const).map(([format, label]) => <button type="button" key={format} className={campaignControl} disabled={!count || busy} onClick={() => void run(format)}>{label}</button>)}</div><p className="type-metadata" role="status">{message || `${countLabel(count, "item selecionado", "itens selecionados")}. Filtros não selecionam registros.`}</p>{timings && <p className="type-caption">Coleta {(timings.collectionMs / 1000).toFixed(1)} s{timings.reused ? " (snapshot reutilizado)" : ""} · revalidação {(timings.revalidationMs / 1000).toFixed(1)} s · geração {(timings.generationMs / 1000).toFixed(1)} s.</p>}</div>;
}

export function PointReportSelection({ source }: { source: PointReportSource }) {
  const [query, setQuery] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const search = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
  const matches = source.campaign.points.filter((point) => search(`${point.siaCode} ${point.municipality ?? ""} ${point.waterBody ?? ""}`).includes(search(query)));
  return <details className="border-y border-[var(--line-strong)] py-2"><summary className="type-label min-h-11 cursor-pointer py-3">Exportar fichas de pontos (PDF ou XLSX){ids.length ? ` · ${countLabel(ids.length, "selecionado", "selecionados")}` : ""}</summary><div className="space-y-3">
    <label className="type-label block">Pesquisar pontos por SIA, nome ou município<input className={`${campaignControl} mt-1 block w-full`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <fieldset className="max-h-52 overflow-y-auto"><legend className="type-metadata">Marque explicitamente os pontos desta campanha</legend>{matches.map((point) => <label key={point.key} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={ids.includes(point.key)} onChange={(event) => setIds((current) => event.target.checked ? [...current, point.key] : current.filter((id) => id !== point.key))} />{point.siaCode} · {point.waterBody} · {point.municipality}</label>)}{!matches.length && <p>Nenhum ponto encontrado.</p>}</fieldset>
    <button type="button" className={campaignControl} disabled={!ids.length} onClick={() => setIds([])}>Limpar seleção</button>
    <ReportActions count={ids.length} identity={JSON.stringify([source.publicationId, source.sourceHash, source.campaign.campaignCode, ids])} build={() => buildPointReport(source, ids)} />
  </div></details>;
}
