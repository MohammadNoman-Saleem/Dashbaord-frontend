"use client";

import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  EMPTY_FILTERS,
  FEE_STATE_LABELS,
  NO_TYPE,
  activeFilterCount,
  isTodayRange,
  type AppointmentFilterOptions,
  type AppointmentFilterState,
  type FeeState,
} from "@/lib/appointments/filters";

/* Filter control for the appointments table: one button that opens a panel of
   checkbox groups plus a date range, and a row of chips showing what is applied.
   Multiple filters combine, ORed inside a group and ANDed across groups.

   The option lists are passed in, derived from the rows on screen, so the panel
   never offers a value that cannot match anything. Escape and outside clicks
   close the panel, following components/shell/PersonMenu.tsx.

   State lives in the URL, so the parent owns it and this component only reports
   changes. Today is a separate callback because it also has to widen the
   server-side reporting period, which this component knows nothing about. */

const GROUP_LABEL =
  "pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3";

const DATE_INPUT =
  "w-full rounded-[9px] border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink";

type CheckGroupProps = {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  format?: (value: string) => string;
};

function CheckGroup({ title, options, selected, onToggle, format }: CheckGroupProps) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className={GROUP_LABEL}>{title}</div>
      <div className="max-h-[164px] overflow-y-auto">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded-[8px] px-1.5 py-[5px] text-[12.5px] text-ink hover:bg-accessible-soft"
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
              className="h-[13px] w-[13px] shrink-0 accent-accent"
            />
            <span className="truncate">{format ? format(option) : option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* One applied filter, removable. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-[5px] whitespace-nowrap rounded-full bg-accessible-soft px-[9px] py-[2.5px] text-[11px] font-bold text-title">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        title={`Remove filter ${label}`}
        className="grid h-[14px] w-[14px] cursor-pointer place-items-center rounded-full text-ink-2 hover:bg-surface hover:text-title [&_svg]:h-[10px] [&_svg]:w-[10px]"
      >
        <X strokeWidth={2.2} aria-hidden="true" />
      </button>
    </span>
  );
}

function typeLabel(value: string): string {
  return value === NO_TYPE ? "No type" : value;
}

type AppointmentFiltersProps = {
  filters: AppointmentFilterState;
  options: AppointmentFilterOptions;
  onChange: (next: AppointmentFilterState) => void;
  /** Apply the Today preset. The parent also widens the reporting period so
   *  today is inside the loaded window. */
  onToday: () => void;
};

export function AppointmentFilters({
  filters,
  options,
  onChange,
  onToday,
}: AppointmentFiltersProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const count = activeFilterCount(filters);

  function toggle<K extends "doctors" | "statuses" | "types">(group: K, value: string) {
    const current = filters[group];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [group]: next });
  }

  function toggleFee(value: string) {
    const fee = value as FeeState;
    const next = filters.feeStates.includes(fee)
      ? filters.feeStates.filter((v) => v !== fee)
      : [...filters.feeStates, fee];
    onChange({ ...filters, feeStates: next });
  }

  const dateChipLabel = isTodayRange(filters)
    ? "Today"
    : filters.from !== null && filters.to !== null
      ? `${filters.from} to ${filters.to}`
      : filters.from !== null
        ? `From ${filters.from}`
        : `Until ${filters.to}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToday}
        aria-pressed={isTodayRange(filters)}
        className={isTodayRange(filters) ? "border-accent text-accent" : undefined}
      >
        Today
      </Button>

      <div ref={rootRef} className="relative">
        <Button
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal strokeWidth={1.8} aria-hidden="true" />
          Filters
          {count > 0 ? (
            <span className="ml-[1px] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-[4px] text-[10.5px] font-bold text-on-accent">
              {count}
            </span>
          ) : null}
          <ChevronDown strokeWidth={1.8} aria-hidden="true" />
        </Button>

        {open ? (
          <div
            role="dialog"
            aria-label="Filter appointments"
            className="absolute right-0 top-full z-[60] mt-2 w-[292px] rounded-card border border-line bg-surface p-[13px] shadow-pop"
          >
            <div className="flex items-center justify-between pb-2">
              <span className="text-[13px] font-semibold text-title">Filters</span>
              {count > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange(EMPTY_FILTERS)}
                  className="cursor-pointer text-[11.5px] font-semibold text-accent hover:underline"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-[13px]">
              <div>
                <div className={GROUP_LABEL}>Date range</div>
                <div className="flex items-center gap-2">
                  <label className="flex-1">
                    <span className="sr-only">From date</span>
                    <input
                      type="date"
                      value={filters.from ?? ""}
                      max={filters.to ?? undefined}
                      onChange={(e) =>
                        onChange({ ...filters, from: e.target.value || null })
                      }
                      className={DATE_INPUT}
                    />
                  </label>
                  <span className="text-[11.5px] text-ink-3">to</span>
                  <label className="flex-1">
                    <span className="sr-only">To date</span>
                    <input
                      type="date"
                      value={filters.to ?? ""}
                      min={filters.from ?? undefined}
                      onChange={(e) =>
                        onChange({ ...filters, to: e.target.value || null })
                      }
                      className={DATE_INPUT}
                    />
                  </label>
                </div>
              </div>

              <CheckGroup
                title="Doctor"
                options={options.doctors}
                selected={filters.doctors}
                onToggle={(v) => toggle("doctors", v)}
              />
              <CheckGroup
                title="Status"
                options={options.statuses}
                selected={filters.statuses}
                onToggle={(v) => toggle("statuses", v)}
              />
              <CheckGroup
                title="Appointment type"
                options={options.types}
                selected={filters.types}
                onToggle={(v) => toggle("types", v)}
                format={typeLabel}
              />
              <CheckGroup
                title="Fee"
                options={options.feeStates}
                selected={filters.feeStates}
                onToggle={toggleFee}
                format={(v) => FEE_STATE_LABELS[v as FeeState]}
              />
            </div>
          </div>
        ) : null}
      </div>

      {filters.doctors.map((value) => (
        <FilterChip
          key={`doctor-${value}`}
          label={value}
          onRemove={() =>
            onChange({ ...filters, doctors: filters.doctors.filter((v) => v !== value) })
          }
        />
      ))}
      {filters.statuses.map((value) => (
        <FilterChip
          key={`status-${value}`}
          label={value}
          onRemove={() =>
            onChange({ ...filters, statuses: filters.statuses.filter((v) => v !== value) })
          }
        />
      ))}
      {filters.types.map((value) => (
        <FilterChip
          key={`type-${value}`}
          label={typeLabel(value)}
          onRemove={() =>
            onChange({ ...filters, types: filters.types.filter((v) => v !== value) })
          }
        />
      ))}
      {filters.feeStates.map((value) => (
        <FilterChip
          key={`fee-${value}`}
          label={FEE_STATE_LABELS[value]}
          onRemove={() =>
            onChange({ ...filters, feeStates: filters.feeStates.filter((v) => v !== value) })
          }
        />
      ))}
      {filters.from !== null || filters.to !== null ? (
        <FilterChip
          label={dateChipLabel}
          onRemove={() => onChange({ ...filters, from: null, to: null })}
        />
      ) : null}
    </div>
  );
}
