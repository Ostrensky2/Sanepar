"use client";

import { useEffect, useState } from "react";
import { AUTH_SESSION_UPDATED_EVENT } from "@/components/auth-ui-client";
import { FIELD_OUTBOX_EVENT, FIELD_OUTBOX_STORAGE_KEY, readFieldOutbox, type FieldOutboxRecord } from "@/lib/field-outbox";
import { syncFieldOutbox } from "@/lib/field-record-sync";

/** De quanto em quanto tempo o aparelho tenta mandar o que ficou guardado. */
const RETRY_INTERVAL_MS = 45000;

/**
 * Leituras que o aparelho guarda ao abrir o app com sinal, para o formulário de
 * campo funcionar no meio do mato (ver public/sw.js). Os endereços são os mesmos
 * que o formulário pede.
 */
const FIELD_DATA_TO_KEEP = [
  "/api/auth-users/session",
  "/api/role-permissions",
  "/api/campaign-management",
  "/api/field-diary",
  "/api/field-diary/point-options",
  "/api/field-diary/planned-points",
  "/api/field-diary/parameters",
  "/api/field-diary/samples?entryId=",
  "/api/field-diary/readings?entryId=",
];

/** Registros guardados neste aparelho, sempre atualizados. */
export function useFieldOutbox() {
  const [records, setRecords] = useState<FieldOutboxRecord[]>([]);

  useEffect(() => {
    const sync = () => setRecords(readFieldOutbox());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === FIELD_OUTBOX_STORAGE_KEY) sync();
    };

    sync();
    window.addEventListener(FIELD_OUTBOX_EVENT, sync);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(FIELD_OUTBOX_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return records;
}

/**
 * Fica montado enquanto há sessão: manda o que está guardado quando o sinal
 * volta, quando o app volta para a frente e de tempos em tempos; e pede ao
 * service worker para guardar os dados de campo.
 */
export function FieldOutboxSync() {
  useEffect(() => {
    let cancelled = false;

    const trySync = () => {
      if (cancelled || navigator.onLine === false || !readFieldOutbox().length) return;
      void syncFieldOutbox();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") trySync();
    };

    trySync();
    keepFieldDataOnDevice();

    const timer = window.setInterval(trySync, RETRY_INTERVAL_MS);
    window.addEventListener("online", trySync);
    window.addEventListener(AUTH_SESSION_UPDATED_EVENT, trySync);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", trySync);
      window.removeEventListener(AUTH_SESSION_UPDATED_EVENT, trySync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

/** Pede ao service worker para guardar as telas e os dados de campo (só com sinal). */
function keepFieldDataOnDevice() {
  if (!("serviceWorker" in navigator) || navigator.onLine === false) return;

  void navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({ type: "yvae:warm", data: FIELD_DATA_TO_KEEP });
    })
    .catch(() => undefined);
}
