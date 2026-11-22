import {
  captureDomainLabels,
  captureDomains,
  captureIndexMeta,
  captureIndexView,
  type CaptureIndexRow,
} from "./index";
import {
  bands,
  fixedBandIndex,
} from "@/modules/results/components/capture-map-scale";
import { distribution } from "./distribution";

const campaigns = [1, 2, 3] as const;
function histogram(values: (number | null)[]) {
  const bins = bands.map(() => 0);
  let missing = 0;
  for (const value of values) {
    const index = fixedBandIndex(value);
    if (index < 0) missing++;
    else bins[index]++;
  }
  return { bins, missing };
}

function summary(rows: CaptureIndexRow[]) {
  const { sorted, count, p90 } = distribution(rows.map((row) => row.general));
  return {
    total: rows.length,
    measured: count,
    mean: count ? sorted.reduce((sum, n) => sum + n, 0) / count : null,
    p90,
  };
}

export function captureResultViews(
  rows: CaptureIndexRow[],
  campaign?: number,
  sia?: string,
) {
  const groups = campaigns.map((number) =>
    rows.filter((row) => row.campaign === number),
  );
  const common = new Set(
    groups[0].filter((row) => row.general !== null).map((row) => row.sia),
  );
  for (const group of groups.slice(1)) {
    const measured = new Set(
      group.filter((row) => row.general !== null).map((row) => row.sia),
    );
    for (const id of common) if (!measured.has(id)) common.delete(id);
  }
  const network = groups.map((group, i) => ({
    campaign: campaigns[i],
    all: summary(group),
    ...histogram(group.map((row) => row.general)),
    cohort: summary(group.filter((row) => common.has(row.sia))),
  }));
  const selected = groups.find((_, i) => campaigns[i] === campaign) ?? [];
  const point = sia ? selected.find((row) => row.sia === sia) : undefined;
  const categories = captureDomains.map((key) => {
    return {
      name: captureDomainLabels[key],
      ...histogram(selected.map((row) => row.scores[key]?.score ?? null)),
    };
  });
  const markers = (["16S", "COI"] as const).map((name) => ({
    name,
    usable: selected.filter(
      (row) => row.components[name].status === "disponível",
    ).length,
  }));
  return {
    version: captureIndexMeta.version,
    network,
    categories,
    markers,
    points: selected
      .map((row) => row.sia)
      .sort((a, b) => Number(a) - Number(b)),
    point: point ? captureIndexView(point) : null,
    history: sia
      ? groups.map((group, i) => {
          const match = group.find((row) => row.sia === sia);
          return {
            campaign: campaigns[i],
            present: !!match,
            score: match?.general ?? null,
          };
        })
      : [],
  };
}

export type CaptureResultViews = ReturnType<typeof captureResultViews>;
