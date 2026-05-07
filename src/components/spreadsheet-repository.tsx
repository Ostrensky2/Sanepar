"use client";

import {
  DatabaseZap,
  Download,
  FileSpreadsheet,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  hasPrivilege,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { PointActionEntryPanel } from "@/components/point-action-entry-panel";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import type { SpreadsheetPreview } from "@/lib/types";

type SpreadsheetKind = "Campo" | "Laboratório";
type CampaignScope = "Ordinária" | "Extraordinária";
type SheetStatus = "CARREGADA" | "PUBLICADA" | "PREVIEW" | "ERRO";

type StoredSpreadsheet = {
  id: string;
  fileName: string;
  campaign: string;
  scope: CampaignScope;
  kind: SpreadsheetKind;
  date: string;
  sizeBytes: number;
  status: SheetStatus;
  rows?: number;
  sheets?: number;
  note?: string;
};

type CampaignPublishPayload = {
  fileName: string;
  rowCount: number;
  points: CampaignMapPoint[];
  originalPointCount: number;
  effectivePointCount: number;
  missingFields: string[];
  preview: SpreadsheetPreview;
  persistence: {
    mode: "cloud" | "browser";
    message: string;
  };
};

const STORAGE_KEY = "yvae:spreadsheets";
const DB_NAME = "yvae-spreadsheet-files";
const DB_STORE = "files";
const campaigns = [
  "1ª Campanha - Verão 2026",
  "2ª Campanha - Outono 2026",
  "3ª Campanha - Inverno 2026",
  "4ª Campanha - Primavera 2026",
  "5ª Campanha - Verão 2027",
  "6ª Campanha - Outono 2027",
  "7ª Campanha - Inverno 2027",
  "8ª Campanha - Primavera 2027",
  "9ª Campanha - Verão 2028",
];
const filters = ["Todos", "Ordinárias", "Extraordinárias", "Campo", "Laboratório"] as const;

export function SpreadsheetRepository() {
  const [spreadsheets, setSpreadsheets] = useState<StoredSpreadsheet[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [activeCategory, setActiveCategory] = useState<UserCategory>("Administradores");
  const [formState, setFormState] = useState({
    campaign: campaigns[0],
    scope: "Ordinária" as CampaignScope,
    kind: "Campo" as SpreadsheetKind,
    extraordinaryName: "",
    note: "",
    publishFieldMap: true,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSpreadsheets(readStoredSpreadsheets());
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setHasLoaded(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    function refreshAccessCategory() {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
    }

    window.addEventListener("storage", refreshAccessCategory);
    window.addEventListener("yvae:access-category-updated", refreshAccessCategory);

    return () => {
      window.removeEventListener("storage", refreshAccessCategory);
      window.removeEventListener("yvae:access-category-updated", refreshAccessCategory);
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spreadsheets));
  }, [hasLoaded, spreadsheets]);

  const canImportSpreadsheets = hasPrivilege(activeCategory, "data.import");
  const canDeleteSpreadsheets = hasPrivilege(activeCategory, "data.delete");

  const metrics = useMemo(() => {
    const ordinaryCampaigns = new Set(
      spreadsheets
        .filter((sheet) => sheet.scope === "Ordinária")
        .map((sheet) => sheet.campaign),
    );

    return {
      total: spreadsheets.length,
      ordinary: ordinaryCampaigns.size,
      extraordinary: spreadsheets.filter((sheet) => sheet.scope === "Extraordinária").length,
      published: spreadsheets.filter((sheet) => sheet.status === "PUBLICADA").length,
    };
  }, [spreadsheets]);

  const visibleSpreadsheets = useMemo(() => {
    const normalizedSearch = normalize(searchTerm);

    return spreadsheets.filter((sheet) => {
      const matchesFilter =
        activeFilter === "Todos" ||
        (activeFilter === "Ordinárias" && sheet.scope === "Ordinária") ||
        (activeFilter === "Extraordinárias" && sheet.scope === "Extraordinária") ||
        sheet.kind === activeFilter;
      const searchable = normalize(`${sheet.fileName} ${sheet.campaign} ${sheet.kind} ${sheet.status}`);

      return matchesFilter && searchable.includes(normalizedSearch);
    });
  }, [activeFilter, searchTerm, spreadsheets]);

  async function addSpreadsheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!canImportSpreadsheets) {
      setError("A categoria ativa pode consultar Dados, mas não pode importar planilhas.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("A planilha a ser agregada ao repositório de dados deve ser selecionada.");
      return;
    }

    const campaign =
      formState.scope === "Extraordinária"
        ? formState.extraordinaryName.trim() || "Campanha extraordinária"
        : formState.campaign;
    let status: SheetStatus = "CARREGADA";
    let rowCount: number | undefined;
    let sheetCount: number | undefined;
    let statusMessage = "Planilha registrada no módulo Dados.";
    const spreadsheetId = `${file.name}-${crypto.randomUUID()}`;

    setIsPending(true);

    try {
      if (formState.kind === "Campo" && formState.publishFieldMap) {
        const response = await fetch("/api/imports/campaigns", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as CampaignPublishPayload | { error: string };

        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "A planilha de Campo não pôde ser publicada.");
        }

        window.localStorage.setItem("yvae:campaign-map-points", JSON.stringify(payload.points));
        window.localStorage.setItem(
          "yvae:campaign-map-import",
          JSON.stringify({
            fileName: payload.fileName,
            pointCount: payload.points.length,
            originalPointCount: payload.originalPointCount,
            effectivePointCount: payload.effectivePointCount,
            importedAt: new Date().toISOString(),
            persistenceMode: payload.persistence.mode,
          }),
        );

        status = "PUBLICADA";
        rowCount = payload.rowCount;
        sheetCount = payload.preview.sheetCount;
        statusMessage = "Planilha de Campo registrada e mapa da campanha atualizado.";
      } else {
        const previewData = new FormData();
        previewData.append("file", file);
        const response = await fetch("/api/imports/preview", {
          method: "POST",
          body: previewData,
        });
        const payload = (await response.json()) as SpreadsheetPreview | { error: string };

        if (response.ok && !("error" in payload)) {
          status = "PREVIEW";
          rowCount = payload.totalRows;
          sheetCount = payload.sheetCount;
        }
      }

      const today = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());

      const newSpreadsheet: StoredSpreadsheet = {
        id: spreadsheetId,
        fileName: file.name,
        campaign,
        scope: formState.scope,
        kind: formState.kind,
        date: today,
        sizeBytes: file.size,
        status,
        rows: rowCount,
        sheets: sheetCount,
        note: formState.note.trim(),
      };

      await saveSpreadsheetFile(spreadsheetId, file);
      setSpreadsheets((current) => [newSpreadsheet, ...current]);
      setSelectedFileName(null);
      form.reset();
      setFormState((current) => ({
        ...current,
        note: "",
        extraordinaryName: "",
      }));
      setMessage(statusMessage);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Não foi possível agregar a planilha.",
      );
    } finally {
      setIsPending(false);
    }
  }

  async function downloadSpreadsheet(sheet: StoredSpreadsheet) {
    const file = await readSpreadsheetFile(sheet.id);

    if (!file) {
      setError("Arquivo da planilha não encontrado neste navegador. Recarregue a planilha para habilitar o download.");
      return;
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = sheet.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function deleteSpreadsheet(sheet: StoredSpreadsheet) {
    if (!canDeleteSpreadsheets) {
      setError("Apenas Administradores podem excluir planilhas do módulo Dados.");
      return;
    }

    const confirmed = window.confirm(
      `Remover "${sheet.fileName}" do repositório de dados deste painel?`,
    );

    if (!confirmed) {
      return;
    }

    setSpreadsheets((current) => current.filter((item) => item.id !== sheet.id));
    void deleteSpreadsheetFile(sheet.id);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-2 py-2 lg:px-4">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="heading-font mb-1 text-2xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            Repositório de Planilhas de Dados
          </h2>
          <p className="max-w-3xl text-justify text-xs leading-5 text-slate-500">
            As planilhas de Campo e Laboratório das 9 campanhas ordinárias e das
            campanhas extraordinárias são agregadas manualmente. O app passa a ser
            operado a partir desses arquivos curados.
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            Categoria ativa:{" "}
            <span className="text-[var(--brand-navy-strong)]">{activeCategory}</span>
            {" "}· exclusão de planilhas {canDeleteSpreadsheets ? "permitida" : "bloqueada"}
          </p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="heading-font text-base font-bold text-[var(--brand-navy-strong)]">
            Controle de importação
          </h3>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            {spreadsheets.length} planilhas no painel
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricTile label="Planilhas" value={metrics.total} />
          <MetricTile label="Campanhas ordinárias" value={`${metrics.ordinary}/9`} />
          <MetricTile label="Extraordinárias" value={metrics.extraordinary} />
          <MetricTile label="Publicadas" value={metrics.published} />
        </div>
      </section>

      <section className="glass-panel rounded-[24px] p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="mb-3 inline-block rounded-full bg-[var(--brand-green-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-navy-strong)]">
              Carga manual
            </span>
            <h3 className="heading-font text-xl font-extrabold text-[var(--brand-navy-strong)]">
              Nova planilha da campanha
            </h3>
            <p className="mt-1 max-w-2xl text-justify text-xs leading-5 text-slate-500">
              Este registro é usado para planilhas de Campo e Laboratório. O mapa da
              campanha pode ser atualizado imediatamente por planilhas de Campo.
            </p>
            {!canImportSpreadsheets ? (
              <p className="mt-3 rounded-lg bg-[rgba(197,122,0,0.08)] px-3 py-2 text-xs font-semibold text-[var(--brand-amber)]">
                Importação bloqueada para a categoria ativa. Altere para Administradores ou Sanepar em Configurações.
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl bg-[var(--surface-soft)] p-3 text-[var(--brand-navy)]">
            <DatabaseZap className="h-5 w-5" />
          </div>
        </div>

        <form className="grid gap-2 lg:grid-cols-6" onSubmit={addSpreadsheet}>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            value={formState.scope}
            disabled={!canImportSpreadsheets || isPending}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                scope: event.target.value as CampaignScope,
              }))
            }
          >
            <option value="Ordinária">Campanha ordinária</option>
            <option value="Extraordinária">Campanha extraordinária</option>
          </select>
          {formState.scope === "Ordinária" ? (
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2"
              value={formState.campaign}
              disabled={!canImportSpreadsheets || isPending}
              onChange={(event) =>
                setFormState((current) => ({ ...current, campaign: event.target.value }))
              }
            >
              {campaigns.map((campaign) => (
                <option key={campaign} value={campaign}>
                  {campaign}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2"
              placeholder="Nome da campanha extraordinária"
              value={formState.extraordinaryName}
              disabled={!canImportSpreadsheets || isPending}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  extraordinaryName: event.target.value,
                }))
              }
            />
          )}
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            value={formState.kind}
            disabled={!canImportSpreadsheets || isPending}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                kind: event.target.value as SpreadsheetKind,
              }))
            }
          >
            <option value="Campo">Campo</option>
            <option value="Laboratório">Laboratório</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2">
            <UploadCloud className="h-4 w-4 text-[var(--brand-navy)]" />
            <span className="min-w-0 flex-1 truncate">
              {selectedFileName ?? "Selecionar planilha"}
            </span>
            <input
              name="file"
              type="file"
              accept=".xlsx,.xlsm,.xls"
              disabled={!canImportSpreadsheets || isPending}
              className="sr-only"
              onChange={(event) =>
                setSelectedFileName(event.currentTarget.files?.[0]?.name ?? null)
              }
            />
          </label>
          <input
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-4"
            placeholder="Observação operacional"
            value={formState.note}
            disabled={!canImportSpreadsheets || isPending}
            onChange={(event) =>
              setFormState((current) => ({ ...current, note: event.target.value }))
            }
          />
          <label className="flex items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--brand-navy-strong)]">
            <input
              type="checkbox"
              checked={formState.publishFieldMap}
              disabled={!canImportSpreadsheets || isPending || formState.kind !== "Campo"}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  publishFieldMap: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-[var(--brand-navy-strong)]"
            />
            Mapa será atualizado
          </label>
          <button
            type="submit"
            disabled={isPending || !canImportSpreadsheets}
            className="rounded-lg bg-[var(--brand-navy-strong)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Carregando..." : "Planilha será agregada"}
          </button>
        </form>

        {message ? (
          <p className="mt-4 rounded-lg bg-[rgba(0,168,107,0.08)] px-4 py-3 text-xs font-semibold text-[#0b5f40]">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg bg-[rgba(186,26,26,0.08)] px-4 py-3 text-xs font-semibold text-[var(--brand-danger)]">
            {error}
          </p>
        ) : null}
      </section>

      <PointActionEntryPanel canImport={canImportSpreadsheets} />

      <section className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap gap-1 rounded-lg bg-[var(--surface-soft)] p-1">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={
                  filter === activeFilter
                    ? "rounded-md border-b-2 border-[var(--brand-blue)] bg-white px-4 py-2 text-xs font-bold text-[var(--brand-navy)] shadow-sm"
                    : "px-4 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-[var(--brand-navy-strong)]"
                }
              >
                {filter}
              </button>
            ))}
          </nav>

          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar planilhas..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-[var(--brand-navy-strong)]/20"
            />
          </div>
        </div>

        <div className="glass-panel overflow-hidden rounded-[28px]">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Planilha
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Campanha
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Tipo
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Data
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Status
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {visibleSpreadsheets.map((sheet) => (
                <tr key={sheet.id} className="group transition-all hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-[var(--brand-blue)]" />
                      <div>
                        <p className="font-bold text-[var(--brand-navy-strong)]">
                          {sheet.fileName}
                        </p>
                        <p className="text-[9px] text-slate-500">
                          {formatBytes(sheet.sizeBytes)}
                          {sheet.rows ? ` • ${sheet.rows} linhas` : ""}
                          {sheet.sheets ? ` • ${sheet.sheets} abas` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    <p className="font-bold">{sheet.campaign}</p>
                    <p className="text-[10px]">{sheet.scope}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold">
                      {sheet.kind.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{sheet.date}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-sm border-l-[3px] px-2 py-1 text-[9px] font-bold ${statusClass(sheet.status)}`}>
                      {sheet.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        aria-label={`Baixar ${sheet.fileName}`}
                        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
                        onClick={() => void downloadSpreadsheet(sheet)}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {canDeleteSpreadsheets ? (
                        <button
                          type="button"
                          aria-label={`Remover ${sheet.fileName}`}
                          className="rounded p-1.5 text-[var(--brand-danger)] transition-colors hover:bg-red-50"
                          onClick={() => deleteSpreadsheet(sheet)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!visibleSpreadsheets.length ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              Nenhuma planilha encontrada para o filtro atual.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function openSpreadsheetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveSpreadsheetFile(id: string, file: File) {
  const db = await openSpreadsheetDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

async function readSpreadsheetFile(id: string) {
  const db = await openSpreadsheetDb();

  const file = await new Promise<File | null>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readonly");
    const request = transaction.objectStore(DB_STORE).get(id);
    request.onsuccess = () => resolve(request.result instanceof File ? request.result : null);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return file;
}

async function deleteSpreadsheetFile(id: string) {
  const db = await openSpreadsheetDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="glass-panel rounded-[18px] p-3">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="heading-font text-2xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
    </article>
  );
}

function readStoredSpreadsheets() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSpreadsheet[]) : [];
  } catch {
    return [];
  }
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatBytes(value: number) {
  if (value === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;

  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function statusClass(status: SheetStatus) {
  if (status === "PUBLICADA") {
    return "border-[#00b356] bg-emerald-50 text-emerald-700";
  }

  if (status === "PREVIEW") {
    return "border-[var(--brand-blue)] bg-blue-50 text-blue-700";
  }

  if (status === "ERRO") {
    return "border-[var(--brand-danger)] bg-red-50 text-[var(--brand-danger)]";
  }

  return "border-[var(--brand-teal)] bg-cyan-50 text-cyan-700";
}
