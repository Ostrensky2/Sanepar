import { Check } from "lucide-react";

export type MetabarcodingStageStatus = "done" | "inprogress" | "pending";

export type MetabarcodingStage = {
  label: string;
  status: MetabarcodingStageStatus;
  plannedDate?: string;
  completedDate?: string;
  note?: string;
};

const DEFAULT_STAGES: MetabarcodingStage[] = [
  { label: "Coleta de amostras", status: "done" },
  { label: "Extração de DNA", status: "done" },
  { label: "Amplificação por PCR", status: "done" },
  { label: "Preparação p/ sequenciamento", status: "done" },
  { label: "Sequenciamento", status: "done" },
  { label: "Processamento bioinformático", status: "inprogress" },
  { label: "Atribuição taxonômica", status: "pending" },
  { label: "Análise estatística ecológica", status: "pending" },
];

export const METABARCODING_STAGE_COLORS: Record<MetabarcodingStageStatus, string> = {
  done: "#16a34a",
  inprogress: "#facc15",
  pending: "#dc2626",
};

export function MetabarcodingStagesIndicator({
  stages = DEFAULT_STAGES,
  title = "Processo de análise por metabarcoding",
  progress,
}: {
  stages?: MetabarcodingStage[];
  title?: string;
  progress?: number;
}) {
  const normalizedProgress =
    typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : null;

  return (
    <section className="glass-panel radius-panel p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Status do processo
          </p>
          <h2 className="heading-font text-xl font-bold tracking-tight text-[var(--brand-navy-strong)]">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {normalizedProgress !== null ? (
            <span className="rounded-full border border-[var(--line-ghost)] bg-white/80 px-3 py-1.5 text-caption font-black uppercase tracking-[0.14em] text-[var(--brand-navy-strong)] shadow-[0_10px_24px_-20px_rgba(0,66,98,0.35)]">
              Andamento {normalizedProgress}%
            </span>
          ) : null}
          <StageLegend />
        </div>
      </header>

      <ol
        className="grid gap-0 overflow-x-auto pb-2"
        style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(84px, 1fr))` }}
      >
        {stages.map((stage, index) => {
          const next = stages[index + 1];
          return (
            <StageNode
              key={`${stage.label}-${index}`}
              stage={stage}
              index={index + 1}
              nextStatus={next?.status}
              isLast={index === stages.length - 1}
            />
          );
        })}
      </ol>
    </section>
  );
}

function StageNode({
  stage,
  index,
  nextStatus,
  isLast,
}: {
  stage: MetabarcodingStage;
  index: number;
  nextStatus?: MetabarcodingStageStatus;
  isLast: boolean;
}) {
  const fill = METABARCODING_STAGE_COLORS[stage.status];
  const connectorColor =
    nextStatus === "done"
      ? METABARCODING_STAGE_COLORS.done
      : stage.status === "done"
        ? METABARCODING_STAGE_COLORS.done
        : "#cbd5e1";

  return (
    <li className="relative flex flex-col items-center text-center">
      {!isLast ? (
        <span
          aria-hidden
          className="absolute top-5 left-1/2 h-1 w-full"
          style={{ backgroundColor: connectorColor }}
        />
      ) : null}

      <span
        className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white text-label font-black shadow-[0_8px_22px_-12px_rgba(0,66,98,0.45)] ${
          stage.status === "inprogress" ? "animate-pulse" : ""
        }`}
        style={{
          backgroundColor: fill,
          color: stage.status === "inprogress" ? "#1f2937" : "#ffffff",
        }}
      >
        {stage.status === "done" ? <Check className="h-5 w-5" strokeWidth={3} /> : index}
      </span>

      <p className="mt-2 px-1 text-caption font-bold leading-tight tracking-tight text-[var(--brand-navy-strong)]">
        {stage.label}
      </p>
      <p
        className="mt-0.5 text-caption font-bold uppercase tracking-[0.14em]"
        style={{ color: fill }}
      >
        {labelFor(stage.status)}
      </p>
      {stage.plannedDate || stage.completedDate ? (
        <p className="mt-1 text-caption font-semibold leading-tight text-slate-500">
          {stage.completedDate ? `Concl. ${formatShortDate(stage.completedDate)}` : `Prev. ${formatShortDate(stage.plannedDate)}`}
        </p>
      ) : null}
    </li>
  );
}

function labelFor(status: MetabarcodingStageStatus) {
  if (status === "done") return "Concluído";
  if (status === "inprogress") return "Em curso";
  return "A fazer";
}

function formatShortDate(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}` : value;
}

function StageLegend() {
  return (
    <div className="flex items-center gap-3 text-caption font-semibold uppercase tracking-[0.14em] text-slate-500">
      <LegendDot color={METABARCODING_STAGE_COLORS.done} label="Concluído" />
      <LegendDot color={METABARCODING_STAGE_COLORS.inprogress} label="Em curso" />
      <LegendDot color={METABARCODING_STAGE_COLORS.pending} label="A fazer" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full border border-white shadow"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export function currentStageColor(stages: MetabarcodingStage[] = DEFAULT_STAGES) {
  const current = stages.find((stage) => stage.status === "inprogress");
  if (current) return METABARCODING_STAGE_COLORS[current.status];
  const lastDone = [...stages].reverse().find((stage) => stage.status === "done");
  if (lastDone) return METABARCODING_STAGE_COLORS.done;
  return METABARCODING_STAGE_COLORS.pending;
}

