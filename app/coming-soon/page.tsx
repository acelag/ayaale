import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { accessCode, gateEnabled } from "@/lib/prelaunch/access.mjs";

export const metadata: Metadata = {
  title: "Coming soon | Ayaale",
  description: "A little more to look forward to. Ayaale is coming soon.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!gateEnabled(process.env)) redirect("/");
  const { error } = await searchParams;
  const message =
    error === "limited"
      ? "Too many attempts. Wait a minute before trying again."
      : error === "invalid"
        ? "The access code wasn’t accepted. Please try again."
        : "";
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-svh flex-col bg-background px-6 py-8 text-foreground sm:px-12"
    >
      <section
        aria-labelledby="coming-soon-heading"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-16"
      >
        <div className="mb-8 text-2xl font-bold tracking-tight text-primary" aria-label="Ayaale">
          ayaale<span aria-hidden="true">.</span>
        </div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Something good is on its way
        </p>
        <h1
          id="coming-soon-heading"
          className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl"
        >
          A little more to
          <br />
          look forward to.
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Good stays, memorable meals and days well spent. We’re getting Ayaale ready to help you
          discover a little more of Sri Lanka.
        </p>
        <p className="mt-7 text-lg font-semibold text-primary">Coming soon</p>
        <p className="mt-2 text-sm text-muted-foreground">Stays · Dining · Day Outs</p>
      </section>
      <details className="mx-auto w-full max-w-3xl border-t pt-5" open={Boolean(message)}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary">
          Private preview access
        </summary>
        {accessCode(process.env) ? (
          <form action="/preview-access" method="post" className="mt-4 max-w-sm space-y-3">
            <label htmlFor="preview-code" className="block text-sm font-medium">
              Access code
            </label>
            <input
              id="preview-code"
              name="accessCode"
              type="password"
              autoComplete="off"
              required
              minLength={12}
              maxLength={128}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3"
              aria-describedby={message ? "preview-error" : undefined}
            />
            {message && (
              <p id="preview-error" role="alert" className="text-sm">
                {message}
              </p>
            )}
            <button
              type="submit"
              className="min-h-11 rounded-md bg-primary px-5 py-2 font-semibold text-primary-foreground"
            >
              Enter preview
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Private preview isn’t available yet.</p>
        )}
      </details>
    </main>
  );
}
