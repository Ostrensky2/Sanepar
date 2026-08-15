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
import { APP_DOCUMENTS_STORAGE_KEY } from "@/lib/app-documents";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import { FIELD_DIARY_STORAGE_KEY } from "@/lib/field-diary";
import { navigationItems } from "@/lib/navigation";
import { POINT_ACTIONS_STORAGE_KEY } from "@/lib/point-actions";
import {
  SYNC_STATUS_EVENT,
  readSyncStatusSnapshot,
  type SyncStatusSnapshot,
} from "@/lib/sync-status";
import { SyncStatusBadge } from "@/components/sync-status-badge";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export function SidebarNav({ mobile = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const [activeCategory, setActiveCategory] = useState<UserCategory>("ATGC");
  const [privilegeMatrix, setPrivilegeMatrix] = useState(() => getPrivilegeMatrix());
  const [badges, setBadges] = useState<Record<string, number>>({});
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
    function refreshNavigationState() {
      setBadges(readSidebarBadges());
      setSyncStatus(readSyncStatusSnapshot());
    }

    refreshNavigationState();
    const interval = window.setInterval(refreshNavigationState, 15000);
    window.addEventListener("storage", refreshNavigationState);
    window.addEventListener("focus", refreshNavigationState);
    window.addEventListener("yvae:documents-updated", refreshNavigationState);
    window.addEventListener("yvae:spreadsheets-updated", refreshNavigationState);
    window.addEventListener("yvae:field-diary-updated", refreshNavigationState);
    window.addEventListener("yvae:point-actions-updated", refreshNavigationState);
    window.addEventListener(SYNC_STATUS_EVENT, refreshNavigationState);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", refreshNavigationState);
      window.removeEventListener("focus", refreshNavigationState);
      window.removeEventListener("yvae:documents-updated", refreshNavigationState);
      window.removeEventListener("yvae:spreadsheets-updated", refreshNavigationState);
      window.removeEventListener("yvae:field-diary-updated", refreshNavigationState);
      window.removeEventListener("yvae:point-actions-updated", refreshNavigationState);
      window.removeEventListener(SYNC_STATUS_EVENT, refreshNavigationState);
    };
  }, []);

  const visibleItems = useMemo(
    () => getVisibleNavigationItems(activeCategory, privilegeMatrix),
    [activeCategory, privilegeMatrix],
  );

  return (
    <nav aria-label={mobile ? "Menu principal" : "Navegação principal"} className={cn("flex flex-col overflow-x-hidden", mobile ? "gap-1" : "gap-0.5")}>
      <SidebarSyncStatus status={syncStatus} />
      {visibleItems.map((item, index) => {
        const childHrefs = item.children?.map((child) => child.href) ?? [];
        const childActive = childHrefs.includes(pathname);
        const active = pathname === item.href || childActive;
        const Icon = item.icon;
        const startsNewGroup =
          item.group !== "regular" && visibleItems[index - 1]?.group !== item.group;
        const hasChildren = item.children && item.children.length > 0;

        return (
          <div key={item.href} className={startsNewGroup ? "mt-4 border-t border-[var(--line-ghost)] pt-4" : undefined}>
            <Link
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                mobile
                  ? "flex min-h-11 items-center gap-3 rounded-xl border-l-4 px-3 py-2.5 text-sm tracking-tight"
                  : "flex items-center gap-3 border-l-4 px-3 py-2.5 text-xs tracking-tight",
                "transition-all duration-200 ease-out",
                active
                  ? mobile
                    ? "border-[var(--brand-navy-strong)] bg-white font-black text-[var(--brand-navy-strong)] ring-1 ring-[var(--brand-blue-soft)]"
                    : "rounded-r-xl border-[var(--brand-navy-strong)] bg-white font-black text-[var(--brand-navy-strong)] shadow-[0_16px_36px_-30px_rgba(0,66,98,0.6)] ring-1 ring-[var(--brand-blue-soft)]"
                  : mobile
                    ? "border-transparent font-semibold text-[var(--ink-soft)] hover:bg-white hover:text-[var(--brand-navy-strong)]"
                    : "rounded-xl border-transparent font-semibold text-[var(--ink-soft)] hover:translate-x-1 hover:bg-white hover:text-[var(--brand-navy-strong)]",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {item.label}
              </span>
              <Badge count={badges[item.href]} active={active} />
            </Link>

            {hasChildren && (
              <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-[var(--line-ghost)] pl-3">
                {item.children!.map((child) => {
                  const childIsActive = pathname === child.href;
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      title={child.label}
                      aria-label={child.label}
                      aria-current={childIsActive ? "page" : undefined}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 tracking-tight transition-all duration-200 ease-out",
                        mobile ? "min-h-11 py-2 text-sm" : "py-1.5 text-label",
                        childIsActive
                          ? "bg-white font-black text-[var(--brand-navy-strong)] shadow-sm ring-1 ring-[var(--brand-blue-soft)]"
                          : "font-semibold text-[var(--ink-soft)] hover:translate-x-0.5 hover:bg-white hover:text-[var(--brand-navy-strong)]",
                      )}
                    >
                      {ChildIcon ? <ChildIcon className="h-3.5 w-3.5" /> : null}
                      <span className="min-w-0 flex-1 truncate">{child.label}</span>
                      <Badge count={badges[child.href]} active={childIsActive} />
                    </Link>
                  );
                })}
              </div>
            )}
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

function Badge({ count, active }: { count?: number; active: boolean }) {
  if (!count) return null;

  return (
    <span
      className={cn(
        "ml-auto rounded-full px-2 py-0.5 text-caption font-black leading-none",
        active
          ? "bg-[var(--brand-navy-strong)] text-white"
          : "bg-[var(--surface-soft)] text-[var(--ink-soft)]",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function readSidebarBadges() {
  const documents = readArrayCount(APP_DOCUMENTS_STORAGE_KEY);
  const diary = canUseBrowserOnlyPersistence() ? readArrayCount(FIELD_DIARY_STORAGE_KEY) : 0;
  const pointActions = readArrayCount(POINT_ACTIONS_STORAGE_KEY);
  const spreadsheets = readArray("yvae:spreadsheets");
  const fieldSheets = spreadsheets.filter((item) => readString(item, "kind") === "Campo").length;
  const resultSheets = spreadsheets.filter((item) => readString(item, "kind") === "Laboratório").length;

  return {
    "/documentos": documents,
    "/dados/campo": fieldSheets,
    "/dados/resultados": resultSheets,
    "/dados/diario-de-campo": diary,
    "/acoes-pontuais": pointActions,
    "/dados/acoes-pontuais": pointActions,
  };
}

function readArrayCount(key: string) {
  return readArray(key).length;
}

function readArray(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : "";
}

