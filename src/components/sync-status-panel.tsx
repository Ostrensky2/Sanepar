"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
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

  const label = {
    checking: "Verificando",
    synced: "Sincronizado",
    pending: "Pendente",
    offline: "Offline",
  }[status.state];
  const toneClass = {
    checking: "border-slate-200 bg-slate-50 text-slate-600",
    synced: "border-[rgba(0,168,107,0.28)] bg-[rgba(0,168,107,0.08)] text-[#0b5f40]",
    pending: "border-[rgba(197,122,0,0.28)] bg-[rgba(197,122,0,0.10)] text-[var(--brand-amber)]",
    offline: "border-[rgba(186,26,26,0.28)] bg-[rgba(186,26,26,0.08)] text-[var(--brand-danger)]",
  }[status.state];

  return (
    <section className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-4 shadow-[0_18px_50px_-44px_rgba(0,66,98,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`rounded-xl border p-2.5 ${toneClass}`}>
            <WifiOff className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Sincronização
            </p>
            <h2 className="heading-font mt-1 text-xl font-black text-[var(--brand-navy-strong)]">
              {label}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              {status.reason}
            </p>
            <p className="mt-2 text-xs font-bold text-[var(--brand-navy-strong)]">
              Última sincronização: {formatLastSyncLabel(status.lastSyncedAt, now)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runManualSync()}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          Sincronizar agora
        </button>
      </div>
    </section>
  );
}
