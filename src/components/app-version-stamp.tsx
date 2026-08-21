import { APP_LAST_UPDATED_LABEL, APP_VERSION } from "@/lib/app-version";

export function AppVersionStamp() {
  return (
    <div
      aria-label={`Yva’e Monitoramento, plataforma institucional ATGC e Sanepar, versão atual ${APP_VERSION}, última alteração em ${APP_LAST_UPDATED_LABEL}`}
      className="grid w-fit gap-1.5"
    >
      <p className="heading-font justify-self-center text-sm font-extrabold leading-none tracking-tight text-[var(--brand-navy-strong)]">
        Yva’e Monitoramento
      </p>
      <p className="text-caption font-semibold uppercase leading-none tracking-[0.16em] text-[var(--brand-teal)]">
        PLATAFORMA INSTITUCIONAL ATGC + SANEPAR
      </p>
      <p className="text-caption uppercase leading-none tracking-[0.04em] text-[var(--ink-soft)]">
        © 2026 YVA&apos;E - SISTEMA DE MONITORAMENTO AMBIENTAL.
      </p>
      <p className="w-fit rounded-md border border-[var(--line-ghost)] bg-white/70 px-2.5 py-1 text-caption font-medium leading-none text-[var(--ink-soft)]">
        <strong className="font-bold text-[var(--brand-navy-strong)]">Versão atual</strong>{" "}
        <span className="font-black text-[var(--brand-navy-strong)]">{APP_VERSION}</span> · Última alteração em{" "}
        {APP_LAST_UPDATED_LABEL}
      </p>
    </div>
  );
}
