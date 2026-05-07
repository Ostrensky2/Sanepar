import {
  createDailyBackup,
  enforceRetentionPolicy,
  getNextDailyBackupDelay,
  isLocalBackupUiAvailable,
} from "@/lib/local-backup";

let schedulerStarted = false;

export function startBackupScheduler() {
  if (schedulerStarted || !isLocalBackupUiAvailable()) {
    return;
  }

  schedulerStarted = true;
  scheduleNextDailyBackup();
}

function scheduleNextDailyBackup() {
  const delay = getNextDailyBackupDelay();

  setTimeout(async () => {
    try {
      await createDailyBackup();

      const now = new Date();
      if (now.getDate() === 1) {
        await enforceRetentionPolicy(now);
      }
    } finally {
      scheduleNextDailyBackup();
    }
  }, delay);
}
