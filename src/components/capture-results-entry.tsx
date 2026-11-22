import {
  CaptureResultViewsPanel,
  type CaptureView,
} from "./capture-result-views";
import { InvalidCampaignNotice } from "./invalid-campaign-notice";
import { PageHeader } from "./page-header";
import { SectionTabs } from "./section-tabs";
import { campaignFromQuery } from "@/lib/campaign-identity";
import { defaultCampaigns } from "@/lib/campaign-management";
import { effects } from "@/lib/capture-index/effect-catalog";

export type ResultsQuery = Record<string, string | string[] | undefined>;

export function CaptureResultsEntry({
  query,
  path,
}: {
  query: ResultsQuery;
  path: string;
}) {
  const { vista, sia, effect, origem, fromCampaign } = query;
  const identity = campaignFromQuery(query.campaign);
  const campaign = identity
    ? defaultCampaigns.findIndex((item) => item.id === identity.id) + 1
    : undefined;
  const invalid = (
    <InvalidCampaignNotice href={path} label="Voltar à visão da rede" />
  );
  if (
    identity === null ||
    (campaign && campaign > 3) ||
    (sia !== undefined &&
      (!campaign ||
        typeof sia !== "string" ||
        !/^(?:SIA[- ]*)?\d{1,9}$/i.test(sia))) ||
    (vista !== undefined &&
      vista !== "rede" &&
      vista !== "campanha" &&
      vista !== "ponto") ||
    (effect !== undefined && !effects.some((item) => item.id === effect)) ||
    (origem !== undefined && origem !== "efeitos" && origem !== "mapa") ||
    (fromCampaign !== undefined &&
      (typeof fromCampaign !== "string" || !/^[123]$/.test(fromCampaign))) ||
    (sia !== undefined && vista !== undefined && vista !== "ponto")
  )
    return invalid;
  const view: CaptureView =
    (vista as CaptureView | undefined) ??
    (sia ? "ponto" : campaign ? "campanha" : "rede");
  const id =
    typeof sia === "string"
      ? String(Number(sia.replace(/^SIA[- ]*/i, "")))
      : undefined;
  const origin = typeof origem === "string" ? origem : undefined;
  const from =
    typeof fromCampaign === "string"
      ? fromCampaign
      : origin && campaign
        ? String(campaign)
        : undefined;
  const backParams = new URLSearchParams({
    painel: "operacional",
    campaign: from ?? "",
  });
  if (effect && typeof effect === "string") backParams.set("effect", effect);
  if (id && origin === "mapa") backParams.set("sia", id);
  const back =
    origin && from
      ? `/campanhas/resultados?${backParams}#${origin === "efeitos" ? "tipos-de-efeito" : "results-index-dashboard"}`
      : undefined;
  return (
    <div className="app-container min-w-0 space-y-4">
      <PageHeader
        eyebrow="Monitoramento"
        title="Resultados na captação"
        description="Índice de triagem da biota na captação · campanhas C1 a C3. O escore varia de 0 a 1 e não mede probabilidade de dano."
        tabs={<SectionTabs />}
      />
      <CaptureResultViewsPanel
        path={path}
        view={view}
        campaign={campaign}
        sia={id}
        effect={typeof effect === "string" ? effect : undefined}
        origin={origin}
        from={from}
        back={back}
      />
    </div>
  );
}
