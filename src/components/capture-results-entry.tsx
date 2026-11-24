import {
  CaptureResultViewsPanel,
} from "./capture-result-views";
import { isCaptureView, type CaptureView } from "@/lib/capture-index/result-tabs";
import { InvalidCampaignNotice } from "./invalid-campaign-notice";
import { PageHeader } from "./page-header";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";
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
      !isCaptureView(vista)) ||
    (effect !== undefined && !effects.some((item) => item.id === effect)) ||
    (origem !== undefined && origem !== "efeitos" && origem !== "mapa") ||
    (fromCampaign !== undefined &&
      (typeof fromCampaign !== "string" || !/^[123]$/.test(fromCampaign))) ||
    (sia !== undefined && vista !== undefined && vista !== "ponto" && vista !== "mapa")
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
  // Volta para a subaba de onde a ficha foi aberta (Tipos de efeito ou Mapa), na mesma campanha.
  const backParams = new URLSearchParams({
    vista: origin === "efeitos" ? "efeitos" : "mapa",
    campaign: from ?? "",
  });
  if (effect && typeof effect === "string") backParams.set("effect", effect);
  if (id && origin === "mapa") backParams.set("sia", id);
  const back =
    origin && from
      ? `/campanhas/resultados?${backParams}`
      : undefined;
  return (
    <div className="app-container min-w-0 space-y-4">
      <PageHeader
        eyebrow="Monitoramento"
        title="Resultados na captação"
        description="Índice de captação · metodologia 0.8 · por campanha e por ponto."
        help={<ResultsInterpretationHelp title="Como ler os resultados na captação">
          <p>O índice de triagem da biota na captação vai de 0 a 1, em escala fixa. Ele ordena a atenção entre os pontos; não mede probabilidade de dano nem descreve a água tratada.</p>
          <p>Cada campanha (C1 a C3) é calculada à parte, ponto a ponto (SIA). Nenhuma nota passa de uma campanha para outra.</p>
          <p>Zero é nota calculada. “Sem estimativa” indica que há leitura, mas a nota não pode ser afirmada. “Sem medição” indica que não há biblioteca utilizável. Nenhum dos dois é zero.</p>
          <p>Use as subabas: Visão geral, Distribuição, Por campanha, Mapa, Tipos de efeito, Exóticas, Organismos e Por ponto.</p>
        </ResultsInterpretationHelp>}
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
