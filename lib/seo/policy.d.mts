export const CANONICAL_ORIGIN: string;
export function indexingEnabled(env: Record<string, string | undefined>): boolean;
export function verificationCode(env: Record<string, string | undefined>): string | undefined;
export function canonical(path?: string): string;
export function summary(text: string): string;
export function jsonLd(value: unknown): string;
export function discoveryVariant(params: Record<string, unknown>): boolean;
export function websiteData(): Record<string, unknown>;
export function breadcrumbs(path: string, name: string): Record<string, unknown>;
