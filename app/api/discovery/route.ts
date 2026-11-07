import { discoveryParams, loadDiscoveryPage } from "@/lib/discovery/feed";
export async function GET(request: Request) {
  const params = discoveryParams(Object.fromEntries(new URL(request.url).searchParams));
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  try {
    return Response.json(
      await loadDiscoveryPage(params.category, params.query, params.cursor, params.filters),
      {
        headers,
      },
    );
  } catch {
    return Response.json(
      { message: "Offers are unavailable. Please try again." },
      { status: 503, headers },
    );
  }
}
