"use client";

import { useEffect, useRef, useState } from "react";
import { readCollectionDefaultsForField } from "@/lib/campaign-management";
import { buildProjectCollectionDefaults, type CollectionDefaults } from "@/lib/field-standard";

/**
 * Padrões de coleta da campanha do registro aberto no formulário. Consultados uma
 * vez por campanha e usados pelas amostras e pelos parâmetros. Enquanto a consulta
 * não volta, valem os padrões do projeto.
 */
export function useCollectionDefaults(campaignId: string) {
  const [defaults, setDefaults] = useState<CollectionDefaults>(buildProjectCollectionDefaults);
  // Cópia sempre atual, para os toques que acontecem antes da próxima renderização.
  const defaultsRef = useRef<CollectionDefaults>(defaults);

  useEffect(() => {
    let active = true;

    void readCollectionDefaultsForField(campaignId).then((resolved) => {
      if (active) {
        defaultsRef.current = resolved.defaults;
        setDefaults(resolved.defaults);
      }
    });

    return () => {
      active = false;
    };
  }, [campaignId]);

  return { defaults, defaultsRef };
}

export type CollectionDefaultsHandle = ReturnType<typeof useCollectionDefaults>;
