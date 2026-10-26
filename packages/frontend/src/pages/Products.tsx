import { Download, Package, Pencil, Plus, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import {
  ColumnVisibilityMenu,
  useColumnVisibility,
} from "@/components/shared/ColumnVisibilityMenu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CsvImportDialog } from "@/components/shared/CsvImportDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  SortableColumnHeader,
  type SortState,
  sortData,
} from "@/components/shared/SortableColumnHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useNewEntityShortcut } from "@/hooks/use-new-entity-shortcut";
import { useTranslation } from "@/i18n";
import { formatApiError } from "@/lib/format-api-error";
import { consumeRowHighlight } from "@/lib/highlight-row";
import { isRecordId } from "@/lib/record-id";
import { cn, formatCurrency } from "@/lib/utils";
import ProductForm from "@/pages/ProductForm";

export default function Products() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [editingPrices, setEditingPrices] = useState(false);
  const [priceEdits, setPriceEdits] = useState<Record<string, number>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const isNew = location.pathname === "/products/new";
  const isForm = isNew || (!!id && isRecordId(id));

  const fetchProducts = useCallback(async () => {
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (search) params.search = search;
    const res = await api.listProducts(params);
    setProducts(res.data.items);
    setTotal(res.data.total);
  }, [page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);
  useEffect(() => {
    setPriceEdits({});
    setEditingPrices(false);
  }, [page, search]);
  // Reset to page 1 whenever the route segment changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: id triggers the effect intentionally
  useEffect(() => {
    setPage(1);
  }, [id]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (isForm) return;
    const hid = consumeRowHighlight("product");
    if (hid) {
      setHighlightId(hid);
      const t = setTimeout(() => setHighlightId(null), 5000);
      return () => clearTimeout(t);
    }
  }, [isForm]);
  useEffect(() => {
    if (isNew || isForm) return;
    if (id && id !== "all" && !isRecordId(id)) {
      navigate("/products/all", { replace: true });
    }
  }, [id, isNew, isForm, navigate]);

  useNewEntityShortcut(() => navigate("/products/new"), !isForm);

  const productColumns = [
    { key: "name", label: t("products.name"), required: true },
    { key: "unit_price", label: t("products.unit_price") },
    { key: "unit", label: t("products.unit") },
    { key: "status", label: t("products.status") },
  ];
  const { isVisible: isColVisible } = useColumnVisibility("inkvoice-cols-products");
  const showPriceColumn = editingPrices || isColVisible("unit_price");
  const visibleColCount =
    productColumns.filter((c) => (c.key === "unit_price" ? showPriceColumn : isColVisible(c.key)))
      .length + 1;

  if (isForm) {
    return (
      <ProductForm
        onSave={() => {
          // When reached via "Add product" from another page, return there and
          // hand off the new product's id so the caller can auto-select it.
          const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
          if (returnTo) {
            const addedProductId = consumeRowHighlight("product");
            const lineIndex = (location.state as { lineIndex?: number } | null)?.lineIndex;
            navigate(returnTo, {
              state: addedProductId ? { addedProductId, lineIndex } : undefined,
            });
          } else {
            navigate("/products/all");
            fetchProducts();
          }
        }}
      />
    );
  }

  const sorted = sortData(products, sort);
  const totalPages = Math.ceil(total / 20);

  const handleSort = (key: string, direction: "asc" | "desc" | null) => {
    setSort(direction ? { key, direction } : null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    setActionLoading(true);
    try {
      await api.deleteProduct(deleteConfirm.id);
      toast.success(t("products.product_deleted"));
      fetchProducts();
    } catch (err: unknown) {
      toast.error(formatApiError(err, t));
    } finally {
      setActionLoading(false);
      setDeleteConfirm({ open: false, id: null });
    }
  };

  const handleReactivate = async (productId: string) => {
    try {
      await api.reactivateProduct(productId);
      toast.success(t("products.product_reactivated"));
      fetchProducts();
    } catch (err: unknown) {
      toast.error(formatApiError(err, t));
    }
  };

  const handleBulkPriceUpdate = async () => {
    const prices = Object.entries(priceEdits).map(([productId, unit_price]) => ({
      id: productId,
      unit_price,
    }));
    if (prices.length === 0) return;

    setActionLoading(true);
    try {
      let succeeded = 0;
      let failed = 0;
      for (let offset = 0; offset < prices.length; offset += 500) {
        const res = await api.batchProductPrices(prices.slice(offset, offset + 500));
        succeeded += res.data.succeeded;
        failed += res.data.failed;
      }
      if (succeeded > 0) toast.success(t("products.bulk_price_saved", { count: succeeded }));
      if (failed > 0) toast.error(t("products.bulk_price_failed", { count: failed }));
      setPriceEdits({});
      setEditingPrices(false);
      await fetchProducts();
    } catch (err: unknown) {
      toast.error(formatApiError(err, t));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartBulkPriceEdit = async () => {
    setActionLoading(true);
    try {
      const params = { page: "1", limit: "100", ...(search ? { search } : {}) };
      const firstPage = await api.listProducts(params);
      const otherPages = await Promise.all(
        Array.from({ length: firstPage.data.totalPages - 1 }, (_, index) =>
          api.listProducts({ ...params, page: String(index + 2) }),
        ),
      );
      const allProducts = [
        ...firstPage.data.items,
        ...otherPages.flatMap((response) => response.data.items),
      ];
      setProducts(allProducts);
      setTotal(firstPage.data.total);
      setPriceEdits(
        Object.fromEntries(
          allProducts.map((product: { id: string; unit_price: number }) => [
            product.id,
            product.unit_price,
          ]),
        ),
      );
      setEditingPrices(true);
    } catch (err: unknown) {
      toast.error(formatApiError(err, t));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("products.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> {t("import.import_button")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const params: Record<string, string> = {};
              if (search) params.search = search;
              window.open(api.exportCsvUrl("products", params), "_blank");
            }}
          >
            <Download className="h-4 w-4 mr-2" /> {t("common.export_csv")}
          </Button>
          <Button
            onClick={() => navigate("/products/new")}
            title={`${t("products.add_product")} (N)`}
          >
            <Plus className="h-4 w-4 mr-2" /> {t("products.add_product")}
          </Button>
          <ColumnVisibilityMenu storageKey="inkvoice-cols-products" columns={productColumns} />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("products.search_placeholder")}
            aria-label={t("common.search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      <div className="glass-table-wrapper">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {editingPrices ? t("products.bulk_price_editing") : t("products.bulk_price_hint")}
          </span>
          <div className="flex items-center gap-2">
            {!editingPrices ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStartBulkPriceEdit}
                disabled={products.length === 0 || actionLoading}
              >
                <Pencil className="h-3.5 w-3.5" />
                {actionLoading ? t("common.loading") : t("products.bulk_edit_price")}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPriceEdits({});
                    setEditingPrices(false);
                    fetchProducts();
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkPriceUpdate}
                  disabled={actionLoading || Object.keys(priceEdits).length === 0}
                >
                  {actionLoading ? t("common.saving") : t("common.save")}
                </Button>
              </>
            )}
          </div>
        </div>
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              {isColVisible("name") && (
                <SortableColumnHeader
                  label={t("products.name")}
                  sortKey="name"
                  currentSort={sort}
                  onSort={handleSort}
                />
              )}
              {showPriceColumn && (
                <SortableColumnHeader
                  label={t("products.unit_price")}
                  sortKey="unit_price"
                  currentSort={sort}
                  onSort={handleSort}
                  className="text-right"
                  align="right"
                />
              )}
              {isColVisible("unit") && (
                <SortableColumnHeader
                  label={t("products.unit")}
                  sortKey="unit"
                  currentSort={sort}
                  onSort={handleSort}
                />
              )}
              {isColVisible("status") && (
                <SortableColumnHeader
                  label={t("products.status")}
                  sortKey="is_active"
                  currentSort={sort}
                  onSort={handleSort}
                />
              )}
              <TableCell className="w-[100px] font-medium text-sm text-muted-foreground">
                {t("common.actions")}
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColCount} className="p-0">
                  <EmptyState
                    icon={Package}
                    title={t("products.empty_title")}
                    description={t("products.empty_description")}
                    actionLabel={t("products.add_product")}
                    onAction={() => navigate("/products/new")}
                  />
                </TableCell>
              </TableRow>
            )}
            {sorted.map((p: any) => (
              <TableRow
                key={p.id}
                className={cn(
                  "cursor-pointer hover:bg-accent/50 transition-colors",
                  highlightId === p.id && "row-just-created",
                )}
                onClick={(e) => {
                  if (editingPrices) {
                    e.currentTarget.querySelector<HTMLInputElement>("input")?.focus();
                  } else {
                    navigate(`/products/${p.id}`);
                  }
                }}
              >
                {isColVisible("name") && (
                  <TableCell className="font-medium">
                    <div>{p.name}</div>
                    {p.tamil_name && (
                      <div className="text-sm font-normal text-muted-foreground" dir="auto">
                        {p.tamil_name}
                      </div>
                    )}
                  </TableCell>
                )}
                {showPriceColumn && (
                  <TableCell
                    className="tabular-nums font-medium"
                    onClick={editingPrices ? (e) => e.stopPropagation() : undefined}
                  >
                    {editingPrices ? (
                      <div className="flex justify-end">
                        <NumberInput
                          aria-label={`${t("products.unit_price")} - ${p.name}`}
                          value={priceEdits[p.id] ?? p.unit_price}
                          min={0}
                          decimals={2}
                          className="w-32 text-right"
                          onValueChange={(value) =>
                            setPriceEdits((current) => ({ ...current, [p.id]: value }))
                          }
                        />
                      </div>
                    ) : (
                      <div className="text-right">{formatCurrency(p.unit_price)}</div>
                    )}
                  </TableCell>
                )}
                {isColVisible("unit") && (
                  <TableCell className="text-muted-foreground capitalize">{p.unit}</TableCell>
                )}
                {isColVisible("status") && (
                  <TableCell>
                    <Badge
                      variant={p.is_active ? "default" : "secondary"}
                      className={
                        p.is_active
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                          : ""
                      }
                    >
                      {p.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                )}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    {!p.is_active && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("products.reactivate")}
                        onClick={() => handleReactivate(p.id)}
                        disabled={editingPrices}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.edit")}
                      onClick={() => navigate(`/products/${p.id}`)}
                      disabled={editingPrices}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("common.delete")}
                      onClick={() => setDeleteConfirm({ open: true, id: p.id })}
                      disabled={editingPrices}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!editingPrices && totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t("common.previous")}
          </Button>
          <span className="text-sm py-2 text-muted-foreground tabular-nums">
            {t("common.page_of", { page: String(page), total: String(totalPages) })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm({ open: false, id: null });
        }}
        title={t("products.delete_title")}
        description={t("products.delete_description")}
        confirmLabel={t("common.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        loading={actionLoading}
      />

      <CsvImportDialog
        resource="products"
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchProducts}
      />
    </div>
  );
}
