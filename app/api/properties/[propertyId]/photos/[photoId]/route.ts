import { enforceBudget, RequestBlocked } from "@/lib/security/requests";
import { requirePlatformAdmin, requirePropertyRole } from "@/lib/auth/authorize";
import { PHOTO_BUCKET, photoStorage } from "@/lib/media/storage";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ propertyId: string; photoId: string }> },
) {
  const { propertyId, photoId } = await context.params;
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  try {
    const actor = await requirePropertyRole(propertyId).catch(() => requirePlatformAdmin());
    await enforceBudget("photo_read", actor.user.id);
  } catch (error) {
    if (error instanceof RequestBlocked)
      return Response.json(
        { message: error.message },
        { status: error.status, headers: { ...headers, "Retry-After": String(error.retryAfter) } },
      );
    return Response.json({ message: "Access denied." }, { status: 403, headers });
  }
  const storage = photoStorage();
  if (!storage)
    return Response.json({ message: "Photo storage is not configured." }, { status: 503, headers });
  const { data, error } = await storage
    .from("photo_assets")
    .select("main_path,thumbnail_path")
    .eq("id", photoId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error || !data)
    return Response.json({ message: "Photo not found." }, { status: 404, headers });
  const result = await storage.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls([data.main_path, data.thumbnail_path], 60);
  if (result.error)
    return Response.json({ message: "Photo unavailable." }, { status: 503, headers });
  return Response.json(
    { images: result.data.map((item) => item.signedUrl), expiresIn: 60 },
    { headers },
  );
}
