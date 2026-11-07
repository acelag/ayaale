import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markNotificationRead } from "@/lib/notifications/actions";
import {
  notificationDestination,
  notificationPage,
  notificationPath,
  type NotificationItem,
} from "@/lib/notifications/inbox";
import { partnerSession } from "@/lib/partner/session";

export type InboxQuery = Promise<{ page?: string; result?: string }>;
const colomboTime = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

export async function NotificationInbox({
  admin,
  searchParams,
}: {
  admin: boolean;
  searchParams: InboxQuery;
}) {
  const session = await partnerSession();
  if (!session) redirect(admin ? "/partner/sign-in?next=admin" : "/partner/sign-in");
  const query = await searchParams;
  const page = notificationPage(query.page);
  const path = notificationPath(admin);
  const { data, error } = await session.client.rpc("get_notification_inbox", {
    admin_inbox: admin,
    page_index: page,
  });
  if (!data && !error) notFound();
  const inbox = data as { unread: number; items: NotificationItem[] } | null;

  return (
    <section className="max-w-4xl">
      <Link
        href={admin ? "/admin" : "/partner"}
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        {admin ? "Admin overview" : "Partner home"}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Notifications</h1>
      {query.result === "read" && (
        <p role="status" className="mt-3">
          Notification marked as read.
        </p>
      )}
      {query.result === "failed" && (
        <p role="alert" className="mt-3">
          We couldn’t update this notification. Refresh and try again.
        </p>
      )}
      {!inbox ? (
        <p role="alert" className="mt-3">
          We couldn’t load notifications. Refresh to try again.
        </p>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">{inbox.unread} unread</p>
          {inbox.items.length ? (
            <ul className="mt-4 divide-y rounded-lg border bg-card px-4">
              {inbox.items.slice(0, 20).map((item) => {
                const destination = notificationDestination(item, admin);
                return (
                  <li key={item.id} className="min-w-0 break-words py-4">
                    <h2 className="font-semibold">{item.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.read ? "Read" : "Unread"} ·{" "}
                      <time dateTime={item.receivedAt}>
                        {colomboTime.format(new Date(item.receivedAt))}
                      </time>
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{item.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                      {destination && (
                        <Link
                          className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                          href={destination.href}
                        >
                          {destination.label}
                        </Link>
                      )}
                      {!item.read && (
                        <form action={markNotificationRead.bind(null, admin, page, item.id)}>
                          <Button
                            type="submit"
                            variant="outline"
                            className="min-h-11"
                            aria-label={`Mark as read: ${item.title}`}
                          >
                            Mark as read
                          </Button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4">No notifications on this page.</p>
          )}
          {(page > 0 || inbox.items.length > 20) && (
            <nav aria-label="Notification pages" className="mt-4 flex flex-wrap gap-4">
              {page > 0 && (
                <Link
                  href={`${path}?page=${page - 1}`}
                  className="inline-flex min-h-11 items-center underline"
                >
                  Previous page
                </Link>
              )}
              {inbox.items.length > 20 && page < 999999 && (
                <Link
                  href={`${path}?page=${page + 1}`}
                  className="inline-flex min-h-11 items-center underline"
                >
                  Next page
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
