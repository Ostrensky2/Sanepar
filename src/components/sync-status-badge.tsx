import { Cloud, HardDrive } from "lucide-react";
import { type SyncStatusSnapshot } from "@/lib/sync-status";
import { cn } from "@/lib/utils";

type SyncStatusBadgeProps = {
  snapshot: SyncStatusSnapshot;
  className?: string;
};

function isLoopbackService(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      (url.hostname === "localhost" || url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname));
  } catch {
    return false;
  }
}

export function SyncStatusBadge({ snapshot, className }: SyncStatusBadgeProps) {
  const connectedOrChecking = snapshot.state === "synced" || snapshot.state === "checking";
  const localService = connectedOrChecking && isLoopbackService(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const Icon = connectedOrChecking && !localService ? Cloud : HardDrive;
  const label = localService ? "Banco local de teste" : connectedOrChecking ? "Dados na nuvem" : "Dados locais";
  const reason = localService
    ? (snapshot.state === "checking" ? "Verificando conexão." : "Sincronizado.")
    : snapshot.reason;

  return (
    <span
      title={`${label} - ${reason}`}
      aria-label={`${label}: ${reason}`}
      className={cn(
        "inline-flex items-center gap-1.5 radius-control border px-2.5 py-1 text-label font-bold",
        connectedOrChecking
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
