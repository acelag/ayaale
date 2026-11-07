import Link from "next/link";
import { Bell } from "lucide-react";
import { notificationPath } from "@/lib/notifications/inbox";
import { partnerSession } from "@/lib/partner/session";

export async function NotificationBell({ admin }: { admin: boolean }) {
  const session = await partnerSession();
  if (!session) return null;
  const { data, error } = await session.client.rpc("get_notification_inbox", {
    admin_inbox: admin,
    count_only: true,
  });
  if (!data && !error) return null;
  if (error && admin) return null;
  const unread = (data as { unread: number } | null)?.unread;
  const label = unread === undefined ? "Notifications" : `Notifications, ${unread} unread`;
  return (
    <Link
      href={notificationPath(admin)}
      aria-label={label}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-primary hover:bg-muted"
    >
      <Bell size={18} aria-hidden="true" />
      <span>Notifications</span>
      {typeof unread === "number" && unread > 0 && (
        <span
          aria-hidden="true"
          className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
