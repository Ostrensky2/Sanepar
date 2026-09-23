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
    <div className="space-y-4">
      <PointActionEntryPanel canImport={canImport} />
    </div>
  );
}
