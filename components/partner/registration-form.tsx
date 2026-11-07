"use client";

import { startTransition, useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { registerProperty } from "@/lib/partner/actions";
import { districts, propertyCategories, propertyTypes } from "@/lib/partner/registration";
import { useFormReady } from "./use-form-ready";

const field =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const label = "grid gap-1.5 font-medium";

export function RegistrationForm({ registrationId }: { registrationId: string }) {
  const [id] = useState(registrationId);
  const ready = useFormReady();
  const [state, action, pending] = useActionState(registerProperty.bind(null, id), {
    ok: false,
    message: "",
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const bindField = (name: string) => ({
    name,
    value: values[name] ?? "",
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [name]: value }));
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(form));
  }

  return (
    <form action={action} onSubmit={submit} className="mt-6">
      <noscript>
        <p className="mb-4">Enable JavaScript to submit a registration.</p>
      </noscript>
      <fieldset disabled={!ready || pending} className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Property name
          <input {...bindField("name")} required minLength={2} maxLength={160} className={field} />
        </label>
        <label className={label}>
          Contact person
          <input
            {...bindField("contact_name")}
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            className={field}
          />
        </label>
        <label className={label}>
          Primary category
          <select {...bindField("primary_category")} required className={field}>
            <option value="">Choose a category</option>
            {Object.entries(propertyCategories).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Property type
          <select {...bindField("property_type")} required className={field}>
            <option value="">Choose a property type</option>
            {Object.entries(propertyTypes).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          Street address
          <textarea
            {...bindField("address")}
            required
            minLength={5}
            maxLength={500}
            rows={2}
            autoComplete="street-address"
            className={field}
          />
        </label>
        <label className={label}>
          District
          <select {...bindField("district")} required className={field}>
            <option value="">Choose a district</option>
            {districts.map((district) => (
              <option key={district}>{district}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Google Maps link (optional)
          <input {...bindField("google_maps_url")} type="url" maxLength={2048} className={field} />
        </label>
        <p id="business-contact-help" className="text-sm text-muted-foreground sm:col-span-2">
          Enter at least one business contact number in international format, such as +94771234567.
          Business numbers can appear on your verified listing. Ayaale keeps the contact person’s
          name private.
        </p>
        <label className={label}>
          Business phone
          <input
            {...bindField("public_phone")}
            type="tel"
            maxLength={16}
            aria-describedby="business-contact-help"
            className={field}
          />
        </label>
        <label className={label}>
          Business WhatsApp
          <input
            {...bindField("public_whatsapp")}
            type="tel"
            maxLength={16}
            aria-describedby="business-contact-help"
            className={field}
          />
        </label>
        <label className={label}>
          Website (optional)
          <input {...bindField("website_url")} type="url" maxLength={2048} className={field} />
        </label>
        {state.message && (
          <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">
            {state.message}
          </p>
        )}
        <Button
          type="submit"
          name="intent"
          value="register"
          className="min-h-11 sm:justify-self-start sm:col-span-2"
        >
          {pending ? "Submitting…" : "Submit for review"}
        </Button>
        {state.offerClaim && (
          <div className="grid gap-2 rounded-lg border p-3 sm:col-span-2">
            <label className={label}>
              Explain your authority to represent the property
              <textarea
                {...bindField("claim_message")}
                maxLength={2000}
                rows={3}
                className={field}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Ayaale reviews this privately. Describe how we can verify your authority. Leave out
              identity numbers and passwords.
            </p>
            <Button
              type="submit"
              name="intent"
              value="claim"
              variant="outline"
              className="sm:justify-self-start"
            >
              Submit ownership claim
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
