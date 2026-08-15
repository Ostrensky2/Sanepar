import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getVisibleNavigationItems } from "@/components/sidebar-nav";
import { getPrivilegeMatrix } from "@/lib/access-control";

const appShellSource = readFileSync("src/components/app-shell.tsx", "utf8");
const sidebarSource = readFileSync("src/components/sidebar-nav.tsx", "utf8");
const commandPaletteSource = readFileSync("src/components/command-palette.tsx", "utf8");
const layoutSource = readFileSync("src/app/layout.tsx", "utf8");

describe("mobile navigation", () => {
  it("reuses privilege filtering for the drawer", () => {
    const matrix = getPrivilegeMatrix();
    matrix.UFPR = ["nav.home", "nav.help"];

    const items = getVisibleNavigationItems("UFPR", matrix);

    expect(items.map((item) => item.href)).toEqual(["/", "/ajuda"]);
  });

  it("provides dialog semantics, close paths, focus management and scroll lock", () => {
    expect(appShellSource).toContain('aria-expanded={mobileMenuOpen}');
    expect(appShellSource).toContain('aria-controls="mobile-navigation-drawer"');
    expect(appShellSource).toContain('role="dialog"');
    expect(appShellSource).toContain('aria-modal="true"');
    expect(appShellSource).toContain('event.key === "Escape"');
    expect(appShellSource).toContain('event.key !== "Tab"');
    expect(appShellSource).toContain('document.body.style.overflow = "hidden"');
    expect(appShellSource).toContain("previouslyFocused?.focus()");
  });

  it("keeps desktop navigation and makes mobile navigation vertical and touch-safe", () => {
    expect(appShellSource).toContain("lg:flex");
    expect(sidebarSource).not.toContain("overflow-x-auto");
    expect(sidebarSource).toContain("min-h-11");
    expect(appShellSource).toContain("onNavigate={onClose}");
    expect(layoutSource).toContain('viewportFit: "cover"');
  });

  it("keeps search usable in narrow headers and accounts for display safe areas", () => {
    expect(appShellSource).toContain("<CommandPalette responsive />");
    expect(commandPaletteSource).toContain('responsive = false');
    expect(commandPaletteSource).toContain('"inline-flex h-11 w-11 justify-center');
    expect(commandPaletteSource).toContain('responsive ? "hidden md:inline"');
    expect(appShellSource).toContain('<div className="hidden md:block">');
    expect(appShellSource).not.toContain('className="hidden md:inline-flex"');
    expect(appShellSource).toContain("h-[calc(4rem+env(safe-area-inset-top))]");
    expect(appShellSource).toContain("pl-[max(0.5rem,env(safe-area-inset-left))]");
    expect(appShellSource).toContain("pr-[max(0.5rem,env(safe-area-inset-right))]");
    expect(appShellSource).toContain("pt-[calc(4rem+env(safe-area-inset-top))]");
  });

  it("marks only the exact route as current while keeping parent visual state", () => {
    expect(sidebarSource).toContain('aria-current={pathname === item.href ? "page" : undefined}');
    expect(sidebarSource).toContain('aria-current={childIsActive ? "page" : undefined}');
    expect(sidebarSource).not.toContain('aria-current={active ? "page" : undefined}');
  });
});
