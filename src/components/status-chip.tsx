import type { Tone } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusChipProps = {
  label: string;
  tone?: Tone;
};

const toneClasses: Record<Tone, string> = {
  primary: "bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]",
  success: "bg-[var(--brand-green-soft)] text-[var(--brand-teal)]",
  warning: "bg-[rgba(201,116,0,0.12)] text-[var(--brand-amber)]",
  neutral: "bg-[rgba(23,53,76,0.08)] text-[var(--ink-soft)]",
  danger: "bg-[rgba(186,26,26,0.12)] text-[var(--brand-danger)]",
};

const dotClasses: Record<Tone, string> = {
  primary: "bg-[var(--brand-blue)]",
  success: "bg-[var(--brand-green)]",
  warning: "bg-[var(--brand-amber)]",
  neutral: "bg-[var(--ink-soft)]",
  danger: "bg-[var(--brand-danger)]",
};

export function StatusChip({
  label,
  tone = "neutral",
}: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
        toneClasses[tone],
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dotClasses[tone])} />
      <span>{label}</span>
    </span>
  );
}
