"use client";

import { Activity, CheckCircle2, Database, FileText, HardDrive, MapPinned, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readStoredDocumentsFromStorage } from "@/lib/app-documents";
import { cn } from "@/lib/utils";

type DiagnosticTone = "ok" | "warning" | "muted";

type DiagnosticItem = {
  label: string;
  value: string | number;
  detail: string;
  tone: DiagnosticTone;
  icon: typeof Activity;
};

type BackupRecord = {
  createdAt?: string;
  type?: string;
};

export function SystemDiagnosticsPanel({
  pointTotal,
  campaignTotal,
  backupEnabled,
  cloudMode,
}: {
  pointTotal: number;
  campaignTotal: number;
  backupEnabled: boolean;
  cloudMode: string;
}) {
  const [documentTotal, setDocumentTotal] = useState(0);
  const [backupTotal, setBackupTotal] = useState<number | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setIsChecking(true);
    setDocumentTotal(readStoredDocumentsFromStorage().length);

    if (!backupEnabled) {
      setBackupTotal(null);
      setLastBackupAt(null);
      setCheckedAt(new Date());
      setIsChecking(false);
      return;
    }

    try {
      const response = await fetch("/api/local/backups", { cache: "no-store" });
      const payload = (await response.json()) as { backups?: BackupRecord[] };
      const backups = Array.isArray(payload.backups) ? payload.backups : [];
      const sortedBackups = backups
        .filter((backup) => backup.createdAt)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

      setBackupTotal(backups.length);
      setLastBackupAt(sortedBackups[0]?.createdAt ?? null);
    } catch {
      setBackupTotal(null);
      setLastBackupAt(null);
    } finally {
      setCheckedAt(new Date());
      setIsChecking(false);
    }
  }, [backupEnabled]);

  useEffect(() => {
    void runCheck();
    window.addEventListener("yvae:documents-updated", runCheck);

    return () => window.removeEventListener("yvae:documents-updated", runCheck);
  }, [runCheck]);

  const items = useMemo<DiagnosticItem[]>(
    () => [
      {
        label: "Pontos",
        value: pointTotal,
        detail: pointTotal > 0 ? "dados publicados" : "sem pontos publicados",
        tone: pointTotal > 0 ? "ok" : "warning",
        icon: MapPinned,
      },
      {
        label: "Campanhas",
        value: campaignTotal,
        detail: campaignTotal > 0 ? "campanhas detectadas" : "sem campanhas",
        tone: campaignTotal > 0 ? "ok" : "warning",
        icon: Database,
      },
      {
        label: "Documentos",
        value: documentTotal,
        detail: documentTotal > 0 ? "links registrados" : "repositório vazio",
        tone: documentTotal > 0 ? "ok" : "muted",
        icon: FileText,
      },
      {
        label: "Backups",
        value: backupTotal ?? (backupEnabled ? "N/A" : "Host"),
        detail: lastBackupAt ? formatDateTime(lastBackupAt) : backupEnabled ? "endpoint sem retorno" : "disponível só em localhost",
        tone: backupTotal && backupTotal > 0 ? "ok" : backupEnabled ? "warning" : "muted",
        icon: HardDrive,
      },
    ],
    [backupEnabled, backupTotal, campaignTotal, documentTotal, lastBackupAt, pointTotal],
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <DiagnosticCard key={item.label} item={item} />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--line-ghost)] bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <StatusIcon tone={items.every((item) => item.tone !== "warning") ? "ok" : "warning"} />
          <div>
            <p className="text-sm font-black text-[var(--brand-navy-strong)]">
              {items.every((item) => item.tone !== "warning") ? "Integridade operacional" : "Atenção operacional"}
            </p>
            <p className="text-xs font-semibold text-[var(--ink-soft)]">
              {checkedAt ? `Última verificação: ${formatLocalDateTime(checkedAt)}` : `Ambiente: ${cloudMode}`}
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-xs font-black text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          type="button"
          onClick={() => void runCheck()}
          disabled={isChecking}
        >
          <RefreshCw className={cn("h-4 w-4", isChecking && "animate-spin")} />
          Verificar agora
        </button>
      </div>
    </div>
  );
}

function DiagnosticCard({ item }: { item: DiagnosticItem }) {
  const Icon = item.icon;

  return (
    <article className="rounded-xl border border-[var(--line-ghost)] bg-white/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            {item.label}
          </p>
          <p className="mt-1 text-xl font-black text-[var(--brand-navy-strong)]">{item.value}</p>
        </div>
        <div className={cn("rounded-lg p-2", toneClass(item.tone))}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-[var(--ink-soft)]">{item.detail}</p>
    </article>
  );
}

function StatusIcon({ tone }: { tone: "ok" | "warning" }) {
  if (tone === "ok") {
    return <CheckCircle2 className="h-5 w-5 text-[var(--brand-teal)]" />;
  }

  return <TriangleAlert className="h-5 w-5 text-[var(--brand-amber)]" />;
}

function toneClass(tone: DiagnosticTone) {
  if (tone === "ok") {
    return "bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]";
  }

  if (tone === "warning") {
    return "bg-[rgba(197,122,0,0.12)] text-[var(--brand-amber)]";
  }

  return "bg-[var(--surface-soft)] text-[var(--ink-soft)]";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return formatLocalDateTime(date);
}

function formatLocalDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
