"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Duração em ms. Use 0 para manter até o usuário dispensar. */
  duration?: number;
};

type Toast = ToastOptions & { id: number; tone: ToastTone };

type ToastContextValue = {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  warning: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneConfig: Record<
  ToastTone,
  { icon: typeof Info; accent: string; ring: string; label: string }
> = {
  success: {
    icon: CheckCircle2,
    accent: "text-[var(--brand-green)]",
    ring: "border-l-[var(--brand-green)]",
    label: "Sucesso",
  },
  error: {
    icon: XCircle,
    accent: "text-[var(--brand-danger)]",
    ring: "border-l-[var(--brand-danger)]",
    label: "Erro",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-[var(--brand-amber)]",
    ring: "border-l-[var(--brand-amber)]",
    label: "Atenção",
  },
  info: {
    icon: Info,
    accent: "text-[var(--brand-blue)]",
    ring: "border-l-[var(--brand-blue)]",
    label: "Informação",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setMounted(true);
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      const tone = options.tone ?? "info";
      const duration = options.duration ?? (tone === "error" ? 7000 : 4500);

      setToasts((current) => [...current, { ...options, id, tone }]);

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "error" }),
      warning: (title, description) => toast({ title, description, tone: "warning" }),
      info: (title, description) => toast({ title, description, tone: "info" }),
    }),
    [dismiss, toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              aria-live="polite"
              aria-relevant="additions"
              className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
            >
              {toasts.map((item) => {
                const config = toneConfig[item.tone];
                const Icon = config.icon;
                return (
                  <div
                    key={item.id}
                    role="status"
                    className={cn(
                      "pointer-events-auto flex items-start gap-3 rounded-xl border border-[var(--line-ghost)] border-l-4 bg-white px-4 py-3 shadow-[0_24px_60px_-32px_rgba(0,66,98,0.45)] animate-[toast-in_180ms_ease-out]",
                      config.ring,
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", config.accent)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--brand-navy-strong)]">
                        {item.title}
                      </p>
                      {item.description ? (
                        <p className="mt-0.5 text-xs leading-5 text-[var(--ink-soft)]">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(item.id)}
                      aria-label="Dispensar notificação"
                      className="rounded-full p-1 text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  }

  return context;
}
