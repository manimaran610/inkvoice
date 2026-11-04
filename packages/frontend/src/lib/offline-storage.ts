const DB_NAME = "inkvoice-offline";
const DB_VERSION = 1;
const STORE = "state";
const ENCRYPTION_ITERATIONS = 310_000;

let offlineEncryptionKey: CryptoKey | null = null;

type StoredState = {
  key: string;
  value: unknown;
};

export type OfflineUser = {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  role?: string | null;
};

export type OfflineMutation = {
  id: string;
  method: "POST" | "PUT" | "DELETE";
  path: string;
  body: unknown;
  createdAt: string;
  status: "pending" | "failed";
  error?: string;
};

let offlineCacheScope = "anonymous";

export function setOfflineCacheScope(userId: string): void {
  offlineCacheScope = userId;
}

export async function getCachedApiResponse<T>(path: string): Promise<T | null> {
  const cached = await getOfflineValue<EncryptedOfflineValue>(
    `api-cache:${offlineCacheScope}:${path}`,
  );
  return cached ? decryptOfflineValue<T>(cached) : null;
}

export async function cacheApiResponse(path: string, value: unknown): Promise<void> {
  if (!offlineEncryptionKey) return;
  await setOfflineValue(`api-cache:${offlineCacheScope}:${path}`, await encryptOfflineValue(value));
}

export async function queueOfflineMutation(
  mutation: Omit<OfflineMutation, "id" | "createdAt" | "status">,
): Promise<void> {
  const mutations = await getOfflineMutations();
  mutations.push({
    ...mutation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  await setOfflineValue("offline-mutations", await encryptOfflineValue(mutations));
}

export async function updateOfflineMutation(
  id: string,
  update: Pick<OfflineMutation, "status" | "error">,
): Promise<void> {
  const mutations = await getOfflineMutations();
  await setOfflineValue(
    "offline-mutations",
    await encryptOfflineValue(
      mutations.map((mutation) => (mutation.id === id ? { ...mutation, ...update } : mutation)),
    ),
  );
}

export type OfflineBackup = {
  version: 1;
  exportedAt: string;
  user: OfflineUser | null;
  state: Record<string, unknown>;
  mutations: OfflineMutation[];
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Unable to open offline storage"));
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readState(): Promise<Record<string, unknown>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onerror = () => reject(request.error || new Error("Unable to read offline storage"));
    request.onsuccess = () => {
      db.close();
      resolve(
        Object.fromEntries(
          (request.result as StoredState[]).map((entry) => [entry.key, entry.value]),
        ),
      );
    };
  });
}

async function writeState(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ key, value } satisfies StoredState);
    transaction.onerror = () =>
      reject(transaction.error || new Error("Unable to write offline storage"));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

async function deleteState(key: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(key);
    transaction.onerror = () =>
      reject(transaction.error || new Error("Unable to clear offline storage"));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: asBufferSource(salt),
      iterations: ENCRYPTION_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function enrollOfflineUser(user: OfflineUser, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  offlineEncryptionKey = key;
  const verifier = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(new Uint8Array(12)) },
    key,
    new TextEncoder().encode("inkvoice-offline-password"),
  );
  await writeState("offline-auth", {
    user,
    salt: bytesToBase64(salt),
    verifier: bytesToBase64(new Uint8Array(verifier)),
  });
}

export async function unlockOfflineUser(password: string): Promise<OfflineUser | null> {
  const state = (await readState())["offline-auth"] as
    | { user: OfflineUser; salt: string; verifier: string }
    | undefined;
  if (!state) return null;
  try {
    const key = await deriveKey(password, base64ToBytes(state.salt));
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(12) },
      key,
      asBufferSource(base64ToBytes(state.verifier)),
    );
    offlineEncryptionKey = key;
    return state.user;
  } catch {
    return null;
  }
}

export async function exportOfflineBackup(password: string): Promise<Blob> {
  const state = await readState();
  const payload: OfflineBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: (state["offline-user"] as OfflineUser | null) || null,
    state,
    mutations: (state["offline-mutations"] as OfflineMutation[]) || [],
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return new Blob(
    [
      JSON.stringify({
        format: "inkvoice-offline-backup",
        version: 1,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      }),
    ],
    { type: "application/json" },
  );
}

export async function importOfflineBackup(file: File, password: string): Promise<void> {
  const envelope = JSON.parse(await file.text()) as {
    format: string;
    version: number;
    salt: string;
    iv: string;
    ciphertext: string;
  };
  if (envelope.format !== "inkvoice-offline-backup" || envelope.version !== 1) {
    throw new Error("Unsupported offline backup format");
  }
  const key = await deriveKey(password, base64ToBytes(envelope.salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(base64ToBytes(envelope.iv)) },
    key,
    asBufferSource(base64ToBytes(envelope.ciphertext)),
  );
  const backup = JSON.parse(new TextDecoder().decode(plaintext)) as OfflineBackup;
  if (backup.version !== 1 || !backup.state || !Array.isArray(backup.mutations)) {
    throw new Error("Invalid offline backup");
  }
  for (const [keyName, value] of Object.entries(backup.state)) {
    await writeState(keyName, value);
  }
}

export async function clearOfflineStorage(): Promise<void> {
  const state = await readState();
  await Promise.all(Object.keys(state).map(deleteState));
}

export async function saveOfflineUser(user: OfflineUser): Promise<void> {
  await writeState("offline-user", user);
}

export async function getOfflineValue<T>(key: string): Promise<T | null> {
  const value = (await readState())[key];
  return (value as T | undefined) ?? null;
}

export async function setOfflineValue(key: string, value: unknown): Promise<void> {
  await writeState(key, value);
}

export async function getOfflineMutations(): Promise<OfflineMutation[]> {
  const value = await getOfflineValue<OfflineMutation[] | EncryptedOfflineValue>(
    "offline-mutations",
  );
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return (await decryptOfflineValue<OfflineMutation[]>(value)) || [];
}

export async function removeOfflineMutation(id: string): Promise<void> {
  const mutations = await getOfflineMutations();
  await setOfflineValue(
    "offline-mutations",
    await encryptOfflineValue(mutations.filter((mutation) => mutation.id !== id)),
  );
}

type EncryptedOfflineValue = { encrypted: true; iv: string; value: string };

async function encryptOfflineValue(value: unknown): Promise<EncryptedOfflineValue> {
  if (!offlineEncryptionKey) throw new Error("Offline storage is locked");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    offlineEncryptionKey,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return {
    encrypted: true,
    iv: bytesToBase64(iv),
    value: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptOfflineValue<T>(value: EncryptedOfflineValue): Promise<T | null> {
  if (!offlineEncryptionKey) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBufferSource(base64ToBytes(value.iv)) },
      offlineEncryptionKey,
      asBufferSource(base64ToBytes(value.value)),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}
