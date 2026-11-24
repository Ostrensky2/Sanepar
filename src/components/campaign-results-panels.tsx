import type { ReactNode } from "react";

/** Moldura das abas Campo e Resultados de uma campanha. Os resultados exibidos são sempre os do
 * índice de captação, metodologia 3.0, por campanha e por ponto. */
export function CampaignResultsPanels({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
