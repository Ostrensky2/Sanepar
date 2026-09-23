"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileSearch,
  FlaskConical,
  ListChecks,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { summarizeFieldDiaryEntries } from "@/components/field-diary/helpers";
import { campaignIdentityMatches } from "@/lib/campaign-identity";
import {
  buildInitialCampaignManagement,
  calculateCampaignProgress,
  campaignPhaseLabel,
  defaultCampaigns,
  getCurrentCampaignStage,
  readCampaignManagement,
  type CampaignManagementById,
} from "@/lib/campaign-management";
import { readFieldDiaryEntries, type FieldDiaryEntry } from "@/lib/field-diary";
import type { ResultsInventoryItem, ResultsInventoryResponse } from "@/lib/results-publication-contract";
import { readSelectedCampaignId, writeSelectedCampaignId } from "@/lib/selected-campaign";
import { cn } from "@/lib/utils";
import { countLabel } from "@/lib/number-format";

type StepState = "done" | "attention" | "pending";

type HubData = {
  management: CampaignManagementById;
  diary: FieldDiaryEntry[] | null;
  inventory: ResultsInventoryItem[] | null;
  conflicts: number | null;
};

const campaigns = defaultCampaigns;

export function DataHub() {
  const [focusId, setFocusId] = useState(campaigns[0].id);
  const [data, setData] = useState<HubData>(() => ({
    management: buildInitialCampaignManagement(campaigns),
    diary: null,
    inventory: null,
    conflicts: null,
  }));

  useEffect(() => {
    const stored = readSelectedCampaignId();
    if (campaigns.some((campaign) => campaign.id === stored)) queueMicrotask(() => setFocusId(stored));

    let cancelled = false;
    void readCampaignManagement(campaigns).then((management) => {
      if (!cancelled) setData((current) => ({ ...current, management }));
    });
    void readFieldDiaryEntries()
      .then((diary) => {
        if (!cancelled) setData((current) => ({ ...current, diary }));
      })
      .catch(() => {
        if (!cancelled) setData((current) => ({ ...current, diary: [] }));
      });
    void fetch("/api/imports/results?inventory=1", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as ResultsInventoryResponse) : null))
      .then((value) => {
        if (!cancelled) setData((current) => ({ ...current, inventory: value?.campaigns ?? [] }));
      })
      .catch(() => {
        if (!cancelled) setData((current) => ({ ...current, inventory: [] }));
      });
    void fetch("/api/import-conflicts", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { conflicts?: unknown[] }) : null))
      .then((value) => {
        if (!cancelled) setData((current) => ({ ...current, conflicts: value?.conflicts?.length ?? 0 }));
      })
      .catch(() => {
        if (!cancelled) setData((current) => ({ ...current, conflicts: 0 }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () =>
      campaigns.map((campaign) => {
        const management = data.management[campaign.id];
        const stages = management?.stages ?? [];
        const diaryEntries = data.diary?.filter((entry) =>
          campaignIdentityMatches(
            { campaignId: entry.campaignId, campaignName: entry.campaignName },
            { campaignId: campaign.id, campaignName: campaign.title },
          ),
        );
        const summary = diaryEntries ? summarizeFieldDiaryEntries(diaryEntries) : null;
        const publication = data.inventory?.find((item) => item.canonicalId === campaign.id) ?? null;
        return {
          campaign,
          phase: campaignPhaseLabel(management?.status ?? campaign.status),
          progress: management ? calculateCampaignProgress(stages, management.status) : 0,
          currentStage: getCurrentCampaignStage(stages)?.label ?? null,
          collectionStarted: stages.some((stage) => stage.label === "Coleta de amostras" && stage.status !== "pending"),
          analysisDone: stages.some((stage) => stage.label === "Conclusão das análises dos dados" && stage.status === "done"),
          summary,
          publication,
        };
      }),
    [data],
  );

  const focus = rows.find((row) => row.campaign.id === focusId) ?? rows[0];

  function chooseCampaign(campaignId: string) {
    setFocusId(campaignId);
    writeSelectedCampaignId(campaignId);
  }

  const fieldState: StepState = !focus.summary
    ? "pending"
    : focus.summary.total > 0
      ? focus.summary.planned + focus.summary.incomplete > 0 ? "attention" : "done"
      : focus.collectionStarted ? "attention" : "pending";
  const resultsState: StepState = focus.publication ? "done" : focus.analysisDone ? "attention" : "pending";
  const conflictsState: StepState = data.conflicts ? "attention" : "done";

  return (
    <div className="space-y-6">
      <section className="glass-panel radius-panel space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="type-eyebrow text-[var(--brand-teal)]">Checklist da campanha</p>
            <h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">{focus.campaign.title}</h2>
          </div>
          <label className="type-label grid gap-1 text-[var(--ink-soft)] md:min-w-80">
            Campanha
            <select
              className="min-h-11 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              value={focus.campaign.id}
              onChange={(event) => chooseCampaign(event.target.value)}
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.selectorLabel}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ol className="divide-y divide-[var(--line-ghost)] rounded-2xl border border-[var(--line-ghost)] bg-white">
          <ChecklistStep
            icon={ListChecks}
            title="Fase e etapas"
            state={focus.phase === "Concluída" ? "done" : "attention"}
            summary={`${focus.phase} · ${focus.progress}% das etapas${focus.currentStage ? ` · etapa atual: ${focus.currentStage}` : ""}`}
            href="/dados/status"
            action="Atualizar etapas"
          />
          <ChecklistStep
            icon={NotebookPen}
            title="Registros de campo"
            state={fieldState}
            summary={
              !focus.summary
                ? "Carregando…"
                : focus.summary.total
                  ? [countLabel(focus.summary.total, "registro", "registros"), `${focus.summary.recorded + focus.summary.occurrence} com relato`, focus.summary.planned ? `${focus.summary.planned} sem relato` : "", focus.summary.incomplete ? countLabel(focus.summary.incomplete, "incompleto", "incompletos") : ""].filter(Boolean).join(" · ")
                  : "Nenhum registro de campo ainda"
            }
            href={focus.summary?.total ? "/dados/diario-de-campo" : "/dados/diario-de-campo?importar=1"}
            action={focus.summary?.total ? "Abrir diário" : "Importar planilha de campo"}
          />
          <ChecklistStep
            icon={FlaskConical}
            title="Resultados laboratoriais"
            state={resultsState}
            summary={
              data.inventory === null
                ? "Carregando…"
                : focus.publication
                  ? `Publicados em ${formatDate(focus.publication.publishedAt)} · ${focus.publication.counts.total} pontos`
                  : focus.analysisDone
                    ? "Análises concluídas, mas a planilha ainda não foi publicada"
                    : "Ainda não publicados"
            }
            href="/dados/resultados"
            action={focus.publication ? "Publicar nova versão" : "Publicar planilha"}
          />
          <ChecklistStep
            icon={AlertTriangle}
            title="Pendências de importação"
            state={conflictsState}
            summary={
              data.conflicts === null
                ? "Carregando…"
                : data.conflicts
                  ? `${countLabel(data.conflicts, "conflito aguardando", "conflitos aguardando")} decisão (todas as campanhas)`
                  : "Nenhum conflito aberto"
            }
            href="/dados/pendencias"
            action={data.conflicts ? "Resolver" : "Ver histórico"}
          />
        </ol>
      </section>

      <ImportAssistant />

      <section className="space-y-3">
        <h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">Todas as campanhas</h2>
        <div className="overflow-x-auto rounded-2xl border border-[var(--line-ghost)] bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--surface-soft)] text-[var(--ink-soft)]">
              <tr>
                <th scope="col" className="type-label px-4 py-3">Campanha</th>
                <th scope="col" className="type-label px-4 py-3">Fase</th>
                <th scope="col" className="type-label px-4 py-3">Registros de campo</th>
                <th scope="col" className="type-label px-4 py-3">Resultados</th>
                <th scope="col" className="type-label px-4 py-3"><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.campaign.id} className={cn("border-t border-[var(--line-ghost)]", row.campaign.id === focus.campaign.id && "bg-[var(--brand-blue-soft)]/40")}>
                  <th scope="row" className="px-4 py-3 font-bold text-[var(--brand-navy-strong)]">{row.campaign.selectorLabel}</th>
                  <td className="px-4 py-3">{row.phase} <span className="text-[var(--ink-soft)]">· {row.progress}%</span></td>
                  <td className="px-4 py-3 tabular-nums">{row.summary ? row.summary.total || "—" : "…"}</td>
                  <td className="px-4 py-3">{row.publication ? `${row.publication.counts.total} pontos` : data.inventory === null ? "…" : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="min-h-11 rounded-lg px-3 text-sm font-bold text-[var(--brand-teal)] underline underline-offset-4"
                      onClick={() => chooseCampaign(row.campaign.id)}
                      aria-label={`Ver checklist da ${row.campaign.selectorLabel}`}
                    >
                      Ver checklist
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ChecklistStep({
  icon: Icon,
  title,
  state,
  summary,
  href,
  action,
}: {
  icon: LucideIcon;
  title: string;
  state: StepState;
  summary: string;
  href: string;
  action: string;
}) {
  const stateStyle = {
    done: { label: "Em dia", className: "bg-[var(--brand-green-soft)] text-green-800", Mark: CheckCircle2 },
    attention: { label: "Acompanhar", className: "bg-amber-100 text-amber-900", Mark: AlertTriangle },
    pending: { label: "A fazer", className: "bg-slate-100 text-slate-600", Mark: Circle },
  }[state];

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--brand-navy-strong)]">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-bold text-[var(--brand-navy-strong)]">
          {title}
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", stateStyle.className)}>
            <stateStyle.Mark aria-hidden="true" className="h-3.5 w-3.5" />
            {stateStyle.label}
          </span>
        </p>
        <p className="type-metadata mt-0.5 text-[var(--ink-soft)]">{summary}</p>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
      >
        {action}
      </Link>
    </li>
  );
}

type Detection = { title: string; detail: string; href: string; action: string } | { error: string };

/** Descobre, pelas abas da planilha, em qual tela ela deve ser importada. */
export function detectImportDestination(sheetNames: string[]): Detection {
  const names = new Set(sheetNames.map((name) => name.trim()));
  if (["Metadados", "Metadata-C2", "Indices_pontos", "Calculo_conjuntos"].some((name) => names.has(name))) {
    return {
      title: "Planilha de resultados laboratoriais",
      detail: "Publique em Planilhas de resultados. A prévia mostra as campanhas encontradas antes de publicar.",
      href: "/dados/resultados",
      action: "Ir para Planilhas de resultados",
    };
  }
  if (names.has("Pontos")) {
    return {
      title: "Planilha de atividades complementares",
      detail: "Importe em Atividades complementares › Registrar › Importar planilha.",
      href: "/dados/acoes-pontuais",
      action: "Ir para Registrar atividade",
    };
  }
  if (names.has("Registros") || names.has("Campanhas")) {
    return {
      title: "Planilha de campo",
      detail:
        "Importe no Diário de campo (botão Importar planilha): os pontos viram registros oficiais da campanha, com prévia e conflitos antes de gravar.",
      href: "/dados/diario-de-campo",
      action: "Ir para o Diário de campo",
    };
  }
  return {
    error: `Não reconheci esta planilha (abas: ${sheetNames.join(", ") || "nenhuma"}). Use um dos modelos: campo (aba Campanhas), resultados (aba Metadados) ou atividades (aba Pontos).`,
  };
}

function ImportAssistant() {
  const [result, setResult] = useState<Detection | null>(null);
  const [isReading, setIsReading] = useState(false);

  async function inspect(file: File | undefined) {
    if (!file) return;
    setIsReading(true);
    setResult(null);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      setResult(detectImportDestination(workbook.worksheets.map((sheet) => sheet.name)));
    } catch {
      setResult({ error: "Não foi possível ler o arquivo. Envie uma planilha .xlsx." });
    } finally {
      setIsReading(false);
    }
  }

  return (
    <section className="glass-panel radius-panel space-y-3 p-5" aria-labelledby="import-assistant-title">
      <div className="flex items-start gap-3">
        <FileSearch aria-hidden="true" className="mt-1 h-5 w-5 text-[var(--brand-teal)]" />
        <div>
          <h2 id="import-assistant-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">
            Tenho uma planilha. Onde importo?
          </h2>
          <p className="type-metadata text-[var(--ink-soft)]">
            Escolha o arquivo: o app lê só o nome das abas (nada é gravado) e indica a tela certa.
          </p>
        </div>
      </div>
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-dashed border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]">
        {isReading ? "Lendo planilha…" : "Escolher planilha (.xlsx)"}
        <input
          type="file"
          accept=".xlsx,.xlsm"
          className="sr-only"
          onChange={(event) => {
            void inspect(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {result ? (
        "error" in result ? (
          <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{result.error}</p>
        ) : (
          <div role="status" className="flex flex-col gap-3 rounded-xl border border-[var(--line-ghost)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-[var(--brand-navy-strong)]">{result.title}</p>
              <p className="type-metadata text-[var(--ink-soft)]">{result.detail}</p>
            </div>
            <Link
              href={result.href}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white hover:bg-[var(--brand-navy)]"
            >
              {result.action}
            </Link>
          </div>
        )
      ) : null}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}
