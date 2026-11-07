import { randomUUID } from "node:crypto";
import { RegistrationForm } from "@/components/partner/registration-form";
import { requirePartnerSession } from "@/lib/partner/session";

export default async function RegisterPropertyPage() {
  await requirePartnerSession();
  return (
    <section className="max-w-2xl rounded-lg border bg-card p-5 sm:p-7">
      <h1 className="text-2xl font-semibold sm:text-3xl">Register a property</h1>
      <p className="mt-3 text-muted-foreground">
        Ayaale checks business details and authorization before listing a property. You can add
        private photos after you submit.
      </p>
      <RegistrationForm registrationId={randomUUID()} />
    </section>
  );
}
