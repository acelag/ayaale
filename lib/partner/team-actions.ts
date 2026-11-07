"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPropertyId } from "./registration";
import { requirePartnerSession } from "./session";

type Result = { message: string; link?: string; saved?: boolean };
const unavailable = { message: "We couldn’t complete this action. Please try again." };

export async function createStaffInvite(
  propertyId: string,
  _previous: Result,
  form: FormData,
): Promise<Result> {
  if (!(await headers()).get("origin") || !isPropertyId(propertyId) || !(form instanceof FormData))
    return unavailable;
  const address = form.get("email");
  if (
    typeof address !== "string" ||
    address.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim())
  ) {
    return { message: "Enter a valid email address." };
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) return unavailable;
  const { client } = await requirePartnerSession();
  const token = randomBytes(32).toString("hex");
  const { data, error } = await client.rpc("create_property_staff_invite", {
    target_property: propertyId,
    invited_email: address.trim().toLowerCase(),
    token_digest: createHash("sha256").update(token).digest("hex"),
  });
  if (error) return unavailable;
  switch (data) {
    case "created":
      revalidatePath(`/partner/properties/${propertyId}/team`);
      return {
        saved: true,
        message: "Invitation created. Copy the link and share it with the invitee.",
        link: new URL(`/partner/invite#${token}`, origin).href,
      };
    case "member":
      return { message: "That address already belongs to this property’s team." };
    case "pending":
      return {
        message:
          "An invitation is already pending for that address. Revoke it to create a new link.",
      };
    case "full":
      return { message: "Both staff slots are in use or reserved by pending invitations." };
    case "limited":
      return { message: "Too many invitations were created recently. Try again later." };
    case "forbidden":
      return { message: "Only the property owner can invite staff." };
    default:
      return unavailable;
  }
}

export async function changeStaffEntry(
  propertyId: string,
  entryId: string,
  operation: "revoke" | "remove",
): Promise<Result> {
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(propertyId) ||
    !isPropertyId(entryId) ||
    (operation !== "revoke" && operation !== "remove")
  )
    return unavailable;
  const { client } = await requirePartnerSession();
  const { data, error } = await client.rpc("manage_property_staff", {
    target_property: propertyId,
    entry_id: entryId,
    operation,
  });
  if (error || data !== "saved") return unavailable;
  revalidatePath(`/partner/properties/${propertyId}/team`);
  return {
    message: operation === "revoke" ? "Invitation revoked." : "Staff access removed.",
    saved: true,
  };
}

export async function acceptStaffInvite(_previous: Result, form: FormData): Promise<Result> {
  if (!(await headers()).get("origin") || !(form instanceof FormData)) return unavailable;
  const token = form.get("token");
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
    return { message: "Open the complete invitation link provided by the property owner." };
  }
  const { client } = await requirePartnerSession();
  const { data, error } = await client.rpc("accept_property_staff_invite", { invite_token: token });
  if (error) return unavailable;
  if (isPropertyId(data)) redirect(`/partner/properties/${data}`);
  if (data === "full")
    return { message: "This property’s staff slots are full. Contact the property owner." };
  return {
    message:
      "This invitation is unavailable for your account. Check that you signed in with the invited email and ask the owner for a fresh link if needed.",
  };
}
