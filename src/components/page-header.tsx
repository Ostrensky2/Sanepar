"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getBreadcrumbsForPath } from "@/lib/navigation";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  aside?: ReactNode;
  backHref?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
  backHref,
}: PageHeaderProps) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbsForPath(pathname);
  const shouldShowBreadcrumbs = breadcrumbs.length > 2;
  const contextualBackHref =
    backHref ?? (pathname.startsWith("/dados/") && pathname !== "/dados/status" ? "/dados/status" : null);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)] xl:items-start">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {contextualBackHref ? (
            <Link
              href={contextualBackHref}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--line-ghost)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--ink-soft)] transition hover:text-[var(--brand-navy-strong)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Link>
          ) : null}
          {shouldShowBreadcrumbs ? (
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold text-[var(--ink-soft)]">
              {breadcrumbs.map((breadcrumb, index) => {
                const isLast = index === breadcrumbs.length - 1;

                return (
                  <span key={`${breadcrumb.href}-${breadcrumb.label}`} className="inline-flex items-center gap-1.5">
                    {isLast ? (
                      <span className="text-[var(--brand-navy-strong)]">{breadcrumb.label}</span>
                    ) : (
                      <Link className="transition hover:text-[var(--brand-navy-strong)]" href={breadcrumb.href}>
                        {breadcrumb.label}
                      </Link>
                    )}
                    {!isLast ? <ChevronRight className="h-3 w-3 text-slate-400" /> : null}
                  </span>
                );
              })}
            </nav>
          ) : null}
        </div>
        {eyebrow ? (
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--brand-teal-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            <span className="h-2 w-2 rounded-full bg-[var(--brand-teal)]" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="heading-font text-balance text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
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
