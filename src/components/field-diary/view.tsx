"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate } from "@/components/field-diary/helpers";
import { DetailBlock, Dialog, Info } from "@/components/field-diary/ui";
import { describeCoordinateSource, formatCollectionStart } from "@/lib/collection-capture";
import {
  describeReadingDetails,
  findParameter,
  formatReadingValue,
  rangeWarning,
  type FieldParameter,
  type FieldReading,
} from "@/lib/field-parameters";
import { fetchEntryReadings } from "@/lib/field-parameters-client";
import { describeSampleCounts, describeSampleDetails, type FieldSample } from "@/lib/field-samples";
import { fetchEntrySamples } from "@/lib/field-samples-client";
import { getSampleType } from "@/lib/field-standard";
import { effectiveExecutionStatus, type FieldDiaryEntry } from "@/lib/field-diary";
import { pointExecutionStatusLabels } from "@/lib/point-execution-status";

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
  const coordinateSourceText =
    entry.latitude && entry.longitude ? describeCoordinateSource(entry.coordinateSource, entry.gpsAccuracyM) : "";
  const collectionStartText = formatCollectionStart(entry.collectionStartedAt);

  return (
    <Dialog title="Visualizar registro" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Data" value={formatDate(entry.entryDate)} />
          <Info label="Campanha" value={entry.campaignName} />
          <Info label="Dia" value={String(entry.campaignDay)} />
          <Info label="Hora da coleta" value={entry.collectionTime || "Não informado"} />
          <Info label="Local / SIA" value={[entry.locationName, entry.sia].filter(Boolean).join(" · ")} />
          <Info label="Amostras e Réplicas (eDNA)" value={entry.samplesReplicasEdna || "Não informado"} />
          <Info label="ID Zooplâncton" value={entry.zooplanktonId || "Não informado"} />
          <Info label="Latitude" value={entry.latitude || "Não informado"} />
          <Info label="Longitude" value={entry.longitude || "Não informado"} />
          {coordinateSourceText ? <Info label="Origem da coordenada" value={coordinateSourceText} /> : null}
          {collectionStartText ? <Info label="Coleta iniciada em" value={collectionStartText} /> : null}
          <Info label="Situação do ponto" value={pointExecutionStatusLabels[effectiveExecutionStatus(entry)]} />
          <Info label="Município" value={entry.municipality} />
          <Info label="Condições climáticas" value={entry.weatherConditions || "Não informado"} />
          <Info label="Acessibilidade" value={entry.pointAccessibility || "Não informado"} />
          <Info label="Equipe" value={entry.createdByName || "Não informado"} />
          {fieldTeamMembers.length ? (
            <Info label="Membros da equipe" value={fieldTeamMembers.join(", ")} />
          ) : null}
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

        {effectiveExecutionStatus(entry) === "relocated" ? (
          <DetailBlock label="Motivo da realocação" value={entry.relocationReason || "Não informado"} />
        ) : null}
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

        <SamplesSection entryId={entry.id} />
        <ReadingsSection entryId={entry.id} />

        {photos.length ? (
          <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
            <p className="text-caption font-bold text-slate-400">Imagens da coleta</p>
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

/** Amostras do ponto gravadas neste registro, com o código de cada etiqueta. */
function SamplesSection({ entryId }: { entryId: string }) {
  const [samples, setSamples] = useState<FieldSample[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");

  useEffect(() => {
    let active = true;

    void fetchEntrySamples(entryId).then((result) => {
      if (!active) {
        return;
      }

      if (!result.ok) {
        setState("error");
        return;
      }

      setSamples(result.samples);
      setState(result.available ? "ready" : "unavailable");
    });

    return () => {
      active = false;
    };
  }, [entryId]);

  // Banco ainda sem a tabela de amostras: o registro aparece como sempre apareceu.
  if (state === "unavailable") {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="text-caption font-bold text-slate-400">Amostras do ponto</p>
      {state === "loading" ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Carregando…</p>
      ) : state === "error" ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Não foi possível carregar as amostras.</p>
      ) : samples.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">Nenhuma amostra registrada neste ponto.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-700">{describeSampleCounts(samples)}.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {samples.map((sample) => (
              <li key={sample.id} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2">
                <p className="text-xs font-bold text-slate-500">
                  {getSampleType(sample.sampleType).label} {sample.sequence}
                </p>
                <p className="break-all font-mono text-sm font-black text-[var(--brand-navy-strong)]">
                  {sample.code}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  {describeSampleDetails(sample) || "Sem detalhes informados."}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Parâmetros medidos neste registro: valor, unidade e onde, quando e com que aparelho. */
function ReadingsSection({ entryId }: { entryId: string }) {
  const [readings, setReadings] = useState<FieldReading[]>([]);
  const [catalog, setCatalog] = useState<FieldParameter[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");

  useEffect(() => {
    let active = true;

    void fetchEntryReadings(entryId).then((result) => {
      if (!active) {
        return;
      }

      if (!result.ok) {
        setState("error");
        return;
      }

      setReadings(result.readings);
      setCatalog(result.parameters);
      setState(result.available ? "ready" : "unavailable");
    });

    return () => {
      active = false;
    };
  }, [entryId]);

  // Banco ainda sem as tabelas de parâmetros: o registro aparece como sempre apareceu.
  if (state === "unavailable") {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="text-caption font-bold text-slate-400">Parâmetros medidos</p>
      {state === "loading" ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Carregando…</p>
      ) : state === "error" ? (
        <p className="mt-2 text-xs text-[var(--ink-soft)]">Não foi possível carregar as medições.</p>
      ) : readings.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">Nenhum parâmetro medido neste ponto.</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {readings.map((reading) => {
            const parameter = findParameter(catalog, reading.parameterId);
            const outOfRange = parameter ? Boolean(rangeWarning(parameter, reading.value)) : false;

            return (
              <li key={reading.id} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2">
                <p className="text-xs font-bold text-slate-500">{parameter?.label ?? reading.parameterId}</p>
                <p className="text-sm font-black text-[var(--brand-navy-strong)]">
                  {formatReadingValue(reading.value, reading.unit)}
                </p>
                {describeReadingDetails(reading) ? (
                  <p className="mt-1 text-xs text-slate-700">{describeReadingDetails(reading)}</p>
                ) : null}
                {outOfRange ? (
                  <p className="mt-1 text-xs font-semibold text-amber-700">Fora da faixa esperada.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
      <p className="text-caption font-bold text-slate-400">
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
                <span className="text-xs font-semibold text-slate-400">
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
