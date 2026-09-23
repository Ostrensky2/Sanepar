"use client";

import Link from "next/link";
import { useState } from "react";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import type { AnalyticalSet, ResultPoint, ResultsCampaign } from "@/modules/results/types";
import { campaignControl, setNames, useCampaignAnalytics } from "./campaign-molecular";
import { campaignLocationIssue, indexText } from "./campaign-overview";
import { analyticalStatusText } from "../presentation";
import { withoutVersionFields } from "../hidden-fields";
import { CampaignSourceTable } from "./campaign-source-table";
import { ReportActions } from "./report-actions";
import { buildPointReport } from "../report-snapshot";
import { formatNumber, formatProportionAsPercent } from "@/lib/number-format";
import { CONFIRMATION_GUIDANCE, DomainChips, SET_ORDER, SET_SHORT } from "./campaign-story";
import { continuousResultColor } from "./result-visual";

// Ficha: posição → índice → domínios → organismos dominantes → maiores contribuições → o que confirmar.
// Método, procedência, contribuições q e metadados originais ficam recolhidos no fim.
export function CampaignPointFicha({ point, campaign, sourceHash, publicationId, photoUrl, onClose }: { point: ResultPoint; campaign: ResultsCampaign; sourceHash?: string; publicationId?: string; photoUrl?: string; onClose: () => void }) {
  const [photoLarge, setPhotoLarge] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [technical, setTechnical] = useState(false);
  const pointLeader = useCampaignAnalytics(campaign.campaignCode, sourceHash, "bacteria", { leaders: point.siaCode, topN: "1", pageSize: "1" }, publicationId)?.data?.pointLeaders.find((item) => item.sia === point.siaCode);
  const leaders = pointLeader?.bySet;
  const completeCount = campaign.points.filter((item) => item.completeness === "complete" && item.overall.value !== null).length;
  const withReads = SET_ORDER.filter((set) => point.components[set].totalReads > 0);
  return <ResultsReviewDialog title={`Ficha do ponto ${point.siaCode} · ${point.campaignCode}`} closeLabel="Fechar ficha" onClose={onClose}><div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="type-label text-[var(--ink-soft)]">{point.overall.rank ? `Posição ${point.overall.rank} de ${completeCount} completos` : point.completeness === "unavailable" ? "Sem resultado" : "Parcial · fora do ranking"} · {point.usedSetCount}/3 conjuntos</p>
        <h3 className="heading-font type-section-title text-[var(--brand-navy-strong)]">{point.waterBody || "Manancial não informado"}</h3>
        <p className="type-body">{point.municipality || "Município não informado"} · {point.siaCode}</p>
      </div>
      <div className="text-right"><p className="type-label text-[var(--ink-soft)]">{point.overall.value === null ? "Faixa possível" : "Índice geral"}</p><p className="heading-font type-kpi font-bold tabular-nums" style={{ color: "var(--brand-navy-strong)", borderBottom: point.overall.value === null ? undefined : `4px solid ${continuousResultColor(point.overall.value)}` }}>{point.completeness === "unavailable" ? "Indisponível" : point.overall.value === null ? `${indexText(point.overall.lower)}–${indexText(point.overall.upper)}` : indexText(point.overall.value)}</p></div>
    </header>
    <DomainChips point={point} />
    <dl className="grid grid-cols-3 gap-2">{SET_ORDER.map((set) => <div key={set} className="rounded border border-[var(--line-ghost)] p-2"><dt className="type-caption text-[var(--ink-soft)]">{SET_SHORT[set]}</dt><dd className="font-bold tabular-nums">{point.components[set].totalReads.toLocaleString("pt-BR")} reads</dd>{!point.components[set].included && <dd className="type-caption">não utilizado</dd>}</div>)}</dl>
    {photoUrl && !photoFailed && <button type="button" className="block min-h-11 w-full" aria-label={photoLarge ? "Reduzir foto" : "Ampliar foto de campo"} onClick={() => setPhotoLarge(!photoLarge)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt={`Foto vinculada a ${point.campaignCode} ${point.siaCode}`} onError={() => setPhotoFailed(true)} className={photoLarge ? "max-h-[70vh] w-full object-contain" : "h-36 w-full object-cover"} /><span className="type-label underline">{photoLarge ? "Reduzir foto" : "Ampliar foto de campo"}</span></button>}
    <section className="space-y-2"><h3 className="type-panel-title">Organismos dominantes <span className="type-caption font-normal text-[var(--ink-soft)]">mais reads em cada conjunto · reads · % no conjunto</span></h3>
      {!sourceHash ? <p>Organismos não disponíveis nesta publicação.</p> : !leaders ? <p role="status">Carregando organismos…</p> : <div className="space-y-3">{SET_ORDER.map((set) => <div key={set}><h4 className="type-label font-bold text-[var(--ink-soft)]">{SET_SHORT[set]}</h4>{leaders[set].top.length ? <ol className="mt-1 divide-y divide-[var(--line-ghost)] text-sm">{leaders[set].top.map((row) => <li key={row.taxon} className="grid grid-cols-[minmax(0,1fr)_auto_6rem] items-center gap-3 py-1"><i className="min-w-0 break-words">{row.taxon}</i><span className="tabular-nums">{row.reads.toLocaleString("pt-BR")} · {Math.round(row.reads / leaders[set].reads * 100)}%</span><span aria-hidden="true" className="h-2 bg-[var(--surface-soft)]"><span className="block h-full bg-[var(--brand-teal)]" style={{ width: `${row.reads / leaders[set].reads * 100}%` }} /></span></li>)}</ol> : <p className="type-caption">Sem registros neste conjunto.</p>}</div>)}</div>}
    </section>
    <section className="space-y-2"><h3 className="type-panel-title">Maiores contribuições para o índice <span className="type-caption font-normal text-[var(--ink-soft)]">participação nos reads × score bibliográfico</span></h3>
      {!sourceHash ? <p>Contribuições não disponíveis nesta publicação.</p> : !pointLeader ? <p role="status">Carregando contribuições…</p> : pointLeader.contributors.length ? <ol className="divide-y divide-[var(--line-ghost)] text-sm">{pointLeader.contributors.map((row) => <li key={`${row.set}|${row.taxon}|${row.domain}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1"><span className="min-w-0"><i className="break-words">{row.taxon}</i><span className="type-caption block text-[var(--ink-soft)]">{SET_SHORT[row.set]} · {row.domain.charAt(0).toLocaleUpperCase("pt-BR") + row.domain.slice(1)} · {formatProportionAsPercent(row.share)} dos reads · score {row.score}</span></span><strong className="tabular-nums">{formatNumber(row.q)}</strong></li>)}</ol> : <p className="type-caption">Nenhum organismo com score bibliográfico nos conjuntos usados no cálculo.</p>}
      <p className="type-caption text-[var(--ink-soft)]">Cada valor é a fatia do organismo nos reads do conjunto × a nota da literatura ÷ 3, só nos conjuntos que entraram no cálculo. Organismo sem nota não entra na conta.</p>
      <p><Link className="type-label font-bold text-[var(--brand-navy-strong)] underline underline-offset-4" href={`/resultados/calculos?${new URLSearchParams({ campaignCode: campaign.campaignCode, "filter.sia": point.siaCode })}`}>Ver o cálculo completo deste ponto, passo a passo</Link></p>
    </section>
    {withReads.length > 0 && <section className="rounded border-l-4 border-[var(--brand-teal)] bg-[var(--surface-soft)] p-3"><h3 className="type-panel-title">O que confirmar <span className="type-caption font-normal text-[var(--ink-soft)]">orientação geral do método</span></h3><ul className="mt-1 space-y-1 text-sm">{withReads.map((set) => <li key={set}><strong>{SET_SHORT[set]}:</strong> {CONFIRMATION_GUIDANCE[set]}</li>)}</ul><p className="type-caption mt-2 text-[var(--ink-soft)]">Texto fixo por conjunto; não é recomendação calculada para este ponto nem derivada do índice.</p></section>}
    {publicationId && sourceHash && <ReportActions count={1} identity={`${publicationId}:${sourceHash}:${point.key}`} build={() => buildPointReport({ campaign, publicationId, sourceHash, photos: photoUrl ? { [`${point.campaignCode}|${point.siaCode}`]: photoUrl } : {} }, [point.key])} />}
    <details open={technical} onToggle={(event) => setTechnical(event.currentTarget.open)} className="border-t border-[var(--line-strong)] pt-2"><summary className="min-h-11 cursor-pointer content-center font-bold">Ver detalhes técnicos</summary>{technical && <FichaTechnical point={point} campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} photoAvailable={Boolean(photoUrl && !photoFailed)} />}</details>
  </div></ResultsReviewDialog>;
}

function FichaTechnical({ point, campaign, sourceHash, publicationId, photoAvailable }: { point: ResultPoint; campaign: ResultsCampaign; sourceHash?: string; publicationId?: string; photoAvailable: boolean }) {
  const [set, setSet] = useState<AnalyticalSet>("bacteria");
  const [offset, setOffset] = useState(0);
  const result = useCampaignAnalytics(campaign.campaignCode, sourceHash, set, { sia: point.siaCode, pageSize: "12", taxonOffset: String(offset) }, publicationId);
  const component = point.components[set];
  return <div className="mt-2 space-y-4">
   {campaignLocationIssue(point) ? <p role="status">Localização a conferir: longitude efetiva repete latitude para este SIA. Mantido nos resultados; não plotado e não corrigido por suposição.</p> : <p className="type-metadata">Coordenadas: {point.coordinates ? `${point.coordinates.latitude}, ${point.coordinates.longitude}` : "não informadas"}.</p>}
    {!photoAvailable && <p className="type-metadata">Foto vinculada à campanha e SIA: indisponível.</p>}
    <label className="type-label block">Conjunto consultado<select className={`${campaignControl} ml-2`} value={set} onChange={(event) => { setSet(event.target.value as AnalyticalSet); setOffset(0); }}>{Object.entries(setNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <section className="space-y-2"><h3 className="type-panel-title">Componentes e qualidade</h3><p>{analyticalStatusText(component)} · {component.included ? "utilizado provisoriamente quando a qualidade não está informada" : "não utilizado"}</p><p>{component.totalReads.toLocaleString("pt-BR")} reads · {component.recordCount} registros · {component.reason ?? "Motivo não informado"}</p><table className="w-full text-left text-sm"><thead><tr><th>Domínio</th><th>Componente utilizado (0–1)</th><th>Cobertura bibliográfica</th></tr></thead><tbody>{(["environmental", "operational", "humanHealth"] as const).map((domain) => <tr key={domain}><th>{domain === "environmental" ? "Ambiental" : domain === "operational" ? "Operacional" : "Saúde humana"}</th><td>{indexText(component.used[domain])}</td><td>{component.bibliographicCoverage[domain] === null ? "Não informada" : formatProportionAsPercent(component.bibliographicCoverage[domain]!)}</td></tr>)}</tbody></table></section>
    <section className="space-y-2"><h3 className="type-panel-title">Contexto de campo e origem</h3><p className="type-metadata">O contexto de campo não entra no cálculo do índice. Não há herança de outra campanha ou de ponto homônimo.</p><p>{point.observations || "Observações não informadas."} {point.conditionOfUse}</p>
      {result?.data?.pointMetadata.map((row, index) => <details key={index}><summary className="min-h-11 cursor-pointer">Metadados originais · {row.source.sheet}, linha {row.source.row}</summary><dl className="space-y-2">{Object.entries(withoutVersionFields(row.values)).map(([key, value]) => <div key={key}><dt className="font-bold">{key}</dt><dd className="break-words">{value === null || value === "" ? "Não informado" : String(value)}</dd></div>)}</dl></details>)}
      {!sourceHash && <p>Metadados moleculares detalhados não disponíveis nesta publicação; a prévia não foi carregada automaticamente.</p>}
    </section>
    {sourceHash && <section className="space-y-2"><h3 className="type-panel-title">Organismos e contribuições para Q</h3><p className="type-metadata">q = (reads/N) × (score/3), no mesmo domínio e conjunto. Não são parcelas aditivas do índice geral após logaritmo e média quadrática. Sem score permanece ausente.</p>
{!result?.data ? <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Carregando contribuições…"}</p> : <><p className="type-caption">Role horizontalmente para consultar todas as colunas.</p><div role="region" aria-label="Tabela de contribuições para Q — rolagem horizontal" tabIndex={0} className="max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"><table className="w-full min-w-[42rem] text-left text-sm [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-nowrap"><thead><tr><th>Organismo</th><th>Domínio</th><th>Reads / N</th><th>Score</th><th>q</th></tr></thead><tbody>{result.data.contributions.map((row, index) => <tr key={index} className="border-t border-[var(--line-ghost)]"><th className="py-2 pr-2 font-normal italic">{row.taxon}</th><td>{row.domain}</td><td>{row.reads}/{row.denominator}</td><td>{row.score ?? "Sem score"}</td><td>{row.q === null ? "Não calculado" : formatNumber(row.q)}</td></tr>)}</tbody></table></div><p className="type-caption">{offset + 1}–{Math.min(offset + 12, result.data.contributionsTotal)} de {result.data.contributionsTotal} contribuições taxon/domínio. Ordem da fonte; nenhuma contribuição oculta é retirada de N.</p><button className={campaignControl} disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 12))}>Anteriores</button><button className={`${campaignControl} ml-2`} disabled={offset + 12 >= result.data.contributionsTotal} onClick={() => setOffset(offset + 12)}>Próximas</button><h4 className="font-bold">Maiores reads no conjunto (não biomassa)</h4><ol>{result.data.topReads.map((row) => <li key={row.taxon} className="text-sm"><i>{row.taxon}</i> — {row.reads.toLocaleString("pt-BR")} reads</li>)}</ol></>}
      <CampaignSourceTable campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} section="molecular" set={set} initialSia={point.siaCode} title="Registros e evidências do ponto" />
    </section>}
    <p className="type-metadata">Reads não confirmam abundância, viabilidade nem toxina.</p>
  </div>;
}
