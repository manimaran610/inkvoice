import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/i18n";
import { getOfflineMutations, getOfflineValue } from "@/lib/offline-storage";
import { syncOfflineMutations } from "@/lib/offline-sync";

type SyncMeta = {
  lastSyncAt: string | null;
  products: number;
  customers: number;
  invoices: number;
};

const EMPTY_META: SyncMeta = { lastSyncAt: null, products: 0, customers: 0, invoices: 0 };

function formatSyncTime(value: string | null, language: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function SyncStatus() {
  const { t, language } = useTranslation();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [meta, setMeta] = useState<SyncMeta>(EMPTY_META);

  const refresh = async () => {
    const mutations = await getOfflineMutations();
    setPending(mutations.filter((mutation) => mutation.status === "pending").length);
    setFailed(mutations.filter((mutation) => mutation.status === "failed").length);
    setMeta((await getOfflineValue<SyncMeta>("offline-sync-meta")) || EMPTY_META);
  };

  useEffect(() => {
    const onlineHandler = () => {
      setOnline(true);
      refresh();
    };
    const offlineHandler = () => setOnline(false);
    const syncHandler = () => refresh();
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("inkvoice:sync-updated", syncHandler);
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("inkvoice:sync-updated", syncHandler);
      window.clearInterval(timer);
    };
  }, []);

  const runSync = async () => {
    if (!online) return;
    setSyncing(true);
    try {
      await syncOfflineMutations();
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const statusLabel = !online
    ? t("sync.offline")
    : syncing
      ? t("sync.syncing")
      : pending > 0
        ? t("sync.pending", { count: String(pending) })
        : t("sync.synced");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center h-8 gap-1.5 rounded-md border border-border/80 bg-background/40 px-2.5 text-xs hover:bg-accent">
        {online ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline text-xs">{statusLabel}</span>
        {pending > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {pending}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-3 py-2">
          <div className="font-medium">{t("sync.title")}</div>
          <div className="text-xs text-muted-foreground mt-1">{statusLabel}</div>
        </div>
        <DropdownMenuSeparator />
        <div className="grid grid-cols-3 gap-2 px-3 py-2 text-center">
          <div>
            <div className="font-semibold">{meta.products}</div>
            <div className="text-[11px] text-muted-foreground">{t("sync.products")}</div>
          </div>
          <div>
            <div className="font-semibold">{meta.customers}</div>
            <div className="text-[11px] text-muted-foreground">{t("sync.customers")}</div>
          </div>
          <div>
            <div className="font-semibold">{meta.invoices}</div>
            <div className="text-[11px] text-muted-foreground">{t("sync.invoices")}</div>
          </div>
        </div>
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          {t("sync.last_sync")}: {formatSyncTime(meta.lastSyncAt, language)}
          {failed > 0 && (
            <div className="text-destructive mt-1">
              {t("sync.failed", { count: String(failed) })}
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!online || syncing} onClick={runSync}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          {t("sync.sync_now")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
