"use client";

import { useEffect, useState } from "react";
import { getStoredSession, type AuthSession } from "@/lib/auth-users";

/**
 * Lê a sessão autenticada do armazenamento e mantém-na sincronizada
 * com o evento "yvae:auth-session-updated" disparado em login/logout
 * e entre abas. Centraliza um padrão repetido em vários componentes.
 */
export function useSession(): AuthSession | null {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const sync = () => setSession(getStoredSession());

    sync();
    window.addEventListener("yvae:auth-session-updated", sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener("yvae:auth-session-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return session;
}
