import type { ComponentType, ReactNode, SVGProps } from "react";
import { FileSpreadsheet } from "lucide-react";

type EmptyStateProps = {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({
  icon: Icon = FileSpreadsheet,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center radius-panel border border-dashed border-slate-300 bg-[var(--surface-soft)] text-center ${
        compact ? "min-h-40 p-5" : "min-h-64 p-8"
      }`}
    >
      <Icon className={`text-slate-400 ${compact ? "mb-3 h-8 w-8" : "mb-4 h-10 w-10"}`} />
      <p className={`heading-font font-bold text-[var(--brand-navy-strong)] ${compact ? "text-base" : "text-xl"}`}>
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
