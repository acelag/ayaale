import { NotificationInbox, type InboxQuery } from "@/components/notifications/notification-inbox";

export default function PartnerNotificationsPage({ searchParams }: { searchParams: InboxQuery }) {
  return <NotificationInbox admin={false} searchParams={searchParams} />;
}
