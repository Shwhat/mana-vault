import { importCardCatalog } from "./import-cards.js";

export interface CatalogUpdateStatus {
  scheduled: boolean;
  intervalHours: number | null;
  isUpdating: boolean;
  lastAttemptAt: string | null;
  lastImportedCount: number | null;
  lastError: string | null;
}

interface CatalogUpdaterOptions {
  intervalHours: number;
  databasePath: string;
  dataPath: string;
  updateCatalog?: (databasePath: string, dataPath: string) => Promise<number>;
  onError?: (error: unknown) => void;
}

export function catalogUpdateIntervalFromEnvironment(value = process.env.CARD_UPDATE_INTERVAL_HOURS): number {
  if (value === undefined || value === "") return 0;
  const intervalHours = Number(value);
  if (!Number.isInteger(intervalHours) || intervalHours < 0 || intervalHours > 8760) {
    throw new Error("CARD_UPDATE_INTERVAL_HOURS must be 0 (disabled) or a whole number from 1 to 8760");
  }
  return intervalHours;
}

export function startCatalogUpdater({
  intervalHours,
  databasePath,
  dataPath,
  updateCatalog = importCardCatalog,
  onError = (error) => console.error("Card catalog refresh failed:", error),
}: CatalogUpdaterOptions): { getStatus: () => CatalogUpdateStatus; requestRefresh: () => boolean; close: () => void } {
  if (!Number.isInteger(intervalHours) || intervalHours < 0 || intervalHours > 8760) {
    throw new Error("Catalog refresh interval must be 0 (disabled) or a whole number from 1 to 8760");
  }

  const status: CatalogUpdateStatus = {
    scheduled: intervalHours > 0,
    intervalHours: intervalHours || null,
    isUpdating: false,
    lastAttemptAt: null,
    lastImportedCount: null,
    lastError: null,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextRunAt: number | undefined;
  let refreshPromise: Promise<void> | null = null;
  let closed = false;

  function refresh(): Promise<void> {
    if (refreshPromise) return refreshPromise;
    status.isUpdating = true;
    status.lastAttemptAt = new Date().toISOString();
    status.lastImportedCount = null;
    status.lastError = null;
    refreshPromise = Promise.resolve()
      .then(() => updateCatalog(databasePath, dataPath))
      .then((importedCount) => {
        status.lastImportedCount = importedCount;
      })
      .catch((error: unknown) => {
        status.lastError = error instanceof Error ? error.message : String(error);
        onError(error);
      })
      .finally(() => {
        status.isUpdating = false;
        refreshPromise = null;
        if (!closed && intervalHours > 0) {
          nextRunAt = Date.now() + intervalHours * 60 * 60 * 1000;
          scheduleRefresh();
        }
      });
    return refreshPromise;
  }

  function scheduleRefresh(): void {
    if (closed || nextRunAt === undefined) return;
    const runAt = nextRunAt;
    const remaining = runAt - Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      if (Date.now() < runAt) {
        scheduleRefresh();
        return;
      }
      nextRunAt = undefined;
      void refresh();
    }, Math.min(remaining, 2_147_000_000));
    timer.unref();
  }

  function requestRefresh(): boolean {
    if (closed || refreshPromise) return false;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    nextRunAt = undefined;
    void refresh();
    return true;
  }

  if (intervalHours > 0) {
    nextRunAt = Date.now() + intervalHours * 60 * 60 * 1000;
    scheduleRefresh();
  }

  return {
    getStatus: () => ({ ...status }),
    requestRefresh,
    close: () => {
      closed = true;
      nextRunAt = undefined;
      if (timer) clearTimeout(timer);
    },
  };
}
