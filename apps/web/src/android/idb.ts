// ---------- a small key-value store in IndexedDB, used by the Android app for its offline copy ----------
const DB_NAME = "mana-vault-app";
const STORES = ["cache", "queue", "meta"] as const;
export type StoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The phone storage could not be opened."));
  });
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, body: (objects: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(store, mode);
    const request = body(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request ? request.result : (undefined as T));
    transaction.onerror = () => reject(transaction.error ?? new Error("The phone storage could not be written."));
  }));
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, "readonly", (objects) => objects.get(key) as IDBRequest<T | undefined>);
export const idbSet = (store: StoreName, key: string, value: unknown) => run<void>(store, "readwrite", (objects) => { objects.put(value, key); });
export const idbDelete = (store: StoreName, key: string) => run<void>(store, "readwrite", (objects) => { objects.delete(key); });
export const idbKeys = (store: StoreName) => run<IDBValidKey[]>(store, "readonly", (objects) => objects.getAllKeys()).then((keys) => keys.map(String));
export const idbAll = <T>(store: StoreName) => run<T[]>(store, "readonly", (objects) => objects.getAll() as IDBRequest<T[]>);
export const idbClear = (store: StoreName) => run<void>(store, "readwrite", (objects) => { objects.clear(); });

/** Removes everything the app keeps on the phone (used when signing out). */
export async function idbWipe(): Promise<void> {
  for (const name of STORES) await idbClear(name);
}
