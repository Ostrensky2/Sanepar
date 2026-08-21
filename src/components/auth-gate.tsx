"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { YvaeMasthead } from "@/components/brand-signature";
import {
  AUTH_SESSION_UPDATED_EVENT,
  readAuthSession,
  signInWithPassword,
  type AuthUiSession,
} from "@/components/auth-ui-client";
import { persistAccessCategory } from "@/lib/access-control";

type AuthGateProps = { children: ReactNode };

export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<AuthUiSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function syncSession() {
      const payload = await readAuthSession();
      if (cancelled) return;
      if (payload.canSetPassword && (payload.purpose === "invite" || payload.purpose === "recovery")) {
        router.replace("/definir-senha");
        return;
      }
      setSession(payload.session ?? null);
      if (payload.session) persistAccessCategory(payload.session.role);
      setReady(true);
    }
    void syncSession();
    window.addEventListener(AUTH_SESSION_UPDATED_EVENT, syncSession);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_SESSION_UPDATED_EVENT, syncSession);
    };
  }, [router]);

  async function signIn() {
    if (pending) return;
    setPending(true);
    setError("");
    const submittedPassword = password;
    setPassword("");
    passwordRef.current?.blur();

    try {
      const result = await signInWithPassword(email, submittedPassword);
      if (!result.ok) {
        setError("Não foi possível entrar. Confira o e-mail e a senha e tente novamente.");
        passwordRef.current?.focus();
        return;
      }
      if (result.mustSetPassword) {
        router.replace("/definir-senha");
        return;
      }
      setSession(result.session);
      persistAccessCategory(result.session.role);
      window.dispatchEvent(new Event(AUTH_SESSION_UPDATED_EVENT));
    } finally {
      setPending(false);
    }
  }

  if (!ready) {
    return <main className="grid min-h-screen place-items-center" aria-busy="true"><span className="sr-only">Verificando sessão</span></main>;
  }
  if (session) return <>{children}</>;

  return (
    <main className="flex min-h-[100dvh] items-start justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:py-8">
      <section className="grid w-full max-w-4xl overflow-hidden radius-panel border border-[var(--line-strong)] bg-white md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div className="hero-gradient flex min-w-0 flex-col justify-center gap-6 p-5 text-white sm:p-7 md:min-h-[430px] md:p-8">
          <YvaeMasthead compact />
          <div>
            <h1 className="heading-font type-page-title">Entrada segura no Yva&apos;e</h1>
            <p className="type-metadata mt-3 max-w-md text-white/80">
              Use o e-mail cadastrado e sua senha pessoal.
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8 md:p-9">
          <div className="mb-6">
            <h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">Entrar no sistema</h2>
            <p className="type-metadata mt-2 text-[var(--ink-soft)]">Acesse o painel com sua conta individual.</p>
          </div>

          <form className="grid gap-4" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
            <label className="type-label grid gap-2 text-[var(--brand-navy-strong)]">
              E-mail
              <span className="flex h-12 items-center gap-3 radius-card border border-[var(--line-strong)] bg-white px-4 transition-colors duration-200 hover:border-[var(--brand-blue)] focus-within:border-[var(--brand-blue)] focus-within:ring-2 focus-within:ring-[var(--brand-blue-soft)]">
                <Mail className="h-4 w-4 text-[var(--ink-soft)]" />
                <input value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} type="email" autoComplete="email" required className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[var(--ink-soft)]" placeholder="nome@instituicao.com.br" />
              </span>
            </label>
            <label className="type-label grid gap-2 text-[var(--brand-navy-strong)]">
              Senha
              <span className="flex h-12 items-center gap-2 radius-card border border-[var(--line-strong)] bg-white pl-4 pr-0.5 transition-colors duration-200 hover:border-[var(--brand-blue)] focus-within:border-[var(--brand-blue)] focus-within:ring-2 focus-within:ring-[var(--brand-blue-soft)]">
                <LockKeyhole className="h-4 w-4 text-[var(--ink-soft)]" />
                <input ref={passwordRef} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} type={showPassword ? "text" : "password"} autoComplete="current-password" required aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[var(--ink-soft)]" placeholder="Digite sua senha" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="flex h-11 w-11 shrink-0 items-center justify-center radius-card text-[var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)] active:bg-[var(--surface-muted)]" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {error ? <p id="login-error" role="alert" className="radius-control bg-red-50 px-3 py-2 text-sm font-semibold leading-5 text-[var(--brand-danger)]">{error}</p> : null}
            <div className="flex items-center justify-end">
              <Link href="/recuperar-senha" className="inline-flex min-h-11 items-center radius-control px-1 text-sm font-bold text-[var(--brand-navy)] underline-offset-4 transition-colors duration-200 hover:text-[var(--brand-navy-strong)] hover:underline">Esqueci minha senha</Link>
            </div>
            <button type="submit" aria-live="polite" className="inline-flex h-12 items-center justify-center gap-2 radius-card bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white transition-colors duration-200 hover:bg-[var(--brand-navy)] active:bg-[var(--brand-navy-strong)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted-strong)] disabled:text-[var(--ink-soft)]" disabled={pending || !email.trim() || !password}>
              <LockKeyhole className="h-4 w-4" /> {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>
          <p className="type-help mt-5 border-t border-[var(--line-ghost)] pt-4 text-[var(--ink-soft)]">A equipe administrativa nunca cria nem informa sua senha.</p>
        </div>
      </section>
    </main>
  );
}
