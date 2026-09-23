/**
 * Campanha em foco compartilhada entre as telas (Campanhas, Diário, Status, Central de dados).
 * A escolha feita em uma tela vale para as demais neste navegador.
 */
export const SELECTED_CAMPAIGN_STORAGE_KEY = "yvae:selected-campaign-id";
export const SELECTED_CAMPAIGN_EVENT = "yvae:selected-campaign-updated";

export function readSelectedCampaignId(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SELECTED_CAMPAIGN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeSelectedCampaignId(campaignId: string) {
  if (typeof window === "undefined" || !campaignId) return;
  try {
    if (window.localStorage.getItem(SELECTED_CAMPAIGN_STORAGE_KEY) === campaignId) return;
    window.localStorage.setItem(SELECTED_CAMPAIGN_STORAGE_KEY, campaignId);
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(SELECTED_CAMPAIGN_EVENT, { detail: campaignId }));
}
