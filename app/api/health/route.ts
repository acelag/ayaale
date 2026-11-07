export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Application liveness only. Never expose configuration or call paid dependencies.
export function GET() {
  return Response.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
