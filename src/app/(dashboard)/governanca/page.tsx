import type { ReactNode } from "react";
import {
  Activity,
  CloudCog,
  DatabaseBackup,
  HardDrive,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AccessManagementPanel } from "@/components/access-management-panel";
import { LocalBackupPanel } from "@/components/local-backup-panel";
import { StatusChip } from "@/components/status-chip";
import {
  APP_BACKUP_TARGET_ROOT,
  DAILY_BACKUP_TARGET_ROOT,
  MONTHLY_BACKUP_TARGET_ROOT,
  isLocalBackupUiAvailable,
} from "@/lib/local-backup";
import { getCloudRuntimeMode } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default function GovernancaPage() {
  const cloudMode = getCloudRuntimeMode();
  const backupEnabled = isLocalBackupUiAvailable();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="heading-font text-2xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
              Configurações do Sistema
            </h1>
            <span className="rounded-full border border-[rgba(186,26,26,0.2)] bg-[rgba(186,26,26,0.08)] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--brand-danger)]">
              Master
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Manutenção, segurança, backups e auditoria local.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy-strong)] shadow-sm">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ControlStat
          label="Backup local"
          value={backupEnabled ? "Ativo" : "Host local"}
          icon={HardDrive}
          tone="teal"
        />
        <ControlStat label="Auto backup BD" value="Diário" icon={TimerReset} tone="blue" />
        <ControlStat label="Acesso" value="Gerenciado" icon={ShieldCheck} tone="violet" />
        <ControlStat
          label="Runtime"
          value={cloudMode === "nuvem pronta" ? "Nuvem pronta" : "Local"}
          icon={CloudCog}
          tone="amber"
        />
      </div>

      <SettingsPanel
        icon={DatabaseBackup}
        tone="orange"
        title="Painel de backups"
        description="Visão operacional do aplicativo e do banco de dados."
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusChip label={backupEnabled ? "localhost liberado" : "somente leitura"} tone={backupEnabled ? "success" : "warning"} />
            <StatusChip label="BD automático" tone="primary" />
          </div>
        }
      >
        <LocalBackupPanel
          enabled={backupEnabled}
          targetRoot={APP_BACKUP_TARGET_ROOT}
          dailyRoot={DAILY_BACKUP_TARGET_ROOT}
          monthlyRoot={MONTHLY_BACKUP_TARGET_ROOT}
          mode="settings"
        />
      </SettingsPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <SettingsPanel
          icon={LockKeyhole}
          tone="violet"
          title="Gerenciamento de acesso"
          description="Controle quem pode entrar e o que cada perfil pode operar."
          aside={<StatusChip label="funcional" tone="primary" />}
        >
          <AccessManagementPanel />
        </SettingsPanel>

        <SettingsPanel
          icon={SlidersHorizontal}
          tone="teal"
          title="Lógica e regras"
          description="Parâmetros operacionais do sistema."
        >
          <div className="grid gap-3">
            <RuleRow
              title="Créditos de campo"
              description="Ciclos extra-oficiais gerados por campanha."
              action="Gerenciar"
            />
            <RuleRow
              title="Versionamento do app"
              description="Versão atual 0.1.0 com deploy controlado."
              action="Ver regra"
            />
            <RuleRow
              title="Retenção"
              description="Diários do mês corrente e um mensal arquivado."
              action="Editar"
            />
          </div>
        </SettingsPanel>
      </div>

      <SettingsPanel
        icon={Activity}
        tone="amber"
        title="Diagnóstico do sistema"
        description="Verifique se os dados essenciais do app estão configurados."
        compact
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="rounded-2xl border border-[rgba(197,122,0,0.28)] bg-[rgba(197,122,0,0.05)] p-5">
            <p className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">
              Diagnóstico de dados
            </p>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Conta pontos, campanhas, documentos e últimos backups registrados.
            </p>
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-amber)] px-8 py-4 text-sm font-black text-white shadow-sm">
            Verificar
            <Activity className="h-4 w-4" />
          </button>
        </div>
      </SettingsPanel>
    </div>
  );
}

type ControlStatProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "blue" | "teal" | "violet" | "amber";
};

const statToneClasses: Record<ControlStatProps["tone"], string> = {
  blue: "bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]",
  teal: "bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]",
  violet: "bg-[rgba(130,70,220,0.12)] text-[#7436c8]",
  amber: "bg-[rgba(197,122,0,0.12)] text-[var(--brand-amber)]",
};

function ControlStat({ label, value, icon: Icon, tone }: ControlStatProps) {
  return (
    <article className="glass-panel rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {label}
          </p>
          <p className="mt-2 font-black text-[var(--brand-navy-strong)]">{value}</p>
        </div>
        <div className={cn("rounded-xl p-3", statToneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

type SettingsPanelProps = {
  icon: LucideIcon;
  tone: "blue" | "teal" | "violet" | "amber" | "orange";
  title: string;
  description: string;
  aside?: ReactNode;
  compact?: boolean;
  children: ReactNode;
};

const panelToneClasses: Record<SettingsPanelProps["tone"], string> = {
  blue: "bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]",
  teal: "bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]",
  violet: "bg-[rgba(130,70,220,0.1)] text-[#7436c8]",
  amber: "bg-[rgba(197,122,0,0.1)] text-[var(--brand-amber)]",
  orange: "bg-[rgba(255,105,0,0.1)] text-[#e25f00]",
};

function SettingsPanel({
  icon: Icon,
  tone,
  title,
  description,
  aside,
  compact = false,
  children,
}: SettingsPanelProps) {
  return (
    <section className={cn("glass-panel rounded-2xl p-5 sm:p-6", compact && "border-l-4 border-l-[var(--brand-amber)]")}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", panelToneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{description}</p>
          </div>
        </div>
        {aside}
      </header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function RuleRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: string;
}) {
  return (
    <article className="grid gap-4 rounded-2xl border border-[var(--line-ghost)] bg-white/70 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="heading-font text-base font-bold text-[var(--brand-navy-strong)]">{title}</p>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{description}</p>
      </div>
      <button className="rounded-xl border border-[var(--line-strong)] bg-white px-5 py-3 text-sm font-black text-[var(--brand-navy-strong)] shadow-sm">
        {action}
      </button>
    </article>
  );
}
