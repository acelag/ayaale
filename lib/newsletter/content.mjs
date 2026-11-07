const number = new Intl.NumberFormat("en-LK");
export const newsletterCategories = { stays: "Stays", dining: "Dining", day_outs: "Day Outs" };
export function newsletterPrice(offer) {
  return `${offer.startingFrom ? "From " : ""}LKR ${number.format(offer.price)} · ${offer.unit.replaceAll("_", " ")}`;
}
function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

export function newsletterContent(
  draft,
  origin,
  test = false,
  links = {},
  footer = "",
  unsubscribeUrl = "",
  privacyUrl = "",
) {
  const offerUrl = (offer) =>
    links[offer.id] ?? new URL(`/offers/${encodeURIComponent(offer.slug)}`, origin).href;
  const text = [
    ...(test ? ["AYAALE TEST PREVIEW"] : []),
    draft.subject,
    draft.intro,
    ...draft.offers.map((offer) =>
      [
        offer.title,
        `${offer.property} · ${newsletterCategories[offer.category]}`,
        newsletterPrice(offer),
        offer.summary,
        offerUrl(offer),
      ].join("\n"),
    ),
    "Offers can change. Check the current listing before making arrangements.",
    footer,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(draft.subject)}</title></head>
<body style="margin:0;background:#fafaf7;color:#142e28;font:16px/1.55 Arial,sans-serif;overflow-wrap:anywhere">
<main style="max-width:600px;margin:auto;padding:24px;box-sizing:border-box">
<p style="font-weight:bold">Ayaale</p>
${test ? '<p style="font-weight:bold">Test preview</p>' : ""}
<h1 style="font-size:26px;line-height:1.2">${escapeHtml(draft.subject)}</h1>
<p style="white-space:pre-wrap">${escapeHtml(draft.intro)}</p>
${draft.offers
  .map(
    (offer) => `<section style="border-top:1px solid #aab6ac;padding:16px 0">
<h2 style="font-size:20px;margin:0">${escapeHtml(offer.title)}</h2>
<p>${escapeHtml(offer.property)} · ${escapeHtml(newsletterCategories[offer.category])}<br>
<strong>${escapeHtml(newsletterPrice(offer))}</strong></p>
<p>${escapeHtml(offer.summary)}</p>
<p><a style="color:#174e40" href="${escapeHtml(offerUrl(offer))}">View ${escapeHtml(offer.title)}</a></p></section>`,
  )
  .join("")}
<p style="font-size:14px">Offers can change. Check the current listing before making arrangements.</p>
<p style="font-size:14px;white-space:pre-wrap">${escapeHtml(footer)}</p>
${unsubscribeUrl ? `<p><a style="color:#174e40" href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a> · <a style="color:#174e40" href="${escapeHtml(privacyUrl)}">Privacy Policy</a></p>` : ""}
</main></body></html>`;
  return { text, html };
}
