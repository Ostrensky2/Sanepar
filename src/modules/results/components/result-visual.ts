// Presentation only: these anchors are not risk-class thresholds.
export const RESULT_PALETTE = [
  [0, "#1A9850"], [0.2, "#A6D96A"], [0.4, "#FFD43B"],
  [0.6, "#F46D23"], [0.8, "#D7191C"], [1, "#762A83"],
] as const;

export function continuousResultColor(value: number) {
  if (!Number.isFinite(value)) return "#edf4f7";
  const bounded = Math.max(0, Math.min(1, value));
  const upper = RESULT_PALETTE.findIndex(([anchor]) => anchor >= bounded);
  const [high, highColor] = RESULT_PALETTE[upper];
  const [low, lowColor] = RESULT_PALETTE[Math.max(0, upper - 1)];
  if (bounded === high || high === low) return highColor;
  const ratio = (bounded - low) / (high - low);
  const channels = [1, 3, 5].map((offset) => {
    const from = parseInt(lowColor.slice(offset, offset + 2), 16);
    const to = parseInt(highColor.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * ratio);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
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

export type ResultMarkerVisual = {
  value: number | null;
  lower: number;
  upper: number;
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
  if (count === 3 && result.value !== null && Number.isFinite(result.value)) {
    fill = continuousResultColor(result.value);
  } else if (count > 0 && count < 3) {
    const stops = resultIntervalStops(result.lower, result.upper);
    if (stops.length) {
      const gradient = context.createLinearGradient(x - 10, y, x + 10, y);
      stops.forEach(({ offset, color }) => gradient.addColorStop(offset, color));
      fill = gradient;
    }
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
