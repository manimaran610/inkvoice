export interface Product {
  id: string;
  name: string;
  tamil_name: string | null;
  description: string | null;
  sku: string | null;
  unit_price: number;
  customer_unit_price?: number | null;
  customer_unit?: string | null;
  unit: string;
  category: string;
  tax_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}
