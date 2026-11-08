import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookieName, gateEnabled, validPreview } from "@/lib/prelaunch/access.mjs";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const preview = gateEnabled(process.env);
  const protect = (response: NextResponse) => {
    if (preview) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      response.headers.set("Referrer-Policy", "same-origin");
    }
    return response;
  };
  // Health and the already signature-verified delivery webhook remain operational.
  const publicEntry =
    path === "/api/health" ||
    path === "/api/webhooks/resend" ||
    path === "/coming-soon" ||
    path === "/preview-access" ||
    path === "/preview-access/lock";
  if (preview && path === "/robots.txt")
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  if (
    preview &&
    !publicEntry &&
    !validPreview(request.cookies.get(cookieName(process.env))?.value, process.env)
  ) {
    if (path.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD"))
      return protect(NextResponse.json({ message: "Ayaale is coming soon." }, { status: 503 }));
    const destination = request.nextUrl.clone();
    destination.pathname = "/coming-soon";
    destination.search = "";
    return protect(NextResponse.rewrite(destination));
  }
  let response = NextResponse.next({ request });
  if (!/^\/(auth|partner|admin)(\/|$)/.test(path)) return protect(response);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return protect(response);
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return protect(response);
}
export const config = {
  matcher: ["/((?!_next/static|_next/webpack-hmr|favicon.ico|icon.svg|apple-icon.png|icons/).*)"],
};
