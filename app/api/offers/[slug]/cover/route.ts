import { PHOTO_BUCKET, photoStorage } from "@/lib/media/storage";
import { isOfferSlug } from "@/lib/offers/public-details";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isOfferSlug(slug)) return new Response(null, { status: 404, headers });

  const storage = photoStorage();
  if (!storage) return new Response(null, { status: 503, headers });

  const { data: path, error: lookupError } = await storage.rpc("get_public_offer_cover_path", {
    offer_slug: slug,
  });
  if (lookupError) return new Response(null, { status: 503, headers });
  if (typeof path !== "string") return new Response(null, { status: 404, headers });

  const { data, error } = await storage.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return new Response(null, { status: 404, headers });

  return new Response(data, { headers: { ...headers, "Content-Type": "image/webp" } });
}
