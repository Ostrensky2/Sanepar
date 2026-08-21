import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <section className={`glass-panel radius-panel p-6 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">
            {title}
          </h2>
          {description ? (
            <p className="type-metadata mt-2 text-[var(--ink-soft)]">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

