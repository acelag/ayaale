"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { submitProfile } from "@/lib/partner/profile-actions";
import {
  contactFields,
  informationFields,
  type GalleryPhoto,
  type PhotoAsset,
  type ProfileField,
  type PropertyEditor,
} from "@/lib/partner/profile-editor";
import { PhotoLibrary } from "./profile-photos";
import { useFormReady } from "./use-form-ready";

const fieldClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2";

export function PropertyProfileForm({
  propertyId,
  editor,
  assets,
}: {
  propertyId: string;
  editor: PropertyEditor;
  assets: PhotoAsset[];
}) {
  const [state, action, pending] = useActionState(
    submitProfile.bind(null, propertyId, editor.version),
    { message: "" },
  );
  const [values, setValues] = useState(editor.profile);
  const [amenities, setAmenities] = useState(editor.profile.amenities.join("\n"));
  const ready = useFormReady();
  const gallery = values.gallery;
  const completed = [
    { label: "Name and description", done: values.name?.trim() && values.description?.trim() },
    {
      label: "Address and map link",
      done: values.address?.trim() && values.district?.trim() && values.google_maps_url?.trim(),
    },
    {
      label: "Business contact",
      done: values.public_phone?.trim() || values.public_whatsapp?.trim(),
    },
    { label: "Amenities", done: amenities.trim() },
    {
      label: "Gallery with photo descriptions",
      done: gallery.length > 0 && gallery.every(({ alt }) => alt.trim().length >= 2),
    },
  ];
  const score = completed.filter(({ done }) => done).length * 20;

  function setGallery(next: GalleryPhoto[]) {
    setValues((previous) => ({ ...previous, gallery: next }));
  }

  function move(index: number, direction: number) {
    const next = [...gallery];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setGallery(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !editor.editable) return;
    const form = new FormData(event.currentTarget);
    form.set("gallery", JSON.stringify(gallery));
    startTransition(() => action(form));
  }

  function fields(items: readonly ProfileField[]) {
    return items.map(({ name, label, max, required, multiline, type }) => {
      const props = {
        name,
        required,
        maxLength: max,
        value: values[name] ?? "",
        className: fieldClass,
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          const value = event.target.value;
          setValues((previous) => ({ ...previous, [name]: value }));
        },
      };
      return (
        <label key={name} className="grid gap-1.5 font-medium">
          {label}
          {required ? "" : " (optional)"}
          {multiline ? <textarea {...props} rows={3} /> : <input {...props} type={type} />}
        </label>
      );
    });
  }

  return (
    <>
      <section
        className="mt-6 rounded-lg border bg-card p-4"
        aria-labelledby="profile-completeness"
      >
        <h2 id="profile-completeness" className="font-semibold">
          Profile completeness
        </h2>
        <p className="mt-1">{score}% complete</p>
        <progress
          className="w-full accent-primary"
          value={score}
          max={100}
          aria-label="Profile completeness"
        />
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {completed.map(({ label, done }) => (
            <li key={label}>
              {label} · {done ? "Complete" : "Missing"}
            </li>
          ))}
        </ul>
      </section>
      <form method="post" onSubmit={submit} className="mt-6 grid gap-5">
        <noscript>
          <p>Enable JavaScript to edit the property profile.</p>
        </noscript>
        <fieldset disabled={!editor.editable || !ready || pending} className="grid min-w-0 gap-5">
          <section
            aria-labelledby="profile-information"
            className="grid gap-3 rounded-lg border bg-card p-4"
          >
            <h2 id="profile-information" className="text-xl font-semibold">
              Information
            </h2>
            {fields(informationFields)}
          </section>
          <section
            aria-labelledby="profile-contact"
            className="grid gap-3 rounded-lg border bg-card p-4"
          >
            <h2 id="profile-contact" className="text-xl font-semibold">
              Contact
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter at least one business number with its country code.
            </p>
            {fields(contactFields)}
          </section>
          <section
            aria-labelledby="profile-facilities"
            className="grid gap-3 rounded-lg border bg-card p-4"
          >
            <h2 id="profile-facilities" className="text-xl font-semibold">
              Facilities
            </h2>
            <label className="grid gap-1.5 font-medium">
              Amenities
              <textarea
                name="amenities"
                rows={5}
                maxLength={2500}
                value={amenities}
                aria-describedby="profile-amenities-help"
                onChange={(event) => setAmenities(event.target.value)}
                className={fieldClass}
              />
            </label>
            <p id="profile-amenities-help" className="text-sm text-muted-foreground">
              List up to 24 amenities, one per line.
            </p>
          </section>
          <section aria-labelledby="profile-gallery" className="rounded-lg border bg-card p-4">
            <h2 id="profile-gallery" className="text-xl font-semibold">
              Photo gallery
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose up to 12 photos and describe each one. The first photo becomes the cover after
              approval.
            </p>
            {editor.editable && (
              <PhotoLibrary
                propertyId={propertyId}
                assets={assets}
                gallery={gallery}
                onAdd={(id) => setGallery([...gallery, { id, alt: "" }])}
              />
            )}
            <ol className="mt-3 grid gap-3">
              {gallery.map(({ id, alt }, index) => (
                <li key={id} className="grid gap-2 rounded-md border p-3">
                  <label className="grid gap-1.5 font-medium">
                    {index === 0 ? "Cover photo description" : `Photo ${index + 1} description`}
                    <input
                      required
                      minLength={2}
                      maxLength={180}
                      value={alt}
                      className={fieldClass}
                      onChange={(event) =>
                        setGallery(
                          gallery.map((photo) =>
                            photo.id === id ? { ...photo, alt: event.target.value } : photo,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={index === 0}
                      aria-label={`Move up photo ${index + 1}`}
                      onClick={() => move(index, -1)}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={index === gallery.length - 1}
                      aria-label={`Move down photo ${index + 1}`}
                      onClick={() => move(index, 1)}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() => setGallery(gallery.filter((photo) => photo.id !== id))}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {editor.editable && (
            <Button type="submit" className="min-h-11 sm:justify-self-start">
              {pending ? "Submitting…" : "Submit profile for review"}
            </Button>
          )}
        </fieldset>
        {state.message && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.message}
          </p>
        )}
      </form>
    </>
  );
}
