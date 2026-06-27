# ARC_HOLES.md — token + accuracy holes in the connector-builder arc

**Input:** the overnight re-prove of all 20 connectors against the 24-cell credential-free behavioral matrix
+ 3 live-cred proofs (`MJ-next20/overnight-proof/ERRORS.md` E1–E22 + E-LIVE/E-FLEET/E-AZ;
`FINAL_SCORECARD.md`). Every hole below is a *real problem this run hit*, not a hypothetical. Each is
classified **accuracy** (ships a wrong/incomplete connector that goes green) or **token** (burns spend without
adding assurance) — many are both. Citations are `ERRORS.md E<n>` and `file:line` against this workshop.

The throughline the run proved: **the arc's structural gates (T0–T7, floor-check, dry-run) go green while a
connector is non-functional, non-deployable, or non-idempotent. Only the behavioral tiers and a real push
catch the defects — and those are exactly the tiers that false-skip or false-red the most.** The holes cluster
into three families: (A) *the green-but-wrong* family (a gate that doesn't look at the thing that's wrong),
(B) *the false-red* family (the mock can't simulate a thing, so a correct connector reads as broken — wasting
amendment rounds), and (C) *the protocol-blindness* family (SOAP/GraphQL/OData/OAuth need machinery the
extractor and mock don't have).

---

## HOLE-1 — RealityProbe is the designed fix for wrong-paths, but it is credential-gated AND never fired on the only real build, AND it has no SOAP/GraphQL/OData verdict path

**What it is.** The wrong-API-path class (the GrowthZone signature: 17 wrong paths shipped green, GZ_GATE_AUDIT
§1) is supposed to be killed by the RealityProbe (S7): read-only status probing of every declared endpoint, a
404 → `verdict:'wrong'` → `reality-probe-verdicts-unresolved` blocks the build
(`floor/realityProbeFloor.mjs:36-44`; `scripts/reality-probe.mjs:190` emits `wrong` on 404/405/400). The
design is correct. But three things hollow it out in practice:

1. **The page-needing verdicts are credential-gated.** `path` and `writeSurface` work unauthenticated
   (status code / OPTIONS), but `pagination`, `pk`, and `watermark` need a *readable 2xx page*
   (`reality-probe.mjs:189` bails to deeper claims only on 2xx; `GZ_GATE_AUDIT.md` "Residual 1"). So a
   credential-free build — the **default** path this whole run exercised — catches wrong paths + missing write
   surface but labels dead-pagination and null-PK `unverified`, not `wrong`. The overnight run was almost
   entirely credential-free (only GZ/PL/SP had live creds), so for 17 of 20 connectors the probe's highest-value
   verdicts never resolved.

2. **A wrong path that returns 401 (auth-gated) reads `gated-exists`, not `wrong`** (`reality-probe.mjs:198`).
   If the vendor 401s an unknown path before routing (common), a genuinely wrong path looks "real + auth-gated"
   credential-free. The probe cannot distinguish wrong-path-401 from right-path-401 without a credential.

3. **The probe has no SOAP / GraphQL / OData verdict path at all.** `reality-probe.mjs` (grep:
   `soap|graphql|odata|wsdl|introspect` → 0 hits) only knows REST GET-with-pagination. For a GraphQL connector
   every "path" is `POST /graphql` and the *operation* is what's wrong (E8: rhythm 0/377, path-lms shipped 1 of
   67); for SOAP the door is one endpoint and the `szObjectName` discriminates (E11). The probe can't probe any
   of these, so the wrong-path catch silently does not apply to ~460 GraphQL objects + the whole SOAP family.

**Evidence.** ERRORS.md E8 (GraphQL mock blind to operation selection), E11 (SOAP), GZ_GATE_AUDIT "Residual 1";
`AGENT_ARCHITECTURE_AND_THOROUGHNESS.md §4.2` ("`grep -c realityProbe` on the GZ plan = 0" — the probe was not
even in the only real build plan).

**Impact.** ACCURACY (high) — the single defect class the arc was re-architected to catch is only fully caught
*with* a credential, *for REST*, *if the plan includes the stage*. TOKEN (low) — the probe itself is cheap
(~40 GETs).

**Fix.**
- **Gate the plan source, not just the journal.** floor-check's `reality-probe-missing` only fires if the plan
  *writes* `journal.realityProbe`; a plan that omits the `phase('RealityProbe')` call entirely passes (the GZ
  hole — `AGENT_ARCHITECTURE_AND_THOROUGHNESS.md §6.1`). Add a complementary check over `planContent`: a v2 plan
  with no `phase('RealityProbe')` is a `reality-probe-stage-absent` floor failure. **Drafted:
  `floor/reality-probe-stage-present.mjs`.**
- **Teach the probe protocol shapes.** Add a `protocol` input (`rest|graphql|soap|odata`) so it probes
  `POST /graphql` with an introspection query / a `__type` existence check (operation-level, not path-level),
  a SOAP `GetQueryDefinition`-style metadata call, and OData `$metadata`. This converts the GraphQL/SOAP/OData
  wrong-operation class from `unverified` to a real verdict. (Connector/probe-script change — escalate as a
  framework finding per §2 of the agentic plan, since it's >1 line.)
- **Surface the self-serve-credential push earlier** (the skill already does this in Step 0; reinforce that a
  cheap read-only credential lifts pagination+PK+watermark from `unverified` to caught for the whole family).

---

## HOLE-2 — The credential-free MOCK echoes the connector's declared routes, so a wrong route is green in mock and 404s in prod (the centerpiece hole)

**What it is.** The mock vendor server is generated *from the connector's own metadata* (`gen-fixture.mjs`
keys each route off the IO's `APIPath`/`ResponseDataKey`). So the mock serves data at exactly the paths the
connector declares — including the **wrong** ones. A connector that declares `/api/v1/contacts` (wrong) gets a
mock that serves `/api/v1/contacts`, the matrix goes green, and prod 404s. This is the GROWTHZONE_PROD_FINDINGS
#4 class, and it's structural: **the mock cannot falsify a path because it was built from the path.**

**Evidence.** GZ_GATE_AUDIT "fixture circularity" / `AGENT_ARCHITECTURE_AND_THOROUGHNESS.md §3` (T4/T5/T6 are
"circular — fixtures authored with the connector"). E-AZ1 is the live consequence: the old GZ connector's wrong
seed worked in every mock but the prod discovery felt "0/0". E1 (novi `ResponseDataKey` wrong → 0 rows) is the
*inverse* — a metadata bug the mock *did* catch only because the mock served the real envelope key under a
different name; had the builder also guessed the route, it would have been green.

**Impact.** ACCURACY (critical) — this is the reason "structurally green" ≠ "works", restated as a property of
the mock. The mock proves internal consistency, not external correctness.

**Fix.** The fix is **not** in the mock — it's to make the mock's routes come from a *source the connector
didn't author*:
- **Spec-conformance gate (already built, under-used).** `floor/spec-conformance.mjs` diffs every connector
  request `(method, path)` against the vendor's OpenAPI/Swagger — an independent source. This catches the wrong
  path *deterministically, credential-free*, when a spec exists (it caught 6 real Neon path bugs,
  ARC_IMPROVEMENT_LOG leak #10). **Make it a hard floor rung whenever a spec was acquired** (today it's
  `spec-conformance` consumed only if `journal.specConformance` is present). Draft a floor check that *fails* a
  build which acquired a spec but has `nonConformingCount > 0` and no probe override.
- **For spec-less vendors, the RealityProbe (HOLE-1) is the only independent route check** — which is why
  HOLE-1's credential-gating matters so much: spec-less + credential-free = no independent path check at all,
  only the circular mock. That residual must be stated in the report ceiling (`format-verified-no-creds`),
  never laundered as verified.

---

## HOLE-3 — Object-catalog under-enumeration + name-shape garbage: the extractor emits a famous/filename-derived subset, not the enumerated universe

**What it is.** Two sub-failures of the same root (catalog comes from the wrong place):
1. **Under-enumeration.** Path-LMS shipped **16 of ~38** objects; Salesforce historically declared 11 of 1,694
   (`enumerate-catalog.mjs` header). The universe must be the source's machine-readable model, not an agent's
   recital.
2. **Name-shape garbage.** Cvent emitted **64 IO names with `.json` leaked in** (the extractor used the source
   *filename* as the object Name) plus 4 zero-field objects (E15, E-FLEET1, FINAL_SCORECARD cvent row). Those
   "objects" never resolve to an endpoint → 0 rows forever, yet the build went green because nothing inspected
   the names until sync time.

**Evidence.** ERRORS.md E15 (cvent over-extraction: get-one variants, ID-projections, response-schemas emitted
as syncable IOs), E-FLEET1 (io-name-checks found 66 malformed cvent names + zero-field across the fleet:
netforum 10, neon-crm 5, novi 3, imis 2). FINAL_SCORECARD: cvent "64 `.json`-name defect FIXED."

**Impact.** ACCURACY (high) — under-enumeration silently drops syncable objects (MUST #4 violated invisibly);
name garbage inflates the denominator with phantom objects that fail coverage forever. TOKEN (medium) —
phantom objects each consume a matrix cell + a discovery attempt every run.

**Fix.**
- **`io-name-quality.mjs` is built and now catches the cvent `.json` / response-wrapper / field-as-object
  classes** (`floor/io-name-quality.mjs:42-72`; E-FLEET1 confirms it would block cvent + netforum). Wire it as a
  hard floor rung (it's `io-name-garbage` in the floor rule enum — confirm it's load-bearing, not advisory).
- **`enumerate-catalog.mjs` is the universe enumerator** and floor-check runs it over the saved source to
  reconcile declared-vs-universe (`scope-universe-unmeasured` / `source-diff-closed`). Two gaps remain:
  (a) it has **no SOAP/WSDL path** (HOLE-5) so SOAP universes read as unmeasured; (b) the **zero-field** check
  is not in `io-name-quality` — a 0-IOF object is a different artifact than a bad name. Draft a
  `floor/zero-field-io.mjs` that blocks any `SupportsRead` IO with 0 IOFs (the netforum-10 / cvent-4 /
  neon/novi/imis class from E-FLEET1).
- **Extractor rule (already in `extractor-script-conventions.md`):** never derive an object Name from a
  filename, a response-schema title, or a field name; the Name comes from the catalog's record-type identity.
  The defect was a *violation* of an existing rule → the gate (`io-name-quality`) is the enforcement that was
  missing.

---

## HOLE-4 — Behavioral cells produce false reds the arc cannot distinguish from real defects ("harness can't simulate this" vs "connector is wrong")

**What it is.** Four behavioral cells (`forward.incremental.narrowed`, `idempotent.no-redundant-writes`,
`watermark`, `discoverOverlay.reversible`, plus per-parent `coverage`) red on **correct** connectors because
the mock can't simulate the precondition:
- **Per-parent routes serve identical PKs for every parent** → false non-idempotency (E3: novi GroupMember
  `processed=9, updated=6` for 3 real records; the connector IS idempotent in prod).
- **Watermark detection used a hardcoded dialect regex** blind to vendor param names → false `watermark:0/1`
  on novi/openwater/cvent which correctly emit their watermark (E2).
- **Insert-only / content-hash streams** legitimately re-fetch but write nothing → the narrowed/idempotent
  cells expected `Processed` to drop (E-LIVE proved GZ idempotent 725→725; openwater note in scorecard).
- **Declared-metadata connectors don't do runtime re-discovery** → `DiscoverObj`/`discoverOverlay.reversible`
  red because the mock expects re-discovery a Declared connector legitimately doesn't perform
  (nimble-ams/membersuite/etc., FINAL_SCORECARD "Classification of mock behavioral-reds").

The deeper problem: **`topOk=false` carries no machine-readable reason.** A human read every red and classified
it "harness-fidelity, proven live" — exactly the `PartialPass`-waiver lane the architecture audit calls a
rubber-stamp (`AGENT_ARCHITECTURE_AND_THOROUGHNESS.md §4.4`). There is no mechanical distinction between a true
harness limitation and a real defect being explained away.

**Evidence.** ERRORS.md E2, E3, E16, E17; FINAL_SCORECARD "topOk=false ≠ failure" section (8 full-coverage
connectors are behavioral-red = harness).

**Impact.** ACCURACY (high, *both directions*) — a real defect can hide behind "harness-only", and a correct
connector wastes amendment rounds chasing a phantom. TOKEN (high) — each false-red drives a code-build
amendment round that cannot succeed (the connector is correct), risking the `EscalatedCodeDeadlock` /
`EscalatedCodeMaxRounds` class (ARC_IMPROVEMENT_LOG leak #6: the ladder routes every red to code-builder, which
can't fix a harness-fidelity red → guaranteed deadlock).

**Fix.**
- **Make every cell emit a typed `skipReason` / `harnessLimited` flag, not a bare red.** The
  `connector-test-conventions.md` `livePhaseLog` already mandates `status:'pass'|'fail'|'skip'` + `skipReason`;
  extend it to the credential-free matrix cells. A cell the mock *structurally cannot* exercise (per-parent
  distinctness, runtime re-discovery for a Declared connector, content-hash narrowing on an insert-only stream)
  returns `status:'skip', skipReason:'<machine reason>'` — **not red**. Draft a
  `floor/cell-skip-discipline.mjs` that (a) rejects a bare red with no reason and (b) rejects a `skip` whose
  reason isn't on an enumerated allow-list (so "harness-only" can't be hand-waved). This is the mechanical
  replacement for the human classification.
- **Fix the specific simulators that were already fixed this run** (they're in the harness, mirror to the arc):
  per-parent PK scoping (E3 `templateScopeSuffix`), connector-agnostic watermark detection (E2 ISO-date value
  match), GraphQL operation routing (E8/E20), OData envelope (E6), OAuth token-endpoint rewrite (E9). These are
  HARNESS fixes already landed; the hole is they live only in `MJ-next20`'s harness and must be promoted into
  `connector-builder-v2`'s `mock-vendor-server.mjs`/`gen-fixture.mjs` so future builds inherit them.
- **Insert-only narrowing**: make `forward.incremental.narrowed` + `idempotent.no-redundant-writes` pass on
  EITHER `Processed` dropping OR `Succeeded===0` (E21's fix) — a content-hash connector proves idempotency by
  writing nothing, not by fetching less.

---

## HOLE-5 — SOAP / GraphQL / OData / OAuth2 protocols need extraction + mock + probe machinery the arc only has for plain REST

**What it is.** The arc's extractor, mock, and probe are REST-JSON-shaped. Every non-REST protocol family hit a
wall this run:
- **SOAP (netforum):** 10 zero-field IO stubs — the extractor never parsed WSDL/XSD for fields (E-FLEET1,
  E11). `enumerate-catalog.mjs` *has* an XSD path (`fromXSD`) but the **field** extraction for SOAP isn't wired,
  and the mock needed a new `soap` fetchShape to parse SOAP envelopes (E11 resolution).
- **GraphQL (rhythm 377, path-lms 84 ≈ 460 objects):** every query POSTs to `/graphql`; the mock matched by
  path, blind to operation selection → every object empty (E8). Needed door-grouped nested bodies + operation
  routing (E20).
- **OData/Graph (sharepoint):** the mock served a bare array; the connector expects `{value:[...]}` (E6).
- **OAuth2 client_credentials (dynamics 592, sharepoint):** the token request escaped to the REAL Azure AD
  endpoint because only the data BaseURL was rewritten to localhost, not the token URL (E9). dynamics was
  fixable harness-only (it exposes `AuthorityHost`); sharepoint needs a ~6-line connector change because its
  token endpoint is hardcoded (E6/E9 resolution).

**Evidence.** ERRORS.md E6, E8, E9, E10, E11, E20, E-FLEET1.

**Impact.** ACCURACY (critical for these families) — ~460 GraphQL objects + the entire SOAP/Graph/OData/OAuth
fleet were *un-testable* until each protocol got bespoke machinery. A connector for these protocols would ship
with green structural tiers and zero behavioral proof. TOKEN (high) — each protocol cost a multi-hour
investigation agent this run.

**Fix.**
- **Field extraction must follow protocol.** The `ioiof-extractor` must read SOAP fields from WSDL/XSD
  `complexType`, GraphQL fields from SDL/introspection (`enumerate-catalog.mjs` already enumerates the
  *types*; the field walk must reuse the same parse), OData fields from `$metadata`. A `connector-code-conventions.md`
  rule already says GraphQL/SOAP/file-feed ride `BaseRESTIntegrationConnector` — the *extraction* side needs the
  same protocol-awareness. Draft a `floor/zero-field-io.mjs` (shared with HOLE-3) that hard-blocks a
  `SupportsRead` IO with 0 IOFs, so a SOAP zero-field stub can never ship green again.
- **Mock fetchShapes** (`graphql`, `soap`, `suiteql`, OData `value`-envelope) are HARNESS fixes already landed
  in `MJ-next20` (E8/E10/E11/E20 resolutions) — promote them into the arc's mock so future protocol builds
  inherit them rather than re-investigating.
- **OAuth token-endpoint rewrite** must be generic: rewrite the *token URL* to the mock origin alongside the
  data BaseURL (E9 fix: `mockTokenRoutes()` suffix-matches the tenant-prefixed `/oauth2/v2.0/token`). The
  connector should expose an `AuthorityHost` config (additive, defaults to prod) — sharepoint's hardcoded
  endpoint is the one connector-side gap (E6 resolution).

---

## HOLE-6 — The deploy half (real push) is blind to defects no dry-run or structural tier catches, and the env between connectors poisons the next build

**What it is.** Two coupled deploy-time holes:
1. **`mj sync push --dry-run` validates shape but never SAVES**, so it passes clean while a real push rolls
   back: 1077 IOFs missing `IntegrationObjectID:@parent:ID`, an un-authored credential-type `@lookup` target,
   the FK `@lookup` `@parent:ID`-vs-`@parent:IntegrationID` qualifier bug (ARC_IMPROVEMENT_LOG leak #13;
   E-LIVE class; the `fk-lookup-qualifier.mjs` gate exists for exactly the last one).
2. **Shared-DB contamination poisons the *next* connector's whole-DB CodeGen.** `reset-to-core.mjs` left
   orphaned `__mj.Entity` rows (deep FK chain not purged; CompanyIntegration rows never deleted), so the next
   connector's in-process ApplyAll CodeGen — which regenerates ALL entities — choked on the strangers and read
   as a *per-connector* 0-coverage/ApplyAll-FAIL defect that wasn't (E12 the "big one", E14 rhythm 0/377,
   E21, E-LIVE2 the PG `__mj_bizappscommon` pollution).

**Evidence.** ERRORS.md E12 (reset-to-core FK-chain bug poisoned subsequent builds), E13 (salesforce
map-creation perf), E14, E21 (DB hygiene chain), E22 (MJAPI OOM on 1695-object sync), E-LIVE2.

**Impact.** ACCURACY (high) — the deploy defects make a "done" connector non-deployable; the contamination
makes a *correct* connector read as broken (rhythm 0→334 was pure pollution, not a connector bug). TOKEN
(critical) — E21/E12 wasted entire overnight runs reading pollution artifacts as connector defects; the giants
(rhythm/dynamics/membersuite/imis) all read "stale broken" until the DB hygiene was fixed.

**Fix.**
- **`deploy-preflight.mjs` (DB-free) right after metadata-write, before any push** (the skill's CHEAPEST-
  DEFECT-FIRST rule already prescribes this) — catches missing `@parent` FKs, credential-type `@lookup` target
  existence, the FK qualifier (`fk-lookup-qualifier.mjs`), bad enums, dropped columns
  (`iof-field-conformance.mjs`), `Description>255`, capability/path bijection. These gates are **built**; the
  hole is ordering — run them in round 1, not after structural+extraction spend.
- **Per-connector FRESH dedicated DB** (canonical setup already says this; the trap is reuse). `reset-to-core.mjs`
  must (a) recursively purge the full FK tree to any depth (E12 fix), (b) delete CompanyIntegration rows before
  the Entity purge (E21 fix), (c) kill any prior MJAPI on the port before reset (E21). These are HARNESS fixes
  in `MJ-next20`; promote to the arc's env tooling. The floor rule that should make this non-optional:
  `hybrid-e2e` must run on a DB whose non-core entity count is 0 *before* ApplyAll (assert it, fail on
  pollution) — draft a precondition in the env-preflight schema.
- **Large-catalog scale** (E13 map-creation O(N²)→O(1), E22 MJAPI `--max-old-space-size`) are framework/harness
  fixes that benefit all connectors — already landed; the hole is they were discovered *during* a run, not
  gated. The materializability gate (`floor/materializability.mjs`) is the up-front analog for the column-count
  wall (E19); a sibling row-count/heap budget check could pre-flag the OOM class.

---

## Cross-cutting meta-hole — `topOk=false` + "residuals are harness-only" is a human waiver around a hard boolean gate

This isn't a single E-number; it's the pattern across E2/E3/E16/E17 and the whole FINAL_SCORECARD. floor-check
returns a hard boolean `pass` (`AGENT_ARCHITECTURE_AND_THOROUGHNESS.md §4.4`), but the plan downgrades a `false`
to `PartialPass` and a human asserts "the red cells are known mock-fidelity limits." That human judgment was
*correct* this run (the live proofs validated it), but it is **not mechanical** — nothing distinguishes a true
harness residual from a real defect waved through. The fix for HOLE-4 (typed `skipReason` per cell, enumerated
allow-list, `cell-skip-discipline.mjs`) is also the fix for this meta-hole: convert the human classification
into a machine assertion, and delete the `PartialPass` lane (a build either passes the floor or escalates).

---

## Summary table

| Hole | Class | Evidence | Status of fix |
|---|---|---|---|
| 1 — RealityProbe credential-gated + protocol-blind + plan-optional | accuracy | E8, E11, GZ_GATE Residual 1; ARCH §4.2 | gate exists, plan-presence + protocol drafts needed |
| 2 — mock echoes declared routes (circular) | accuracy (critical) | E-AZ1, GZ_GATE circularity, ARCH §3 | spec-conformance built; make hard rung when spec exists |
| 3 — under-enumeration + name garbage | accuracy | E15, E-FLEET1 | io-name-quality built; draft zero-field-io |
| 4 — false-red behavioral cells, no skip-reason | accuracy + token | E2, E3, E16, E17 | draft cell-skip-discipline; promote harness simulators |
| 5 — SOAP/GraphQL/OData/OAuth protocol blindness | accuracy (critical) | E6,E8,E9,E10,E11,E20 | promote mock fetchShapes; protocol field extraction |
| 6 — deploy-blind + cross-connector DB poison | accuracy + token (critical) | E12,E13,E14,E21,E22 | deploy-preflight ordering; fresh-DB + reset-to-core promote |
| meta — PartialPass human waiver | accuracy | E2/E3/E16/E17, ARCH §4.4 | cell-skip-discipline + delete PartialPass lane |
