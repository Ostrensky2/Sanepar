import {
  createDailyBackup,
  createLocalAppBackup,
  enforceRetentionPolicy,
  getBackupAutomationStatus,
  getNextDailyBackupDelay,
  isLocalBackupUiAvailable,
} from "@/lib/local-backup";

let schedulerStarted = false;

export function startBackupScheduler() {
  if (schedulerStarted || !isLocalBackupUiAvailable()) {
    return;
  }

  schedulerStarted = true;
  void runStartupCatchUp();
  scheduleNextDailyBackup();
}

async function runStartupCatchUp() {
  try {
    const status = await getBackupAutomationStatus();

    if (!status.hasDailyBackupToday) {
      await createDailyBackup().catch(() => undefined);
    }

    if (!status.hasAppBackupToday) {
      await createLocalAppBackup().catch(() => undefined);
    }

    const now = new Date();
    if (now.getDate() === 1) {
      await enforceRetentionPolicy(now).catch(() => undefined);
    }
  } catch {
    // The backup operation writes its own error log. Startup must not break the app.
  }
}

function scheduleNextDailyBackup() {
  const delay = getNextDailyBackupDelay();

  setTimeout(async () => {
    try {
      await createDailyBackup().catch(() => undefined);
      await createLocalAppBackup().catch(() => undefined);

      const now = new Date();
      if (now.getDate() === 1) {
        await enforceRetentionPolicy(now).catch(() => undefined);
      }
    } finally {
      scheduleNextDailyBackup();
    }
  }, delay);
}
