import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

export const BACKUP_ROOT = String.raw`D:\Dropbox\Aplicativos\Yva´e-backup`;
export const APP_BACKUP_TARGET_ROOT = path.join(BACKUP_ROOT, "APP");
export const DB_BACKUP_TARGET_ROOT = path.join(BACKUP_ROOT, "Backups");
export const DAILY_BACKUP_TARGET_ROOT = path.join(BACKUP_ROOT, "Backups", "Diarios");
export const MONTHLY_BACKUP_TARGET_ROOT = path.join(BACKUP_ROOT, "Backups", "Mensais");
export const BACKUP_LOG_ROOT = path.join(BACKUP_ROOT, "Logs");
export const BACKUP_LOG_FILE = path.join(BACKUP_LOG_ROOT, "operacoes.jsonl");

const DAILY_BACKUP_HOUR = 12;
const DAILY_BACKUP_MINUTE = 15;

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".turbo",
  ".vercel",
  "coverage",
  "node_modules",
  "playwright-report",
]);

const EXCLUDED_DIRECTORY_PATHS = new Set([
  ".next/cache",
  ".next/dev",
]);

const EXCLUDED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
]);

const EXCLUDED_EXTENSIONS = new Set([
  ".db",
  ".log",
  ".sqlite",
  ".sqlite3",
  ".tmp",
  ".tsbuildinfo",
]);

export type BackupStatus = "ok" | "erro";
export type BackupType = "manual-app" | "manual-db" | "diario" | "mensal";

export type BackupOperationResult = {
  ok: true;
  message: string;
  type: BackupType;
  destinationRoot: string;
  archivePath?: string;
  databaseBackupPath?: string;
  generatedAt: string;
  copiedFiles: number;
  sizeBytes: number;
  checksum?: string;
};

export type BackupHistoryItem = {
  id: string;
  date: string;
  type: BackupType;
  label: string;
  path: string;
  sizeBytes: number;
  status: BackupStatus;
  checksum?: string;
  restorable: boolean;
  downloadable: boolean;
};

type OperationLogEntry = {
  timestamp: string;
  operation: string;
  status: BackupStatus;
  target?: string;
  message: string;
  error?: string;
};

export function isLocalBackupUiAvailable() {
  return !(process.env.VERCEL === "1" && process.env.VERCEL_URL);
}

export function isLoopbackHost(hostHeader: string | null) {
  if (!hostHeader) {
    return false;
  }

  const host = hostHeader.split(":")[0]?.trim().toLowerCase();

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function isLocalBackupRequestAllowed(hostHeader: string | null) {
  return isLocalBackupUiAvailable() && isLoopbackHost(hostHeader);
}

export async function createLocalAppBackup() {
  return runLoggedOperation("backup-app-manual", async () => {
    const timestamp = formatBackupTimestamp(new Date());
    const destinationRoot = path.join(APP_BACKUP_TARGET_ROOT, `APP_${timestamp}`);
    const archivePath = `${destinationRoot}.zip`;
    const copiedFiles = await copyApplicationTo(destinationRoot);

    await writeManifest(destinationRoot, {
      kind: "manual-app",
      generatedAt: new Date().toISOString(),
      sourceRoot: process.cwd(),
      destinationRoot,
      copiedFiles,
      note: "Arquivos .env e bancos locais são ignorados por segurança.",
    });

    await zipDirectory(destinationRoot, archivePath);
    const checksum = await checksumFile(archivePath);
    const sizeBytes = await getPathSize(destinationRoot) + (await getPathSize(archivePath));

    return {
      ok: true,
      message: "Versão atual do aplicativo salva com sucesso.",
      type: "manual-app",
      generatedAt: new Date().toISOString(),
      destinationRoot,
      archivePath,
      copiedFiles,
      sizeBytes,
      checksum,
    } satisfies BackupOperationResult;
  });
}

export async function createDatabaseBackup() {
  return runLoggedOperation("backup-bd-manual", async () => {
    const databasePath = await resolveDatabasePath();
    const timestamp = formatBackupTimestamp(new Date());
    const extension = path.extname(databasePath) || ".db";
    const destinationRoot = DB_BACKUP_TARGET_ROOT;
    const databaseBackupPath = path.join(destinationRoot, `BD_${timestamp}${extension}`);

    await ensureBackupDirectories();
    await copyFile(databasePath, databaseBackupPath);

    const checksum = await checksumFile(databaseBackupPath);
    const sizeBytes = await getPathSize(databaseBackupPath);

    await writeFile(
      `${databaseBackupPath}.sha256`,
      `${checksum}  ${path.basename(databaseBackupPath)}\n`,
      "utf8",
    );

    return {
      ok: true,
      message: "Banco de dados salvo com sucesso.",
      type: "manual-db",
      generatedAt: new Date().toISOString(),
      destinationRoot,
      databaseBackupPath,
      copiedFiles: 1,
      sizeBytes,
      checksum,
    } satisfies BackupOperationResult;
  });
}

export async function createDailyBackup(date = new Date()) {
  return runLoggedOperation("backup-diario-bd", async () => {
    const day = formatDateOnly(date);
    const destinationRoot = path.join(DAILY_BACKUP_TARGET_ROOT, `Backup_Diario_${day}`);
    const databasePath = await resolveDatabasePath();
    const extension = path.extname(databasePath) || ".db";
    const databaseBackupPath = path.join(destinationRoot, `BD_${day}${extension}`);

    await rm(destinationRoot, { recursive: true, force: true });
    await mkdir(destinationRoot, { recursive: true });
    await copyFile(databasePath, databaseBackupPath);

    const checksum = await checksumPath(destinationRoot);
    await writeManifest(destinationRoot, {
      kind: "diario-bd",
      generatedAt: new Date().toISOString(),
      destinationRoot,
      databaseBackupPath,
      copiedFiles: 1,
      checksum,
      note: "Backup diário automático restrito ao banco de dados. O aplicativo deve ser salvo manualmente pelo operador.",
    });

    return {
      ok: true,
      message: "Backup diário do banco de dados concluído.",
      type: "diario",
      generatedAt: new Date().toISOString(),
      destinationRoot,
      databaseBackupPath,
      copiedFiles: 1,
      sizeBytes: await getPathSize(destinationRoot),
      checksum,
    } satisfies BackupOperationResult;
  });
}

export async function enforceRetentionPolicy(now = new Date()) {
  return runLoggedOperation("limpeza-retencao", async () => {
    await ensureBackupDirectories();

    const dailyItems = await readdir(DAILY_BACKUP_TARGET_ROOT, { withFileTypes: true }).catch(
      () => [],
    );
    const dailyFolders = dailyItems
      .filter((item) => item.isDirectory() && item.name.startsWith("Backup_Diario_"))
      .map((item) => ({
        name: item.name,
        date: parseDailyBackupDate(item.name),
        path: path.join(DAILY_BACKUP_TARGET_ROOT, item.name),
      }))
      .filter((item): item is { name: string; date: Date; path: string } => Boolean(item.date));

    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const previousMonths = new Map<string, Array<{ name: string; date: Date; path: string }>>();
    let removed = 0;
    let archived = 0;

    for (const backup of dailyFolders) {
      const monthKey = `${backup.date.getFullYear()}-${String(backup.date.getMonth() + 1).padStart(2, "0")}`;

      if (monthKey !== currentMonth) {
        const monthBackups = previousMonths.get(monthKey) ?? [];
        monthBackups.push(backup);
        previousMonths.set(monthKey, monthBackups);
      }
    }

    for (const [monthKey, backups] of previousMonths) {
      backups.sort((a, b) => a.date.getTime() - b.date.getTime());
      const keepBackups = backups.filter((backup) => [1, 15].includes(backup.date.getDate()));

      for (const backup of keepBackups) {
        const day = String(backup.date.getDate()).padStart(2, "0");
        const monthlyTarget = path.join(MONTHLY_BACKUP_TARGET_ROOT, `Backup_Mensal_${monthKey}-${day}`);
        await rm(monthlyTarget, { recursive: true, force: true });
        await rename(backup.path, monthlyTarget);
        archived += 1;
      }

      for (const backup of backups.filter((backup) => ![1, 15].includes(backup.date.getDate()))) {
        await rm(backup.path, { recursive: true, force: true });
        removed += 1;
      }
    }

    return {
      ok: true,
      message: `Limpeza concluída. Backups dos dias 01 e 15 arquivados: ${archived}. Diários removidos: ${removed}.`,
      type: "mensal",
      generatedAt: new Date().toISOString(),
      destinationRoot: MONTHLY_BACKUP_TARGET_ROOT,
      copiedFiles: archived,
      sizeBytes: await getPathSize(MONTHLY_BACKUP_TARGET_ROOT),
    } satisfies BackupOperationResult;
  });
}

export async function listBackupHistory() {
  await ensureBackupDirectories();

  const [appBackups, dbBackups, dailyBackups, monthlyBackups] = await Promise.all([
    scanAppBackups(),
    scanDbBackups(),
    scanGroupedBackups(DAILY_BACKUP_TARGET_ROOT, "diario", "Backup_Diario_"),
    scanGroupedBackups(MONTHLY_BACKUP_TARGET_ROOT, "mensal", "Backup_Mensal_"),
  ]);

  return [...appBackups, ...dbBackups, ...dailyBackups, ...monthlyBackups].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export async function getOperationLogs() {
  try {
    const content = await readFile(BACKUP_LOG_FILE, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-200)
      .map((line) => JSON.parse(line) as OperationLogEntry)
      .reverse();
  } catch {
    return [];
  }
}

export async function deleteBackupById(id: string) {
  const backup = await findBackupById(id);

  if (!backup) {
    throw new Error("Backup não encontrado.");
  }

  await assertPathInsideBackupRoot(backup.path);
  await rm(backup.path, { recursive: true, force: true });

  if (backup.path.endsWith(".zip")) {
    const expandedFolder = backup.path.replace(/\.zip$/i, "");
    await rm(expandedFolder, { recursive: true, force: true });
  }

  await writeLog({
    timestamp: new Date().toISOString(),
    operation: "excluir-backup",
    status: "ok",
    target: backup.path,
    message: "Backup excluído pelo usuário.",
  });
}

export async function restoreDatabaseBackup(id: string, confirmation: string) {
  if (confirmation !== "SUBSTITUIR BANCO") {
    throw new Error("Confirmação inválida. SUBSTITUIR BANCO deve ser digitado para que a restauração seja realizada.");
  }

  return runLoggedOperation("restaurar-bd", async () => {
    const backup = await findBackupById(id);
    const databasePath = await resolveDatabasePath();

    if (!backup || backup.type !== "manual-db") {
      throw new Error("Um backup de banco manual deve ser selecionado para que a restauração seja realizada.");
    }

    await assertPathInsideBackupRoot(backup.path);
    const currentChecksum = await checksumFile(databasePath).catch(() => undefined);
    const safetyCopy = `${databasePath}.pre-restore-${formatBackupTimestamp(new Date())}`;

    if (currentChecksum) {
      await copyFile(databasePath, safetyCopy);
    }

    await copyFile(backup.path, databasePath);

    return {
      ok: true,
      message: `Banco restaurado. Cópia de segurança anterior: ${safetyCopy}`,
      type: "manual-db",
      generatedAt: new Date().toISOString(),
      destinationRoot: databasePath,
      databaseBackupPath: backup.path,
      copiedFiles: 1,
      sizeBytes: await getPathSize(databasePath),
      checksum: await checksumFile(databasePath),
    } satisfies BackupOperationResult;
  });
}

export async function getBackupForDownload(id: string) {
  const backup = await findBackupById(id);

  if (!backup) {
    throw new Error("Backup não encontrado.");
  }

  await assertPathInsideBackupRoot(backup.path);

  return {
    path: backup.path,
    filename: path.basename(backup.path),
  };
}

export function getNextDailyBackupDelay(now = new Date()) {
  const next = new Date(now);
  next.setHours(DAILY_BACKUP_HOUR, DAILY_BACKUP_MINUTE, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

async function copyApplicationTo(destinationRoot: string) {
  await ensureBackupDirectories();
  await mkdir(destinationRoot, { recursive: true });

  return copyDirectory(process.cwd(), destinationRoot, process.cwd());
}

async function copyDirectory(sourceDir: string, destinationDir: string, sourceRoot: string) {
  await mkdir(destinationDir, { recursive: true });

  let copiedFiles = 0;
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    const relativePath = path.relative(sourceRoot, sourcePath);

    if (shouldSkipEntry(entry.name, relativePath, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      copiedFiles += await copyDirectory(sourcePath, destinationPath, sourceRoot);
      continue;
    }

    await copyFile(sourcePath, destinationPath);
    copiedFiles += 1;
  }

  return copiedFiles;
}

function shouldSkipEntry(name: string, relativePath: string, isDirectory: boolean) {
  const normalizedRelative = relativePath.replaceAll("\\", "/");

  if (!normalizedRelative) {
    return false;
  }

  if (isDirectory) {
    return EXCLUDED_DIRECTORIES.has(name) || EXCLUDED_DIRECTORY_PATHS.has(normalizedRelative);
  }

  if (EXCLUDED_FILES.has(name)) {
    return true;
  }

  const extension = path.extname(name).toLowerCase();

  if (EXCLUDED_EXTENSIONS.has(extension)) {
    return true;
  }

  return normalizedRelative.endsWith("/backup-manifest.json");
}

async function ensureBackupDirectories() {
  await Promise.all([
    mkdir(APP_BACKUP_TARGET_ROOT, { recursive: true }),
    mkdir(DB_BACKUP_TARGET_ROOT, { recursive: true }),
    mkdir(DAILY_BACKUP_TARGET_ROOT, { recursive: true }),
    mkdir(MONTHLY_BACKUP_TARGET_ROOT, { recursive: true }),
    mkdir(BACKUP_LOG_ROOT, { recursive: true }),
  ]);
}

async function resolveDatabasePath() {
  const candidates = [
    process.env.YVAE_DATABASE_PATH,
    process.env.BACKUP_DATABASE_PATH,
    process.env.LOCAL_DATABASE_PATH,
    path.join(process.cwd(), "data", "database.sqlite"),
    path.join(process.cwd(), "data", "app.sqlite"),
    path.join(process.cwd(), "database.sqlite"),
    path.join(process.cwd(), "app.sqlite"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate);

      if (fileStat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next conventional database path.
    }
  }

  throw new Error(
    "Nenhum arquivo de BD local foi encontrado. Configure YVAE_DATABASE_PATH ou BACKUP_DATABASE_PATH apontando para o arquivo atual. O banco Supabase remoto não pode ser restaurado por cópia de arquivo.",
  );
}

async function scanAppBackups() {
  const entries = await readdir(APP_BACKUP_TARGET_ROOT, { withFileTypes: true }).catch(() => []);
  const records: BackupHistoryItem[] = [];

  for (const entry of entries) {
    if (!entry.name.startsWith("APP_")) {
      continue;
    }

    const fullPath = path.join(APP_BACKUP_TARGET_ROOT, entry.name);
    records.push({
      id: encodeBackupId(fullPath),
      date: dateFromName(entry.name) ?? new Date().toISOString(),
      type: "manual-app",
      label: entry.name,
      path: fullPath,
      sizeBytes: await getPathSize(fullPath),
      status: "ok",
      checksum: entry.name.endsWith(".zip") ? await checksumFile(fullPath).catch(() => undefined) : undefined,
      restorable: false,
      downloadable: entry.isFile() || entry.name.endsWith(".zip"),
    });
  }

  return records;
}

async function scanDbBackups() {
  const entries = await readdir(DB_BACKUP_TARGET_ROOT, { withFileTypes: true }).catch(() => []);
  const records: BackupHistoryItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("BD_") || entry.name.endsWith(".sha256")) {
      continue;
    }

    const fullPath = path.join(DB_BACKUP_TARGET_ROOT, entry.name);
    records.push({
      id: encodeBackupId(fullPath),
      date: dateFromName(entry.name) ?? new Date().toISOString(),
      type: "manual-db",
      label: entry.name,
      path: fullPath,
      sizeBytes: await getPathSize(fullPath),
      status: "ok",
      checksum: await checksumFile(fullPath).catch(() => undefined),
      restorable: true,
      downloadable: true,
    });
  }

  return records;
}

async function scanGroupedBackups(root: string, type: "diario" | "mensal", prefix: string) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const records: BackupHistoryItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    records.push({
      id: encodeBackupId(fullPath),
      date: dateFromName(entry.name) ?? new Date().toISOString(),
      type,
      label: entry.name,
      path: fullPath,
      sizeBytes: await getPathSize(fullPath),
      status: "ok",
      checksum: await checksumPath(fullPath).catch(() => undefined),
      restorable: false,
      downloadable: false,
    });
  }

  return records;
}

async function findBackupById(id: string) {
  const backups = await listBackupHistory();
  return backups.find((backup) => backup.id === id);
}

async function runLoggedOperation<T extends BackupOperationResult>(
  operation: string,
  callback: () => Promise<T>,
) {
  try {
    const result = await callback();
    await writeLog({
      timestamp: new Date().toISOString(),
      operation,
      status: "ok",
      target: result.destinationRoot,
      message: result.message,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeLog({
      timestamp: new Date().toISOString(),
      operation,
      status: "erro",
      message,
      error: message,
    });
    throw error;
  }
}

async function writeLog(entry: OperationLogEntry) {
  await mkdir(BACKUP_LOG_ROOT, { recursive: true });
  await writeFile(BACKUP_LOG_FILE, `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

async function writeManifest(destinationRoot: string, manifest: Record<string, unknown>) {
  await writeFile(
    path.join(destinationRoot, "backup-manifest.json"),
    JSON.stringify(
      {
        ...manifest,
        excludedDirectories: [...EXCLUDED_DIRECTORIES],
        excludedDirectoryPaths: [...EXCLUDED_DIRECTORY_PATHS],
        excludedFiles: [...EXCLUDED_FILES],
        excludedExtensions: [...EXCLUDED_EXTENSIONS],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function zipDirectory(sourceDir: string, destinationZip: string) {
  await mkdir(path.dirname(destinationZip), { recursive: true });
  await runPowerShell(
    `Compress-Archive -LiteralPath ${quotePowerShell(sourceDir)} -DestinationPath ${quotePowerShell(destinationZip)} -Force`,
  );
}

async function runPowerShell(command: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true },
    );
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `PowerShell finalizou com codigo ${code}.`));
    });
  });
}

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function checksumFile(filePath: string) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function checksumPath(targetPath: string) {
  const targetStat = await stat(targetPath);

  if (targetStat.isFile()) {
    return checksumFile(targetPath);
  }

  const hash = createHash("sha256");
  const files = await listFiles(targetPath);

  for (const filePath of files.sort()) {
    hash.update(path.relative(targetPath, filePath).replaceAll("\\", "/"));
    hash.update(await checksumFile(filePath));
  }

  return hash.digest("hex");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function getPathSize(targetPath: string): Promise<number> {
  try {
    const targetStat = await stat(targetPath);

    if (targetStat.isFile()) {
      return targetStat.size;
    }

    const entries = await readdir(targetPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map((entry) => getPathSize(path.join(targetPath, entry.name))),
    );

    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return 0;
  }
}

async function assertPathInsideBackupRoot(targetPath: string) {
  const resolvedRoot = path.resolve(BACKUP_ROOT);
  const resolvedTarget = path.resolve(targetPath);

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Caminho recusado por seguranca: fora da pasta de backups.");
  }
}

function encodeBackupId(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function dateFromName(name: string) {
  const match = name.match(/(\d{4}-\d{2}-\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?/);

  if (!match) {
    return null;
  }

  const [, date, hour = "00", minute = "00", second = "00"] = match;
  const parsed = new Date(`${date}T${hour}:${minute}:${second}`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDailyBackupDate(name: string) {
  const match = name.match(/^Backup_Diario_(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatBackupTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
