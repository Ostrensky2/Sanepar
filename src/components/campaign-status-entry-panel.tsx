"use client";

import { Edit3, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  MetabarcodingStage,
  MetabarcodingStageStatus,
} from "@/components/metabarcoding-stages";
import {
  buildDefaultCampaignManagement,
  buildInitialCampaignManagement,
  calculateCampaignProgress,
  defaultCampaigns,
  operationalStatusOptions,
  readCampaignManagement,
  saveCampaignManagement,
  stageStatusOptions,
  type CampaignManagement,
  type CampaignManagementById,
  type CampaignOperationalStatus,
} from "@/lib/campaign-management";

const SELECTED_CAMPAIGN_STORAGE_KEY = "yvae:selected-campaign-id";

export function CampaignStatusEntryPanel() {
  const campaigns = defaultCampaigns;
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => {
    if (typeof window === "undefined") {
      return campaigns[0].id;
    }

    const stored = window.localStorage.getItem(SELECTED_CAMPAIGN_STORAGE_KEY);
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
    window.localStorage.setItem(SELECTED_CAMPAIGN_STORAGE_KEY, selectedCampaignId);
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
        setSaveNotice("Status da campanha carregado.");
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

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <p className="text-sm leading-6 text-[var(--ink-soft)]">
          Declare status, datas e etapas de cada campanha.
        </p>

        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 lg:min-w-96">
          Campanha editada
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
            <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
              Ficha da campanha
            </p>
            <h3 className="heading-font mt-1 text-2xl font-extrabold text-[var(--brand-navy-strong)]">
              {selectedCampaign.title}
            </h3>
          </div>
          <div className="flex min-w-44 items-center gap-3 rounded-2xl bg-[var(--surface-soft)] p-3">
            <Save className="h-5 w-5 text-[var(--brand-teal)]" />
            <div>
              <p className="text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
                {saveNotice}
              </p>
              <p className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
                {progress}%
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.45fr)]">
          <div className="grid gap-3 rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
            <label className="grid gap-2 text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
              Status da campanha
              <select
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                value={selectedManagement.status}
                onChange={(event) =>
                  updateField("status", event.target.value as CampaignOperationalStatus)
                }
              >
                {operationalStatusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
              Sub-status da campanha
              <input
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                value={selectedManagement.period}
                onChange={(event) => updateField("period", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
              Pontos previstos
              <input
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                inputMode="numeric"
                value={selectedManagement.plannedPoints}
                onChange={(event) => updateField("plannedPoints", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
              Título do processo
              <input
                className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)]"
                value={selectedManagement.stageTitle}
                onChange={(event) => updateField("stageTitle", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
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
                <tr className="border-b border-[var(--line-ghost)] text-caption uppercase tracking-[0.16em] text-slate-500">
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

