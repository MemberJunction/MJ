# Higher Logic Thrive Community Connector — Super Coordinator Report (Final)

**Date:** 2026-07-11 · **Branch (MJ):** `agentic/connector-builder-v2` · **Branch (Integrations):** `connector/higherlogic-thrive`
**Verdict:** ✅ **GENUINE-GREEN-MOCK** — deploys clean, syncs real rows through the FULL matrix, and the entire hybrid-e2e lifecycle passes with **zero failures**. Published as an Open App.

## Final hybrid-e2e result (mock, SQL Server) — `pass: true`, `failures: []`

| Lifecycle stage | Result |
|---|---|
| Create / ApplyAll | ✅ 35 objects applied, 33 entity maps (2 legitimately keyless skipped) |
| **Forward sync** | ✅ **99 records across ALL 33/33 syncable objects**, 3 rows each, 1:1 record-map parity |
| **coverage.all-objects** | ✅ **33/33 objects landed rows, 0 zero-row** (incl. the two POST-read objects CommunityMembers + DataFeed) |
| Delta (create/update/delete) | ✅ all three shape-validated |
| Idempotent | ✅ content-hash skip, 2nd sync 0 redundant writes, row counts stable, `secondSyncGrew:false` |
| firstSyncComplete | ✅ true (no door-before-child ordering defect) |
| **WriteBack** | ✅ create + update + delete all pass |
| Merkle / rate-limit / retry / scheduled-job | ✅ pass |
| Teardown | ✅ clean |

## The build in one line

Metadata (35 objects, hundreds of fields, 13 amendment rounds, evidence-cited) → clean code (~1000 LOC, `BaseRESTIntegrationConnector`, 4 pagination schemes, two-step auth, generic per-operation CRUD + two Volunteers overrides) → **48/48 deterministic unit tests** → **full green hybrid-e2e** → Open App published + seed migrations generated + `validate-invariants` green.

## Two real connector defects found & fixed (during the deterministic write-path work)

1. **`Volunteers.DeleteAPIPath` silent-broken deletes** — the metadata declares named template vars (`{volunteerOpportunityKey}`/`{comments}`), which the base class's generic `{id}`-only substitution could never fill. Fixed with a Volunteers-specific `DeleteRecord` override + a composite `ExternalID` (`<opportunityKey>|<ownKey>`) synthesized at create time. Covered by 2 new unit tests.
2. **(No second connector defect)** — every other issue surfaced during gap-closing turned out to be in the shared TEST harness, not the connector (see below).

## Five shared test-harness/fixture/mock fixes (benefit every future connector build)

Closing the hybrid-e2e gap required fixing five genuine gaps in the shared test infrastructure — **the connector was correct in every case**, which is why none of these five touched connector code:

1. **Watermark detector blind to `modifiedDateTime=<iso>`** (`connector-e2e-harness.mjs` SINCE regex) — the connector genuinely issues a server-side incremental filter, but the detector only recognized `_since=`/`modifieddate>` forms. Extended the regex to recognize a watermark-named datetime **equality** param (the "records modified at/after this instant" convention). Same class as the prior Eventbrite `changed_since` fix.
2. **body-IDLocation update shape false-positive** (`writeRoundTripOne`) — for a `body` IDLocation the record's identity travels in the request body (as its PK field), which the real sync engine always includes but the auto-generated synthetic `UpdateAttributes` omitted. The harness now injects the PK into the synthetic update, mirroring production.
3. **path-IDLocation shape match too narrow** — a `path` IDLocation can carry the ID in a **query param** (Volunteers' `?volunteerOpportunityKey=`), not just a path segment; the shape check now inspects `rawQuery` too, and handles composite (`|`-joined) identities.
4. **POST-read objects got GET fixture routes** (`gen-fixture.mjs`) — CommunityMembers (offset) and DataFeed (marker-direction) are read via POST; gen-fixture hardcoded `GET`, so the connector's POST list request 404'd → 0 rows. gen-fixture now derives the read method from `paginationDetail`/`accessPath.readMethod`.
5. **Write route paths kept their query string** (`gen-fixture.mjs` + `mock-vendor-server.mjs`) — the mock matches on pathname, so a route registered as `/v2.0/Answer/Delete?answerKey={id}` never matched the connector's real `DELETE …/Delete?answerKey=ans-1` → the delete-fails-every-run class. Fixed at both layers: gen-fixture strips the query from write route paths, and (the robust catch-all) the mock's `matchRoute` now strips the query from any route Path before comparing.

Plus five earlier framework/primitive fixes from the extraction/bring-up phase (T1 `<Entity>Key` PK convention, missing `className` arg, base64 slots/matrix transfer, large-catalog fallback, `capture-not-engaged` waiver).

Every fix was verified deterministically before the final run: a focused connector↔mock integration test proved 3 rows each for CommunityMembers/DataFeed/EventRegistrants (composite PK resolved, POST matched); a `matchRoute` unit test proved the query-carrying delete route now matches; the 48 connector unit tests cover all 8 write mechanisms.

## Open App publish

- **Package**: `@memberjunction/connector-higher-logic-thrive-community` at `Platform/HigherLogicThriveCommunity/` (Integrations repo, branch `connector/higherlogic-thrive`, cut fresh off `origin/next`).
- **Verified independently**: `tsc` build clean, `vitest` **48/48**, `validate-invariants.mjs` **45/45 Open Apps** pass.
- **Seed migrations generated** against a live DB: SQL Server `V202607111042__higher-logic-thrive-community__Metadata.sql` (1.79 MB) + PostgreSQL `.pg.sql` variant (1.87 MB), 620 records (1 Integration + 35 IntegrationObjects + 584 IntegrationObjectFields). The `CredentialTypeID` `@lookup` resolved correctly to the existing core **Basic Auth** credential type (no new type minted).
- **Catalog** (`connectors-catalog.json`) regenerated — 35 installable connectors, this one present.
- **Scaffold gaps fixed**: replaced the auto-generated 8-line stub test (whose one assertion would have *failed*) with the real 48-test suite; added the missing `@memberjunction/connector-schema-merge@^1.0.1` dependency.
- npm publish access is public repo-wide via `.npmrc` (`access=public`) + `.changeset/config.json` (`access: public`); no per-package `private` flag exists on any connector (the root workspace `package.json` is `private:true`, as intended — it's the monorepo root, not a published package).

## What's NOT done

- **Git add/commit/push** in either repo — no commit or push has been made, per standing project policy requiring explicit per-instance approval. The Integrations branch `connector/higherlogic-thrive` has the Open App staged in the working tree, ready to commit when you approve.
- Pre-existing unrelated dirty state on the Integrations repo's prior branch (16 connectors' `.mj-sync.json`) was **stashed, not discarded**.
