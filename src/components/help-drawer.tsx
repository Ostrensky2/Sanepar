"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleHelp, X } from "lucide-react";
import { findHelpModuleForPath } from "@/lib/help-content";

/**
 * Botão "?" da barra superior. Abre um painel lateral com a ajuda da tela atual,
 * sem sair da página; a Ajuda completa continua a um clique.
 */
export function HelpButton({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const helpModule = findHelpModuleForPath(pathname);
  const fullHelpHref = pathname === "/ajuda" ? "/ajuda" : `/ajuda?tela=${encodeURIComponent(pathname)}`;
  const buttonClass =
    "flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ink-soft)] transition hover:bg-white hover:text-[var(--brand-navy-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-blue)]";

  if (!helpModule) {
    return (
      <Link href={fullHelpHref} aria-label="Ajuda" title="Ajuda" className={buttonClass}>
        <CircleHelp className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Ajuda sobre esta tela"
        title="Ajuda sobre esta tela"
        aria-haspopup="dialog"
        className={buttonClass}
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      {open ? <HelpDrawer helpModule={helpModule} fullHelpHref={fullHelpHref} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function HelpDrawer({
  helpModule,
  fullHelpHref,
  onClose,
}: {
  helpModule: NonNullable<ReturnType<typeof findHelpModuleForPath>>;
  fullHelpHref: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const Icon = helpModule.icon;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="help-drawer-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-md overflow-y-auto border-l border-[var(--line-strong)] bg-white p-0 text-[var(--ink)] backdrop:bg-slate-950/40"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--line-ghost)] bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="type-eyebrow text-[var(--brand-teal)]">Ajuda desta tela</p>
              <h2 id="help-drawer-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">
                {helpModule.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar ajuda"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 p-5 text-sm leading-6">
          <p className="text-[var(--ink-soft)]">{helpModule.purpose}</p>

          <section>
            <h3 className="type-label mb-2 font-bold text-[var(--brand-navy-strong)]">Como fazer</h3>
            <div className="space-y-2">
              {helpModule.primaryTasks.map((task) => (
                <details key={task.title} className="rounded-xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] px-3">
                  <summary className="min-h-11 cursor-pointer py-3 font-semibold text-[var(--brand-navy-strong)]">{task.title}</summary>
                  <ol className="list-decimal space-y-1 pb-3 pl-5 text-[var(--ink)]">
                    {task.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </section>

          {helpModule.troubleshooting.length ? (
            <section>
              <h3 className="type-label mb-2 font-bold text-[var(--brand-navy-strong)]">Algo não apareceu?</h3>
              <ul className="space-y-2">
                {helpModule.troubleshooting.map((item) => (
                  <li key={item.issue} className="rounded-xl border border-[var(--line-ghost)] px-3 py-2">
                    <p className="font-semibold text-[var(--brand-navy-strong)]">{item.issue}</p>
                    <p className="text-[var(--ink-soft)]">{item.action}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-[var(--line-ghost)] p-5">
          <Link
            href={fullHelpHref}
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--line-strong)] px-4 text-sm font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"
          >
            Abrir a Ajuda completa
          </Link>
        </footer>
      </div>
    </dialog>
  );
}
