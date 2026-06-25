"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CrmSliceData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* "CRM, a closer look" (spec 02 section 8.2): a paginated raw-record slice.
   Columns are server-driven so the same table renders leads, treatment
   deals, and providers. No export exists by design; patient rows carry the
   Zoho reference, never a name. */

const RESOURCES = [
  { key: "leads", label: "New leads" },
  { key: "treatment", label: "Treatment deals" },
  { key: "providers", label: "Providers" },
] as const;

type ResourceKey = (typeof RESOURCES)[number]["key"];

const PAGE_SIZE = 8;

type CrmRow = CrmSliceData["rows"][number];

/* Stable, unique React key for a CRM slice row.

   The row payload is server-driven and privacy-shaped: lead and treatment
   rows reference the person by initials only (e.g. "Lead . K.A."), so the
   first column is NOT unique and two people with the same initials collide.
   That collision was the source of the duplicate-key warning.

   If the server ever emits a unique Zoho record id on the row we use it;
   today the slice payload carries no identifier by design, so we fall back
   to the page plus the in-page index, which is unique within a render. The
   page is part of the key so paging does not reuse a key for a new row. */
function crmRowKey(resource: ResourceKey, page: number, row: CrmRow, index: number): string {
  for (const idField of ["zoho_id", "id", "record_id"] as const) {
    const id = row[idField];
    if (id != null && id !== "") return `${resource}-${String(id)}`;
  }
  return `${resource}-p${page}-i${index}`;
}

function toColumns(data: CrmSliceData): DataTableColumn<CrmRow>[] {
  return data.columns.map((col) => ({
    key: col.key,
    label: col.label,
    numeric: col.numeric,
    render: (row: CrmRow) => {
      const value = row[col.key];
      return value == null ? "·" : String(value);
    },
  }));
}

function CrmSkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      <Skeleton height={12} width="50%" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={17} />
      ))}
    </div>
  );
}

export function CrmSlice() {
  const [resource, setResource] = useState<ResourceKey>("leads");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: qk.crm(resource, page, PAGE_SIZE),
    queryFn: () =>
      fetchEnvelope<CrmSliceData>("crm", "/crm", {
        resource,
        page,
        page_size: PAGE_SIZE,
      }),
  });

  const data = query.data?.data;

  return (
    <Card>
      <CardHeader
        title="CRM, a closer look"
        subtitle="Browse a slice when you need to check the raw records."
        right={
          <select
            aria-label="CRM resource"
            value={resource}
            onChange={(e) => {
              setResource(e.target.value as ResourceKey);
              setPage(1);
            }}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
          >
            {RESOURCES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        }
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<CrmSkeleton />}
          isEmpty={(d) => d.rows.length === 0}
          emptyCopy="No records in this slice."
        >
          {(d, _meta, flags) => (
            <div className={flags.unreliable ? "opacity-55" : undefined}>
              <DataTable
                columns={toColumns(d)}
                rows={d.rows}
                rowKey={(row, i) => crmRowKey(resource, page, row, i)}
              />
            </div>
          )}
        </QueryPanel>
      </div>
      {data ? (
        <CardFooter
          note={
            <span className="num">
              Page {data.page} of {data.pages} · {data.total} records
            </span>
          }
          right={
            <span className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={data.page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </span>
          }
        />
      ) : null}
    </Card>
  );
}
