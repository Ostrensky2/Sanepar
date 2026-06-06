"use client";

import { useEffect, useState } from "react";
import { PointActionEntryPanel } from "@/components/point-action-entry-panel";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  hasPrivilege,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";

export function PointActionsRegisterPage() {
  const [activeCategory, setActiveCategory] = useState<UserCategory>(() => {
    if (typeof window === "undefined") {
      return "Admin";
    }

    return normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY));
  });

  useEffect(() => {
    function refresh() {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
    }

    window.addEventListener("storage", refresh);
    window.addEventListener("yvae:access-category-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("yvae:access-category-updated", refresh);
    };
  }, []);

  const canImport = hasPrivilege(activeCategory, "data.import");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-2 py-2 lg:px-3">
      <section>
        <h2 className="heading-font mb-1 text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
          Registrar Ação Pontual
        </h2>
        <p className="text-xs leading-5 text-slate-500">
          Entrada estruturada de ações pontuais Sanepar.
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Categoria ativa:{" "}
          <span className="text-[var(--brand-navy-strong)]">{activeCategory}</span>
          {" "}· registro {canImport ? "permitido" : "bloqueado"}
        </p>
      </section>

      <PointActionEntryPanel canImport={canImport} />
    </div>
  );
}
