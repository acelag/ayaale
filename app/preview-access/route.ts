import { NextRequest, NextResponse } from "next/server";
import {
  cookieName,
  createAttemptLimiter,
  gateEnabled,
  issuePreview,
  matchesCode,
  previewLifetime,
} from "@/lib/prelaunch/access.mjs";

export const runtime = "nodejs";
const allowAttempt = createAttemptLimiter();
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "same-origin",
};
export async function POST(request: NextRequest) {
  if (!gateEnabled(process.env)) return new Response(null, { status: 404, headers });
  let origin: string;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;
  } catch {
    return new Response(null, { status: 503, headers });
  }
  if (request.headers.get("origin") !== origin) return new Response(null, { status: 403, headers });
  const failure = (error: string) => {
    const response = NextResponse.redirect(new URL(`/coming-soon?error=${error}`, origin), 303);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  };
  if (!allowAttempt()) return failure("limited");
  if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded"))
    return new Response(null, { status: 415, headers });
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (!reader) return failure("invalid");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void reader.cancel().catch(() => {});
        reject(new Error("Body timeout"));
      }, 5000);
    });
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return failure("invalid");
      }
      chunks.push(value);
    }
  } catch {
    return failure("invalid");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  if (body.getAll("accessCode").length !== 1 || !matchesCode(body.get("accessCode"), process.env))
    return failure("invalid");
  const response = NextResponse.redirect(new URL("/", origin), 303);
  response.cookies.set(cookieName(process.env), issuePreview(process.env), {
    httpOnly: true,
    secure: process.env.APP_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: previewLifetime,
  });
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}
