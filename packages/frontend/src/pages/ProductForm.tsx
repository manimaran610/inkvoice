import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { isPositive, maxLength, required, useFormValidation } from "@/hooks/use-form-validation";
import { useTranslation } from "@/i18n";
import { formatApiError } from "@/lib/format-api-error";
import { markRowHighlight } from "@/lib/highlight-row";
import { pushRecentlyViewed } from "@/lib/recently-viewed";
import { tamilProductName } from "@/lib/tamil-transliteration";

const PRODUCT_UNITS = ["nos", "kg", "box"] as const;

interface Props {
  onSave: () => void;
}

export default function ProductForm({ onSave }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const isEdit = !!id && id !== "new";
  // Set when arriving via "Add product" from another page (e.g. the invoice
  // form): pre-fill the name and return to the caller on save.
  const navState = location.state as { returnTo?: string; prefillName?: string } | null;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: navState?.prefillName ?? "",
    tamil_name: navState?.prefillName ? tamilProductName(navState.prefillName) : "",
    description: "",
    sku: "",
    unit_price: 0,
    unit: "kg",
    category: "goods",
    is_active: 1,
  });

  const { validateAll, onBlur, onChange, getError } = useFormValidation({
    name: [
      required(t("validation.required", { field: t("products.name") })),
      maxLength(t("validation.max_length", { field: t("products.name"), max: "255" }), 255),
    ],
    unit_price: [
      isPositive(t("validation.must_be_positive_field", { field: t("products.unit_price") })),
    ],
  });

  useEffect(() => {
    if (isEdit) {
      api.getProduct(id).then((r) => {
        const d = r.data;
        setForm({
          name: d.name || "",
          tamil_name: d.tamil_name || tamilProductName(d.name || ""),
          description: d.description || "",
          sku: d.sku || "",
          unit_price: d.unit_price ?? 0,
          unit: PRODUCT_UNITS.includes(d.unit) ? d.unit : "kg",
          category: "goods",
          is_active: d.is_active ?? 1,
        });
        if (d.name) {
          pushRecentlyViewed({
            type: "product",
            id: id!,
            label: d.name,
          });
        }
      });
    }
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll(form)) return;
    setLoading(true);
    try {
      const data = form;
      if (isEdit) {
        await api.updateProduct(id, data);
        toast.success(t("products.product_updated"));
      } else {
        const res = await api.createProduct(data);
        if (res?.data?.id) markRowHighlight("product", res.data.id);
        toast.success(t("products.product_created"));
      }
      onSave();
    } catch (err: unknown) {
      toast.error(formatApiError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const setField = (field: string, value: any) => {
    const newForm = { ...form, [field]: value };
    if (field === "name" && (!form.tamil_name || form.tamil_name === tamilProductName(form.name))) {
      newForm.tamil_name = tamilProductName(value);
    }
    setForm(newForm);
    onChange(field as any, newForm as any);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-2">
        <div>
          <Breadcrumbs
            items={[
              { label: t("nav.dashboard"), href: "/" },
              { label: t("nav.products"), href: "/products/all" },
              {
                label: isEdit ? form.name || t("products.edit_product") : t("products.new_product"),
              },
            ]}
          />
          <h1 className="text-2xl font-semibold tracking-tight mt-2">
            {isEdit ? t("products.edit_product") : t("products.new_product")}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(navState?.returnTo || "/products/all")}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={loading}>
            <Save className="h-4 w-4" />
            {loading ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("products.product_info")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label={t("products.name")} error={getError("name")} required>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              onBlur={() => onBlur("name", form)}
              aria-invalid={!!getError("name")}
            />
          </FormField>

          <FormField label={t("products.tamil_name")} hint={t("products.tamil_name_hint")}>
            <Input
              value={form.tamil_name}
              onChange={(e) => setField("tamil_name", e.target.value)}
              maxLength={255}
              dir="auto"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label={t("products.unit_price")} error={getError("unit_price")} required>
              <NumberInput
                value={form.unit_price}
                min={0}
                decimals={2}
                onValueChange={(v) => {
                  const newForm = { ...form, unit_price: v };
                  setForm(newForm);
                  onChange("unit_price" as any, newForm as any);
                  onBlur("unit_price", newForm);
                }}
                aria-invalid={!!getError("unit_price")}
              />
            </FormField>
            <FormField label={t("products.unit")}>
              <select
                value={form.unit}
                onChange={(e) => setField("unit", e.target.value)}
                className="form-select"
              >
                {PRODUCT_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={!!form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })}
              className="rounded"
            />
            <Label htmlFor="is_active" className="text-sm font-normal">
              {t("common.active")}
            </Label>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
