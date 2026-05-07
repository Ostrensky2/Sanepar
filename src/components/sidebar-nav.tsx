"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  mobile?: boolean;
};

export function SidebarNav({ mobile = false }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn(mobile ? "flex gap-2 overflow-x-auto pb-2" : "flex flex-col gap-0.5")}>
      {navigationItems.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              mobile
                ? "min-w-max rounded-full border px-3 py-2"
                : "flex items-center gap-3 border-l-4 px-3 py-2.5 text-xs tracking-tight",
              "transition-all duration-200 ease-out",
              active
                ? mobile
                  ? "border-[var(--brand-navy-strong)] bg-[linear-gradient(135deg,var(--brand-navy-strong),var(--brand-teal))] text-white shadow-[0_18px_36px_-28px_rgba(0,66,98,0.5)]"
                  : "rounded-r-xl border-[var(--brand-blue)] bg-[var(--brand-blue-soft)] font-bold text-[var(--brand-navy-strong)]"
                : mobile
                  ? "border-[var(--line-ghost)] bg-white text-[var(--ink-soft)]"
                  : "rounded-xl border-transparent font-semibold text-[var(--ink-soft)] hover:translate-x-1 hover:bg-white hover:text-[var(--brand-navy-strong)]",
            )}
          >
            <Icon className={cn(mobile ? "h-4 w-4" : "h-[18px] w-[18px]")} />
            <span className={cn(mobile ? "text-xs font-semibold" : "font-semibold")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
