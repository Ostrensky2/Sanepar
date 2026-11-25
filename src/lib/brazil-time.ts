/**
 * Data e hora "de Curitiba" para o que roda no servidor.
 *
 * O servidor de produção trabalha em UTC: depois das 21h o dia em UTC já virou, e
 * datas montadas lá (padrão de um registro novo, data de um documento enviado,
 * nome de arquivo) saíam com o dia seguinte. No celular vale o relógio do aparelho
 * (lib/collection-capture); aqui é o mesmo relógio, fixado no fuso do Paraná.
 */
export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

/** AAAA-MM-DD do dia em Curitiba. */
export function brazilIsoDate(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
