export const CONSENT_KEY: string;
export const CONSENT_AGE: number;
export const campaigns: Record<string, string[]>;
export function campaignQuery(name: string): string;
export function publicPage(path: string): { path: string; type: string; title: string } | null;
export function safePage(
  url: string,
): { page_location: string; page_title: string; page_referrer: string; page_type: string } | null;
export function consentChoice(raw: string, now?: number): "allow" | "decline" | null;
export function analyticsEvent(name: string, value?: string): Record<string, string> | null;

export function safeReferrer(raw: string): string;

export function analyticsConfigured(
  enabled: string | undefined,
  id: string,
  privacyUrl: string,
): boolean;
