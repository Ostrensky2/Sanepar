"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RefreshCcw, TriangleAlert } from "lucide-react";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("Falha ao renderizar a página do painel:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <section
        role="alert"
        className="glass-panel w-full max-w-xl rounded-[32px] p-8 text-center"
      >
        <span className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(186,26,26,0.12)] text-[var(--brand-danger)]">
          <TriangleAlert className="h-7 w-7" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--brand-danger)]">
          Algo não saiu como esperado
        </p>
        <h1 className="heading-font mt-2 text-2xl font-black text-[var(--brand-navy-strong)]">
          Não foi possível carregar esta página
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          Ocorreu um erro ao montar o conteúdo. Você pode tentar novamente ou voltar
          para o painel inicial. Se o problema continuar, registre uma solicitação em
          Suporte.
        </p>
        {error.digest ? (
          <p className="mt-4 inline-block rounded-md border border-[var(--line-ghost)] bg-white/70 px-2.5 py-1 font-mono text-[11px] text-[var(--ink-soft)]">
            Código de referência: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Tentar novamente
          </button>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-5 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-2"
          >
            <House className="h-4 w-4" />
            Voltar ao painel
          </Link>
        </div>
      </section>
    </div>
  );
}
