import type { KeyboardEvent, ReactNode } from "react";
import { Lock } from "lucide-react";

/* Dense data table. Mirrors the mockup table rules: 13px body, 10.5px
   uppercase Inter 700 headers in ink-3 with .07em tracking, line-soft row
   rules with no rule on the last row, row hover on accessible-soft, and a
   horizontal scroll wrapper (.tbl-wrap) for small screens. Numeric columns
   right-align and use tabular numerals via the global .num class.

   Generic over the row shape via column defs. A column with a render
   function controls its own cell; otherwise the value at row[key] is
   printed when it is a string or number.

   The optional lockNote on a column mirrors the mockup .lock span in the
   "Who" header, used for the patient-names rule. */

export type DataTableColumn<T> = {
  key: string;
  label: ReactNode;
  numeric?: boolean;
  render?: (row: T) => ReactNode;
  /* Small lock-icon note beside the header label, e.g. "restricted". */
  lockNote?: ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  /* Stable row key. Falls back to the row index. */
  rowKey?: (row: T, index: number) => string | number;
  /* Opt-in clickable rows. When provided, each row becomes an activatable
     button (click, Enter, or Space) and gets the pointer cursor; omitted, the
     row renders exactly as a plain presentational row. */
  onRowClick?: (row: T, index: number) => void;
  className?: string;
};

function defaultCell(value: unknown): ReactNode {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, className }: DataTableProps<T>) {
  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap border-b border-line-soft px-[10px] py-2 text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3 ${
                  col.numeric ? "text-right" : "text-left"
                }`}
              >
                {col.label}
                {col.lockNote != null ? (
                  <span className="ml-1 inline-flex items-center gap-1 align-middle font-semibold">
                    <Lock className="h-[11px] w-[11px]" strokeWidth={1.8} aria-hidden="true" />
                    {col.lockNote}
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {rows.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row, index) : index}
              className={`hover:bg-accessible-soft${onRowClick ? " cursor-pointer" : ""}`}
              {...(onRowClick
                ? {
                    role: "button",
                    tabIndex: 0,
                    onClick: () => onRowClick(row, index),
                    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        if (e.key === " ") e.preventDefault();
                        onRowClick(row, index);
                      }
                    },
                  }
                : {})}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`border-b border-line-soft px-[10px] py-[9.5px] align-middle text-ink [[data-theme=dark]_&]:text-ink-2 ${
                    col.numeric ? "num text-right" : ""
                  }`}
                >
                  {col.render
                    ? col.render(row)
                    : defaultCell((row as unknown as Record<string, unknown>)[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
