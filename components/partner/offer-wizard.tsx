"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { priceUnits } from "@/lib/discovery/model";
import { saveWizard } from "@/lib/partner/offer-actions";
import {
  basics,
  categoryFields,
  conditions,
  lines,
  offerDiscount,
  pricing,
  wizardSteps,
  type WizardContent,
  type WizardField,
} from "@/lib/partner/offer-wizard";
import type { PhotoAsset } from "@/lib/partner/profile-editor";
import { RegistrationPhoto } from "./registration-photo";
import { PhotoLibrary } from "./profile-photos";
import { useFormReady } from "./use-form-ready";

const fieldClass = "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2";
const money = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 2 });

function PreviewImage({
  propertyId,
  asset,
  alt,
}: {
  propertyId: string;
  asset: PhotoAsset;
  alt: string;
}) {
  const [source, setSource] = useState("");
  useEffect(() => {
    const request = new AbortController();
    fetch(`/api/properties/${propertyId}/photos/${asset.id}`, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const { images } = await response.json();
        if (typeof images?.[1] === "string" && /^https?:\/\//.test(images[1])) setSource(images[1]);
      })
      .catch(() => {});
    return () => request.abort();
  }, [propertyId, asset.id]);
  return source ? (
    <Image
      src={source}
      alt={alt}
      width={asset.width}
      height={asset.height}
      unoptimized
      onError={() => setSource("")}
      referrerPolicy="no-referrer"
      className="aspect-[4/3] w-full rounded-md object-cover"
    />
  ) : (
    <div className="grid aspect-[4/3] place-items-center rounded-md bg-secondary p-2 text-center text-sm">
      Photo preview unavailable
    </div>
  );
}

export function OfferWizard({
  propertyId,
  propertyName,
  propertyContact,
  verified,
  canStay,
  draftId,
  version,
  initialStep,
  initial,
  assets,
}: {
  propertyId: string;
  propertyName: string;
  propertyContact: string[];
  verified: boolean;
  canStay: boolean;
  draftId: string;
  version: number;
  initialStep: number;
  initial: WizardContent;
  assets: PhotoAsset[];
}) {
  const [id] = useState(draftId);
  const [step, setStep] = useState(initialStep);
  const [fields, setFields] = useState(initial.fields);
  const [gallery, setGallery] = useState(initial.gallery);
  const [state, action, pending] = useActionState(saveWizard.bind(null, propertyId, id, version), {
    message: "",
  });
  const ready = useFormReady();
  // An error directs the user to the affected step once. Later navigation stays under their control.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.step !== undefined) setStep(state.step);
  }
  const heading = useRef<HTMLLegendElement>(null);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const previousResult = useRef(state);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousResult.current !== state && state.message) {
      errorSummary.current?.focus();
    } else if (previousStep.current !== step) {
      heading.current?.focus();
    }
    previousResult.current = state;
    previousStep.current = step;
  }, [state, step]);
  const category = fields.category;
  const specificFields = Object.hasOwn(categoryFields, category) ? categoryFields[category] : [];
  const discount = offerDiscount(fields.promotional_price, fields.original_price);
  const cover = assets.find(({ id }) => id === fields.cover);
  const eligibleGallery = assets.filter(({ id }) => id !== fields.cover);

  function setField(name: string, value: string) {
    setFields((previous) => ({ ...previous, [name]: value }));
  }

  function submit(intent: "save" | "submit") {
    if (pending || !ready) return;
    const form = new FormData();
    form.set("intent", intent);
    form.set("step", String(step));
    const selected = { ...fields };
    if (Number(selected.children) <= 0) {
      delete selected.child_age_min;
      delete selected.child_age_max;
      delete selected.child_policy;
    }
    form.set("content", JSON.stringify({ fields: selected, gallery }));
    startTransition(() => action(form));
  }

  function renderFields(items: WizardField[]) {
    return items.map(({ name, label, max, type, multiline, options, required }) => {
      const props = {
        name,
        maxLength: max ?? 1000,
        value: fields[name] ?? "",
        className: fieldClass,
        onChange: (
          event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
        ) => setField(name, event.target.value),
      };
      return (
        <label key={name} className="grid min-w-0 gap-1.5 font-medium">
          {label}
          {required ? "" : " (optional)"}
          {options ? (
            <select {...props}>
              <option value="">Choose an option</option>
              {Object.entries(options).map(([key, option]) => (
                <option
                  value={key}
                  key={key}
                  disabled={name === "category" && key === "stays" && !canStay}
                >
                  {option}
                </option>
              ))}
            </select>
          ) : multiline ? (
            <textarea {...props} rows={3} />
          ) : (
            <input
              {...props}
              type={type === "decimal" || type === "integer" ? "text" : type}
              inputMode={
                type === "decimal" ? "decimal" : type === "integer" ? "numeric" : undefined
              }
            />
          )}
        </label>
      );
    });
  }

  const format = (value?: string) =>
    value && Number.isFinite(Number(value))
      ? `LKR ${money.format(Number(value))}`
      : "Price to be added";
  const offerPrice = `${fields.price_qualifier === "starting_from" ? "From " : ""}${format(fields.promotional_price)}`;
  const unit = Object.hasOwn(priceUnits, fields.price_unit)
    ? priceUnits[fields.price_unit as keyof typeof priceUnits]
    : "";
  const previews: [string, string | undefined][] = [
    [
      "Publication window (Sri Lanka time)",
      [fields.publication_starts_at, fields.publication_ends_at]
        .filter(Boolean)
        .map((value) => value.replace("T", " "))
        .join(" to "),
    ],
    [
      "Redemption dates",
      [fields.redemption_starts_on, fields.redemption_ends_on].filter(Boolean).join(" to "),
    ],
    ["Package coverage", fields.package_coverage],
    [
      "Guests and nights",
      [
        fields.adults && `${fields.adults} adults`,
        fields.children && `${fields.children} children`,
        category === "stays" && fields.nights && `${fields.nights} nights`,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    [
      "Child ages",
      Number(fields.children) > 0
        ? [fields.child_age_min, fields.child_age_max].filter(Boolean).join("–")
        : undefined,
    ],
    ["Child policy", Number(fields.children) > 0 ? fields.child_policy : undefined],
    ...[...specificFields, ...conditions.slice(4)].map(
      ({ label, name }) => [label, fields[name]] as [string, string],
    ),
  ];

  return (
    <div className="mt-6">
      <noscript>
        <p>Enable JavaScript to use the offer wizard.</p>
      </noscript>
      <nav aria-label="Offer wizard steps">
        <ol className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {wizardSteps.map((label, index) => (
            <li key={label} className="min-w-0 last:col-span-2">
              <Button
                type="button"
                variant={index === step ? "default" : "outline"}
                className="min-h-11 w-full min-w-0 px-2 text-center sm:w-auto sm:px-4"
                disabled={!ready || pending}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}
              </Button>
            </li>
          ))}
        </ol>
      </nav>
      {state.message && (state.step === undefined || state.step === step) && (
        <p
          ref={errorSummary}
          tabIndex={-1}
          role="alert"
          className="mt-4 rounded-md border border-destructive bg-card p-3 font-medium text-destructive"
        >
          {state.message}
        </p>
      )}
      <fieldset
        disabled={!ready || pending}
        className="mt-5 grid min-w-0 gap-4 rounded-lg border bg-card p-4 sm:p-6"
      >
        <legend ref={heading} tabIndex={-1} className="px-2 text-xl font-semibold">
          Step {step + 1} of 5 · {wizardSteps[step]}
        </legend>
        {step === 0 && (
          <>
            <p>
              Property <strong>{propertyName}</strong>
            </p>
            {renderFields(basics)}
            <p className="text-sm text-muted-foreground">
              Fields without an optional label are required for review. You can save an incomplete
              draft.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            {renderFields(
              pricing.filter(
                ({ name }) =>
                  (name !== "nights" || category === "stays") &&
                  (!["child_age_min", "child_age_max", "child_policy"].includes(name) ||
                    Number(fields.children) > 0),
              ),
            )}
            {discount !== null && (
              <p role="status" className="font-medium text-primary">
                {discount}% discount
              </p>
            )}
            {specificFields.length > 0 && (
              <>
                <h2 className="text-lg font-semibold">Category details</h2>
                {renderFields(specificFields)}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <p className="text-sm text-muted-foreground">
              Publication controls when the offer appears. Redemption controls when guests can use
              it. Publication times use Sri Lanka time.
            </p>
            {renderFields(
              conditions.map((field) =>
                field.name === "tax_details" && fields.taxes_included === "no"
                  ? { ...field, required: true }
                  : field,
              ),
            )}
          </>
        )}
        {step === 3 && (
          <>
            <details className="rounded-lg border p-3">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                Upload an offer photo
              </summary>
              <p className="text-sm text-muted-foreground">
                Ayaale optimizes the photo and saves it to this property’s private library.
              </p>
              <RegistrationPhoto propertyId={propertyId} />
            </details>
            <label className="grid min-w-0 gap-1.5 font-medium">
              Cover photo
              <select
                value={fields.cover ?? ""}
                className={fieldClass}
                onChange={(event) => {
                  setField("cover", event.target.value);
                  setGallery((items) => items.filter((id) => id !== event.target.value));
                }}
              >
                <option value="">Choose a cover photo</option>
                {assets.map(({ id, width, height }, index) => (
                  <option value={id} key={id}>
                    Photo {index + 1} · {width} × {height}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              Add up to 11 extra gallery photos from this property’s private library.
            </p>
            <PhotoLibrary
              propertyId={propertyId}
              assets={eligibleGallery}
              gallery={gallery.map((id) => ({ id, alt: "" }))}
              onAdd={gallery.length < 11 ? (id) => setGallery([...gallery, id]) : undefined}
            />
            {gallery.length > 0 && (
              <ol className="grid gap-2">
                {gallery.map((id, index) => (
                  <li key={id} className="flex flex-wrap items-center gap-2">
                    <span>Gallery photo {index + 1}</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      aria-label={`Remove gallery photo ${index + 1}`}
                      onClick={() => setGallery(gallery.filter((item) => item !== id))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-sm text-muted-foreground">
              Contacts come from the approved property profile.{" "}
              {propertyContact.join(" · ") ||
                "A business phone or WhatsApp number is required for review."}
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <p className="text-sm text-muted-foreground">
              Private preview. Submission sends this offer for manual review.
            </p>
            <section
              aria-label="Offer card preview"
              className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[8rem_1fr]"
            >
              {cover && (
                <PreviewImage
                  key={cover.id}
                  propertyId={propertyId}
                  asset={cover}
                  alt="Proposed offer cover"
                />
              )}
              <div className="min-w-0 break-words">
                <h2 className="text-lg font-semibold">{fields.title || "Offer title"}</h2>
                <p className="text-sm text-muted-foreground">{propertyName}</p>
                <p className="mt-2 font-semibold">
                  {offerPrice} {unit}
                </p>
                {discount !== null && (
                  <p>
                    <s>{format(fields.original_price)}</s> · {discount}% less
                  </p>
                )}
              </div>
            </section>
            <section
              aria-label="Offer detail preview"
              className="grid min-w-0 gap-3 rounded-lg border p-4"
            >
              <h2 className="text-lg font-semibold">Offer detail preview</h2>
              <p className="whitespace-pre-line break-words">
                {fields.short_description || "Short description"}
              </p>
              {lines(fields.inclusions).length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {lines(fields.inclusions).map((item, index) => (
                    <li key={index} className="break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="grid gap-3 sm:grid-cols-2">
                {previews
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="font-medium">{label}</dt>
                      <dd className="whitespace-pre-line break-words text-muted-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
              </dl>
              {gallery.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {gallery.map((id, index) => {
                    const asset = assets.find((item) => item.id === id);
                    return asset ? (
                      <PreviewImage
                        key={id}
                        propertyId={propertyId}
                        asset={asset}
                        alt={`Proposed gallery photo ${index + 1}`}
                      />
                    ) : null;
                  })}
                </div>
              )}
              {propertyContact.length > 0 && (
                <p className="break-words text-sm">
                  Property contacts · {propertyContact.join(" · ")}
                </p>
              )}
            </section>
            {!verified && (
              <p className="text-sm text-muted-foreground">
                This property needs verification before you can submit an offer.
              </p>
            )}
          </>
        )}
      </fieldset>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {step > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={!ready || pending}
            className="min-h-11"
            onClick={() => setStep(step - 1)}
          >
            Back
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!ready || pending}
          className="min-h-11"
          onClick={() => submit("save")}
        >
          {pending ? "Saving…" : "Save draft"}
        </Button>
        {step < 4 ? (
          <Button
            type="button"
            disabled={!ready || pending}
            className={step > 0 ? "col-span-2 min-h-11" : "min-h-11"}
            onClick={() => setStep(step + 1)}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!ready || pending || !verified}
            className="col-span-2 min-h-11"
            onClick={() => submit("submit")}
          >
            Submit for review
          </Button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        Step {step + 1} of 5
      </span>
    </div>
  );
}
