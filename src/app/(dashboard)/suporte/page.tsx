import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Mail, MailCheck, Route, Wrench } from "lucide-react";

const supportFlows = [
  {
    title: "Dúvidas de uso",
    body: [
      "Para dúvidas operacionais, consulte primeiro a Ajuda do Yva’e. Ela apresenta orientações sobre os módulos da plataforma, rotinas principais, controles de tela, navegação e problemas comuns.",
    ],
    action: "Abrir Ajuda",
    href: "/ajuda",
  },
  {
    title: "Documento ou resultado ausente",
    body: [
      "Caso um documento, planilha, resultado ou registro não seja localizado, verifique inicialmente se o material foi disponibilizado no módulo correto.",
      "Documentos, relatórios, apresentações e arquivos institucionais devem ser consultados no módulo Documentos. Planilhas, importações e bases estruturadas devem ser verificadas no módulo Dados. Resultados, campanhas, pontos de coleta e registros operacionais aparecem nas telas correspondentes após a publicação ou validação pela equipe responsável.",
    ],
    action: "Ir para Documentos",
    href: "/documentos",
  },
  {
    title: "Problema de acesso",
    body: [
      "Em caso de dificuldade de acesso, ausência de permissão, cadastro incorreto ou limitação de visualização, solicite a revisão do cadastro, da categoria de usuário ou das permissões ao responsável administrativo do ambiente.",
      "Não compartilhe senhas, não utilize credenciais de outra pessoa e não repasse links restritos a usuários não autorizados.",
    ],
    action: "Ver Configurações",
    href: "/governanca",
  },
];

const supportRequestItems = [
  "o que estava tentando fazer",
  "o módulo ou tela em que ocorreu o problema",
  "a campanha, ponto de coleta, documento ou dado relacionado",
  "a data e o horário aproximado da ocorrência",
  "a mensagem de erro exibida, quando houver",
  "imagem da tela ou exemplo do problema, quando possível",
];

export default function SuportePage() {
  return (
    <div className="space-y-5">
      <div className="max-w-3xl space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
        <p>
          Este suporte orienta o uso do Yva’e como ambiente de apoio à comunicação, organização técnica e
          consulta de informações entre ATGC e Sanepar.
        </p>
        <p>
          Para demandas formais, decisões institucionais, autorizações, validações técnicas ou comunicações
          oficiais, devem ser mantidos também os canais convencionais definidos pelas equipes responsáveis.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {supportFlows.map((flow) => (
          <article
            key={flow.title}
            className="flex flex-col rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5"
          >
            <h2 className="text-sm font-black text-[var(--brand-navy-strong)]">{flow.title}</h2>
            <div className="mt-2 flex-1 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
              {flow.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <Link
              href={flow.href}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white px-4 text-xs font-black text-[var(--brand-navy-strong)] shadow-sm transition hover:border-[var(--brand-teal)] hover:text-[var(--brand-teal)]"
            >
              {flow.action}
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <SupportSection icon={<Wrench className="h-4 w-4" />} title="Solicitações de ajustes no APP">
          <p>
            Solicitações de ajustes, correções, melhorias, alterações de interface, inclusão de novos controles,
            revisão de dados exibidos ou qualquer necessidade relacionada ao funcionamento do APP deverão ser
            encaminhadas à responsável indicada:
          </p>
          <div className="rounded-xl border border-[var(--line-ghost)] bg-white/80 p-4 text-left">
            <p className="text-sm font-black text-[var(--brand-navy-strong)]">Aline Horodesky</p>
            <a
              href="mailto:aline.horo@yahoo.com.br"
              className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-teal)]"
            >
              <Mail className="h-4 w-4" />
              aline.horo@yahoo.com.br
            </a>
          </div>
          <p>
            Ao encaminhar a solicitação, informe com clareza o problema, a tela ou módulo envolvido, o contexto da
            demanda e, sempre que possível, imagens da tela, mensagem de erro ou exemplo do dado/documento relacionado.
          </p>
        </SupportSection>

        <aside className="rounded-2xl border border-[rgba(197,122,0,0.24)] bg-[rgba(197,122,0,0.05)] p-5">
          <AlertTriangle className="h-5 w-5 text-[var(--brand-amber)]" />
          <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">Importante</h2>
          <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            O Yva’e facilita o acesso a informações, documentos, dados técnicos e resultados do projeto, mas não
            substitui protocolos, aprovações, registros oficiais, validações técnicas ou comunicações formais entre as
            instituições.
          </p>
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <SupportSection icon={<Route className="h-4 w-4" />} title="Fluxo recomendado">
          <p>Para dúvidas simples de navegação ou operação, utilize primeiro a Ajuda do Yva’e.</p>
          <p>
            Quando o problema envolver documentos, dados, campanhas, pontos de coleta ou resultados, consulte o módulo
            correspondente e verifique se o material já foi disponibilizado ou publicado.
          </p>
          <p>
            Quando a situação exigir confirmação formal, autorização, decisão técnica, validação institucional ou
            encaminhamento fora do APP, acione os responsáveis institucionais pelos canais convencionais definidos
            entre as equipes.
          </p>
        </SupportSection>

        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
          <MailCheck className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">Ao pedir apoio</h2>
          <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            Ao solicitar suporte, procure informar:
          </p>
          <ul className="mt-3 grid gap-2">
            {supportRequestItems.map((item) => (
              <li
                key={item}
                className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-justify text-xs font-semibold leading-5 text-[var(--ink-soft)]"
              >
                {item};
              </li>
            ))}
          </ul>
          <p className="mt-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            Demandas críticas, formais ou que envolvam decisão institucional devem ser registradas também pelos canais
            previamente combinados entre ATGC e Sanepar.
          </p>
        </article>
      </section>

      <SupportSection icon={<Wrench className="h-4 w-4" />} title="Manutenção e melhoria">
        <p>
          Sugestões de melhoria, erros de interface, inconsistências em dados, links quebrados, documentos ausentes,
          problemas de visualização e necessidades de novos controles devem ser comunicados com contexto suficiente
          para que a equipe responsável consiga avaliar, reproduzir, priorizar e corrigir a situação.
        </p>
        <p>
          As solicitações relacionadas ao APP devem ser encaminhadas à Aline Horodesky, pelo e-mail{" "}
          <a href="mailto:aline.horo@yahoo.com.br" className="font-semibold text-[var(--brand-teal)]">
            aline.horo@yahoo.com.br
          </a>
          .
        </p>
      </SupportSection>
    </div>
  );
}

function SupportSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">{title}</h2>
          <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">{children}</div>
        </div>
      </div>
    </article>
  );
}

