"use client";

import { useEffect, useRef, useState } from "react";
import { defaultCampaigns } from "@/lib/campaign-management";
import { PREPARATION_ROLES, type PreparationInput, type PreparationPreview, type PreparationRole } from "@/lib/results-preparation-contract";
import { scientificControl } from "./scientific-query-controls";
import { ResultsInterpretationHelp } from "./results-interpretation-help";

const roleLabels: Record<PreparationRole, string> = { full_workbook: "Workbook integral", molecular: "Metadados", catalog: "Riscos_bibliografia", evidence: "Evidencias_risco", criteria: "Criterios_scores", indices: "Indices_pontos", components: "Calculo_conjuntos", method: "Metodo_calculo" };
const stateLabels = { received: "Recebido para análise", pending: "Dependências pendentes", conflict: "Conflitos encontrados", ready: "Prévia validada — ainda não persistida" };

export function ResultsPreparationPanel({ canImport }: { canImport: boolean }) {
  const [kind, setKind] = useState<PreparationInput["kind"]>("bibliography");
  const [files, setFiles] = useState<Array<{ file: File; role: PreparationRole }>>([]);
  const [campaignCodes, setCampaignCodes] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<PreparationInput["dependencies"]>([]);
  const [preview, setPreview] = useState<PreparationPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const input: PreparationInput = { kind, scope: kind === "bibliography" ? { type: "global-bibliography" } : { type: "campaigns", campaignCodes }, roles: files.map((item) => item.role), dependencies };
  async function validate() {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setPending(true); setPreview(null); setError("");
    const timer = setTimeout(() => request.abort(), 60000);
    try {
      const form = new FormData(); form.set("mode", "preparation"); form.set("preparation", JSON.stringify(input));
      files.forEach((item) => form.append("files", item.file));
      const response = await fetch("/api/imports/results/preview", { method: "POST", body: form, signal: request.signal });
      const value = await response.json();
      if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "A preparação não pôde ser validada.");
      if (value.source?.kind !== "preparation" || value.source.published !== false || value.persisted !== false || value.manifest?.contractVersion !== "yvae-preparation/1") throw new Error("Resposta de preparação incompatível; nenhum estado persistido foi presumido.");
      setPreview(value as PreparationPreview);
    } catch (reason) { setError(reason instanceof Error ? reason.name === "AbortError" ? "Validação interrompida. Nenhuma publicação foi feita." : reason.message : "Prévia indisponível."); }
    finally { clearTimeout(timer); setPending(false); }
  }
  function invalidate() { setPreview(null); setError(""); }
  return <section className="space-y-3 border-t border-[var(--line-strong)] pt-5" aria-label="Preparação de fragmentos de resultados">
    <h2 className="type-section-title text-[var(--brand-navy-strong)]">Preparar abas individuais ou revisão bibliográfica</h2>
    <ResultsInterpretationHelp><p>Use esta mesma entrada para arquivos complementares. Cada arquivo tem um papel explícito; bibliografia não cria campanha fictícia. A prévia não modifica as publicações vigentes.</p><p>Uma prévia válida não equivale a uma importação salva. A persistência depende da habilitação transacional do repositório de revisões.</p></ResultsInterpretationHelp>
    <fieldset disabled={!canImport || pending} className="space-y-3">
      <legend className="sr-only">Arquivos e escopo da preparação</legend>
      <label className="type-label flex flex-col gap-1">Tipo de preparação<select className={scientificControl} value={kind} onChange={(event) => { setKind(event.target.value as PreparationInput["kind"]); invalidate(); }}><option value="bibliography">Revisão bibliográfica independente</option><option value="campaign_fragment">Fragmentos de campanhas</option></select></label>
      {kind === "campaign_fragment" && <fieldset className="flex flex-wrap gap-x-5"><legend className="type-label">Campanhas explicitamente abrangidas</legend>{defaultCampaigns.map((campaign) => { const number = campaign.id.match(/^campanha-(\d+)/)?.[1]; if (!number) return null; const code = `C${number}`; return <label key={code} className="type-metadata flex min-h-11 items-center gap-2"><input type="checkbox" checked={campaignCodes.includes(code)} onChange={(event) => { setCampaignCodes(event.target.checked ? [...campaignCodes, code] : campaignCodes.filter((value) => value !== code)); invalidate(); }} />{campaign.title}</label>; })}</fieldset>}
      <label className="type-label flex flex-col gap-1">Arquivos Excel<input type="file" accept=".xlsx" multiple className={`${scientificControl} py-2`} onChange={(event) => { setFiles(Array.from(event.target.files ?? []).map((file) => ({ file, role: "full_workbook" }))); invalidate(); }} /></label>
      {files.map((item, index) => <label key={`${item.file.name}:${index}`} className="type-label flex min-w-0 flex-col gap-1"><span className="break-words">Papel de {item.file.name}</span><select className={scientificControl} value={item.role} onChange={(event) => { setFiles(files.map((value, i) => i === index ? { ...value, role: event.target.value as PreparationRole } : value)); invalidate(); }}>{PREPARATION_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>)}
      <details className="space-y-2"><summary className="type-label min-h-11 cursor-pointer py-3">Dependências de revisões já persistidas</summary><p className="type-metadata">Informe somente hashes de revisões existentes. Dependências ausentes ou incompatíveis serão apontadas; não são completadas por suposição.</p>
        {dependencies.map((dependency, index) => <div key={index} className="flex flex-wrap gap-2"><label className="type-label flex flex-col gap-1">Papel<select className={scientificControl} value={dependency.role} onChange={(event) => { setDependencies(dependencies.map((value, i) => i === index ? { ...value, role: event.target.value as PreparationRole } : value)); invalidate(); }}>{PREPARATION_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label><label className="type-label flex min-w-0 flex-1 flex-col gap-1">SHA-256 da revisão<input className={scientificControl} value={dependency.revisionHash} onChange={(event) => { setDependencies(dependencies.map((value, i) => i === index ? { ...value, revisionHash: event.target.value.trim() } : value)); invalidate(); }} /></label><button className={scientificControl} type="button" onClick={() => { setDependencies(dependencies.filter((_, i) => i !== index)); invalidate(); }}>Remover dependência {index + 1}</button></div>)}
        <button type="button" className={scientificControl} onClick={() => { setDependencies([...dependencies, { role: "catalog", revisionHash: "" }]); invalidate(); }}>Adicionar dependência</button>
      </details>
      <button type="button" className={scientificControl} disabled={!files.length || (kind === "campaign_fragment" && !campaignCodes.length) || dependencies.some((item) => !/^[a-f\d]{64}$/i.test(item.revisionHash))} onClick={() => void validate()}>Validar preparação sem publicar</button>
    </fieldset>
    {pending && <p role="status">Validando arquivos e dependências…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <div className="space-y-2"><h3 className="type-panel-title">{stateLabels[preview.manifest.state]}</h3><p className="type-metadata">Não persistida · não publicada. Abas reconhecidas: {preview.recognizedSheets.join(", ") || "nenhuma"}.</p><p className="type-metadata">Papéis pendentes: {preview.missingRoles.map((role) => roleLabels[role]).join(", ") || "nenhum"}.</p><ul>{preview.manifest.diagnostics.map((diagnostic, index) => <li key={index} className="type-metadata">{diagnostic}</li>)}</ul></div>}
    <p role="status" className="type-metadata">Esta etapa só confere os arquivos: nada é salvo nem publicado.</p>
  </section>;
}
