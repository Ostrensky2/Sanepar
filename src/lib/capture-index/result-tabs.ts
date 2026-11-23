/** Subabas da página Resultados na captação, na ordem em que aparecem. Módulo comum ao servidor e ao navegador. */
export const captureViews = ["rede", "campanha", "mapa", "efeitos", "exoticas", "ponto"] as const;
export type CaptureView = (typeof captureViews)[number];
export const isCaptureView = (value: unknown): value is CaptureView =>
  typeof value === "string" && (captureViews as readonly string[]).includes(value);
