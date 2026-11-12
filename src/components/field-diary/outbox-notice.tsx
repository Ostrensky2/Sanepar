"use client";

import { useEffect, useState } from "react";
import { CloudOff, CloudUpload, LoaderCircle, TriangleAlert } from "lucide-react";
import { describeFieldOutbox, type FieldOutboxRecord } from "@/lib/field-outbox";
import { syncFieldOutbox, type FieldOutboxSyncResult } from "@/lib/field-record-sync";
import { countLabel } from "@/lib/number-format";

/** Sinal do aparelho, como o navegador informa (true quando não sabe). */
function useOnline() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

/**
 * Aviso do Diário de campo: sem sinal, diz que dá para registrar assim mesmo; com
 * registros guardados no aparelho, diz quantos faltam subir e deixa enviar agora.
 */
export function FieldOutboxNotice({ records }: { records: FieldOutboxRecord[] }) {
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<FieldOutboxSyncResult | null>(null);
  const { total, waiting, attention } = describeFieldOutbox(records);

  if (!total && online) {
    return null;
  }

  async function sendNow() {
    if (sending) return;

    setSending(true);
    try {
      setLastResult(await syncFieldOutbox({ retryProblems: true }));
    } finally {
      setSending(false);
    }
  }

  const tone = attention ? "border-amber-300 bg-amber-50" : "border-[var(--line-strong)] bg-[var(--surface-soft)]";
  const Icon = attention ? TriangleAlert : online ? CloudUpload : CloudOff;

  return (
    <section role="status" aria-live="polite" className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${tone}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${attention ? "text-amber-700" : "text-[var(--brand-navy-strong)]"}`} aria-hidden />
        <div className="min-w-0 text-sm leading-6">
          <p className="font-bold text-[var(--brand-navy-strong)]">
            {total
              ? `${countLabel(total, "registro guardado", "registros guardados")} neste aparelho`
              : "Sem sinal agora"}
          </p>
          <p className="text-[var(--ink-soft)]">
            {waiting
              ? `${waiting === 1 ? "Ele vai" : "Eles vão"} para a nuvem sozinho${waiting === 1 ? "" : "s"} quando houver sinal. Pode continuar registrando.`
              : null}
            {!total ? "Pode registrar os pontos normalmente: tudo fica guardado neste aparelho e sobe quando o sinal voltar." : null}
            {attention
              ? ` ${countLabel(attention, "registro precisa", "registros precisam")} de revisão: abra o que está marcado “Precisa de revisão” e salve de novo.`
              : null}
          </p>
          {lastResult && lastResult.stopped === "session" ? (
            <p className="font-semibold text-[var(--brand-danger)]">Sua sessão expirou. Entre de novo no sistema para os registros subirem.</p>
          ) : null}
          {lastResult && lastResult.stopped === "offline" && online ? (
            <p className="font-semibold text-[var(--ink-soft)]">A nuvem não respondeu agora. O aparelho tenta de novo sozinho.</p>
          ) : null}
        </div>
      </div>
      {total && online ? (
        <button
          type="button"
          onClick={() => void sendNow()}
          disabled={sending}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:opacity-70"
        >
          {sending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CloudUpload className="h-4 w-4" aria-hidden />}
          {sending ? "Enviando…" : attention && !waiting ? "Tentar de novo" : "Enviar agora"}
        </button>
      ) : null}
    </section>
  );
}

/** Selo na linha do registro guardado no aparelho. */
export function DeviceStateBadge({ state, problem }: { state?: "pending" | "attention"; problem?: string }) {
  if (!state) {
    return null;
  }

  return state === "attention" ? (
    <span
      title={problem}
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"
    >
      <TriangleAlert className="h-3 w-3" aria-hidden />
      Precisa de revisão
    </span>
  ) : (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-bold text-[var(--brand-navy-strong)]">
      <CloudOff className="h-3 w-3" aria-hidden />
      No aparelho, aguardando sinal
    </span>
  );
}
