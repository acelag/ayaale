import type { Metadata, Viewport } from "next";
import { CANONICAL_ORIGIN, verificationCode } from "@/lib/seo/policy.mjs";
import "./globals.css";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Extensions such as Grammarly add body attributes before hydration.
          Suppress only this element's mismatch; descendants remain checked. */}
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
        <PrivacyAnalytics />
      </body>
    </html>
  );
}
