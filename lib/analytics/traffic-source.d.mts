export type TrafficSource = "unknown" | "direct" | "newsletter" | "search" | "social" | "referral";
export const sourceLabels: Record<TrafficSource, string>;
export function trafficSource(
  href: string,
  referrer: string,
  consent: string | null,
  now?: number,
): TrafficSource;
export function acceptedSource(value: string | null): Exclude<TrafficSource, "direct">;
export function createSourceContext(): {
  clear(): void;
  read(href: string, referrer: string, consent: string | null, now?: number): TrafficSource;
};
export const documentSource: ReturnType<typeof createSourceContext>;
