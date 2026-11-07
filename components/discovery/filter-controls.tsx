"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  filterError,
  filterFields,
  readFilters,
  sorts,
  type FilterField,
  type Filters,
} from "@/lib/discovery/filters";
import { discoveryHref, type Category } from "@/lib/discovery/model";

const labels: Record<FilterField, string> = {
  destination: "Destination",
  min: "Minimum price (LKR)",
  max: "Maximum price (LKR)",
  from: "Start date",
  to: "End date",
  guests: "Adults",
  nights: "Nights",
};

type Props = { category: Category; query: string; filters: Filters; total: number | null };

export function FilterControls({ category, query, filters, total }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [preview, setPreview] = useState<{ key: string; total: number | null }>();
  const normalized = readFilters(draft, category);
  const hasInvalidValue = filterFields.some((field) => draft[field]?.trim() && !normalized[field]);
  const error = filterError(normalized) ?? (hasInvalidValue ? "Enter valid filter values." : null);
  const requestKey = new URLSearchParams({ category, q: query, ...normalized }).toString();
  const appliedKey = new URLSearchParams({ category, q: query, ...filters }).toString();
  const count =
    requestKey === appliedKey ? total : preview?.key === requestKey ? preview.total : null;
  const active = filterFields.filter((field) => filters[field]);

  useEffect(() => {
    if (!open || error || requestKey === appliedKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/discovery?${requestKey}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw new Error("Count unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setPreview({ key: requestKey, total: data.total });
      } catch {
        if (!controller.signal.aborted) setPreview({ key: requestKey, total: null });
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, error, requestKey, appliedKey]);

  function field(name: FilterField, attributes: React.InputHTMLAttributes<HTMLInputElement> = {}) {
    return (
      <label className="grid gap-1 text-sm font-medium">
        {labels[name]}
        <input
          {...attributes}
          name={name}
          value={draft[name] ?? ""}
          onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
          className="min-h-11 min-w-0 rounded-md border border-input bg-background px-3"
        />
      </label>
    );
  }

  return (
    <>
      <div className="discovery-filter-bar">
        <Button
          ref={opener}
          variant="outline"
          onClick={() => {
            setDraft(filters);
            setPreview(undefined);
            dialog.current?.showModal();
            setOpen(true);
          }}
          aria-haspopup="dialog"
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters{active.length ? ` (${active.length})` : ""}
        </Button>
        <form action="/#offers" method="get" className="flex min-w-0 items-center gap-2">
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="q" value={query} />
          {active.map((name) => (
            <input key={name} type="hidden" name={name} value={filters[name]} />
          ))}
          <label className="sr-only" htmlFor="discovery-sort">
            Sort offers
          </label>
          <select
            id="discovery-sort"
            name="sort"
            defaultValue={filters.sort ?? "newest"}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="min-h-11 min-w-0 rounded-md border border-input bg-card px-2 text-sm"
          >
            {sorts.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.label}
              </option>
            ))}
          </select>
          <noscript>
            <Button type="submit" size="sm">
              Sort
            </Button>
          </noscript>
        </form>
      </div>
      {!!active.length && (
        <ul aria-label="Active filters" className="mb-5 flex flex-wrap gap-2">
          {active.map((name) => (
            <li key={name}>
              <Button asChild variant="secondary" size="sm">
                <a
                  href={discoveryHref(category, query, undefined, {
                    ...filters,
                    [name]: undefined,
                  })}
                  aria-label={`Remove ${labels[name]} filter: ${filters[name]}`}
                >
                  {labels[name]}: {filters[name]} <X aria-hidden="true" />
                </a>
              </Button>
            </li>
          ))}
          <li>
            <Button asChild variant="ghost" size="sm">
              <a href={discoveryHref(category, query, undefined, { sort: filters.sort })}>
                Reset filters
              </a>
            </Button>
          </li>
        </ul>
      )}
      <dialog
        ref={dialog}
        className="discovery-filter-dialog"
        aria-labelledby="filter-title"
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
      >
        <form action="/#offers" method="get" className="grid gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="filter-title" className="text-xl font-semibold">
              Filter offers
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close filters"
              onClick={() => dialog.current?.close()}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="q" value={query} />
          <input type="hidden" name="sort" value={filters.sort ?? "newest"} />
          {field("destination", { maxLength: 80, placeholder: "e.g. Galle" })}
          <div className="grid grid-cols-2 gap-3">
            {field("min", { type: "number", min: 0, max: 9999999999.99, step: 0.01 })}
            {field("max", { type: "number", min: 0, max: 9999999999.99, step: 0.01 })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("from", { type: "date" })}
            {field("to", { type: "date" })}
          </div>
          <p className="text-sm text-muted-foreground">
            Dates must fall within the offer’s redemption window.
          </p>
          {category !== "all" && field("guests", { type: "number", min: 1, max: 1000 })}
          {category === "stays" && field("nights", { type: "number", min: 1, max: 90 })}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="ghost" onClick={() => setDraft({ sort: filters.sort })}>
              Reset
            </Button>
            <Button type="submit" disabled={Boolean(error)} aria-live="polite">
              {count === null || error
                ? "Show Offers"
                : `Show ${count} ${count === 1 ? "Offer" : "Offers"}`}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
