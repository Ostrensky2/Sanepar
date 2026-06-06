"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Bell, CircleHelp, LogOut, UserRound } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { CommandPalette } from "@/components/command-palette";
import {
  InstitutionalPartners,
  YvaeMasthead,
} from "@/components/brand-signature";
import { SidebarNav } from "@/components/sidebar-nav";
import { ErrorBoundary, OperationalFeedbackLayer } from "@/components/operational-feedback";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  getPrivilegeMatrix,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { recordActivity } from "@/lib/activity-log";
import { APP_LAST_UPDATED_LABEL, APP_VERSION_LABEL } from "@/lib/app-version";
import { clearSession, getStoredSession, type AuthSession } from "@/lib/auth-users";
import { getNavigationAccessForPath, navigationItems } from "@/lib/navigation";
import {
  SYNC_STATUS_EVENT,
  readSyncStatusSnapshot,
  type SyncStatusSnapshot,
} from "@/lib/sync-status";

type AppShellProps = {
  children: ReactNode;
};

const auxiliaryPageMeta: Record<string, { summary: string; headerTitle: string }> = {
  "/privacidade": {
    summary: "uso responsavel dos dados",
    headerTitle: "Privacidade",
  },
  "/termos": {
    summary: "condicoes de uso",
    headerTitle: "Termos de Uso",
  },
  "/suporte": {
    summary: "orientacao e atendimento",
    headerTitle: "Suporte",
  },
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeCategory, setActiveCategory] = useState<UserCategory | null>(null);
  const [privilegeMatrix, setPrivilegeMatrix] = useState(() => getPrivilegeMatrix());
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(() => readSyncStatusSnapshot());
  const matchedChild = navigationItems
    .flatMap((item) => item.children ?? [])
    .find((child) => child.href === pathname);
  const currentItem =
    matchedChild ??
    navigationItems.find((item) => item.href === pathname) ??
    auxiliaryPageMeta[pathname] ??
    navigationItems[0];
  const navigationAccess = getNavigationAccessForPath(pathname);
  const hasRouteAccess =
    !navigationAccess ||
    !activeCategory ||
    navigationAccess.requiredPrivileges.every((privilege) =>
      privilegeMatrix[activeCategory].includes(privilege),
    );

  useEffect(() => {
    const syncSession = () => setSession(getStoredSession());

    syncSession();
    window.addEventListener("yvae:auth-session-updated", syncSession);

    return () => window.removeEventListener("yvae:auth-session-updated", syncSession);
  }, []);

  useEffect(() => {
    function sync() {
      setSyncStatus(readSyncStatusSnapshot());
    }

    sync();
    window.addEventListener(SYNC_STATUS_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    function syncAccess() {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setPrivilegeMatrix(getPrivilegeMatrix());
    }

    syncAccess();
    window.addEventListener("yvae:access-category-updated", syncAccess);
    window.addEventListener("yvae:access-privileges-updated", syncAccess);
    window.addEventListener("yvae:auth-session-updated", syncAccess);

    return () => {
      window.removeEventListener("yvae:access-category-updated", syncAccess);
      window.removeEventListener("yvae:access-privileges-updated", syncAccess);
      window.removeEventListener("yvae:auth-session-updated", syncAccess);
    };
  }, []);

  useEffect(() => {
    if (!session || !pathname) {
      return;
    }

    recordActivity(session, "page.view", pathname, currentItem.headerTitle);
  }, [currentItem.headerTitle, pathname, session]);

  function signOut() {
    clearSession();
    window.location.reload();
  }

  const showDataBackButton = pathname.startsWith("/dados/") && pathname !== "/dados/status";

  return (
    <AuthGate>
    <div className="min-h-screen bg-[var(--surface-base)] text-[var(--ink)]">
      <OperationalFeedbackLayer />
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-52 flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--line-ghost)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,249,251,0.98))] p-3 shadow-[0_30px_80px_-48px_rgba(0,66,98,0.34)] lg:flex">
        <div className="mb-6 px-2">
          <YvaeMasthead />
        </div>

        <div className="mt-2 flex-1">
          <SidebarNav />
        </div>

        <div className="mt-auto pt-4">
          <div className="rounded-[22px] border border-[var(--line-ghost)] bg-white/88 px-3 py-3 shadow-[0_20px_40px_-34px_rgba(0,66,98,0.22)]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="overflow-hidden">
                <p className="truncate text-[11px] font-bold text-[var(--brand-navy-strong)]">
                  {session?.name ?? "Operador SIA"}
                </p>
                <p className="truncate text-[11px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                  {session?.role ?? "Acesso"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--line-ghost)] bg-white px-3 py-2 text-[11px] font-bold text-[var(--ink-soft)] transition hover:border-[var(--brand-danger)] hover:text-[var(--brand-danger)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair do sistema
            </button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-52">
        <header className="fixed left-0 right-0 top-0 z-40 h-16 border-b border-[var(--line-ghost)] bg-[rgba(248,252,253,0.8)] px-4 backdrop-blur-md lg:left-52 lg:px-8">
          <div className="flex h-full items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {showDataBackButton ? (
                <Link
                  href="/dados/status"
                  aria-label="Voltar para Entrada de Dados"
                  title="Voltar para Entrada de Dados"
                  className="rounded-full p-2 text-[var(--ink-soft)] transition hover:bg-white hover:text-[var(--brand-navy-strong)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              ) : null}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
                  {currentItem.summary}
                </p>
                <h2 className="heading-font text-base font-bold text-[var(--brand-navy-strong)] sm:text-lg">
                  {currentItem.headerTitle}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <SyncStatusPill status={syncStatus} />
                <CommandPalette />
                <button
                  onClick={signOut}
                  aria-label="Sair"
                  title="Sair"
                  className="rounded-full p-2 text-[var(--ink-soft)] transition hover:bg-white hover:text-[var(--brand-danger)]"
                >
                  <LogOut className="h-4 w-4" />
                </button>
                <button
                  aria-label="Notificações (em breve)"
                  title="Notificações — em breve"
                  disabled
                  className="rounded-full p-2 text-[var(--ink-soft)] opacity-40 cursor-not-allowed"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <Link
                  href="/ajuda"
                  aria-label="Ajuda"
                  title="Ajuda"
                  className="rounded-full p-2 text-[var(--ink-soft)] transition hover:bg-white hover:text-[var(--brand-navy-strong)]"
                >
                  <CircleHelp className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </header>

        <div className="pt-16 lg:hidden">
          <div className="border-b border-[var(--line-ghost)] bg-white/90 px-4 py-3">
            <SidebarNav mobile />
          </div>
        </div>

        <main className="flex min-h-[calc(100vh-4rem)] flex-col">
          <div className="flex-1 px-4 pb-6 pt-6 lg:px-6 lg:pt-24">
            {hasRouteAccess ? (
              <ErrorBoundary title={`Falha ao carregar ${currentItem.headerTitle}`}>
                {children}
              </ErrorBoundary>
            ) : (
              <AccessDeniedPanel title={currentItem.headerTitle} />
            )}
          </div>
          <footer className="border-t border-[var(--line-ghost)] bg-[rgba(255,255,255,0.88)] px-4 py-4 backdrop-blur-sm lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="grid w-fit gap-1.5">
                <p className="heading-font justify-self-center text-sm font-extrabold leading-none tracking-tight text-[var(--brand-navy-strong)]">
                  Yva&apos;e Monitoramento
                </p>
                <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-[var(--brand-teal)]">
                  Plataforma institucional ATGC + Sanepar
                </p>
                <p className="text-[10px] uppercase leading-none tracking-[0.04em] text-[var(--ink-soft)]">
                  © 2026 Yva&apos;e - Sistema de Monitoramento Ambiental.
                </p>
                <p className="w-fit rounded-md border border-[var(--line-ghost)] bg-white/70 px-2.5 py-1 text-[10px] font-medium leading-none tracking-0 text-[var(--ink-soft)]">
                  {APP_VERSION_LABEL} · Última alteração em {APP_LAST_UPDATED_LABEL}
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                <InstitutionalPartners compact />
                <div className="flex gap-4 text-[9px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                  <Link className="transition hover:text-[var(--brand-navy-strong)]" href="/privacidade">
                    Privacidade
                  </Link>
                  <Link className="transition hover:text-[var(--brand-navy-strong)]" href="/termos">
                    Termos
                  </Link>
                  <Link className="transition hover:text-[var(--brand-navy-strong)]" href="/suporte">
                    Suporte
                  </Link>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
    </AuthGate>
  );
}

function SyncStatusPill({ status }: { status: SyncStatusSnapshot }) {
  const classes = {
    checking: "bg-slate-300",
    synced: "bg-[var(--brand-teal)]",
    pending: "bg-[var(--brand-amber)]",
    offline: "bg-[var(--brand-danger)]",
  };
  const label = {
    checking: "Verificando sincronização",
    synced: "Sincronizado",
    pending: "Pendente",
    offline: "Offline",
  };

  return (
    <span
      title={`${label[status.state]} — ${status.reason}`}
      className="hidden items-center gap-2 rounded-full border border-[var(--line-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--ink-soft)] md:inline-flex"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${classes[status.state]}`} />
      {label[status.state]}
    </span>
  );
}

function AccessDeniedPanel({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-6 shadow-[0_18px_50px_-44px_rgba(0,66,98,0.28)]">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--brand-danger)]">
        Acesso não liberado
      </p>
      <h1 className="heading-font mt-2 text-xl font-black text-[var(--brand-navy-strong)]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Este módulo está bloqueado para a categoria atual. Ajuste a matriz em Configurações, na área de permissões, para exibir esta tela.
      </p>
    </section>
  );
}
