"use client";

import { useEffect, useRef, useState } from "react";
import type { ReportSnapshot } from "../report-snapshot";
import { verifyReportCurrent } from "../report-snapshot";
const campaignControl = "min-h-11 min-w-0 max-w-full rounded border border-[var(--line-strong)] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]";
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
