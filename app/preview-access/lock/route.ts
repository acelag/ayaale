import { NextRequest, NextResponse } from "next/server";
import { cookieName, gateEnabled } from "@/lib/prelaunch/access.mjs";
export async function POST(request: NextRequest) {
  if (!gateEnabled(process.env)) return new Response(null, { status: 404 });
  let origin: string;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;
  } catch {
    return new Response(null, { status: 503 });
  }
  if (request.headers.get("origin") !== origin) return new Response(null, { status: 403 });
  const response = NextResponse.redirect(new URL("/coming-soon", origin), 303);
  response.cookies.set(cookieName(process.env), "", {
    httpOnly: true,
    secure: process.env.APP_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
