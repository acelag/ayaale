import type { Metadata } from "next";
import { cache } from "react";
import { StructuredData } from "@/components/seo/structured-data";
import { discoveryVariant, websiteData } from "@/lib/seo/policy.mjs";
import { publicMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Compass, Leaf } from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery/header";
import { CategoryNavigation } from "@/components/discovery/categories";
import { FilterControls } from "@/components/discovery/filter-controls";
import { filterError, filterFields, sorts } from "@/lib/discovery/filters";
import { FeedList } from "@/components/discovery/feed-list";
import { discoveryParams, loadDiscoveryPage, type DiscoveryPage } from "@/lib/discovery/feed";
import { Button } from "@/components/ui/button";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";
import { newsletterSignupConfig } from "@/lib/newsletter/server";
import { categories, discoveryHref } from "@/lib/discovery/model";
type HomeProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const homeData = cache(async (serialized: string) => {
  const params = JSON.parse(serialized);
  const result = discoveryParams(params);
  let page: DiscoveryPage | null = null;
  const invalid = filterError(result.filters);
  try {
    if (!invalid)
      page = await loadDiscoveryPage(result.category, result.query, result.cursor, result.filters);
  } catch {
    /* An outage must not produce an indexable error page. */
  }
  return { ...result, invalid, page };
});
export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const params = await searchParams;
  const { page } = await homeData(JSON.stringify(params));
  return publicMetadata(
    "/",
    "Sri Lanka stays, dining and day out offers",
    "Discover Sri Lankan offers for stays, dining and day outs. Explore offers from verified properties and contact them directly.",
    Boolean(page) && !discoveryVariant(params),
  );
}
export default async function Home({ searchParams }: HomeProps) {
  const newsletter = newsletterSignupConfig();
  const { category, query, cursor, filters, invalid, page } = await homeData(
    JSON.stringify(await searchParams),
  );
  const hasFilters = filterFields.some((field) => filters[field]);
  const sortLabel = sorts.find((sort) => sort.id === (filters.sort ?? "newest"))?.label;
  return (
    <>
      {page && <StructuredData data={websiteData()} />}
      <DiscoveryHeader query={query} category={category} filters={filters} />
      <main id="main-content" tabIndex={-1}>
        <section className="discovery-shell welcome-section" aria-labelledby="welcome-title">
          <div>
            <p className="eyebrow">
              <span className="inline-block size-1.5 rounded-full bg-primary" /> A little discovery
              goes a long way
            </p>
            <h1
              id="welcome-title"
              className="mt-5 max-w-[660px] text-3xl leading-[1.12] font-semibold tracking-[-0.045em] sm:text-[44px]"
            >
              A little more to
              <br className="hidden sm:block" /> look forward to.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              Good stays, memorable meals and days well spent.
              <br className="hidden sm:block" /> Discover a little more of Sri Lanka.
            </p>
            <a
              href="#offers"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"
            >
              Explore offers
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="welcome-aside">
            <Leaf size={28} strokeWidth={1.3} aria-hidden="true" />
            <p className="mt-5 text-xl leading-snug font-medium">
              Closer to your
              <br />
              next good moment.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Stays · Dining · Day Outs</p>
            <span className="welcome-orbit" aria-hidden="true" />
          </div>
        </section>
        <div className="discovery-shell">
          <CategoryNavigation selected={category} query={query} filters={filters} />
        </div>
        <section
          id="offers"
          aria-labelledby="offers-heading"
          className="discovery-shell scroll-mt-44 pb-12 pt-7"
        >
          <div className="mb-5 mt-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="offers-heading" className="text-xl font-semibold tracking-tight">
                {query
                  ? `Offers matching “${query}”`
                  : category === "all"
                    ? "Find your next little escape"
                    : `${categories.find((c) => c.id === category)?.label} to look forward to`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {category === "all" && !filters.destination ? "Across Sri Lanka · " : ""}
                {sortLabel}
              </p>
            </div>
            {(query || category !== "all") && (
              <a
                href={discoveryHref("all", "", undefined, filters)}
                className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
              >
                Clear search and category
              </a>
            )}
          </div>
          <FilterControls
            key={JSON.stringify([category, query, filters])}
            category={category}
            query={query}
            filters={filters}
            total={page?.total ?? null}
          />
          {invalid ? (
            <p role="alert" className="text-destructive">
              {invalid}
            </p>
          ) : !page ? (
            <div className="empty-offers">
              <h3 className="text-lg font-semibold">Offers are unavailable right now</h3>
              <p className="mt-2 text-muted-foreground">Please try again in a moment.</p>
              <Button asChild variant="outline" className="mt-5">
                <a href={discoveryHref(category, query, undefined, filters)}>Try again</a>
              </Button>
            </div>
          ) : page.offers.length > 0 ? (
            <>
              <FeedList
                key={JSON.stringify([category, query, cursor, filters])}
                initial={page}
                category={category}
                query={query}
                filters={filters}
              />
              <p className="mt-6 text-sm text-muted-foreground">
                Verified by Ayaale means basic identity and authorization were checked. It does not
                guarantee quality or availability.
              </p>
            </>
          ) : (
            <div className="empty-offers">
              <Compass size={30} aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">
                {query || category !== "all" || hasFilters
                  ? "No offers match this search"
                  : "No offers available yet"}
              </h3>
              <p className="mt-2 text-muted-foreground">
                {query || category !== "all" || hasFilters
                  ? "Try a different search or category."
                  : "Check back for approved stays, dining and day outs."}
              </p>
              {(query || category !== "all" || cursor || hasFilters) && (
                <Button asChild variant="outline" className="mt-5">
                  <a href={discoveryHref("all")}>See all offers</a>
                </Button>
              )}
            </div>
          )}
        </section>
        <section id="for-properties" className="border-y bg-secondary scroll-mt-40">
          <div className="discovery-shell property-section">
            <div>
              <p className="eyebrow">For stays, restaurants & day out venues</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Something good to share?
              </h2>
              <p className="mt-3 max-w-lg text-muted-foreground">
                Register your property for review so visitors can discover your offers and connect
                with you directly.
              </p>
            </div>
            <a
              href="/partner/signup"
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"
            >
              Create a partner account
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section
          id="newsletter"
          className="discovery-shell scroll-mt-40 py-10"
          aria-labelledby="newsletter-heading"
        >
          <h2 id="newsletter-heading" className="text-2xl font-semibold">
            Discover Sri Lanka’s Best Deals Every Week
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            A free Friday email with selected Stays, Dining and Day Out offers across Sri Lanka. No
            customer account needed.
          </p>
          {newsletter ? (
            <NewsletterSignup privacyUrl={newsletter.privacyUrl} />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Newsletter signup isn’t open yet.</p>
          )}
        </section>
        <section id="about-ayaale" className="discovery-shell scroll-mt-40 py-10">
          <h2 className="text-lg font-semibold">Discover, then connect.</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Browse without a customer account. Contact providers directly once contact details are
            available. Ayaale does not take bookings.
          </p>
        </section>
      </main>
      <footer className="border-t">
        <div className="discovery-shell flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-muted-foreground">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center font-semibold text-foreground"
          >
            ayaale.
          </Link>
          <p>Made for discovering Sri Lanka.</p>
          <span className="text-xs">Development preview</span>
        </div>
      </footer>
    </>
  );
}
