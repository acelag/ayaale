import type { NewsletterDraft, NewsletterOffer } from "./editor";
export const newsletterCategories: Record<NewsletterOffer["category"], string>;
export function newsletterPrice(offer: NewsletterOffer): string;
export function newsletterContent(
  draft: Pick<NewsletterDraft, "subject" | "intro" | "offers">,
  origin: string,
  test?: boolean,
  links?: Record<string, string>,
  footer?: string,
  unsubscribeUrl?: string,
  privacyUrl?: string,
): { text: string; html: string };
