import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const previewLifetime = 8 * 60 * 60;
export function gateEnabled(env) {
  return env.PRELAUNCH_ENABLED === "true";
}
export function accessCode(env) {
  const code = env.PRELAUNCH_ACCESS_CODE;
  return typeof code === "string" && code.length >= 12 && code.length <= 128 && !/\s/.test(code)
    ? code
    : null;
}
export function cookieName(env) {
  return env.APP_ENV === "production" ? "__Host-ayaale-preview" : "ayaale-preview";
}
function mac(value, code) {
  return createHmac("sha256", code).update(`ayaale-preview-v1:${value}`).digest("hex");
}
export function matchesCode(candidate, env) {
  const expected = accessCode(env);
  if (!expected || typeof candidate !== "string" || candidate.length > 128) return false;
  const hash = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(candidate), hash(expected));
}
export function issuePreview(env, now = Date.now()) {
  const code = accessCode(env);
  if (!code) throw Error("Preview access is not configured");
  const expiry = String(Math.floor(now / 1000) + previewLifetime);
  return `${expiry}.${mac(expiry, code)}`;
}
export function validPreview(token, env, now = Date.now()) {
  const code = accessCode(env);
  if (!code || typeof token !== "string" || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, signature] = token.split(".");
  const remaining = Number(expiry) - Math.floor(now / 1000);
  if (remaining <= 0 || remaining > previewLifetime) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mac(expiry, code), "hex"));
}
// Best-effort per-process throttle. Long private codes remain required; restarts
// reset this counter, and multiple instances would need a shared rate limiter.
export function createAttemptLimiter(limit = 20, windowMs = 60_000) {
  let start = 0,
    count = 0;
  return (now = Date.now()) => {
    if (now - start >= windowMs || now < start) {
      start = now;
      count = 0;
    }
    count++;
    return count <= limit;
  };
}
