"use client";

import { Edit3, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readSelectedCampaignId, writeSelectedCampaignId } from "@/lib/selected-campaign";
import type {
  MetabarcodingStage,
  MetabarcodingStageStatus,
} from "@/components/metabarcoding-stages";
import {
  buildDefaultCampaignManagement,
  buildInitialCampaignManagement,
  calculateCampaignProgress,
  defaultCampaigns,
  campaignPhaseLabel,
  phaseStatusOptions,
  phaseStatusValue,
  readCampaignManagement,
  suggestedCampaignPhase,
  saveCampaignManagement,
  stageStatusOptions,
  type CampaignManagement,
  type CampaignManagementById,
  type CampaignOperationalStatus,
} from "@/lib/campaign-management";


export function CampaignStatusEntryPanel() {
  const campaigns = defaultCampaigns;
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => {
    if (typeof window === "undefined") {
      return campaigns[0].id;
    }

    const stored = readSelectedCampaignId();
    return stored && campaigns.some((campaign) => campaign.id === stored)
      ? stored
      : campaigns[0].id;
  });
  const [campaignManagement, setCampaignManagement] = useState<CampaignManagementById>(() =>
    buildInitialCampaignManagement(campaigns),
  );
  const [hasLoadedCloudManagement, setHasLoadedCloudManagement] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveNotice, setSaveNotice] = useState("Sincronizando com a nuvem...");

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeSelectedCampaignId(selectedCampaignId);
  }, [selectedCampaignId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    async function loadManagement() {
      const management = await readCampaignManagement(campaigns);

      if (isMounted) {
        setCampaignManagement(management);
        setHasLoadedCloudManagement(true);
        setHasUnsavedChanges(false);
        setSaveNotice("Tudo salvo");
      }
    }

    void loadManagement();

    return () => {
      isMounted = false;
    };
  }, [campaigns]);

  useEffect(() => {
    if (!hasLoadedCloudManagement || !hasUnsavedChanges) return;

    const timer = window.setTimeout(() => {
      void saveCampaignManagement(campaignManagement).then((result) => {
        if (result.ok) {
          setHasUnsavedChanges(false);
        }

        setSaveNotice(
          result.persistence === "cloud"
            ? "Salvo na nuvem"
            : result.persistence === "browser"
              ? "Salvo localmente"
              : "A nuvem não confirmou a gravação",
        );
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [campaignManagement, hasLoadedCloudManagement, hasUnsavedChanges]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0],
    [campaigns, selectedCampaignId],
  );
  const selectedManagement =
    campaignManagement[selectedCampaign.id] ?? buildDefaultCampaignManagement(selectedCampaign);
  const progress = calculateCampaignProgress(selectedManagement.stages, selectedManagement.status);

  function updateManagement(nextManagement: CampaignManagement) {
    setCampaignManagement((current) => ({
      ...current,
      [selectedCampaign.id]: nextManagement,
    }));
    setHasUnsavedChanges(true);
    setSaveNotice("Salvando alterações...");
  }

  function updateField<Key extends keyof CampaignManagement>(
    key: Key,
    value: CampaignManagement[Key],
  ) {
    updateManagement({ ...selectedManagement, [key]: value });
  }

  function updateStage(index: number, patch: Partial<MetabarcodingStage>) {
    updateField(
      "stages",
      selectedManagement.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    );
  }

  const currentStage =
    selectedManagement.stages.find((stage) => stage.status === "inprogress");
  const currentPhase = campaignPhaseLabel(selectedManagement.status);
  const stagePhase = suggestedCampaignPhase(selectedManagement.stages);
  const stagePhaseOption = phaseStatusOptions.find((option) => option.label === stagePhase);
  const phaseDiverges =
    currentPhase !== stagePhase && currentPhase !== "Suspensa" && currentPhase !== "Cancelada";

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-end">

        <label className="type-label grid gap-1 text-[var(--ink-soft)] lg:min-w-96">
          Campanha
          <select
            className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            value={selectedCampaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
          >
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.selectorLabel}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="glass-panel radius-panel p-5">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="type-eyebrow text-[var(--brand-teal)]">
              {currentPhase}
            </p>
            <h2 className="heading-font type-section-title mt-1 text-[var(--brand-navy-strong)]">
              {selectedCampaign.title}
            </h2>
          </div>
          <div className="flex min-w-44 items-center gap-3 rounded-2xl bg-[var(--surface-soft)] p-3">
            <Save className="h-5 w-5 text-[var(--brand-teal)]" />
            <div>
              <p className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
                {progress}% concluído
              </p>
              <p role="status" className="type-metadata text-[var(--ink-soft)]">
                {saveNotice}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.45fr)]">
          <div className="grid gap-3 rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
            <label className="grid gap-2 text-caption font-bold text-slate-500">
              Fase da campanha
              <select
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                value={phaseStatusValue(selectedManagement.status)}
                onChange={(event) =>
                  updateField("status", event.target.value as CampaignOperationalStatus)
                }
              >
                {phaseStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {phaseDiverges && stagePhaseOption ? (
              <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--brand-amber)]/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span>As etapas marcadas indicam a fase <strong>{stagePhase}</strong>.</span>
                <button
                  type="button"
                  className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-100"
                  onClick={() => updateField("status", stagePhaseOption.value)}
                >
                  Usar {stagePhase}
                </button>
              </div>
            ) : null}

            <label className="grid gap-2 text-caption font-bold text-slate-500">
              Período (ex.: Verão 2026)
              <input
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                value={selectedManagement.period}
                onChange={(event) => updateField("period", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-caption font-bold text-slate-500">
              Pontos previstos
              <input
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                inputMode="numeric"
                value={selectedManagement.plannedPoints}
                onChange={(event) => updateField("plannedPoints", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-caption font-bold text-slate-500">
              Título do processo
              <input
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                value={selectedManagement.stageTitle}
                onChange={(event) => updateField("stageTitle", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-caption font-bold text-slate-500">
              Observação
              <textarea
                className="min-h-24 rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                value={selectedManagement.note}
                onChange={(event) => updateField("note", event.target.value)}
              />
            </label>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--line-ghost)] bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line-ghost)] text-caption text-slate-500">
                  <th className="px-3 py-3">Etapa</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Prevista</th>
                  <th className="px-3 py-3">Concluída</th>
                  <th className="px-3 py-3">Observação</th>
                </tr>
              </thead>
              <tbody>
                {selectedManagement.stages.map((stage, index) => (
                  <tr key={`${stage.label}-${index}`} className="border-b border-[var(--line-ghost)] align-top">
                    <td className="px-3 py-3">
                      <div className="flex items-start gap-2">
                        <Edit3 className="mt-1 h-3.5 w-3.5 text-slate-400" />
                        <input
                          className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-bold text-[var(--brand-navy-strong)] outline-none focus:border-[var(--line-strong)] focus:bg-[var(--surface-soft)]"
                          value={stage.label}
                          onChange={(event) => updateStage(index, { label: event.target.value })}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="rounded-lg border border-[var(--line-strong)] bg-white px-2 py-1.5 text-xs font-bold text-[var(--brand-navy-strong)] outline-none"
                        value={stage.status}
                        onChange={(event) =>
                          updateStage(index, {
                            status: event.target.value as MetabarcodingStageStatus,
                          })
                        }
                      >
                        {stageStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className={`rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--line-strong)] focus:bg-white ${
                          stage.plannedDate
                            ? "border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)]"
                            : "border-transparent bg-transparent text-slate-400 hover:border-[var(--line-ghost)]"
                        }`}
                        type="date"
                        value={stage.plannedDate ?? ""}
                        onChange={(event) => updateStage(index, { plannedDate: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className={`rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--line-strong)] focus:bg-white ${
                          stage.completedDate
                            ? "border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)]"
                            : "border-transparent bg-transparent text-slate-400 hover:border-[var(--line-ghost)]"
                        }`}
                        type="date"
                        value={stage.completedDate ?? ""}
                        onChange={(event) => updateStage(index, { completedDate: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--line-strong)] focus:bg-white ${
                          stage.note
                            ? "border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)]"
                            : "border-transparent bg-transparent text-slate-400 hover:border-[var(--line-ghost)]"
                        }`}
                        value={stage.note ?? ""}
                        onChange={(event) => updateStage(index, { note: event.target.value })}
                        placeholder={currentStage?.label === stage.label ? "Etapa atual" : "—"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}
