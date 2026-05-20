import type { ReactNode } from "react";
import { Database, Eye, FileCheck2, FileText, LockKeyhole, ShieldCheck } from "lucide-react";

const dataItems = [
  "identificação de usuários autorizados",
  "instituição de vínculo",
  "categoria, perfil ou nível de acesso",
  "registros de atividade no sistema",
  "documentos vinculados por links",
  "dados técnicos de campanhas",
  "pontos de coleta",
  "resultados laboratoriais",
  "fotografias",
  "mapas",
  "observações de campo",
  "registros operacionais e administrativos relacionados ao projeto",
];

const sharingRules = [
  "as responsabilidades institucionais de cada parte",
  "os níveis de permissão definidos",
  "a necessidade técnica de acesso",
  "a confidencialidade de dados, documentos e resultados ainda não validados",
  "as normas internas da ATGC e da Sanepar",
  "os fluxos de validação e compartilhamento definidos pelas equipes responsáveis",
];

const commitments = [
  "utilizar os dados somente para fins relacionados ao projeto Yva’e",
  "manter o acesso restrito a usuários autorizados",
  "preservar a rastreabilidade de alterações, importações e consultas relevantes",
  "evitar a exposição indevida de links, documentos, imagens e resultados",
  "respeitar os fluxos internos de validação técnica e institucional",
  "proteger informações preliminares, sensíveis ou de circulação restrita",
  "manter a organização dos registros para fins de acompanhamento, auditoria, prestação de contas e encerramento do projeto",
  "evitar o uso da plataforma para finalidades não relacionadas ao projeto",
];

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <section className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brand-teal)]">
              Política institucional
            </p>
            <h1 className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
              Privacidade e uso de dados
            </h1>
            <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">
              Esta página descreve como as informações do projeto são organizadas no Yva’e, com o objetivo de apoiar
              a colaboração técnica entre ATGC e Sanepar, fortalecendo a comunicação, a rastreabilidade, a organização
              documental, a segurança da informação e a consulta qualificada aos dados do projeto.
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PolicySection title="Finalidade do tratamento dos dados">
          <p>
            Os dados registrados no Yva’e são utilizados para apoiar a comunicação técnica, o acompanhamento
            operacional, a organização documental e a gestão das informações produzidas durante a execução do projeto
            Yva’e.
          </p>
          <p>
            A plataforma organiza documentos, resultados analíticos, campanhas de monitoramento, pontos de coleta,
            evidências de campo, registros laboratoriais, observações operacionais, imagens, mapas, relatórios e
            informações administrativas necessárias ao acompanhamento técnico e institucional do projeto.
          </p>
          <p>
            O uso dessas informações deve estar sempre vinculado às finalidades do projeto, à necessidade técnica de
            acesso e aos fluxos definidos pelas equipes responsáveis.
          </p>
        </PolicySection>

        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
          <h2 className="text-sm font-black text-[var(--brand-navy-strong)]">
            Dados que podem ser mantidos na plataforma
          </h2>
          <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            A plataforma poderá armazenar, organizar ou referenciar informações como:
          </p>
          <InfoList items={dataItems} columns />
          <p className="mt-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            Sempre que possível, os dados deverão ser organizados de forma proporcional à finalidade do projeto,
            evitando o armazenamento de informações desnecessárias ou sem relação direta com as atividades previstas.
          </p>
        </article>

        <PolicySection title="Proteção de dados pessoais">
          <p>
            Caso a plataforma trate dados pessoais, tais como identificação de usuários, e-mails institucionais,
            registros de acesso, autoria de documentos, imagens ou outros elementos associados a pessoas naturais
            identificadas ou identificáveis, esse tratamento deverá observar a legislação aplicável, especialmente a Lei
            Geral de Proteção de Dados Pessoais — LGPD, bem como as políticas e orientações institucionais pertinentes.
          </p>
          <p>
            Dados pessoais, informações sensíveis, documentos preliminares, resultados ainda não validados ou materiais
            de circulação restrita deverão ser acessados, compartilhados e armazenados apenas quando necessários às
            finalidades do projeto e por usuários devidamente autorizados.
          </p>
        </PolicySection>

        <PolicySection title="Limites de uso da plataforma">
          <p>
            O Yva’e não substitui e-mails, reuniões, ofícios, sistemas oficiais, processos administrativos, relatórios
            validados, laudos oficiais ou outros meios formais de comunicação entre as instituições.
          </p>
          <p>
            A plataforma funciona como um ambiente operacional de apoio, destinado a facilitar a disponibilização,
            localização, organização e consulta técnica de documentos, dados e resultados relacionados ao projeto.
          </p>
          <p>
            Quando houver divergência entre informações disponíveis no Yva’e e documentos, sistemas, fluxos ou
            registros oficiais definidos pelas partes, deverão prevalecer os registros institucionais formalmente
            validados.
          </p>
        </PolicySection>

        <PolicySection title="Observância às políticas institucionais">
          <p>
            O uso do Yva’e deverá observar, quando aplicável, as políticas, regulamentos, procedimentos e orientações
            institucionais da ATGC e da Sanepar, especialmente aqueles relacionados à segurança da informação, proteção
            de dados pessoais, proteção de informações, confidencialidade, integridade documental, rastreabilidade e
            comunicação institucional.
          </p>
          <p>
            Quando o uso da plataforma envolver dados, documentos, imagens, bases, registros ou materiais sujeitos a
            fluxos internos da Sanepar ou da ATGC, as equipes responsáveis deverão observar os procedimentos
            institucionais aplicáveis, inclusive quanto à autorização de compartilhamento, classificação da informação,
            validação técnica e circulação de documentos.
          </p>
        </PolicySection>

        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
          <h2 className="text-sm font-black text-[var(--brand-navy-strong)]">Compartilhamento de informações</h2>
          <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            As informações disponíveis no Yva’e devem circular apenas entre pessoas autorizadas das equipes envolvidas
            no projeto, respeitando:
          </p>
          <InfoList items={sharingRules} />
          <p className="mt-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            O compartilhamento externo de links, documentos, imagens, relatórios, mapas ou resultados deve ocorrer
            somente quando autorizado pelas equipes responsáveis.
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
              <LockKeyhole className="h-4 w-4" />
            </div>
            <div>
              <h2 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
                Responsabilidades dos usuários
              </h2>
              <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
                <p>
                  Cada usuário autorizado é responsável por proteger suas credenciais de acesso, utilizar a plataforma
                  de forma compatível com sua função no projeto e observar as orientações internas de sua instituição.
                </p>
                <p>
                  Também cabe aos usuários verificar a pertinência dos arquivos antes de compartilhar links, registrar
                  informações com atenção e tratar com cautela dados sensíveis, versões preliminares, documentos em
                  elaboração, resultados ainda não validados e materiais de circulação restrita.
                </p>
                <p>
                  Eventuais inconsistências, falhas, acessos indevidos, suspeitas de uso inadequado, exposição indevida
                  de documentos ou incidentes relacionados à segurança da informação deverão ser comunicados pelos
                  canais definidos pelas equipes responsáveis.
                </p>
              </div>
            </div>
          </div>
        </article>

        <aside className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
          <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Compromissos institucionais
          </h2>
          <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            O uso do Yva’e deve observar os seguintes compromissos:
          </p>
          <ul className="mt-3 grid gap-2">
            {commitments.map((item) => (
              <li
                key={item}
                className="grid grid-cols-[24px_1fr] gap-2 rounded-xl bg-[var(--surface-soft)] p-3 text-justify text-xs font-semibold leading-5 text-[var(--ink-soft)]"
              >
                <FileCheck2 className="mt-0.5 h-4 w-4 text-[var(--brand-teal)]" />
                <span>{item}.</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
          <Database className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">
            Retenção, correção e exclusão de informações
          </h2>
          <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            <p>
              Registros, documentos e dados técnicos deverão permanecer disponíveis enquanto forem necessários para a
              execução, acompanhamento, auditoria, prestação de contas, comunicação institucional ou encerramento do
              projeto.
            </p>
            <p>
              Correções, atualizações, substituições ou exclusões de informações deverão seguir o fluxo administrativo
              e técnico definido pelas equipes responsáveis, de modo a preservar a rastreabilidade, a integridade do
              histórico do projeto e a coerência documental da plataforma.
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
          <Eye className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">Transparência operacional</h2>
          <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            <p>
              O Yva’e poderá registrar acessos, importações, alterações, atualizações, exclusões e outras atividades
              relevantes realizadas na plataforma.
            </p>
            <p>
              Esses registros têm a finalidade de apoiar a segurança, o diagnóstico de problemas, a governança da
              informação, a rastreabilidade operacional e a integridade dos dados do projeto.
            </p>
            <p>
              O registro dessas atividades não transforma o Yva’e em canal oficial único de comunicação entre as
              instituições, nem substitui os fluxos administrativos, técnicos ou documentais formalmente definidos
              pelas partes.
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5 md:col-span-2">
          <FileText className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">Atualização desta política</h2>
          <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            <p>
              Esta política poderá ser ajustada conforme a evolução do projeto, das funcionalidades da plataforma, das
              rotinas de governança e das necessidades técnicas ou institucionais das equipes.
            </p>
            <p>Alterações relevantes deverão ser comunicadas pelos meios acordados entre as instituições envolvidas.</p>
          </div>
        </article>
      </section>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
      <h2 className="text-sm font-black text-[var(--brand-navy-strong)]">{title}</h2>
      <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">{children}</div>
    </article>
  );
}

function InfoList({ items, columns = false }: { items: string[]; columns?: boolean }) {
  return (
    <ul className={columns ? "mt-3 grid gap-2 sm:grid-cols-2" : "mt-3 grid gap-2"}>
      {items.map((item) => (
        <li
          key={item}
          className="rounded-xl border border-[var(--line-ghost)] bg-white/70 px-3 py-2 text-justify text-xs font-semibold leading-5 text-[var(--ink-soft)]"
        >
          {item};
        </li>
      ))}
    </ul>
  );
}
