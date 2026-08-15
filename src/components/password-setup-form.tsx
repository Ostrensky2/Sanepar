"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldAlert } from "lucide-react";
import { YvaeMasthead } from "@/components/brand-signature";
import { readAuthSession, signOutAuthSession, updateRecoveryPassword } from "@/components/auth-ui-client";

type SetupState = "checking" | "invalid" | "ready" | "saved";

export function PasswordSetupForm() {
  const firstPasswordRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SetupState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readAuthSession().then((payload) => {
      if (cancelled) return;
      const allowedPurpose = payload.purpose === "invite" || payload.purpose === "recovery";
      setState(payload.canSetPassword && allowedPurpose ? "ready" : "invalid");
    });
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    if (pending || state !== "ready") return;
    if (password.length < 12) {
      setError("Use pelo menos 12 caracteres. Uma frase longa e exclusiva é recomendada.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas informadas não conferem.");
      return;
    }

    setPending(true);
    setError("");
    const submittedPassword = password;
    setPassword("");
    setConfirmation("");
    firstPasswordRef.current?.blur();
    const saved = await updateRecoveryPassword(submittedPassword);
    setPending(false);
    if (!saved) {
      setState("invalid");
      return;
    }
    await signOutAuthSession();
    setState("saved");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-[var(--line-ghost)] bg-white p-6 shadow-[0_34px_100px_-60px_rgba(0,66,98,0.55)] sm:p-9">
        <YvaeMasthead />
        {state === "checking" ? <div className="mt-8" aria-busy="true"><p className="text-sm font-bold text-[var(--ink-soft)]">Validando o link seguro…</p></div> : null}
        {state === "invalid" ? (
          <div className="mt-8">
            <ShieldAlert className="h-8 w-8 text-[var(--brand-danger)]" />
            <h1 className="heading-font mt-4 text-2xl font-black text-[var(--brand-navy-strong)]">Link inválido ou expirado</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">A senha só pode ser definida durante uma sessão válida de convite ou recuperação.</p>
            <Link href="/recuperar-senha" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white">Solicitar novo link</Link>
          </div>
        ) : null}
        {state === "saved" ? (
          <div className="mt-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-700" />
            <h1 className="heading-font mt-4 text-2xl font-black text-[var(--brand-navy-strong)]">Senha definida com segurança</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">A sessão temporária foi encerrada. Entre novamente com sua nova senha.</p>
            <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white">Ir para o login</Link>
          </div>
        ) : null}
        {state === "ready" ? (
          <div className="mt-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand-teal)]">Link verificado</p>
            <h1 className="heading-font mt-2 text-2xl font-black text-[var(--brand-navy-strong)]">Defina sua nova senha</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Use uma senha longa, exclusiva e diferente das utilizadas em outros serviços.</p>
            <form className="mt-7 grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <PasswordInput ref={firstPasswordRef} label="Nova senha" value={password} onChange={setPassword} show={show} onToggle={() => setShow((current) => !current)} autoComplete="new-password" />
              <PasswordInput label="Confirmar nova senha" value={confirmation} onChange={setConfirmation} show={show} onToggle={() => setShow((current) => !current)} autoComplete="new-password" />
              {error ? <p role="alert" className="text-sm font-semibold text-[var(--brand-danger)]">{error}</p> : null}
              <button type="submit" disabled={pending || !password || !confirmation} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                <LockKeyhole className="h-4 w-4" /> {pending ? "Salvando…" : "Salvar nova senha"}
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const PasswordInput = forwardRef<HTMLInputElement, { label: string; value: string; onChange: (value: string) => void; show: boolean; onToggle: () => void; autoComplete: string }>(function PasswordInput({ label, value, onChange, show, onToggle, autoComplete }, ref) {
  return (
    <label className="grid gap-2 text-sm font-bold text-[var(--brand-navy-strong)]">
      {label}
      <span className="flex h-12 items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-white px-4 focus-within:border-[var(--brand-blue)]">
        <LockKeyhole className="h-4 w-4 text-[var(--ink-soft)]" />
        <input ref={ref} value={value} onChange={(event) => onChange(event.target.value)} type={show ? "text" : "password"} autoComplete={autoComplete} maxLength={128} required className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
        <button type="button" onClick={onToggle} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]" aria-label={show ? "Ocultar senha" : "Mostrar senha"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </span>
    </label>
  );
});
