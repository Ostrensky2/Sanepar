"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Inbox,
  Mail,
  Plus,
  Save,
  Send,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import { SYNC_STATUS_EVENT, readSyncStatusSnapshot, type SyncState } from "@/lib/sync-status";
import {
  DEFAULT_ATGC_EMAIL,
  getRequestRecipient,
  notifyCounterpart,
  readSupportRequests,
  readSupportRequestsFromStorage,
  writeSupportRequests,
  type RequestDirection,
  type RequestPriority,
  type RequestStatus,
  type SupportRequest,
} from "@/lib/support-requests";

const statusOptions: RequestStatus[] = ["Nova", "Em análise", "Em andamento", "Aguardando retorno", "Concluída"];
const priorityOptions: RequestPriority[] = ["Baixa", "Normal", "Alta", "Urgente"];
const institutionOptions: RequestDirection[] = ["Sanepar → ATGC", "ATGC → Sanepar"];
const typeOptions = [
  "Dúvida operacional",
  "Ajuste no APP",
  "Documento ou dado ausente",
  "Correção de informação",
  "Demanda técnica",
  "Outro",
];

const quickResponses = [
  "Recebido. A solicitação foi registrada e será analisada pela equipe ATGC.",
  "Estamos verificando a demanda e retornaremos assim que houver encaminhamento.",
  "Precisamos de mais informações para concluir a análise. Favor complementar o registro.",
  "Solicitação atendida. Favor validar se o retorno resolve a demanda registrada.",
];

const inputClass =
  "w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--brand-navy-strong)] outline-none transition placeholder:text-[var(--ink-soft)] focus:border-[var(--brand-teal)]";

const emptyForm = {
  title: "",
  requester: "",
  institution: "Sanepar → ATGC" as RequestDirection,
  type: typeOptions[0],
  priority: "Normal" as RequestPriority,
  description: "",
};

type NotifyFeedback = { id: string; ok: boolean; message: string };

export default function SolicitacoesPage() {
  const [requests, setRequests] = useState<SupportRequest[]>(readSupportRequestsFromStorage);
  const [form, setForm] = useState(emptyForm);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"Todas" | RequestStatus>("Todas");
  const [responseDraftById, setResponseDraftById] = useState<Record<string, string>>({});
  const [savedResponseId, setSavedResponseId] = useState<string | null>(null);
  const [notifyFeedback, setNotifyFeedback] = useState<NotifyFeedback | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(() => readSyncStatusSnapshot().state);

  useEffect(() => {
    function syncStatus() {
      setSyncState(readSyncStatusSnapshot().state);
    }

    syncStatus();
    window.addEventListener(SYNC_STATUS_EVENT, syncStatus);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, syncStatus);
  }, []);

  useEffect(() => {
    let active = true;

    readSupportRequests().then((loaded) => {
      if (active) {
        setRequests(loaded);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function persist(next: SupportRequest[]) {
    const savedInCloud = await writeSupportRequests(next);

    if (savedInCloud || canUseBrowserOnlyPersistence()) {
      setRequests(next);
      return true;
    }

    setNotifyFeedback({
      id: "sync-error",
      ok: false,
      message: "A nuvem não confirmou a gravação. A alteração não foi publicada para outros usuários.",
    });
    return false;
  }

  const filteredRequests = useMemo(() => {
    if (statusFilter === "Todas") {
      return requests;
    }

    return requests.filter((request) => request.status === statusFilter);
  }, [requests, statusFilter]);

  const activeRequest = requests.find((request) => request.id === activeId) ?? filteredRequests[0] ?? requests[0];
  const openRequests = requests.filter((request) => request.status !== "Concluída").length;
  const urgentRequests = requests.filter((request) => request.priority === "Urgente" && request.status !== "Concluída").length;

  async function createRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim() || !form.description.trim()) {
      return;
    }

    const now = new Date().toISOString();
    const request: SupportRequest = {
      id: crypto.randomUUID(),
      ...form,
      title: form.title.trim(),
      requester: form.requester.trim() || "Solicitante não informado",
      description: form.description.trim(),
      response: "",
      status: "Nova",
      notified: false,
      createdAt: now,
      updatedAt: now,
    };

    const baseRequests = requests;
    const persisted = await persist([request, ...baseRequests]);

    if (!persisted) {
      return;
    }

    setActiveId(request.id);
    setForm(emptyForm);
    setNotifyFeedback({ id: request.id, ok: true, message: "Enviando aviso à contraparte…" });

    const result = await notifyCounterpart(request);
    setNotifyFeedback({ id: request.id, ok: result.ok, message: result.message });

    if (result.delivered) {
      const notifiedRequest: SupportRequest = {
        ...request,
        notified: true,
        notifiedAt: new Date().toISOString(),
      };
      void persist([notifiedRequest, ...baseRequests]);
    }
  }

  function updateStatus(id: string, status: RequestStatus) {
    void persist(
      requests.map((request) =>
        request.id === id ? { ...request, status, updatedAt: new Date().toISOString() } : request,
      ),
    );
  }

  function updateResponse(id: string, response: string) {
    const now = new Date().toISOString();

    void persist(
      requests.map((request) =>
        request.id === id
          ? { ...request, response: response.trim(), responseUpdatedAt: now, updatedAt: now }
          : request,
      ),
    );
  }

  function getResponseDraft(request: SupportRequest) {
    return responseDraftById[request.id] ?? request.response ?? "";
  }

  function setResponseDraft(id: string, response: string) {
    setResponseDraftById((current) => ({ ...current, [id]: response }));
    setSavedResponseId(null);
  }

  function saveResponse(request: SupportRequest) {
    updateResponse(request.id, getResponseDraft(request));
    setSavedResponseId(request.id);
    window.setTimeout(() => setSavedResponseId(null), 1800);
  }

  const mailHref = activeRequest
    ? `mailto:${getRequestRecipient(activeRequest)}?subject=${encodeURIComponent(`Solicitação Yva'e: ${activeRequest.title}`)}&body=${encodeURIComponent(buildEmailBody(activeRequest))}`
    : `mailto:${DEFAULT_ATGC_EMAIL}`;

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
        Demandas entre Sanepar e ATGC, com status e respostas registradas no sistema.
      </p>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Clock3 className="h-4 w-4" />} label="Em aberto" value={openRequests.toString()} />
        <Metric icon={<AlertCircle className="h-4 w-4" />} label="Urgentes" value={urgentRequests.toString()} tone="amber" />
        <Metric icon={<CheckCircle2 className="h-4 w-4" />} label="Total registrado" value={requests.length.toString()} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
              <Plus className="h-4 w-4" />
            </div>
            <h2 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">Nova solicitação</h2>
          </div>

          <form onSubmit={createRequest} className="mt-4 grid gap-3">
            <Field label="Assunto">
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                className={inputClass}
                placeholder="Ex.: Corrigir documento da campanha"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Solicitante">
                <input
                  value={form.requester}
                  onChange={(event) => setForm({ ...form, requester: event.target.value })}
                  className={inputClass}
                  placeholder="Nome"
                />
              </Field>
              <Field label="Instituição">
                <select
                  value={form.institution}
                  onChange={(event) => setForm({ ...form, institution: event.target.value as RequestDirection })}
                  className={inputClass}
                >
                  {institutionOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value })}
                  className={inputClass}
                >
                  {typeOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridade">
                <select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value as RequestPriority })}
                  className={inputClass}
                >
                  {priorityOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Descrição">
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className={cn(inputClass, "min-h-28 resize-y")}
                placeholder="Descreva a demanda, tela envolvida, campanha/ponto e anexos ou links relevantes."
              />
            </Field>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-black text-white shadow-[0_18px_34px_-24px_rgba(0,66,98,0.6)] transition hover:bg-[var(--brand-teal)]"
            >
              <Send className="h-4 w-4" />
              Registrar solicitação
            </button>
          </form>

          {notifyFeedback ? (
            <p
              className={cn(
                "mt-3 rounded-xl border px-3 py-2 text-xs font-bold",
                notifyFeedback.ok
                  ? "border-[var(--brand-teal)] bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]"
                  : "border-[var(--brand-amber)] bg-[rgba(197,122,0,0.1)] text-[var(--brand-amber)]",
              )}
            >
              {notifyFeedback.message}
            </p>
          ) : null}

          <p className="mt-3 text-xs font-semibold leading-5 text-[var(--ink-soft)]">
            Ao registrar, a solicitação é salva no sistema e um aviso é enviado automaticamente
            por e-mail à instituição destinatária.
          </p>
        </article>

        <div className="space-y-4">
          <section className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">Acompanhamento</h2>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "Todas" | RequestStatus)}
                className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-xs font-bold text-[var(--brand-navy-strong)] outline-none"
              >
                <option>Todas</option>
                {statusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 grid gap-3">
              {filteredRequests.length ? (
                filteredRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setActiveId(request.id)}
                    className={cn(
                      "grid gap-3 rounded-xl border p-4 text-left transition md:grid-cols-[1fr_auto]",
                      activeRequest?.id === request.id
                        ? "border-[var(--brand-teal)] bg-[var(--brand-teal-soft)]"
                        : "border-[var(--line-ghost)] bg-white hover:border-[var(--line-strong)]",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-black text-[var(--brand-navy-strong)]">{request.title}</span>
                      <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--ink-soft)]">
                        {request.requester} · {request.type} · {formatDate(request.createdAt)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusChip label={request.priority} kind="priority" />
                      <StatusChip label={request.status} />
                    </span>
                  </button>
                ))
              ) : (
                <EmptyState
                  icon={Inbox}
                  title={
                    syncState !== "synced" && !requests.length
                      ? "Solicitações disponíveis apenas com a nuvem"
                      : "Nenhuma solicitação encontrada"
                  }
                  description={
                    syncState !== "synced" && !requests.length
                      ? "As solicitações ficam na nuvem e este dispositivo está em modo local. Elas voltam a aparecer quando a conexão for restabelecida."
                      : "Ajuste o filtro ou registre uma nova solicitação no formulário ao lado."
                  }
                  compact
                />
              )}
            </div>
          </section>

          {activeRequest ? (
            <section className="grid gap-4 2xl:grid-cols-[1fr_360px]">
              <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
                  <div>
                    <p className="text-caption font-black uppercase tracking-[0.18em] text-[var(--brand-teal)]">
                      Solicitação selecionada
                    </p>
                    <h2 className="heading-font mt-1 text-xl font-black text-[var(--brand-navy-strong)]">
                      {activeRequest.title}
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-[var(--ink-soft)]">
                      Atualizada em {formatDate(activeRequest.updatedAt)}
                    </p>
                  </div>
                  <StatusChip label={activeRequest.status} />
                </div>

                <dl className="mt-4 grid gap-3 md:grid-cols-2">
                  <Info label="Solicitante" value={activeRequest.requester} />
                  <Info label="Instituição" value={activeRequest.institution} />
                  <Info label="Tipo" value={activeRequest.type} />
                  <Info label="E-mail de aviso" value={getRequestRecipient(activeRequest)} />
                </dl>

                <div className="mt-4 rounded-xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
                  <p className="text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">Descrição</p>
                  <p className="mt-2 whitespace-pre-wrap text-justify text-sm leading-6 text-[var(--brand-navy-strong)]">
                    {activeRequest.description}
                  </p>
                </div>

                <div className="mt-4">
                  <p className="text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">Status</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => updateStatus(activeRequest.id, status)}
                        className={cn(
                          "h-9 rounded-full border px-3 text-xs font-black transition",
                          activeRequest.status === status
                            ? "border-[var(--brand-teal)] bg-[var(--brand-teal)] text-white"
                            : "border-[var(--line-ghost)] bg-white text-[var(--brand-navy-strong)] hover:border-[var(--brand-teal)]",
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--line-ghost)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        Resposta registrada
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--ink-soft)]">
                        {activeRequest.responseUpdatedAt
                          ? `Última resposta em ${formatDate(activeRequest.responseUpdatedAt)}`
                          : "Ainda sem resposta registrada."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => saveResponse(activeRequest)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-3 text-xs font-black text-white transition hover:bg-[var(--brand-teal)]"
                    >
                      <Save className="h-4 w-4" />
                      Salvar resposta
                    </button>
                  </div>
                  <textarea
                    value={getResponseDraft(activeRequest)}
                    onChange={(event) => setResponseDraft(activeRequest.id, event.target.value)}
                    className={cn(inputClass, "mt-3 min-h-32 resize-y")}
                    placeholder="Registre aqui a resposta da ATGC, encaminhamento adotado ou informação solicitada."
                  />
                  {savedResponseId === activeRequest.id ? (
                    <p className="mt-2 text-xs font-bold text-[var(--brand-teal)]">Resposta salva no sistema.</p>
                  ) : null}
                </div>
              </article>

              <aside className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
                <Mail className="h-5 w-5 text-[var(--brand-teal)]" />
                <h2 className="mt-3 text-sm font-black text-[var(--brand-navy-strong)]">Modelos de resposta</h2>
                <div className="mt-3 grid gap-2">
                  {quickResponses.map((response) => (
                    <button
                      key={response}
                      type="button"
                      onClick={() => setResponseDraft(activeRequest.id, response)}
                      className="rounded-xl border border-[var(--line-ghost)] bg-white p-3 text-left text-xs font-semibold leading-5 text-[var(--ink-soft)] transition hover:border-[var(--brand-teal)] hover:text-[var(--brand-navy-strong)]"
                    >
                      {response}
                    </button>
                  ))}
                </div>
                <a
                  href={mailHref}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-xs font-black text-[var(--brand-navy-strong)] shadow-sm transition hover:border-[var(--brand-teal)] hover:text-[var(--brand-teal)]"
                >
                  <Mail className="h-4 w-4" />
                  Abrir aviso por e-mail
                </a>
                <p className="mt-3 text-xs font-semibold leading-5 text-[var(--ink-soft)]">
                  O e-mail é só aviso; registre o atendimento nesta tela.
                </p>
              </aside>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "teal",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "teal" | "amber";
}) {
  return (
    <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">{label}</p>
          <p className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">{value}</p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            tone === "amber" ? "bg-[rgba(197,122,0,0.1)] text-[var(--brand-amber)]" : "bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]",
          )}
        >
          {icon}
        </div>
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line-ghost)] bg-white p-3">
      <dt className="text-caption font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-[var(--brand-navy-strong)]">{value}</dd>
    </div>
  );
}

function StatusChip({ label, kind = "status" }: { label: string; kind?: "status" | "priority" }) {
  const isUrgent = label === "Urgente";

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-label font-black",
        kind === "priority"
          ? isUrgent
            ? "bg-[rgba(197,122,0,0.12)] text-[var(--brand-amber)]"
            : "bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]"
          : label === "Concluída"
            ? "bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]"
            : "bg-[var(--surface-soft)] text-[var(--brand-navy-strong)]",
      )}
    >
      {label}
    </span>
  );
}

function buildEmailBody(request: SupportRequest) {
  return [
    `Solicitação: ${request.title}`,
    `Solicitante: ${request.requester}`,
    `Instituição: ${request.institution}`,
    `Tipo: ${request.type}`,
    `Prioridade: ${request.priority}`,
    `Status: ${request.status}`,
    "",
    request.description,
    "",
    request.response ? `Resposta registrada:\n${request.response}` : "Resposta registrada: ainda não informada.",
  ].join("\n");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

