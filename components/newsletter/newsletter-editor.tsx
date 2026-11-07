"use client";

import { useActionState, useState, type FormEvent } from "react";
import { CampaignStatus, type CampaignMetrics } from "./campaign-status";
import { Button } from "@/components/ui/button";
import { useFormReady } from "@/components/partner/use-form-ready";
import {
  findNewsletterOffers,
  saveNewsletter,
  sendNewsletterTest,
} from "@/lib/newsletter/editor-actions";
import {
  newsletterCategories,
  newsletterContent,
  newsletterPrice,
  type NewsletterDraft,
  type NewsletterOffer,
} from "@/lib/newsletter/editor";

const field = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2";
const selectionValue = (offers: NewsletterOffer[]) =>
  JSON.stringify(offers.map(({ id, revisionId }) => ({ id, revisionId })));

export function NewsletterEditor({
  initial,
  candidates,
  origin,
  testId,
  canTest,
  campaignMetrics,
  canSchedule = false,
}: {
  initial: NewsletterDraft;
  candidates: NewsletterOffer[];
  origin: string;
  testId: string;
  canTest: boolean;
  campaignMetrics?: CampaignMetrics;
  canSchedule?: boolean;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [intro, setIntro] = useState(initial.intro);
  const [selected, setSelected] = useState(initial.offers);
  const [results, setResults] = useState(candidates);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState("");
  const [previewWidth, setPreviewWidth] = useState<"mobile" | "desktop">("mobile");
  const [saveState, save, saving] = useActionState(
    saveNewsletter.bind(null, initial.id || null, initial.version),
    { message: "" },
  );
  const [testState, send, sending] = useActionState(
    sendNewsletterTest.bind(null, initial.id, initial.version, testId),
    { message: "" },
  );
  const ready = useFormReady();
  const editable = initial.status === "draft";
  const selection = selectionValue(selected);
  const dirty =
    subject !== initial.subject ||
    intro !== initial.intro ||
    selection !== selectionValue(initial.offers);
  const mixed = new Set(selected.map((item) => item.category)).size >= 2;
  const changed = selected.some((item) => !item.current);
  const preview = newsletterContent(
    { subject: subject || "Untitled newsletter", intro, offers: selected },
    origin,
  );

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchState === "Searching…") return;
    setSearchState("Searching…");
    try {
      const offers = await findNewsletterOffers(query);
      if (!offers) throw new Error("Search unavailable");
      setResults(offers);
      setSearchState(
        offers.length
          ? `${offers.length} matching offers shown.`
          : "No live offers match that search.",
      );
    } catch {
      setSearchState("We couldn’t search offers. Try again.");
    }
  }
  function move(index: number, direction: number) {
    setSelected((old) => {
      const next = [...old];
      const destination = index + direction;
      if (!next[index] || !next[destination]) return old;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  return (
    <>
      {editable && (
        <section
          aria-labelledby="offer-picker"
          className="mt-5 rounded-lg border bg-card p-4 sm:p-5"
        >
          <h2 id="offer-picker" className="text-xl font-semibold">
            Select live offers
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Find offers by title or property. Up to six can be selected.
          </p>
          <form onSubmit={search} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 grow">
              <label htmlFor="newsletter-search" className="font-semibold">
                Search live offers
              </label>
              <input
                id="newsletter-search"
                className={field}
                maxLength={120}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              className="min-h-11"
              disabled={!ready || searchState === "Searching…"}
            >
              Search
            </Button>
          </form>
          {searchState && (
            <p role="status" className="mt-2 text-sm">
              {searchState}
            </p>
          )}
          {results.length ? (
            <ul className="mt-2 max-h-80 divide-y overflow-y-auto">
              {results.map((item) => {
                const added = selected.some((offer) => offer.id === item.id);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 break-words">
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.property} · {newsletterCategories[item.category]} ·{" "}
                        {newsletterPrice(item)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={!ready || added || selected.length >= 6}
                      aria-label={`Add ${item.title}`}
                      onClick={() =>
                        setSelected((old) =>
                          old.length < 6 && !old.some((offer) => offer.id === item.id)
                            ? [...old, item]
                            : old,
                        )
                      }
                    >
                      {added ? "Added" : "Add"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm">No live offers to select.</p>
          )}
        </section>
      )}

      <form action={save} className="mt-5 rounded-lg border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-semibold">Newsletter draft</h2>
        <fieldset disabled={!ready || !editable || saving || sending} className="mt-4 space-y-4">
          <div>
            <label htmlFor="newsletter-subject" className="font-semibold">
              Subject
            </label>
            <input
              id="newsletter-subject"
              name="subject"
              required
              maxLength={200}
              className={field}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="newsletter-intro" className="font-semibold">
              Introduction
            </label>
            <textarea
              id="newsletter-intro"
              name="intro"
              maxLength={4000}
              rows={4}
              className={field}
              value={intro}
              onChange={(event) => setIntro(event.target.value)}
            />
          </div>
          <div>
            <h3 className="font-semibold">Selected offers ({selected.length} of 6)</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the move buttons to set the order. A ready newsletter needs five or six offers
              from at least two categories.
            </p>
            {changed && (
              <p role="alert" className="mt-2 text-sm">
                Remove any expired or changed offer and add its current version before saving.
              </p>
            )}
            {selected.length ? (
              <ol className="mt-2 divide-y">
                {selected.map((item, index) => (
                  <li key={item.id} className="py-3">
                    <p className="break-words font-semibold">
                      {index + 1}. {item.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {newsletterCategories[item.category]} · {newsletterPrice(item)}
                      {!item.current && " · No longer current"}
                    </p>
                    {editable && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={index === 0}
                          aria-label={`Move ${item.title} up`}
                          onClick={() => move(index, -1)}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={index === selected.length - 1}
                          aria-label={`Move ${item.title} down`}
                          onClick={() => move(index, 1)}
                        >
                          Move down
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          aria-label={`Remove ${item.title}`}
                          onClick={() =>
                            setSelected((old) => old.filter((offer) => offer.id !== item.id))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm">No offers selected.</p>
            )}
          </div>
          <input type="hidden" name="selection" value={selection} />
          {editable && (
            <Button type="submit" className="min-h-11" disabled={changed}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
          )}
        </fieldset>
        {saveState.message && (
          <p role="alert" className="mt-3 text-sm">
            {saveState.message}
          </p>
        )}
      </form>

      <section
        aria-labelledby="newsletter-preview"
        className="mt-5 min-w-0 rounded-lg border bg-card p-4 sm:p-5"
      >
        <h2 id="newsletter-preview" className="text-xl font-semibold">
          Preview
        </h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Preview width">
          {(["mobile", "desktop"] as const).map((width) => (
            <Button
              key={width}
              type="button"
              className="min-h-11 capitalize"
              variant={width === previewWidth ? "default" : "outline"}
              aria-pressed={width === previewWidth}
              onClick={() => setPreviewWidth(width)}
            >
              {width === "mobile" ? "Mobile" : "Desktop"}
            </Button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto rounded-md border">
          <iframe
            title={`${previewWidth === "mobile" ? "Mobile" : "Desktop"} newsletter preview`}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={preview.html}
            className={`block h-[32rem] border-0 ${previewWidth === "mobile" ? "w-full max-w-[360px]" : "w-[600px]"}`}
          />
        </div>
      </section>

      {editable && initial.id && (
        <form action={send} className="mt-5 rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="text-xl font-semibold">Test email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Send the saved draft to your verified admin email address.
          </p>
          {!canTest ? (
            <p className="mt-2 text-sm">
              Test email is unavailable until the sender is configured.
            </p>
          ) : dirty ? (
            <p className="mt-2 text-sm">Save your changes before sending a test.</p>
          ) : null}
          <Button
            type="submit"
            variant="outline"
            className="mt-3 min-h-11"
            disabled={
              !ready ||
              !canTest ||
              dirty ||
              sending ||
              saving ||
              changed ||
              selected.length < 5 ||
              !mixed ||
              Boolean(testState.message)
            }
          >
            {sending ? "Sending…" : "Send test to me"}
          </Button>
          {testState.message && (
            <p role="status" className="mt-3 text-sm">
              {testState.message}
            </p>
          )}
        </form>
      )}
      {initial.id && campaignMetrics && (
        <CampaignStatus
          id={initial.id}
          version={initial.version}
          metrics={campaignMetrics}
          enabled={canSchedule}
          dirty={dirty}
        />
      )}
    </>
  );
}
