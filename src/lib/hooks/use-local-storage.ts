"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Estado persistido em localStorage com sincronização entre abas.
 * Útil para reduzir leituras manuais e duplicação de listeners de "storage".
 *
 * Aceita um `eventName` opcional para sincronizar com os eventos customizados
 * já usados na aplicação (ex.: "yvae:auth-session-updated").
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  eventName?: string,
) {
  const readValue = useCallback((): T => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  }, [initialValue, key]);

  const [value, setValue] = useState<T>(initialValue);

  // Hidrata após montar para evitar mismatch de SSR.
  useEffect(() => {
    setValue(readValue());
  }, [readValue]);

  const persist = useCallback(
    (next: T) => {
      setValue(next);

      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Armazenamento indisponível (modo privado / cota cheia): mantém em memória.
      }

      if (eventName) {
        window.dispatchEvent(new Event(eventName));
      }
    },
    [eventName, key],
  );

  useEffect(() => {
    function sync() {
      setValue(readValue());
    }

    window.addEventListener("storage", sync);

    if (eventName) {
      window.addEventListener(eventName, sync);
    }

    return () => {
      window.removeEventListener("storage", sync);

      if (eventName) {
        window.removeEventListener(eventName, sync);
      }
    };
  }, [eventName, readValue]);

  return [value, persist] as const;
}
