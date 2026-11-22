// Faixas de leitura do índice de captação (IR-CAPTACAO). São faixas de triagem, fixas entre campanhas, não classes de risco.
// A faixa mais baixa é cinza de propósito: "sem sinal relevante" não é "bom". O índice só pontua organismo com efeito documentado,
// então silêncio não demonstra segurança.
export const RESULT_BANDS = [
  { from: 0, to: 0.05, label: "Sinal muito baixo", range: "abaixo de 0,05", color: "#C5CCD3" },
  { from: 0.05, to: 0.15, label: "Sinal fraco", range: "0,05 a 0,15", color: "#F2C94C" },
  { from: 0.15, to: 0.35, label: "Atenção", range: "0,15 a 0,35", color: "#F2994A" },
  { from: 0.35, to: 0.7, label: "Prioridade", range: "0,35 a 0,70", color: "#D7263D" },
  // Reservada: nenhuma observação de C1 a C3 chega aqui (máximo 0,69). Existe para situações piores que as já vistas.
  { from: 0.7, to: 1, label: "Prioridade máxima", range: "0,70 ou mais", color: "#762A83" },
] as const;

/** Âncoras da cor, para quem desenha um intervalo: a cor muda em degraus nos limites das faixas. */
export const RESULT_PALETTE = [
  ...RESULT_BANDS.map((band) => [band.from, band.color] as const), [1, RESULT_BANDS[RESULT_BANDS.length - 1].color] as const,
] as const;

export function resultBand(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return [...RESULT_BANDS].reverse().find((band) => bounded >= band.from) ?? RESULT_BANDS[0];
}

/** Cor do índice: uma cor por faixa (o nome da função ficou do degradê anterior). */
export function continuousResultColor(value: number) {
  if (!Number.isFinite(value)) return "#edf4f7";
  return resultBand(value).color;
}

export function resultIntervalStops(lower: number, upper: number) {
  const low = Math.max(0, Math.min(1, lower));
  const high = Math.max(low, Math.min(1, upper));
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [];
  if (low === high) return [{ offset: 0, color: continuousResultColor(low) }, { offset: 1, color: continuousResultColor(high) }];
  return [
    { offset: 0, color: continuousResultColor(low) },
    ...RESULT_PALETTE.filter(([value]) => value > low && value < high)
      .map(([value, color]) => ({ offset: (value - low) / (high - low), color })),
    { offset: 1, color: continuousResultColor(high) },
  ];
}

/** São duas perguntas diferentes: qual foi o sinal encontrado (a cor) e quanto da amostra foi possível interpretar (o contorno).
 * Cobertura limitada = menos de 20% dos reads do ponto pertencem a organismos já avaliados. Vale para qualquer nota:
 * um ponto pode ter sinal forte e, ainda assim, muita coisa desconhecida. É lacuna de conhecimento, não probabilidade de risco. */
export const LIMITED_COVERAGE = 0.2;
export function hasLimitedCoverage(coverage: number | null | undefined) {
  return typeof coverage === "number" && Number.isFinite(coverage) && coverage < LIMITED_COVERAGE;
}

export type ResultMarkerVisual = {
  value: number | null;
  lower: number;
  upper: number;
  /** true quando a cobertura da avaliação é limitada (ver hasLimitedCoverage): contorno tracejado. */
  limitedCoverage?: boolean;
  included: readonly [boolean, boolean, boolean];
};

export function drawResultMarker(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  result: ResultMarkerVisual,
  selected = false,
) {
  const count = result.included.filter(Boolean).length;
  context.save();
  context.setLineDash([]);
  // White separation remains visible over every base-map color.
  context.beginPath();
  context.arc(x, y, selected ? 21 : 17, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  if (selected) {
    context.strokeStyle = "#17354c";
    context.lineWidth = 2;
    context.stroke();
  }

  let fill: string | CanvasGradient = "#edf4f7";
  if (count > 0 && result.value !== null && Number.isFinite(result.value)) {
    // Há nota calculada: a cor é a da faixa, com dois ou três marcadores. O selo k/3 informa quais foram usados.
    fill = continuousResultColor(result.value);
  } else if (count > 0 && count < 3) {
    const stops = resultIntervalStops(result.lower, result.upper);
    if (stops.length) {
      const gradient = context.createLinearGradient(x - 10, y, x + 10, y);
      stops.forEach(({ offset, color }) => gradient.addColorStop(offset, color));
      fill = gradient;
    }
  }
  if (count > 0 && result.limitedCoverage) {
    // Contorno tracejado por fora do anel: pouco do que havia na amostra pôde ser avaliado.
    context.beginPath();
    context.arc(x, y, selected ? 23.5 : 19.5, 0, Math.PI * 2);
    context.setLineDash([3, 3]);
    context.strokeStyle = "#17354c";
    context.lineWidth = 1.5;
    context.stroke();
    context.setLineDash([]);
  }
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = "#17354c";
  context.lineWidth = 0.75;
  context.stroke();

  // Fixed order: top bacteria, bottom-right cyanobacteria, bottom-left COI.
  result.included.forEach((included, index) => {
    const middle = -Math.PI / 2 + index * Math.PI * 2 / 3;
    const start = middle - Math.PI / 3 + 0.10;
    const end = middle + Math.PI / 3 - 0.10;
    context.beginPath();
    context.arc(x, y, 16, start, end);
    context.arc(x, y, 12, end, start, true);
    context.closePath();
    context.fillStyle = included ? "#17354c" : "#ffffff";
    context.fill();
    context.strokeStyle = "#17354c";
    context.lineWidth = 1;
    context.stroke();
  });
  if (count < 3) {
    context.fillStyle = "#ffffff";
    context.fillRect(x - 13, y + 17, 26, 16);
    context.strokeStyle = "#17354c";
    context.lineWidth = 1;
    context.strokeRect(x - 13, y + 17, 26, 16);
    context.fillStyle = "#17354c";
    context.font = "bold 12px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${count}/3`, x, y + 25);
  }
  context.restore();
}
