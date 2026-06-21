# Connector-builder arc — improvement log

A living journal. Each real build surfaces leaks the harness tests can't; we log them here and
close them little by little. Append per run; promote recurring items to the consolidation /
`corpus`. Token frugality without coverage loss is the standing goal.

---

## Run: Neon CRM (REST+OAS3, Basic auth) — credential-free [B] — 2026-06-16

Litmus run for the held survey fixes (P0-1/P0-2/P0-3/P0-4/P1-6/P1-7). 240-object catalog.
runID `connector-neon-crm-...74fe236b`; workflow `wf_dab420f8-0bf`.

### Fixes validated LIVE (held, no dip)
- **P0-1 (extractor stats-only + disk + reader)** ✅ — 470 KB emission written to disk, extractor
  returned stats, **no balloon** on a 240-object catalog (the NetSuite 320KB-transcript class did
  not recur).
- **P0-2 (delta amendment)** ✅ — every amendment round was a scoped delta, never a full 240-object
  re-walk. This is the headline saver (see token accounting).
- **P0-3 (slot-routing)** ✅ — correct no-op path (all fixes were IO/IOF FK; no `integration.*`, so
  no needless metadata-writer spawn). Active path (`amend-integration-row`) not exercised this run.
- **P1-7 / P0-4 / P1-6** — pending (live at ladder/hybrid, downstream; reached only after the
  amendment loop converged).

### What happened
- Run 1 escalated `EscalatedMaxRounds` at cap=3: the **round-3 review produced a concrete 3-gap fix
  list, then the cap cut off before applying it.** Gap trend across reviews: 2 → 3 → 3 → (would-be-0).
  NOT a deadlock (fingerprints changed) — the cap was one round short.
- Fix: bumped `MAX_AMENDMENT_ROUNDS` 3→6 and **resumed** (rounds 0–3 from cache, free). Round 4
  applied the 3 mechanical fixes → review **0 blocking → converged.** Proceeded past the escalation.
- The 3 gaps were mechanical + evidence-cited (CustomObjectField delete-CRUD columns; SoftCredit
  `recipientAccountId` FK→Account inconsistent with 3 sibling FK fields).

### Token accounting (honest)
- Run 1: **~3.7M** subagent tokens, ~108 min (escalated, pre-ladder). + ~240k for two env-blocked
  aborts. + resume (round 4+) in flight. ≈ **~4.5M+ for one not-yet-finished connector.**
- What the fixes SAVED: ~5 amendment rounds × full 240-object re-extract+verify (~2–3M each) would
  be **~15–20M** without P0-2 + resume-caching. The fixes turned that into ~5M. They earned their keep.

### Residual leaks this run REVEALED (next levers — close little by little)
1. **dual-derive is NOT delta-scoped (biggest remaining per-round cost).** P0-2 scoped the *extract*
   (and verify follows `objResults`), but `dual-derive` re-walks the WHOLE source every amendment
   round (sonnet) regardless of how few objects changed. ~5 rounds × full dual-derive.
   **Next fix:** on `isDeltaRound`, scope dual-derive to the flagged objects (skip the full object-set
   re-enumeration; floor-check still re-checks completeness downstream). Direct P0-2 extension in
   `extract-iiof-pipeline.workflow.js`.
2. **Slim-reviewer convergence is slow (4 rounds).** The slim-sample reviewer finds ~2–3 gaps per
   sampled subset, never the whole set at once → multiple rounds to drain.
   **Next fix:** a deterministic full-FK-consistency check (sibling-FK inconsistency + missing
   co-grouped CRUD columns are mechanically detectable) → surface ALL gaps in one pass → 1–2 rounds.
   Pairs with the deferred **deterministic FixInstruction applier** (apply mechanical slot diffs in
   code, not via the LLM extractor — the consolidation item still open).
3. **Round-cap vs cost-model match (confirmed).** With P0-2 making deltas cheap, cap=3 was too low;
   6 is affordable. The planner should set the cap from catalog size (large catalog → more cheap
   rounds), not a flat 3. The consolidation flagged this; this run is the evidence.
4. **`resumeFromRunId` replays a cached FAILURE instead of re-running it.** When S0 EnvPreflight
   failed, resume returned the stale failure (0 tokens, instant) rather than re-probing — forced a
   fresh full run. A failed gate should be re-runnable on resume; cache success, not failure.

### Env notes (operational)
- EnvPreflight abort-cheap worked twice (Docker-down, then generated-tree churn) — ~120k each vs a
  full build dying deep. Keep.
- Generated-tree churn (4 regen files) blocked S0; restored to HEAD (user-approved) to clear. The
  recurring fix is to run the build in an isolated worktree off committed HEAD (so the shared tree's
  regen state never gates it) — still the cleaner long-term posture.

### Resume run (cap=6) — converged the amendment loop, then escalated AGAIN at the ladder
`EscalatedCodeDeadlock`. 62 agents, ~3.37M tokens, ~82 min (rounds 0–3 cached free). Trajectory:
- Amendment loop **converged** at round 4 (review gaps 2→3→3→**0**) — the cap-bump fix worked; it was
  one round short, NOT a deadlock. ✅ (P0-2 made the extra rounds affordable.)
- Advanced through SourceDiff/GapFill → RealityProbe → **CodeBuild: `BuildClean=true`** → ladder.
- Ladder: **T0 StaticValidation GREEN (the connector compiles!)** → **T1 InvariantValidator RED** →
  code-build loop deadlocked (`EscalatedCodeDeadlock`, codeRound hit cap, same failure recurs).

### THE finding (most valuable yet) — T1 PkSourceMatrix vs metadata-derived matrix rows
- **33 IOs** failed T1 `PkSourceMatrix`: "IO emits a PK but its matrix row shows no source-check `yes`
  (fabrication signal)." But the connector **compiles** and the PKs are legit `id`-convention.
- Confirmed cause: those 33 rows are **metadata-derived** (built by `build-matrix-from-metadata.mjs`
  for any IO NOT in the extractor's rich return — which includes **GapFill-added objects** + any IO
  whose rich row didn't round-trip). That builder defaults EVERY source-check cell to `n/a` (incl.
  `NamingConvention`), so T1 sees PK + zero `yes` → false fabrication flag. `EvidenceCount` is 2–25
  (evidence DOES exist in PROVENANCE/CODE_EVIDENCE — just not reflected in the matrix cells).
- It is NOT a connector defect (T0 green, BuildClean), and code-builder structurally CANNOT fix a
  matrix/invariant problem → the loop deadlocks routing it to the wrong producer.

### New leaks (next levers — close little by little)
5. **matrix-from-metadata doesn't record the PK's derivable source signal.** `build-matrix-from-metadata.mjs`
   should set `NamingConvention='yes'` when the emitted PK IOF is `id`-convention (`id`/`<obj>Id`/`accountId`)
   — for OAS3 that IS the legitimate, provable PK signal (no `x-primary-key` exists in standard OpenAPI).
   Then metadata-derived rows carry a real `yes` and T1 passes provably. **This is the direct fix for the
   33 false flags.** (Provable-only compatible: id-convention is a citable signal, not a fabrication.)
6. **Code-build/ladder loop MISROUTES structural/matrix failures to code-builder (deadlock class).**
   A T1 `PkSourceMatrix`/invariant failure is an extraction/matrix problem; re-dispatching code-builder
   can never fix it → guaranteed deadlock. The loop should classify ladder failures by locus and route
   T1/T3 (structural/metadata/matrix) back to the extractor/matrix layer, only T0/T4+ (compile/test) to
   code-builder. **Sibling of P0-3, applied to the ladder→producer edge** — this is the same misrouting
   class the surveys flagged ("route FixInstructions to the agent that owns the slot").
7. **GapFill-added objects bypass the rich matrix path entirely** → they always land as metadata-derived
   (`n/a` cells). Even after fixing #5, GapFill objects should get a proper matrix row (run the matrix
   build over the FULL post-GapFill IO set, or have GapFill emit rich rows).

### Litmus status (unchanged from run 1 on the late fixes)
- **P0-1 ✅, P0-2 ✅, P0-3 ✅** live-validated (P0-2 reconfirmed across the converged loop).
- **P1-7 / P0-4 / P1-6 still NOT reached** — ladder broke at **T1**, before T2 (P1-7's cred-skip rung)
  and before HybridE2E (P0-4/P1-6). They remain harness-validated only.

### Token accounting (cumulative)
Run1 ~3.7M + env-aborts ~0.24M + resume ~3.37M ≈ **~7.3M tokens** for a connector that compiles but
hasn't passed T1. The dominant remaining waste is per-round dual-derive (leak #1) + the two escalation
cycles. Leaks #5/#6 are cheap, high-leverage fixes (the connector is otherwise one invariant away).

### Decision pending (build is parked, env warm, NOT torn down)
The fix is arc-level (leak #5 matrix builder, and/or #6 routing), NOT connector hand-editing, and #5
touches a safety invariant's evidence path — worth a human nod before loosening anything. Re-run needs
network (operator stepped out). Plan when back: implement #5 (id-convention → matrix `yes`) + re-run
(resume from cache) → T1 should pass → ladder proceeds to T2 (P1-7) + HybridE2E (P0-4/P1-6) + floor-check.
### Run 3 (matrix-fix #5 + matrix-rebuild-before-ladder) — T1 cleared, P1-7 proven, NEW T3 blocker
Resume, 68 agents, ~1.4M tokens, ~6 min (upstream cached; only matrix-rebuild→ladder ran live).
- **T0 green, T1 GREEN** ✅ — fix #5 worked: 33 PkSourceMatrix false-flags → 0. Connector compiles
  AND passes structural invariants.
- **T2 skipped `discovery-requires-credentials` → ladder CONTINUED to T3** = **P1-7 LIVE-VALIDATED.**
  A cred-free rung that needs auth was reclassified skip-not-red and did NOT break the ascent. The
  auth-skip fix is now proven on a real build (was harness-only before).
- **T3 DocStructureSelfCheck RED** → `EscalatedCodeDeadlock` (leak #6 again: routed to code-builder,
  which can't fix it → deadlock after 2 identical rounds).

### THE architecture finding (run 3) — T3 build-time-vs-runtime PK/FK classification mismatch
- ~115 fields across ~nearly every IO: "persisted as PRIMARY/FOREIGN KEY but connector no longer
  reports it as one (drift)." **Systematic, not a few bad PKs.**
- Root cause: for an OAS3/spec connector, PK/FK is classified at **BUILD TIME** (extractor id-convention
  + SoftPKClassifier + FK analysis). The connector's **RUNTIME `DiscoverFields` does NOT re-derive
  PK/FK** (OpenAPI has no machine PK/FK markers). T3 (`DocStructureSelfCheck`) demands runtime
  discovery == persisted metadata → mismatches on EVERY build-time-classified PK/FK.
- This is fundamental: it's a question of WHERE PK/FK classification lives and whether T3 should
  compare a build-time artifact against runtime discovery for spec-based connectors. Options:
  - **(A) Connector carries build-time PK/FK:** code-builder makes `DiscoverFields` emit the same
    PK/FK the metadata holds (read-through, or re-apply the id-convention/FK heuristic at runtime) so
    runtime == persisted. (Connector-template/code-builder change.)
  - **(B) T3 stops comparing PK/FK for spec connectors:** runtime discovery confirms FIELDS exist;
    PK/FK is a build-time classification not expected to be re-derived at runtime. (mj-test-runner T3
    change — loosens a safety invariant; needs care.)
  - **(C) Single shared PK/FK derivation** used by BOTH the extractor and the connector's discovery
    (the principled long-term fix; biggest change).
- NOT a quick driver tweak (unlike the cap bump / matrix fix). It's a design decision affecting every
  spec-based connector + a safety invariant → surfaced to the operator, not blind-driven.

### Leak #6 reconfirmed (now twice: T1 then T3)
The code-build/ladder loop routes EVERY ladder-red to code-builder. T1 (matrix) and T3 (build-vs-runtime
PK/FK) are BOTH non-code failures code-builder structurally cannot fix → guaranteed deadlock. Fix #6
(classify ladder failures by locus: T0/T4+ → code-builder; T1/T3 structural/metadata → extractor/matrix
layer) is now a clear, twice-evidenced priority.

### Litmus scoreboard (updated)
- **P0-1 ✅, P0-2 ✅, P0-3 ✅, P1-7 ✅** — all four now LIVE-validated on a real build.
- **P0-4 / P1-6** — still NOT reached (HybridE2E is downstream of the code-build/ladder loop, which
  deadlocks at T3). Remaining un-live-tested fixes; gated behind the T3 design decision.

### Token accounting (cumulative): ~8.7M
Run1 ~3.7M + aborts ~0.24M + run2 ~3.37M + run3 ~1.4M ≈ **~8.7M** for a connector that compiles, passes
T0/T1, and is gated at T3 by a build-vs-runtime design question. The resume-caching kept run3 cheap
(~1.4M) — without it run3 would have re-paid the full extraction. (P0-4 warm-base would help the env
side similarly; not yet exercised.)
### Run 4 — T3 fix applied to dist but DID NOT take effect (stale MCP process) → leak #8
Resume, ~1.4M tokens, ~5 min. T0 green, T1 green, T2 skip (P1-7), **T3 RED again — with the OLD
failure wording**, proving the patched `t3DocSelfCheck.js` never ran.

**Leak #8 (root cause of the "fix didn't work"): MCP-served verification tiers don't hot-reload.**
`mj-test-runner` runs as a PERSISTENT MCP server (`node packages/MCP/mj-test-runner/dist/server.js`,
started at session start). Node caches the tier modules in memory, so editing the dist on disk does
NOTHING until the server process restarts. Re-running the workflow just re-calls the SAME stale server
→ identical RED → pure wasted spend.
- Contrast: floor scripts like `build-matrix-from-metadata.mjs` are spawned fresh via `node` per call,
  so the matrix (#5) fix DID hot-apply (T1 went green). That's the asymmetry that masked this.
- Fix to apply T3: restart the mj-test-runner MCP server (reconnect MCP / restart session) → re-run.
  CANNOT be done mid-session from a tool call.
- Process rule for the arc: after patching ANYTHING under `packages/MCP/*/dist`, the MCP server must
  be restarted before a re-run; otherwise the re-run tests stale code. (Worth a hot-reload or a
  per-call spawn for the test-runner tiers so fixes don't require a session bounce.)

### HALT — re-runs stopped
Stopped firing resumes: the stale MCP guarantees the same T3 RED, so further runs only burn tokens.
The T3 fix (Declared-fallback overlay on PK/FK drift, matching `decideBooleanOverlay`) is correct and
on disk; it just needs the MCP server restarted to load. Cumulative ~10M tokens.

### Still-open framework items (the durable fixes, beyond the dist hot-patch)
- Mirror the T3 fix to the mj-test-runner SOURCE on `agentic/connector-builder` (only dist is in this tree).
- Leak #6: route ladder structural failures (T1/T3) to the extractor/matrix layer, not code-builder
  (the deadlock class — hit at T1 and T3).
- The connector's `DiscoverFields` should emit PK/FK as `undefined` (no opinion) not `false`, and when
  discovery DOES carry keys it must override metadata + write `additionalSchemaInfo` (the operator's
  stated design; the overlay is half-built in `decideBooleanOverlay`).
### Session 2 (post-MCP-restart): drove T3→T7 green via direct run_tier probing (cheap)
After killing the 3 stale mj-test-runner servers (leak #8), drove the ladder rung-by-rung with
DIRECT `run_tier` calls (cheap, fresh server) instead of expensive full-workflow resumes:
- **T3 PASS** (119 objects) — the Declared-fallback overlay fix is live + correct. ✅
- **T4 PASS** (29 vitest). **T0/T1 PASS.**
- **T5/T6 SKIP `no-fixtures`**, **T7 SKIP `no-openapi-spec`** initially → both staging gaps:

### Leak #9 — spec/fixtures never staged into the test-runner's REGISTRY_ROOT
The test-runner reads `REGISTRY_ROOT = packages/Integration/connectors-registry`, but the BUILD wrote
sources (the real 675KB `openapi.v2.11.json`) to the **top-level** `connectors-registry/`. Two
different registry dirs. Also T7's matcher only accepts `openapi.json`/`*.openapi.json` — it rejects
the versioned `openapi.v2.11.json`. Net: the real spec was invisible → false `no-openapi-spec`.
Same for T5/T6 fixtures (looked for `<root>/<vendor>/fixtures/fixtures.json` — nothing staged there).
FIX: stage the spec to `packages/Integration/connectors-registry/neon-crm/sources/openapi.json`.
DURABLE: the build must stage spec + fixtures into the test-runner's REGISTRY_ROOT (or the runner must
search both roots + accept versioned/`*openapi*` names) — else every connector false-skips T5/T6/T7.

### Leak #10 — T7 validator HARDCODED write verbs (the connector was correct!)
Once the spec was visible, T7 reported 14 "conformance" failures. Investigation:
- **6 were REAL** (create-only DTOs — AddressAdd/ShippingAddressAdd/HouseHoldDto/Payment/etc. — had an
  APIPath whose GET the spec doesn't support). Fixed by the extractor agent (repointed APIPath).
- **8 were FALSE** — `t7OpenApi.js` built the declared UPDATE request with a hardcoded `Method:'PATCH'`,
  IGNORING the metadata's `UpdateMethod` (which was correctly `PUT`). So T7 tested a PATCH the connector
  never declares → false "does not support PATCH" on every PUT-update connector. (The floor copy
  `spec-conformance.mjs:46` did it right: `f.UpdateMethod || 'PATCH'`.)
FIX: `t7OpenApi.js` now reads `f.CreateMethod/UpdateMethod/DeleteMethod` (matches the floor). → **T7 PASS
170/170.** Lesson: the connector metadata was MORE correct than the validator. The arc's first-exposure
tests mislead in BOTH directions — false-green (early rungs) AND false-red (T7). Verify every rung
against ground truth, never trust a rung's verdict on first exposure.

### Honest connector quality (operator asked): good bones, behaviorally unproven
T0/T1/T3/T4/T7 green; T2/T8 honest cred-free skips; T5/T6/T12 still fixture-gated. Real residuals:
questionable PKs on ~12 sub-objects (FK-as-PK, e.g. AccountContacts.accountId — T3 passes only via the
silent-discovery fallback, which MASKS rather than validates them). Behavioral half (sync/CRUD/
idempotency) unproven until HybridE2E runs. ~40% of the way to a trustworthy connector.

### Process leak (meta): MCP-dist edits need a server bounce EVERY time
Both the T3 and T7 fixes required kill→respawn of mj-test-runner to load (leak #8). A hot-reload or
per-call spawn for the runner would remove this entire class of "fix applied but inert" + wasted runs.

### 🚨 Leak #11 (HEADLINE — the whole campaign existed to find this): the arc ships connectors that ENUMERATE ALMOST NOTHING
Driving the OFFLINE behavioral tiers (T5 MockHTTP, T6 SQLite) with real fixtures finally exercised the
connector's actual fetch path — and exposed that NeonCRM, as the arc produced it, functionally syncs only
~5 of its 119 objects. Two compounding root causes, both invisible to every earlier rung:

1. **Hub objects mapped to by-id DETAIL paths, with NO list/search path.** Account/Donation/Order/Event/
   Membership/etc. carry `APIPath="/accounts/{id}"` + `Configuration.AccessPath.nesting="(single-record by
   id)"`. A plain `FetchChanges(Account)` → base detects the `{id}` template var → can't resolve a parent
   (a hub has none) → returns `{Records:[], HasMore:false}` GRACEFULLY. So hubs enumerate ZERO rows. Neon's
   real pattern is `POST /{resource}/search` to LIST → `GET /{id}` to detail; the extractor stored the
   DETAIL path as `APIPath` and never modeled the search-LIST. (The fixtures even contain `/accounts/search`
   routes that **nothing ever requests** — proof the connector has no search-list wiring.)
2. **`Configuration.AccessPath` has NO runtime consumer.** 65 objects (22 `"X (nested)"` + 43 empty-APIPath)
   declare an `AccessPath {door, nesting}` — but neither `NeonCRMConnector` nor `BaseRESTIntegrationConnector`
   reads it. The base only consumes `{var}` template paths (DB-resolved) + plain `/paths`. So a `"Donation
   (nested)"` APIPath is requested LITERALLY → 404; an empty APIPath is requested as `/` → 404. The 43
   empty-path objects have neither a real path NOR a usable access-path — pure metadata over-emission (DTOs
   turned into syncable IOs with no door), the Salesforce/PropFuel class of defect.

**Why every earlier rung was green anyway (the meta-finding):** T0/T1/T3/T4/T7 are STRUCTURAL — they check
shape, invariants, doc-consistency, spec-conformance. NONE drive a real list+fetch. The only tiers that
would catch "enumerates nothing" are the behavioral ones (T5/T6/HybridE2E), and those were **fixture-gated
skips** on every connector the arc shipped. So a connector that syncs 5/119 objects passed the whole ladder.
This is the direct answer to "how were the last 12 connectors tested?" — structurally, never behaviorally.
The fix is NOT a harness tweak: the connector's listing architecture (search-list-then-detail) + AccessPath
descent must be implemented, and the metadata re-mapped. That is connector/metadata agent work (extract +
code), driven through the workflow — the testing only SURFACED it.

DURABLE arc fixes this implies:
- **Extractor:** for a search-to-list vendor, `APIPath` MUST be the LIST/search endpoint (+ method/body),
  with the by-id path as the detail/get. A by-id `APIPath` on a top-level hub is a defect (it can never
  enumerate). Add a floor-check: every `SupportsRead` IO must have an enumeration path (direct list, search,
  or a resolvable access-path) — a bare `/{id}` hub fails it.
- **Base/connector:** `Configuration.AccessPath` must be CONSUMED (in-memory door-list → descend nesting →
  child records w/ parent FK) OR the convention must be removed and embedded children captured via
  full-record pass-through only. A declared-but-unconsumed convention is worse than none.
- **Ladder gate:** floor-check must require at least ONE behavioral tier (offline T5/T6 is credential-free
  and sufficient) to land rows on >1 object family before a connector can be called done. "Structurally
  green" must never read as "works."

### Offline-tier harness fixes applied this session (legitimate, connector-independent)
- **T6 `ordering-respected` was a harness artifact, not a bug.** `assertOrdering` concatenated the initial
  pull + every delta re-pull into ONE monotonic trace, so a delta legitimately restarting the source's
  id sequence (`hh_1003` end-of-initial → `hh_1001` start-of-delta) read as a regression. Ordering is a
  WITHIN-pull property. FIX: tag each `orderTrace` entry with its `pull` index; only compare consecutive
  records from the SAME pull. (t6Sqlite.js — dist; mirror to source.)
- **T12 PASS** via the `childRunner.seedEngineCache` `Status ?? 'Active'` default (metadata omits Status →
  engine Active-only filters dropped every row → no PK → false content-hash drift). 5/5 stable.

### Leak #11 RESOLVED on the connector side (the enumeration rework) — and what it took
The leak-#11 fix is a coupled metadata+connector amendment, driven entirely through the arc's agents
(orchestrator observes; agents author the connector/metadata):
1. **`ioiof-extractor` re-mapped all 119 IO `APIPath`s** to their real enumeration doors from the OpenAPI
   spec: 34 direct GET-list, 4 POST-search (+`ListBody`), 65 access-path (door + descent chain, e.g.
   `Account -> pledges[] -> pledgePayments[]`), 1 captured-via-parent, 15 disabled write-only DTOs.
   107/119 APIPaths changed. (Each was previously the by-id detail path → enumerated nothing.)
2. **`code-builder` made the connector CONSUME those conventions** — `FetchChanges` now does GET-list,
   POST-search (`ListBody`), and in-memory access-path descent (door list → walk `field[]`/`field`
   segments → leaf records with parent-FK tags), ≥2 levels. Build clean, 37 vitest (29+8 new).
3. **Descent-aware fixtures** (a generator that reads the metadata chains and embeds every nesting path
   rooted at each door) → **T5 went from 15 records/5 objects to 205 records/102 of 103 objects**, 0
   errors, error-classification surfaces HTTP 500. T6 6/6 held.

The connector now enumerates 102/103 active objects offline. THIS is the proof leak #11 demanded — and
it confirms the durable arc fixes: the extractor must map to enumeration doors (not by-id), and
`AccessPath` must be consumed by the connector.

### Leak #12 — keyless objects' identity is a volatile-sensitive content-hash (T12, the GZ #22 class)
T12 (idempotency: replay twice with a volatile key injected into every object) found 29 of 103 active
objects have NO declared PK → the base falls back to `computeContentHash(raw)` over the FULL raw record,
so an injected/volatile byte changes the identity → duplicate rows every sync (exactly the GZ #22 bug
that doubled 9 tables). Three sub-causes, three owners:
- **Extraction dropped a real scalar PK** — e.g. `Account` whose IOFs captured only the nested
  `individualAccount`/`companyAccount` shapes and lost the scalar `accountId` PK; DiscountItem,
  PledgeDafPayDistribution, ProductOptionSelection have composite keys never flagged. → METADATA fix
  (PK-completeness agent, in scope, running).
- **1:1 sub-objects** (Consent, CampaignStats, …) — identity is the parent FK; declare the parent-FK
  field `IsPrimaryKey`. → METADATA fix (in scope).
- **Genuinely-keyless 1:N children** — content-hash is the only identity, and the BASE hashing the FULL
  raw (not a stable declared-fields projection) is a PRE-EXISTING FRAMEWORK defect that contradicts the
  convention's own "keyless records MUST hash a stable projection." Affects EVERY connector. → FRAMEWORK
  PR (`BaseRESTIntegrationConnector.ToExternalRecord` / `ContentHash` should hash a projection over the
  declared IOF fields, or strip undeclared keys, before the synthetic-PK hash). NOT a connector-branch
  change. Durable arc fix: add a build-time floor-check that every `SupportsRead` IO either declares a PK
  or is explicitly marked content-hash-append-only, so "no PK" is a conscious decision, never an oversight.
- Fixture-side: the descent-fixture generator now stamps each object's DECLARED PK onto its synthetic
  leaf (so a declared-PK object isn't falsely flagged keyless by thin fixtures) — fixed AccountContacts.

### Leak #12 follow-through — T12 7/8 via in-scope code-builder fixes (Account linchpin)
A second `code-builder` amendment resolved the two T12-sampled drifters in-scope (connector-local, no framework touch):
- **Account** — `accountId` is NESTED in `individualAccount`/`companyAccount`. Added a `TransformRecord` flatten
  that lifts it to a top-level `accountId` (full-record pass-through preserved) + declared `Account.accountId`
  PK (MCP). Account → stable. This was the LINCHPIN: a 1:1 sub-object's FK-stamp can only resolve once its
  root ancestor (Account) has a resolvable PK.
- **Descent FK-stamping** — rewrote `descendNesting` to carry the door record's PK down the WHOLE chain and
  stamp it into any leaf IOF whose `RelatedIntegrationObjectID` points at a chain ancestor (≥2 levels). 45
  vitest (was 28). + 3 composite-PK fixes (DiscountItem/ProductOptionSelection/PledgeDafPayDistribution) via MCP.
- **Consent** still drifts OFFLINE only — its FK-stamp keys off `RelatedIntegrationObjectID`, which in the
  offline T12 harness is still an unresolved `@lookup` string (resolves to a real UUID only after a DB push).
  Unit-proven (test b) + to be confirmed in HybridE2E where `@lookup` resolves. NOT a connector defect.

### 🚨 Leak #13 (HEADLINE — deploy defects only a REAL push catches; the dry-run is blind to them)
Driving the credential-free **HybridE2E** (real MJAPI + SchemaBuilder + DB, mock vendor) surfaced a class of
defects that EVERY prior gate (incl. `mj sync push --dry-run`) passed clean — because a dry-run validates
shape but never SAVES:
1. **1077 IOFs missing `IntegrationObjectID: "@parent:ID"`.** The extractor nested IOFs under their IO but
   never stamped the parent FK. Dry-run = `✓ Validation passed`; REAL push = `IntegrationObjectID cannot be
   null` → full rollback. Every deployed connector (netsuite/salesforce/hivebrite) has it; neon didn't.
   DURABLE FIX: the ioiof-extractor MUST emit `IntegrationObjectID:@parent:ID` on every IOF (and the floor-check
   should assert it), exactly as it emits `IntegrationID:@parent:ID` on every IO.
2. **Credential type never authored.** The integration's `CredentialTypeID @lookup:…Neon CRM API Key` had no
   backing metadata file — the original build never created the credential-type row/schema. @lookup → rollback.
   DURABLE FIX: identity-establisher/metadata-writer must author the credential-type (schema + entry) as part
   of the build, or floor-check must verify the @lookup target exists.
3. **Shared-DB contamination aborts in-process CodeGen.** Reusing a shared E2E DB, neon's ApplyAll RunCodeGen
   failed on 2 STALE `path_lms` entities (Courses/Teams) with no PK (an abandoned soft-PK run on another
   branch) — the in-process CodeGen regenerates ALL entities, so one no-PK stranger aborts the whole apply.
   DURABLE FIX: per-connector e2e uses a FRESH dedicated DB (the canonical already says "fresh DB"); reusing a
   shared DB is the trap. (Also: a connector's OWN active keyless entities with no PK would abort the same way
   — another reason leak #12's PK-completeness matters at deploy, not just for idempotency.)
4. **Scoped push needs an isolated temp root + two-step cred-then-integration push** (same-transaction @lookup
   can't see an uncommitted sibling) + `--ci` for non-interactive. All canonized in metadata-file-conventions;
   re-confirmed here.

The throughline of #11/#12/#13: the arc's STRUCTURAL gates (dry-run, T0–T7) are green while a connector is
non-functional (enumerates nothing) AND non-deployable (null parent FKs) AND non-idempotent (keyless drift).
Only the BEHAVIORAL credential-free tiers (T5/T6/T12) + a REAL push (HybridE2E) catch these. The durable arc
lesson: a connector is not "done" until a real push + a real-engine ApplyAll + a rowcount-asserted sync pass —
exactly the `test-connector` terminal gate, which must be mandatory, not best-effort.

### Milestone — five additive determinism/coverage units (post-netFORUM feedback, 2026-06-20)

Five GENERAL additions (no vendor-specific logic — each motivated by a concrete failure, the same way the
gates above cite Salesforce/PathLMS). All are pure-fn-`+`-`.test.mjs` (the `env/` convention); 31 new tests,
158 workshop tests green. The throughline is the standing arc principle: **push determinism into scripts; let
the structural attribute be READ from an input, never baked from a template.**

1. **Stateful mock vendor** — `fixtures/stateful-mock-vendor.mjs` (+`.test.mjs`). `cassette-replay.mjs` is
   route-replay (each match independent), so the WRITE family is unprovable credential-free. The new
   `VendorStore` is a mutable in-memory store (identity assignment, watermark bump, pagination window,
   idempotency dedup, soft-delete `+` tombstone) `+` a thin `node:http` adapter. It makes
   create→read-back→update→read-back→delete→404, bidirectional, idempotent-replay, incremental-`since`, and the
   once-only-429 cell all provable with ZERO credentials. Generic: PK field / watermark field / pagination
   params / rate-limit targets are all inputs. **Plug-in:** the e2e harness points the connector's transport
   at this server for the write/bidir/delete cells instead of skipping them.

2. **`connector.*` gate-placement routing** — `plans/_TEMPLATE.workflow.js` (live). The amendment loop routed
   `integration.*`→metadata-writer and EVERYTHING ELSE→extractor, so a `connector.*` (code) finding went to the
   extractor — which can never fix code → byte-identical fingerprint → false `EscalatedDeadlock` on a clean
   build (the netFORUM class). Now partitions a third bucket: `connector.*` fixes are deferred (deduped by slot)
   to the CodeBuild stage and threaded into its first prompt; a connector-only blocking set breaks the extract
   loop instead of deadlocking. Guarded no-op when there are no `connector.*` findings — worst-case ≤ today.

3. **Schema-conformance gate** — `floor/iof-field-conformance.mjs` (+`.test.mjs`). Catches the
   build-against-wrong-schema hole: an emitted column absent from the DEPLOYED entity schema
   (`IsForeignKey`/`ForeignKeyTarget`/`Source`-vs-`MetadataSource`/`SupportsCreate`…) is silently no-op'd by
   `BaseEntity.SetLocal`, so the push "succeeds" while the value never persists. Pure set-arithmetic; the
   allowed-column set is an INPUT (caller introspects `__mj.IntegrationObject*` columns) — it NEVER bakes a
   list (a baked list would freeze the drift it exists to catch). **Plug-in:** floor-check runs it when the env
   bring-up has produced the deployed-column introspection; graceful skip when absent.

4. **Materializability scoping gate** — `floor/materializability.mjs` (+`.test.mjs`). "Extract everything
   provable" can produce a facade wider than the dialect's per-table column limit (netFORUM: 7/34 facades >
   SQL Server's 1024). Old behavior: raw `CREATE TABLE` crash ~30 min into ApplyAll, sinking the whole run. New:
   partition objects into materializable vs overflow UP FRONT (documented limits — SQL Server 1024 / PG 1600 —
   × emitted field counts), emit a non-destructive per-object plan (route overflow to custom-overflow capture;
   never drop fields), advisory by default so the consumer scopes `+` tests the rest, `--strict` for zero-overflow CI.

5. **Deliverable manifest `+` canonical-format guard** — `scripts/deliverable-manifest.mjs` (+`.test.mjs`).
   Partitions a `git status --porcelain` into {stage exactly the deliverables} / {never stage — generated-tree,
   config, lockfile, tooling, backups, with the reason} / {surface unrecognized framework-src for human review},
   so a build's PR is review-ready without a human trimming churn. `assertCanonicalMetadata` catches a minified
   metadata one-liner (the 9.88 MB-on-one-line bug) — non-trivial JSON must be indent=2.

<!-- APPEND new milestones + leaks below as the run progresses. -->
