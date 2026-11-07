import type { Metadata } from "next";
import { NewsletterTokenForm } from "@/components/newsletter/newsletter-token-form";

export const metadata: Metadata = {
  title: "Unsubscribe from the Ayaale newsletter",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function UnsubscribeNewsletterPage() {
  return (
    <main id="main-content" tabIndex={-1} className="discovery-shell py-8 sm:py-14">
      <section className="max-w-xl rounded-lg border bg-card p-5 sm:p-7">
        <h1 className="text-2xl font-semibold">Unsubscribe from the Ayaale newsletter</h1>
        <p className="mt-3 text-muted-foreground">
          Stop future weekly newsletter emails. No sign-in is needed.
        </p>
        <NewsletterTokenForm action="unsubscribe" />
      </section>
    </main>
  );
}
