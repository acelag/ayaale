export const previewLifetime: number;
type Environment = Record<string, string | undefined>;
export function gateEnabled(env: Environment): boolean;
export function accessCode(env: Environment): string | null;
export function cookieName(env: Environment): string;
export function matchesCode(candidate: unknown, env: Environment): boolean;
export function issuePreview(env: Environment, now?: number): string;
export function validPreview(token: unknown, env: Environment, now?: number): boolean;
export function createAttemptLimiter(limit?: number, windowMs?: number): (now?: number) => boolean;
