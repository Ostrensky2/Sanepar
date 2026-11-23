"use client";
import { useEffect, useRef, useState } from "react";
import { domainEvidenceRoles, pointLibraryEvidence } from "@/lib/capture-index/point-library-evidence";
import { sampleEffects } from "@/lib/capture-index/sample-effects";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import type { CaptureIndexView } from "@/lib/capture-index";

type Campaign = { campaign: string; number: number; points: number; measured: number; mean: string; median: string; p90: string;
  bands: { band: string; count: number }[]; domains: { label: string; mean: string }[] };
type Payload = {
  meta: { version: string; status: string; rowsSha256: string; fichasTotal: number; blindSpots: { tema: string; caso: string; situacao: string }[]; maturity: { label: string; level: string; text: string }[] };
  campaigns: Campaign[]; rows: CaptureIndexView[];
};
type State = { key: string; status: "loading" } | { key: string; status: "denied"; code: number } | { key: string; status: "error"; code: number } | { key: string; status: "ready"; payload: Payload };
const PAGE = 15;

function normalizedSia(sia: string) {
  return sia.trim().toLowerCase().replace(/^sia[-\s]*/, "").replace(/^0+(?=\d)/, "");
}

function SampleEffects({row, effectId}: {row: CaptureIndexView; effectId?: string}) {
  const items = sampleEffects(row);
  const groups = [
    {label: "Sinais com contribuição documentada", items: items.filter(item => item.contributions.length > 0)},
    {label: "Alertas sem contribuição pontuada", items: items.filter(item => !item.contributions.length && item.alerts.length > 0)},
    {label: "Sem contribuição documentada ou sem avaliação", items: items.filter(item => !item.contributions.length && !item.alerts.length)},
  ];
  return <div aria-label="Tipos metodológicos da amostra" className="divide-y divide-[var(--line-strong)]">
    {groups.map(group => <details key={group.label} open={group.items.some(item => item.effect.id === effectId) || undefined}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{group.label} ({group.items.length})</summary>
      <ul>{group.items.map(({effect, marker, status, contributions, alerts}) => <li key={effect.id} className="py-2">
      <details open={effect.id === effectId || undefined}>
        <summary data-requested={effect.id === effectId || undefined} id={`sample-${row.campaign}-${row.sia}-${effect.id}`} className="scroll-mt-24 min-h-11 cursor-pointer py-2"><strong>{effect.title}</strong> · {status}{alerts.length > 0 && " · alerta de baixo suporte"}</summary>
        <div className="space-y-1 break-words type-metadata">
          <p>{marker && <>Marcador: {marker}. </>}{effect.note}</p>
          {contributions.map(({item, determining}, i) => <p key={i}>{item.taxon} · {item.reads} reads · {determining ? "No componente determinante do domínio" : "Em outro componente observado"} · ficha {item.ficha}.
            {" "}{/^https?:\/\//i.test(item.source) ? <a className="underline" href={item.source} target="_blank" rel="noreferrer">Fonte da ficha {item.ficha}</a> : (item.source || "Fonte não informada.")}</p>)}
          {alerts.map((alert,i) => <p key={i}>Alerta de baixo suporte · {alert.taxon} · {alert.reads} reads · componente registrado: {alert.componentCode} · ficha {alert.ficha}. Sem contribuição do alerta para a nota.</p>)}
        </div>
      </details>
    </li>)}</ul></details>)}
  </div>;
}

function PointLibraries({row}: {row: CaptureIndexView}) {
  const {campaign, sia, libraries} = pointLibraryEvidence(row);
  return <section aria-label={`Bibliotecas de ${campaign} · SIA ${sia}`} className="min-w-0 space-y-2 border-t border-[var(--line-strong)] pt-3">
    <h4 className="type-panel-title">Bibliotecas de {campaign} · SIA {sia}</h4>
    <ul className="space-y-2">{libraries.map(library => <li key={library.name} className="break-words type-metadata">
      <strong>{library.name}</strong> · {library.status} · {library.run}
      <p>Reads observados: {library.observedReads}. Denominador válido: {library.validDenominator ?? "indisponível"}.</p>
      <p>{library.interpretation}</p>
    </li>)}</ul>
    <p className="type-metadata">O cloroplasto é uma leitura da biblioteca 16S. As duas contagens não devem ser somadas.</p>
  </section>;
}

/** Índice de triagem de risco da biota na captação. Os textos chegam prontos da API, os mesmos das exportações.
 * Quatro estados distintos: carregando, sem acesso, falha, e resultado (com ou sem dados na campanha). */
export function CaptureIndexPanel({ campaign, initialSia = "", effectId, returnHref }: { campaign?: number; initialSia?: string; effectId?: string; returnHref?: string }) {
  const key = campaign ? `?campaign=${campaign}` : "";
  const [state, setState] = useState<State>({ key, status: "loading" });
  const [search, setSearch] = useState(initialSia);
  const [openSia, setOpenSia] = useState(normalizedSia(initialSia));
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/results/capture-index${key}`, { cache: "no-store" })
      .then(async (response): Promise<State> => response.ok ? { key, status: "ready", payload: await response.json() as Payload }
        : response.status === 401 || response.status === 403 ? { key, status: "denied", code: response.status } : { key, status: "error", code: response.status })
      .catch((): State => ({ key, status: "error", code: 0 }))
      .then(next => { if (active) setState(next); });
    return () => { active = false; };
  }, [key]);
  const current: State = state.key === key ? state : { key, status: "loading" };
  const destination = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!initialSia || current.status !== "ready") return;
    const section = destination.current;
    const target = (effectId && section?.querySelector<HTMLElement>("summary[id][data-requested]")) || section;
    target?.focus({preventScroll:true});
    target?.scrollIntoView({block:"start", behavior:"instant"});
  }, [current.status, initialSia, effectId]);
  const back = returnHref && <a className="inline-flex min-h-11 items-center font-semibold underline" href={returnHref}>{returnHref.endsWith("tipos-de-efeito") ? "Voltar ao quadro de efeitos da campanha" : "Voltar ao mapa da campanha"}</a>;
  const title = <h2 className="type-panel-title">Índice de triagem de risco da biota na captação</h2>;
  if (current.status === "loading") return <div className="space-y-1">{title}<p role="status">Carregando o índice…</p></div>;
  if (current.status === "denied") return <div className="space-y-1">{title}<p role="alert">Seu perfil não tem acesso a este resultado.</p></div>;
  if (current.status === "error") return <div className="space-y-1">{title}<p role="alert">Não foi possível carregar o índice agora{current.code ? ` (erro ${current.code})` : ""}. Isso é uma falha do sistema, não um resultado.</p></div>;

  const { meta, campaigns, rows } = current.payload;
  const summary = campaigns.find(item => item.number === campaign);
  const exportLink = (format: "csv" | "audit") => `/api/results/capture-index?${new URLSearchParams({ ...(campaign ? { campaign: String(campaign) } : {}), format })}`;
  const wanted = normalizedSia(search);
  const filtered = rows.filter(row => row.campaign === `C${campaign}` && (!wanted || normalizedSia(row.sia) === wanted));
  const sameSia = (sia: string) => <nav aria-label="Mesmo SIA em outras campanhas" className="flex flex-wrap items-center gap-2 type-metadata">
    <span>SIA {sia} por campanha</span>
    {[1, 2, 3].map(number => {
      const params = new URLSearchParams({campaign:String(number), sia});
      if (effectId) params.set("effect", effectId);
      if (returnHref) {
        params.set("origem", returnHref.endsWith("tipos-de-efeito") ? "efeitos" : "mapa");
        const origin = returnHref.match(/campaign=campanha-(\d+)/)?.[1];
        if (origin) params.set("fromCampaign", origin);
      }
      return <a key={number} aria-current={campaign === number ? "page" : undefined} href={`/resultados/indice-captacao?${params}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border font-semibold underline">C{number}</a>;
    })}
  </nav>;
  const visible = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return <div className="space-y-3">
    {title}
    {(!openSia || !filtered.length) && back}
    <p className="type-metadata">Escore de 0 a 1 que ordena a atenção entre os pontos. Não é porcentagem, não é probabilidade de dano e não descreve a água tratada. Versão {meta.version} · {meta.status}.</p>

    <details open={!campaign}><summary className="cursor-pointer">Situação de cada categoria: {meta.maturity.map(item => `${item.label}, ${item.level}`).join(" · ")}</summary>
      <ul className="space-y-1">{meta.maturity.map(item => <li key={item.label} className="type-metadata break-words"><strong>{item.label} ({item.level}).</strong> {item.text}</li>)}</ul>
    </details>

    {campaign && !summary && <div ref={node => { destination.current = node; }} tabIndex={-1} className="scroll-mt-24"><p>Esta campanha ainda não tem dados moleculares no índice.</p>{initialSia && sameSia(normalizedSia(initialSia))}</div>}
    {(campaign ? (summary ? [summary] : []) : campaigns).map(item => <section key={item.campaign} className="rounded border p-3 space-y-1">
      <h3 className="font-semibold">{campaign ? `Rede monitorada na ${item.campaign}` : item.campaign}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div><dt className="type-metadata">Pontos medidos</dt><dd className="type-kpi">{item.measured} de {item.points}</dd></div>
        <div><dt className="type-metadata">Índice geral médio</dt><dd className="type-kpi">{item.mean}</dd></div>
        <div><dt className="type-metadata">Percentil 90 da rede (N={item.measured})</dt><dd className="type-kpi">{item.p90}</dd></div>
        <div><dt className="type-metadata">Mediana</dt><dd className="type-kpi">{item.median}</dd></div>
      </dl>
      {campaign && <p className="type-metadata">Média dos {item.measured} pontos: {item.mean} · Maior índice de um ponto: {formatCaptureIndex(rows.find(row => row.measured)?.exact.general)}</p>}
      <p className="type-metadata">Média por categoria: {item.domains.map(domain => `${domain.label} ${domain.mean}`).join(" · ")}</p>
      <p className="type-metadata">Pontos por intervalo de escore: {item.bands.map(band => `${band.band}: ${band.count}`).join(" · ")}. São intervalos, não classes de risco.</p>
      {!campaign && <p className="type-metadata"><a className="underline" href={`/resultados/indice-captacao?campaign=${item.number}`}>Ver os pontos da {item.campaign}</a></p>}
    </section>)}

    {campaign && summary && <>
      <label className="block">Buscar ponto SIA <input className="mt-1 block min-h-11 w-full max-w-md rounded-lg border border-[var(--line-strong)] px-3" type="search" value={search} onChange={event => { setSearch(event.target.value); setOpenSia(""); setPage(0); }} /></label>
      <p role="status" className="type-metadata">{filtered.length ? `${filtered.length} ${filtered.length === 1 ? "ponto" : "pontos"} · página ${page + 1} de ${Math.ceil(filtered.length / PAGE)}` : "Nenhum ponto corresponde à busca."}</p>
      {!filtered.length && initialSia && search === initialSia && <div ref={node => { destination.current = node; }} tabIndex={-1} className="scroll-mt-24"><p>SIA {normalizedSia(initialSia)} sem registro nesta campanha.</p>{sameSia(normalizedSia(initialSia))}</div>}
      <ul className="space-y-2">{visible.map(row => <li key={row.sia} className="rounded border p-3">
        <details open={openSia === normalizedSia(row.sia)}>
          <summary className="min-h-11 cursor-pointer py-2" onClick={event => {
            event.preventDefault();
            const sia = normalizedSia(row.sia);
            setOpenSia(current => current === sia ? "" : sia);
          }}>
            <span className="font-semibold">SIA {row.sia}</span> · índice geral <strong>{row.general}</strong>
            {row.measured && <> · {row.position} · maior categoria: {row.predominant}</>}
          </summary>
          {openSia === normalizedSia(row.sia) && <section ref={destination} tabIndex={-1} aria-label={`Efeitos da amostra · ${row.campaign} · SIA ${row.sia}`} className="mt-2 min-w-0 scroll-mt-24 space-y-3">
            <CapturePointEvidence row={row} version={meta.version} effectId={effectId}>{sameSia(row.sia)}{back}</CapturePointEvidence>
          </section>}
        </details>
      </li>)}</ul>
      <nav aria-label="Páginas de pontos" className="flex flex-wrap items-center gap-3"><button className="min-h-11 rounded border px-3 disabled:opacity-50" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button> · página {page + 1} de {Math.max(1, Math.ceil(filtered.length / PAGE))} · <button className="min-h-11 rounded border px-3 disabled:opacity-50" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Próxima</button></nav>
    </>}

    <p className="break-words"><a className="inline-flex min-h-11 items-center underline" href={exportLink("csv")}>Exportar para leitura (igual à tela)</a> · <a className="inline-flex min-h-11 items-center underline" href={exportLink("audit")}>Exportar para auditoria (valores sem arredondar e fichas)</a></p>

    <details><summary className="cursor-pointer">O que este índice não enxerga</summary>
      <ul className="space-y-1">{meta.blindSpots.map(item => <li key={item.tema} className="break-words"><strong>{item.tema}.</strong> {item.caso}. {item.situacao}</li>)}</ul>
    </details>
    <details><summary className="cursor-pointer">Como é calculado</summary>
      <div className="space-y-1 type-metadata">
        <p>Cada organismo detectado contribui com a sua participação nos reads válidos da biblioteca × a gravidade do efeito (1 a 3) × a aplicabilidade registrada na ficha (1, 0,5, 0,1 ou 0). A soma passa por uma curva logarítmica e vira a nota da categoria, de 0 a 1.</p>
        <p>Metodologia 0.8. A nota de cada categoria é a do marcador de maior nota entre os utilizáveis. A maior das três notas é o piso do índice geral. Um dano distinto e documentado em outra categoria pode reforçar esse piso; repetir o mesmo dano não reforça. Por isso o índice geral pode ficar acima da maior categoria, e não é a média das três. O número da rede é a média dos pontos da campanha, com um voto por ponto.</p>
        <p>Três estados não se confundem: zero é nota calculada; “sem estimativa” indica que há leitura, mas a nota não pode ser afirmada; “sem medição” indica que não há biblioteca utilizável. Cada campanha é calculada só com os seus próprios dados.</p>
        <p>Organismo ainda sem ficha decidida contribui com zero e reduz a cobertura da curadoria, não a nota. A cobertura diz quanto dos reads já foi avaliado; não diz se a nota está certa. Ocorrência com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta, sem elevar a nota. Zero significa nenhuma contribuição pontuada, não ausência demonstrada de risco.</p>
        <p>Diatomáceas: não há marcador próprio. Elas entram na nota de riscos operacionais só onde há resultado delas, que hoje é a leitura do cloroplasto no 16S, com classificação exploratória feita fora do pipeline do laboratório. Por entupirem filtros pela quantidade, somam como um grupo, e só pontua o que passa da base da rede (2,1% do 16S).</p>
        <p>Assinatura de esgoto: Bacteroides, Bifidobacterium e a família Prevotellaceae, bactérias de intestino, somam como um grupo na categoria de saúde, e só pontua o que passa da base da rede (1,0% do 16S). Indica contaminação fecal, não identifica o patógeno. Escherichia-Shigella alta sem essas bactérias não caracteriza esgoto e aparece em Atenção como possível problema na amostra.</p>
        <p>Todo organismo marinho identificado no COI (raia, tubarão, salmão, ostra, anêmonas, águas-vivas, caranguejos e copépodes de mar, 25 grupos ao todo) foi retirado da leitura e do denominador, porque não tem como ocorrer nas captações. Os reads atribuídos ao mexilhão marinho Perna são tratados como mexilhão-dourado. As contagens retiradas ficam na exportação.</p>
        <p>Espécies exóticas: a presença é listada por ponto, a partir da tabela de exóticas aquáticas do laboratório, e não entra na nota. A categoria de danos ambientais só pontua organismo com dano documentado.</p>
        <p>Dominância fora do padrão: qualquer organismo, com ou sem ficha, que passe de 10% dos reads e de três vezes a sua própria referência na rede (percentil 90 nas três campanhas) aparece em Atenção. Não entra na nota, porque proporção de reads não mede quantidade de organismos.</p>
        <p>Quando há duas corridas da mesma amostra, usa-se o NextSeq e, na falta dele, o MiSeq. {meta.fichasTotal} fichas no cadastro. Identidade da saída: {meta.rowsSha256.slice(0, 16)}…</p>
      </div>
    </details>
  </div>;
}

export function CapturePointEvidence({row, version, effectId, children, compact}: {row: CaptureIndexView; version: string; effectId?: string; children?: React.ReactNode; compact?: boolean}) {
  return <>
            <h3 className="type-panel-title">Efeitos da amostra</h3>
            <p className="type-metadata">{row.campaign} · SIA {row.sia} · Curadoria {version}. Associação documentada, efeito não medido. Uma ficha ausente não demonstra ausência do efeito.</p>
            {!compact && <>
            <p className="type-metadata"><strong>Índice geral: {row.general}</strong> · Marcadores: {row.coverage}.</p>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 type-metadata">{row.domains.map(domain => <div key={domain.key}><dt>{domain.label}</dt><dd className="font-bold tabular-nums">{domain.score}</dd></div>)}</dl>
            </>}
            {row.measured && row.predominant !== "nenhuma contribuição pontuada" && <p className="type-metadata"><strong>Categoria de maior nota:</strong> {row.predominant}. {row.domains.find(domain => domain.label === row.predominant)?.main}</p>}
            <p className="type-metadata">Escala de 0 a 1. O índice não mede probabilidade de dano.</p>
            <section aria-label={`Perfis de risco biológico · ${row.campaign} · SIA ${row.sia}`} className="space-y-1 border-t border-[var(--line-strong)] pt-3">
              <h4 className="type-panel-title">Perfis de risco biológico da captação</h4>
              <ul className="space-y-2 type-metadata">{row.profiles.map(profile => <li key={profile.key} data-profile={profile.key}><strong>{profile.label}: {profile.score}</strong>
                <span className="block">{profile.value === null ? (profile.state === "sem medição" ? "Sem biblioteca utilizável neste ponto e campanha." : "Há leitura, mas a nota não pode ser afirmada. Não é zero.") : profile.effects.length || profile.otherContributions ? <>{profile.effects.map(effect => `${effect.title}${effect.determining ? " (no marcador que definiu a nota)" : ""}`).concat(profile.otherContributions ? [`${profile.otherContributions} outra(s) contribuição(ões) documentada(s)`] : []).join("; ")}.</> : "Nenhum tipo de efeito com contribuição documentada nesta amostra."}</span></li>)}</ul>
              <p className="type-metadata">Perfil desta campanha e deste SIA. Associação documentada nas fichas; o efeito não foi medido.</p>
            </section>
            {children}
            <SampleEffects row={row} effectId={effectId} />
            <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Bases da nota, cobertura e referências</summary>
            {row.measured ? <>
              <p className="type-metadata">Medição: {row.coverage}. Há {row.elevated}.</p>
              <ul className="space-y-3">{row.domains.map(domain => {
                const evidence = domainEvidenceRoles(domain);
                return <li key={domain.key}>
                <strong>{domain.label}: {domain.score}</strong>{domain.maturity !== "com base de comparação" && <span className="type-metadata"> [{domain.maturity}]</span>} <span className="type-metadata">(cobertura da curadoria {domain.confidence}: {domain.evaluated})</span>
                <p className="type-metadata">{evidence.status}</p><span className="type-metadata">{domain.component ? `Determinado por ${domain.component}. ` : ""}{domain.main}{domain.evaluatedBy ? `. Reads avaliados por marcador: ${domain.evaluatedBy}` : ""}</span>
                {domain.contributions.length > 0 && <details className="ml-3"><summary className="cursor-pointer type-metadata">Fichas que formam esta nota ({domain.contributions.length})</summary>
                  <ul className="space-y-1">{evidence.contributions.map(item => <li key={item.ficha + item.taxon} className="type-metadata break-words">
                    {item.role} · {item.taxon} · {item.reads} reads em {item.component} · gravidade {item.severity} · aplicabilidade {item.applicability} · ficha {item.reference.id ?? "não informada"}
                    {item.reference.source && /^https?:\/\//i.test(item.reference.source) ? <> · <a className="underline" href={item.reference.source} target="_blank" rel="noreferrer">Fonte da ficha {item.reference.id ?? "não informada"}</a></> : <> · Fonte: {item.reference.source ?? "não informada"}</>}
                    {item.rationale && <><br />{item.rationale}</>}</li>)}</ul></details>}
              </li>;})}</ul>
            </> : row.state === "sem estimativa" ? <p>Sem estimativa: há leitura neste ponto e campanha, {row.coverage}; a nota 0.8 não pode ser afirmada. Não é um zero.</p> : <p>Sem medição: nenhuma biblioteca utilizável neste ponto e campanha. Não é um zero.</p>}
            <PointLibraries row={row} />
            <p className="type-metadata">No 16S: cloroplasto de algas {row.chloroplast} · diatomáceas {row.diatoms} · cianobactérias {row.cyanobacteria}. As algas são vistas só pelo cloroplasto, com classificação exploratória.{row.coiExcluded ? ` ${row.coiExcluded}.` : ""}</p>
            {row.exotics && <p className="type-metadata break-words">Espécies exóticas presentes (informativo, não entra na nota): {row.exotics}.</p>}
            {row.alerts.length > 0 && <div><p className="font-semibold">Atenção ({row.alerts.length})</p>
              <ul>{row.alerts.map((alert, index) => <li key={index} className="type-metadata break-words">{[alert.taxon, `${alert.reads} reads`, alert.domain, alert.reason].filter(Boolean).join(" · ")}</li>)}</ul></div>}
            </details>
  </>;
}
