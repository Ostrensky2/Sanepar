"use client";

import { Pencil } from "lucide-react";
import { formatDate } from "@/components/field-diary/helpers";
import { DetailBlock, Dialog, Info } from "@/components/field-diary/ui";
import type { FieldDiaryEntry } from "@/lib/field-diary";

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
