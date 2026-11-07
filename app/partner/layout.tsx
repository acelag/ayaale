import type { Metadata } from "next";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Compass } from "lucide-react";

export const metadata: Metadata = {
  title: "Ayaale partners",
  robots: { index: false, follow: false },
};

export default function PartnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="border-b bg-background">
        <div className="discovery-shell flex flex-wrap items-center justify-between gap-x-4 py-2">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-bold text-primary">
            <Compass size={24} aria-hidden="true" /> Ayaale
          </Link>
          <div className="flex flex-wrap items-center gap-x-4">
            <Link
              href="/partner"
              className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
            >
              Partner home
            </Link>
            <NotificationBell admin={false} />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="discovery-shell partner-shell py-5 sm:py-12">
        {children}
      </main>
    </>
  );
}
