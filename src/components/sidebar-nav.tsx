"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  getPrivilegeMatrix,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { IMPORT_CONFLICTS_UPDATED_EVENT } from "@/lib/app-events";
import { isNavigationItemActive, navigationGroupLabels, navigationItems } from "@/lib/navigation";
import {
  SYNC_STATUS_EVENT,
  readSyncStatusSnapshot,
  type SyncStatusSnapshot,
} from "@/lib/sync-status";
import { SyncStatusBadge } from "@/components/sync-status-badge";
import { cn } from "@/lib/utils";
import { countLabel } from "@/lib/number-format";

type SidebarNavProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

type ActionBadge = { count: number; label: string };

export function SidebarNav({ mobile = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const [activeCategory, setActiveCategory] = useState<UserCategory>("ATGC");
  const [privilegeMatrix, setPrivilegeMatrix] = useState(() => getPrivilegeMatrix());
  const [badges, setBadges] = useState<Record<string, ActionBadge>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(() => readSyncStatusSnapshot());

  useEffect(() => {
    function sync() {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setPrivilegeMatrix(getPrivilegeMatrix());
    }

    sync();
    window.addEventListener("yvae:access-category-updated", sync);
    window.addEventListener("yvae:access-privileges-updated", sync);
    window.addEventListener("yvae:auth-session-updated", sync);

    return () => {
      window.removeEventListener("yvae:access-category-updated", sync);
      window.removeEventListener("yvae:access-privileges-updated", sync);
      window.removeEventListener("yvae:auth-session-updated", sync);
    };
  }, []);

  useEffect(() => {
    function refreshSyncStatus() {
      setSyncStatus(readSyncStatusSnapshot());
    }

    let cancelled = false;
    function refreshBadges() {
      void readActionBadges().then((next) => {
        if (!cancelled) setBadges(next);
      });
    }

    refreshSyncStatus();
    refreshBadges();
    const interval = window.setInterval(refreshBadges, 60000);
    window.addEventListener("focus", refreshBadges);
    window.addEventListener(IMPORT_CONFLICTS_UPDATED_EVENT, refreshBadges);
    window.addEventListener("storage", refreshSyncStatus);
    window.addEventListener(SYNC_STATUS_EVENT, refreshSyncStatus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshBadges);
      window.removeEventListener(IMPORT_CONFLICTS_UPDATED_EVENT, refreshBadges);
      window.removeEventListener("storage", refreshSyncStatus);
      window.removeEventListener(SYNC_STATUS_EVENT, refreshSyncStatus);
    };
  }, []);

  const visibleItems = useMemo(
    () => getVisibleNavigationItems(activeCategory, privilegeMatrix),
    [activeCategory, privilegeMatrix],
  );

  return (
    <nav aria-label={mobile ? "Menu principal" : "Navegação principal"} className={cn("flex flex-col overflow-x-hidden", mobile ? "gap-1" : "gap-0.5")}>
      {/* No desktop o status da nuvem já aparece na barra superior. */}
      {mobile ? <SidebarSyncStatus status={syncStatus} /> : null}
      {visibleItems.map((item, index) => {
        const active = isNavigationItemActive(item, pathname);
        const Icon = item.icon;
        const startsNewGroup = visibleItems[index - 1]?.group !== item.group;
        const badge = badges[item.href];

        return (
          <div key={item.href}>
            {startsNewGroup ? (
              <p
                className={cn(
                  "type-eyebrow px-3 pb-1 text-[var(--ink-soft)]",
                  index === 0 ? "pt-1" : "mt-3 border-t border-[var(--line-ghost)] pt-4",
                )}
              >
                {navigationGroupLabels[item.group]}
              </p>
            ) : null}
            <Link
              href={item.href}
              title={badge ? `${item.label}: ${badge.label}` : item.label}
              aria-label={badge ? `${item.label} (${badge.label})` : item.label}
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 border-l-4 px-3 py-2 text-sm tracking-tight",
                "transition-all duration-200 ease-out",
                active
                  ? mobile
                    ? "rounded-xl border-[var(--brand-navy-strong)] bg-white font-black text-[var(--brand-navy-strong)] ring-1 ring-[var(--brand-blue-soft)]"
                    : "rounded-r-xl border-[var(--brand-navy-strong)] bg-white font-black text-[var(--brand-navy-strong)] shadow-[0_16px_36px_-30px_rgba(0,66,98,0.6)] ring-1 ring-[var(--brand-blue-soft)]"
                  : mobile
                    ? "rounded-xl border-transparent font-semibold text-[var(--ink-soft)] hover:bg-white hover:text-[var(--brand-navy-strong)]"
                    : "rounded-xl border-transparent font-semibold text-[var(--ink-soft)] hover:bg-white hover:text-[var(--brand-navy-strong)]",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1 font-semibold leading-tight">
                {item.label}
              </span>
              <Badge badge={badge} active={active} />
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function getVisibleNavigationItems(
  activeCategory: UserCategory,
  privilegeMatrix: ReturnType<typeof getPrivilegeMatrix>,
) {
  return navigationItems
    .filter((item) => !item.privilege || privilegeMatrix[activeCategory].includes(item.privilege))
    .map((item) => ({
      ...item,
      children: item.children?.filter(
        (child) => !child.privilege || privilegeMatrix[activeCategory].includes(child.privilege),
      ),
    }));
}

function SidebarSyncStatus({ status }: { status: SyncStatusSnapshot }) {
  return (
    <div className="mb-3">
      <SyncStatusBadge snapshot={status} className="w-full justify-start bg-white" />
    </div>
  );
}

function Badge({ badge, active }: { badge?: ActionBadge; active: boolean }) {
  if (!badge?.count) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto rounded-full px-2 py-0.5 text-caption font-black leading-none text-white",
        active ? "bg-[var(--brand-navy-strong)]" : "bg-[var(--brand-amber)]",
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
    </span>
  );
}

/**
 * Selos do menu indicam só o que pede ação: conflitos de importação a decidir.
 * Totais de registros não viram selo.
 */
export async function readActionBadges(): Promise<Record<string, ActionBadge>> {
  const conflicts = await countFrom("/api/import-conflicts", (payload) => (Array.isArray(payload.conflicts) ? payload.conflicts.length : 0));

  return conflicts ? { "/dados": { count: conflicts, label: `${countLabel(conflicts, "pendência", "pendências")} de importação` } } : {};
}

async function countFrom(url: string, count: (payload: Record<string, unknown[] | undefined>) => number) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return 0;
    return count((await response.json()) as Record<string, unknown[] | undefined>);
  } catch {
    return 0;
  }
}
