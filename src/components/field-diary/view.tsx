"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate } from "@/components/field-diary/helpers";
import { DetailBlock, Dialog, Info } from "@/components/field-diary/ui";
import type { FieldDiaryEntry } from "@/lib/field-diary";

const governanceLabels: Record<string, string> = {
  importado: "Preliminar (importado)",
  em_revisao: "Em revisão",
  consolidado: "Consolidado",
  corrigido: "Corrigido manualmente",
};

type ChangeHistoryItem = {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  origin: string;
  changedBy: string;
  changedAt: string;
};

export function FieldDiaryView({
  entry,
  onClose,
  onEdit,
}: {
  entry: FieldDiaryEntry;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const fieldTeamMembers = entry.fieldTeamMembers ?? [];
  const photos = entry.photos ?? [];

  return (
    <Dialog title="Visualizar registro" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Data" value={formatDate(entry.entryDate)} />
          <Info label="Campanha" value={entry.campaignName} />
          <Info label="Dia" value={String(entry.campaignDay)} />
          <Info label="Equipe em campo" value={entry.fieldTeamName || "Não informado"} />
          <Info label="Membros" value={fieldTeamMembers.join(", ") || "Não informado"} />
          <Info label="Hora da coleta" value={entry.collectionTime || "Não informado"} />
          <Info label="Local / SIA" value={[entry.locationName, entry.sia].filter(Boolean).join(" · ")} />
          <Info label="Amostras e Réplicas (eDNA)" value={entry.samplesReplicasEdna || "Não informado"} />
          <Info label="ID Zooplâncton" value={entry.zooplanktonId || "Não informado"} />
          <Info label="Latitude" value={entry.latitude || "Não informado"} />
          <Info label="Longitude" value={entry.longitude || "Não informado"} />
          <Info label="Município" value={entry.municipality} />
          <Info label="Condições climáticas" value={entry.weatherConditions || "Não informado"} />
          <Info label="Acessibilidade" value={entry.pointAccessibility || "Não informado"} />
          <Info label="Responsável" value={entry.createdByName || "Não informado"} />
          <Info label="Ocorrência" value={entry.hasOccurrence ? "Sim" : "Não"} />
          <Info label="Acompanhamento" value={entry.requiresFollowUp} />
          <Info label="Status" value={entry.status} />
          <Info
            label="Governança"
            value={
              (entry.missingInImport ? "Ausente na última importação · " : "") +
              (governanceLabels[entry.governanceStatus ?? "importado"] ?? "Preliminar (importado)")
            }
          />
        </div>

        <DetailBlock label="Atividades realizadas" value={entry.activities.join(", ") || "Não informado"} />
        <DetailBlock label="Condições visuais da água" value={entry.waterVisualConditions.join(", ") || "Não informado"} />
        {entry.hasOccurrence ? (
          <>
            <DetailBlock label="Tipo de ocorrência" value={entry.occurrenceType || "Não informado"} />
            <DetailBlock label="Descrição da ocorrência" value={entry.occurrenceDescription || "Não informado"} />
          </>
        ) : null}
        <DetailBlock label="Pendência ou encaminhamento" value={entry.followUpNotes || "Sem pendência registrada"} />
        <DetailBlock label="Resumo do dia" value={entry.dailySummary} />

        {photos.length ? (
          <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
            <p className="text-caption font-bold uppercase tracking-[0.18em] text-slate-400">Imagens da coleta</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {photos.map((photo, index) => (
                <figure key={photo.id} className="overflow-hidden rounded-xl border border-[var(--line-ghost)] bg-[var(--surface-soft)]">
                  <a href={photo.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.caption || `Imagem da coleta ${index + 1}`}
                      className="aspect-video w-full object-cover"
                    />
                  </a>
                  <figcaption className="px-3 py-2 text-xs font-semibold text-slate-600">
                    {photo.caption || `Imagem ${index + 1}`}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : (
          <DetailBlock label="Imagens da coleta" value="Nenhuma imagem vinculada." />
        )}

        <ChangeHistorySection entryId={entry.id} />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
          >
            Fechar
          </button>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function ChangeHistorySection({ entryId }: { entryId: string }) {
  const [history, setHistory] = useState<ChangeHistoryItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;

    fetch(`/api/field-diary/history?entryId=${encodeURIComponent(entryId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("history"))))
      .then((payload: { history?: ChangeHistoryItem[] }) => {
        if (active) {
          setHistory(Array.isArray(payload.history) ? payload.history : []);
          setState("ready");
        }
      })
      .catch(() => {
        if (active) {
          setState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [entryId]);

  return (
    <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="text-caption font-bold uppercase tracking-[0.18em] text-slate-400">
        Histórico de alterações
      </p>
      {state === "loading" ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Carregando…</p>
      ) : state === "error" ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Não foi possível carregar o histórico.</p>
      ) : history.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Sem alterações registradas para este ponto.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {history.slice(0, 30).map((item) => (
            <li key={item.id} className="rounded-xl border border-[var(--line-ghost)] px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[var(--brand-navy-strong)]">{item.field}</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {item.origin}
                  {item.changedBy ? ` · ${item.changedBy}` : ""}
                  {item.changedAt ? ` · ${formatDate(item.changedAt.slice(0, 10))}` : ""}
                </span>
              </div>
              <div className="mt-1 text-slate-700">
                <span className="text-rose-800 line-through">{item.oldValue || "—"}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="text-emerald-800">{item.newValue || "—"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
