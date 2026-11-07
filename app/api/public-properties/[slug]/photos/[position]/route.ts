import { PHOTO_BUCKET, photoStorage } from "@/lib/media/storage";
import { isPropertySlug } from "@/lib/properties/public-profile";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; position: string }> },
) {
  const { slug, position } = await params;
  if (!isPropertySlug(slug) || !/^(?:[1-9]|1[0-2])$/.test(position)) {
    return new Response(null, { status: 404, headers });
  }

  const storage = photoStorage();
  if (!storage) return new Response(null, { status: 503, headers });

  const { data: path, error: lookupError } = await storage.rpc("get_public_property_photo_path", {
    property_slug: slug,
    photo_position: Number(position),
  });
  if (lookupError) return new Response(null, { status: 503, headers });
  if (typeof path !== "string") return new Response(null, { status: 404, headers });

  const { data, error } = await storage.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return new Response(null, { status: 404, headers });

  return new Response(data, { headers: { ...headers, "Content-Type": "image/webp" } });
}
