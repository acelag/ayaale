"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { notificationPage, notificationPath } from "@/lib/notifications/inbox";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

export async function markNotificationRead(admin: boolean, page: number, id: string) {
  const path = notificationPath(admin);
  const pageIndex = notificationPage(String(page));
  const session = await partnerSession();
  if (!session) redirect(admin ? "/partner/sign-in?next=admin" : "/partner/sign-in");
  if (!(await headers()).get("origin") || !isPropertyId(id))
    redirect(`${path}?page=${pageIndex}&result=failed`);
  const { data, error } = await session.client.rpc("mark_notification_read", {
    notification_id: id,
    admin_inbox: admin,
  });
  if (error || !data) redirect(`${path}?page=${pageIndex}&result=failed`);
  revalidatePath(admin ? "/admin" : "/partner", "layout");
  redirect(`${path}?page=${pageIndex}&result=read`);
}
