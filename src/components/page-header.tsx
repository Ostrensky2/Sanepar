import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  /** Uma linha de contexto. Explicações longas vão para o ícone de ajuda (`help`). */
  description?: ReactNode;
  /** Ícone "?" de explicação, exibido logo após o título. */
  help?: ReactNode;
  /** Ações principais da página (botões), alinhadas à direita no desktop. */
  actions?: ReactNode;
  aside?: ReactNode;
  /** Abas de seção (SectionTabs) logo abaixo do título. */
  tabs?: ReactNode;
};

/**
 * Cabeçalho padrão das páginas. O caminho (breadcrumb) fica na barra superior,
 * então aqui aparecem só o título, uma linha de contexto e as ações.
 */
export function PageHeader({ eyebrow, title, description, help, actions, aside, tabs }: PageHeaderProps) {
  const heading = <h1 className="heading-font type-page-title text-balance text-[var(--brand-navy-strong)]">{title}</h1>;
  return (
    <header className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="type-eyebrow mb-1 text-[var(--brand-teal)]">{eyebrow}</p> : null}
          {help ? <div className="flex items-center gap-1">{heading}{help}</div> : heading}
          {description ? (
            <p className="type-body mt-2 max-w-[70ch] text-[var(--ink-soft)]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        {aside}
      </div>
      {tabs}
    </header>
  );
}
