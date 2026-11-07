import { enforceBudget, RequestBlocked } from "@/lib/security/requests";
import { acquireImageSlot } from "@/lib/security/request-keys.mjs";
import { randomUUID } from "node:crypto";
import { requirePropertyRole } from "@/lib/auth/authorize";
import { PHOTO_BUCKET, photoStorage } from "@/lib/media/storage";
import { InvalidImage, readBoundedImage, processImage } from "@/lib/media/process-image.mjs";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(message: string, status: number) {
  return Response.json({ message }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ propertyId: string }> }) {
  if (request.headers.get("origin") !== process.env.NEXT_PUBLIC_SITE_URL)
    return reply("Request not allowed.", 403);
  const { propertyId } = await context.params;
  if (!uuid.test(propertyId)) return reply("Property not found.", 404);
  let actor;
  try {
    actor = await requirePropertyRole(propertyId);
  } catch {
    return reply("Access denied.", 403);
  }
  const storage = photoStorage();
  if (!storage) return reply("Photo uploads are not configured.", 503);
  try {
    await enforceBudget("photo_upload", actor.user.id, propertyId);
  } catch (error) {
    return Response.json(
      { message: "Please try again later." },
      {
        status: error instanceof RequestBlocked ? error.status : 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(error instanceof RequestBlocked ? error.retryAfter : 60),
        },
      },
    );
  }
  const release = acquireImageSlot();
  if (!release)
    return Response.json(
      { message: "Image processing is busy. Please try again shortly." },
      { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": "1" } },
    );
  const id = randomUUID(),
    root = `${propertyId}/${id}`,
    paths = [`${root}/main.webp`, `${root}/thumbnail.webp`];
  const attemptedPaths: string[] = [];
  try {
    const image = await processImage(
      await readBoundedImage(request.body),
      request.headers.get("content-type") ?? "",
    );
    // Recheck role after processing, immediately before the privileged writes.
    await requirePropertyRole(propertyId);
    for (const [i, variant] of [image.main, image.thumbnail].entries()) {
      attemptedPaths.push(paths[i]);
      const { error } = await storage.storage.from(PHOTO_BUCKET).upload(paths[i], variant.data, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "300",
      });
      if (error) throw new Error("Storage write failed");
    }
    const { error } = await storage.from("photo_assets").insert({
      id,
      property_id: propertyId,
      created_by: actor.user.id,
      main_path: paths[0],
      thumbnail_path: paths[1],
      width: image.main.info.width,
      height: image.main.info.height,
      byte_size: image.main.data.length,
    });
    if (error) throw new Error("Photo record failed");
    return Response.json(
      { id, width: image.main.info.width, height: image.main.info.height },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (attemptedPaths.length) {
      try {
        await storage.storage.from(PHOTO_BUCKET).remove(attemptedPaths);
      } catch {
        // Cleanup is best-effort; never mask the original error or retain the decoder slot.
      }
    }
    return error instanceof InvalidImage
      ? reply(error.message, 422)
      : reply("Unable to save this photo.", 500);
  } finally {
    release();
  }
}
