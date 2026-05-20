"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  getPrivilegeMatrix,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  mobile?: boolean;
};

export function SidebarNav({ mobile = false }: SidebarNavProps) {
  const pathname = usePathname();
  const [activeCategory, setActiveCategory] = useState<UserCategory>("ATGC");
  const [privilegeMatrix, setPrivilegeMatrix] = useState(() => getPrivilegeMatrix());

  useEffect(() => {
    function sync() {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setPrivilegeMatrix(getPrivilegeMatrix());
    }

    sync();
    window.addEventListener("yvae:access-category-updated", sync);
    window.addEventListener("yvae:access-privileges-updated", sync);
    window.addEventListener("yvae:auth-session-updated", sync);

    return () => {
      window.removeEventListener("yvae:access-category-updated", sync);
      window.removeEventListener("yvae:access-privileges-updated", sync);
      window.removeEventListener("yvae:auth-session-updated", sync);
    };
  }, []);

  const visibleItems = useMemo(
    () =>
      navigationItems
        .filter((item) => !item.privilege || privilegeMatrix[activeCategory].includes(item.privilege))
        .map((item) => ({
          ...item,
          children: item.children?.filter(
            (child) => !child.privilege || privilegeMatrix[activeCategory].includes(child.privilege),
          ),
        })),
    [activeCategory, privilegeMatrix],
  );

  return (
    <nav className={cn(mobile ? "flex gap-2 overflow-x-auto pb-2" : "flex flex-col gap-0.5")}>
      {visibleItems.map((item, index) => {
        const childHrefs = item.children?.map((child) => child.href) ?? [];
        const childActive = childHrefs.includes(pathname);
        const active = pathname === item.href || childActive;
        const Icon = item.icon;
        const startsNewGroup =
          !mobile && item.group !== "regular" && visibleItems[index - 1]?.group !== item.group;
        const hasChildren = !mobile && item.children && item.children.length > 0;

        return (
          <div key={item.href} className={startsNewGroup ? "mt-4 border-t border-[var(--line-ghost)] pt-4" : undefined}>
            <Link
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

            {hasChildren && (
              <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-[var(--line-ghost)] pl-3">
                {item.children!.map((child) => {
                  const childIsActive = pathname === child.href;
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] tracking-tight transition-all duration-200 ease-out",
                        childIsActive
                          ? "bg-[var(--brand-blue-soft)] font-bold text-[var(--brand-navy-strong)]"
                          : "font-semibold text-[var(--ink-soft)] hover:translate-x-0.5 hover:bg-white hover:text-[var(--brand-navy-strong)]",
                      )}
                    >
                      {ChildIcon ? <ChildIcon className="h-3.5 w-3.5" /> : null}
                      <span>{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {mobile && item.children?.map((child) => {
              const childIsActive = pathname === child.href;
              const ChildIcon = child.icon;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    "ml-2 inline-flex min-w-max items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all",
                    childIsActive
                      ? "border-[var(--brand-navy-strong)] bg-[var(--brand-navy-strong)] text-white"
                      : "border-[var(--line-ghost)] bg-white text-[var(--ink-soft)]",
                  )}
                >
                  {ChildIcon ? <ChildIcon className="h-3 w-3" /> : null}
                  {child.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
