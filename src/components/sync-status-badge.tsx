import { Cloud, HardDrive } from "lucide-react";
import { type SyncStatusSnapshot } from "@/lib/sync-status";
import { cn } from "@/lib/utils";

type SyncStatusBadgeProps = {
  snapshot: SyncStatusSnapshot;
  className?: string;
};

export function SyncStatusBadge({ snapshot, className }: SyncStatusBadgeProps) {
  const isCloud = snapshot.state === "synced" || snapshot.state === "checking";
  const Icon = isCloud ? Cloud : HardDrive;
  const label = isCloud ? "Nuvem" : "Local";

  return (
    <span
      title={`${label} - ${snapshot.reason}`}
      aria-label={`${label}: ${snapshot.reason}`}
      className={cn(
        "inline-flex items-center gap-1.5 radius-control border px-2.5 py-1 text-label font-bold",
        isCloud
          ? "border-[rgba(0,142,156,0.24)] bg-[var(--brand-teal-soft)] text-[var(--brand-navy-strong)]"
          : "border-[rgba(197,122,0,0.24)] bg-[rgba(197,122,0,0.10)] text-[var(--brand-amber)]",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
