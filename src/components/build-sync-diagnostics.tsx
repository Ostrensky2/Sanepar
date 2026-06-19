"use client";

import { BarChart3, Cloud, KeyRound, Laptop, RefreshCw } from "lucide-react";
import { APP_VERSION } from "@/lib/app-version";

type BuildSyncDiagnosticsProps = {
  cloudMode: string;
  localEnabled: boolean;
  deploymentCommit: string;
};

export function BuildSyncDiagnostics({
  cloudMode,
  localEnabled,
  deploymentCommit,
}: BuildSyncDiagnosticsProps) {
  const buildDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line-ghost)] bg-white/92 shadow-[0_18px_50px_-44px_rgba(0,66,98,0.32)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line-ghost)] bg-[var(--surface-soft)]/34 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(197,122,0,0.1)] text-[var(--brand-amber)]">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
              Build & Sync Diagnostics
            </h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Integração, versão e estado local.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-[rgba(0,168,107,0.16)] bg-[rgba(0,168,107,0.06)] px-3 py-1.5 text-label font-black uppercase tracking-[0.12em] text-[#0b5f40]">
            Sincronizado
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
            aria-label="Sincronizar agora"
            title="Sincronizar agora"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
        <DiagnosticBox
          icon={Cloud}
          title="Nuvem (Vercel)"
          items={[
            ["Versão", APP_VERSION],
            ["Ambiente", cloudMode],
            ["Build", buildDate],
            ["Commit", deploymentCommit],
          ]}
          footerLabel="Deployed commit"
          footerValue={deploymentCommit}
        />
        <DiagnosticBox
          icon={Laptop}
          title="Dispositivo local"
          items={[
            ["App load", "Sessão atual"],
            ["Status sync", localEnabled ? "Operacional" : "N/A"],
            ["Last sync", buildDate],
            ["Pendências", "0"],
          ]}
          footerLabel="Host"
          footerValue={localEnabled ? "localhost habilitado" : "somente leitura"}
        />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-ghost)] bg-[var(--surface-soft)]/50 px-4 py-3 sm:px-5">
        <p className="inline-flex items-center gap-2 font-mono text-xs text-[var(--ink-soft)]">
          <KeyRound className="h-4 w-4" />
          ID: yvae-build-sync-diagnostics
        </p>
        <button className="h-9 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-xs font-black text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]">
          Ver extrato completo
        </button>
      </footer>
    </section>
  );
}

function DiagnosticBox({
  icon: Icon,
  title,
  items,
  footerLabel,
  footerValue,
}: {
  icon: typeof Cloud;
  title: string;
  items: Array<[string, string]>;
  footerLabel: string;
  footerValue: string;
}) {
  return (
    <article className="rounded-xl border border-[var(--line-ghost)] bg-white/84 p-4">
      <p className="inline-flex items-center gap-2 text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
        <Icon className="h-4 w-4 text-[var(--brand-teal)]" />
        {title}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border border-[var(--line-ghost)] bg-white px-3 py-2">
            <p className="text-label font-black uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              {label}
            </p>
            <p className="mt-1 truncate text-sm font-black text-[var(--brand-navy-strong)]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--line-ghost)] bg-[var(--surface-soft)]/58 px-3 py-2 font-mono text-label uppercase text-[var(--ink-soft)]">
        <span>{footerLabel}</span>
        <span className="truncate text-[var(--brand-navy-strong)]">{footerValue}</span>
      </div>
    </article>
  );
}

