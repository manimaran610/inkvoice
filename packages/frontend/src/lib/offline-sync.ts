import { getAuthToken } from "@/api/client";
import {
  getOfflineMutations,
  getOfflineValue,
  removeOfflineMutation,
  setOfflineValue,
  updateOfflineMutation,
} from "@/lib/offline-storage";

export async function syncOfflineMutations(): Promise<void> {
  if (!navigator.onLine) return;
  const mutations = (await getOfflineMutations())
    .filter((item) => item.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const base =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as object)
      ? "http://127.0.0.1:3789"
      : "";
  for (const mutation of mutations) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const response = await fetch(`${base}/api/v1${mutation.path}`, {
        method: mutation.method,
        headers,
        credentials: "include",
        body: mutation.method === "DELETE" ? undefined : JSON.stringify(mutation.body),
      });
      if (response.ok) {
        await removeOfflineMutation(mutation.id);
      } else if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 401 &&
        response.status !== 403
      ) {
        const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
        await updateOfflineMutation(mutation.id, {
          status: "failed",
          error: errorBody.error || `Request failed (${response.status})`,
        });
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  const previous = await getOfflineValue<{
    lastSyncAt: string | null;
    products: number;
    customers: number;
    invoices: number;
  }>("offline-sync-meta");
  await setOfflineValue("offline-sync-meta", {
    lastSyncAt: new Date().toISOString(),
    products: previous?.products || 0,
    customers: previous?.customers || 0,
    invoices: previous?.invoices || 0,
  });
  window.dispatchEvent(new Event("inkvoice:sync-updated"));
}
