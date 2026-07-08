"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ImportConflict = {
  id: string;
  batch_id: string;
  entity_type: string;
  entity_key: string;
  field_name: string;
  app_value: unknown;
  sheet_value: unknown;
  created_at: string;
};

export function ImportConflictsPageContent() {
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    void loadConflicts();
  }, []);

  const groupedConflicts = useMemo(() => {
    const groups = new Map<string, ImportConflict[]>();

    for (const conflict of conflicts) {
      const key = conflict.entity_key;
      groups.set(key, [...(groups.get(key) ?? []), conflict]);
    }

    return [...groups.entries()];
  }, [conflicts]);

  async function loadConflicts() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/import-conflicts", { cache: "no-store" });
      const payload = (await response.json()) as { conflicts?: ImportConflict[]; error?: string };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Não foi possível carregar pendências.");
      }

      setConflicts(payload.conflicts ?? []);
      setSelectedIds([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar pendências.");
    } finally {
      setIsLoading(false);
    }
  }

  async function resolveConflicts(ids: string[], resolution: "app" | "planilha") {
    if (!ids.length) {
      setError("Selecione pelo menos uma pendência.");
      return;
    }

    setIsResolving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/import-conflicts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, resolution }),
      });
      const payload = (await response.json()) as { resolved?: number; error?: string };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Não foi possível resolver pendências.");
      }

      setConflicts((current) => current.filter((conflict) => !ids.includes(conflict.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setMessage(`${payload.resolved ?? ids.length} pendência(s) marcada(s) como resolvida(s).`);
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Não foi possível resolver pendências.");
    } finally {
      setIsResolving(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
            Revise conflitos detectados durante a importação aditiva. A decisão fica registrada sem sobrescrever automaticamente os dados existentes.
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            {conflicts.length} pendências abertas
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadConflicts()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-[var(--brand-navy-strong)]"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </section>

      {selectedIds.length ? (
        <section className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-soft)] p-3">
          <span className="text-xs font-bold text-[var(--brand-navy-strong)]">
            {selectedIds.length} selecionada(s)
          </span>
          <button
            type="button"
            disabled={isResolving}
            onClick={() => void resolveConflicts(selectedIds, "app")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            Usar app
          </button>
          <button
            type="button"
            disabled={isResolving}
            onClick={() => void resolveConflicts(selectedIds, "planilha")}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-3 text-xs font-bold text-white disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            Usar planilha
          </button>
        </section>
      ) : null}

      {message ? (
        <p className="rounded-lg bg-[rgba(0,168,107,0.08)] px-4 py-3 text-xs font-semibold text-[#0b5f40]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-[rgba(186,26,26,0.08)] px-4 py-3 text-xs font-semibold text-[var(--brand-danger)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        {isLoading ? (
          <div className="glass-panel radius-panel p-4 text-sm font-semibold text-slate-500">
            Carregando pendências...
          </div>
        ) : null}

        {!isLoading && !groupedConflicts.length ? (
          <div className="glass-panel radius-panel p-4 text-sm font-semibold text-slate-500">
            Nenhuma pendência aberta.
          </div>
        ) : null}

        {groupedConflicts.map(([entityKey, items]) => (
          <article key={entityKey} className="glass-panel radius-panel overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Registro
              </p>
              <h2 className="mt-1 text-sm font-black text-[var(--brand-navy-strong)]">
                {entityKey}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="w-10 px-4 py-3" />
                    <th className="px-4 py-3 font-bold text-slate-500">Campo</th>
                    <th className="px-4 py-3 font-bold text-slate-500">Valor no app</th>
                    <th className="px-4 py-3 font-bold text-slate-500">Valor da planilha</th>
                    <th className="px-4 py-3 font-bold text-slate-500">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((conflict) => (
                    <tr key={conflict.id}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(conflict.id)}
                          onChange={() => toggleSelected(conflict.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-bold text-[var(--brand-navy-strong)]">
                        {conflict.field_name}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">
                        {formatValue(conflict.app_value)}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">
                        {formatValue(conflict.sheet_value)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isResolving}
                            onClick={() => void resolveConflicts([conflict.id], "app")}
                            className="rounded-md border border-slate-200 px-2 py-1 font-bold text-slate-600 disabled:opacity-60"
                          >
                            Usar app
                          </button>
                          <button
                            type="button"
                            disabled={isResolving}
                            onClick={() => void resolveConflicts([conflict.id], "planilha")}
                            className="rounded-md bg-[var(--brand-navy-strong)] px-2 py-1 font-bold text-white disabled:opacity-60"
                          >
                            Usar planilha
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join("; ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value ?? "").trim();
  return text || "Vazio";
}
