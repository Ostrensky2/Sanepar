"use client";

import {
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Sheet,
  UploadCloud,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Dialog } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import {
  activityOptions,
  fieldDiaryStatusOptions,
  followUpOptions,
  occurrenceTypeOptions,
  validateEntry,
  waterVisualConditionOptions,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { useFieldDiary } from "@/lib/hooks/use-field-diary";
import { usePagination } from "@/lib/hooks/use-pagination";

const campaignOptions = [
  { id: "campanha-1-verao-2026", name: "1ª Campanha - Verão 2026" },
  { id: "campanha-2-outono-2026", name: "2ª Campanha - Outono 2026" },
  { id: "campanha-3", name: "3ª Campanha - Inverno 2026" },
  { id: "campanha-4", name: "4ª Campanha - Primavera 2026" },
  { id: "campanha-5", name: "5ª Campanha - Verão 2027" },
  { id: "campanha-6", name: "6ª Campanha - Outono 2027" },
  { id: "campanha-7", name: "7ª Campanha - Inverno 2027" },
  { id: "campanha-8", name: "8ª Campanha - Primavera 2027" },
  { id: "campanha-9", name: "9ª Campanha - Verão 2028" },
  { id: "acao-pontual", name: "Ação pontual" },
  { id: "deslocamento-tecnico", name: "Deslocamento técnico" },
];

type FieldDiaryCampaignScope = {
  id: string;
  name: string;
};

export function FieldDiaryPageContent({
  campaignScope,
}: {
  campaignScope?: FieldDiaryCampaignScope;
} = {}) {
  const toast = useToast();
  const diary = useFieldDiary(campaignScope);
  const isCampaignScoped = Boolean(campaignScope);
  const entriesPage = usePagination(diary.filteredEntries, 20);

  return (
    <div className="space-y-6">
      {campaignScope ? (
        <SectionCard
          title="Diário de Campo"
          description={`Registro operacional vinculado exclusivamente à ${campaignScope.name}.`}
          action={
            <div className="flex flex-wrap gap-2">
              <ImportButton onClick={diary.openImport} />
              <NewEntryButton onClick={diary.openNewForm} label="Novo registro" />
            </div>
          }
        >
          <p className="max-w-5xl text-justify text-sm leading-7 text-[var(--ink-soft)]">
            Cada campanha mantém seu próprio diário para preservar a rastreabilidade das atividades,
            ocorrências, pendências e observações feitas em campo.
          </p>
        </SectionCard>
      ) : (
        <>
          <PageHeader
            eyebrow="Campanhas"
            title="Diário de Campo"
            description="Memória operacional diária das campanhas, ações pontuais e deslocamentos técnicos do projeto Yva'e, sem substituir relatórios técnicos, laudos, atas ou comunicações formais."
            aside={
              <div className="flex flex-wrap items-start justify-end gap-2">
                <ImportButton onClick={diary.openImport} />
                <NewEntryButton onClick={diary.openNewForm} label="Novo registro" />
              </div>
            }
          />

          <SectionCard
            title="Descrição institucional"
            description="O módulo reúne registros diários simples e organizados do que ocorreu em campo, apoiando a rastreabilidade das campanhas e a comunicação entre equipes."
          >
            <p className="max-w-5xl text-justify text-sm leading-7 text-[var(--ink-soft)]">
              O Diário de Campo não substitui relatórios técnicos, laudos, atas, comunicações formais
              ou documentos oficiais. Ele funciona como memória operacional do projeto, incluindo
              locais visitados, atividades realizadas, condições visuais da água, ocorrências
              operacionais e eventuais pendências.
            </p>
          </SectionCard>
        </>
      )}

      <SectionCard
        title="Filtros"
        description={
          campaignScope
            ? "Consulta rápida por data, local, município e ocorrência dentro desta campanha."
            : "Consulta rápida por campanha, data, local, município e ocorrência."
        }
      >
        <div className={`grid gap-3 md:grid-cols-2 ${isCampaignScoped ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
          {!isCampaignScoped ? (
            <Field label="Campanha">
              <select
                value={diary.filters.campaign}
                onChange={(event) =>
                  diary.setFilters((c) => ({ ...c, campaign: event.target.value }))
                }
                className={inputClassName}
              >
                <option value="">Todas</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.name}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Data">
            <input
              type="date"
              value={diary.filters.date}
              onChange={(event) =>
                diary.setFilters((c) => ({ ...c, date: event.target.value }))
              }
              className={inputClassName}
            />
          </Field>
          <Field label="Local / SIA / Reservatório">
            <input
              value={diary.filters.location}
              onChange={(event) =>
                diary.setFilters((c) => ({ ...c, location: event.target.value }))
              }
              className={inputClassName}
              placeholder="Buscar local"
            />
          </Field>
          <Field label="Município">
            <input
              value={diary.filters.municipality}
              onChange={(event) =>
                diary.setFilters((c) => ({ ...c, municipality: event.target.value }))
              }
              className={inputClassName}
              placeholder="Buscar município"
            />
          </Field>
          <Field label="Com ocorrência">
            <select
              value={diary.filters.occurrence}
              onChange={(event) =>
                diary.setFilters((c) => ({
                  ...c,
                  occurrence: event.target.value as "todos" | "sim" | "nao",
                }))
              }
              className={inputClassName}
            >
              <option value="todos">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Registros"
        description={`${diary.filteredEntries.length} registro(s) encontrado(s).`}
        action={
          <button
            type="button"
            onClick={diary.resetFilters}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--ink-soft)] transition hover:text-[var(--brand-navy-strong)]"
          >
            <Search className="h-3.5 w-3.5" />
            Limpar filtros
          </button>
        }
      >
        {diary.isLoading ? (
          <EmptyState title="Carregando registros" description="Consultando o Diário de Campo." />
        ) : diary.filteredEntries.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line-ghost)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Campanha</th>
                    <th className="px-3 py-3">Dia</th>
                    <th className="px-3 py-3">Local / SIA</th>
                    <th className="px-3 py-3">Coordenadas</th>
                    <th className="px-3 py-3">Município</th>
                    <th className="px-3 py-3">Ocorrência</th>
                    <th className="px-3 py-3">Responsável</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {entriesPage.items.map((entry) => (
                    <tr key={entry.id} className="border-b border-[var(--line-ghost)] align-top">
                      <td className="px-3 py-4 font-bold text-[var(--brand-navy-strong)]">
                        {formatDate(entry.entryDate)}
                      </td>
                      <td className="px-3 py-4">{entry.campaignName}</td>
                      <td className="px-3 py-4">{entry.campaignDay}</td>
                      <td className="px-3 py-4">
                        <span className="block font-semibold">{entry.locationName}</span>
                        {entry.sia ? (
                          <span className="text-xs text-slate-500">{entry.sia}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 text-xs font-semibold text-slate-600">
                        {formatCoordinatePair(entry.latitude, entry.longitude)}
                      </td>
                      <td className="px-3 py-4">{entry.municipality}</td>
                      <td className="px-3 py-4">
                        <span
                          className={
                            entry.hasOccurrence ? occurrenceYesClassName : occurrenceNoClassName
                          }
                        >
                          {entry.hasOccurrence ? "Sim" : "Não"}
                        </span>
                      </td>
                      <td className="px-3 py-4">{entry.createdByName || "Não informado"}</td>
                      <td className="px-3 py-4">{entry.status}</td>
                      <td className="px-3 py-4">
                        <div className="flex gap-2">
                          <IconButton
                            label="Visualizar"
                            onClick={() => diary.openView(entry)}
                            icon={Eye}
                          />
                          <IconButton
                            label="Editar"
                            onClick={() => diary.openEditForm(entry)}
                            icon={Pencil}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={entriesPage.page}
              pageCount={entriesPage.pageCount}
              totalItems={entriesPage.totalItems}
              startIndex={entriesPage.startIndex}
              endIndex={entriesPage.endIndex}
              canPrevious={entriesPage.canPrevious}
              canNext={entriesPage.canNext}
              onPrevious={entriesPage.previous}
              onNext={entriesPage.next}
              itemLabel="registros"
            />
          </>
        ) : (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Crie um novo registro ou ajuste os filtros para consultar outros dias de campo."
          />
        )}
      </SectionCard>

      {diary.isImportOpen ? (
        <FieldDiaryImport
          onClose={diary.closeImport}
          onImported={(imported) => {
            diary.applyImport(imported);
            toast.success(
              `${imported.length} registro(s) importado(s)`,
              "Diário de Campo atualizado.",
            );
          }}
        />
      ) : null}

      {diary.formEntry ? (
        <FieldDiaryForm
          initialEntry={diary.formEntry}
          campaignScope={campaignScope}
          onSave={async (payload) => {
            const scopedPayload = campaignScope
              ? { ...payload, campaignId: campaignScope.id, campaignName: campaignScope.name }
              : payload;
            const error = validateEntry(scopedPayload);
            if (error) {
              return { ok: false, error };
            }
            const result = await diary.handleSave(scopedPayload);
            if (result) {
              toast.success(
                "Registro salvo",
                result.persistence === "cloud"
                  ? "Salvo no Diário de Campo."
                  : "Salvo localmente. A nuvem será usada quando disponível.",
              );
            }
            return { ok: true };
          }}
          onClose={diary.closeForm}
        />
      ) : null}

      {diary.viewEntry ? (
        <FieldDiaryView
          entry={diary.viewEntry}
          onClose={diary.closeView}
          onEdit={() => {
            const entry = diary.viewEntry;
            diary.closeView();
            if (entry) {
              diary.openEditForm(entry);
            }
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function FieldDiaryForm({
  initialEntry,
  campaignScope,
  onSave,
  onClose,
}: {
  initialEntry: FieldDiaryPayload;
  campaignScope?: FieldDiaryCampaignScope;
  onSave: (entry: FieldDiaryPayload) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<FieldDiaryPayload>(initialEntry);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  function update(next: Partial<FieldDiaryPayload>) {
    setEntry((current) => ({ ...current, ...next }));
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    const result = await onSave(entry);
    setIsPending(false);
    if (!result.ok && result.error) {
      setError(result.error);
    }
  }

  return (
    <Dialog
      title={entry.id ? "Editar registro" : "Novo registro"}
      onClose={onClose}
      icon={<ClipboardList className="h-5 w-5" />}
    >
      <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campanha" required>
            {campaignScope ? (
              <input
                value={campaignScope.name}
                readOnly
                className={`${inputClassName} cursor-not-allowed bg-slate-50 text-slate-600`}
              />
            ) : (
              <select
                value={entry.campaignId ?? ""}
                onChange={(event) => {
                  const campaign = campaignOptions.find((item) => item.id === event.target.value);
                  update({ campaignId: campaign?.id ?? "", campaignName: campaign?.name ?? "" });
                }}
                className={inputClassName}
              >
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Dia da campanha" required>
            <input
              type="number"
              min={1}
              value={entry.campaignDay}
              onChange={(event) => update({ campaignDay: Number(event.target.value) })}
              className={inputClassName}
            />
          </Field>
          <Field label="Data" required>
            <input
              type="date"
              value={entry.entryDate}
              onChange={(event) => update({ entryDate: event.target.value })}
              className={inputClassName}
            />
          </Field>
          <Field label="Responsável pelo registro">
            <input
              value={entry.createdByName ?? ""}
              onChange={(event) => update({ createdByName: event.target.value })}
              className={inputClassName}
              placeholder="Nome do responsável"
            />
          </Field>
          <Field label="Local / Reservatório">
            <input
              value={entry.locationName}
              onChange={(event) => update({ locationName: event.target.value })}
              className={inputClassName}
              placeholder="Local visitado"
              maxLength={140}
            />
          </Field>
          <Field label="SIA">
            <input
              value={entry.sia ?? ""}
              onChange={(event) => update({ sia: event.target.value })}
              className={inputClassName}
              placeholder="Código ou referência SIA"
              maxLength={80}
            />
          </Field>
          <Field label="Latitude">
            <input
              value={entry.latitude ?? ""}
              onChange={(event) => update({ latitude: event.target.value })}
              className={inputClassName}
              placeholder="Ex: -25.4284"
              maxLength={20}
            />
          </Field>
          <Field label="Longitude">
            <input
              value={entry.longitude ?? ""}
              onChange={(event) => update({ longitude: event.target.value })}
              className={inputClassName}
              placeholder="Ex: -49.2733"
              maxLength={20}
            />
          </Field>
          <Field label="Município">
            <input
              value={entry.municipality}
              onChange={(event) => update({ municipality: event.target.value })}
              className={inputClassName}
              placeholder="Município"
              maxLength={100}
            />
          </Field>
          <Field label="Status">
            <select
              value={entry.status}
              onChange={(event) =>
                update({ status: event.target.value as FieldDiaryPayload["status"] })
              }
              className={inputClassName}
            >
              {fieldDiaryStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Checklist
          label="Atividades realizadas"
          options={activityOptions}
          values={entry.activities}
          onChange={(activities) => update({ activities })}
        />

        <Checklist
          label="Condições visuais da água"
          options={waterVisualConditionOptions}
          values={entry.waterVisualConditions}
          onChange={(waterVisualConditions) => update({ waterVisualConditions })}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Houve ocorrência relevante?">
            <select
              value={entry.hasOccurrence ? "sim" : "nao"}
              onChange={(event) => update({ hasOccurrence: event.target.value === "sim" })}
              className={inputClassName}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </Field>
          <Field label="A ocorrência exige acompanhamento?">
            <select
              value={entry.requiresFollowUp}
              onChange={(event) =>
                update({
                  requiresFollowUp: event.target.value as FieldDiaryPayload["requiresFollowUp"],
                })
              }
              className={inputClassName}
            >
              {followUpOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pendência ou encaminhamento">
            <input
              value={entry.followUpNotes ?? ""}
              onChange={(event) => update({ followUpNotes: event.target.value })}
              className={inputClassName}
              placeholder="Opcional"
              maxLength={180}
            />
          </Field>
        </div>

        {entry.hasOccurrence ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo de ocorrência">
              <select
                value={entry.occurrenceType ?? ""}
                onChange={(event) => update({ occurrenceType: event.target.value })}
                className={inputClassName}
              >
                <option value="">Selecionar</option>
                {occurrenceTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição da ocorrência">
              <textarea
                value={entry.occurrenceDescription ?? ""}
                onChange={(event) => update({ occurrenceDescription: event.target.value })}
                className={textareaClassName}
                placeholder="Descreva objetivamente a ocorrência"
                maxLength={500}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Resumo do dia">
          <textarea
            value={entry.dailySummary}
            onChange={(event) => update({ dailySummary: event.target.value })}
            className={textareaClassName}
            placeholder="Registre de forma objetiva o que ocorreu no dia."
            maxLength={700}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm font-semibold text-[var(--brand-danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:opacity-60"
          >
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Salvar registro
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldDiaryView({
  entry,
  onClose,
  onEdit,
}: {
  entry: FieldDiaryEntry;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Dialog
      title="Visualizar registro"
      onClose={onClose}
      icon={<ClipboardList className="h-5 w-5" />}
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Data" value={formatDate(entry.entryDate)} />
          <Info label="Campanha" value={entry.campaignName} />
          <Info label="Dia" value={String(entry.campaignDay)} />
          <Info
            label="Local / SIA"
            value={[entry.locationName, entry.sia].filter(Boolean).join(" · ")}
          />
          <Info label="Latitude" value={entry.latitude || "Não informado"} />
          <Info label="Longitude" value={entry.longitude || "Não informado"} />
          <Info label="Município" value={entry.municipality} />
          <Info label="Responsável" value={entry.createdByName || "Não informado"} />
          <Info label="Ocorrência" value={entry.hasOccurrence ? "Sim" : "Não"} />
          <Info label="Acompanhamento" value={entry.requiresFollowUp} />
          <Info label="Status" value={entry.status} />
        </div>

        <DetailBlock
          label="Atividades realizadas"
          value={entry.activities.join(", ") || "Não informado"}
        />
        <DetailBlock
          label="Condições visuais da água"
          value={entry.waterVisualConditions.join(", ") || "Não informado"}
        />
        {entry.hasOccurrence ? (
          <>
            <DetailBlock
              label="Tipo de ocorrência"
              value={entry.occurrenceType || "Não informado"}
            />
            <DetailBlock
              label="Descrição da ocorrência"
              value={entry.occurrenceDescription || "Não informado"}
            />
          </>
        ) : null}
        <DetailBlock
          label="Pendência ou encaminhamento"
          value={entry.followUpNotes || "Sem pendência registrada"}
        />
        <DetailBlock label="Resumo do dia" value={entry.dailySummary} />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        </div>
      </div>
    </Dialog>
  );
}

type ImportResult = {
  saved: number;
  errors: string[];
  entries: FieldDiaryEntry[];
};

function FieldDiaryImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (entries: FieldDiaryEntry[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyFile(file: File) {
    setSelectedFileName(file.name);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecione um arquivo .xlsx para importar.");
      return;
    }
    setIsPending(true);
    setError(null);
    setResult(null);

    const response = await fetch("/api/field-diary/import", { method: "POST", body: formData });
    const payload = (await response.json()) as ImportResult | { error: string };

    if (!response.ok || "error" in payload) {
      setError("error" in payload ? payload.error : "Erro ao processar a planilha.");
      setIsPending(false);
      return;
    }

    setResult(payload as ImportResult);
    setIsPending(false);
  }

  return (
    <Dialog
      title="Importar via planilha"
      onClose={onClose}
      icon={<ClipboardList className="h-5 w-5" />}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
          <div className="rounded-xl bg-white p-2 text-[var(--brand-blue)]">
            <Sheet className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--brand-navy-strong)]">
              Planilha de ocorrências do Diário
            </p>
            <p className="text-xs text-[var(--ink-soft)]">
              Use uma planilha própria de registros diários; a planilha-síntese das campanhas fica
              reservada para mapas e pontos.
            </p>
          </div>
          <a
            href="/template-diario-de-campo.xlsx"
            download
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-[#ffffff] transition hover:bg-[var(--brand-navy)]"
          >
            <Download className="h-4 w-4" />
            Baixar modelo do Diário
          </a>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label
            className={`block cursor-pointer rounded-2xl border-2 p-5 text-sm transition-colors ${
              isDragging
                ? "border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]"
                : "border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) {
                applyFile(f);
              }
            }}
          >
            <span className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-[0_18px_40px_-34px_rgba(0,66,98,0.18)]">
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-white">
                <UploadCloud className="h-4 w-4" />
                {isDragging ? "Solte aqui" : "Selecionar planilha"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink-soft)]">
                {selectedFileName ?? "Arraste um arquivo .xlsx ou clique para selecionar"}
              </span>
            </span>
            <input
              ref={fileInputRef}
              name="file"
              type="file"
              accept=".xlsx,.xlsm"
              className="sr-only"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) {
                  applyFile(f);
                }
              }}
            />
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedFileName}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Importar registros
            </button>
          </div>
        </form>

        {error ? (
          <div role="alert" className="rounded-2xl bg-[rgba(186,26,26,0.08)] p-4 text-sm text-[var(--brand-danger)]">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[rgba(5,150,105,0.10)] p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{result.entries.length} registro(s) importado(s) com sucesso.</span>
              {result.entries.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onImported(result.entries)}
                  className="ml-auto rounded-full bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-900"
                >
                  Fechar e ver registros
                </button>
              ) : null}
            </div>
            {result.errors.length > 0 ? (
              <div className="rounded-2xl bg-[rgba(234,179,8,0.12)] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
                  {result.errors.length} aviso(s)
                </p>
                <ul className="space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-amber-900">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Primitivas de UI do diário
// ---------------------------------------------------------------------------

function Checklist({
  label,
  options,
  values,
  onChange,
  required,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="rounded-2xl border border-[var(--line-ghost)] p-4">
      <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
        {required ? " *" : ""}
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => {
          const checked = values.includes(option);
          return (
            <label
              key={option}
              className="flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--ink-soft)]"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...values, option]
                      : values.filter((v) => v !== option),
                  )
                }
                className="h-4 w-4 accent-[var(--brand-navy)]"
              />
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
      {label}
      {required ? " *" : ""}
      {children}
    </label>
  );
}

function ImportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
    >
      <Sheet className="h-4 w-4" />
      Importar planilha
    </button>
  );
}

function NewEntryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white shadow-[0_18px_38px_-28px_rgba(0,66,98,0.6)] transition hover:bg-[var(--brand-navy)]"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Eye;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg border border-[var(--line-ghost)] bg-white p-2 text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <FileText className="mb-3 h-9 w-9 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--brand-navy-strong)]">{value}</p>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilitários de formatação
// ---------------------------------------------------------------------------

function formatDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function formatCoordinatePair(latitude?: string | null, longitude?: string | null) {
  const lat = String(latitude ?? "").trim();
  const lon = String(longitude ?? "").trim();
  return lat && lon ? `${lat}, ${lon}` : "Sem coordenada";
}

const inputClassName =
  "rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20";

const textareaClassName =
  "min-h-28 rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20";

const occurrenceYesClassName =
  "rounded-full bg-[var(--brand-amber)]/12 px-2.5 py-1 text-xs font-bold text-[var(--brand-amber)]";

const occurrenceNoClassName =
  "rounded-full bg-[var(--brand-green-soft)] px-2.5 py-1 text-xs font-bold text-[var(--brand-navy-strong)]";
