"use client";

/**
 * Wrappers de carregamento tardio (lazy) para os painéis pesados da página
 * de Governança. Usar next/dynamic num Client Component é a forma correta de
 * criar code-split boundaries em Next.js App Router — os chunks só são
 * baixados quando o componente é montado no cliente.
 */
import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import type { LocalBackupPanel as LocalBackupPanelType } from "@/components/local-backup-panel";
import type { AccessManagementPanel as AccessManagementPanelType } from "@/components/access-management-panel";
import type { MemberActivityPanel as MemberActivityPanelType } from "@/components/member-activity-panel";
import type { BuildSyncDiagnostics as BuildSyncDiagnosticsType } from "@/components/build-sync-diagnostics";

function PanelLoader() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-[var(--line-ghost)] bg-white/60 p-10 text-[var(--ink-soft)]">
      <LoaderCircle className="h-5 w-5 animate-spin text-[var(--brand-teal)]" />
      <span className="text-sm font-semibold">Carregando painel…</span>
    </div>
  );
}

export const LocalBackupPanelLazy = dynamic<ComponentProps<typeof LocalBackupPanelType>>(
  () =>
    import("@/components/local-backup-panel").then((m) => ({ default: m.LocalBackupPanel })),
  { loading: PanelLoader },
);

export const AccessManagementPanelLazy = dynamic<ComponentProps<typeof AccessManagementPanelType>>(
  () =>
    import("@/components/access-management-panel").then((m) => ({
      default: m.AccessManagementPanel,
    })),
  { loading: PanelLoader },
);

export const MemberActivityPanelLazy = dynamic<ComponentProps<typeof MemberActivityPanelType>>(
  () =>
    import("@/components/member-activity-panel").then((m) => ({
      default: m.MemberActivityPanel,
    })),
  { loading: PanelLoader },
);

export const BuildSyncDiagnosticsLazy = dynamic<ComponentProps<typeof BuildSyncDiagnosticsType>>(
  () =>
    import("@/components/build-sync-diagnostics").then((m) => ({
      default: m.BuildSyncDiagnostics,
    })),
  { loading: PanelLoader },
);
