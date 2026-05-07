"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleHelp, UserRound } from "lucide-react";
import {
  InstitutionalPartners,
  YvaeMasthead,
} from "@/components/brand-signature";
import { SidebarNav } from "@/components/sidebar-nav";
import { navigationItems } from "@/lib/navigation";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const currentItem =
    navigationItems.find((item) => item.href === pathname) ?? navigationItems[0];

  return (
    <div className="min-h-screen bg-[var(--surface-base)] text-[var(--ink)]">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-52 flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--line-ghost)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,249,251,0.98))] p-3 shadow-[0_30px_80px_-48px_rgba(0,66,98,0.34)] lg:flex">
        <div className="mb-6 px-2">
          <YvaeMasthead />
        </div>

        <div className="mt-2 flex-1">
          <SidebarNav />
        </div>

        <div className="mt-4 border-t border-[var(--line-ghost)] pt-4">
          <button className="w-full rounded-xl bg-[linear-gradient(135deg,var(--brand-navy-strong),var(--brand-teal))] py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:brightness-105">
            Nova Campanha
          </button>
        </div>

        <div className="mt-auto pt-4">
          <div className="rounded-[22px] border border-[var(--line-ghost)] bg-white/88 px-3 py-3 shadow-[0_20px_40px_-34px_rgba(0,66,98,0.22)]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-bold text-[var(--brand-navy-strong)]">Operador SIA</p>
                <p className="text-[8px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  Sanepar Admin
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-52">
        <header className="fixed left-0 right-0 top-0 z-40 h-16 border-b border-[var(--line-ghost)] bg-[rgba(248,252,253,0.8)] px-4 backdrop-blur-md lg:left-52 lg:px-8">
          <div className="flex h-full items-center justify-between gap-4">
            <div className="flex items-center gap-4">
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
                <button
                  aria-label="Abrir notificacoes"
                  className="rounded-full p-2 text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-blue-soft)]"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <button
                  aria-label="Abrir ajuda"
                  className="rounded-full p-2 text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-blue-soft)]"
                >
                  <CircleHelp className="h-4 w-4" />
                </button>
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
          <div className="flex-1 px-4 pb-6 pt-6 lg:px-6 lg:pt-24">{children}</div>
          <footer className="border-t border-[var(--line-ghost)] bg-[rgba(255,255,255,0.88)] px-4 py-4 backdrop-blur-sm lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <div>
                  <p className="heading-font text-sm font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
                    Yva&apos;e Monitoramento
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-teal)]">
                    Plataforma institucional ATGC + Sanepar
                  </p>
                </div>
                <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                  © 2026 Yva&apos;e - Sistema de Monitoramento Ambiental.
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                <InstitutionalPartners compact />
                <div className="flex gap-4 text-[9px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                <Link href="/">Privacidade</Link>
                <Link href="/">Termos</Link>
                <Link href="/">Suporte</Link>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
