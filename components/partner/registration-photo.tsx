"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useFormReady } from "./use-form-ready";

export function RegistrationPhoto({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const ready = useFormReady();
  const [state, setState] = useState({ pending: false, error: false, message: "" });

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.pending) return;
    const form = event.currentTarget;
    const photo = new FormData(form).get("photo");
    if (!(photo instanceof File) || !photo.size || photo.size > 8 * 1024 * 1024) {
      setState({ pending: false, error: true, message: "Choose a photo no larger than 8 MiB." });
      return;
    }
    setState({ pending: true, error: false, message: "" });
    try {
      const response = await fetch(`/api/properties/${propertyId}/photos`, {
        method: "POST",
        body: photo,
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setState({
          pending: false,
          error: true,
          message: result?.message ?? "Couldn’t upload this photo.",
        });
        return;
      }
      form.reset();
      setState({ pending: false, error: false, message: "Photo saved privately." });
      router.refresh();
    } catch {
      setState({
        pending: false,
        error: true,
        message: "Couldn’t confirm the upload. Refresh to check whether it was saved.",
      });
    }
  }

  return (
    <form method="post" onSubmit={upload} className="mt-4">
      <noscript>
        <p>Enable JavaScript to upload photos.</p>
      </noscript>
      <fieldset disabled={!ready || state.pending} className="grid gap-3">
        <label className="grid gap-1.5 font-medium">
          Property photo
          <input
            name="photo"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            aria-describedby="photo-help"
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background p-2"
          />
        </label>
        <p id="photo-help" className="text-sm text-muted-foreground">
          JPEG, PNG or WebP, up to 8 MiB. Both dimensions must be at least 240 pixels.
        </p>
        <Button type="submit" variant="outline" className="min-h-11 sm:justify-self-start">
          {state.pending ? "Uploading…" : "Upload photo"}
        </Button>
      </fieldset>
      <p
        role={state.error ? "alert" : "status"}
        className={state.message ? "mt-3 text-sm" : undefined}
      >
        {state.message}
      </p>
    </form>
  );
}
