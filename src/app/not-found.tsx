import Link from "next/link";
import { Compass, House } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="glass-panel w-full max-w-xl rounded-[32px] p-8 text-center">
        <span className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
          <Compass className="h-7 w-7" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
          Yva&apos;e Monitoramento
        </p>
        <h1 className="heading-font mt-2 text-5xl font-black tracking-tight text-[var(--brand-navy-strong)]">
          404
        </h1>
        <p className="heading-font mt-2 text-xl font-bold text-[var(--brand-navy-strong)]">
          Página não encontrada
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          O endereço acessado não existe ou foi movido. Volte ao painel para continuar
          o monitoramento.
        </p>

        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-2"
          >
            <House className="h-4 w-4" />
            Voltar ao painel
          </Link>
        </div>
      </section>
    </main>
  );
}
