import type { Metadata } from "next";
import { NewsletterTokenForm } from "@/components/newsletter/newsletter-token-form";

export const metadata: Metadata = {
  title: "Confirm your Ayaale newsletter",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmNewsletterPage() {
  return (
    <main id="main-content" tabIndex={-1} className="discovery-shell py-8 sm:py-14">
      <section className="max-w-xl rounded-lg border bg-card p-5 sm:p-7">
        <h1 className="text-2xl font-semibold">Confirm your weekly Ayaale email</h1>
        <p className="mt-3 text-muted-foreground">
          Get selected Stays, Dining and Day Out offers across Sri Lanka, normally on Fridays. You
          can unsubscribe at any time.
        </p>
        <NewsletterTokenForm action="confirm" />
      </section>
    </main>
  );
}
