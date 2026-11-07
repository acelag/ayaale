"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendWithResend } from "@/lib/email/transactional.mjs";
import { photoStorage } from "@/lib/media/storage";
import {
  newsletterContent,
  newsletterEditorPath,
  type NewsletterDraft,
  type NewsletterOffer,
} from "./editor";
import { newsletterTestConfig } from "./editor-config";
import { isPropertyId } from "@/lib/partner/registration";
import { partnerSession } from "@/lib/partner/session";

export type NewsletterFeedback = { message: string };
const feedback: Record<string, string> = {
  invalid: "Check the subject, introduction, and offer selection.",
  stale: "Someone updated this draft. Reload it before continuing.",
  offers_changed:
    "An offer has expired, changed revision, or is no longer live. Remove it and select a current offer.",
  incomplete: "Save five or six live offers from at least two categories before sending a test.",
  unavailable: "This newsletter is no longer an editable draft.",
  forbidden: "Platform administrator access is required.",
  limited: "You’ve reached the hourly test email limit. Try again later.",
  duplicate: "This test was already requested. Reload the draft to request another.",
};
const fallback = { message: "We couldn’t complete this request. Please try again." };

export async function findNewsletterOffers(query: string): Promise<NewsletterOffer[] | null> {
  if (!(await headers()).get("origin") || typeof query !== "string" || query.length > 120)
    return null;
  const session = await partnerSession();
  if (!session) return null;
  const { data, error } = await session.client.rpc("search_admin_newsletter_offers", {
    search_text: query.trim(),
  });
  return error || !data ? null : (data as NewsletterOffer[]);
}

export async function saveNewsletter(
  id: string | null,
  version: string,
  _state: NewsletterFeedback,
  form: FormData,
): Promise<NewsletterFeedback> {
  if (
    !(await headers()).get("origin") ||
    (id !== null && !isPropertyId(id)) ||
    typeof version !== "string" ||
    version.length > 40
  )
    return fallback;
  const subject = form.get("subject");
  const intro = form.get("intro");
  const raw = form.get("selection");
  if (
    typeof subject !== "string" ||
    !subject.trim() ||
    subject.length > 200 ||
    /[\r\n\0]/.test(subject) ||
    typeof intro !== "string" ||
    intro.length > 4000 ||
    intro.includes("\0") ||
    typeof raw !== "string" ||
    raw.length > 1500
  )
    return { message: feedback.invalid };
  let selection: { id: string; revisionId: string }[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length > 6 ||
      parsed.some((item) => !item || !isPropertyId(item.id) || !isPropertyId(item.revisionId))
    )
      return { message: feedback.invalid };
    selection = parsed;
  } catch {
    return { message: feedback.invalid };
  }
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data, error } = await session.client.rpc("save_admin_newsletter", {
    campaign_id: id,
    expected_version: version,
    newsletter_subject: subject.trim(),
    newsletter_intro: intro,
    offer_ids: selection.map((item) => item.id),
    revision_ids: selection.map((item) => item.revisionId),
  });
  if (error || !data) return fallback;
  const result = data as { status: string; id?: string };
  if (result.status === "saved" && isPropertyId(result.id)) {
    revalidatePath(newsletterEditorPath);
    redirect(`${newsletterEditorPath}/${result.id}?saved=1`);
  }
  return { message: feedback[result.status] ?? fallback.message };
}

export async function sendNewsletterTest(
  id: string,
  version: string,
  testId: string,
  state: NewsletterFeedback,
): Promise<NewsletterFeedback> {
  if (state.message) return state;
  if (
    !(await headers()).get("origin") ||
    !isPropertyId(id) ||
    !isPropertyId(testId) ||
    typeof version !== "string" ||
    version.length > 40
  )
    return fallback;
  const session = await partnerSession();
  if (!session) redirect("/partner/sign-in?next=admin");
  const { data: admin, error: accessError } = await session.client.rpc("has_platform_admin_access");
  if (!admin || accessError) return { message: feedback.forbidden };
  const config = newsletterTestConfig();
  const service = photoStorage();
  if (!config || !service)
    return { message: "Test email is unavailable until the sender is configured." };
  const { data, error } = await session.client.rpc("prepare_admin_newsletter_test", {
    campaign_id: id,
    expected_version: version,
    test_id: testId,
  });
  if (error || !data) return fallback;
  const result = data as { status: string; recipient?: string; draft?: NewsletterDraft };
  if (result.status !== "ready" || !result.draft || !result.recipient)
    return { message: feedback[result.status] ?? fallback.message };

  let outcome: "accepted" | "unknown" | "failed" = "unknown";
  let providerId: string | null = null;
  try {
    const email = await sendWithResend({
      apiKey: config.apiKey,
      key: `ayaale/newsletter-test/${testId}`,
      body: JSON.stringify({
        from: config.from,
        to: [result.recipient],
        subject: `[Test] ${result.draft.subject}`,
        ...newsletterContent(result.draft, config.origin, true),
      }),
    });
    outcome =
      email.outcome === "sent" ? "accepted" : email.outcome === "failed" ? "failed" : "unknown";
    providerId = email.provider_id;
  } catch {
    // Do not retry automatically after an uncertain provider response.
  }
  const logged = await service.rpc("finish_admin_newsletter_test", {
    test_id: testId,
    outcome,
    provider_message: providerId,
  });
  if (logged.error || !logged.data)
    return {
      message: "We couldn’t record the test result. Check your inbox before requesting another.",
    };
  return {
    message:
      outcome === "accepted"
        ? "The provider accepted a test email to your verified admin address."
        : outcome === "failed"
          ? "The provider rejected the test email. Check the sender configuration."
          : "The test result is uncertain. Check your inbox before requesting another.",
  };
}
