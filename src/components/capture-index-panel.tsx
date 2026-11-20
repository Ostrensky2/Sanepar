"use client";
import { useEffect, useState } from "react";
import type { CaptureIndexView } from "@/lib/capture-index";

type Campaign = { campaign: string; number: number; points: number; measured: number; mean: string; median: string; p90: string;
  bands: { band: string; count: number }[]; domains: { label: string; mean: string }[] };
type Payload = {
  meta: { version: string; status: string; rowsSha256: string; fichasTotal: number; blindSpots: { tema: string; caso: string; situacao: string }[]; maturity: { label: string; level: string; text: string }[] };
  campaigns: Campaign[]; rows: CaptureIndexView[];
};
type State = { key: string; status: "loading" } | { key: string; status: "denied"; code: number } | { key: string; status: "error"; code: number } | { key: string; status: "ready"; payload: Payload };
const PAGE = 15;

/** Índice de triagem de risco da biota na captação. Os textos chegam prontos da API, os mesmos das exportações.
 * Quatro estados distintos: carregando, sem acesso, falha, e resultado (com ou sem dados na campanha). */
export function CaptureIndexPanel({ campaign }: { campaign?: number }) {
  const key = campaign ? `?campaign=${campaign}` : "";
  const [state, setState] = useState<State>({ key, status: "loading" });
  const [search, setSearch] = useState("");
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
  const title = <h2 className="type-panel-title">Índice de triagem de risco da biota na captação</h2>;
  if (current.status === "loading") return <div className="space-y-1">{title}<p role="status">Carregando o índice…</p></div>;
  if (current.status === "denied") return <div className="space-y-1">{title}<p role="alert">Seu perfil não tem acesso a este resultado.</p></div>;
  if (current.status === "error") return <div className="space-y-1">{title}<p role="alert">Não foi possível carregar o índice agora{current.code ? ` (erro ${current.code})` : ""}. Isso é uma falha do sistema, não um resultado.</p></div>;

  const { meta, campaigns, rows } = current.payload;
  const summary = campaigns.find(item => item.number === campaign);
  const exportLink = (format: "csv" | "audit") => `/api/results/capture-index?${new URLSearchParams({ ...(campaign ? { campaign: String(campaign) } : {}), format })}`;
  const wanted = search.trim().toLowerCase();
  const filtered = rows.filter(row => !wanted || row.sia.toLowerCase().includes(wanted));
  const visible = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return <div className="space-y-3">
    {title}
    <p className="type-metadata">Escore de 0 a 1 que ordena a atenção entre os pontos. Não é porcentagem, não é probabilidade de dano e não descreve a água tratada. Versão {meta.version} · {meta.status}.</p>

    <details open={!campaign}><summary className="cursor-pointer">Situação de cada categoria: {meta.maturity.map(item => `${item.label}, ${item.level}`).join(" · ")}</summary>
      <ul className="space-y-1">{meta.maturity.map(item => <li key={item.label} className="type-metadata break-words"><strong>{item.label} ({item.level}).</strong> {item.text}</li>)}</ul>
    </details>

    {campaign && !summary && <p>Esta campanha ainda não tem dados moleculares no índice.</p>}
    {(campaign ? (summary ? [summary] : []) : campaigns).map(item => <section key={item.campaign} className="rounded border p-3 space-y-1">
      <h3 className="font-semibold">{campaign ? `Rede monitorada na ${item.campaign}` : item.campaign}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div><dt className="type-metadata">Pontos medidos</dt><dd className="type-kpi">{item.measured} de {item.points}</dd></div>
        <div><dt className="type-metadata">Índice geral médio</dt><dd className="type-kpi">{item.mean}</dd></div>
        <div><dt className="type-metadata">Percentil 90</dt><dd className="type-kpi">{item.p90}</dd></div>
        <div><dt className="type-metadata">Mediana</dt><dd className="type-kpi">{item.median}</dd></div>
      </dl>
      <p className="type-metadata">Média por categoria: {item.domains.map(domain => `${domain.label} ${domain.mean}`).join(" · ")}</p>
      <p className="type-metadata">Pontos por intervalo de escore: {item.bands.map(band => `${band.band}: ${band.count}`).join(" · ")}. São intervalos, não classes de risco.</p>
      {!campaign && <p className="type-metadata"><a className="underline" href={`/resultados/indice-captacao?campaign=${item.number}`}>Ver os pontos da {item.campaign}</a></p>}
    </section>)}

    {campaign && summary && <>
      <label className="block">Buscar ponto SIA <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      <ul className="space-y-2">{visible.map(row => <li key={row.sia} className="rounded border p-3">
        <details>
          <summary className="cursor-pointer">
            <span className="font-semibold">SIA {row.sia}</span> · índice geral <strong>{row.general}</strong>
            {row.measured && <> · {row.position} · determinado por: {row.predominant}</>}
          </summary>
          <div className="mt-2 space-y-2">
            {row.measured ? <>
              <p className="type-metadata">Cenários das fichas cadastradas, do piso (só evidência plena) ao teto (fichas ainda indeterminadas com peso cheio): {row.range}. O teto não inclui efeitos que o cadastro ainda não conhece. Medição: {row.coverage}. Há {row.elevated}.</p>
              <ul className="space-y-1">{row.domains.map(domain => <li key={domain.key}>
                <strong>{domain.label}: {domain.score}</strong>{domain.maturity !== "com base de comparação" && <span className="type-metadata"> [{domain.maturity}]</span>} <span className="type-metadata">(piso a teto {domain.range}; cobertura da curadoria {domain.confidence}: {domain.evaluated})</span>
                <br /><span className="type-metadata">{domain.component ? `Determinado por ${domain.component}. ` : ""}{domain.main}{domain.evaluatedBy ? `. Reads avaliados por marcador: ${domain.evaluatedBy}` : ""}</span>
                {domain.contributions.length > 0 && <details className="ml-3"><summary className="cursor-pointer type-metadata">Fichas que formam esta nota ({domain.contributions.length})</summary>
                  <ul className="space-y-1">{domain.contributions.map(item => <li key={item.ficha + item.taxon} className="type-metadata break-words">
                    {item.taxon} · {item.reads} reads em {item.component} · gravidade {item.severity} · aplicabilidade {item.applicability} · ficha {item.ficha}
                    {item.source.startsWith("http") && <> · <a className="underline" href={item.source} target="_blank" rel="noreferrer">fonte</a></>}
                    {item.rationale && <><br />{item.rationale}</>}</li>)}</ul></details>}
              </li>)}</ul>
            </> : <p>Sem medição: nenhuma biblioteca utilizável neste ponto e campanha. Não é um zero.</p>}
            <p className="type-metadata break-words">Bibliotecas: {row.components.map(item => `${item.name}: ${item.status}, ${item.run}, ${item.observedReads} reads observados`).join(" · ")}</p>
            <p className="type-metadata">No 16S: cloroplasto de algas {row.chloroplast} · diatomáceas {row.diatoms} · cianobactérias {row.cyanobacteria}. As algas são vistas só pelo cloroplasto, com classificação exploratória.{row.coiExcluded ? ` ${row.coiExcluded}.` : ""}</p>
            {row.exotics && <p className="type-metadata break-words">Espécies exóticas presentes (informativo, não entra na nota): {row.exotics}.</p>}
            {row.alerts.length > 0 && <div><p className="font-semibold">Atenção ({row.alerts.length})</p>
              <ul>{row.alerts.map((alert, index) => <li key={index} className="type-metadata break-words">{[alert.taxon, `${alert.reads} reads`, alert.domain, alert.reason].filter(Boolean).join(" · ")}</li>)}</ul></div>}
          </div>
        </details>
      </li>)}</ul>
      {filtered.length === 0 && <p>Nenhum ponto corresponde à busca.</p>}
      <div><button disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button> · página {page + 1} de {Math.max(1, Math.ceil(filtered.length / PAGE))} · <button disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Próxima</button></div>
    </>}

    <p className="break-words"><a className="underline" href={exportLink("csv")}>Exportar para leitura (igual à tela)</a> · <a className="underline" href={exportLink("audit")}>Exportar para auditoria (valores sem arredondar e fichas)</a></p>

    <details><summary className="cursor-pointer">O que este índice não enxerga</summary>
      <ul className="space-y-1">{meta.blindSpots.map(item => <li key={item.tema} className="break-words"><strong>{item.tema}.</strong> {item.caso}. {item.situacao}</li>)}</ul>
    </details>
    <details><summary className="cursor-pointer">Como é calculado</summary>
      <div className="space-y-1 type-metadata">
        <p>Cada organismo detectado contribui com a sua participação nos reads válidos da biblioteca × a gravidade do efeito (1 a 3) × a aplicabilidade registrada na ficha (1, 0,5, 0,1 ou 0). A soma passa por uma curva logarítmica e vira a nota da categoria, de 0 a 1.</p>
        <p>A nota de cada categoria é a maior entre os marcadores utilizáveis. O índice geral do ponto é a maior das três notas: o sinal que mais merece atenção ali. O número da rede é a média dos pontos, com um voto por ponto.</p>
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
