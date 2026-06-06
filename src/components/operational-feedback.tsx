"use client";

import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw, WifiOff, X } from "lucide-react";
import {
  markOffline,
  markPending,
  markSynced,
  readSyncStatusSnapshot,
  type SyncState,
} from "@/lib/sync-status";

type ErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

type OperationDetail = {
  id: string;
  active: boolean;
  title?: string;
  description?: string;
  cancelable?: boolean;
};

type CloudHealth = SyncState;

export const OPERATION_STATE_EVENT = "yvae:operation-state";
export const OPERATION_CANCEL_EVENT = "yvae:operation-cancel";
export const LOCAL_MODE_EVENT = "yvae:local-mode";

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro capturado pelo limite de seção", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="rounded-2xl border border-[rgba(186,26,26,0.22)] bg-white p-5 shadow-[0_18px_50px_-44px_rgba(0,66,98,0.28)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(186,26,26,0.10)] text-[var(--brand-danger)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--brand-danger)]">
              Seção indisponível
            </p>
            <h2 className="heading-font mt-1 text-lg font-black text-[var(--brand-navy-strong)]">
              {this.props.title ?? "Falha ao carregar esta área"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
              O componente encontrou uma falha inesperada. Atualize a página; se persistir,
              confira a conexão com o banco de dados ou opere em modo local até a sincronização voltar.
            </p>
            <p className="mt-3 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--ink-soft)]">
              Detalhe técnico: {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-navy)]"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      </section>
    );
  }
}

export function OperationalFeedbackLayer() {
  const [operation, setOperation] = useState<OperationDetail | null>(null);
  const [health, setHealth] = useState<CloudHealth>(() => readSyncStatusSnapshot().state);
  const [localReason, setLocalReason] = useState(() => readSyncStatusSnapshot().reason);
  const [isCheckingSync, setIsCheckingSync] = useState(false);
  const isLocal = health === "pending" || health === "offline";

  useEffect(() => {
    let isMounted = true;

    async function checkHealth() {
      setIsCheckingSync(true);
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = (await response.json()) as {
          runtimeMode?: string;
          services?: { supabase?: string };
          messages?: { supabase?: string };
        };

        if (!isMounted) return;

        if (!response.ok || payload.services?.supabase !== "configured") {
          const reason = payload.messages?.supabase ?? "Supabase não está pronto neste ambiente.";
          const nextState = payload.services?.supabase === "pending" ? "pending" : "offline";
          setHealth(nextState);
          setLocalReason(reason);
          if (nextState === "pending") {
            markPending(reason);
          } else {
            markOffline(reason);
          }
          return;
        }

        setHealth("synced");
        setLocalReason("Dados sincronizados com a nuvem.");
        markSynced("Supabase disponível. Dados sincronizados com a nuvem.");
      } catch {
        if (!isMounted) return;
        setHealth("offline");
        setLocalReason("Falha de conexão com o banco de dados.");
        markOffline("Falha de conexão com o banco de dados.");
      } finally {
        if (isMounted) {
          setIsCheckingSync(false);
        }
      }
    }

    void checkHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleOperation(event: Event) {
      const detail = (event as CustomEvent<OperationDetail>).detail;
      if (!detail?.id) return;
      setOperation(detail.active ? detail : null);
    }

    function handleLocalMode(event: Event) {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      const reason = detail?.reason ?? "Dados não sincronizados com a nuvem.";
      setHealth("pending");
      setLocalReason(reason);
      markPending(reason);
    }

    window.addEventListener(OPERATION_STATE_EVENT, handleOperation);
    window.addEventListener(LOCAL_MODE_EVENT, handleLocalMode);

    return () => {
      window.removeEventListener(OPERATION_STATE_EVENT, handleOperation);
      window.removeEventListener(LOCAL_MODE_EVENT, handleLocalMode);
    };
  }, []);

  return (
    <>
      {operation ? <HeaderProgress /> : null}
      <div className="fixed right-4 top-20 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3">
        {isLocal ? (
          <LocalModeBanner
            reason={localReason}
            state={health}
            checking={isCheckingSync}
            onSync={() => {
              void (async () => {
                setIsCheckingSync(true);
                try {
                  const response = await fetch("/api/health", { cache: "no-store" });
                  const payload = (await response.json()) as {
                    services?: { supabase?: string };
                    messages?: { supabase?: string };
                  };

                  if (response.ok && payload.services?.supabase === "configured") {
                    setHealth("synced");
                    setLocalReason("Dados sincronizados com a nuvem.");
                    markSynced("Sincronização manual concluída.");
                    return;
                  }

                  const reason = payload.messages?.supabase ?? "A nuvem ainda não está disponível.";
                  const nextState = payload.services?.supabase === "pending" ? "pending" : "offline";
                  setHealth(nextState);
                  setLocalReason(reason);
                  if (nextState === "pending") {
                    markPending(reason);
                  } else {
                    markOffline(reason);
                  }
                } catch {
                  setHealth("offline");
                  setLocalReason("Falha de conexão com o banco de dados.");
                  markOffline("Falha de conexão com o banco de dados.");
                } finally {
                  setIsCheckingSync(false);
                }
              })();
            }}
          />
        ) : null}
        {operation ? <OperationToast operation={operation} /> : null}
      </div>
    </>
  );
}

export function emitLocalMode(reason: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCAL_MODE_EVENT, { detail: { reason } }));
}

export function beginGlobalOperation(detail: Omit<OperationDetail, "active">) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.dispatchEvent(new CustomEvent(OPERATION_STATE_EVENT, { detail: { ...detail, active: true } }));

  return () => {
    window.dispatchEvent(new CustomEvent(OPERATION_STATE_EVENT, { detail: { id: detail.id, active: false } }));
  };
}

export function requestGlobalOperationCancel(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPERATION_CANCEL_EVENT, { detail: { id } }));
}

export function isCloudConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return /supabase|banco|nuvem|conex[aã]o|fetch|network|offline|timeout/i.test(message);
}

export function toActionableErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir a operação.",
) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Operação cancelada. Nenhum dado novo foi publicado.";
  }

  if (isCloudConnectionError(error)) {
    const reason =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "Falha de conexão com o banco de dados.";

    return `${reason} Verifique sua internet ou tente novamente quando a nuvem estiver disponível.`;
  }

  if (error instanceof Error && error.message.trim()) {
    return `${error.message.trim()} Revise os dados informados e tente novamente.`;
  }

  return `${fallback} Revise os dados informados e tente novamente.`;
}

export function DashboardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-[var(--line-ghost)] bg-white/80 p-4">
          <div className="h-3 w-1/4 rounded bg-slate-200" />
          <div className="mt-4 h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-full rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeletonRows({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="animate-pulse">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex} className="px-6 py-4">
              <div className="h-3 rounded bg-slate-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function HeaderProgress() {
  return (
    <div className="fixed left-0 right-0 top-0 z-[80] h-1 bg-[var(--brand-blue-soft)] lg:left-52">
      <div className="h-full w-1/2 animate-[yvae-progress_1.25s_ease-in-out_infinite] rounded-r-full bg-[var(--brand-teal)]" />
    </div>
  );
}

function LocalModeBanner({
  reason,
  state,
  checking,
  onSync,
}: {
  reason: string;
  state: SyncState;
  checking: boolean;
  onSync: () => void;
}) {
  const isOffline = state === "offline";

  return (
    <div className={`rounded-xl border bg-white px-4 py-3 shadow-[0_20px_48px_-34px_rgba(0,66,98,0.35)] ${
      isOffline ? "border-[rgba(186,26,26,0.28)]" : "border-[rgba(197,122,0,0.24)]"
    }`}>
      <div className="flex items-start gap-3">
        <WifiOff className={`mt-0.5 h-4 w-4 shrink-0 ${isOffline ? "text-[var(--brand-danger)]" : "text-[var(--brand-amber)]"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-[var(--brand-navy-strong)]">
            Modo local ativo — dados salvos apenas neste dispositivo
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
            {reason} Verifique a internet ou sincronize manualmente quando a nuvem responder.
          </p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={checking}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line-ghost)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          Sincronizar
        </button>
      </div>
    </div>
  );
}

function OperationToast({ operation }: { operation: OperationDetail }) {
  const title = operation.title ?? "Processando operação";
  const description = useMemo(
    () => operation.description ?? "Aguarde enquanto o app conclui esta tarefa.",
    [operation.description],
  );

  return (
    <div className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 shadow-[0_20px_48px_-34px_rgba(0,66,98,0.35)]">
      <div className="flex items-start gap-3">
        <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--brand-teal)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-[var(--brand-navy-strong)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{description}</p>
        </div>
        {operation.cancelable ? (
          <button
            type="button"
            aria-label="Cancelar operação"
            onClick={() => requestGlobalOperationCancel(operation.id)}
            className="rounded p-1 text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-danger)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
