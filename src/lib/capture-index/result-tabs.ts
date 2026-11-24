/** Subabas da página Resultados na captação, na ordem em que aparecem. Módulo comum ao servidor e ao navegador. */
export const captureViews = ["rede", "distribuicao", "campanha", "mapa", "efeitos", "exoticas", "organismos", "ponto"] as const;
/** Subabas que comparam todas as campanhas lado a lado, sem escolher uma. */
export const networkViews: readonly CaptureView[] = ["rede", "distribuicao"];
export type CaptureView = (typeof captureViews)[number];
export const isCaptureView = (value: unknown): value is CaptureView =>
  typeof value === "string" && (captureViews as readonly string[]).includes(value);
