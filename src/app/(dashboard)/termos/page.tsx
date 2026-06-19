import { ClipboardCheck, FileText, Handshake, MessagesSquare } from "lucide-react";

const useItems = [
  "consultar documentos, registros e resultados associados ao projeto",
  "registrar, revisar ou acompanhar dados técnicos de campanhas e ações pontuais",
  "organizar evidências, imagens, mapas, relatórios e informações operacionais",
  "compartilhar links e documentos somente com pessoas autorizadas",
  "utilizar a plataforma como apoio à consulta técnica, ao acompanhamento do projeto e à gestão organizada das informações",
  "manter os fluxos institucionais formais sempre que exigidos",
  "respeitar permissões, responsabilidades e orientações das equipes envolvidas",
  "proteger dados, documentos e resultados de acesso indevido ou circulação não autorizada",
];

export default function TermosPage() {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-justify text-sm leading-6 text-[var(--ink-soft)]">
        Estes termos orientam o uso da plataforma Yva’e como ambiente de apoio à comunicação, organização
        técnica, rastreabilidade e consulta de informações entre ATGC e Sanepar durante a execução do projeto
        Yva’e.
      </p>

      <section className="rounded-2xl border border-[var(--line-ghost)] bg-[var(--brand-teal-soft)] p-5">
        <div className="flex items-start gap-4">
          <MessagesSquare className="mt-1 h-5 w-5 shrink-0 text-[var(--brand-teal)]" />
          <div>
            <h2 className="text-sm font-black text-[var(--brand-navy-strong)]">Declaração central</h2>
            <p className="mt-2 text-justify text-sm leading-6 text-[var(--brand-navy-strong)]">
              O Yva’e facilita o acesso a documentos, registros, evidências, dados técnicos e resultados do projeto,
              mas não constitui canal único de comunicação nem substitui os métodos formais, administrativos ou
              convencionais adotados pelas instituições envolvidas.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TermSection title="Natureza da plataforma">
          <p>
            O Yva’e é uma ferramenta de apoio operacional ao projeto Yva’e. Sua função é aproximar as equipes técnicas
            da ATGC e da Sanepar, facilitando a disponibilização, localização, organização e consulta de documentos,
            resultados, evidências de campo, registros laboratoriais, imagens, mapas e informações de acompanhamento.
          </p>
          <p>
            A plataforma deve ser compreendida como um ambiente complementar de gestão da informação, voltado à
            rastreabilidade, transparência operacional, organização documental e apoio à consulta técnica dos materiais
            relacionados ao projeto.
          </p>
        </TermSection>

        <TermSection title="Uso complementar">
          <p>
            O APP não substitui comunicações formais, sistemas institucionais, e-mails, reuniões, atas, contratos,
            relatórios oficiais, ofícios, pareceres, laudos validados ou demais procedimentos administrativos adotados
            pelas instituições.
          </p>
          <p>
            Quando houver divergência entre informações disponíveis no Yva’e e documentos, sistemas, fluxos ou
            registros oficiais definidos pelas partes, deverão prevalecer os registros institucionais formalmente
            validados.
          </p>
        </TermSection>

        <TermSection title="Observância às políticas institucionais">
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
        </TermSection>

        <TermSection title="Acesso autorizado">
          <p>
            O uso da plataforma é reservado a pessoas autorizadas pelas equipes responsáveis pelo projeto.
          </p>
          <p>
            Cada usuário deve acessar apenas as informações compatíveis com sua função, manter suas credenciais
            protegidas e comunicar, pelos canais definidos pelas equipes responsáveis, eventuais inconsistências,
            falhas, acessos indevidos, suspeitas de uso inadequado, exposição indevida de documentos ou incidentes
            relacionados à segurança da informação.
          </p>
          <p>
            O acesso à plataforma poderá ser ajustado, suspenso ou revogado conforme as necessidades operacionais,
            técnicas, administrativas ou institucionais do projeto.
          </p>
        </TermSection>

        <TermSection title="Proteção de dados pessoais">
          <p>
            Caso a plataforma trate dados pessoais, tais como identificação de usuários, e-mails institucionais,
            registros de acesso, autoria de documentos, imagens ou outros elementos associados a pessoas naturais
            identificadas ou identificáveis, esse tratamento deverá observar a legislação aplicável, especialmente a Lei
            Geral de Proteção de Dados Pessoais — LGPD, bem como as políticas e orientações institucionais pertinentes.
          </p>
          <p>
            Dados pessoais, informações sensíveis, documentos preliminares ou materiais de circulação restrita deverão
            ser acessados, compartilhados e armazenados apenas quando necessários às finalidades do projeto e por
            usuários devidamente autorizados.
          </p>
        </TermSection>

        <TermSection title="Conteúdo publicado">
          <p>
            Documentos, planilhas, fotografias, mapas, resultados analíticos, registros de campo e demais informações
            deverão ser inseridos com boa-fé, clareza, organização e aderência ao contexto técnico do projeto.
          </p>
          <p>
            Sempre que possível, os conteúdos deverão conter informações mínimas de identificação, como data,
            responsável pelo envio, reservatório, campanha, ponto de coleta, tipo de registro, versão do documento e
            situação do material, quando aplicável.
          </p>
          <p>
            Materiais preliminares, versões em elaboração, resultados ainda não validados, documentos restritos ou
            conteúdos sujeitos à revisão técnica deverão ser identificados ou tratados conforme orientação da equipe
            responsável, evitando que sejam interpretados como registros oficiais ou conclusivos antes da devida
            validação.
          </p>
        </TermSection>

        <TermSection title="Disponibilidade da plataforma">
          <p>
            A plataforma busca manter as informações organizadas, acessíveis e atualizadas, mas poderá passar por
            manutenções, ajustes técnicos, indisponibilidades temporárias, correções, atualizações ou alterações de
            funcionalidade.
          </p>
          <p>
            Nessas situações, os canais convencionais de comunicação e os fluxos institucionais permanecem válidos para
            garantir a continuidade das atividades do projeto.
          </p>
        </TermSection>

        <TermSection title="Governança do ambiente">
          <p>
            Os administradores da plataforma poderão ajustar permissões, corrigir cadastros, revisar metadados, remover
            links inadequados, organizar conteúdos, executar backups, verificar registros de atividade e adotar medidas
            necessárias para preservar a integridade operacional do ambiente.
          </p>
          <p>
            Essas ações têm como finalidade manter a segurança, a rastreabilidade, a organização, a confiabilidade e a
            governança das informações disponíveis no Yva’e.
          </p>
        </TermSection>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]">
              <Handshake className="h-4 w-4" />
            </div>
            <div>
              <h2 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
                Responsabilidade compartilhada
              </h2>
              <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
                <p>A qualidade do ambiente depende da colaboração dos usuários autorizados.</p>
                <p>
                  É responsabilidade compartilhada manter informações corretas, links atualizados, registros
                  compreensíveis, documentos bem identificados e respeito aos níveis de permissão definidos pelas
                  equipes.
                </p>
                <p>
                  Erros, dados incompletos, documentos pendentes, links quebrados, divergências ou inconsistências
                  devem ser comunicados de forma clara para que possam ser avaliados e corrigidos pelas equipes
                  responsáveis.
                </p>
              </div>
            </div>
          </div>
        </article>

        <aside className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
          <h2 className="text-label font-black uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Uso adequado da plataforma
          </h2>
          <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">O uso adequado do Yva’e inclui:</p>
          <ul className="mt-3 grid gap-2">
            {useItems.map((item) => (
              <li
                key={item}
                className="grid grid-cols-[24px_1fr] gap-2 rounded-xl bg-[var(--surface-soft)] p-3 text-justify text-xs font-semibold leading-5 text-[var(--ink-soft)]"
              >
                <ClipboardCheck className="mt-0.5 h-4 w-4 text-[var(--brand-teal)]" />
                <span>{item};</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
          <FileText className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">Limitações de uso</h2>
          <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            <p>
              O Yva’e não deve ser utilizado para substituir decisões institucionais formais, validações técnicas
              oficiais, atos administrativos, manifestações jurídicas, comunicações obrigatórias ou registros que devam
              tramitar em sistemas próprios da ATGC, da Sanepar ou de outros órgãos competentes.
            </p>
            <p>
              A plataforma apoia a organização e a consulta das informações, mas não altera responsabilidades
              contratuais, institucionais, técnicas ou administrativas previamente definidas entre as partes.
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
          <FileText className="h-5 w-5 text-[var(--brand-teal)]" />
          <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">Atualização destes termos</h2>
          <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">
            <p>
              Estes termos poderão ser ajustados conforme a evolução do projeto, das rotinas de governança, das
              funcionalidades da plataforma e das necessidades técnicas ou institucionais das equipes.
            </p>
            <p>Alterações relevantes deverão ser comunicadas pelos meios acordados entre as instituições envolvidas.</p>
          </div>
        </article>
      </section>
    </div>
  );
}

function TermSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-5">
      <h2 className="text-sm font-black text-[var(--brand-navy-strong)]">{title}</h2>
      <div className="mt-2 space-y-3 text-justify text-sm leading-6 text-[var(--ink-soft)]">{children}</div>
    </article>
  );
}

