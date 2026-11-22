"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bands } from "@/modules/results/components/capture-map-scale";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import type { CaptureResultViews } from "@/lib/capture-index/views";
import { CapturePointEvidence } from "./capture-index-panel";
import { PointMediaGallery } from "@/modules/results/components/point-media-gallery";

const labels = {
  rede: "Visão geral da rede",
  campanha: "Por campanha",
  ponto: "Por ponto",
} as const;
export type CaptureView = keyof typeof labels;
const action =
  "inline-flex min-h-11 items-center rounded-md px-3 font-semibold text-[var(--brand-navy-strong)] underline focus-visible:outline-2";
const control =
  "block min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3";
const cell = "px-2 py-2 text-left align-top tabular-nums";
const frame = "app-card min-w-0 space-y-4 p-4 sm:p-6";

function Score({ value }: { value: number | null }) {
  return (
    <span className="block tabular-nums">
      <strong>{formatCaptureIndex(value)}</strong>
      {value !== null && (
        <span
          aria-hidden="true"
          className="mt-1 block h-1.5 max-w-40 overflow-hidden rounded bg-[var(--surface-soft)]"
        >
          <span
            className="block h-full bg-[var(--brand-navy)]"
            style={{ width: `${value * 100}%` }}
          />
        </span>
      )}
    </span>
  );
}

function DistributionChart({
  rows,
  title,
}: {
  rows: { name: string; bins: number[]; missing: number }[];
  title: string;
}) {
  const legend = [
    ...bands,
    { label: "Sem medição", color: "var(--line-strong)" },
  ];
  return (
    <figure className="space-y-3">
      <figcaption className="type-panel-title">{title}</figcaption>
      <p className="type-metadata">
        Cada barra representa 100% dos pontos registrados na linha. As faixas
        mostram escores, não classes de risco.
      </p>
      {rows.map((row) => {
        const counts = [...row.bins, row.missing],
          n = counts.reduce((sum, x) => sum + x, 0);
        return (
          <div key={row.name}>
            <p className="type-label">
              {row.name} · N={n}
            </p>
            <div
              aria-hidden="true"
              className="flex h-5 overflow-hidden rounded-sm border border-[var(--line-strong)]"
            >
              {counts.map((count, i) => (
                <span
                  key={i}
                  style={{
                    width: `${n ? (100 * count) / n : 0}%`,
                    backgroundColor: legend[i].color,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 type-metadata">
        {legend.map((item) => (
          <li key={item.label}>
            <span
              aria-hidden="true"
              className="mr-1 inline-block size-3 rounded-sm border border-[var(--line-strong)]"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          Consultar a distribuição em tabela
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full type-metadata">
            <caption className="sr-only">{title} · número de pontos</caption>
            <thead>
              <tr>
                <th className={cell} scope="col">
                  Intervalo
                </th>
                {rows.map((row) => (
                  <th className={cell} scope="col" key={row.name}>
                    {row.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {legend.map((item, i) => (
                <tr
                  key={item.label}
                  className="border-t border-[var(--line-strong)]"
                >
                  <th className={cell} scope="row">
                    {item.label}
                  </th>
                  {rows.map((row) => (
                    <td className={cell} key={row.name}>
                      {row.bins[i] ?? row.missing}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Network({ data }: { data: CaptureResultViews }) {
  return (
    <section className={frame}>
      <h2 className="type-section-title">Comparação da rede</h2>
      <p>
        Compare a média e o percentil 90 (P90) do índice geral na escala fixa de
        0 a 1. Cada ponto medido tem o mesmo peso. O P90 usa a posição
        arredondada para cima, sem interpolação. Zero é uma nota calculada. Pontos sem medição ficam fora da média e do P90.
      </p>
      <DistributionChart
        title="Distribuição do índice geral por campanha"
        rows={data.network.map((row) => ({ ...row, name: "C" + row.campaign }))}
      />
      {(["all", "cohort"] as const).map((scope) => (
        <table className="w-full border-collapse type-metadata" key={scope}>
          <caption className="pb-2 text-left">
            <strong className="type-panel-title">
              {scope === "all"
                ? "Rede medida em cada campanha"
                : "Mesmos pontos nas três campanhas"}
            </strong>
            <span className="block">
              {scope === "all"
                ? "N medidos / registrados. A composição pode variar entre campanhas."
                : "Coorte comum de SIAs com índice medido em C1, C2 e C3. A cobertura dos marcadores pode variar."}
            </span>
          </caption>
          <thead>
            <tr>
              {["Campanha", "N", "Média", "P90"].map((label) => (
                <th scope="col" className={cell} key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.network.map((row) => (
              <tr
                key={row.campaign}
                className="border-t border-[var(--line-strong)]"
              >
                <th scope="row" className={cell}>
                  C{row.campaign}
                </th>
                <td className={cell}>
                  {row[scope].measured}
                  {scope === "all" && ` / ${row.all.total}`}
                </td>
                <td className={cell}>
                  <Score value={row[scope].mean} />
                </td>
                <td className={cell}>
                  <Score value={row[scope].p90} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  );
}

function Campaign({
  data,
  number,
}: {
  data: CaptureResultViews;
  number: number;
}) {
  return (
    <section className={frame}>
      <h2 className="type-section-title">
        Distribuição dos escores · C{number}
      </h2>
      <p>
        Contagem de pontos por intervalo, na escala de 0 a 1. Cada linha
        representa uma categoria. A barra usa como denominador os{" "}
        {data.points.length} pontos registrados.
      </p>
      <DistributionChart
        title="Distribuição por categoria"
        rows={data.categories}
      />
      <h3 className="type-panel-title">Cobertura por marcador</h3>
      <ul>
        {data.markers.map((m) => (
          <li key={m.name}>
            <strong>{m.name}</strong> · biblioteca utilizável em {m.usable} de{" "}
            {data.points.length} pontos.
          </li>
        ))}
      </ul>
      <p className="type-metadata">
        O cloroplasto é uma leitura do 16S. Zero é uma nota calculada. Sem
        medição indica ausência de biblioteca utilizável.
      </p>
    </section>
  );
}

type Props = {
  path: string;
  view: CaptureView;
  campaign?: number;
  sia?: string;
  effect?: string;
  origin?: string;
  from?: string;
  back?: string;
};
export function CaptureResultViewsPanel({
  path,
  view,
  campaign,
  sia,
  effect,
  origin,
  from,
  back,
}: Props) {
  const router = useRouter();
  // Older links addressed a map or disclosure by fragment, which the server cannot read.
  useEffect(() => {
    if (path !== "/campanhas/resultados") return;
    function restoreFragment() {
      const url = new URL(window.location.href);
      if (
        !/^#(?:results-index-dashboard|tipos-de-efeito|exoticas|consulta-por-sia|detalhe-sia-c[1-3])$/.test(
          url.hash,
        )
      )
        return;
      url.searchParams.set("painel", "operacional");
      router.replace(url.pathname + url.search + url.hash);
    }
    restoreFragment();
    window.addEventListener("hashchange", restoreFragment);
    return () => window.removeEventListener("hashchange", restoreFragment);
  }, [path, router]);
  function href(next: CaptureView, number = campaign, point?: string) {
    const q = new URLSearchParams({ vista: next });
    if (number) q.set("campaign", String(number));
    if (point && next === "ponto") q.set("sia", point);
    if (effect) q.set("effect", effect);
    if (origin) q.set("origem", origin);
    if (from) q.set("fromCampaign", from);
    return path + "?" + q;
  }
  const query = new URLSearchParams({ format: "views" });
  if (campaign && view !== "rede") query.set("campaign", String(campaign));
  if (sia && view === "ponto") query.set("sia", sia);
  const url = "/api/results/capture-index?" + query;
  const [state, setState] = useState<{
    url: string;
    data?: CaptureResultViews;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            [401, 403].includes(response.status)
              ? "Seu perfil não tem acesso a este resultado."
              : "Não foi possível carregar os resultados.",
          );
        const data: CaptureResultViews = await response.json();
        if (!controller.signal.aborted) setState({ url, data });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ url, error: error.message });
      });
    return () => controller.abort();
  }, [url]);
  const data = state?.url === url ? state.data : undefined;
  return (
    <div className="min-w-0 space-y-4">
      <nav
        aria-label="Vistas de resultados"
        className="flex flex-wrap gap-1 border-b border-[var(--line-strong)]"
      >
        {(Object.keys(labels) as CaptureView[]).map((key) => (
          <Link
            key={key}
            aria-current={view === key ? "page" : undefined}
            className={
              action + (view === key ? " bg-[var(--surface-soft)]" : "")
            }
            href={href(key, campaign, key === "ponto" ? sia : undefined)}
          >
            {labels[key]}
          </Link>
        ))}
      </nav>
      {back && (
        <Link href={back} className={action}>
          Voltar {origin === "efeitos" ? "ao quadro de efeitos" : "ao mapa"} da
          campanha
        </Link>
      )}
      {view !== "rede" && (
        <label className="block max-w-md type-label">
          Campanha
          <select
            value={campaign ?? ""}
            className={control}
            onChange={(event) =>
              router.push(
                href(
                  view,
                  Number(event.target.value),
                  view === "ponto" ? sia : undefined,
                ),
              )
            }
          >
            <option value="" disabled>
              Escolha uma campanha
            </option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                Campanha {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {state?.url === url && state.error ? (
        <p role="alert">{state.error}</p>
      ) : !data ? (
        <p role="status">Carregando resultados…</p>
      ) : view === "rede" ? (
        <Network data={data} />
      ) : !campaign ? (
        <p role="status">Escolha a campanha que deseja consultar.</p>
      ) : (
        <>
          {view === "campanha" ? (
            <>
              <Campaign data={data} number={campaign} />
              <Link className={action} href={href("ponto")}>
                Consultar detalhe por ponto na C{campaign}
              </Link>
            </>
          ) : (
            <>
              <label className="block max-w-md type-label">
                Ponto de monitoramento
                <select
                  className={control}
                  value={sia && data.points.includes(sia) ? sia : ""}
                  onChange={(event) =>
                    router.push(href("ponto", campaign, event.target.value))
                  }
                >
                  <option value="" disabled>
                    Selecione o SIA
                  </option>
                  {data.points.map((id) => (
                    <option key={id} value={id}>
                      SIA {id}
                    </option>
                  ))}
                </select>
              </label>
              {!sia ? (
                <p role="status">
                  Escolha um SIA da campanha para abrir sua ficha.
                </p>
              ) : (
                <>
                  {data.point ? (
                    <section className={frame}>
                      <h2 className="type-section-title">
                        Ficha do ponto · SIA {sia} · C{campaign}
                      </h2>
                      <CapturePointEvidence
                        row={data.point}
                        version={data.version}
                        effectId={effect}
                      />
                      <PointMediaGallery
                        key={campaign + "-" + sia}
                        campaign={campaign}
                        sia={sia}
                      />
                    </section>
                  ) : (
                    <p role="status">SIA {sia} sem registro nesta campanha.</p>
                  )}
                  <section className={frame}>
                    <h2 className="type-section-title">
                      Histórico do SIA {sia}
                    </h2>
                    <p>Índice geral do mesmo ponto na escala de 0 a 1.</p>
                    <table className="w-full type-metadata">
                      <thead>
                        <tr>
                          <th className={cell}>Campanha</th>
                          <th className={cell}>Índice geral</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.map((row) => (
                          <tr key={row.campaign}>
                            <th scope="row" className={cell}>
                              <Link
                                className={action}
                                href={href("ponto", row.campaign, sia)}
                              >
                                C{row.campaign}
                              </Link>
                            </th>
                            <td className={cell}>
                              {row.present ? (
                                <Score value={row.score} />
                              ) : (
                                "Sem registro"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          className={action}
          href={
            "/api/results/capture-index?format=csv" +
            (campaign ? "&campaign=" + campaign : "")
          }
        >
          Exportar para leitura
        </a>
        <a
          className={action}
          href={
            "/api/results/capture-index?format=audit" +
            (campaign ? "&campaign=" + campaign : "")
          }
        >
          Exportar para auditoria
        </a>
        <Link
          className={action}
          href={
            "/campanhas/resultados?painel=operacional" +
            (campaign ? "&campaign=" + campaign : "")
          }
        >
          Mapa e exportações da campanha
        </Link>
        {campaign && (
          <Link
            className={action}
            href={`/campanhas/resultados?painel=operacional&campaign=${campaign}${effect ? "&effect="+encodeURIComponent(effect) : ""}#tipos-de-efeito`}
          >
            Indicadores por tipo de efeito · C{campaign}
          </Link>
        )}
        <Link className={action} href="/resultados/calculos">
          Consultar método e limites
        </Link>
      </div>
    </div>
  );
}
