/** Matches `updateInvoice` in the backend: only draft invoices accept PUT /invoices/:id */
export function isInvoiceFormEditable(status: string): boolean {
  return status === "draft";
}

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  voided: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  complete: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};
