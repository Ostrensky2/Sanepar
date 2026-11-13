"use client";

import { useCallback, useEffect, useRef } from "react";
import { readCampaignPlannedPoints, type CampaignPlannedPoint } from "@/lib/nearest-point";

/**
 * Pontos da campanha com a coordenada planejada, para achar o mais próximo do
 * celular. Consultados uma vez quando o formulário abre; sem sinal, vem a cópia
 * que o aparelho guardou (public/sw.js). Sem permissão ou sem cópia, a lista fica
 * vazia e o registro segue como antes.
 */
export function usePlannedPoints() {
  const loadingRef = useRef<Promise<CampaignPlannedPoint[]> | null>(null);

  const load = useCallback(() => {
    loadingRef.current ??= fetch("/api/field-diary/planned-points", { cache: "no-store" })
      .then(async (response) => (response.ok ? readCampaignPlannedPoints(await response.json()) : []))
      .catch(() => [] as CampaignPlannedPoint[])
      .then((points) => {
        // Lista vazia: a próxima leitura do GPS tenta de novo.
        if (!points.length) {
          loadingRef.current = null;
        }
        return points;
      });

    return loadingRef.current;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return load;
}
