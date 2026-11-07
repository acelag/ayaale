import { enforceBudget, RequestBlocked } from "@/lib/security/requests";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) return new NextResponse("Please try again later.", { status: 503, headers });
  const code = request.nextUrl.searchParams.get("code");
  if (code && code.length <= 4096) {
    try {
      await enforceBudget("auth_callback");
    } catch (error) {
      return new NextResponse("Please try again later.", {
        status: error instanceof RequestBlocked ? error.status : 503,
        headers: {
          ...headers,
          "Retry-After": String(error instanceof RequestBlocked ? error.retryAfter : 60),
        },
      });
    }
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/partner", origin), { headers });
  }
  return NextResponse.redirect(new URL("/partner/sign-in?confirmation=invalid", origin), {
    headers,
  });
}
