import { NotificationInbox, type InboxQuery } from "@/components/notifications/notification-inbox";

export default function AdminNotificationsPage({ searchParams }: { searchParams: InboxQuery }) {
  return <NotificationInbox admin searchParams={searchParams} />;
}
