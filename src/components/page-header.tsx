import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  aside?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: PageHeaderProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)] xl:items-start">
      <div>
        {eyebrow ? (
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--brand-teal-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            <span className="h-2 w-2 rounded-full bg-[var(--brand-teal)]" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="heading-font text-balance text-4xl font-extrabold tracking-tight text-[var(--brand-navy-strong)] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--ink-soft)] sm:text-lg">
          {description}
        </p>
      </div>
      {aside}
    </div>
  );
}
