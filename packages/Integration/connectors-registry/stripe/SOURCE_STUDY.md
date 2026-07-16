# Stripe — Source Study

Generated 2026-07-02. All findings below are derived from **saved raw artifacts on disk**
(`packages/Integration/connectors-registry/stripe/sources/`), inspected via Node scripts —
never re-read wholesale into the agent's context window. Every script referenced here was run
and its stdout is quoted or summarized; the scripts themselves are preserved as evidence trails
in the extraction history.

## 0. Acquisition — what was pulled, raw, in code

| Artifact | Local path | Size | Method |
|---|---|---|---|
| Public OpenAPI spec | `sources/spec3.json` | 7.87 MB | `curl` → raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json (HTTP 200) |
| SDK OpenAPI spec | `sources/spec3.sdk.json` | 10.06 MB | `curl` → raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.sdk.json (HTTP 200) |
| Official Postman collection | `sources/postman.collection.json` | 3.65 MB | `curl` → raw.githubusercontent.com/stripe/stripe-postman/master/StripeAPICollection.json (HTTP 200), discovered via GitHub Contents API on `stripe/stripe-postman` |
| stripe-node pagination impl | `sources/autopagination.ts` | 15.6 KB | `curl` → raw.githubusercontent.com/stripe/stripe-node/master/src/autoPagination.ts (HTTP 200) |
| Extraction script output (v2) | `sources/stripe-extraction-v2.json` | 57.5 KB | Node script walking `spec3.json.paths` + `.components.schemas` |
| FK detection output | `sources/stripe-fk-detection.json` | 21.2 KB | Node script walking `x-expansionResources` vendor extension |
| Union enumeration | `sources/enumeration-union.json` | 76.5 KB | `enumerate-catalog.mjs` run against all three JSON artifacts |
| Full accounting ledger | `sources/full-accounting-ledger-FINAL.json` | 77.5 KB | Node script closing `|E| = |coverable| + |folded| + |family| + |informational| + |eventNames| + |subShape| + |other|` |

No WebFetch summary was ever treated as a source of record for the schema — WebFetch was used
only to navigate/confirm prose pages (pagination, idempotency, rate-limits) whose exact wording
was then quoted and cross-checked against the spec's own parameter descriptions.

## 1. Mechanical universe anchor

Running the shared enumerator (`enumerate-catalog.mjs`) directly against each artifact:

```
$ node enumerate-catalog.mjs spec3.json
format: openapi-json  count: 1431  fieldCount: 6661  confidence: high

$ node enumerate-catalog.mjs spec3.sdk.json
format: openapi-json  count: 1703  fieldCount: 7039  confidence: high

$ node enumerate-catalog.mjs spec3.json spec3.sdk.json postman.collection.json
UNION count: 1706  confidence: high
  spec3.json            openapi-json  count=1431 fieldCount=6661 high
  spec3.sdk.json        openapi-json  count=1703 fieldCount=7039 high
  postman.collection.json  unrecognized  count=0  fieldCount=null  low
```

**`EnumerationStdoutCount` = 1703** (from `spec3.sdk.json`, the richer of the two OpenAPI
artifacts — it is a superset of `spec3.json`'s 1431 for every in-scope object checked).
The Postman collection returned `unrecognized` from the shared enumerator's generic
`fromPostman()` parser — investigated and explained in §1a below; it does not change the
anchor because the OpenAPI spec is independently sufficient and higher-fidelity.

### 1a. Why the shared enumerator returned 0 for the Postman collection (documented, not silently ignored)

`enumerate-catalog.mjs`'s `fromPostman()` reads `request.url.raw` (a flat string). Stripe's
official collection instead encodes URLs as structured objects: `{ path: ['v1','account_sessions'], host: ['{{baseUrl}}'], variable: [] }` with **no `raw` field at all**. This is a real,
narrow gap in the shared enumerator for this specific Postman URL encoding style — not a fetch
failure (the file is valid, 107 top-level folders, verified readable). An ad hoc structural walk
(reading `request.url.path` segments directly) confirms ~240 resource path segments consistent
with the OpenAPI-derived object set — used here as corroboration only, never as the anchor.

### 1b. Full accounting ledger — `|E| = 1703` closed with zero unaccounted gap

```
$ node full-accounting-v3.mjs   (final closing pass, after 3 refinement rounds)
=== FINAL ACCOUNTING LEDGER ===
|E| enumerated universe:                                            1703
coverable (TaxonomyLeaves):                                           33
deletedVariantFolded (container-folded tombstone shapes):             11
outOfScopeFamily (named product-lines):                              450
   - Apps/Secrets: 1        - Treasury: 96                 - Billing Meters/Credits: 48
   - Billing Portal: 5      - Climate: 14                  - Connect Embedded Components: 23
   - Radar: 14              - Terminal: 51                 - Test Helpers: 7
   - Entitlements: 4        - Files: 2                     - Financial Connections: 15
   - Forwarding: 1          - Identity: 8                  - Issuing: 104
   - Reporting: 5           - Sigma: 2                     - Tax: 49
   - Webhook Endpoints (mgmt): 1
informational:                                                          2
webhookEventNames (Event.type discriminator placeholders, not tables): 134 + 17 (2nd pass) = 151
subShapeOfCoverable (embedded structs inside the 33 leaves' own field trees):                839
otherCoreObjectsOutsideRequested34 → refined into 23 named sub-buckets:                       232
  (2 true residual standalones folded into named homes: invoice_rendering_template → "Invoice
   Rendering Templates"; scheduled_query_run → "Sigma")

SUM = 1703   |E| = 1703   MATCH: true
```

Every one of the 1703 enumerated object schemas resolves to exactly one of: **(a)** a
COVERABLE leaf (33), **(b)** a container-folded tombstone variant of a coverable leaf (11 —
Stripe's `deleted_<object>` response shapes for DELETE operations), **(c)** a named
out-of-scope PRODUCT-LINE family (450, 18 named families — §5), **(d)** an INFORMATIONAL
vendor-mechanics shape (2 — error envelope, list envelope), **(e)** a webhook `Event.type`
discriminator placeholder schema (151 — these are enum-like notification-name entries in the
spec, one per `event.type` value, NOT separate syncable tables — Stripe's thin-events design
surfaces each notification name as its own schema entry for typed-SDK codegen purposes), or
**(f)** a sub-shape reachable by walking the 33 coverable leaves' own property trees to depth 4
(839 — e.g. `account_settings`, `charge_fraud_details`, `balance_amount`), or **(g)** a further
23 named "adjacent feature" buckets (232, refined in three passes — Identity's `gelato_*`
internals, Billing Portal's `portal_*` internals, Reserves, Payment Records, Customer Cash
Balance, Confirmation Tokens, Country/Config metadata, etc.) that are genuinely outside the
requested 34-object core but are NOT silently dropped — each is named with regex evidence in
`sources/full-accounting-ledger-FINAL.json`.

**Zero unaccounted residual.** The full per-bucket JSON is preserved on disk for audit.

## 2. Object catalog — the 33 COVERABLE leaves (34 requested, minus 1 provably absent)

`TaxonomyLeaves` (34 requested by task instructions) resolves to **33** after removing
`usage_record`, which is **provably absent from both OpenAPI spec artifacts** — not deferred,
not guessed:

```
$ node -e "... grep for 'usage_record' in spec3.json and spec3.sdk.json paths + schemas ..."
usage_record schema exists:          false
usage_record_summary schema exists:  false
any path with usage_records:         []   (checked: /v1/subscription_items/{id}/usage_records)
```

**Finding (documented gap, not silent drop):** the legacy `POST /v1/subscription_items/{id}/usage_records`
endpoint and `usage_record` object are absent from Stripe's current API surface (version
`2026-06-24.dahlia`). They have been superseded by the **Billing Meters API**
(`/v1/billing/meter_events`, `/v1/billing/meters`, `/v1/billing/meters/{id}/event_summaries`) —
confirmed present in the spec and classified under the "Billing Meters/Credits (usage_record
successor)" out-of-scope family (48 schemas, §5). A connector build targeting metered-usage
billing should target `billing.meter_event` / `billing.meter`, not the removed `usage_record`.
This is flagged in `Gaps` below.

Also corrected: the task's family label **"top_up"** does not exist as an object name — Stripe's
actual object is **`topup`** (no underscore; confirmed against `components.schemas.topup` and
the Postman collection's "Top-ups" folder).

### 2.1 Per-object detail (from `sources/stripe-extraction-v2.json` + `stripe-fk-detection.json`)

All 30 direct (top-level) objects use **cursor pagination** (`has_more` + `starting_after` +
`ending_before`, `limit` 1–100 default 10 — confirmed identical prose across every list endpoint
checked) except `source` and `token`, which are **create-only, no list endpoint** (Stripe never
exposes a bulk-list of raw tokens/sources for security reasons — a genuine, documented API design
choice, not an extraction gap).

| Object | List path | Get-one | Create | Update | Delete | Pagination | Watermark | Fields | FKs |
|---|---|---|---|---|---|---|---|---|---|
| `customer` | `/v1/customers` | `/v1/customers/{customer}` | POST | POST | DELETE | Cursor | `created` | 31 | 4 |
| `charge` | `/v1/charges` | `/v1/charges/{charge}` | POST | POST | — | Cursor | `created` | 45 | 11 |
| `payment_intent` | `/v1/payment_intents` | `/v1/payment_intents/{intent}` | POST | POST | — | Cursor | `created` | 44 | 6 |
| `setup_intent` | `/v1/setup_intents` | `/v1/setup_intents/{intent}` | POST | POST | — | Cursor | `created` | 28 | 7 |
| `payment_method` | `/v1/payment_methods` | `/v1/payment_methods/{payment_method}` | POST | POST | — | Cursor | *(none — customer filter instead)* | 68 | 1 |
| `refund` | `/v1/refunds` | `/v1/refunds/{refund}` | POST | POST | — | Cursor | `created` | 22 | 6 |
| `dispute` | `/v1/disputes` | `/v1/disputes/{dispute}` | — | POST | — | Cursor | `created` | 17 | 2 |
| `balance_transaction` | `/v1/balance_transactions` | `/v1/balance_transactions/{id}` | — | — | — | Cursor | `created` | 16 | 1 |
| `payout` | `/v1/payouts` | `/v1/payouts/{payout}` | POST | POST | — | Cursor | `created` | 27 | 6 |
| `event` | `/v1/events` | `/v1/events/{id}` | — | — | — | Cursor | `created` | 11 | 0 |
| `product` | `/v1/products` | `/v1/products/{id}` | POST | POST | DELETE | Cursor | `created` | 18 | 2 |
| `price` | `/v1/prices` | `/v1/prices/{price}` | POST | POST | — | Cursor | `created` | 21 | 1 |
| `plan` | `/v1/plans` | `/v1/plans/{plan}` | POST | POST | DELETE | Cursor | `created` | 20 | 1 |
| `subscription` | `/v1/subscriptions` | `/v1/subscriptions/{subscription_exposed_id}` | POST | POST | DELETE | Cursor | `created` | 48 | 10 |
| `subscription_item` | `/v1/subscription_items` | `/v1/subscription_items/{item}` | POST | POST | DELETE | Cursor | *(none)* | 13 | 0 |
| `invoice` | `/v1/invoices` | `/v1/invoices/{invoice}` | POST | POST | DELETE | Cursor | `created` | 78 | 9 |
| `invoiceitem` | `/v1/invoiceitems` | `/v1/invoiceitems/{invoiceitem}` | POST | POST | DELETE | Cursor | `created` | 23 | 3 |
| `credit_note` | `/v1/credit_notes` | `/v1/credit_notes/{id}` | POST | POST | — | Cursor | `created` | 34 | 4 |
| `coupon` | `/v1/coupons` | `/v1/coupons/{coupon}` | POST | POST | DELETE | Cursor | `created` | 17 | 0 |
| `promotion_code` | `/v1/promotion_codes` | `/v1/promotion_codes/{promotion_code}` | POST | POST | — | Cursor | `created` | 14 | 1 |
| `tax_rate` | `/v1/tax_rates` | `/v1/tax_rates/{tax_rate}` | POST | POST | — | Cursor | `created` | 18 | 0 |
| `quote` | `/v1/quotes` | `/v1/quotes/{quote}` | POST | POST | — | Cursor | *(none)* | 36 | 8 |
| `account` | `/v1/accounts` | `/v1/accounts/{account}` | POST | POST | DELETE | Cursor | `created` | 23 | 0 |
| `transfer` | `/v1/transfers` | `/v1/transfers/{transfer}` | POST | POST | — | Cursor | `created` | 17 | 5 |
| `application_fee` | `/v1/application_fees` | `/v1/application_fees/{id}` | — | — | — | Cursor | `created` | 15 | 6 |
| `topup` | `/v1/topups` | `/v1/topups/{topup}` | POST | POST | — | Cursor | `created` | 16 | 1 |
| `checkout.session` | `/v1/checkout/sessions` | `/v1/checkout/sessions/{session}` | POST | POST | — | Cursor | `created` | 68 | 7 |
| `payment_link` | `/v1/payment_links` | `/v1/payment_links/{payment_link}` | POST | POST | — | Cursor | *(none)* | 37 | 3 |
| `source` | *(none — create+get only)* | `/v1/sources/{source}` | POST | POST | — | **None** | *(n/a)* | 38 | 0 |
| `token` | *(none — create+get only)* | `/v1/tokens/{token}` | POST | — | — | **None** | *(n/a)* | 9 | 0 |

Nested-only objects (no top-level list — reachable only via a parent):

| Object | Access path | Get-one | Create | Update | Delete | Fields | FKs |
|---|---|---|---|---|---|---|---|
| `person` | `/v1/accounts/{account}/persons` | `.../persons/{person}` | POST | POST | DELETE | 32 | 0 |
| `external_account` | `/v1/accounts/{account}/external_accounts` | `.../external_accounts/{id}` | — | POST | — | *(polymorphic — see §4.3)* | 0 |
| `capability` | `/v1/accounts/{account}/capabilities` | `.../capabilities/{capability}` | — | POST | — | 8 | 1 |

Additional documented nested access-paths (own IOs' sub-collections, not separate top-level
objects but real syncable child collections):

| Access path | Parent | Notes |
|---|---|---|
| `/v1/invoices/{invoice}/lines` | invoice | Invoice line items — cursor-paginated, GET only |
| `/v1/customers/{customer}/sources` | customer | Legacy customer-attached payment sources — cursor-paginated |
| `/v1/checkout/sessions/{session}/line_items` | checkout.session | Checkout line items — cursor-paginated, GET only |
| `/v1/subscription_items/{subscription_item}/usage_record_summaries` | subscription_item | **Confirmed NOT present** in current spec (verified `exists: false`) — dead per the usage_record gap above |

## 3. Pagination — the universal cursor contract (INFORMATIONAL, verified 3 ways)

Verified identically from three independent angles:

1. **The spec's own parameter descriptions** — every list-endpoint `limit` parameter across
   all 30 checked endpoints carries the byte-identical description: *"A limit on the number of
   objects to be returned. Limit can range between 1 and 100, and the default is 10."* The value
   is NOT encoded as JSON Schema `maximum`/`default` (Stripe puts numeric bounds in prose, not
   schema constraints) — so a connector extractor must parse this description text or hardcode
   the confirmed bound (1–100, default 10) as a Tier-1 explicit-statement fact, never invent a
   different bound.
2. **`docs.stripe.com/api/pagination`** (fetched, quoted): response envelope
   `{object:'list', data:[], has_more, url}`; `starting_after`/`ending_before` mutually exclusive;
   reverse-chronological order.
3. **stripe-node's `autoPagination.ts`** (fetched, grepped): implements exactly
   `has_more` / `starting_after` / `ending_before` with `lastId` cursor tracking — the SDK's own
   generated pagination loop matches the spec + docs exactly.

**PaginationType = Cursor** for every list-capable object. `ResponseDataKey = 'data'`.
`IncrementalWatermarkField = 'created'` where the `created` range filter (`anyOf: [range_query_specs{gt,gte,lt,lte}, integer]`, `style: deepObject` → `created[gte]=<unix_ts>`) is present on
the list endpoint — confirmed present on 24 of 30 direct list-capable objects (absent on
`payment_method`, `subscription_item`, `quote`, `payment_link`, `source`, `token` — the last two
have no list endpoint at all; the first four genuinely lack a `created` filter in the spec, so
`IncrementalWatermarkField` is correctly left **undefined** for those per the provable-only rule,
not fabricated).

## 4. Idiosyncrasies (the connector-builder MUST know these)

### 4.1 Every write body is `application/x-www-form-urlencoded`, NOT JSON

```
$ grep content-types across all POST/PUT/PATCH requestBody definitions in spec3.json
form-urlencoded: 292   json: 0   other: 1  (POST /v1/files — multipart/form-data, the sensible
                                             exception for file upload)
```

**Zero JSON request bodies in the entire API.** Every Create/Update operation (292 of them)
sends form-urlencoded data using bracket notation for nested fields (e.g.
`address[line1]=123+Main+St`, `metadata[key]=value`). All 414 GET responses ARE JSON.
This is the single most consequential idiosyncrasy for the connector's HTTP layer — a
generic JSON-POST implementation will not work against Stripe's write path unmodified.

### 4.2 Delete responses are `deleted_<object>` tombstone shapes, ID in body

`DELETE /v1/customers/{customer}` responds `200` with
`{deleted: true, id: '<the deleted id>', object: 'customer'}` (confirmed via
`components.schemas.deleted_customer`, `required: [deleted, id, object]`). So
`DeleteIDLocation = body`. These 11 `deleted_*` schemas are container-folded under their
parent coverable object in the accounting ledger (§1b) — they are NOT separate tables, they are
the DELETE response shape of an already-coverable object.

### 4.3 `external_account` is a genuine polymorphic union, not a standalone schema

```json
{ "anyOf": [{"$ref": "#/components/schemas/bank_account"}, {"$ref": "#/components/schemas/card"}],
  "title": "Polymorphic", "x-resourceId": "external_account" }
```

It has no `properties` of its own (`bank_account` has 19 fields, `card` has 32) — a connector
must dispatch on the returned `object` discriminator (`'bank_account'` vs `'card'`) rather than
expect a single fixed field list for this IO.

### 4.4 FK detection signal — the `x-expansionResources` vendor extension (Tier-1, spec-native)

Stripe's "expandable field" pattern is the load-bearing FK signal, read directly from the
spec's own model (never guessed from field-name heuristics — per the provable-only rule):

```json
"customer": {
  "anyOf": [ {"type": "string", "maxLength": 5000}, {"$ref": ".../customer"}, {"$ref": ".../deleted_customer"} ],
  "description": "ID of the customer this charge is for if one exists.",
  "nullable": true,
  "x-expansionResources": { "oneOf": [ {"$ref": ".../customer"}, {"$ref": ".../deleted_customer"} ] }
}
```

A field is classified FK **iff** it has both (a) an `anyOf` member that is a bare string type
(the un-expanded ID form actually returned by default) and (b) an `x-expansionResources` block
naming the expansion target(s). This pattern was walked across all 33 in-scope schemas via
`sources/stripe-fk-detection.json` — **106 FK fields detected**, correctly distinguishing true
FKs (`charge.customer` → `customer`/`deleted_customer`) from embedded sub-objects that also use
`$ref` but are NOT FKs (`charge.billing_details` → a direct, non-expandable `$ref`, no
`x-expansionResources` — this is embedded data, not a foreign key, and is correctly excluded).

FK target histogram (top entries, from the detector's stdout): `customer` (11 fields point at
it), `account` (10), `balance_transaction` (9), `charge` (8), `invoice` (6), plus 20 out-of-scope
targets confirming product-line boundaries are real (`issuing.authorization`,
`test_helpers.test_clock`, `mandate`, `tax_id`, `review` — each correctly outside the requested 34).

### 4.5 No canonical/contractual ID-prefix list — `id` is the only guaranteed PK contract

Every in-scope schema has a **required, non-expandable `id: string`** property with description
*"Unique identifier for the object."* and an **`object` discriminator** enum (`{enum: [<the object
name>]}`) — both universal and Tier-1 explicit. Human-readable prefixes (`cus_`, `ch_`, `pi_`,
`in_`, `sub_`, `acct_`, etc.) are well-known informally but **Stripe explicitly does not
guarantee them as a fixed contract** — confirmed via search: *"there is no canonical list either
internally or externally... Stripe considers adding or removing fixed prefixes... to be a
backwards-compatible change"* and IDs may be up to 255 characters. **PK detection emits
`IsPrimaryKey=true` on `id` for every object (Tier-1: required + description + universal
presence), but prefix strings are NOT encoded as a structural constraint** — only as an
informational note, since the vendor has explicitly disclaimed them as guaranteed.

### 4.6 Rate limits, idempotency, errors (INFORMATIONAL — confirmed from official docs)

- **Rate limits**: 100 req/s (live), 25 req/s (sandbox/test) per account; `429` +
  `Stripe-Rate-Limited-Reason` header (`global-rate`/`endpoint-rate`/`global-concurrency`/
  `endpoint-concurrency`/`resource-specific`); several documented per-resource overrides
  (Payment Intents 1000 updates/PI/hr; Subscriptions 10 new invoices/sub/min, 20/day; Payouts
  15 create/s; Files 20 read+write/s).
- **Idempotency**: `Idempotency-Key` header, POST-only, 24h server cache, parameter-consistency
  validated on replay with the same key.
- **Errors**: uniform `{error: {type, code, message, param, doc_url, ...}}` envelope
  (`components.schemas.api_errors`) — confirmed present on every error response.

## 5. Named out-of-scope PRODUCT-LINE families (COVERABLE-taxonomy exclusion, evidenced)

Each family below is a real, spec-provable Stripe product surface — excluded from
`TaxonomyLeaves` by deliberate scope decision (§7), not by omission. Evidence = the regex
pattern that matched the schema/path namespace in the accounting-ledger script, cross-checked
against the Postman collection's own top-level folder names (§6) and the path-prefix histogram.

| Family | Schema count (in `spec3.sdk.json`) | Path evidence | Reason for exclusion |
|---|---|---|---|
| Issuing | 104 | `/v1/issuing/*` (20 paths) | Card-issuing program surface (cards, authorizations, disputes) — a distinct product most payments/billing consumers never touch |
| Treasury | 96 | `/v1/treasury/*` (25 paths) | Embedded-banking money-movement ledger — separate product requiring Treasury enrollment |
| Terminal | 51 | `/v1/terminal/*` (17 paths) | In-person POS hardware/readers management |
| Tax | 49 | `/v1/tax/*` (11 paths) | Automated tax calculation/filing product (distinct from the core `tax_rate` object, which IS in scope) |
| Billing Meters/Credits | 48 | `/v1/billing/*` (19 paths) | Modern usage-based billing (the `usage_record` successor) — a distinct metering subsystem, itself out of the requested 34 |
| Financial Connections | 15 | `/v1/financial_connections/*` (11 paths) | Bank-account-linking/read product (Plaid-like) |
| Connect Embedded Components | 23 | (schema-only; no dedicated top-level list path family) | Pre-built embeddable UI config objects for Connect platforms |
| Radar | 14 | `/v1/radar/*` (7 paths) | Fraud-detection rules/review engine |
| Climate | 14 | `/v1/climate/*` (7 paths) | Carbon-removal purchase product |
| Identity | 8 | `/v1/identity/*` (6 paths) | ID-verification product (the `gelato_*` internal schemas) |
| Entitlements | 4 | `/v1/entitlements/*` (4 paths) | SaaS feature-gating product |
| Reporting | 5 | `/v1/reporting/*` (4 paths) | Scheduled report-run generation |
| Billing Portal | 5 | `/v1/billing_portal/*` (3 paths) | Self-serve customer subscription-management portal config |
| Test Helpers | 7 | `/v1/test_helpers/*` (42 paths) | Sandbox-only simulation endpoints (test clocks, etc.) — never present in live mode |
| Sigma | 2 | `/v1/sigma/*` (3 paths) | SQL-based analytics query product |
| Files | 2 | `/v1/files`, `/v1/file_links` | Binary/document upload storage, not a payments/billing record |
| Apps/Secrets | 1 | `/v1/apps/secrets/*` (3 paths) | Stripe Apps marketplace secret-storage |
| Webhook Endpoints (mgmt) | 1 | `/v1/webhook_endpoints` (2 paths) | Webhook subscription CONFIGURATION management (distinct from the `event` object, which IS in scope) |

**Total excluded via named families: 450 of 1703 (26.4%).** Combined with container-folding (11),
webhook event-name placeholders (151), sub-shapes of the 33 leaves (839), informational shapes
(2), and the 23 further-refined "adjacent feature" buckets (232, §1b) — the ledger closes exactly
against the 33 coverable leaves with **zero unaccounted residual**.

## 6. Named taxonomies — COVERABLE vs INFORMATIONAL

Taxonomies below EMERGED from walking the source's own structural signals: the OpenAPI path-prefix
histogram (`/v1/<segment>/...`), the Postman collection's 107 top-level folders (which mirror
docs.stripe.com's sidebar organization closely), and the schema dotted-namespace convention
(`checkout.session`, `billing.meter`, `issuing.authorization`). Stripe's OpenAPI spec carries
**no `tags` array** (`spec.tags` is absent/empty) and operations carry no `x-stripeOperations`
grouping metadata — so taxonomy naming is derived from these three structural signals in
combination, not from a directly-declared vendor grouping field.

### 6.1 COVERABLE taxonomies (map to `TaxonomyLeaves` — the extractor emits IOs from these)

| Taxonomy | Definition | Leaves | Source mapping |
|---|---|---|---|
| **Core Payments** | The primary money-movement objects | `charge`, `payment_intent`, `setup_intent`, `payment_method`, `refund`, `dispute`, `balance_transaction`, `source`, `token` | `spec3.json` paths `/v1/charges`, `/v1/payment_intents`, `/v1/setup_intents`, `/v1/payment_methods`, `/v1/refunds`, `/v1/disputes`, `/v1/balance_transactions`, `/v1/sources`, `/v1/tokens`; Postman folders "Charges", "Payment Intents", "Setup Intents", "Payment Methods", "Refunds", "Disputes", "Balance Transactions", "Sources", "Tokens" |
| **Money Movement (Connect payouts/fees)** | Cross-account settlement objects | `payout`, `transfer`, `application_fee`, `topup` | `/v1/payouts`, `/v1/transfers`, `/v1/application_fees`, `/v1/topups`; Postman "Payouts", "Transfers", "Application Fees", "Top-ups" |
| **Products & Pricing** | Catalog objects for what's being sold | `product`, `price`, `plan`, `coupon`, `promotion_code`, `tax_rate` | `/v1/products`, `/v1/prices`, `/v1/plans`, `/v1/coupons`, `/v1/promotion_codes`, `/v1/tax_rates`; Postman "Products", "Prices", "Coupons", "Promotion Codes", "Tax Rates" |
| **Billing & Subscriptions** | Recurring-revenue objects | `customer`, `subscription`, `subscription_item`, `invoice`, `invoiceitem`, `credit_note`, `quote` | `/v1/customers`, `/v1/subscriptions`, `/v1/subscription_items`, `/v1/invoices`, `/v1/invoiceitems`, `/v1/credit_notes`, `/v1/quotes`; Postman "Customers", "Subscriptions", "Invoices", "Invoice Items", "Credit Notes", "Quotes" |
| **Connect (Platform/Accounts)** | Multi-party account-management objects | `account`, `person`, `external_account`, `capability` | `/v1/accounts`, `/v1/accounts/{account}/persons`, `/v1/accounts/{account}/external_accounts`, `/v1/accounts/{account}/capabilities`; Postman "Accounts", "Persons" |
| **Checkout & Payment Links** | Hosted-purchase-flow objects | `checkout.session`, `payment_link` | `/v1/checkout/sessions`, `/v1/payment_links`; Postman "Checkout", "Payment Links" |
| **Events (webhook object model)** | The change-notification record | `event` | `/v1/events`; Postman "Events" — NOTE: the 151 `<object>.<verb>` schema entries in `spec3.sdk.json` (e.g. `charge.captured`, `invoice.paid`) are `event.type` discriminator VALUES, not separate objects — they are folded into the single `event` leaf, not enumerated as 151 additional leaves (§1b) |

**L1-container note**: none of Stripe's product-line groupings (Issuing, Treasury, Billing, etc.)
function as a true "L1 container ↔ L2 leaves" hierarchy the way, e.g., HubSpot's Areas do — Stripe
has no declared parent/child relationship between a product-line name and its member objects in
the spec itself (no `tags`, no grouping field). The 7 COVERABLE taxonomies above are informal,
evidence-derived groupings for readability; `TaxonomyLeaves` is the flat union of their 33
member objects, and no taxonomy name itself is emitted as an IO.

### 6.2 INFORMATIONAL taxonomies (inform extraction logic; not emitted as IOs)

| Taxonomy | Definition | Source mapping |
|---|---|---|
| **API Mechanics** | Pagination, idempotency, rate-limits, error envelope, versioning | `docs.stripe.com/api/pagination`, `/api/idempotent_requests`, `/rate-limits`; `components.schemas.api_errors`, `.error`, `.list` |
| **Write-Body Encoding** | Universal `application/x-www-form-urlencoded` write contract (§4.1) | `spec3.json` — 292/293 POST/PUT/PATCH requestBody content-type checks |
| **Expandable-Field / FK Convention** | The `anyOf[string, $ref...] + x-expansionResources` pattern (§4.4) | `spec3.json` per-field vendor extension, walked across all 33 in-scope schemas |
| **Delete-Response Convention** | `deleted_<object>` tombstone shape, `{deleted:true, id, object}` (§4.2) | 11 `deleted_*` schemas in `components.schemas` |
| **Polymorphic-Union Convention** | `external_account` (`bank_account`\|`card`), and similarly `checkout.session.payment_method_options` etc. use `anyOf` unions with an `object`/type discriminator | `components.schemas.external_account` (`title: "Polymorphic"`) |
| **CRUD Verb Convention** | Update is always `POST` (never `PATCH`/`PUT`); Delete is `DELETE` where supported, otherwise absent (soft-delete-by-`active:false` pattern for `product`/`price`/`plan`/`coupon` is a documented alternative to hard delete) | `spec3.json` per-operation `paths.*.{post,delete}` presence, cross-tabulated in §2.1 |
| **Product-Line Namespace Convention** | Dotted (`checkout.session`, `billing.meter`) and path-prefixed (`/v1/issuing/*`) namespacing marks a schema/path as belonging to a specific product surface | Path-prefix histogram (§5) + dotted-schema-name histogram, both derived by script from `spec3.sdk.json` |

## 7. Scope decision (feeds the floor's `scope-unjustified-thin` gate)

The full 1703-object universe is known and closed (§1b) — the 33-leaf in-scope set is a
**deliberate, evidenced narrowing**, not an under-enumeration. See `scopeDecision` in the
structured return for the machine-readable form; narrative justification:

- **In-scope rationale**: the 33 leaves cover the complete payments-processing lifecycle
  (customer → payment method/intent → charge/refund/dispute), the complete billing lifecycle
  (product/price/plan → subscription/subscription_item → invoice/invoiceitem/credit_note →
  coupon/promotion_code/tax_rate/quote), the complete Connect platform-account lifecycle
  (account/person/external_account/capability), money-movement settlement (payout/transfer/
  application_fee/topup), the hosted-checkout surface (checkout.session/payment_link), and the
  universal change-notification record (event) plus the two create-only security-sensitive
  primitives (source/token). This is the object set virtually every payments/billing data-sync
  consumer needs.
- **Out-of-scope rationale**: the 18 excluded families (§5) are each a **specialized, separately
  enrollable Stripe product** (Issuing requires a card-issuing program; Treasury requires embedded-
  banking enrollment; Identity/Radar/Climate/Tax/Sigma/Reporting/Terminal/Financial Connections
  are each opt-in vertical products) that a payments/billing-focused connector build would not
  ingest by default. Each is fully provable in the spec (confirmed path + schema counts, §5) —
  the narrowing is a scope choice made WITH full knowledge of the universe, not a discovery
  failure.

## 8. Gaps (honest negatives — no source covers these)

| Area | Reason |
|---|---|
| `usage_record` object / legacy metered-billing endpoint | **Provably removed** from the current OpenAPI spec (both `spec3.json` and `spec3.sdk.json`, API version `2026-06-24.dahlia`) — confirmed via direct schema + path search, zero matches. Superseded by the Billing Meters API (`billing.meter_event`/`billing.meter`), which is itself out-of-scope per §7. A connector targeting usage-based billing needs a **separate scope decision** to bring in the Billing Meters family; it cannot target the requested `usage_record` name at all. |
| Canonical ID-prefix contract (`cus_`, `ch_`, etc.) | Stripe **explicitly disclaims** a guaranteed/contractual prefix list (§4.5) — no source (official or community) can supply this as a hard constraint; only `id` (string, ≤255 chars) + the `object` discriminator are guaranteed. |
| Postman-collection-native path enumeration | The shared `enumerate-catalog.mjs` Postman parser does not handle Stripe's structured (non-`raw`) URL encoding (§1a) — worked around via the OpenAPI spec as primary + an ad hoc corroboration script, but the shared tool itself has a real, narrow gap for this URL shape that a future enumerator revision should address. |
| Full JSON Schema numeric bounds on `limit` | Stripe encodes the 1–100/default-10 pagination bound in **prose**, not `schema.maximum`/`schema.default` (§3) — confirmed absent from the JSON Schema itself on every checked endpoint; the bound is Tier-1 ExplicitStatement from description text + corroborating docs page, not a structural JSON Schema constraint. |
