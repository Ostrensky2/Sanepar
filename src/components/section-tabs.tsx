"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  getPrivilegeMatrix,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { findNavigationItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Abas das seções internas de um destino do menu (ex.: Campo | Resultados).
 * Substituem os antigos submenus da barra lateral.
 */
export function SectionTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const [category, setCategory] = useState<UserCategory | null>(null);
  const [matrix, setMatrix] = useState(() => getPrivilegeMatrix());

  useEffect(() => {
    function sync() {
      setCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setMatrix(getPrivilegeMatrix());
    }
    sync();
    window.addEventListener("yvae:access-category-updated", sync);
    window.addEventListener("yvae:access-privileges-updated", sync);
    return () => {
      window.removeEventListener("yvae:access-category-updated", sync);
      window.removeEventListener("yvae:access-privileges-updated", sync);
    };
  }, []);

  const item = findNavigationItem(pathname);
  const sections = (item?.children ?? []).filter(
    (child) => !child.privilege || !category || matrix[category].includes(child.privilege),
  );

  if (sections.length < 2) return null;

  return (
    <nav aria-label={`Seções de ${item?.label ?? "página"}`} className={cn("-mx-1 overflow-x-auto px-1", className)}>
      <ul className="flex min-w-max gap-1 border-b border-[var(--line-ghost)]">
        {sections.map((section) => {
          const active = section.href === pathname;
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "type-label -mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-blue)]",
                  active
                    ? "border-[var(--brand-navy-strong)] font-bold text-[var(--brand-navy-strong)]"
                    : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--brand-navy-strong)]",
                )}
              >
                {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
