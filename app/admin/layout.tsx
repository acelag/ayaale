import type { Metadata } from "next";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/notification-bell";

export const metadata: Metadata = {
  title: "Ayaale administration",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="border-b bg-background">
        <div className="discovery-shell flex flex-wrap items-center justify-between gap-x-4 py-2">
          <Link href="/admin" className="inline-flex min-h-11 items-center font-bold text-primary">
            Ayaale administration
          </Link>
          <div className="flex flex-wrap items-center gap-x-4">
            <Link
              href="/partner"
              className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
            >
              Partner home
            </Link>
            <NotificationBell admin={true} />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="discovery-shell py-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
