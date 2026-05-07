import type { LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/types";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
  icon: LucideIcon;
};

const accentClasses: Record<Tone, string> = {
  primary: "from-[var(--brand-navy-strong)] to-[var(--brand-blue)]",
  success: "from-[var(--brand-teal)] to-[var(--brand-green)]",
  warning: "from-[#7a4800] to-[var(--brand-amber)]",
  neutral: "from-[#425466] to-[#77879a]",
  danger: "from-[#7f1d1d] to-[var(--brand-danger)]",
};

const iconClasses: Record<Tone, string> = {
  primary: "bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]",
  success: "bg-[var(--brand-green-soft)] text-[var(--brand-teal)]",
  warning: "bg-[rgba(197,122,0,0.12)] text-[var(--brand-amber)]",
  neutral: "bg-[rgba(23,53,76,0.08)] text-[var(--ink-soft)]",
  danger: "bg-[rgba(186,26,26,0.12)] text-[var(--brand-danger)]",
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
  icon: Icon,
}: MetricCardProps) {
  return (
    <article className="glass-panel relative overflow-hidden rounded-[30px] p-5">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
          accentClasses[tone],
        )}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--ink-soft)]">{label}</p>
          <p className="heading-font mt-3 text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            {value}
          </p>
        </div>
        <div className={cn("rounded-[20px] p-3", iconClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 max-w-xs text-sm leading-6 text-[var(--ink-soft)]">{detail}</p>
    </article>
  );
}
