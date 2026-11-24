"use client";

import { useContext, useEffect, useState } from "react";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  hasPrivilege,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { GeneratedWorkbookList, WorkbookOwner } from "./generated-workbooks";
import { SiaMatricesPreparation } from "@/components/sia-matrices-preparation";

// A publicação da planilha antiga do laboratório ("fluxo legado") foi desativada em 24/11/2026:
// os resultados entram só pelas matrizes por SIA, preparadas nesta tela.
function useSpreadsheetAccess() {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<UserCategory>("Admin");
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setHasLoaded(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    function refreshAccessCategory() {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
    }

    window.addEventListener("storage", refreshAccessCategory);
    window.addEventListener("yvae:access-category-updated", refreshAccessCategory);

    return () => {
      window.removeEventListener("storage", refreshAccessCategory);
      window.removeEventListener("yvae:access-category-updated", refreshAccessCategory);
    };
  }, []);

  const canImportSpreadsheets = hasLoaded && hasPrivilege(activeCategory, "data.import");
  return { hasLoaded, canImportSpreadsheets };
}

export function SpreadsheetRepository() {
  const { hasLoaded, canImportSpreadsheets } = useSpreadsheetAccess();
  const owner = useContext(WorkbookOwner);
  return <>
    <section aria-labelledby="unified-workbooks-title" className="app-card min-w-0 space-y-3">
      <h2 id="unified-workbooks-title" className="type-section-title">Planilhas unificadas por campanha</h2>
      {!hasLoaded ? <p role="status">Verificando acesso às planilhas…</p>
        : !canImportSpreadsheets ? <p role="status">Sua categoria não tem permissão para consultar estas planilhas.</p>
        : owner ? <GeneratedWorkbookList key={owner} owner={owner} />
        : <p role="status">Aguardando identificação da sessão.</p>}
    </section>
    <SiaMatricesPreparation key={owner ?? "pending"} canImport={canImportSpreadsheets} />
  </>;
}
