"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { SyncStatusBadge } from "@/components/sync-status-badge";
import {
  SYNC_STATUS_EVENT,
  formatLastSyncLabel,
  markOffline,
  markPending,
  markSynced,
  readSyncStatusSnapshot,
  type SyncStatusSnapshot,
} from "@/lib/sync-status";

export function SyncStatusPanel() {
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => readSyncStatusSnapshot());
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    function sync() {
      setStatus(readSyncStatusSnapshot());
    }

    sync();
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    window.addEventListener(SYNC_STATUS_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(SYNC_STATUS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  async function runManualSync() {
    setChecking(true);

    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = (await response.json()) as {
        services?: { supabase?: string };
        messages?: { supabase?: string };
      };

      if (response.ok && payload.services?.supabase === "configured") {
        markSynced("Sincronização manual concluída.");
        setStatus(readSyncStatusSnapshot());
        return;
      }

      const reason = payload.messages?.supabase ?? "A nuvem ainda não está disponível.";
      if (payload.services?.supabase === "pending") {
        markPending(reason);
      } else {
        markOffline(reason);
      }
      setStatus(readSyncStatusSnapshot());
    } catch {
      markOffline("Falha de conexão com o banco de dados.");
      setStatus(readSyncStatusSnapshot());
    } finally {
      setChecking(false);
    }
  }

  return (
    <SectionCard
      title="Sincronização"
      description={status.reason}
      action={
        <button
          type="button"
          onClick={() => void runManualSync()}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          Sincronizar agora
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SyncStatusBadge snapshot={status} />
        <p className="text-xs font-bold text-[var(--brand-navy-strong)]">
          Última sincronização: {formatLastSyncLabel(status.lastSyncedAt, now)}
        </p>
      </div>
    </SectionCard>
  );
}

