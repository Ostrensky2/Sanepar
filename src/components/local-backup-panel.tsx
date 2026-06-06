"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  DatabaseBackup,
  Download,
  FileArchive,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { beginGlobalOperation, toActionableErrorMessage } from "@/components/operational-feedback";

type LocalBackupPanelProps = {
  enabled: boolean;
  targetRoot: string;
  databaseRoot?: string;
  dailyRoot: string;
  monthlyRoot: string;
  mode?: "full" | "settings";
};

type BackupType = "manual-app" | "manual-db" | "diario" | "mensal";

type BackupHistoryItem = {
  id: string;
  date: string;
  type: BackupType;
  label: string;
  path: string;
  sizeBytes: number;
  status: "ok" | "erro";
  checksum?: string;
  restorable: boolean;
  downloadable: boolean;
};

const CLOUD_RESTORE_REQUESTS_STORAGE_KEY = "yvae:cloud-restore-requests";

type OperationLogEntry = {
  timestamp: string;
  operation: string;
  status: "ok" | "erro";
  message: string;
  error?: string;
};

type CloudRestoreRequest = {
  id: string;
  createdAt: string;
  backupLabel: string;
  backupPath: string;
  status: "pendente";
};

type BackupResponse = {
  ok: true;
  message: string;
  destinationRoot: string;
  archivePath?: string;
  databaseBackupPath?: string;
  generatedAt: string;
  copiedFiles: number;
  sizeBytes: number;
  checksum?: string;
};

type PendingAction = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  inputLabel?: string;
  requiredInput?: string;
  run: (inputValue: string) => Promise<BackupResponse | void>;
};

export function LocalBackupPanel({
  enabled,
  targetRoot,
  databaseRoot,
  dailyRoot,
  monthlyRoot,
  mode = "full",
}: LocalBackupPanelProps) {
  const resolvedDatabaseRoot = databaseRoot ?? dailyRoot;
  const [isPending, startTransition] = useTransition();
  const [backups, setBackups] = useState<BackupHistoryItem[]>([]);
  const [logs, setLogs] = useState<OperationLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BackupResponse | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [cloudRestoreRequests, setCloudRestoreRequests] = useState<CloudRestoreRequest[]>(() =>
    readCloudRestoreRequests(),
  );

  const refreshHistory = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const response = await fetch("/api/local/backups", { cache: "no-store" });
      const payload = (await response.json()) as
        | { ok: true; backups: BackupHistoryItem[]; logs: OperationLogEntry[] }
        | { error: string };

      if (!response.ok || "error" in payload) {
        setError("error" in payload ? payload.error : "Falha ao carregar histórico.");
        return;
      }

      setBackups(payload.backups);
      setLogs(payload.logs);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao consultar histórico de backups.",
      );
    }
  }, [enabled]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshHistory();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refreshHistory]);

  const manualDbBackups = useMemo(
    () => backups.filter((backup) => backup.type === "manual-db"),
    [backups],
  );
  const latestAppBackup = useMemo(
    () => backups.find((backup) => backup.type === "manual-app"),
    [backups],
  );
  const latestDailyBackup = useMemo(
    () => backups.find((backup) => backup.type === "diario"),
    [backups],
  );
  const latestCloudRestoreSource = useMemo(
    () => backups.find((backup) => backup.type === "diario") ?? backups.find((backup) => backup.type === "mensal"),
    [backups],
  );
  const retainedMonthlyCount = useMemo(
    () => backups.filter((backup) => backup.type === "mensal").length,
    [backups],
  );
  const latestDailyBackups = useMemo(
    () => backups.filter((backup) => backup.type === "diario").slice(0, 5),
    [backups],
  );

  function runWithProgress(operation: () => Promise<BackupResponse | void>) {
    const stopOperation = beginGlobalOperation({
      id: `local-backup:${crypto.randomUUID()}`,
      title: "Executando operação de backup...",
      description: "Mantendo o histórico atualizado. Esta operação pode levar alguns instantes.",
    });

    startTransition(async () => {
      setError(null);
      setResult(null);

      try {
        const operationResult = await operation();
        if (operationResult) {
          setResult(operationResult);
        }
        await refreshHistory();
      } catch (operationError) {
        setError(toActionableErrorMessage(operationError));
      } finally {
        stopOperation();
      }
    });
  }

  async function postBackupAction(action: "app" | "database" | "daily" | "cleanup") {
    const response = await fetch("/api/local/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = (await response.json()) as BackupResponse | { error: string };

    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : "Falha ao executar backup.");
    }

    return payload;
  }

  function confirmAction(action: PendingAction) {
    setModalInput("");
    setPendingAction(action);
  }

  function closeModal() {
    if (isPending) {
      return;
    }

    setPendingAction(null);
    setModalInput("");
  }

  function executeModalAction() {
    if (!pendingAction) {
      return;
    }

    if (pendingAction.requiredInput && modalInput !== pendingAction.requiredInput) {
      setError(`O texto exato deve ser digitado: ${pendingAction.requiredInput}`);
      return;
    }

    const action = pendingAction;
    setPendingAction(null);
    runWithProgress(() => action.run(modalInput));
  }

  async function restoreBackup(backup: BackupHistoryItem, confirmation: string) {
    const response = await fetch(`/api/local/backups/${backup.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const payload = (await response.json()) as BackupResponse | { error: string };

    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : "Falha ao restaurar backup.");
    }

    return payload;
  }

  async function deleteBackup(backup: BackupHistoryItem) {
    const response = await fetch(`/api/local/backups/${backup.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { ok: true } | { error: string };

    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : "Falha ao excluir backup.");
    }
  }

  async function createCloudRestoreRequest(backup: BackupHistoryItem | undefined) {
    if (!backup) {
      throw new Error("Nenhum backup local disponível para solicitar restauração na nuvem.");
    }

    const request: CloudRestoreRequest = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      backupLabel: backup.label,
      backupPath: backup.path,
      status: "pendente",
    };
    const nextRequests = [request, ...cloudRestoreRequests].slice(0, 20);

    setCloudRestoreRequests(nextRequests);
    writeCloudRestoreRequests(nextRequests);
  }

  if (mode === "settings") {
    return (
      <div className="space-y-4">
        {!enabled ? (
          <StatusMessage
            tone="error"
            message="Controles locais bloqueados fora do localhost."
          />
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
          <BackupOverviewCard
            icon={CloudUpload}
            title="Backup manual do app"
            badge="Manual"
            stats={[
              ["Último backup", latestAppBackup ? formatDateTime(latestAppBackup.date) : "Nunca"],
              ["Status", "Gerenciado no localhost"],
              ["Tamanho", latestAppBackup ? formatBytes(latestAppBackup.sizeBytes) : "---"],
              ["Backups retidos", String(backups.filter((backup) => backup.type === "manual-app").length)],
            ]}
            details={[
              `Local: ${targetRoot}`,
              "Arquivo atual: versão em execução",
              "Política: acionamento sempre manual a partir do localhost.",
            ]}
            actions={[
              {
                label: "Gerar backup do app",
                disabled: !enabled || isPending,
                onClick: () =>
                  confirmAction({
                    title: "Salvar app",
                    message: `A versão atual do aplicativo será salva em ${targetRoot}.`,
                    confirmLabel: "Salvar app",
                    run: () => postBackupAction("app"),
                  }),
              },
            ]}
          />

          <BackupOverviewCard
            icon={FileArchive}
            title="Backup do BD a partir da nuvem"
            badge="Automático"
            stats={[
              ["Último backup", latestDailyBackup ? formatDateTime(latestDailyBackup.date) : "Nunca"],
              ["Horário", "12:15"],
              ["Retenção", "Dias 01 e 15"],
              ["Mensais retidos", String(retainedMonthlyCount)],
            ]}
            details={[
              `Diários: ${dailyRoot}`,
              `Mensais: ${monthlyRoot}`,
              "Política: ao final do mês, apenas os dias 01 e 15 são movidos para Mensais; os demais são apagados.",
            ]}
            actions={[
              {
                label: "Rodar backup do BD",
                disabled: !enabled || isPending,
                onClick: () =>
                  confirmAction({
                    title: "Executar auto backup",
                    message: `A rotina automática diária do banco de dados será executada agora em ${dailyRoot}.`,
                    confirmLabel: "Executar",
                    run: () => postBackupAction("daily"),
                  }),
              },
            ]}
          />

          <BackupOverviewCard
            icon={RotateCcw}
            title="Restauração do BD na nuvem"
            badge="Request"
            tone="danger"
            stats={[
              ["Origem local", latestCloudRestoreSource?.label ?? "Sem backup"],
              ["Requests", String(cloudRestoreRequests.length)],
              ["Status", cloudRestoreRequests[0]?.status ?? "---"],
              ["Última request", cloudRestoreRequests[0] ? formatDateTime(cloudRestoreRequests[0].createdAt) : "Nenhuma"],
            ]}
            details={[
              "Cria request explícita para restauração cloud.",
              "Exige validação prévia do dump local.",
              latestCloudRestoreSource ? `Backup selecionado: ${latestCloudRestoreSource.path}` : "Nenhum backup diário/mensal encontrado.",
            ]}
            actions={[
              {
                label: "Criar request de restauração",
                disabled: !enabled || isPending || !latestCloudRestoreSource,
                danger: true,
                onClick: () =>
                  confirmAction({
                    title: "Criar request de restauração na nuvem",
                    message:
                      "Esta ação registra uma solicitação de restauração do BD na nuvem a partir do backup local mais recente. Digite RESTAURAR NUVEM para confirmar.",
                    inputLabel: "Confirmação",
                    requiredInput: "RESTAURAR NUVEM",
                    confirmLabel: "Criar request",
                    danger: true,
                    run: () => createCloudRestoreRequest(latestCloudRestoreSource),
                  }),
              },
            ]}
          />

          <BackupOverviewCard
            icon={ShieldCheck}
            title="Retenção dos backups"
            badge="Mensal"
            stats={[
              ["Política", "Dias 01 e 15"],
              ["Mensais", String(retainedMonthlyCount)],
              ["Diários", String(latestDailyBackups.length)],
              ["Destino", "Mensais"],
            ]}
            details={[
              `Origem: ${dailyRoot}`,
              `Destino: ${monthlyRoot}`,
              "Ao fechar o mês, os dias 01 e 15 são movidos para Mensais; os demais backups diários são apagados.",
            ]}
            actions={[
              {
                label: "Aplicar retenção",
                disabled: !enabled || isPending,
                danger: true,
                onClick: () =>
                  confirmAction({
                    title: "Aplicar retenção",
                    message:
                      "Backups diários de meses fechados serão organizados: dias 01 e 15 vão para Mensais; os demais serão apagados.",
                    confirmLabel: "Aplicar",
                    danger: true,
                    run: () => postBackupAction("cleanup"),
                  }),
              },
            ]}
          />
        </div>

        <section className="rounded-xl border border-[var(--line-ghost)] bg-white/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black text-[var(--brand-navy-strong)]">
                Automação do backup
              </p>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Rotina diária do BD e retenção mensal.
              </p>
            </div>
            <span className="rounded-lg bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--brand-navy-strong)]">
              {enabled ? "Host operacional" : "Somente leitura"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <MiniStat label="Status da automação" value={enabled ? "Ativa no localhost" : "Bloqueada"} />
            <MiniStat label="Modo de execução" value="Host local" />
            <MiniStat label="Tarefa diária" value="12:15" />
            <MiniStat label="Retenção mensal" value="Dias 01 e 15" />
          </div>
          <div className="mt-4 rounded-xl border border-[var(--line-ghost)] bg-white p-3 text-xs leading-5 text-[var(--ink-soft)]">
            O app agenda o backup automático do BD uma vez ao dia às 12:15. O backup do APP permanece manual e só é executado pelo localhost.
          </div>
        </section>

        {isPending ? (
          <StatusMessage tone="info" message="Operação em andamento..." />
        ) : null}
        {error ? <StatusMessage tone="error" message={error} /> : null}
        {result ? (
          <StatusMessage
            tone="success"
            message={`${result.message} Tamanho: ${formatBytes(result.sizeBytes)}.`}
          />
        ) : null}

        <section className="rounded-xl bg-[var(--surface-soft)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[var(--brand-navy-strong)]">
                Últimos 5 auto backups do BD
              </p>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Salvamentos diários registrados no disco local.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshHistory()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)]"
              aria-label="Atualizar histórico"
              title="Atualizar histórico"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                <tr>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Tamanho</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-ghost)]">
                {latestDailyBackups.map((backup) => (
                  <tr key={backup.id} className="align-top">
                    <td className="px-3 py-4 font-semibold text-[var(--brand-navy-strong)]">
                      {formatDateTime(backup.date)}
                    </td>
                    <td className="px-3 py-4">{formatBytes(backup.sizeBytes)}</td>
                    <td className="px-3 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0b5f40]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {backup.status}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!backup.restorable || isPending}
                          onClick={() =>
                            confirmAction({
                              title: "Restaurar BD",
                              message:
                                "O banco atual será substituído. Digite SUBSTITUIR BANCO para confirmar.",
                              inputLabel: "Confirmação",
                              requiredInput: "SUBSTITUIR BANCO",
                              confirmLabel: "Restaurar",
                              danger: true,
                              run: (inputValue) => restoreBackup(backup, inputValue),
                            })
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Restaurar backup"
                          title="Restaurar backup"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={backup.downloadable ? `/api/local/backups/${backup.id}/download` : undefined}
                          aria-disabled={!backup.downloadable}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
                          aria-label="Baixar backup"
                          title="Baixar backup"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {latestDailyBackups.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-[var(--ink-soft)]" colSpan={4}>
                      Nenhum auto backup encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <ConfirmationModal
          pendingAction={pendingAction}
          modalInput={modalInput}
          isPending={isPending}
          setModalInput={setModalInput}
          closeModal={closeModal}
          executeModalAction={executeModalAction}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!enabled ? (
        <StatusMessage
          tone="error"
          message="Esta funcionalidade fica bloqueada fora do ambiente local. O app deve ser executado em localhost para que o acesso ao disco seja permitido."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <ActionCard
          icon={CloudUpload}
          title="Salvar app manualmente"
          description="A estrutura do aplicativo é copiada, com ZIP, checksum e registro de auditoria gerados."
          detail={`Destino: ${targetRoot}`}
          disabled={!enabled || isPending}
          buttonLabel="Versão atual do app será salva"
          onClick={() =>
            confirmAction({
              title: "Salvar app manualmente",
              message: `A versão atual do aplicativo será salva em ${targetRoot}. Será criada uma subpasta APP_YYYY-MM-DD_HH-mm-ss e um ZIP com checksum.`,
              confirmLabel: "Salvar",
              run: () => postBackupAction("app"),
            })
          }
        />

        <div className="rounded-[24px] bg-[var(--surface-soft)] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--brand-navy)]">
              <DatabaseBackup className="h-5 w-5" />
            </div>
            <div>
              <p className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">
                Gerenciar Banco de Dados
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                O arquivo de BD configurado em YVAE_DATABASE_PATH ou BACKUP_DATABASE_PATH
                é salvo e restaurado. O Supabase remoto exige exportação própria.
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-teal)]">
                Destino: {resolvedDatabaseRoot}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!enabled || isPending}
              onClick={() =>
                confirmAction({
                  title: "Salvar Banco de Dados",
                  message: `O BD atual será copiado para ${resolvedDatabaseRoot}\\BD_YYYY-MM-DD_HH-mm-ss.ext.`,
                  confirmLabel: "Salvar BD",
                  run: () => postBackupAction("database"),
                })
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DatabaseBackup className="h-4 w-4" />
              Banco de Dados será salvo
            </button>
            <button
              type="button"
              disabled={!enabled || isPending || manualDbBackups.length === 0}
              onClick={() =>
                confirmAction({
                  title: "Banco de Dados será recuperado",
                  message:
                    "Um backup manual de BD deve ser selecionado na tabela abaixo. Na restauração, o arquivo atual é substituído e uma cópia de segurança é criada antes da troca.",
                  confirmLabel: "Entendi",
                  run: async () => undefined,
                })
              }
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--brand-blue-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              Banco de Dados será recuperado
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          icon={FileArchive}
          title="Backup automático diário do BD"
          description="A cópia diária do banco de dados é mantida. A pasta do app não é enviada automaticamente ao Dropbox."
          detail={`Local: ${dailyRoot}`}
          disabled={!enabled || isPending}
          buttonLabel="Backup do BD será executado"
          onClick={() =>
            confirmAction({
              title: "Executar Backup do BD",
              message: "A rotina de backup do banco de dados será executada agora. A pasta do app não será copiada nesta ação.",
              confirmLabel: "Executar",
              run: () => postBackupAction("daily"),
            })
          }
        />
        <ActionCard
          icon={ShieldCheck}
          title="Retenção inteligente"
          description="Os diários do mês corrente são mantidos e o último backup de meses anteriores é arquivado."
          detail={`Mensais: ${monthlyRoot}`}
          disabled={!enabled || isPending}
          buttonLabel="Limpeza de backups antigos será forçada"
          onClick={() =>
            confirmAction({
              title: "Limpeza será forçada",
              message:
                "A política de retenção será executada agora. Backups diários antigos serão removidos, mantendo o último de cada mês em Mensais.",
              confirmLabel: "Limpar antigos",
              danger: true,
              run: () => postBackupAction("cleanup"),
            })
          }
        />
      </div>

      {isPending ? (
        <StatusMessage tone="info" message="Operação em andamento. Aguarde a conclusão..." />
      ) : null}
      {error ? <StatusMessage tone="error" message={error} /> : null}
      {result ? (
        <StatusMessage
          tone="success"
          message={`${result.message} Arquivos: ${result.copiedFiles}. Tamanho: ${formatBytes(result.sizeBytes)}.${result.checksum ? ` Checksum: ${result.checksum.slice(0, 16)}...` : ""}`}
        />
      ) : null}

      <section className="rounded-[24px] bg-[var(--surface-soft)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">
              Histórico de Backups
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Diários, mensais, app manual e banco manual com tamanho, status e ações.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshHistory()}
            className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-bold text-[var(--brand-navy-strong)]"
          >
            Histórico será atualizado
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              <tr>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Tamanho</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-ghost)]">
              {backups.map((backup) => (
                <tr key={backup.id} className="align-top">
                  <td className="px-3 py-4">
                    <p className="font-semibold text-[var(--brand-navy-strong)]">
                      {formatDateTime(backup.date)}
                    </p>
                    <p className="mt-1 max-w-[360px] truncate text-xs text-[var(--ink-soft)]">
                      {backup.label}
                    </p>
                  </td>
                  <td className="px-3 py-4">{backupTypeLabel(backup.type)}</td>
                  <td className="px-3 py-4">{formatBytes(backup.sizeBytes)}</td>
                  <td className="px-3 py-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0b5f40]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {backup.status}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!backup.restorable || isPending}
                        onClick={() =>
                          confirmAction({
                            title: "Restaurar Banco de Dados",
                            message:
                              "O arquivo de BD atual será substituído por esta ação. Uma cópia pré-restore será criada antes. Para confirmação, SUBSTITUIR BANCO deve ser digitado.",
                            inputLabel: "Confirmação",
                            requiredInput: "SUBSTITUIR BANCO",
                            confirmLabel: "Restaurar",
                            danger: true,
                            run: (inputValue) => restoreBackup(backup, inputValue),
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restaurar
                      </button>
                      <a
                        href={backup.downloadable ? `/api/local/backups/${backup.id}/download` : undefined}
                        aria-disabled={!backup.downloadable}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar
                      </a>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          confirmAction({
                            title: "Excluir Backup",
                            message: `Excluir definitivamente ${backup.label}?`,
                            confirmLabel: "Excluir",
                            danger: true,
                            run: async () => {
                              await deleteBackup(backup);
                            },
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-[rgba(186,26,26,0.08)] px-3 py-2 text-xs font-bold text-[var(--brand-danger)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-[var(--ink-soft)]" colSpan={5}>
                    Nenhum backup encontrado ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[24px] bg-[var(--surface-soft)] p-5">
        <p className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">
          Log de operações
        </p>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {logs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className="rounded-xl bg-white px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[var(--brand-navy-strong)]">{log.operation}</p>
                <span className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  {formatDateTime(log.timestamp)} - {log.status}
                </span>
              </div>
              <p className="mt-1 text-[var(--ink-soft)]">{log.error ?? log.message}</p>
            </div>
          ))}
          {logs.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">Nenhuma operação registrada ainda.</p>
          ) : null}
        </div>
      </section>

      <ConfirmationModal
        pendingAction={pendingAction}
        modalInput={modalInput}
        isPending={isPending}
        setModalInput={setModalInput}
        closeModal={closeModal}
        executeModalAction={executeModalAction}
      />
    </div>
  );
}

type ActionCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
};

type BackupOverviewCardProps = {
  icon: LucideIcon;
  title: string;
  badge: string;
  tone?: "default" | "danger";
  stats: Array<[string, string]>;
  details: string[];
  actions: Array<{
    label: string;
    disabled: boolean;
    danger?: boolean;
    onClick: () => void;
  }>;
};

function BackupOverviewCard({
  icon: Icon,
  title,
  badge,
  tone = "default",
  stats,
  details,
  actions,
}: BackupOverviewCardProps) {
  return (
    <article className="rounded-xl border border-[var(--line-ghost)] bg-white/76 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={
            tone === "danger"
              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[var(--brand-danger)]"
              : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,105,0,0.1)] text-[#e25f00]"
          }>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-black leading-5 text-[var(--brand-navy-strong)]">
            {title}
          </h3>
        </div>
        <span className={
          tone === "danger"
            ? "rounded-lg bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--brand-danger)]"
            : "rounded-lg bg-[var(--brand-navy-strong)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white"
        }>
          {badge}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {stats.map(([label, value]) => (
          <MiniStat key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-3 space-y-1 text-xs leading-5 text-[var(--ink-soft)]">
        {details.map((detail) => (
          <p key={detail} className="truncate">{detail}</p>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled}
            onClick={action.onClick}
            className={
              action.danger
                ? "h-9 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-xs font-bold text-[var(--brand-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                : "h-9 rounded-xl bg-[var(--brand-teal)] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line-ghost)] bg-white/78 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-soft)]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-black text-[var(--brand-navy-strong)]">{value}</p>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  detail,
  buttonLabel,
  disabled,
  onClick,
}: ActionCardProps) {
  return (
    <div className="rounded-[24px] bg-[var(--surface-soft)] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--brand-navy)]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="heading-font text-base font-bold text-[var(--brand-navy-strong)]">
            {title}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">{description}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-teal)]">
            {detail}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--brand-navy-strong),var(--brand-teal))] px-4 py-3 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon className="h-4 w-4" />
        {buttonLabel}
      </button>
    </div>
  );
}

function StatusMessage({ tone, message }: { tone: "success" | "error" | "info"; message: string }) {
  const classes = {
    success: "bg-[rgba(0,168,107,0.08)] text-[#0b5f40]",
    error: "bg-[rgba(186,26,26,0.08)] text-[var(--brand-danger)]",
    info: "bg-[var(--brand-blue-soft)] text-[var(--brand-navy-strong)]",
  };

  return <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${classes[tone]}`}>{message}</div>;
}

type ConfirmationModalProps = {
  pendingAction: PendingAction | null;
  modalInput: string;
  isPending: boolean;
  setModalInput: (value: string) => void;
  closeModal: () => void;
  executeModalAction: () => void;
};

function ConfirmationModal({
  pendingAction,
  modalInput,
  isPending,
  setModalInput,
  closeModal,
  executeModalAction,
}: ConfirmationModalProps) {
  if (!pendingAction) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(10,24,38,0.42)] px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(0,30,64,0.5)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(197,122,0,0.12)] text-[var(--brand-amber)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">
              {pendingAction.title}
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
              {pendingAction.message}
            </p>
          </div>
        </div>

        {pendingAction.inputLabel ? (
          <label className="mt-5 block text-sm font-bold text-[var(--brand-navy-strong)]">
            {pendingAction.inputLabel}
            <input
              value={modalInput}
              onChange={(event) => setModalInput(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-blue)]"
            />
          </label>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-bold text-[var(--brand-navy-strong)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={executeModalAction}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white ${
              pendingAction.danger
                ? "bg-[var(--brand-danger)]"
                : "bg-[var(--brand-navy-strong)]"
            }`}
          >
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {pendingAction.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function backupTypeLabel(type: BackupType) {
  const labels: Record<BackupType, string> = {
    "manual-app": "App manual",
    "manual-db": "Banco manual",
    diario: "Diário",
    mensal: "Mensal",
  };

  return labels[type];
}

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value || "---";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatBytes(value: number) {
  if (value === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;

  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function readCloudRestoreRequests() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLOUD_RESTORE_REQUESTS_STORAGE_KEY) ?? "[]");

    return Array.isArray(parsed) ? parsed.filter(isCloudRestoreRequest) : [];
  } catch {
    return [];
  }
}

function writeCloudRestoreRequests(requests: CloudRestoreRequest[]) {
  window.localStorage.setItem(CLOUD_RESTORE_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
}

function isCloudRestoreRequest(value: unknown): value is CloudRestoreRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CloudRestoreRequest>;

  return Boolean(candidate.id && candidate.createdAt && candidate.backupLabel && candidate.backupPath);
}
