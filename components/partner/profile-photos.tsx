"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { GalleryPhoto, PhotoAsset } from "@/lib/partner/profile-editor";

export function PhotoLibrary({
  propertyId,
  assets,
  gallery,
  onAdd,
}: {
  propertyId: string;
  assets: PhotoAsset[];
  gallery?: GalleryPhoto[];
  onAdd?: (id: string) => void;
}) {
  const [choice, setChoice] = useState("");
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const available = assets.some(({ id }) => id === choice);
  const selected = assets.find(({ id }) => id === choice);

  async function showPhoto() {
    setLoading(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch(`/api/properties/${propertyId}/photos/${choice}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      const url = result.images?.[1];
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error();
      setPreview({ id: choice, url });
    } catch {
      setMessage("This photo couldn’t be loaded. Try previewing it again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      {assets.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 basis-full gap-1.5 sm:grow sm:basis-auto font-medium">
            Uploaded photo
            <select
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              className="min-h-11 w-full rounded-md border border-input bg-background px-2"
            >
              <option value="">Choose a photo</option>
              {assets.map(({ id, width, height }, index) => (
                <option key={id} value={id}>
                  Photo {index + 1} · {width} × {height}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!available || loading}
            onClick={showPhoto}
          >
            {loading ? "Loading…" : "Preview photo"}
          </Button>
          {onAdd && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={
                !available || gallery?.length === 12 || gallery?.some(({ id }) => id === choice)
              }
              onClick={() => onAdd(choice)}
            >
              Add to gallery
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No photos have been uploaded yet.</p>
      )}
      {message && (
        <p role="alert" className="mt-2 text-sm">
          {message}
        </p>
      )}
      {preview && preview.id === selected?.id && (
        <Image
          src={preview.url}
          alt="Private preview of the selected property photo"
          width={selected.width}
          height={selected.height}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => {
            setPreview(null);
            setMessage("This photo couldn’t be loaded. Preview it again for a fresh link.");
          }}
          className="mt-4 h-auto max-h-64 w-auto max-w-full rounded-md object-contain"
        />
      )}
    </div>
  );
}
