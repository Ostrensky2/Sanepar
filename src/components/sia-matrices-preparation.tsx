"use client";

import { useEffect, useRef, useState } from "react";
import { matrixIdentityFromName, matrixInputNames, type MatrixIdentity, type DiarySnapshot, type MatrixPackage } from "@/lib/imports/sia-matrices";
import { archivePackage, prepareArchiveSheets, previewArchiveBatches, applyArchiveBatches, selectArchiveGroups, readArchiveCampaign, type ArchiveBatch, type ArchivePlan, type ArchiveSheet, type MatrixScope } from "@/lib/imports/sia-matrix-archive";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";

const control = "min-h-11 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm disabled:opacity-50";
function processMatrices<T>(kind: "parse" | "export", args: unknown[], progress: (message: string) => void, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../lib/imports/sia-matrices.worker.ts", import.meta.url), { type: "module" });
    const cancel = () => { worker.terminate(); reject(new Error("Processamento cancelado.")); };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    worker.onmessage = ({ data }) => {
      if (signal.aborted) return;
      if (data.progress) { progress(data.progress); return; }
      worker.terminate();
      signal.removeEventListener("abort", cancel);
      if (data.error) reject(new Error(data.error)); else resolve(data.result as T);
    };
    worker.onerror = () => { worker.terminate(); signal.removeEventListener("abort", cancel); reject(new Error("Processamento local interrompido. Recarregue a página e tente novamente.")); };
    try { worker.postMessage({ kind, args }); } catch (error) { worker.terminate(); signal.removeEventListener("abort", cancel); reject(error); }
  });
}

async function diary(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch("/api/field-diary", { method: "GET", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error("Diário indisponível ou sessão expirada. Nenhum vínculo presumido.");
  const snapshot = await response.json() as DiarySnapshot;
  if (!Array.isArray(snapshot.entries)) throw new Error("Resposta do Diário inválida.");
  return snapshot;
}

type WorkFile = Omit<Awaited<ReturnType<typeof import("@/lib/imports/sia-matrices").buildCampaignMatrixWorkbook>>, "bytes"> & { bytes: ArrayBuffer };

function CampaignWorkbook({ data, campaign }: { data: MatrixPackage; campaign: number }) {
  const [file, setFile] = useState<WorkFile | null>(null);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(), signal = controller.signal;
    async function build() {
      const snapshot = await diary(signal);
      const response = await fetch(`/api/imports/sia-matrices?campaign=${campaign}&references=1`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
      if (!response.ok) throw new Error("Referências de coordenadas indisponíveis.");
      const { references, status, source, limitation } = await response.json();
      const result = await processMatrices<WorkFile>("export", [data, snapshot, campaign, undefined, references, { status, source, limitation }], () => {}, signal);
      if (!signal.aborted) setFile(result);
    }
    void build().catch((reason) => { if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Planilha indisponível."); });
    return () => controller.abort();
  }, [data, campaign, attempt]);
  function download() {
    if (!file) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  const sheet = file?.preview[index];
  return <div className="min-w-0 space-y-3">
    <button type="button" className={control} disabled={!file} onClick={download}>Baixar planilha (.xlsx)</button>
    {file && <IntegrationCheck campaign={campaign} points={file.points} byDiary={file.linkedByDiary} bySheet={file.linkedBySheet} unresolved={file.unresolved} />}
    {error ? <div role="alert">{error} <button className={control} type="button" onClick={() => { setError(""); setAttempt(attempt + 1); }}>Tentar novamente</button></div> : !file && <p role="status">Montando a planilha da C{campaign}…</p>}
    {sheet && file && <>
      <label className="flex flex-col gap-1 text-sm">Aba da prévia<select aria-label="Aba da prévia" className={control} value={index} onChange={(e) => setIndex(Number(e.target.value))}>{file.preview.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select></label>
      <p className="type-metadata">C{campaign} · {sheet.name}: {sheet.rows.length - 1} de {sheet.rowCount - 1} linhas e {sheet.rows[0].length} de {sheet.columnCount} colunas. O download inclui todas as abas, linhas e colunas.</p>
      <div tabIndex={0} role="region" aria-label={`Prévia de ${sheet.name}`} className="max-h-96 max-w-full overflow-auto rounded border">
        <table className="w-full text-left text-sm"><caption className="sr-only">{sheet.name} · C{campaign}</caption>
          <thead><tr>{sheet.rows[0].map((v, c) => <th scope="col" key={c} className="p-2 align-top">{v}</th>)}</tr></thead>
          <tbody>{sheet.rows.slice(1).map((row, r) => <tr key={r}>{row.map((v, c) => <td key={c} className="border-t p-2 align-top">{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>}
  </div>;
}

/** Avaliação da integração: cada ponto das matrizes precisa de uma coleta com data, vinda do Diário de Campo ou da planilha de campanha. */
export function IntegrationCheck({ campaign, points, byDiary, bySheet, unresolved }: { campaign: number; points: number; byDiary: number; bySheet: number; unresolved: number }) {
  const linked = byDiary + bySheet;
  const origin = [byDiary ? `${byDiary} pelo Diário de Campo` : "", bySheet ? `${bySheet} pela planilha de campanha` : ""].filter(Boolean).join(" e ");
  return unresolved === 0
    ? <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Integração funcionando na C{campaign}.</strong> Os {points} pontos das matrizes têm coleta e data ({origin}). Confira a aba Coletas na prévia abaixo.</p>
    : <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>Integração incompleta na C{campaign}.</strong> {linked} de {points} pontos têm coleta e data{origin ? ` (${origin})` : ""}; {unresolved} {unresolved === 1 ? "ficou" : "ficaram"} sem coleta vinculada, portanto sem data. A aba Pendências diz o motivo de cada um.</p>;
}

type StoredSummary = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; groups: number; points: number; datasets: string[] };

/** O que já foi integrado e guardado no aplicativo, por campanha. Fica sempre à vista: sem isso não há como conferir o que entrou. */
function IntegratedSheets({ state, campaigns, busy, onOpen }: { state: "loading" | "error" | "ready"; campaigns: number[]; busy: boolean; onOpen: (campaign: number) => void }) {
  const [summaries, setSummaries] = useState<Record<number, StoredSummary>>({});
  useEffect(() => {
    let active = true;
    for (const campaign of campaigns) {
      void readArchiveCampaign(campaign).then((groups): StoredSummary => ({
        status: "ready", groups: groups.length, points: new Set(groups.map((group) => group.scope[1])).size,
        datasets: [...new Set(groups.map((group) => `${group.scope[3]} ${group.scope[5] === "familias" ? "famílias" : "gêneros"} · ${group.scope[4]}`))].sort(),
      })).catch((reason): StoredSummary => ({ status: "error", message: reason instanceof Error ? reason.message : "Consulta indisponível." }))
        .then((summary) => { if (active) setSummaries((current) => ({ ...current, [campaign]: summary })); });
    }
    return () => { active = false; };
  }, [campaigns]);
  return <section aria-label="Planilhas integradas" className="min-w-0 space-y-2 rounded border border-[var(--line-strong)] p-3">
    <h3 className="type-section-title">Planilhas integradas</h3>
    {state === "loading" && <p role="status" className="text-sm">Consultando o que já foi integrado…</p>}
    {state === "error" && <p role="alert" className="text-sm">Não foi possível consultar as planilhas integradas agora. Isso é uma falha de consulta, não quer dizer que não haja nada guardado.</p>}
    {state === "ready" && campaigns.length === 0 && <p className="text-sm"><strong>Nenhuma planilha integrada está guardada no aplicativo.</strong> Baixar a planilha não a guarda: o arquivo fica só no computador de quem baixou. Para guardar, confira as matrizes abaixo, abra Acervo compartilhado, compare com o acervo e confirme.</p>}
    {state === "ready" && campaigns.length > 0 && <ul className="space-y-2">{campaigns.map((campaign) => {
      const summary = summaries[campaign] ?? { status: "loading" as const };
      return <li key={campaign} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
        <div className="min-w-0">
          <p className="font-semibold">{resolveCanonicalCampaign(campaign)?.name ?? `C${campaign}`}</p>
          {summary.status === "loading" && <p role="status">Lendo o que está guardado…</p>}
          {summary.status === "error" && <p role="alert">Não foi possível ler: {summary.message}</p>}
          {summary.status === "ready" && <p className="break-words">{summary.points} pontos · {summary.datasets.length} conjuntos guardados: {summary.datasets.join("; ")}</p>}
        </div>
        <button type="button" className={control} disabled={busy} onClick={() => onOpen(campaign)}>Abrir para conferir e baixar</button>
      </li>;
    })}</ul>}
  </section>;
}

export function SiaMatricesPreparation({ canImport }: { canImport: boolean }) {
  const processing = useRef<AbortController | null>(null);
  useEffect(() => () => processing.current?.abort(), []);
  function processingSignal() { processing.current?.abort(); processing.current = new AbortController(); return processing.current.signal; }
  const [files, setFiles] = useState<File[]>([]);
  const [data, setData] = useState<MatrixPackage | null>(null);
  const [campaign, setCampaign] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ sheets: ArchiveSheet[]; plan: ArchivePlan; batches: ArchiveBatch[]; confirmedSubset: boolean } | null>(null);
  const [selected, setSelected] = useState<MatrixScope[]>([]);
  const started = review?.batches.some((batch) => batch.state !== "não enviado") ?? false;
  const indeterminate = review?.batches.some((batch) => batch.state === "verificar" && !batch.conflict) ?? false;
  const [archiveCount, setArchiveCount] = useState<number | null>(null);
  const [archiveCampaigns, setArchiveCampaigns] = useState<number[]>([]);
  const [inventoryState, setInventoryState] = useState<"loading" | "error" | "ready">("loading");
  useEffect(() => {
    if (!canImport) return;
    const controller = new AbortController();
    void fetch("/api/imports/sia-matrices?inventory=1", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) { setInventoryState("error"); return; }
      const value = await response.json();
      if (Array.isArray(value.campaigns)) { setArchiveCampaigns(value.campaigns); setCampaign((current) => current ?? value.campaigns[0] ?? null); setInventoryState("ready"); }
      else setInventoryState("error");
    }).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setInventoryState("error"); });
    return () => controller.abort();
  }, [canImport]);
  const [excludedSias, setExcludedSias] = useState<string[]>([]);
  const [openScope, setOpenScope] = useState("");
  const [detailPage, setDetailPage] = useState(0);
  const [inputNames, setInputNames] = useState<string[]>([]);
  const [identities, setIdentities] = useState<Record<string, MatrixIdentity>>({});
  async function chooseFiles(selectedFiles: File[]) {
    if (started) return;
    processing.current?.abort();
    setFiles(selectedFiles); setExcludedSias([]); setData(null); invalidateReview(); setError(""); setMessage(""); setBusy(true);
    try {
      const names = await matrixInputNames(selectedFiles); setInputNames(names);
      setIdentities(Object.fromEntries(names.map((name) => [name, matrixIdentityFromName(name) ?? { campaign: 0, marker: "", rank: "", run: "" }])) as Record<string, MatrixIdentity>);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Arquivos inválidos."); setFiles([]); }
    finally { setBusy(false); }
  }
  function invalidateReview() { setReview(null); setSelected([]); }
  async function prepare() {
    if (started) return;
    setBusy(true); setError(""); setData(null); invalidateReview(); setMessage("Conferindo arquivos locais…");
    try {
      const result = await processMatrices<MatrixPackage>("parse", [files, undefined, identities], setMessage, processingSignal());
      setData(result); setCampaign(result.sources[0]?.campaign ?? null); setMessage(`${result.sources.length} matrizes conferidas. Selecione a campanha para cruzar com o Diário e baixar.`);
      setRuns(Object.fromEntries(result.sources.map((s) => [s.name, /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(s.run) ? s.run.toLowerCase() : ""])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível preparar os arquivos."); setMessage(""); }
    finally { setBusy(false); }
  }
  async function compare(subset = false) {
    if (!data || campaign === null || indeterminate || (started && !subset)) return;
    setBusy(true); setError("");
    try {
      const remaining = review?.batches.filter((batch) => batch.state !== "confirmado").flatMap((batch) => batch.sheets);
      const sheets = subset && review ? selectArchiveGroups(remaining ?? review.sheets, selected) : prepareArchiveSheets(data, await diary(), campaign, runs, excludedSias);
      const batches = await previewArchiveBatches(sheets);
      const plan = batches.reduce<ArchivePlan>((total, batch) => ({ ...total, new: total.new + batch.plan.new, changed: total.changed + batch.plan.changed, unchanged: total.unchanged + batch.plan.unchanged, details: [...total.details, ...batch.plan.details] }), { planDigest: "", payloadHash: "", new: 0, changed: 0, unchanged: 0, details: [] });
      setReview({ sheets, plan, batches: [...(subset ? review?.batches.filter((batch) => batch.state === "confirmado") ?? [] : []), ...batches], confirmedSubset: true });
      setSelected(plan.details.map((detail) => detail.scope));
      setMessage(`${plan.new} novos, ${plan.changed} alterados, ${plan.unchanged} idênticos. Prévia sem gravação.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Comparação indisponível."); setReview((current) => current ? { ...current, confirmedSubset: false } : null); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!review || !review.confirmedSubset || busy) return;
    setBusy(true); setError("");
    try {
      const batches = await applyArchiveBatches(review.batches, undefined, (progress) => setReview({ ...review, batches: progress }));
      setReview({ ...review, batches, confirmedSubset: !batches.some((batch) => batch.conflict) });
      const confirmed = batches.filter((batch) => batch.state === "confirmado").length;
      setMessage(`${confirmed}/${batches.length} lotes confirmados. Resultados científicos não publicados.`);
      if (batches.some((batch) => batch.conflict)) setError("Conflito: revise novamente somente o saldo antes de confirmar. Lotes anteriores permanecem salvos.");
      else if (batches.some((batch) => batch.state === "verificar")) setError("Resposta indeterminada. Repetir confirmação consultará o mesmo pedido, sem alterar UUID, conteúdo ou digest.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Confirmação indisponível. O identificador da operação foi mantido para reconsulta/reenvio seguro."); }
    finally { setBusy(false); }
  }
  async function inspectArchive(target: number | null = campaign) {
    if (target === null || started) return;
    const campaign = target;
    setCampaign(campaign); setBusy(true); setError("");
    try {
      const groups = await readArchiveCampaign(campaign); setArchiveCount(groups.length);
      const loaded = await archivePackage(groups, await diary()); setData(loaded); setRuns(Object.fromEntries(loaded.sources.map((s) => [s.name, s.run]))); invalidateReview();
      setMessage(`C${campaign}: ${groups.length} grupos recuperados do acervo compartilhado.`);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Acervo indisponível."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Preparação local de matrizes por SIA" aria-busy={busy} className="min-w-0 space-y-3 border-t border-[var(--line-strong)] pt-5">
    <h2 className="type-section-title text-[var(--brand-navy-strong)]">Preparar matrizes por SIA</h2>
    {canImport && <IntegratedSheets state={inventoryState} campaigns={archiveCampaigns} busy={busy || started} onOpen={(number) => void inspectArchive(number)} />}
    <fieldset disabled={!canImport || busy || started} className="flex min-w-0 flex-col items-start gap-3">
      <legend className="sr-only">Selecionar matrizes locais</legend>
      <label className="flex w-full min-w-0 flex-col gap-1 text-sm">Arquivos de matrizes (.zip ou .xlsx)
        <input type="file" multiple accept=".zip,.xlsx" className={`${control} w-full min-w-0`} onChange={(event) => void chooseFiles(Array.from(event.target.files ?? []))} />
      </label>
      {inputNames.length > 0 && <details className="w-full min-w-0"><summary className="min-h-11 cursor-pointer py-3">Identificação dos arquivos ({inputNames.length})</summary>
        {inputNames.map((name) => <fieldset key={name} className="my-2 grid min-w-0 gap-2 rounded border p-2 sm:grid-cols-4"><legend className="break-words text-sm">{name}</legend>
          <label className="text-sm">Campanha<select className={`${control} w-full`} value={identities[name]?.campaign ?? 0} onChange={(event) => { setIdentities({ ...identities, [name]: { ...identities[name], campaign: Number(event.target.value) } }); setData(null); invalidateReview(); }}><option value={0}>Selecionar</option>{Array.from({ length: 9 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>C{n}</option>)}</select></label>
          <label className="text-sm">Marcador<select className={`${control} w-full`} value={identities[name]?.marker ?? ""} onChange={(event) => { setIdentities({ ...identities, [name]: { ...identities[name], marker: event.target.value as MatrixIdentity["marker"] } }); setData(null); invalidateReview(); }}><option value="">Selecionar</option><option>16S</option><option>COI</option></select></label>
          <label className="text-sm">Nível<select className={`${control} w-full`} value={identities[name]?.rank ?? ""} onChange={(event) => { setIdentities({ ...identities, [name]: { ...identities[name], rank: event.target.value as MatrixIdentity["rank"] } }); setData(null); invalidateReview(); }}><option value="">Selecionar</option><option value="familias">Famílias</option><option value="generos">Gêneros</option></select></label>
          <label className="text-sm">Plataforma / corrida<input className={`${control} w-full`} value={identities[name]?.run ?? ""} onChange={(event) => { setIdentities({ ...identities, [name]: { ...identities[name], run: event.target.value } }); setData(null); invalidateReview(); }} /></label>
        </fieldset>)}
      </details>}
      <button type="button" className={control} disabled={!files.length} onClick={() => void prepare()}>Conferir matrizes localmente</button>
    </fieldset>
    {(data || archiveCampaigns.length > 0) && <section aria-label="Planilha de trabalho" className="min-w-0 space-y-3">
      <h3 className="type-section-title">Planilha de trabalho</h3>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Campanha disponível
        <select aria-label="Campanha disponível" className={control} value={campaign ?? ""} disabled={busy || started} onChange={(event) => { setCampaign(Number(event.target.value)); setExcludedSias([]); invalidateReview(); setArchiveCount(null); }}>
          {[...new Set([...(data?.sources.map((source) => source.campaign) ?? []), ...archiveCampaigns])].sort((a, b) => a - b).map((number) => <option key={number} value={number}>{resolveCanonicalCampaign(number)?.name}</option>)}
        </select>
      </label>
      {canImport && data && campaign !== null && data.sources.some((source) => source.campaign === campaign) && <CampaignWorkbook key={JSON.stringify([campaign, data.sources.map((s) => s.hash)])} data={data} campaign={campaign} />}
      {archiveCampaigns.includes(campaign ?? 0) && <button type="button" className={control} disabled={busy} onClick={() => void inspectArchive()}>Carregar acervo</button>}
    </section>}
    {data && <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-3">Acervo compartilhado</summary>
      <fieldset disabled={busy || !canImport || started} className="space-y-2"><legend className="text-sm">Corridas estáveis da campanha</legend>
        {data.sources.filter((s) => s.campaign === campaign).map((source) => <label key={source.name} className="flex min-w-0 flex-col gap-1 text-sm"><span className="break-words">{source.name}</span><input className={control} value={runs[source.name] ?? ""} placeholder="Corrida confirmada, ex.: miseq-run1" onChange={(event) => { setRuns({ ...runs, [source.name]: event.target.value }); invalidateReview(); }} /></label>)}
        <details><summary className="min-h-11 cursor-pointer py-3">Selecionar SIAs para comparação ({excludedSias.length} excluídos)</summary><div className="grid max-h-60 grid-cols-2 overflow-auto sm:grid-cols-4">{[...new Set(data.sources.filter((s) => s.campaign === campaign).flatMap((s) => s.matrix.rows.map((row) => row.sia)))].sort().map((sia) => <label key={sia} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={!excludedSias.includes(sia)} onChange={(event) => { setExcludedSias(event.target.checked ? excludedSias.filter((value) => value !== sia) : [...excludedSias, sia]); invalidateReview(); }} />{sia}</label>)}</div></details>
        <div className="flex flex-wrap gap-2"><button type="button" className={control} onClick={() => void inspectArchive()}>Consultar acervo</button><button type="button" className={control} onClick={() => void compare()}>Comparar com acervo</button></div>
      </fieldset>
      {archiveCount !== null && <p className="text-sm">{archiveCount} grupos armazenados.</p>}
      {review && <div className="space-y-3">
        <div className="flex items-center gap-2"><p className="text-sm">C{campaign} · {review.batches.length} lotes · {review.plan.new} novos · {review.plan.changed} alterados · {review.plan.unchanged} idênticos</p><ResultsInterpretationHelp title="Como revisar a incorporação"><p>Confira os valores antes e depois. Ausente não é zero. Se um lote falhar, os anteriores permanecem salvos.</p><a className="underline" href="/ajuda?tela=/dados/planilhas">Ajuda sobre matrizes e retomada</a></ResultsInterpretationHelp></div>
        <p className="text-sm">Se um lote falhar, os anteriores permanecem salvos.</p>
        <ol className="max-h-40 overflow-auto text-sm">{review.batches.map((batch, index) => <li key={batch.request}>Lote {index + 1}: {batch.state}</li>)}</ol>
        <div className="max-h-96 space-y-2 overflow-auto">{review.plan.details.map((detail) => {
          const key = JSON.stringify(detail.scope), checked = selected.some((scope) => JSON.stringify(scope) === key);
          const source = review.sheets.find((sheet) => sheet.campaign === detail.scope[0] && sheet.marker === detail.scope[3] && sheet.run === detail.scope[4] && sheet.rank === detail.scope[5] && sheet.sheet === detail.scope[6]);
          const sourceRow = source?.rows.find((row) => row.sia === detail.scope[1] && row.collection === detail.scope[2]);
          const changes = openScope === key ? detail.changes ?? Object.fromEntries((source?.headers ?? []).map((header, i) => [header, [null, sourceRow?.values[i]]])) : {};
          const changeRows = Object.entries(changes);
          return <details key={key} open={openScope === key} onToggle={(event) => { if (event.currentTarget.open && openScope !== key) { setOpenScope(key); setDetailPage(0); } }} className="rounded border p-2"><summary className="min-h-11 cursor-pointer break-words">{detail.scope[1]} · {detail.scope.slice(3).join(" / ")} · {detail.changes ? "Alterado" : "Novo"}</summary>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={checked} disabled={busy || started} onChange={(event) => { setSelected(event.target.checked ? [...selected, detail.scope] : selected.filter((scope) => JSON.stringify(scope) !== key)); setReview({ ...review, confirmedSubset: false }); }} />Incluir este grupo</label>
            <table className="w-full text-sm"><thead><tr><th>Táxon / associação</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{changeRows.slice(detailPage * 50, detailPage * 50 + 50).map(([header, values]) => <tr key={header}><td className="break-words">{header}</td><td>{values[0] === null ? "Ausente" : values[0]}</td><td>{values[1]}</td></tr>)}</tbody></table>
            <div className="flex flex-wrap items-center gap-2"><button type="button" className={control} disabled={detailPage === 0} onClick={() => setDetailPage(detailPage - 1)}>Anterior</button><span className="text-sm">Página {detailPage + 1} de {Math.max(1, Math.ceil(changeRows.length / 50))}</span><button type="button" className={control} disabled={(detailPage + 1) * 50 >= changeRows.length} onClick={() => setDetailPage(detailPage + 1)}>Próxima</button></div>
          </details>;
        })}</div>
        <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={busy || !selected.length || review.batches.some((batch) => batch.state === "verificar" && !batch.conflict)} onClick={() => void compare(true)}>Revisar seleção / saldo</button><button type="button" className={control} disabled={busy || !review.confirmedSubset || review.plan.new + review.plan.changed === 0 || review.batches.every((batch) => batch.state === "confirmado")} onClick={() => void apply()}>Confirmar incorporação no acervo</button><button type="button" className={control} disabled={busy} onClick={() => { invalidateReview(); setMessage("Saldo cancelado. Lotes já confirmados permanecem salvos; respostas indeterminadas devem ser verificadas no acervo."); }}>Cancelar saldo</button></div>
      </div>}
    </details>}
    <p role="status" aria-live="polite" className="type-metadata break-words">{message}</p>
    {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
  </section>;
}
