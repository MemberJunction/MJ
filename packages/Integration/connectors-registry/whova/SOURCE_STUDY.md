# SOURCE_STUDY.md — Whova

## 0. Headline finding: no machine-readable API contract exists

Before ranking prose sources, the required first step per the audit discipline is to find and pull a
machine-readable schema (OpenAPI/Swagger/GraphQL SDL/Postman/SDK types) **raw, in code**. That step was
run to exhaustion and the answer is negative, with structural proof, not just absence-of-search-results:

- **API Tracker** (`https://apitracker.io/a/whova`) is the only third-party aggregator that *claims* to
  index "OpenAPI/Swagger specs" and "Postman / Insomnia collections" for vendors in its directory. Its
  profile page renders those two feature rows for every vendor as UI chrome (icon badges, greyed/"dimmed"
  CSS class, an anchor tag with **no `href`**) regardless of whether the vendor actually has one.
  The page's own embedded Next.js JSON state settles it definitively:
  ```
  "apiSpecs":[],"apis":[],"postmanCollections":[]
  ```
  Raw HTML saved to `sources/apitracker.whova.overview.html` (fetched via `curl`, 89,918 bytes, HTTP 200).
  The dedicated `/a/whova/specifications` sub-page states outright: *"We don't have API specifications for
  Whova yet."*
- No `openapi.json` / `swagger.json` / `/v3/api-docs` / linked YAML spec was found at any guessed or
  searched path on `whova.com`, `whova.zendesk.com`, or any third-party spec mirror.
- No public `postman.com/whova` workspace or collection was found via web search or Postman's own search.
- No GraphQL endpoint, SDL, or introspection surface was found or referenced anywhere.
- No published SDK (TypeScript/Python/etc. type definitions) was found.
- `apiorb.com`'s Whova page reads as generic templated boilerplate (mentions "GraphQL playground," "OAuth
  playground," "Sandbox environment" — none of which have any independent corroboration anywhere else and
  are almost certainly stock copy repeated across that site's vendor pages, not vendor-specific facts).

**Conclusion: `SchemaContractStatus = NoMachineReadableContractFound`.** Whova is a closed/private-API
vendor. The only way third parties integrate programmatically with Whova today is through **Whova's own
published Zapier app**, which functions as the de facto (if thin) public contract — it is vendor-authored,
lists concrete trigger/action inputs, and is the highest-tier reachable artifact. Everything else is prose
documentation (Zendesk help center + Whova's own blog) describing UI-driven CSV/spreadsheet exports, not a
programmatic API.

This absence is itself the most important finding of this audit and is carried forward as the scope
decision in §4 — it is the reason `TaxonomyLeaves` is short and heavily gapped rather than a defect in the
audit.

## 1. Source-by-source study

### 1.1 Zapier — Whova App (`https://zapier.com/apps/whova/integrations`, `.../salesforce`)

- **Tier / Category**: 2, `OfficialDocs` (vendor-authored on a third-party automation platform; Whova is
  the app owner of record).
- **Structure walked**: A single-page integration listing split into "Triggers" and "Actions." Each entry
  names the trigger/action, gives a one-line description, and lists required vs. optional input fields
  (for actions) or required trigger-scoping inputs (for triggers, always "Event").
- **What's covered**:
  - **Trigger: Get Attendees** — "Triggers when there is a change in the attendee list." Scoped by `Event`.
  - **Trigger: Get Orders** — "Triggers when there is a change in the order list." Scoped by `Event`.
  - **Trigger: Get Registrants** — "Triggers when a registrant submits their registration question form
    responses." Scoped by `Event`.
  - **Action: Create or Update Attendee** — required: `Event`, `First Name`, `Last Name`, `Email`; optional:
    `Title`, `Affiliation/Company`, `Location`, `Ticket Types`, `Audience Type` (`in_person`/`remote`),
    `Categories`.
- **What's explicitly NOT covered**: no output/response field schemas for the three triggers (Zapier's
  public listing shows inputs, not sample output payload shapes); no session/speaker/exhibitor/sponsor
  trigger or action of any kind; no delete operation; no webhook subscription management API; no pagination,
  rate-limit, or auth-scheme documentation (Zapier abstracts auth behind its own OAuth/API-key connection
  flow, so the underlying scheme is invisible from this source).
- **Idiosyncrasies**: `Event` is a required scoping parameter on every trigger and the one action — Whova's
  API is fundamentally event-scoped (multi-tenant-per-organizer, single-tenant-per-event), consistent with
  Whova being an event-app platform where an "organizer account" manages many discrete "events." This is a
  strong signal for the connector's object model: every syncable object nests under an `Event` parent.
- **Named taxonomies** (COVERABLE):
  - **Attendees** — driven by "Get Attendees" trigger + "Create or Update Attendee" action. Source:
    `https://zapier.com/apps/whova/integrations`, `https://zapier.com/apps/whova/integrations/salesforce`.
  - **Orders** — driven by "Get Orders" trigger. Source: `https://zapier.com/apps/whova/integrations`.
  - **Registrants (Registration Form Responses)** — driven by "Get Registrants" trigger. Source:
    `https://zapier.com/apps/whova/integrations`.

### 1.2 Whova Help Center / Zendesk articles (blocked, evidence recovered indirectly)

- **Tier / Category**: 1, `OfficialDocs` (vendor-owned support domain).
- **Access status**: `WebFetchBlocked` on all three targeted articles (403 Forbidden). Retried 3x with
  exponential backoff (1s/3s/9s) per protocol — still 403. Cross-checked via `Bash curl` with a standard
  desktop User-Agent header — also 403, confirming this is a Zendesk-side bot rule on the `whova.zendesk.com`
  host (not a WebFetch-specific block), so tagged `WebFetchBlocked` rather than treated as unreachable.
  Content was recovered indirectly through WebSearch result snippets, which is a materially weaker evidence
  form than a direct fetch — flagged accordingly (Tier 1 by source ownership, but treated cautiously for any
  hard-constraint claim; none are used for hard constraints here, only for taxonomy/field enumeration).
- **What's covered** (from recovered snippets):
  - `36234286423963` "How can organizers export a custom report?" — describes the Attendees → Analytics &
    Exports → Export flow with two report tiers (survey responses + session feedback + check-in data; or
    that plus registration-form responses, gated on Whova Registration).
  - `207292877` "How do I export my Attendees List?" — describes Attendees → Manage Attendees → Export
    Attendees → Export Basic attendee list, filterable by ticket type / category.
  - `28473285536795` "How do I integrate CRM via Zapier?" — confirms CRM integration is Zapier-only; no
    native direct-integration path is offered by Whova for CRM sync.
- **What's explicitly NOT covered**: no endpoint URLs, no auth scheme, no request/response payload shapes —
  these are UI walkthroughs for humans clicking through the Whova organizer dashboard, not API references.
- **Named taxonomies**: Same as §1.1 (Attendees, Registrants) plus cross-cutting **Check-ins**, **Surveys**,
  **Session Feedback** as field-categories within the attendee export (not independent syncable objects —
  see §3 INFORMATIONAL classification).

### 1.3 Whova Blog — Custom Attendee Data Export (`https://whova.com/blog/custom-attendee-data-export/`)

- **Tier / Category**: 1, `OfficialDocs`.
- **Structure walked**: Marketing/feature-announcement blog post describing the "Custom Attendee Data
  Export" feature.
- **What's covered**: Default export fields — attendee names, check-in status, days checked in, sessions
  checked in, sessions on agenda, surveys submitted, session feedback submitted — plus optional custom
  registration-form multiple-choice responses (example: dietary restrictions, transportation needs).
  Filterable by ticket type (VIP/all-access/executive/single-day) and attendee category
  (students/first-time attendees/industry professionals/mentors).
- **Idiosyncrasies**: This is explicitly a **synthesized cross-object report**, not a single object — it
  pulls from check-ins, surveys, ticket types, and registration-form responses into one flattened export.
  This confirms the underlying data model has Check-ins / Surveys / Session-Feedback / Registration-Form as
  separate sub-record-sets keyed to an Attendee, consistent with the "Registrants" trigger in §1.1.

### 1.4 Whova Blog — Attendee Profile Custom Fields (`https://whova.com/blog/attendee-profile-custom-fields/`)

- **Tier / Category**: 1, `OfficialDocs`.
- **What's covered**: A large catalog of **organizer-configurable custom attendee-profile fields** —
  pronouns, role, credentials, chapter, department, major, program, school name, affiliation/institute,
  industry, field of expertise, education level, certifications, industry awards, graduating class,
  portfolio, project examples, relevant skills, teaching level, mentor/collaborator/investor interest
  flags, products/services offered or needed, interests, hobbies, favorite books/movies, networking goals.
- **Why this is INFORMATIONAL, not a taxonomy of its own**: none of these are fixed schema columns — they
  are a vendor-provided **menu of optional custom fields an organizer may enable per event** (the article
  says organizers "select fields most relevant to their specific event type"). This maps to the connector's
  eventual customs-capture mechanism (per `connector-code-conventions.md` §"Discovery: capture every
  object/field") rather than to a static IOF list. It informs field-mapping logic; it is not itself
  coverable.

### 1.5 Whova Exhibitor/Sponsor docs (`.../whova-app-exhibitor-guide/`, `.../sponsor-exhibitor-form-custom-fields/`)

- **Tier / Category**: 1, `OfficialDocs`.
- **What's covered**: Exhibitor/sponsor booth profile fields (company name/logo/photo, contact info,
  handouts, promotional offers, booth staff, lead collection via QR scan, engagement metrics — likes,
  comments, visits) and sponsor/exhibitor custom form field types (radio/checkbox/short-answer/
  paragraph/consent) with example uses (logistics, social links, meeting-booking links).
- **Why this is documented-but-OUT-OF-SCOPE**: There is **no Zapier trigger or action for
  exhibitors/sponsors/leads** anywhere in the discovered surface, and no Zendesk article describing a
  programmatic (vs. manual-dashboard) export for exhibitor/lead data. This taxonomy is real (the vendor
  clearly has this object internally) but has **zero credential-free programmatic evidence** — it cannot be
  proven as a coverable IO without either (a) a live credentialed probe of the Whova organizer API the
  Zapier app itself must be calling, or (b) the vendor publishing something beyond these UI-oriented guides.
  Recorded as an out-of-scope family with reason (see §5).

### 1.6 Whova FAQ — attendee export (`https://whova.com/faq/is-there-any-way-for-me-to-export-attendees/`)

- **Tier / Category**: downgraded to 3 (demonstrated stale/contradictory).
- **Finding**: states "Whova does not support this function as of now" for attendee export — directly
  contradicted by §1.2 and §1.3, both of which describe a working, documented export feature. This is
  either a very old FAQ entry left unmaintained or a different (perhaps discontinued) export path. **Not
  used as evidence for any TargetField.** Retained in SOURCES.json purely to document the contradiction so
  downstream agents don't independently rediscover and get confused by it.

### 1.7 API Tracker + apiorb.com (community aggregators)

- **Tier / Category**: 3, `CommunityFixture`.
- **Role**: used exclusively to prove the NEGATIVE (§0) — no machine-readable contract exists. Not used as
  a source of any object/field claim. `apiorb.com`'s content reads as generic template boilerplate not
  specific to Whova and is explicitly excluded from evidentiary use.

## 2. COVERABLE vs INFORMATIONAL taxonomy split

| Taxonomy | Role | Definition | Source citation |
|---|---|---|---|
| **Attendees** | COVERABLE | The core synced entity — event attendees, creatable/updatable via Zapier action, readable via "Get Attendees" trigger. | `zapier.com/apps/whova/integrations`, `zapier.com/apps/whova/integrations/salesforce`, Zendesk `207292877`, `36234286423963` |
| **Orders** | COVERABLE | Ticket/registration purchase records, read-only via "Get Orders" trigger. | `zapier.com/apps/whova/integrations` |
| **Registrants (Registration Form Responses)** | COVERABLE | Registration-question form submissions, read-only via "Get Registrants" trigger; also the "Option 2" export tier in the Zendesk custom-report article. | `zapier.com/apps/whova/integrations`, Zendesk `36234286423963` |
| **Check-ins** | INFORMATIONAL | A field-category within the attendee export (check-in status, days checked in, sessions checked in) — no independent trigger/action; folds into the Attendees record shape as sub-fields, not a separate syncable object with its own identity/CRUD surface from this source set. | `whova.com/blog/custom-attendee-data-export/`, Zendesk `36234286423963` |
| **Surveys / Session Feedback** | INFORMATIONAL | Same pattern as Check-ins — export-report field categories describing attendee engagement, no independent programmatic surface discovered. | `whova.com/blog/custom-attendee-data-export/`, Zendesk `36234286423963` |
| **Attendee Custom Profile Fields** | INFORMATIONAL | Vendor-provided menu of organizer-configurable optional attendee fields (structural knowledge for field-mapping/customs logic), not a fixed schema of its own. | `whova.com/blog/attendee-profile-custom-fields/` |
| **Exhibitors/Booths, Sponsors, Leads** | INFORMATIONAL (documented, NOT coverable from this source set) | Real vendor object family with rich documented field shape, but zero programmatic (Zapier trigger/action or API) evidence discovered credential-free. | `whova.com/pages/whova-app-exhibitor-guide/`, `whova.com/blog/sponsor-exhibitor-form-custom-fields/` |
| **CRM/Zapier auth & connection mechanics** | INFORMATIONAL | How the Zapier connection/auth flow works (relevant to the connector's auth strategy design) but not itself an object. | Zendesk `28473285536795` |

The extractor's coverage check applies only to the 3 rows marked COVERABLE.

## 3. L1/L2 container note

Whova's discovered surface has **no L1 container ↔ L2 surface hierarchy** to pin — unlike a vendor with
"Areas" containing "Sub-APIs" (e.g. HubSpot), Whova's entire reachable surface is a **flat list of 3
triggers + 1 action**, all scoped by the single `Event` parameter. There is no intermediate grouping layer
to fold. `TaxonomyLeaves` is therefore already at leaf granularity with no container to strip.

## 4. Scope decision

```
scopeDecision:
  universe (named/possible object families per brand.ObjectFamilies):
    attendees, sessions, agenda, speakers, exhibitors, sponsors, registrations,
    registrants, orders, tickets, contacts, surveys, polls, check_ins, messages, community
    (15 named families)

  in-scope (COVERABLE, credential-free-provable):
    Attendees, Orders, Registrants
    (3 leaves — see TaxonomyLeaves)

  justification:
    Whova publishes NO machine-readable API contract (§0) and NO public API reference docs beyond
    UI walkthroughs. The ONLY vendor-authored, field-level-specified, programmatically-invokable
    surface discovered anywhere is Whova's own Zapier app, which exposes exactly 3 triggers
    (Attendees, Orders, Registrants) and 1 write action (Attendees). Every other named family in
    brand.ObjectFamilies is either (a) folded into the Attendees export as a field-category with no
    independent object identity (sessions/agenda-as-attended, check_ins, surveys, polls), or (b) has
    rich prose documentation but ZERO discovered programmatic surface (speakers, exhibitors,
    sponsors, tickets-as-catalog, contacts, messages, community), or (c) not mentioned anywhere in
    the credential-free surface at all (polls, messages, community — no source found).
    This is a genuinely thin vendor surface, not an under-search: 20+ distinct search/fetch queries
    were run across API Tracker, Postman, Zapier, Whova's own domain (blog + zendesk + faq +
    resource pages), and third-party API cataloging sites, converging repeatedly on the same 3+1
    Zapier surface as the ceiling of what's provable without a live credential.

  residual-risk:
    A live credentialed probe (or a direct organizer-dashboard "API key" if one exists behind login)
    could reveal additional endpoints the Zapier app calls internally that are not surfaced in
    Zapier's public listing (e.g. session/speaker/exhibitor read endpoints, a webhook subscription
    API). This audit could not observe anything behind Whova's authenticated organizer dashboard.
    Flagged as a Gap (see below) rather than assumed.
```

## 5. Gaps (honest negatives, not silent omission)

| Area | Reason |
|---|---|
| Sessions / Agenda | No independent trigger, action, or endpoint found for sessions/agenda as a syncable object. "Sessions on their agenda" and "sessions checked in" appear ONLY as attendee-export field-categories (§2 INFORMATIONAL), not as a queryable Sessions collection. |
| Speakers | No trigger, action, or documented export path found anywhere in the credential-free surface. Third-party scraping-tool marketing pages (realdataapi.com, crivva.com) describe speaker fields (name, org, bio, topics) but these are UNOFFICIAL, non-vendor sources describing screen-scraping the public event website — explicitly excluded from SOURCES.json as non-authoritative. |
| Exhibitors / Sponsors / Leads | Real, richly documented object family (§1.5) with NO discovered programmatic surface (no Zapier trigger/action, no API reference). Documented-but-out-of-scope. |
| Tickets (as a catalog/product object) | "Ticket Types" appears only as an enum-like optional field on the Create/Update Attendee action (a value list, not a syncable Tickets collection with its own CRUD). No independent tickets endpoint found. |
| Contacts | brand.ObjectFamilies names this, but no Whova-specific "Contacts" object (distinct from Attendees) was found anywhere in the researched surface. Possibly a mis-derived family name from a generic CRM-adjacent taxonomy, or it refers to CRM-side contacts created via the Zapier "Create or Update Attendee → CRM contact" automation direction (i.e., Whova is the SOURCE, the CRM's Contacts object is the TARGET) rather than a Whova-native object. |
| Surveys / Polls / Check-ins (as independent objects) | These are attendee-export field-categories (§2), not independently queryable/writable objects in the discovered surface. If Whova's internal API exposes them separately, it is not visible without a credential. |
| Messages / Community | No mention found anywhere in the credential-free surface (not in Zapier listing, not in Zendesk articles, not in blog posts searched). Whova's marketing site does mention in-app messaging/networking as a PRODUCT FEATURE for attendees, but no data-export, API, or Zapier surface for it was found. |
| Registrations (as distinct from Registrants) | brand.ObjectFamilies lists both "registrations" and "registrants" — the discovered surface only names "Registrants" (the Zapier trigger). Treated as the same underlying object; no evidence of two independent objects. |
| Auth scheme / rate limits / base URL | Not documented anywhere credential-free. Zapier abstracts the underlying auth (likely API-key or OAuth against a private Whova endpoint) behind its own connected-account flow. This is a hard blocker for writing `CredentialTypeID`, base API path, and rate-limit metadata without either a live credential or a support/partnership contact with Whova. |

## 6. Recommendation for downstream agents

- Given `SchemaContractStatus = NoMachineReadableContractFound`, there is **no OpenAPI/Postman artifact to
  mock-server against** for a T5 tier — that tier's ceiling for Whova is bounded by whatever fixture data
  can be hand-derived from the Zapier field lists in §1.1 (the extractor should treat the Zapier
  trigger/action field lists as the closest available "spec" and build fixtures from them, clearly marked
  as vendor-documented-but-not-a-formal-schema).
- `IntegrationConnectorCreationPipeline`'s Introspect stage (`IntrospectSchema`) will almost certainly need
  to lean heavily on the connector's own `DiscoverObjects`/`DiscoverFields` runtime methods once a
  credential is available — the credential-free ceiling here genuinely cannot resolve object shape beyond
  the 3 COVERABLE taxonomies above.
- Given the "Event"-scoping idiosyncrasy (§1.1), the connector's object model should treat `Event` as a
  required per-sync-scope parameter, not a syncable object family itself (organizers likely configure which
  Event(s) to sync via `CompanyIntegration.Configuration`, not via a synced Events IO).
- Escalate the auth-scheme gap (last row of §5) explicitly — this blocks `CredentialTypeID` metadata
  authorship until either a live credential is obtained or Whova support/partnerships can be contacted for
  a private API reference.
