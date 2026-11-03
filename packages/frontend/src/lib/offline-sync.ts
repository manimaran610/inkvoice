import {
  getOfflineMutations,
  getOfflineValue,
  removeOfflineMutation,
  setOfflineValue,
} from "@/lib/offline-storage";

export async function syncOfflineMutations(): Promise<void> {
  if (!navigator.onLine) return;
  const mutations = (await getOfflineMutations()).filter((item) => item.status === "pending");
  if (mutations.length === 0) return;

  const response = await fetch(
    `${typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as object) ? "http://127.0.0.1:3789" : ""}/api/v1/sync/batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        operations: mutations.map((mutation) => {
          const data = mutation.body as { id?: string };
          return {
            entity: mutation.path.startsWith("/invoices") ? "invoice" : "product",
            client_id: data.id,
            idempotency_key: mutation.id,
            data: mutation.body,
          };
        }),
      }),
    },
  );
  if (!response.ok) throw new Error("Sync failed");

  const payload = (await response.json()) as {
    data?: { results?: { client_id: string; status: string; entity: string }[] };
  };
  const meta = (await getOfflineValue("offline-sync-meta")) as {
    lastSyncAt: string | null;
    products: number;
    customers: number;
    invoices: number;
  } | null;
  const next = meta || { lastSyncAt: null, products: 0, customers: 0, invoices: 0 };
  for (const result of payload.data?.results || []) {
    if (result.status === "failed") continue;
    const mutation = mutations.find(
      (item) => (item.body as { id?: string }).id === result.client_id,
    );
    if (mutation) await removeOfflineMutation(mutation.id);
    if (result.entity === "product") next.products += 1;
    if (result.entity === "invoice") next.invoices += 1;
  }
  next.lastSyncAt = new Date().toISOString();
  await setOfflineValue("offline-sync-meta", next);
  window.dispatchEvent(new Event("inkvoice:sync-updated"));
}
