"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

/**
 * Agrupa os provedores de UI compartilhados (toasts e diálogos de confirmação)
 * disponíveis para toda a área autenticada do app.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
