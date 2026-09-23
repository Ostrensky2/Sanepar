"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronRight,
  History,
  Search,
} from "lucide-react";
import { ReleaseNotes } from "@/components/release-notes";
import { APP_VERSION } from "@/lib/app-version";
import { cn } from "@/lib/utils";
import { generalTopics, helpModuleForPath, helpModules, type HelpModule } from "@/lib/help-content";

export default function AjudaPage() {
  const [query, setQuery] = useState("");
  const [activeTitle, setActiveTitle] = useState(helpModules[0].title);
  // Ajuda › Versões fica fora da lista de módulos; abre também por /ajuda?secao=versoes.
  const [showVersions, setShowVersions] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Em telas estreitas a lista de módulos vem antes do conteúdo: leva a pessoa direto ao que escolheu.
  function revealContent() {
    if (!window.matchMedia("(max-width: 1279px)").matches) return;
    requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("secao") === "versoes") {
      queueMicrotask(() => { setShowVersions(true); revealContent(); });
      return;
    }
    const target = helpModuleForPath(params.get("tela"));
    if (target && helpModules.some((module) => module.title === target)) queueMicrotask(() => setActiveTitle(target));
  }, []);
  const normalizedQuery = normalize(query);
  const filteredModules = useMemo(() => {
    if (!normalizedQuery) {
      return helpModules;
    }

    return helpModules.filter((module) => normalize(searchableText(module)).includes(normalizedQuery));
  }, [normalizedQuery]);
  const activeModule =
    filteredModules.find((module) => module.title === activeTitle) ??
    filteredModules[0] ??
    helpModules.find((module) => module.title === activeTitle) ??
    helpModules[0];
  const ActiveIcon = activeModule.icon;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="heading-font type-page-title text-[var(--brand-navy-strong)]">Ajuda</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
            Como usar cada tela, passo a passo, e o que fazer quando algo não aparece.
          </p>
        </div>
        <label className="flex h-11 items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-white px-4 lg:min-w-[340px]">
          <Search className="h-4 w-4 text-[var(--ink-soft)]" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setShowVersions(false); }}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            placeholder="Buscar módulo, ação, erro ou palavra-chave..."
          />
        </label>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-4 xl:sticky xl:top-4 xl:self-start">
          <p className="text-label font-black text-[var(--ink-soft)]">
            Módulos
          </p>
          <div className="mt-3 grid gap-2">
            {filteredModules.map((module) => {
              const Icon = module.icon;
              const isActive = !showVersions && module.title === activeModule.title;

              return (
                <button
                  key={module.title}
                  type="button"
                  onClick={() => { setActiveTitle(module.title); setShowVersions(false); revealContent(); }}
                  className={cn(
                    "grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                    isActive
                      ? "border-[var(--brand-teal)] bg-[var(--brand-teal-soft)]"
                      : "border-transparent hover:border-[var(--line-ghost)] hover:bg-[var(--surface-soft)]",
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[var(--brand-teal)] shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-[var(--brand-navy-strong)]">
                      {module.title}
                    </span>
                    <span className="mt-0.5 block truncate text-label font-semibold text-[var(--ink-soft)]">
                      {module.short}
                    </span>
                  </span>
                  <ChevronRight className={cn("h-4 w-4 text-[var(--ink-soft)]", isActive && "text-[var(--brand-teal)]")} />
                </button>
              );
            })}
          </div>

          {!filteredModules.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)] p-4 text-sm font-semibold text-[var(--ink-soft)]">
              Nenhum módulo encontrado.
            </div>
          ) : null}

          <p className="mt-5 border-t border-[var(--line-ghost)] pt-4 text-label font-black text-[var(--ink-soft)]">
            Sobre o app
          </p>
          <button
            type="button"
            aria-pressed={showVersions}
            onClick={() => { setShowVersions(true); revealContent(); }}
            className={cn(
              "mt-3 grid w-full grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
              showVersions
                ? "border-[var(--brand-teal)] bg-[var(--brand-teal-soft)]"
                : "border-transparent hover:border-[var(--line-ghost)] hover:bg-[var(--surface-soft)]",
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[var(--brand-teal)] shadow-sm">
              <History className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-[var(--brand-navy-strong)]">Versões</span>
              <span className="mt-0.5 block truncate text-label font-semibold text-[var(--ink-soft)]">
                O que mudou · em uso: {APP_VERSION}
              </span>
            </span>
            <ChevronRight className={cn("h-4 w-4 text-[var(--ink-soft)]", showVersions && "text-[var(--brand-teal)]")} />
          </button>
        </aside>

        <div ref={contentRef} className="min-w-0 scroll-mt-4">
        {showVersions ? <ReleaseNotes /> : <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-3">
            {generalTopics.map((topic) => (
              <article key={topic.title} className="rounded-2xl border border-[var(--line-ghost)] bg-white/88 p-4">
                <p className="text-sm font-black text-[var(--brand-navy-strong)]">{topic.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{topic.body}</p>
              </article>
            ))}
          </section>

          <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-caption font-black text-[var(--brand-teal)]">
                    Módulo selecionado
                  </p>
                  <h2 className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
                    {activeModule.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
                    {activeModule.purpose}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-black text-[var(--brand-navy-strong)]">
                {activeModule.primaryTasks.length} rotinas
              </span>
            </header>

            <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_360px]">
              <div className="space-y-5">
                <HelpBlock title="Quando usar">
                  <ul className="grid gap-2">
                    {activeModule.whenToUse.map((item) => (
                      <li key={item} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold leading-6 text-[var(--brand-navy-strong)]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </HelpBlock>

                <HelpBlock title="Rotinas principais">
                  <div className="grid gap-3">
                    {activeModule.primaryTasks.map((task, index) => (
                      <section key={task.title} className="rounded-xl border border-[var(--line-ghost)] bg-white p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-blue-soft)] text-xs font-black text-[var(--brand-navy)]">
                            {index + 1}
                          </span>
                          <h3 className="text-sm font-black text-[var(--brand-navy-strong)]">{task.title}</h3>
                        </div>
                        <ol className="mt-3 grid gap-2">
                          {task.steps.map((step) => (
                            <li key={step} className="grid grid-cols-[18px_1fr] gap-2 text-sm leading-6 text-[var(--ink-soft)]">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--brand-teal)]" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ))}
                  </div>
                </HelpBlock>
              </div>

              <aside className="space-y-4">
                <HelpBlock title="Controles da tela">
                  <div className="grid gap-2">
                    {activeModule.controls.map((control) => (
                      <div key={control.label} className="rounded-xl border border-[var(--line-ghost)] bg-white p-3">
                        <p className="text-xs font-black text-[var(--brand-navy-strong)]">{control.label}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{control.detail}</p>
                      </div>
                    ))}
                  </div>
                </HelpBlock>

                <HelpBlock title="Regras importantes">
                  <ul className="grid gap-2">
                    {activeModule.notes.map((note) => (
                      <li key={note} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--ink-soft)]">
                        {note}
                      </li>
                    ))}
                  </ul>
                </HelpBlock>

                <HelpBlock title="Problemas comuns">
                  <div className="grid gap-2">
                    {activeModule.troubleshooting.map((item) => (
                      <div key={item.issue} className="rounded-xl border border-[rgba(197,122,0,0.24)] bg-[rgba(197,122,0,0.05)] p-3">
                        <p className="text-xs font-black text-[var(--brand-navy-strong)]">{item.issue}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{item.action}</p>
                      </div>
                    ))}
                  </div>
                </HelpBlock>
              </aside>
            </div>
          </article>
        </div>}
        </div>
      </section>
    </div>
  );
}

function HelpBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-label font-black text-[var(--ink-soft)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function searchableText(module: HelpModule) {
  return [
    module.title,
    module.short,
    module.purpose,
    ...module.whenToUse,
    ...module.primaryTasks.flatMap((task) => [task.title, ...task.steps]),
    ...module.controls.flatMap((control) => [control.label, control.detail]),
    ...module.notes,
    ...module.troubleshooting.flatMap((item) => [item.issue, item.action]),
    ...module.keywords,
  ].join(" ");
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

