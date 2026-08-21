"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CircleHelp, LogOut, Menu, UserRound, X } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { AppVersionStamp } from "@/components/app-version-stamp";
import {
  AUTH_SESSION_UPDATED_EVENT,
  readAuthSession,
  signOutAuthSession,
  type AuthUiSession,
} from "@/components/auth-ui-client";
import { CommandPalette } from "@/components/command-palette";
import {
  InstitutionalPartners,
  YvaeMasthead,
} from "@/components/brand-signature";
import { SidebarNav } from "@/components/sidebar-nav";
import { SyncStatusBadge } from "@/components/sync-status-badge";
import { ErrorBoundary, LocalModeNotice, OperationalFeedbackLayer } from "@/components/operational-feedback";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  getPrivilegeMatrix,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { recordActivity } from "@/lib/activity-log";
import { getNavigationAccessForPath, navigationItems } from "@/lib/navigation";
import {
  SYNC_STATUS_EVENT,
  readSyncStatusSnapshot,
  type SyncStatusSnapshot,
} from "@/lib/sync-status";
import { cn } from "@/lib/utils";

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
  const [session, setSession] = useState<AuthUiSession | null>(null);
  const [activeCategory, setActiveCategory] = useState<UserCategory | null>(null);
  const [privilegeMatrix, setPrivilegeMatrix] = useState(() => getPrivilegeMatrix());
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(() => readSyncStatusSnapshot());
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);
  const mobileMenuOpen = mobileMenuPath === pathname;
  const closeMobileMenu = useCallback(() => setMobileMenuPath(null), []);
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
    let cancelled = false;
    const syncSession = () => {
      void readAuthSession().then((payload) => {
        if (!cancelled) setSession(payload.session ?? null);
      });
    };

    syncSession();
    window.addEventListener(AUTH_SESSION_UPDATED_EVENT, syncSession);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_SESSION_UPDATED_EVENT, syncSession);
    };
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

  async function signOut() {
    await signOutAuthSession();
    window.location.reload();
  }

  const showDataBackButton = pathname.startsWith("/dados/") && pathname !== "/dados/status";

  return (
    <AuthGate>
    <div className="min-h-screen bg-[var(--surface-base)] text-[var(--ink)]">
      <OperationalFeedbackLayer />
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--line-ghost)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,249,251,0.98))] p-3 shadow-[0_30px_80px_-48px_rgba(0,66,98,0.34)] lg:flex">
        <div className="mb-6 px-2">
          <YvaeMasthead />
        </div>

        <div className="mt-2 flex-1">
          <SidebarNav />
        </div>

        <div className="mt-auto pt-4">
          <AccountCard session={session} onSignOut={signOut} />
        </div>
      </aside>

      <MobileNavigationDrawer
        open={mobileMenuOpen}
        session={session}
        onClose={closeMobileMenu}
        onSignOut={signOut}
      />

      <div className="min-h-screen lg:ml-60">
        <header className="fixed left-0 right-0 top-0 z-40 h-[calc(4rem+env(safe-area-inset-top))] border-b border-[var(--line-ghost)] bg-[rgba(248,252,253,0.8)] pt-[env(safe-area-inset-top)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-md sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))] lg:left-60 lg:px-8">
          <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between gap-1 sm:gap-3 lg:gap-4">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2 lg:gap-3">
              <button
                type="button"
                aria-label="Abrir menu principal"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation-drawer"
                onClick={() => setMobileMenuPath(pathname)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--brand-navy-strong)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-blue)] lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              {showDataBackButton ? (
                <Link
                  href="/dados/status"
                  aria-label="Voltar para Entrada de Dados"
                  title="Voltar para Entrada de Dados"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--ink-soft)] transition hover:bg-white hover:text-[var(--brand-navy-strong)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              ) : null}
              <div className="min-w-0">
                <p className="hidden truncate text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)] min-[390px]:block">
                  {currentItem.summary}
                </p>
                <h2 className="heading-font truncate text-sm font-bold text-[var(--brand-navy-strong)] sm:text-base lg:text-lg">
                  {currentItem.headerTitle}
                </h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <div className="hidden md:block">
                  <SyncStatusBadge snapshot={syncStatus} />
                </div>
                <CommandPalette responsive />
                <Link
                  href="/ajuda"
                  aria-label="Ajuda"
                  title="Ajuda"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ink-soft)] transition hover:bg-white hover:text-[var(--brand-navy-strong)]"
                >
                  <CircleHelp className="h-4 w-4" />
                </Link>
            </div>
          </div>
        </header>

        <main className="flex min-h-[calc(100vh-4rem)] flex-col pt-[calc(4rem+env(safe-area-inset-top))] lg:pt-0">
          <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-6 pt-6 lg:px-8 lg:pt-24">
            <LocalModeNotice />
            {hasRouteAccess ? (
              <ErrorBoundary title={`Falha ao carregar ${currentItem.headerTitle}`}>
                {children}
              </ErrorBoundary>
            ) : (
              <AccessDeniedPanel title={currentItem.headerTitle} />
            )}
          </div>
          <footer className="border-t border-[var(--line-ghost)] bg-[rgba(255,255,255,0.88)] px-4 py-4 backdrop-blur-sm lg:px-8">
            <div className="mx-auto flex w-full max-w-[1600px] flex-col items-start gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
              <AppVersionStamp />
              <div className="flex flex-col items-start gap-3 md:items-end">
                <InstitutionalPartners compact />
                <div className="flex gap-4 text-caption uppercase tracking-[0.18em] text-[var(--ink-soft)]">
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

function MobileNavigationDrawer({
  open,
  session,
  onClose,
  onSignOut,
}: {
  open: boolean;
  session: AuthUiSession | null;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = () =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);

    drawerRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const elements = focusableElements();
      const first = elements[0];
      const last = elements.at(-1);

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === drawerRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar menu principal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45"
      />
      <aside
        ref={drawerRef}
        id="mobile-navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col overflow-hidden border-r border-[var(--line-ghost)] bg-[linear-gradient(180deg,#ffffff,#f4f9fb)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl"
      >
        <div className="flex min-h-14 items-center justify-between gap-3 px-2">
          <div className="min-w-0">
            <p id="mobile-navigation-title" className="heading-font truncate text-base font-black text-[var(--brand-navy-strong)]">
              Menu principal
            </p>
            <p className="truncate text-xs font-semibold text-[var(--brand-teal)]">Yva&apos;e Monitoramento</p>
          </div>
          <button
            type="button"
            aria-label="Fechar menu principal"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-blue)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-3">
          <SidebarNav mobile onNavigate={onClose} />
        </div>
        <div className="border-t border-[var(--line-ghost)] px-1 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <AccountCard session={session} onSignOut={onSignOut} mobile />
        </div>
      </aside>
    </div>
  );
}

function AccountCard({
  session,
  onSignOut,
  mobile = false,
}: {
  session: AuthUiSession | null;
  onSignOut: () => void;
  mobile?: boolean;
}) {
  return (
    <div className="radius-card border border-[var(--line-ghost)] bg-white/88 px-3 py-3 shadow-[0_20px_40px_-34px_rgba(0,66,98,0.22)]">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
          <UserRound className="h-4 w-4" />
        </div>
        <div className="overflow-hidden">
          <p className="truncate text-label font-bold text-[var(--brand-navy-strong)]">
            {session?.name ?? "Operador SIA"}
          </p>
          <p className="truncate text-label uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            {session?.role ?? "Acesso"}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className={cn(
          "mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--line-ghost)] bg-white px-3 text-label font-bold text-[var(--ink-soft)] transition hover:border-[var(--brand-danger)] hover:text-[var(--brand-danger)]",
          mobile ? "min-h-11 py-2" : "py-2",
        )}
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair do sistema
      </button>
    </div>
  );
}

function AccessDeniedPanel({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-6 shadow-[0_18px_50px_-44px_rgba(0,66,98,0.28)]">
      <p className="text-label font-black uppercase tracking-[0.14em] text-[var(--brand-danger)]">
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

