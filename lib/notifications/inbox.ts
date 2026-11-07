import { isPropertyId } from "@/lib/partner/registration";

export const notificationPath = (admin: boolean) =>
  admin ? "/admin/notifications" : "/partner/notifications";
export const notificationPage = (page: unknown) =>
  typeof page === "string" && /^\d{1,6}$/.test(page) ? Number(page) : 0;

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  propertyId: string | null;
  reportId: string | null;
  receivedAt: string;
  read: boolean;
};

export function notificationDestination(item: NotificationItem, admin: boolean) {
  if (admin) {
    if (isPropertyId(item.reportId))
      return { href: `/admin/reports/${item.reportId}`, label: "Review complaint" };
    if (item.kind === "registration")
      return {
        href: isPropertyId(item.propertyId)
          ? `/admin/verifications/${item.propertyId}`
          : "/admin/verifications",
        label: "Review registration",
      };
    return null;
  }
  if (!isPropertyId(item.propertyId)) return null;
  const path = `/partner/properties/${item.propertyId}`;
  if (item.kind === "offer_review" || item.kind === "offer_expiry")
    return { href: `${path}/offers`, label: "View offers" };
  if (item.kind === "trial_reminder")
    return { href: `${path}/subscription`, label: "View trial status" };
  if (item.kind === "performance_summary")
    return { href: `${path}/analytics`, label: "View analytics" };
  return { href: path, label: "View property" };
}
