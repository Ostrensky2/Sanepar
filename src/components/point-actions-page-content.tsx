"use client";

import { Camera, CheckCircle2, ExternalLink, FileSpreadsheet, FlaskConical, Link2, MapPinned, Target, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CampaignHydroMap,
  type CampaignHydroMapPoint,
  type CampaignMapLayerVisibility,
} from "@/components/campaign-hydro-map";
import {
  readPointActions,
  type PointActionEvent,
  type PointActionSamplePoint,
} from "@/lib/point-actions";

const actionMapLayers: CampaignMapLayerVisibility = {
  roadMap: true,
  basins: true,
  dailyRoutes: false,
  dayTransitions: false,
  planned: false,
  effective: true,
  displacement: false,
};

export function PointActionsPageContent() {
  const [actions, setActions] = useState<PointActionEvent[]>([]);
  const [isLoadingActions, setIsLoadingActions] = useState(true);
  const [selectedActionId, setSelectedActionId] = useState<string | undefined>();
  const [selectedPointId, setSelectedPointId] = useState<string | undefined>();

  useEffect(() => {
    function syncActions() {
      setIsLoadingActions(true);
      void readPointActions().then((storedActions) => {
        setActions(storedActions);
        setSelectedActionId((current) => current ?? storedActions[0]?.id);
        setSelectedPointId((current) => current ?? storedActions[0]?.points[0]?.id);
      }).finally(() => {
        setIsLoadingActions(false);
      });
    }

    const timer = window.setTimeout(syncActions, 0);
    window.addEventListener("storage", syncActions);
    window.addEventListener("yvae:point-actions-updated", syncActions);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", syncActions);
      window.removeEventListener("yvae:point-actions-updated", syncActions);
    };
  }, []);

  const selectedAction = useMemo(
    () => actions.find((action) => action.id === selectedActionId) ?? actions[0],
    [actions, selectedActionId],
  );
  const selectedPoint = useMemo(
    () =>
      selectedAction?.points.find((point) => point.id === selectedPointId) ??
      selectedAction?.points[0],
    [selectedAction, selectedPointId],
  );
  const mapPoints = useMemo(
    () => selectedAction?.points.map(toMapPoint) ?? [],
    [selectedAction],
  );
  const totalPhotos = selectedAction?.points.reduce(
    (total, point) => total + point.photos.length,
    0,
  ) ?? 0;

  if (isLoadingActions) {
    return (
      <div className="space-y-6">
        <HeaderBlock />
        <div className="flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
          <FileSpreadsheet className="mb-4 h-10 w-10 animate-pulse text-slate-400" />
          <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">
            Carregando ações pontuais
          </p>
          <p className="mt-2 max-w-lg text-justify text-sm leading-6 text-slate-500">
            Consultando os registros compartilhados na nuvem para exibir os eventos cadastrados.
          </p>
        </div>
      </div>
    );
  }

  if (!actions.length) {
    return (
      <div className="space-y-6">
        <HeaderBlock />
        <div className="flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
          <FileSpreadsheet className="mb-4 h-10 w-10 text-slate-400" />
          <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">
            Nenhuma ação pontual registrada
          </p>
          <p className="mt-2 max-w-lg text-justify text-sm leading-6 text-slate-500">
            Cadastre manualmente as ações pontuais no módulo Dados para liberar os cards,
            mapa, resultados, fotos e legendas desta página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Ação pontual selecionada
          </p>
          <h2 className="heading-font text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            {selectedAction.eventName}
          </h2>
          <p className="mt-2 max-w-3xl text-justify text-sm leading-6 text-[var(--ink-soft)]">
            {selectedAction.objectives}
          </p>
          {selectedAction.document ? (
            <a
              href={selectedAction.document.dropboxUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <Link2 className="h-3.5 w-3.5" />
              {selectedAction.document.title}
            </a>
          ) : null}
        </div>

        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 lg:min-w-96">
          Ação exibida
          <select
            className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            value={selectedAction.id}
            onChange={(event) => {
              const nextAction = actions.find((action) => action.id === event.target.value);
              setSelectedActionId(event.target.value);
              setSelectedPointId(nextAction?.points[0]?.id);
            }}
          >
            {actions.map((action) => (
              <option key={action.id} value={action.id}>
                {action.eventName}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Target} label="Registro" value="Pontual" detail={selectedAction.createdAt} />
        <MetricCard icon={MapPinned} label="Pontos de coleta" value={selectedAction.points.length} detail="Pontos vinculados" />
        <MetricCard icon={FlaskConical} label="Resultados" value={selectedAction.points.length} detail="Descrições registradas" />
        <MetricCard icon={Camera} label="Fotos" value={totalPhotos} detail="Links Dropbox" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="relative min-h-[220px] overflow-hidden rounded-[24px] border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)]">
          <CampaignHydroMap
            points={mapPoints}
            selectedPointId={selectedPoint?.id}
            layers={actionMapLayers}
            markerMode="pointAction"
            showPointTooltip
            caption="Ações pontuais · Pontos efetivos · Sanepar"
            onSelectPoint={(point) => setSelectedPointId(point.id)}
          />
        </div>

        <aside className="glass-panel rounded-[28px] p-5 shadow-[0_24px_72px_-48px_rgba(0,66,98,0.32)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Ação pontual
              </p>
              <h3 className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
                {selectedAction.eventName}
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                {selectedPoint?.waterBody ?? "Manancial não informado"}
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-[var(--brand-teal)]" />
          </div>

          {selectedPoint ? (
            <PointActionCard
              point={selectedPoint}
              objectives={selectedAction.objectives}
              document={selectedAction.document}
            />
          ) : (
            <p className="text-sm text-slate-500">Nenhum ponto selecionado.</p>
          )}
        </aside>
      </section>
    </div>
  );
}

function HeaderBlock() {
  return (
    <section>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
        Demandas Sanepar
      </p>
      <h2 className="heading-font text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
        Ações Pontuais Sanepar
      </h2>
      <p className="mt-2 max-w-3xl text-justify text-sm leading-6 text-[var(--ink-soft)]">
        Resultados de campanhas pontuais realizadas sob demanda serão exibidos após
        registro manual no módulo Dados.
      </p>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="glass-panel rounded-[24px] border-b-2 border-[var(--brand-blue)] p-4 shadow-[0_18px_54px_-42px_rgba(0,66,98,0.35)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {label}
        </p>
        <Icon className="h-4 w-4 text-[var(--brand-navy-strong)]" />
      </div>
      <p className="heading-font text-3xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
      <p className="mt-2 text-[10px] font-semibold text-[var(--brand-teal)]">{detail}</p>
    </article>
  );
}

function PointActionCard({
  point,
  objectives,
  document,
}: {
  point: PointActionSamplePoint;
  objectives: string;
  document: PointActionEvent["document"];
}) {
  const [expandedPhoto, setExpandedPhoto] = useState<PointActionSamplePoint["photos"][number] | null>(null);

  return (
      <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-4">
        <Info label="Data" value={point.dates} />
        <Info label="Município" value={point.municipality} />
        <Info label="Manancial" value={point.waterBody} />
        <Info
          label="Coordenadas"
          value={`${point.effectiveLat.toFixed(5)}, ${point.effectiveLon.toFixed(5)}`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[18px] border border-[var(--line-ghost)] bg-white p-4 shadow-[0_18px_48px_-42px_rgba(0,66,98,0.28)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Objetivos
          </p>
          <p className="mt-2 text-justify text-sm leading-6 text-slate-600">{objectives}</p>
        </div>

        <div className="rounded-[18px] border border-[var(--line-ghost)] bg-white p-4 shadow-[0_18px_48px_-42px_rgba(0,66,98,0.28)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Resultados
          </p>
          <p className="mt-2 text-justify text-sm leading-6 text-slate-600">{point.results}</p>
        </div>
      </div>

      {document ? (
        <a
          href={document.dropboxUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-[18px] border border-[var(--line-ghost)] bg-white p-4 text-sm font-bold text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-soft)]"
        >
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-400">
              Documento do evento
            </span>
            <span className="mt-1 block truncate">{document.title}</span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0" />
        </a>
      ) : (
        <p className="rounded-[18px] bg-[var(--surface-soft)] p-4 text-xs font-semibold text-slate-500">
          Nenhum documento vinculado a este evento.
        </p>
      )}

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Fotos
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {point.photos.length ? (
            point.photos.map((photo, index) => (
              <button
                type="button"
                key={photo.id}
                className="grid w-full grid-cols-[96px_1fr] gap-3 rounded-[16px] border border-[var(--line-ghost)] bg-white p-2 text-left shadow-[0_14px_38px_-34px_rgba(0,66,98,0.34)] transition-colors hover:bg-[var(--surface-soft)]"
                onClick={() => setExpandedPhoto(photo)}
              >
                <PhotoThumb photoUrl={photo.url} alt={photo.caption || `Foto ${index + 1}`} />
                <span className="min-w-0 py-1">
                  <span className="block text-xs font-black text-[var(--brand-navy-strong)]">
                    Foto {index + 1}
                  </span>
                  <span className="mt-1 block text-justify text-xs leading-5 text-slate-500">
                    {photo.caption || "Sem legenda informada"}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="rounded-[16px] bg-[var(--surface-soft)] p-3 text-xs font-semibold text-slate-500">
              Nenhuma foto vinculada a este ponto.
            </p>
          )}
        </div>
      </div>

      {expandedPhoto ? (
        <PhotoDialog photo={expandedPhoto} onClose={() => setExpandedPhoto(null)} />
      ) : null}
    </div>
  );
}

function PhotoThumb({ photoUrl, alt }: { photoUrl: string; alt: string }) {
  const previewUrl = toDropboxPreviewUrl(photoUrl);

  return (
    <span className="relative block h-24 w-24 overflow-hidden rounded-xl bg-[var(--surface-soft)]">
      <span className="absolute inset-0 flex items-center justify-center text-slate-400">
        <Camera className="h-5 w-5" />
      </span>
      {previewUrl ? (
        // User-provided Dropbox links are remote images and need normal img fallback behavior.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={alt}
          className="relative h-full w-full object-cover"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}

function PhotoDialog({
  photo,
  onClose,
}: {
  photo: PointActionSamplePoint["photos"][number];
  onClose: () => void;
}) {
  const previewUrl = toDropboxPreviewUrl(photo.url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_90px_-24px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Foto da ação pontual
          </p>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
            onClick={onClose}
            aria-label="Fechar foto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950/95 p-3">
          {previewUrl ? (
            // User-provided Dropbox links are remote images and need normal img fallback behavior.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={photo.caption || "Foto da ação pontual"}
              className="max-h-[64vh] w-auto max-w-full object-contain"
            />
          ) : (
            <div className="flex min-h-72 items-center justify-center text-white/70">
              <Camera className="h-10 w-10" />
            </div>
          )}
        </div>
        <div className="flex max-h-40 flex-col gap-3 overflow-y-auto px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-justify text-sm font-semibold leading-6 text-slate-700">
            {photo.caption || "Sem legenda informada"}
          </p>
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir link
          </a>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function toMapPoint(point: PointActionSamplePoint): CampaignHydroMapPoint {
  return {
    id: point.id,
    code: "Ação pontual",
    point: point.municipality,
    campaign: "Ação pontual",
    municipality: point.municipality,
    waterBody: point.waterBody,
    original: null,
    effective: {
      lat: point.effectiveLat,
      lon: point.effectiveLon,
    },
    accessibility: "Não informado",
    waterAspect: "Não informado",
    weatherConditions: "Não informado",
    problems: "Não informado",
    photoUrl: point.photos[0]?.url ?? "",
  };
}

function toDropboxPreviewUrl(url: string) {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedUrl);

    if (parsedUrl.hostname.includes("dropbox.com")) {
      parsedUrl.hostname = "dl.dropboxusercontent.com";
      parsedUrl.searchParams.delete("dl");
      parsedUrl.searchParams.delete("raw");
      return parsedUrl.toString();
    }

    return trimmedUrl;
  } catch {
    return trimmedUrl;
  }
}
