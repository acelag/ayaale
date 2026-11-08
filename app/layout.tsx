import type { Metadata, Viewport } from "next";
import { CANONICAL_ORIGIN, verificationCode } from "@/lib/seo/policy.mjs";
import "./globals.css";
import { cookies } from "next/headers";
import { cookieName, validPreview, gateEnabled } from "@/lib/prelaunch/access.mjs";
import { localDemoEnabled } from "@/lib/local-demo";
import { PrivacyAnalytics } from "@/components/analytics/privacy-analytics";

export const metadata: Metadata = {
  title: { default: "Ayaale — Sri Lanka offers", template: "%s | Ayaale" },
  description: "Discover Sri Lankan offers for stays, dining and day outs.",
  metadataBase: new URL(CANONICAL_ORIGIN),
  verification: { google: verificationCode(process.env) },
  // Only eligible public pages override this default, behind the launch switch.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#fafaf7" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preview = gateEnabled(process.env);
  const unlocked =
    preview && validPreview((await cookies()).get(cookieName(process.env))?.value, process.env);
  return (
    <html lang="en">
      {/* Extensions such as Grammarly add body attributes before hydration.
          Suppress only this element's mismatch; descendants remain checked. */}
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {unlocked && (
          <aside
            aria-label="Private preview"
            className="flex flex-wrap items-center justify-center gap-4 border-b bg-muted px-4 py-2 text-sm"
          >
            <span>Private preview — the public sees Coming soon.</span>
            <form action="/preview-access/lock" method="post">
              <button
                className="min-h-11 font-semibold text-primary underline underline-offset-4"
                type="submit"
              >
                Leave preview
              </button>
            </form>
          </aside>
        )}
        {localDemoEnabled() && (
          <aside
            aria-label="Practice site"
            className="border-b bg-muted px-4 py-3 text-center text-sm"
          >
            <strong>Local practice site — sample data only.</strong> Email and payments are off.
            Offer contact buttons simulate clicks without opening calls or WhatsApp.
          </aside>
        )}
        {children}
        {!gateEnabled(process.env) && <PrivacyAnalytics />}
      </body>
    </html>
  );
}
