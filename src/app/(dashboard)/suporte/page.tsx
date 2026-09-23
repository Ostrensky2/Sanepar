import Link from "next/link";
import { CircleHelp, Mail, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const SUPPORT_CONTACT = { name: "Aline Horodesky", email: "aline.horo@yahoo.com.br" };

const requestChecklist = [
  "o que você tentava fazer e em qual tela",
  "a campanha, ponto, documento ou dado envolvido",
  "a mensagem de erro ou uma imagem da tela, se houver",
];

const cardClass = "flex flex-col rounded-2xl border border-[var(--line-ghost)] bg-white p-5";
const actionClass = "mt-4 inline-flex min-h-11 w-fit items-center rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white hover:bg-[var(--brand-navy)]";

export default function SuportePage() {
  return (
    <div className="app-container space-y-6">
      <PageHeader
        title="Suporte"
        description="Escolha o caminho conforme a necessidade. Decisões e comunicações oficiais continuam nos canais institucionais."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <article className={cardClass}>
          <CircleHelp aria-hidden="true" className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="heading-font mt-3 text-lg font-bold text-[var(--brand-navy-strong)]">Dúvida de uso</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-[var(--ink-soft)]">Passo a passo de cada tela e o que fazer quando algo não aparece.</p>
          <Link href="/ajuda" className={actionClass}>Abrir a Ajuda</Link>
        </article>

        <article className={cardClass}>
          <Mail aria-hidden="true" className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="heading-font mt-3 text-lg font-bold text-[var(--brand-navy-strong)]">Ajuste, correção ou dado ausente</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">Escreva para a responsável pelo aplicativo:</p>
          <p className="mt-1 text-sm leading-6">
            <strong className="text-[var(--brand-navy-strong)]">{SUPPORT_CONTACT.name}</strong>
            <br />
            <span className="select-all break-all text-[var(--ink)]">{SUPPORT_CONTACT.email}</span>
          </p>
          <details className="mt-3 flex-1 text-sm">
            <summary className="min-h-11 cursor-pointer font-bold text-[var(--brand-navy-strong)]">O que informar na mensagem</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-[var(--ink-soft)]">
              {requestChecklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </details>
          <a href={`mailto:${SUPPORT_CONTACT.email}`} className={actionClass}>Escrever e-mail</a>
        </article>

        <article className={cardClass}>
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="heading-font mt-3 text-lg font-bold text-[var(--brand-navy-strong)]">Problema de acesso</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-[var(--ink-soft)]">Peça a revisão do seu cadastro ou das permissões ao administrador do ambiente. Nunca compartilhe senhas.</p>
          <Link href="/governanca" className={actionClass}>Ver Configurações</Link>
        </article>
      </section>
    </div>
  );
}
