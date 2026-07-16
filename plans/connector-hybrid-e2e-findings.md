# Connector hybrid-e2e against the REAL Integrations artifacts — findings & per-connector changes

Ran all 6 connectors as their **actual shipped packages** (`@memberjunction/connector-*`, built from
each PR branch, loaded into MJAPI via `dynamicPackages`, resolving the workspace merged engine) through
the **real production pipeline** (SQL Server → MJAPI → CreateConnection → discover → ApplyAll → sync →
CRUD), asserting **every object forward + every writable object bidirectional**.

Key methodology note: **fresh cycles are the reliable measure.** Re-running an already-materialized
connector on the same MJAPI hangs, and *accumulate* runs (many connectors materialized at once) give
degraded numbers — e.g. Stripe `payment_source` synced **0 rows** under accumulate but **3 rows** in a
clean run. Every number below marked "fresh" is from a clean cycle (DB reset + MJAPI restart + one
connector); "accumulate" numbers are pessimistic and pending a fresh re-run.

## Scorecard

| Connector | PR | Fresh forward | Bidirectional | Verdict |
|---|---|---|---|---|
| **Zendesk** | #52 (open) | **96 / 96** | **43 / 43** | ✅ FULL green (all cells) |
| **Eventbrite** | merged | **26 / 27** (1 get-by-id) | ✅ | ✅ FULL green (all cells) |
| **WildApricot** | #33 (open) | **25 / 25** | ✅ | ✅ FULL green (all cells) |
| **Blackbaud** | #34 (open) | **57 / 58** (1 get-by-id) | **6 / 6** | ⚠️ fwd+bidir green; incremental red + 1 update-shape |
| **Stripe** | merged → **#57** | 55 / 56 (1 structural) | 32 / 32 | ⚠️ fwd+bidir green; incremental red |
| **MagnetMail** | #50 (open) | **18 / 19** (SOAP) | fixture | ✅ SOAP protocol proven (auth+fetch+XML parse); 1 obj + writes = fixture work |

**Final categorization:**
- **Fully proven, every cell green: Zendesk, Eventbrite, WildApricot.**
- **Forward-all-objects + bidirectional-all-writable green: Blackbaud, Stripe.** Their only reds are the
  **2nd-sync incremental/idempotency** cells (watermark filter not issued on the incremental-declared
  objects; content-hash re-writes a handful of records) — a real connector-behavior item, shared by both,
  not the forward/bidir contract.
- **SOAP protocol proven: MagnetMail.** Through the real pipeline the connector authenticates over SOAP,
  POSTs SOAP requests, and parses the XML responses for **18 of 19 enumerable objects** — end-to-end proof
  the SOAP connector works. The one remaining object (`Links` / `getLinkURLs`) *matched* its route but
  extracted 0 rows: a record-element-name detail in my **hand-authored SOAP fixture** (the record element
  I emitted ≠ what the connector's `NormalizeResponse` deep-finds for that op), NOT a connector defect.
  Write/incremental cells would need create-routes added to the SOAP fixture.

**How WildApricot went 0/25 → 25/25:** not a framework bug after all. The connector reads the base URL from
`p.apiBaseUrl ?? p.BaseURL ?? p.baseHost` (never `BaseHost`), so the harness must pass `cfgKey=BaseURL`; and
the `AccountId` cred had to be *removed* so the connector auto-discovers `accountId=1` (matching the fixture)
via `GET /accounts` instead of being handed a mock value that mismatched. Both are test-rig knobs — the
connector is correct.

Both mock-credential blocks (Blackbaud `SubscriptionKey`, and the WildApricot `AccountId` over-supply) were
closed by adjusting the generic cred set; Blackbaud jumped 0/56 → 57/58 once its subscription-key header was
supplied.

> **CORRECTION (important):** the pessimistic nested-connector numbers were **accumulate artifacts**, not
> real gaps. Eventbrite read 15/25 with "12 blocked children" under accumulate but is **26/27 full green in
> a fresh cycle** — its FK-declared *and* FK-thin children (Attendee, Event Team, Ticket Class, Question)
> all sync. So the earlier "these connectors have nested-child gaps" conclusion was largely wrong; the
> connectors are healthier than the degraded runs implied. Re-run each in a clean cycle before trusting a
> failure as a real defect.

## Two categories of gap — keep them separate

**A. Real connector-metadata gaps** (fix in the connector / its PR):
- **Stripe** `source_transaction.source` — field existed, `RelatedIntegrationObjectID` was null → `{source}`
  unresolvable → never synced. **Fixed in PR [#57].** (Caveat: parent `source` is get-by-id / un-listable,
  so full enumeration wants the parent re-pointed at `payment_source` — left to the connector owner.)
- **Eventbrite** — `Ticket Class` declares `inventory_tier_id` but **not** `event_id` (its path template
  var); `Question` declares **no** FK; `Media` has neither an FK nor `Configuration.parentObjectName` for
  its `{media_id}`. Declare the missing parent FK / `parentObjectName` on each. *(Confirming which remain
  after a fresh run — some FK-declared children like `Attendee`/`Event Team` sync fine in a clean cycle.)*
- **Blackbaud** — its 84-object catalog is almost entirely access-path children under `constituent`/`gift`/
  `fund`; many need parent-FK declarations. Needs a fresh run to enumerate exactly which.

**B. Test-harness / fixture limitations** (NOT connector defects — the mock can't yet exercise these):
- **MagnetMail (SOAP)** — RESOLVED for forward: I built a SOAP-fixture generator
  (`_gen-magnetmail-soap.mjs`) that emits per-operation SOAP envelopes (`<{Op}Response><{Op}Result>…`),
  disambiguated by SOAPAction body element, and the mock now serves raw XML bodies. Result: **18/19 objects
  sync via real SOAP**. Remaining: 1 object's response record-element name to match, and create-routes for
  the write cells. The connector code is proven working by the 18 that sync.
- **WildApricot** — RESOLVED: `cfgKey=BaseURL` + removing the over-supplied `AccountId` cred (so the
  connector auto-discovers `accountId=1` via `GET /accounts`) took it to **25/25 full green**. The mock now
  serves the discovery route. Not a connector defect.
- **Nested parent→child fixture chaining** — the generic fixture generator does not reliably chain child
  routes to their parents' synced ids for deep catalogs; this is why nested connectors under-report. A
  harness capability to build.

## How test-connector missed all this originally
1. **Bidirectional only ever tested ONE object** (no loop) — write gaps beyond object #1 were invisible.
2. **It resolved the MJ *workshop copy*, not the shipped package** (1518-line divergence on Blackbaud).
3. **Nested children were structurally un-provable** (no fixture chaining + coverage exemptions), so a
   nested connector read "green" while most of its objects never synced.

## Harness improvements made (keepers, in `packages/Integration/connectors/test/`)
- All-writable bidirectional (`E2E_WRITE_ALL`) + a write-coverage gate.
- Real-artifact discovery source (`E2E_CONNECTOR_SRC_FILE`).
- Honest coverage gate: mock no longer exempts `PARENT_UNRESOLVED` (forces the FK fix), plus a **transitive
  get-by-id exemption** (a child of an un-listable get-by-id parent is itself structurally un-listable).
- Empty-maps crash guards; per-connector `cfgKey` / envelope / write-flag knobs.
</content>
