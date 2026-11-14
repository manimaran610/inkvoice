const ITEMS_PER_PAGE = 30;

export function paginateTemplateItems<T extends object>(items: T[]) {
  const pageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));

  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const rows: Array<(T & { is_pad: false }) | { is_pad: true }> = items
      .slice(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE)
      .map((item): T & { is_pad: false } => ({ ...item, is_pad: false }));

    while (rows.length < ITEMS_PER_PAGE) rows.push({ is_pad: true });

    return {
      rows,
      is_last_page: pageIndex === pageCount - 1,
    };
  });
}
