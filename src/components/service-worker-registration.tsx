"use client";

import { useEffect } from "react";

/**
 * Liga o modo sem sinal (public/sw.js). Só no app publicado: no computador de
 * desenvolvimento o service worker atrapalharia ver as mudanças na hora.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error: unknown) => {
      console.warn("[offline] service worker não registrado", error);
    });

    // Pede ao navegador para não apagar sozinho o que ficou guardado para o campo.
    void navigator.storage?.persist?.().catch(() => false);
  }, []);

  return null;
}
