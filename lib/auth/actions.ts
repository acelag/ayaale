"use server";
import { enforceBudget, authAudit } from "@/lib/security/requests";
import { createClient } from "@/lib/supabase/server";
function credentials(form: FormData) {
  const email = form.get("email"),
    password = form.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 12 ||
    password.length > 128
  )
    return null;
  return { email: email.trim(), password };
}
export async function signup(form: FormData) {
  if (form.get("website"))
    return {
      ok: true,
      message: "If signup is available for this address, check your email to continue.",
    };
  const input = credentials(form);
  if (!input)
    return { ok: false, message: "Enter a valid email and a password of 12–128 characters." };
  try {
    await enforceBudget("auth_signup", input.email);
    await authAudit("auth_signup_requested");
  } catch {
    return { ok: false, message: "Please try again later." };
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) throw new Error("Site origin is not configured");
  const client = await createClient();
  const { error } = await client.auth.signUp({
    ...input,
    options: { emailRedirectTo: new URL("/auth/callback", origin).href },
  });
  if (
    error &&
    (error.status === 429 ||
      (error.status ?? 0) >= 500 ||
      error.code === "signup_disabled" ||
      error.code === "email_address_not_authorized")
  )
    return { ok: false, message: "Signup is temporarily unavailable. Please try again later." };
  return {
    ok: true,
    message: "If signup is available for this address, check your email to continue.",
  };
}
export async function signin(form: FormData) {
  const input = credentials(form);
  if (!input)
    return { ok: false, message: "Unable to sign in. Check your details and email confirmation." };
  try {
    await enforceBudget("auth_signin", input.email);
  } catch {
    return { ok: false, message: "Please try again later." };
  }
  const client = await createClient();
  const { data, error } = await client.auth.signInWithPassword(input);
  if (error || !data.user?.email_confirmed_at || data.user.is_anonymous) {
    if (data.session) await client.auth.signOut();
    try {
      await authAudit("auth_signin_failed");
    } catch {
      return { ok: false, message: "Please try again later." };
    }
    return { ok: false, message: "Unable to sign in. Check your details and email confirmation." };
  }
  try {
    await authAudit("auth_signin_succeeded", data.user.id);
  } catch {
    await client.auth.signOut();
    return { ok: false, message: "Please try again later." };
  }
  const { error: profileError } = await client
    .from("profiles")
    .upsert(
      { id: data.user.id, display_name: "Ayaale partner" },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (profileError) {
    await client.auth.signOut();
    return { ok: false, message: "Unable to prepare your profile. Please try again." };
  }
  return { ok: true, message: "Signed in." };
}
export async function signout() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const { error } = await client.auth.signOut();
  if (!error && user) {
    try {
      await authAudit("auth_signout", user.id);
    } catch {
      return { ok: true, auditRecorded: false };
    }
  }
  return { ok: !error };
}
