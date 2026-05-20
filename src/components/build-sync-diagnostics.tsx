"use client";

import { BarChart3, Cloud, KeyRound, Laptop, RefreshCw } from "lucide-react";
import { APP_VERSION } from "@/lib/app-version";

type BuildSyncDiagnosticsProps = {
  cloudMode: string;
  localEnabled: boolean;
};

export function BuildSyncDiagnostics({ cloudMode, localEnabled }: BuildSyncDiagnosticsProps) {
  const buildDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line-ghost)] bg-white/90">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line-ghost)] p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line-ghost)] bg-white text-[var(--brand-navy)]">
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
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
            Sincronizado
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--brand-teal)]"
          >
            <RefreshCw className="h-4 w-4" />
            Sincronizar agora
          </button>
        </div>
      </header>

      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <DiagnosticBox
          icon={Cloud}
          title="Nuvem (Vercel)"
          items={[
            ["Versão", APP_VERSION],
            ["Ambiente", cloudMode],
            ["Build", buildDate],
            ["Commit", "local-dev"],
          ]}
          footerLabel="Deployed commit"
          footerValue="local-dev"
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

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-ghost)] bg-[var(--surface-soft)]/60 px-4 py-3">
        <p className="inline-flex items-center gap-2 font-mono text-xs text-[var(--ink-soft)]">
          <KeyRound className="h-4 w-4" />
          ID: yvae-local-diagnostics
        </p>
        <button className="h-9 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-xs font-black text-[var(--brand-navy-strong)]">
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
    <article className="rounded-xl border border-[var(--line-ghost)] bg-white/70 p-4">
      <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
        <Icon className="h-4 w-4 text-[var(--brand-teal)]" />
        {title}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              {label}
            </p>
            <p className="mt-1 text-base font-black text-[var(--brand-navy-strong)]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-[var(--brand-navy-strong)] px-3 py-2 font-mono text-[11px] uppercase text-white">
        <span>{footerLabel}</span>
        <span className="text-[var(--brand-teal)]">{footerValue}</span>
      </div>
    </article>
  );
}
