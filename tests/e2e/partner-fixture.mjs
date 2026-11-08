// Loopback authentication and data-provider fixture for browser tests only.
import { createHash, randomUUID } from "node:crypto";

const accounts = new Map();
const tokens = new Map();
const properties = new Map();
const photos = new Map();
const editors = new Map();
const staffInvites = new Map();
const offerDrafts = new Map();
const managedOffers = new Map();
const verificationReviews = new Map();
const offerReviews = new Map();
const reportQueues = new Map();
const readNotifications = new Set();
const newsletterDrafts = new Map();
const ownershipClaims = new Map();
const claimTargets = new Map();
const managedOfferId = "40000000-0000-4000-8000-000000000001";

function fixtureOffer(key) {
  if (!managedOffers.has(key)) {
    managedOffers.set(key, {
      id: managedOfferId,
      kind: "offer",
      title: "Fixture managed stay",
      category: "stays",
      status: "active",
      reviewStatus: "approved",
      hasRevision: true,
      wasPublished: true,
      slug: "fixture-coast-1",
      updatedAt: new Date().toISOString(),
      version: "1",
    });
  }
  return managedOffers.get(key);
}

function managedFlags(row) {
  return {
    ...row,
    canPause: row.status === "active",
    canResume: row.status === "paused",
    canEnd: row.status === "active" || row.status === "paused",
    ...(row.status === "ended" ? { history: { views: 3, clicks: 1 } } : {}),
  };
}

const editorProperty = "10000000-0000-4000-8000-000000000001";
const fixturePhotos = [
  { id: "20000000-0000-4000-8000-000000000001", width: 320, height: 240 },
  { id: "20000000-0000-4000-8000-000000000002", width: 480, height: 320 },
];

const ownerId = randomUUID();
const adminId = randomUUID();
const staffId = randomUUID();
const otherOwnerId = randomUUID();
const zero = { views: 0, whatsapp: 0, calls: 0 };
for (const [id, email] of [
  [ownerId, "fixture-owner@example.invalid"],
  [adminId, "fixture-admin@example.invalid"],
  [staffId, "fixture-staff@example.invalid"],
]) {
  accounts.set(email, {
    user: { id, email, aud: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z" },
  });
}
for (const [id, name, owner, staff, totals] of [
  [
    "10000000-0000-4000-8000-000000000001",
    "Fixture Coast",
    ownerId,
    staffId,
    {
      published: 5,
      active: 2,
      current: { views: 15, whatsapp: 3, calls: 1 },
      previous: { views: 8, whatsapp: 1, calls: 0 },
    },
  ],
  [
    "10000000-0000-4000-8000-000000000002",
    "Fixture Hills",
    ownerId,
    null,
    {
      published: 2,
      active: 1,
      current: { views: 6, whatsapp: 1, calls: 2 },
      previous: { views: 4, whatsapp: 2, calls: 1 },
    },
  ],
  ["10000000-0000-4000-8000-000000000003", "Fixture Staff Venue", otherOwnerId, ownerId, null],
  ["10000000-0000-4000-8000-000000000004", "Fixture Unassigned", otherOwnerId, null, null],
]) {
  properties.set(id, {
    owner,
    staff,
    totals,
    row: { id, name, district: "Galle", archived_at: null, verification_status: "verified" },
  });
}

for (const [suffix, index] of [
  ["desktop", 11],
  ["mobile", 12],
]) {
  const id = randomUUID();
  const email = `fixture-claimant-${suffix}@example.invalid`;
  accounts.set(email, {
    user: { id, email, aud: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z" },
  });
  const propertyId = `10000000-0000-4000-8000-0000000000${index}`;
  const name = `Fixture claim hotel ${suffix}`;
  claimTargets.set(name, propertyId);
  properties.set(propertyId, {
    owner: otherOwnerId,
    staff: null,
    row: {
      id: propertyId,
      name,
      district: "Galle",
      archived_at: null,
      verification_status: "verified",
    },
  });
}

for (const [suffix, offset] of [
  ["desktop", 0],
  ["mobile", 2],
]) {
  const owner = randomUUID();
  for (const [id, email] of [
    [owner, `team-owner-${suffix}@example.invalid`],
    [randomUUID(), `team-invitee-${suffix}@example.invalid`],
  ]) {
    accounts.set(email, {
      user: { id, email, aud: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z" },
    });
  }
  for (const [index, name] of ["Fixture Bay", "Fixture Park"].entries()) {
    const id = `30000000-0000-4000-8000-00000000000${offset + index + 1}`;
    properties.set(id, {
      owner,
      staff: null,
      row: { id, name, district: "Galle", archived_at: null, verification_status: "verified" },
    });
  }
}

function reply(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
  return true;
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

function session(user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: user.id, exp, jti: randomUUID() }),
    "ZmFrZQ",
  ].join(".");
  tokens.set(access, user);
  return {
    access_token: access,
    refresh_token: randomUUID(),
    expires_in: 3600,
    expires_at: exp,
    token_type: "bearer",
    user,
  };
}

export async function handlePartnerFixture(req, res) {
  const url = new URL(req.url, "http://127.0.0.1:3101");
  const user = tokens.get(req.headers.authorization?.replace(/^Bearer /, ""));
  const isService = req.headers.apikey === "synthetic-service-key-for-tests";
  const denied = () => reply(res, 401, { message: "Fixture access denied" });

  if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
    const { email, code_challenge } = await readJson(req);
    if (
      !code_challenge ||
      !url.searchParams.get("redirect_to")?.startsWith("http://127.0.0.1:3100/auth/callback")
    ) {
      return reply(res, 400, { message: "Fixture expected a callback with PKCE" });
    }
    const user = {
      id: randomUUID(),
      aud: "authenticated",
      email,
      is_anonymous: false,
      user_metadata: {},
      app_metadata: {},
    };
    accounts.set(email, { user, challenge: code_challenge });
    return reply(res, 200, user);
  }
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const body = await readJson(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "pkce") {
      const account = accounts.get(body.auth_code);
      if (
        !account ||
        typeof body.code_verifier !== "string" ||
        createHash("sha256").update(body.code_verifier).digest("base64url") !== account.challenge
      ) {
        return reply(res, 400, {
          message: "Invalid fixture code",
          error_code: "bad_code_verifier",
        });
      }
      account.user.email_confirmed_at = new Date().toISOString();
      account.challenge = null;
      return reply(res, 200, session(account.user));
    }
    const account = accounts.get(body.email);
    if (
      grant === "password" &&
      account?.user.email_confirmed_at &&
      body.password === "fixture-only-password"
    ) {
      return reply(res, 200, session(account.user));
    }
    return reply(res, 400, {
      message: "Invalid fixture credentials",
      error_code: "invalid_credentials",
    });
  }
  if (url.pathname === "/auth/v1/user") return user ? reply(res, 200, user) : denied();
  if (url.pathname === "/auth/v1/logout") {
    if (!user) return denied();
    tokens.delete(req.headers.authorization.slice(7));
    res.writeHead(204).end();
    return true;
  }
  if (url.pathname === "/rest/v1/profiles" && req.method === "POST") {
    return user ? reply(res, 201, null) : denied();
  }
  if (url.pathname === "/rest/v1/rpc/consume_request_budget") {
    return isService ? reply(res, 200, [{ allowed: true, retry_after: 60 }]) : denied();
  }
  if (url.pathname === "/rest/v1/rpc/record_auth_audit") {
    return isService ? reply(res, 200, null) : denied();
  }
  if (url.pathname === "/rest/v1/rpc/register_partner_property") {
    if (!user?.email_confirmed_at) return denied();
    const { registration_id, details } = await readJson(req);
    const target = claimTargets.get(details.name);
    if (target) {
      if (!details.claim_message) return reply(res, 200, "duplicate");
      ownershipClaims.set(registration_id, {
        id: registration_id,
        claimant: user.id,
        details,
        target,
        applicantMessage: details.claim_message,
        status: "pending",
        decisionMessage: null,
        evidence: null,
        createdAt: new Date().toISOString(),
      });
      return reply(res, 200, "claimed");
    }
    properties.set(registration_id, {
      owner: user.id,
      row: {
        id: registration_id,
        name: details.name,
        district: details.district,
        archived_at: null,
        verification_status: "pending",
      },
    });
    return reply(res, 200, "registered");
  }
  if (url.pathname === "/rest/v1/rpc/get_my_ownership_claims") {
    if (!user) return denied();
    return reply(
      res,
      200,
      [...ownershipClaims.values()]
        .filter((claim) => claim.claimant === user.id)
        .map((claim) => ({
          id: claim.id,
          name: claim.details.name,
          status: claim.status,
          propertyId: claim.status === "approved" ? claim.target : null,
          message: claim.decisionMessage,
        })),
    );
  }
  if (url.pathname === "/rest/v1/rpc/get_admin_ownership_claims") {
    if (user?.id !== adminId) return reply(res, 200, null);
    const body = await readJson(req);
    if (!body.target_claim)
      return reply(
        res,
        200,
        [...ownershipClaims.values()]
          .filter((claim) => (claim.status !== "pending") === Boolean(body.completed))
          .map((claim) => ({
            id: claim.id,
            name: claim.details.name,
            district: claim.details.district,
            status: claim.status,
            createdAt: claim.createdAt,
          })),
      );
    const claim = ownershipClaims.get(body.target_claim);
    return reply(
      res,
      200,
      claim
        ? {
            ...claim,
            candidates: [
              {
                id: claim.target,
                name: claim.details.name,
                address: claim.details.address,
                district: claim.details.district,
                signals: ["name", "address"],
                current: true,
              },
            ],
          }
        : null,
    );
  }
  if (url.pathname === "/rest/v1/rpc/decide_ownership_claim") {
    if (user?.id !== adminId) return reply(res, 200, "forbidden");
    const body = await readJson(req);
    const claim = ownershipClaims.get(body.target_claim);
    if (!claim || claim.status !== "pending") return reply(res, 200, "stale");
    if (
      body.operation === "approve" &&
      (body.target_property !== claim.target || !body.independently_verified)
    )
      return reply(res, 200, "invalid");
    claim.status = body.operation === "approve" ? "approved" : "rejected";
    claim.decisionMessage = body.decision_note;
    claim.evidence = body.evidence;
    if (claim.status === "approved") properties.get(claim.target).owner = claim.claimant;
    return reply(res, 200, "saved");
  }
  if (url.pathname === "/rest/v1/rpc/get_partner_overview") {
    if (!user) return denied();
    const owned = [...properties.values()].filter(({ owner }) => owner === user.id);
    return reply(res, 200, {
      currentMonth: "2026-11",
      previousMonth: "2026-10",
      properties: owned.map(({ row, totals }) => ({
        id: row.id,
        ...(totals ?? { published: 0, active: 0, current: zero, previous: zero }),
      })),
    });
  }
  if (url.pathname === "/rest/v1/properties" && req.method === "GET") {
    const id = url.searchParams.get("id")?.slice(3);
    const property = properties.get(id);
    if (!user || !property || (property.owner !== user.id && property.staff !== user.id))
      return denied();
    return reply(res, 200, [
      {
        slug: "fixture-coast-house",
        property_type: "hotel",
        public_phone: "+94771234567",
        public_whatsapp: "+94777654321",
      },
    ]);
  }
  if (
    url.pathname === "/rest/v1/rpc/get_property_editor" ||
    url.pathname === "/rest/v1/rpc/submit_property_profile"
  ) {
    const body = await readJson(req);
    const property = properties.get(body.target_property);
    if (!user || property?.owner !== user.id) return denied();
    const key = `${req.headers.authorization}:${body.target_property}`;
    const editor = editors.get(key);
    if (url.pathname.endsWith("submit_property_profile")) {
      if (body.expected_version !== (editor?.version ?? "fixture-version"))
        return reply(res, 200, "stale");
      editors.set(key, {
        version: randomUUID(),
        editable: true,
        requestStatus: "pending",
        profile: body.changes,
      });
      return reply(res, 200, "saved");
    }
    return reply(
      res,
      200,
      editor ?? {
        version: "fixture-version",
        editable: true,
        requestStatus: null,
        profile: {
          name: property.row.name,
          description: null,
          address: "123 Fixture Street",
          district: "Galle",
          google_maps_url: "https://maps.google.com/?q=Galle",
          public_phone: "+94771234567",
          public_whatsapp: null,
          public_email: null,
          website_url: null,
          google_reviews_url: null,
          facebook_url: null,
          instagram_url: null,
          amenities: [],
          gallery: [],
        },
      },
    );
  }
  const teamRpc = url.pathname.match(
    /^\/rest\/v1\/rpc\/(get_property_team|create_property_staff_invite|manage_property_staff|accept_property_staff_invite)$/,
  )?.[1];
  if (teamRpc) {
    if (!user) return denied();
    const body = await readJson(req);
    const property = properties.get(body.target_property);
    const pending = [...staffInvites.values()].filter(
      (invite) => invite.property === body.target_property && !invite.used,
    );
    if (teamRpc === "accept_property_staff_invite") {
      const hash = createHash("sha256").update(body.invite_token).digest("hex");
      const invite = staffInvites.get(hash);
      const destination = properties.get(invite?.property);
      if (!invite || invite.used || invite.email !== user.email || destination.staff)
        return reply(res, 200, "unavailable");
      destination.staff = user.id;
      destination.staffEntryId = randomUUID();
      invite.used = true;
      return reply(res, 200, invite.property);
    }
    if (!property || property.owner !== user.id) return denied();
    if (teamRpc === "get_property_team") {
      const staffEmail = [...accounts.values()].find(
        (account) => account.user.id === property.staff,
      )?.user.email;
      return reply(res, 200, {
        staff: staffEmail ? [{ id: property.staffEntryId, slot: 1, email: staffEmail }] : [],
        invites: pending.map(({ id, email, expiresAt }) => ({ id, email, expiresAt })),
      });
    }
    if (teamRpc === "create_property_staff_invite") {
      staffInvites.set(body.token_digest, {
        id: randomUUID(),
        property: body.target_property,
        email: body.invited_email,
        expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        used: false,
      });
      return reply(res, 200, "created");
    }
    if (body.operation === "remove" && body.entry_id === property.staffEntryId)
      property.staff = null;
    if (body.operation === "revoke") {
      const invite = pending.find(({ id }) => id === body.entry_id);
      if (invite) invite.used = true;
    }
    return reply(res, 200, "saved");
  }
  if (url.pathname === "/rest/v1/rpc/has_platform_admin_access") {
    return reply(res, 200, user?.id === adminId);
  }
  if (
    ["/rest/v1/rpc/get_admin_verifications", "/rest/v1/rpc/decide_property_verification"].includes(
      url.pathname,
    )
  ) {
    const read = url.pathname.endsWith("get_admin_verifications");
    if (user?.id !== adminId) return reply(res, 200, read ? null : "forbidden");
    const body = await readJson(req);
    const key = req.headers.authorization;
    if (!verificationReviews.has(key)) {
      verificationReviews.set(key, {
        id: editorProperty,
        name: "Fixture review hotel",
        status: "pending",
        version: "1",
        current: {
          name: "Fixture review hotel",
          district: "Galle",
          address: "Fixture street",
          google_maps_url: "https://maps.google.com/?q=6.02,80.22",
          public_phone: "+94771234567",
        },
        request: {
          status: "pending",
          kind: "initial",
          proposed: {},
          applicant: "Fixture applicant",
        },
        history: [],
      });
    }
    const review = verificationReviews.get(key);
    if (read) {
      if (body.target_property)
        return reply(res, 200, body.target_property === review.id ? review : null);
      const include = body.queue_filter === "pending" && review.request.status === "pending";
      return reply(
        res,
        200,
        include
          ? [
              {
                id: review.id,
                name: review.name,
                district: "Galle",
                propertyStatus: review.status,
                requestStatus: review.request.status,
                kind: "initial",
              },
            ]
          : [],
      );
    }
    if (body.expected_version !== review.version) return reply(res, 200, "stale");
    if (body.operation === "approve") {
      if (!body.decision.existence || !body.decision.authority || !body.decision.evidence)
        return reply(res, 200, "invalid");
      review.status = "verified";
      review.request.status = "approved";
    } else if (body.operation === "suspend") {
      if (!body.decision.confirm || !body.decision.message) return reply(res, 200, "invalid");
      review.status = "suspended";
    }
    review.version = String(Number(review.version) + 1);
    review.history.unshift({
      id: review.version,
      action: body.operation,
      message: body.decision.message,
      evidence: body.decision.evidence,
      method: body.decision.method,
      at: "2026-11-05T12:00:00Z",
    });
    return reply(res, 200, "saved");
  }
  if (
    ["/rest/v1/rpc/get_admin_offer_reviews", "/rest/v1/rpc/decide_offer_review"].includes(
      url.pathname,
    )
  ) {
    const read = url.pathname.endsWith("get_admin_offer_reviews");
    if (user?.id !== adminId) return reply(res, 200, read ? null : "forbidden");
    const body = await readJson(req);
    const token = req.headers.authorization;
    if (!offerReviews.has(token)) {
      const submittedAt = "2026-11-05T12:00:00Z";
      const revision = {
        id: "50000000-0000-4000-8000-000000000001",
        number: 1,
        status: "pending_review",
        submittedAt,
        reviewedAt: null,
        message: null,
        reviewer: null,
      };
      offerReviews.set(token, {
        offerId: "40000000-0000-4000-8000-000000000010",
        slug: "fixture-offer-review",
        offerStatus: "pending_review",
        approvedRevisionId: null,
        propertyId: editorProperty,
        property: "Fixture Coast",
        district: "Galle",
        address: "Fixture Road",
        phone: "+94771234567",
        whatsapp: null,
        propertyVerified: true,
        version: "1",
        revision,
        history: [revision],
        cover: fixturePhotos[0],
        gallery: [fixturePhotos[1]],
        preview: {
          title: "Fixture submitted offer",
          short_description: "A private stay proposal.",
          category: "stays",
          promotional_price: 15000,
          original_price: 20000,
          discount_percent: 25,
          price_unit: "per_package",
          price_qualifier: "exact",
          package_coverage: "One night for two",
          adults: 2,
          children: 0,
          child_age_min: null,
          child_age_max: null,
          child_policy: null,
          nights: 1,
          inclusions: ["Breakfast", "Pool access"],
          publication_starts_at: "2026-11-05T12:00:00Z",
          publication_ends_at: "2026-12-05T12:00:00Z",
          redemption_starts_on: "2026-11-06",
          redemption_ends_on: "2026-12-06",
          terms: "Advance booking required.",
          taxes_included: true,
          tax_details: null,
          exclusions: null,
          restrictions: null,
          extra_charges: null,
          category_details: {},
        },
      });
    }
    const review = offerReviews.get(token);
    if (read) {
      if (body.target_offer)
        return reply(res, 200, body.target_offer === review.offerId ? review : null);
      const include = (review.revision.status !== "pending_review") === Boolean(body.completed);
      return reply(
        res,
        200,
        include
          ? [
              {
                offerId: review.offerId,
                revisionId: review.revision.id,
                title: review.preview.title,
                property: review.property,
                number: 1,
                status: review.revision.status,
                submittedAt: review.revision.submittedAt,
              },
            ]
          : [],
      );
    }
    if (review.revision.status !== "pending_review" || review.version !== body.expected_version)
      return reply(res, 200, "stale");
    if (body.operation === "approve" && Object.values(body.checklist).some((checked) => !checked))
      return reply(res, 200, "checklist");
    review.revision.status =
      body.operation === "approve"
        ? "approved"
        : body.operation === "reject"
          ? "rejected"
          : "changes_requested";
    review.revision.message = body.decision_message;
    review.revision.reviewedAt = "2026-11-06T12:00:00Z";
    review.revision.reviewer = "Fixture reviewer";
    review.offerStatus = review.revision.status === "approved" ? "active" : review.revision.status;
    review.approvedRevisionId = review.revision.status === "approved" ? review.revision.id : null;
    review.version = "2";
    return reply(res, 200, "saved");
  }
  if (["/rest/v1/rpc/get_admin_reports", "/rest/v1/rpc/moderate_report"].includes(url.pathname)) {
    const read = url.pathname.endsWith("get_admin_reports");
    if (user?.id !== adminId) return reply(res, 200, read ? null : "forbidden");
    const body = await readJson(req);
    const token = req.headers.authorization;
    const receivedAt = "2026-11-05T12:00:00Z";
    const related = {
      id: "60000000-0000-4000-8000-000000000002",
      title: "Fixture reported property",
      property: "Fixture reported property",
      target: "property",
      priority: "low",
      status: "open",
      reason: "unreachable_contact",
      receivedAt,
    };
    if (!reportQueues.has(token)) {
      reportQueues.set(token, {
        id: "60000000-0000-4000-8000-000000000001",
        title: "Fixture complaint offer",
        property: related.title,
        target: "offer",
        priority: "high",
        status: "open",
        reason: "incorrect_price",
        receivedAt,
        resolvedAt: null,
        version: "1",
        comment: "The posted price differed from the quote.",
        reporterEmail: "fixture-reporter@example.invalid",
        targetStatus: "active",
        canHide: true,
        canRestore: false,
        actions: [],
        related: [related],
      });
    }
    const report = reportQueues.get(token);
    if (read) {
      if (body.target_report)
        return reply(res, 200, body.target_report === report.id ? report : null);
      const { id, title, property, target, priority, status, reason } = report;
      const summary = { id, title, property, target, priority, status, reason, receivedAt };
      const closed = status === "resolved";
      return reply(
        res,
        200,
        body.completed ? (closed ? [summary] : []) : closed ? [related] : [summary, related],
      );
    }
    if (body.target_report !== report.id || body.expected_version !== report.version)
      return reply(res, 200, "stale");
    const changes = {};
    if (body.operation === "temporarily_hide") {
      if (!body.confirm_visibility || !body.decision_note) return reply(res, 200, "invalid");
      changes.targetBefore = report.targetStatus;
      report.targetStatus = changes.targetAfter = "hidden_by_admin";
      report.status = "investigating";
      report.canHide = false;
      report.canRestore = true;
    } else if (body.operation === "resolve") {
      report.status = "resolved";
      report.resolvedAt = receivedAt;
    }
    report.version = String(Number(report.version) + 1);
    report.actions.unshift({
      id: report.version,
      action: body.operation,
      note: body.decision_note,
      actor: "Fixture admin",
      changes,
      at: receivedAt,
    });
    return reply(res, 200, "saved");
  }
  if (url.pathname === "/rest/v1/rpc/get_admin_platform_analytics") {
    if (user?.id !== adminId) return reply(res, 200, null);
    const { trend_days } = await readJson(req);
    return reply(res, 200, {
      viewIngestionReady: true,
      trend: Array.from({ length: trend_days }, (_, index) => ({
        date: new Date(Date.UTC(2026, 10, 5 - index)).toISOString().slice(0, 10),
        views: index === 0 ? 14 : 0,
        whatsapp: index === 0 ? 2 : 0,
        calls: index === 0 ? 1 : 0,
      })).reverse(),
      sources: [
        { source: "unknown", views: 10 },
        { source: "social", views: 4 },
      ],
    });
  }
  if (url.pathname === "/rest/v1/rpc/get_admin_content_health") {
    if (user?.id !== adminId) return reply(res, 200, null);
    return reply(res, 200, {
      propertyReviews: 2,
      offerReviews: 3,
      expiring: [
        {
          id: "expiring",
          slug: "fixture-expiring-offer",
          title: "Fixture expiring offer",
          property: "Fixture Coast",
          endsAt: "2026-11-07T12:00:00Z",
        },
      ],
      inactive: [
        {
          id: editorProperty,
          name: "Fixture quiet property",
          district: "Galle",
          lastActivity: null,
        },
      ],
    });
  }
  if (
    ["/rest/v1/rpc/get_notification_inbox", "/rest/v1/rpc/mark_notification_read"].includes(
      url.pathname,
    )
  ) {
    if (!user) return denied();
    const body = await readJson(req);
    const admin = body.admin_inbox === true;
    const read = url.pathname.endsWith("get_notification_inbox");
    if (admin && user.id !== adminId) return reply(res, 200, read ? null : false);
    const token = req.headers.authorization + (admin ? ":admin" : ":partner");
    const item = {
      id: "70000000-0000-4000-8000-000000000001",
      title: admin ? "High-priority complaint" : "Property registration received",
      body: admin
        ? "Open the private moderation queue."
        : "Ayaale will review your property registration.",
      kind: admin ? "complaint" : "registration",
      propertyId: editorProperty,
      reportId: admin ? "60000000-0000-4000-8000-000000000001" : null,
      receivedAt: "2026-11-05T12:00:00Z",
      read: readNotifications.has(token),
    };
    if (read) {
      const items = admin || user.id === ownerId ? [item] : [];
      return reply(res, 200, {
        unread: items.filter((notice) => !notice.read).length,
        ...(body.count_only ? {} : { items }),
      });
    }
    if (body.notification_id !== item.id || (!admin && user.id !== ownerId))
      return reply(res, 200, false);
    readNotifications.add(token);
    return reply(res, 200, true);
  }
  if (
    ["get_admin_newsletter", "search_admin_newsletter_offers", "save_admin_newsletter"].some(
      (name) => url.pathname === `/rest/v1/rpc/${name}`,
    )
  ) {
    if (user?.id !== adminId) return reply(res, 200, null);
    const input = await readJson(req);
    const offers = ["Fixture coast stay", "Fixture dining offer"].map((title, index) => ({
      id: `71000000-0000-4000-8000-00000000000${index}`,
      revisionId: `72000000-0000-4000-8000-00000000000${index}`,
      title,
      summary: "Fixture offer summary",
      category: index ? "dining" : "stays",
      price: 15000,
      unit: "per_package",
      startingFrom: false,
      property: "Fixture Coast",
      slug: `fixture-newsletter-${index}`,
      current: true,
    }));
    const token = req.headers.authorization;
    if (url.pathname.endsWith("search_admin_newsletter_offers")) {
      const query = (input.search_text ?? "").toLowerCase();
      return reply(
        res,
        200,
        offers.filter((item) => item.title.toLowerCase().includes(query)),
      );
    }
    if (url.pathname.endsWith("save_admin_newsletter")) {
      const id = "73000000-0000-4000-8000-000000000001";
      const draft = {
        id,
        subject: input.newsletter_subject,
        intro: input.newsletter_intro,
        status: "draft",
        version: "1",
        updatedAt: "2026-11-05T12:00:00Z",
        offers: input.offer_ids.map((offerId) => offers.find((item) => item.id === offerId)),
      };
      newsletterDrafts.set(token, draft);
      return reply(res, 200, { id, status: "saved" });
    }
    const draft = newsletterDrafts.get(token);
    return reply(res, 200, input.campaign_id ? (draft ?? null) : draft ? [draft] : []);
  }
  if (url.pathname === "/rest/v1/rpc/get_admin_newsletter_metrics") {
    return reply(
      res,
      200,
      user?.id === adminId
        ? {
            status: "draft",
            scheduledAt: null,
            audience: 0,
            accepted: 0,
            delivered: 0,
            failed: 0,
            suppressed: 0,
            bounced: 0,
            complained: 0,
            clicked: 0,
            unsubscribed: 0,
          }
        : null,
    );
  }
  if (url.pathname === "/rest/v1/rpc/get_admin_overview") {
    if (!user) return denied();
    if (user.id !== adminId) return reply(res, 200, null);
    const receivedAt = "2026-11-05T12:00:00Z";
    return reply(res, 200, {
      launchTrial: { allocated: 99, limit: 100, remaining: 1 },
      verifications: {
        total: 1,
        items: [
          {
            id: "verification",
            title: "Fixture pending property",
            district: "Galle",
            kind: "initial",
            receivedAt,
          },
        ],
      },
      offers: {
        total: 1,
        items: [
          {
            id: "offer",
            title: "Fixture offer to review",
            property: "Fixture Coast",
            revision: 2,
            receivedAt,
          },
        ],
      },
      reports: {
        total: 1,
        items: [
          {
            id: "report",
            title: "Fixture reported property",
            property: "Fixture reported property",
            target: "property",
            priority: "high",
            status: "investigating",
            reason: "incorrect_price",
            receivedAt,
          },
        ],
      },
    });
  }
  if (url.pathname === "/rest/v1/rpc/get_property_subscription") {
    const { target_property } = await readJson(req);
    const property = properties.get(target_property);
    if (!user || !property || property.owner !== user.id) return denied();
    const active = target_property === editorProperty;
    return reply(res, 200, {
      plan: "Starter",
      previouslyVerified: true,
      usage: {
        active: active ? 1 : 0,
        limit: 3,
        eligibility: active ? "available" : "no_entitlement",
      },
      trial: active
        ? { state: "active", startsAt: "2026-10-01T00:00:00Z", endsAt: "2027-04-01T00:00:00Z" }
        : { state: "expired", startsAt: "2026-03-01T00:00:00Z", endsAt: "2026-09-01T00:00:00Z" },
      prices: [
        [1, 1500],
        [6, 8000],
        [12, 15000],
      ].map(([months, amount]) => ({ months, amount, currency: "LKR" })),
    });
  }
  if (url.pathname === "/rest/v1/rpc/get_property_analytics") {
    const body = await readJson(req);
    const property = properties.get(body.target_property);
    if (!user || !property || (property.owner !== user.id && property.staff !== user.id))
      return denied();
    const { current, previous } = property.totals ?? { current: zero, previous: zero };
    const days = body.trend_days;
    return reply(res, 200, {
      currentMonth: "2026-11",
      previousMonth: "2026-10",
      current,
      previous,
      trend: Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.UTC(2026, 10, 7 - (days - 1 - i))).toISOString().slice(0, 10),
        ...(i === days - 1 ? current : zero),
      })),
      sources: property.totals
        ? [
            { source: "newsletter", views: Math.min(10, current.views) },
            { source: "unknown", views: Math.max(0, current.views - 10) },
          ]
        : [],
      offers: property.totals
        ? [{ id: managedOfferId, title: "Fixture analytics stay", ...current }]
        : [],
    });
  }
  if (
    url.pathname === "/rest/v1/rpc/get_property_offer_capacity" ||
    url.pathname === "/rest/v1/rpc/get_partner_offers" ||
    url.pathname === "/rest/v1/rpc/manage_partner_offer"
  ) {
    const body = await readJson(req);
    const property = properties.get(body.target_property);
    if (!user || !property || (property.owner !== user.id && property.staff !== user.id))
      return denied();
    const key = req.headers.authorization;
    const active = body.target_property === editorProperty ? fixtureOffer(key) : null;
    if (url.pathname.endsWith("get_property_offer_capacity")) {
      return reply(res, 200, {
        active: active?.status === "active" ? 1 : 0,
        limit: 3,
        eligibility: "available",
      });
    }
    if (url.pathname.endsWith("get_partner_offers")) {
      const drafts = [...offerDrafts.values()]
        .filter((item) => item.propertyId === body.target_property && !item.submitted)
        .map((item) => ({
          id: item.id,
          kind: "draft",
          title: item.content.title,
          category: item.content.category,
          status: "draft",
          updatedAt: new Date().toISOString(),
          editDraft: Boolean(item.sourceOffer),
        }));
      return reply(res, 200, [...(active ? [managedFlags(active)] : []), ...drafts]);
    }
    if (body.item_id !== active?.id) return reply(res, 200, "unavailable");
    const transition = { pause: "paused", resume: "active", end: "ended" }[body.operation];
    if (transition) {
      active.status = transition;
      active.version = String(Number(active.version) + 1);
      return reply(res, 200, "saved");
    }
    if (body.operation === "edit" || body.operation === "duplicate") {
      const future = (days) => new Date(Date.now() + days * 86400_000).toISOString();
      const dates =
        body.operation === "edit"
          ? {
              publication_starts_at: future(1).slice(0, 16),
              publication_ends_at: future(7).slice(0, 16),
              redemption_starts_on: future(8).slice(0, 10),
              redemption_ends_on: future(9).slice(0, 10),
            }
          : {};
      offerDrafts.set(body.new_draft_id, {
        id: body.new_draft_id,
        propertyId: body.target_property,
        version: 1,
        submitted: false,
        sourceOffer: body.operation === "edit" ? active.id : null,
        content: {
          title: active.title,
          category: "stays",
          short_description: "A two-person stay",
          promotional_price: "10000",
          price_unit: "per_package",
          price_qualifier: "exact",
          package_coverage: "A night for two",
          adults: "2",
          children: "0",
          nights: "1",
          inclusions: "Breakfast",
          terms: "Book in advance.",
          taxes_included: "yes",
          cover: fixturePhotos[0].id,
          gallery: [],
          ...dates,
        },
      });
      return reply(res, 200, body.new_draft_id);
    }
    return reply(res, 200, "invalid");
  }
  if (
    url.pathname === "/rest/v1/rpc/get_offer_wizard" ||
    url.pathname === "/rest/v1/rpc/save_offer_wizard"
  ) {
    const body = await readJson(req);
    const property = properties.get(body.target_property);
    if (!user || !property || (property.owner !== user.id && property.staff !== user.id))
      return denied();
    const draft = offerDrafts.get(body.draft_id);
    if (url.pathname.endsWith("save_offer_wizard")) {
      if ((draft?.version ?? 0) !== body.expected_version) return reply(res, 200, "stale");
      offerDrafts.set(body.draft_id, {
        id: body.draft_id,
        propertyId: body.target_property,
        version: body.expected_version + 1,
        content: body.content,
        submitted: body.submit_for_review,
        sourceOffer: draft?.sourceOffer,
      });
      if (body.submit_for_review && draft?.sourceOffer)
        fixtureOffer(req.headers.authorization).reviewStatus = "pending_review";
      return reply(res, 200, body.submit_for_review ? "submitted" : "saved");
    }
    return reply(res, 200, {
      draft: draft?.propertyId === body.target_property ? draft : null,
      drafts: [...offerDrafts.values()]
        .filter((item) => item.propertyId === body.target_property && !item.submitted)
        .map((item) => ({ id: item.id, title: item.content.title || null })),
    });
  }
  if (url.pathname === "/rest/v1/property_memberships") {
    if (!user) return denied();
    const propertyFilter = url.searchParams.get("property_id");
    if (req.method === "HEAD") {
      const property = properties.get(propertyFilter?.slice(3));
      res.writeHead(200, { "Content-Range": property?.staff ? "0-0/1" : "*/0" }).end();
      return true;
    }
    const entries = [...properties.values()].filter(
      ({ owner, staff, row }) =>
        (owner === user.id || staff === user.id) &&
        (!propertyFilter || propertyFilter === `eq.${row.id}`),
    );
    const rows = entries.map(({ row, owner }) => {
      const role = owner === user.id ? "owner" : "staff";
      return url.searchParams.get("select") === "role" ? { role } : { properties: row, role };
    });
    return reply(res, 200, rows);
  }
  if (url.pathname === "/rest/v1/photo_assets" && req.method === "GET") {
    const id = url.searchParams.get("property_id")?.slice(3);
    const property = properties.get(id);
    if (isService) {
      const photo = fixturePhotos.find(({ id }) => url.searchParams.get("id") === `eq.${id}`);
      if (id !== editorProperty || !photo) return reply(res, 200, []);
      return reply(res, 200, [
        {
          main_path: `${id}/${photo.id}/main.webp`,
          thumbnail_path: `${id}/${photo.id}/thumbnail.webp`,
        },
      ]);
    }
    if (
      !user ||
      !property ||
      (user.id !== adminId && property.owner !== user.id && property.staff !== user.id)
    )
      return denied();
    return reply(res, 200, id === editorProperty ? fixturePhotos : []);
  }
  if (url.pathname === "/storage/v1/object/sign/ayaale-private-photos" && req.method === "POST") {
    if (!isService) return denied();
    const { paths } = await readJson(req);
    return reply(
      res,
      200,
      paths.map((path) => ({
        path,
        signedURL:
          "/object/ayaale-private-photos/fixture-property/fixture-cover/main.webp?token=fixture",
      })),
    );
  }
  if (url.pathname === "/rest/v1/photo_assets" && req.method === "HEAD") {
    if (!user) return denied();
    const id = url.searchParams.get("property_id")?.slice(3);
    const count = properties.get(id)?.owner === user.id ? (photos.get(id) ?? 0) : 0;
    res.writeHead(200, { "Content-Range": count ? `0-${count - 1}/${count}` : "*/0" }).end();
    return true;
  }
  if (url.pathname === "/rest/v1/photo_assets" && req.method === "POST") {
    if (!isService) return denied();
    const body = await readJson(req);
    photos.set(body.property_id, (photos.get(body.property_id) ?? 0) + 1);
    return reply(res, 201, null);
  }
  if (
    url.pathname.startsWith("/storage/v1/object/ayaale-private-photos/") &&
    req.method === "POST"
  ) {
    if (!isService) return denied();
    for await (const chunk of req) void chunk;
    return reply(res, 200, { Key: url.pathname.slice("/storage/v1/object/".length) });
  }
  return false;
}

// Test-provider identity only. The database-backed journey uses the same PKCE
// substitute but executes application RPCs and authorization in real PostgreSQL.
export function fixtureIdentity(request) {
  return tokens.get(request.headers.authorization?.replace(/^Bearer /, "")) ?? null;
}
export function fixtureIdentityById(id) {
  return [...accounts.values()].find((account) => account.user.id === id)?.user ?? null;
}
