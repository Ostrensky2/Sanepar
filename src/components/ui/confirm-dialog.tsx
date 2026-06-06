"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ações destrutivas pintam o botão de confirmação em vermelho. */
  tone?: "default" | "danger";
};

type ConfirmState = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [mounted, setMounted] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  const confirm = useCallback<ConfirmContextValue>((options) => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (confirmed: boolean) => {
      setState((current) => {
        current?.resolve(confirmed);
        return null;
      });
      // Restaura o foco para o elemento que abriu o diálogo.
      previouslyFocused.current?.focus?.();
    },
    [],
  );

  useEffect(() => {
    if (!state) {
      return;
    }

    confirmButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted && state
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center px-4"
              role="presentation"
            >
              <div
                className="absolute inset-0 bg-[rgba(0,38,58,0.45)] backdrop-blur-sm"
                onClick={() => close(false)}
                aria-hidden="true"
              />
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby={state.description ? "confirm-dialog-description" : undefined}
                className="relative w-full max-w-md rounded-2xl border border-[var(--line-ghost)] bg-white p-6 shadow-[0_40px_100px_-50px_rgba(0,66,98,0.6)]"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      state.tone === "danger"
                        ? "bg-[rgba(186,26,26,0.1)] text-[var(--brand-danger)]"
                        : "bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]",
                    )}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2
                      id="confirm-dialog-title"
                      className="heading-font text-lg font-black text-[var(--brand-navy-strong)]"
                    >
                      {state.title}
                    </h2>
                    {state.description ? (
                      <p
                        id="confirm-dialog-description"
                        className="mt-2 text-sm leading-6 text-[var(--ink-soft)]"
                      >
                        {state.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="h-11 rounded-xl border border-[var(--line-strong)] bg-white px-5 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
                  >
                    {state.cancelLabel ?? "Cancelar"}
                  </button>
                  <button
                    ref={confirmButtonRef}
                    type="button"
                    onClick={() => close(true)}
                    className={cn(
                      "h-11 rounded-xl px-5 text-sm font-black text-white shadow-sm transition",
                      state.tone === "danger"
                        ? "bg-[var(--brand-danger)] hover:brightness-95"
                        : "bg-[var(--brand-navy-strong)] hover:brightness-110",
                    )}
                  >
                    {state.confirmLabel ?? "Confirmar"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  }

  return context;
}
