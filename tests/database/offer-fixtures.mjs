import { randomUUID } from "node:crypto";

export function createOfferFixtures(db, ids) {
  async function offer(propertyId = ids.property1) {
    const id = randomUUID();
    await db.query("insert into public.offers(id,property_id,slug) values ($1,$2,$3)", [
      id,
      propertyId,
      `synthetic-${id}`,
    ]);
    return id;
  }
  async function revision(offerId, number = 1, category = "stays") {
    const id = randomUUID();
    await db.query(
      `insert into private.offer_revisions(
    id,offer_id,revision_number,created_by,title,short_description,category,promotional_price,
    original_price,price_unit,package_coverage,adults,nights,inclusions,
    publication_starts_at,publication_ends_at,redemption_starts_on,redemption_ends_on,
    terms,taxes_included,cover_photo_path)
    values($1,$2,$3,$4,'Synthetic offer','Synthetic description',$5,150,200,'per_package',
    'Two adults with listed inclusions',2,$6,array['Breakfast','Pool access'],
    now()-interval '1 day',now()+interval '1 day',current_date+30,current_date+60,
    'Subject to disclosed provider conditions',true,'synthetic/cover.webp')`,
      [id, offerId, number, ids.owner, category, category === "stays" ? 1 : null],
    );
    return id;
  }
  async function submit(id) {
    await db.query(
      "update private.offer_revisions set status='pending_review',submitted_by=$2,submitted_at=clock_timestamp() where id=$1",
      [id, ids.owner],
    );
  }
  async function approve(id) {
    await submit(id);
    await db.query(
      "update private.offer_revisions set status='approved',reviewed_by=$2,reviewed_at=clock_timestamp() where id=$1",
      [id, ids.replacement],
    );
  }
  async function publish(id, rev, status = "active") {
    await db.query("update public.offers set approved_revision_id=$2,status=$3 where id=$1", [
      id,
      rev,
      status,
    ]);
  }

  return { offer, revision, submit, approve, publish };
}
