# INDEPENDENT_REVIEW.md — Stripe Phase 2c extraction (amendment round 1)

**Reviewer model:** Sonnet 5 (per session context; distinct model surface from the producer/coordinator per the v2 charter).

## What this review CAN and CANNOT certify (read first, verbatim per charter)

This is a **same-source LINT review**, not a live-verification pass. I re-read the same
credential-free sources the producer extracted from (`SOURCE_STUDY.md`, the saved `sources/*.json`
artifacts, and a direct independent re-parse of `spec3.sdk.json` on disk via small Node scripts —
never the full 1703-schema spec loaded into my context) and checked the emission
(`metadata/integrations/stripe/.stripe.integration.json`) against my own independently-built
expectation, plus the bijection slot table (`floor/phase0-slots.json`).

**I CANNOT and do NOT certify**: that `/v1/customers` etc. are LIVE-correct against a real Stripe
account, that `starting_after`/`ending_before` cursor pagination actually advances against real data,
that any declared PK is populated in real records, that the `created[gte]=` watermark param is
accepted by the live API, or that the write surface (POST/DELETE) genuinely exists and behaves as
documented. Those are the Reality Probe (S7) / live-E2E (T8) stages' job, which run after this
review. **This review is a LINT green at most — never present it as live/empirical verification.**

## Context — this is amendment round 1, not a fresh review

A prior review round (`packages/Integration/connectors-registry/stripe/runs/connector-stripe-1783019415445-1a1b4b9d/INDEPENDENT_REVIEW.md`)
already ran against an earlier state of this emission and found 2 Blocking + 2 Advisory gaps. I
independently re-verified all four and confirmed **all four are now fixed** in the current metadata
file (see "Reviewer Errors" §4 below, items 1–4, documented as errors-avoided rather than re-litigated
as new findings, since re-confirming a fix is a distinct activity from finding it). This round's job
is to find what neither the producer nor that prior round caught — I built my own expected inventory
from `SOURCE_STUDY.md` before opening the emission, per the strict read-order discipline. My scratch
file: `/private/tmp/claude-501/-Users-bcladmin-Projects-MemberJunction-MJ/aa02e2e2-74fa-4ed1-bcec-caab81ea7f51/scratchpad/stripe_reviewer_expected.txt`.

**Verdict: 1 Confirmed Gap (Blocking), 1 Confirmed Gap (Advisory), 2 Judgment Calls, 5 Reviewer Errors
avoided.** The emission is materially sound: capability honesty, FK-vs-access-path discrimination,
cursor pagination, the Update=POST idiosyncrasy, and bijection value-presence all check out cleanly
across a full mechanical sweep of the 55-IO / 1321-field emission. The one blocking finding is a
single-object watermark-field-doesn't-exist defect — a real, narrow, mechanically-fixable bijection
violation, not a systemic problem.

---

## 1. Confirmed gaps (blocking)

### Gap 1 (BLOCKING) — `invoiceitem.IncrementalWatermarkField = 'created'` but `invoiceitem` has no `created` field

**What the gap is**: The `invoiceitem` IO declares `SupportsIncrementalSync=true` with
`IncrementalWatermarkField='created'`. But the `invoiceitem` OpenAPI schema has **no `created`
property at all** — its actual timestamp field is named `date`.

**Source citation**: independently re-parsed `sources/spec3.sdk.json` directly (not via the
producer's extraction script):
```
$ node -e "console.log(Object.keys(spec.components.schemas.invoiceitem.properties).sort())"
[amount, currency, customer, customer_account, date, description, discountable, discounts,
 id, invoice, livemode, metadata, net_amount, object, parent, period, pricing, proration,
 proration_details, quantity, quantity_decimal, tax_rates, test_clock]
```
`created` is absent; `date` is present. I confirmed this identically against both `spec3.json` and
`spec3.sdk.json` (same property set in both spec variants). I then ran a full programmatic sweep of
all 29 emitted IOs carrying a non-null `IncrementalWatermarkField` and cross-checked each against its
own spec schema's property list — `invoiceitem` is the **sole** violation; all 28 others (`account`,
`charge`, `customer`, `invoice`, `payout`, `subscription`, etc.) genuinely declare a `created`
property.

**What the producer's artifacts say**: The run directory's `output/DUAL_DERIVATION.json` (a stale,
15:44–15:46-timestamped artifact predating the metadata file's last edit) already flagged this exact
defect under `manualVerificationNotes.watermarkMismatchVerified`, explicitly calling it a "CONFIRMED
REAL DEFECT, independently verified by direct source inspection." **This confirms the producer's own
tooling caught it — but the defect is still present in the current, most-recently-edited metadata
file.** It was not carried forward into a fix, unlike the four gaps from the prior INDEPENDENT_REVIEW
round, which were all remediated.

**Severity**: Blocking. This is a bijection/provenance violation — a hard-constraint field
(`IncrementalWatermarkField`) asserting a value with no corresponding field in the emission or the
source schema. A connector consuming this at runtime would send `created[gte]=<ts>` as a filter
against `/v1/invoiceitems`, which either silently no-ops (if Stripe ignores unknown filter params) or
errors — either way, incremental sync for `invoiceitem` is broken as declared today.

---

## 2. Confirmed gaps (advisory)

### Gap 2 (ADVISORY) — 9 real, `id`-bearing schemas fall through both scope-tracking mechanisms with zero recorded reason

**What the gap is**: The extractor's own `extract-io-iof.mjs` classifies every enumerated schema into
exactly one of: emitted, `OOS_PREFIXES`/`OOS_PLAIN` (out-of-scope product family), `NON_SYNCABLE`
(short-lived helper/session shape), or a deleted-tombstone. I independently re-ran this classification
logic against the 25-name gap list the run's own `output/DUAL_DERIVATION.json` had already surfaced
(`objectSetDivergence.note`), and found **9 of those 25 match none of the extractor's skip categories
and are also absent from `Integration.Configuration.OutOfScopeObjectFamilies`** (which sums to exactly
449 schemas across 18 named families — verified by direct sum): `application`,
`connect_collection_transfer`, `discount`, `reserve.hold`, `reserve.plan`, `reserve.release`,
`reserve_transaction`, `source_mandate_notification`, `tax_deducted_at_source`.

**Source citation**: independently re-parsed `sources/spec3.sdk.json` and confirmed all 9 are
real, well-formed, `id`-bearing (or `object`-discriminated) schemas — e.g.:
```
$ node -e "console.log(Object.keys(spec.components.schemas.discount.properties))"
[checkout_session, customer, customer_account, end, id, invoice, invoice_item, object,
 promotion_code, source, start, subscription, subscription_item]
```
`discount` in particular is referenced by several in-scope objects as an embedded field
(`customer.discount`, confirmed emitted as `Type=json`) — it is a real top-level schema with FK-like
scalar references to `customer`/`invoice`/`subscription`/`checkout_session`, sitting squarely in the
same "sub-shape of a coverable leaf, arguably promotable" tier as `line_item` or
`payment_intent_amount_details_line_item` (both of which WERE promoted to standalone IOs in this
55-object emission).

**What the producer's artifacts say**: `output/DUAL_DERIVATION.json` already names all 25 candidates
by name and correctly labels them "genuine candidates for either (a) an amended
`OutOfScopeObjectFamilies` entry, or (b) inclusion in a future scope expansion" — so the producer's
own tooling is aware of the set. But neither disposition happened for 9 of the 25 (the other 16 are
covered by `NON_SYNCABLE`/`OOS_PLAIN`/`OOS_PREFIXES` even though not literally named in the
`OutOfScopeObjectFamilies` config block — those 16 are a documentation-only gap, not a coverage gap;
I do not count them as part of this finding).

**Severity**: Advisory, not blocking. None of the 55 already-emitted objects lose data because of
this — it is a completeness gap in the accounting/scope-decision layer, not in the emitted rows
themselves. It does not trip the `scope-unjustified-thin` gate (the documented 449-schema
`OutOfScopeObjectFamilies` total plus the 55 emitted objects still accounts for the overwhelming
majority of the 1703-schema universe with clear, evidenced reasoning). A future pass should either (a)
add a 19th `OutOfScopeObjectFamilies` entry (e.g. "Connect Reserves" for the 4 `reserve.*`/
`reserve_transaction` schemas) or (b) promote `discount` given its embedded-FK relevance to the
in-scope billing objects.

---

## 3. Judgment calls

### JC 1 — `IsRequired` derived from the OpenAPI **response** schema's `required` array, not the create-body's required params

**What the producer chose**: `IsRequired=true` is set wherever the vendor's `components.schemas.<X>`
top-level `required` array lists the field (e.g. `charge.required` includes `customer`,
`payment_intent`, `billing_details`, and 38 others — nearly the entire property list).

**What I would have chosen**: Stripe's OpenAPI `required` array on a response-object schema means
"the JSON key is always present in the response payload" (Stripe returns `null` rather than omitting
keys) — not "the API caller must supply this on create." I independently confirmed `POST /v1/charges`'
own request-body schema (`requestBody.content['application/x-www-form-urlencoded'].schema`) has **no
`required` array at all** — a materially different, and for a write-body validation use case more
relevant, source of truth. `.claude/rules/extractor-script-conventions.md`'s sibling doc
(`connector-code-conventions.md`) frames `IsRequired` as "a create-time constraint," which the
producer's choice does not strictly match for a GET-response-derived value.

**Why neither is wrong**: Both readings are genuinely present, Tier-1 `ExplicitStatement` facts in the
spec — the producer's choice (response-required) is the ubiquitous, uniformly-available signal across
all 55 objects, whereas Stripe's create-body schemas frequently omit a `required` array altogether
(so a strict create-time interpretation would leave `IsRequired` almost universally `false`/undefined,
arguably a worse outcome for downstream field-mapping consumers who want to know "is this key always
populated"). This is a genuine, source-grounded interpretive choice between two valid readings of an
ambiguous vendor convention, not an error.

### JC 2 — Scope line between the 22 objects promoted beyond SOURCE_STUDY's 33-leaf plan and the objects left unpromoted

**What the producer chose**: emitted 55 IOs (33 planned leaves + 22 additional sub-shapes:
`balance`, `balance_settings`, `cash_balance`, `credit_note_line_item`,
`customer_balance_transaction`, `customer_cash_balance_transaction`, `fee_refund`, `invoice_payment`,
`invoice_rendering_template`, `item`, `line_item`, `mandate`, `payment_attempt_record`,
`payment_intent_amount_details_line_item`, `payment_record`, `payment_source`, `setup_attempt`,
`shipping_rate`, `source_transaction`, `subscription_schedule`, `tax_id`, `transfer_reversal`), while
leaving `discount` and the other 8 objects in Gap 2 above unpromoted with no explicit disposition.

**What I would have chosen**: I would have promoted `discount` at minimum, given it has real scalar
FK-like references into 4 already-emitted core billing objects (`customer`, `invoice`, `subscription`,
`checkout.session`) — a stronger promotion signal than several already-promoted objects like
`payment_attempt_record` or `shipping_rate`, which read as more peripheral.

**Why neither is wrong**: every object on both sides of this line is provably real, and the full
1703-schema universe is closed with zero silent drops (SOURCE_STUDY §1b's ledger, independently
re-verified: 55 emitted + 449 out-of-scope-family + tombstones/informational/sub-shapes/event-name
placeholders + the 9-object Gap-2 residual ≈ 1703). This is a scope-breadth choice within an
already-fully-enumerated universe, not a discovery failure — reasonable reviewers would draw the
promotion line in slightly different places.

---

## 4. Reviewer errors (honestly documented)

1. **Suspected**: on first inspection, every `SupportsCreate`/`SupportsUpdate`/`SupportsDelete` field
   reading `undefined` across all 55 IOs looked like a capability-honesty catastrophe (the GZ #30
   class the task specifically flagged me to weight toward). **Resolution**: those three field names
   don't exist as columns in the deployed `MJ: Integration Objects` schema at all — the real
   capability signal is `SupportsWrite` (boolean) plus the per-operation `Create/Update/DeleteAPIPath`
   +`Method` columns, which are populated correctly and extensively (37/55 objects `SupportsWrite=true`
   with a full write-path bijection sweep showing 0 violations). No gap — I was querying non-existent
   fields.

2. **Suspected**: `output/contract.json`'s dual-derive summary ("2 emitted object(s) NOT re-derivable
   from the source: `external_account`, `payment_source`") looked like real fabrication. **Resolution**:
   independently confirmed both are genuine `anyOf`-only polymorphic union schemas in `spec3.sdk.json`
   (`external_account`: `anyOf:[bank_account,card]`; `payment_source`:
   `anyOf:[account,bank_account,card,source]`), with no `properties` of their own — a naive
   schema-first re-derivation tool that requires a direct `properties` block will always flag these as
   "not re-derivable," which is a tooling limitation, not an emission defect. `output/DUAL_DERIVATION.json`
   itself independently reaches the same conclusion in its `objectsExtraExplained` block. No gap.

3. **Suspected**: `output/contract.json`'s "94 record types not emitted" and
   `output/DUAL_DERIVATION.json`'s 92/94-count variants looked like a massive under-enumeration.
   **Resolution**: cross-referenced the full missing-object list against
   `Integration.Configuration.OutOfScopeObjectFamilies` (18 named families, summing to exactly 449
   schemas — verified) and confirmed the overwhelming majority collapse onto documented, evidenced
   scope exclusions (Issuing, Treasury, Tax, Billing Meters, etc.). Only 9 of ~94 are genuinely
   unaccounted (Gap 2 above) — the headline "94 missing" framing in the stale contract artifacts
   dramatically overstates the actual residual gap once the documented scope decision is applied.

4. **Suspected**: the prior review round's Gap 1 (missing `TargetField` citation suffixes for
   `CredentialTypeID`/`IsPrimaryKey`/`RelatedIntegrationObjectID`) and Gap 2
   (`dispute.CreateAPIPath` mislabeled as the `/close` action) were still open and I should re-report
   them as fresh blocking findings. **Resolution**: independently re-verified both against the
   *current* `CODE_EVIDENCE.json`/`PROVENANCE.json` (all three required suffixes now present as
   distinct `TargetField` entries) and the current `dispute` IO (`CreateAPIPath`/`CreateMethod` now
   `null`; `UpdateAPIPath` correctly resolves to the real `POST /v1/disputes/{dispute}` update
   endpoint, confirmed to exist independently in the spec, distinct from `/close`). Both are fixed. Not
   re-reported as new gaps; documented here as confirmed remediations.

5. **Suspected**: `charge` field count (48 in the emission) vs. SOURCE_STUDY's own narrative table
   (45) looked like an emission over-count / possible fabrication of 3 extra fields.
   **Resolution**: independently counted `spec.components.schemas.charge.properties` directly — 48,
   exactly matching the emission. Repeated for `product` (19 vs. table's 18), `invoice` (79 vs. 78),
   `source` (39 vs. 38), `subscription_item` (14 vs. 13), `dispute` (18 vs. 17), `payment_intent`
   (45 vs. 44) — every single case, the emission's count exactly matches the spec's real property
   count, and SOURCE_STUDY's informal prose table is the one that is off by one or a few. No gap in
   the emission; the discrepancy is in the study's own summary table.

---

## 5. Mechanical bijection + plausibility sweep (full 55-IO emission, plus a targeted ~15-field sample)

All checks below were run via small Node scripts against the metadata file directly (never the full
spec loaded into context, per SLIM MODE instructions):

| Check | Result |
|---|---|
| `SupportsWrite=true` with zero write columns populated at all | 0 violations / 55 IOs |
| `SupportsWrite=false` with a write path set anyway | 0 violations |
| `Create/Update/DeleteAPIPath` set without matching `Method` | 0 violations |
| `SupportsIncrementalSync=true` with null `IncrementalWatermarkField` | 0 violations |
| `IncrementalWatermarkField` set but `SupportsIncrementalSync` not true | 0 violations |
| **`IncrementalWatermarkField` value not present as an emitted field on that IO** | **1 violation: `invoiceitem` (Gap 1)** |
| `UpdateMethod` value histogram | 100% `POST` — zero PATCH/PUT (Stripe idiosyncrasy correctly honored) |
| `DeleteMethod` value histogram | 100% `DELETE` |
| `DeleteAPIPath` set without `DeleteIDLocation` | 0 violations (12/12 = `body`, matching the `deleted_<object>` tombstone shape) |
| `CreateBodyShape`/`UpdateBodyShape` distribution | 100% `flat` (40 create, 35 update) — correct for Stripe's form-urlencoded-flat convention, zero spurious `wrapped` |
| `PaginationType` distribution | `Cursor`: 48, `None`: 7 — matches list-endpoint-vs-create-only-object split |
| Cursor param name (all Cursor objects) | 100% `starting_after`/`ending_before` — never offset/page/skip |
| FK target resolution (`RelatedIntegrationObjectID` → sibling IO) | 104/104 resolve to a real, emitted sibling IO name this run; zero dangling/mismatched, including dotted `checkout.session` |
| `@parent:` qualifier convention on FK lookups | 100% use `@parent:IntegrationID` (never `@parent:ID`) — correct per metadata-file-conventions.md |
| Nested collections mismarked as scalar FK | 0 found (`customer.tax_ids`, `customer.subscriptions`, `invoice.lines`, checkout `line_items` all correctly typed `json`, no `RelatedIntegrationObjectID`) |
| Zero-field IOs | 0 / 55 (range 2–88 fields) |
| IOs with zero `IsPrimaryKey=true` field | 3 (`balance`, `balance_settings`, `cash_balance`) — independently confirmed all 3 genuinely lack an `id` property in the spec; correct, not a gap |
| IOs with multiple `IsPrimaryKey=true` fields | 0 |
| Plurality mismatch in emitted IO names | 0 (only `balance_settings` ends in "s," and that is the vendor's own literal singular object name) |
| Non-nullable `phase0-slots.json` slot presence (`Integration.CredentialTypeID`, `IntegrationObject.{Name,SupportsPagination,SupportsIncrementalSync,SupportsWrite,MetadataSource,Status}`, `IntegrationObjectField.{Name,Type,IsRequired,IsReadOnly,IsUniqueKey,IsPrimaryKey,Status}`) | 0 missing across all 55 IOs / 1321 IOFs |
| `EvidenceStrength` histogram (PROVENANCE.json) | `ExplicitStatement: 33, ImpliedFromExample: 3, InferredFromContext: 0` |
| ~15-field targeted sample (`charge.customer`, `charge.payment_intent`, `charge.id`, `invoice.subscription`, `invoice.customer`, `invoice.status`, `subscription.customer`, `subscription.items`, `payment_intent.payment_method`, `payment_intent.amount`, `product.id`, `price.product`, `plan.product`, `refund.charge`, `refund.payment_intent`) | All 15 plausible and correct — PKs on `id`, FKs correctly resolved (`customer`→customer, `payment_intent`→payment_intent, `product`→product, `charge`→charge), nested `subscription.items` correctly `json`/no-FK |

**Capability-honesty verdict (the task's primary flagged risk class — GZ #30): PASS.** Stripe is
heavily write-capable and the emission honestly reflects that: 37/55 objects `SupportsWrite=true`
with fully-populated per-operation Create/Update/Delete columns, `Configuration.WriteCapability`
narrative explicitly states "heavily write-capable... NOT pull-only," and
`Integration.Configuration.OutOfScopeObjectFamilies` records the 449-schema breadth the connector
deliberately did NOT bring in scope (an evidenced scope decision, not a silent narrowing). This is the
opposite of the GrowthZone #30 failure mode.

---

## FixInstructions

```json
[
  {
    "slot": "io.invoiceitem.IncrementalWatermarkField",
    "operation": "rename",
    "before": "created",
    "after": "date",
    "evidence": "packages/Integration/connectors-registry/stripe/sources/spec3.sdk.json#components.schemas.invoiceitem.properties (no 'created' property; 'date' is the object's timestamp field)",
    "rationale": "invoiceitem has no 'created' field in either spec3.json or spec3.sdk.json; its actual timestamp field is 'date'. SupportsIncrementalSync=true with a nonexistent watermark field breaks incremental sync for this object as declared. Independently confirmed against both spec variants; also already flagged by the producer's own stale output/DUAL_DERIVATION.json (manualVerificationNotes.watermarkMismatchVerified) but never carried into a fix."
  },
  {
    "slot": "io.invoiceitem.Configuration.incrementalWatermark",
    "operation": "set",
    "before": "{\"field\":\"created\",\"paramForm\":\"created[gte]=<unix_timestamp>\",\"style\":\"deepObject\"}",
    "after": "{\"field\":\"date\",\"paramForm\":\"date[gte]=<unix_timestamp>\",\"style\":\"deepObject\"}",
    "evidence": "packages/Integration/connectors-registry/stripe/sources/spec3.sdk.json#paths./v1/invoiceitems.get.parameters (confirm 'date' range-filter parameter name before finalizing paramForm)",
    "rationale": "Configuration.incrementalWatermark must stay in lockstep with IncrementalWatermarkField; leaving it pointing at 'created' after the field-level rename reintroduces the same defect at the Configuration layer. Producer should re-check /v1/invoiceitems' list-endpoint parameter name for the date range filter (likely 'date[gte]' by analogy with the universal 'created[gte]' convention) before writing the exact paramForm string."
  },
  {
    "slot": "integration.Configuration.OutOfScopeObjectFamilies",
    "operation": "set",
    "before": "18 named families (449 schemas total); application, connect_collection_transfer, discount, reserve.hold, reserve.plan, reserve.release, reserve_transaction, source_mandate_notification, tax_deducted_at_source are absent from both this list and the extractor's OOS_PREFIXES/OOS_PLAIN/NON_SYNCABLE skip sets",
    "after": "Either (a) add a 19th family entry (e.g. {family:'Connect Reserves', schemaCount:4, reason:'reserve.hold/plan/release + reserve_transaction — Connect platform reserve-fund holds, a narrow sub-feature most payments/billing consumers do not need'}) covering reserve.hold/reserve.plan/reserve.release/reserve_transaction, plus a second small entry or NON_SYNCABLE-set addition for application/connect_collection_transfer/source_mandate_notification/tax_deducted_at_source, OR (b) promote discount to a standalone IO (it has real scalar FK-like references to customer/invoice/subscription/checkout.session, comparable in kind to already-promoted sub-shapes like line_item) and document the remaining 8 with an explicit disposition.",
    "evidence": "packages/Integration/connectors-registry/stripe/runs/connector-stripe-1783019415445-1a1b4b9d/output/DUAL_DERIVATION.json#objectSetDivergence.note (already names all 9 by name); packages/Integration/connectors-registry/stripe/sources/spec3.sdk.json#components.schemas.{application,connect_collection_transfer,discount,reserve.hold,reserve.plan,reserve.release,reserve_transaction,source_mandate_notification,tax_deducted_at_source}",
    "requiresEscalation": true,
    "rationale": "Advisory, not mechanically fixable in one line — requires a producer judgment call on which of the two dispositions (out-of-scope-family vs. promote) is correct for each of the 9 objects. Not blocking because it doesn't affect the correctness of the 55 already-emitted objects; flagged for the producer to close before the next full audit."
  }
]
```

---

## Stats block

```json
{
  "ConfirmedGapsBlocking": 1,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 2,
  "ReviewerErrors": 5,
  "IndependentSourcesFetched": 2,
  "BijectionViolationsFound": 1,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/stripe/INDEPENDENT_REVIEW.md"
}
```

`IndependentSourcesFetched: 2` = (1) `sources/spec3.sdk.json` (independently re-parsed on disk via
ad hoc Node scripts, cross-checked against every emitted field count, PK, FK target, watermark field,
and pagination convention cited above — not re-fetched over the network, since the task's SLIM MODE
instruction explicitly directs working from the saved artifact rather than a fresh network round-trip
for a 10MB spec already on disk with a verified-reachable provenance trail); (2) the bijection slot
table `packages/Integration/connector-builder-workshop/floor/phase0-slots.json`, read directly to
derive the non-nullable slot list checked in §5. No WebFetch/curl network calls were made this round
(the disk-cached spec is the authoritative, already-provenance-verified artifact; re-fetching it would
not change any finding and would violate the SLIM MODE budget instruction).
