"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { YvaeMasthead } from "@/components/brand-signature";
import { requestPasswordRecovery } from "@/components/auth-ui-client";

export function PasswordRecoveryForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    const submittedEmail = email;
    setEmail("");
    const publicMessage = await requestPasswordRecovery(submittedEmail);
    setMessage(publicMessage);
    setPending(false);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-[var(--line-ghost)] bg-white p-6 shadow-[0_34px_100px_-60px_rgba(0,66,98,0.55)] sm:p-9">
        <YvaeMasthead />
        <div className="mt-8">
          <p className="type-eyebrow text-[var(--brand-teal)]">Recuperação de acesso</p>
          <h1 className="heading-font type-page-title mt-2 text-[var(--brand-navy-strong)]">Redefinir minha senha</h1>
          <p className="type-body mt-3 text-[var(--ink-soft)]">
            Informe seu e-mail. Por segurança, a confirmação exibida será a mesma para qualquer endereço.
          </p>
        </div>

        <form className="mt-7 grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label className="type-label grid gap-2 text-[var(--brand-navy-strong)]">
            E-mail
            <span className="flex h-12 items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-white px-4 focus-within:border-[var(--brand-blue)]">
              <Mail className="h-4 w-4 text-[var(--ink-soft)]" />
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" placeholder="nome@instituicao.com.br" />
            </span>
          </label>
          <button type="submit" disabled={pending || !email.trim()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" /> {pending ? "Enviando…" : "Enviar instruções"}
          </button>
        </form>

        {message ? <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-900">{message}</div> : null}
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--brand-navy)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Voltar para o login
        </Link>
      </section>
    </main>
  );
}
