import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Mustache from "mustache";
import { paginateTemplateItems } from "../utils/template-pagination";

const skvTemplate = readFileSync(
  new URL("../../../../template/skv-old.html", import.meta.url),
  "utf8",
);

describe("paginateTemplateItems", () => {
  test("returns one page of blank rows when there are no items", () => {
    const pages = paginateTemplateItems([]);

    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toHaveLength(30);
    expect(pages[0].rows.every((row) => row.is_pad)).toBe(true);
    expect(pages[0].is_last_page).toBe(true);
  });

  test("pads only the last page and keeps rows at 30 per page", () => {
    const items = Array.from({ length: 31 }, (_, serial_number) => ({ serial_number }));
    const pages = paginateTemplateItems(items);

    expect(pages.map((page) => page.rows.length)).toEqual([30, 30]);
    expect(pages[0].rows.every((row) => !row.is_pad)).toBe(true);
    expect(pages[1].rows[0]).toMatchObject({ serial_number: 30, is_pad: false });
    expect(pages[1].rows.slice(1).every((row) => row.is_pad)).toBe(true);
    expect(pages.map((page) => page.is_last_page)).toEqual([false, true]);
  });

  test("does not add an extra page for an exact multiple of 30", () => {
    const pages = paginateTemplateItems(Array.from({ length: 60 }, () => ({})));

    expect(pages).toHaveLength(2);
    expect(pages.every((page) => page.rows.every((row) => !row.is_pad))).toBe(true);
  });

  test("renders three 30-row pages with blank filler rows and the footer once", () => {
    const items = Array.from({ length: 61 }, (_, serial_number) => ({
      serial_number: serial_number + 1,
      description: `Item ${serial_number + 1}`,
    }));
    const html = Mustache.render(skvTemplate, {
      items_by_page: paginateTemplateItems(items),
    });

    expect(html.match(/class="invoice-page"/g)).toHaveLength(3);
    expect(html.match(/<tr class="pad">/g)).toHaveLength(29);
    expect(html.match(/class="foot"/g)).toHaveLength(1);
    expect(html).not.toContain("<script>");
  });
});
