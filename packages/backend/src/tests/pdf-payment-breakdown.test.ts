import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { closeDatabase, getDb, initDatabase } from "../database/connection";
import { runMigrations } from "../database/migrations";
import { seed } from "../database/seed";
import { createCustomer } from "../services/customer.service";
import { createInvoice, markSent, updateInvoice } from "../services/invoice.service";
import { recordPayment } from "../services/payment.service";
import { buildInvoiceContext, buildQuoteContext, renderInvoiceHtml } from "../services/pdf.service";
import { createProduct } from "../services/product.service";
import { createQuote } from "../services/quote.service";
import { resetEnvCache } from "../utils/env";

const TEST_DB = "./data/test-pdf-payment-breakdown.db";

beforeAll(async () => {
  process.env.DATABASE_PATH = TEST_DB;
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "testpass123";
  process.env.JWT_SECRET = "test-secret-key-that-is-at-least-32-chars-long";
  resetEnvCache();
  initDatabase();
  runMigrations();
  await seed();
});

afterAll(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(`${TEST_DB}${suffix}`);
    } catch {}
  }
});

describe("PDF payment breakdown", () => {
  test("defaults to original product names and uses Tamil names when enabled on an invoice", () => {
    const customer = createCustomer({ name: "Tamil product customer" });
    const product = createProduct({
      name: "Tomato",
      tamil_name: "தக்காளி",
      unit_price: 10,
    });
    const invoice = createInvoice({
      customer_id: customer.id,
      issue_date: "2026-02-01",
      items: [
        {
          product_id: product.id,
          description: product.name,
          quantity: 1,
          unit_price: product.unit_price,
        },
      ],
    });

    expect(invoice.use_tamil_product_names).toBe(0);
    expect(buildInvoiceContext(invoice.id)?.items[0].description).toBe("Tomato");

    const tamilInvoice = createInvoice({
      customer_id: customer.id,
      issue_date: "2026-02-01",
      use_tamil_product_names: true,
      items: [
        {
          product_id: product.id,
          description: product.name,
          quantity: 1,
          unit_price: product.unit_price,
        },
      ],
    });

    expect(tamilInvoice.use_tamil_product_names).toBe(1);
    expect(buildInvoiceContext(tamilInvoice.id)?.items[0].description).toBe("தக்காளி");
  });

  test("buildInvoiceContext exposes payments, amount paid, and balance due", () => {
    const customer = createCustomer({ name: "Acme" });
    const inv = createInvoice({
      customer_id: customer.id,
      issue_date: "2026-01-01",
      items: [{ description: "Work", quantity: 1, unit_price: 100 }],
    });
    markSent(inv.id);

    recordPayment(inv.id, { amount: 30, payment_date: "2026-01-05", method: "bank_transfer" });
    recordPayment(inv.id, { amount: 50, payment_date: "2026-01-20", method: "card" });

    const ctx = buildInvoiceContext(inv.id)!;
    expect(ctx.has_payments).toBe(true);
    expect(ctx.payments).toHaveLength(2);
    expect(ctx.payments[0].formatted_amount).toContain("50");
    expect(ctx.formatted_amount_paid).toContain("80");
    expect(ctx.formatted_balance_due).toContain("20");
  });

  test("purchase order persists and amount in words is available to invoice templates", () => {
    const customer = createCustomer({ name: "Purchase order customer" });
    const invoice = createInvoice({
      customer_id: customer.id,
      issue_date: "2026-02-01",
      purchase_order: "PO-123",
      items: [{ description: "Work", quantity: 1, unit_price: 1234.56 }],
    });

    expect(invoice.purchase_order).toBe("PO-123");
    const context = buildInvoiceContext(invoice.id)!;
    expect(context.purchase_order).toBe("PO-123");
    expect(context.amount_in_words).toBe(
      "One Thousand Two Hundred Thirty-Four and Fifty-Six/100 Only",
    );

    updateInvoice(invoice.id, {
      customer_id: customer.id,
      issue_date: invoice.issue_date,
      items: [{ description: "Work", quantity: 1, unit_price: 1234.56 }],
    });
    expect(buildInvoiceContext(invoice.id)?.purchase_order).toBe("PO-123");

    updateInvoice(invoice.id, {
      customer_id: customer.id,
      issue_date: invoice.issue_date,
      purchase_order: "PO-456",
      items: [{ description: "Work", quantity: 1, unit_price: 1234.56 }],
    });
    expect(buildInvoiceContext(invoice.id)?.purchase_order).toBe("PO-456");
  });

  test("provides alphabetically sorted, numbered line items without changing invoice order", () => {
    const customer = createCustomer({ name: "Sorted line item customer" });
    const invoice = createInvoice({
      customer_id: customer.id,
      issue_date: "2026-02-01",
      items: [
        { description: "Zulu", quantity: 1, unit_price: 10, sort_order: 0 },
        { description: "Alpha", quantity: 1, unit_price: 10, sort_order: 1 },
        { description: "Beta", quantity: 1, unit_price: 10, sort_order: 2 },
      ],
    });

    const context = buildInvoiceContext(invoice.id)!;
    expect(context.items.map((item) => item.description)).toEqual(["Zulu", "Alpha", "Beta"]);
    expect(context.items_by_name.map((item) => [item.description, item.serial_number])).toEqual([
      ["Alpha", 1],
      ["Beta", 2],
      ["Zulu", 3],
    ]);
  });

  test("provides sorted and numbered line items for quote templates too", () => {
    const customer = createCustomer({ name: "Sorted quote customer" });
    const quote = createQuote({
      customer_id: customer.id,
      issue_date: "2026-02-01",
      items: [
        { description: "Zulu", quantity: 1, unit_price: 10, sort_order: 0 },
        { description: "Alpha", quantity: 1, unit_price: 10, sort_order: 1 },
      ],
    });

    expect(buildQuoteContext(quote.id)?.items_by_name.map((item) => item.description)).toEqual([
      "Alpha",
      "Zulu",
    ]);
  });

  test("default template renders the payments section only when payments exist", () => {
    const customer = createCustomer({ name: "Beta" });
    const inv = createInvoice({
      customer_id: customer.id,
      issue_date: "2026-02-01",
      items: [{ description: "Work", quantity: 1, unit_price: 200 }],
    });
    markSent(inv.id);

    // No payments yet: section must be hidden.
    const emptyHtml = renderInvoiceHtml(inv.id)!;
    expect(emptyHtml).not.toContain("Payments received");

    recordPayment(inv.id, { amount: 75, payment_date: "2026-02-10", method: "cash" });

    const html = renderInvoiceHtml(inv.id)!;
    expect(html).toContain("Payments received");
    expect(html).toContain("Balance Due");
    expect(html).toContain("cash");
    expect(html).toContain("75");
  });
});
