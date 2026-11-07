import { Button } from "@/components/ui/button";
import type { PartnerProperty } from "@/lib/partner/properties";

export function PropertySwitcher({
  properties,
  currentId,
  view,
}: {
  properties: PartnerProperty[];
  currentId?: string;
  view?: "analytics" | "subscription";
}) {
  if (!properties.length) return null;
  return (
    <form action="/partner" method="get" className="mt-5 flex items-end gap-2">
      {view && <input type="hidden" name="view" value={view} />}
      <label className="grid min-w-0 flex-1 gap-1.5 font-medium sm:max-w-xs">
        Switch property
        <select
          name="property"
          defaultValue={currentId ?? ""}
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"
        >
          <option value="">All Properties Overview</option>
          {properties.map(({ id, name, district, role }) => (
            <option key={id} value={id}>
              {name} · {district} ({role})
            </option>
          ))}
        </select>
      </label>
      <Button variant="outline" type="submit" className="min-h-11 shrink-0">
        Go
      </Button>
    </form>
  );
}
