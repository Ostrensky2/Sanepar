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
import { BuildSyncDiagnostics } from "@/components/build-sync-diagnostics";
import { LocalBackupPanel } from "@/components/local-backup-panel";
import { MemberActivityPanel } from "@/components/member-activity-panel";
import { StatusChip } from "@/components/status-chip";
import { SystemDiagnosticsPanel } from "@/components/system-diagnostics-panel";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { getServerAccessContext } from "@/lib/access-control-server";
import { loadDashboardData } from "@/lib/dashboard-data";
import {
  APP_BACKUP_TARGET_ROOT,
  DAILY_BACKUP_TARGET_ROOT,
  MONTHLY_BACKUP_TARGET_ROOT,
  isLocalBackupUiAvailable,
} from "@/lib/local-backup";
import { getCloudRuntimeMode } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default async function GovernancaPage() {
  const access = await getServerAccessContext();

  if (!access.can("settings.manage")) {
    return null;
  }

  const cloudMode = getCloudRuntimeMode();
  const backupEnabled = isLocalBackupUiAvailable();
  const { campaignSummary, pointSummary } = await loadDashboardData();
  const canViewUsers = access.can("users.manage");
  const canViewBackups = access.can("backups.manage");
  const canViewBuildSync = access.can("settings.buildSync");
  const canViewActivity = access.can("settings.activity");
  const canViewPermissions = access.can("permissions.manage");
  const canViewRules = access.can("settings.rules");
  const canViewDiagnostics = access.can("settings.diagnostics");

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
              <h1 className="heading-font text-xl font-black tracking-tight text-[var(--brand-navy-strong)]">
              Configurações do Sistema
            </h1>
              <span className="rounded-full border border-[rgba(186,26,26,0.2)] bg-[rgba(186,26,26,0.08)] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--brand-danger)]">
              Master
            </span>
          </div>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Operação, acesso, backups e diagnóstico do ambiente.
          </p>
        </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] shadow-sm">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {canViewBackups ? (
          <>
            <ControlStat
              label="Backup local"
              value={backupEnabled ? "Ativo" : "Host local"}
              icon={HardDrive}
              tone="teal"
            />
            <ControlStat label="Auto backup BD" value="Diário" icon={TimerReset} tone="blue" />
          </>
        ) : null}
        {canViewPermissions || canViewUsers ? (
          <ControlStat label="Acesso" value="Gerenciado" icon={ShieldCheck} tone="violet" />
        ) : null}
        {canViewBuildSync || canViewDiagnostics ? (
          <ControlStat
            label="Runtime"
            value={cloudMode === "nuvem pronta" ? "Nuvem pronta" : "Local"}
            icon={CloudCog}
            tone="amber"
          />
        ) : null}
      </div>

      {canViewUsers ? <AccessManagementPanel sections={["people"]} /> : null}

      {canViewBackups ? (
        <SettingsPanel
          icon={DatabaseBackup}
          tone="orange"
          title="Backups"
          description="App manual, BD automático, retenção e restauração."
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
      ) : null}

      {canViewBuildSync ? <BuildSyncDiagnostics cloudMode={cloudMode} localEnabled={backupEnabled} /> : null}

      {canViewActivity ? <MemberActivityPanel /> : null}

      {canViewPermissions ? (
        <SettingsPanel
          icon={LockKeyhole}
          tone="violet"
          title="Perfis e permissões"
          description="Matriz funcional por categoria e auditoria de acesso."
          aside={<StatusChip label="funcional" tone="primary" />}
        >
          <AccessManagementPanel sections={["stats", "privileges", "audit"]} />
        </SettingsPanel>
      ) : null}

      {canViewRules ? (
        <SettingsPanel
          icon={SlidersHorizontal}
          tone="teal"
          title="Regras operacionais"
          description="Parâmetros administrativos essenciais."
        >
          <div className="grid gap-3">
            <RuleRow
              title="Créditos de campo"
              description="Ciclos extra-oficiais gerados por campanha."
              action="Gerenciar"
            />
            <RuleRow
              title="Versionamento do app"
              description={`${APP_VERSION_LABEL}. Deploy controlado.`}
              action="Ver regra"
            />
            <RuleRow
              title="Retenção"
              description="Dias 01 e 15 preservados em Mensais."
              action="Editar"
            />
          </div>
        </SettingsPanel>
      ) : null}

      {canViewDiagnostics ? (
        <SettingsPanel
          icon={Activity}
          tone="amber"
          title="Diagnóstico"
          description="Verificação rápida dos dados e serviços."
          compact
        >
          <SystemDiagnosticsPanel
            pointTotal={pointSummary.total}
            campaignTotal={campaignSummary.totalCampaigns}
            backupEnabled={backupEnabled}
            cloudMode={cloudMode}
          />
        </SettingsPanel>
      ) : null}
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
    <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/86 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            {label}
          </p>
          <p className="mt-1 text-base font-black text-[var(--brand-navy-strong)]">{value}</p>
        </div>
        <div className={cn("rounded-xl p-2.5", statToneClasses[tone])}>
          <Icon className="h-4 w-4" />
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
    <section className={cn("rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-4 shadow-[0_18px_50px_-44px_rgba(0,66,98,0.28)] sm:p-5", compact && "border-l-4 border-l-[var(--brand-amber)]")}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", panelToneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
              {title}
            </h2>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">{description}</p>
          </div>
        </div>
        {aside}
      </header>
      <div className="mt-4">{children}</div>
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
    <article className="grid gap-3 rounded-xl border border-[var(--line-ghost)] bg-white/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="text-sm font-black text-[var(--brand-navy-strong)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">{description}</p>
      </div>
      <button className="h-9 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-xs font-black text-[var(--brand-navy-strong)] shadow-sm">
        {action}
      </button>
    </article>
  );
}
