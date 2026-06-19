# Agent-framework improvement analysis — grounded in the Hivebrite build (2026-06-14/15)

> Analysis only — NO framework changes proposed for immediate application beyond the fixes already
> made this session (extractor additive-amendment, T3 seed bug). This documents WHERE the agent
> framework should improve, across the three axes requested: (1) token usage, (2) quality,
> (3) credential-free production-setting testing via MJ GraphQL (the primary consumer gateway).
> Evidence is from the Hivebrite run (connector-hivebrite-1781476962920-6ea6a548) + the cross-build
> Salesforce heads-up.

## What this build actually exercised (the evidence base)
- A 131-object REST+OpenAPI vendor (Hivebrite), no credentials ([B] run).
- First run **escalated** (`EscalatedMaxRounds`): extractor under-enumerated (69/131) AND the amendment
  loop *shrank* the emission to 6 (returned only fix-instruction objects).
- After fixes: **converged** (131/131 accounted: 97 IOs + 34 skipped-with-reason), connector shipped
  (compiles, registered), ladder T0/T1/T2 green, T3 red on a harness bug.
- Repeated tab-closes forced resume churn → many redundant loop laps (visible token cost).

---

## 1. TOKEN USAGE

**1a. The extractor re-serializes the whole catalog through model output every lap (biggest lever).**
`extract-iiof-pipeline` forces the extractor agent to RETURN `{objects:[...]}` with every object's full
claims — the same data its script already persisted to disk via MCP (the 1.1 MB `io-iof-return.json`).
`ioiof-extractor` was the #1 cost line (16–17%). Fix direction: the script writes `objects[]`/claims to
a FILE; the agent returns a compact `{objectCount, fieldCount, gapsRemaining, claimsFilePath,
matrixPath}`. verify/dual-derive already read files — point them at the claims file too. (Partially
addressed by the SF build's "matrix-from-metadata" + compact-dual-derive changes; extend to the
extractor's own return.)

**1b. Amendment re-runs the FULL extraction; it should be a delta.** Even after the additive-emission
fix (this session), a lap re-emits the complete ~97-object set. Correctness only needs add-missing +
fix-flagged (the rest is already upserted on disk). A delta-amendment mode + compact return makes laps
cheap — and laps × extractor is the dominant multiplier, especially under the reviewer oscillation
(1c) and resume churn (1e).

**1c. Reviewer oscillation burns whole extra laps.** The slim `independent-reviewer` (sonnet) returned
`ConfirmedGapsBlocking` of `0 → 4 → 1 → 0` on the SAME complete emission — non-determinism at the
convergence boundary. Each non-zero lap re-triggers a full extract + freeze + review. Fix direction:
the reviewer should gate ONLY on hard structural violations (0-field objects, capability↔method
bijection breaks, missing-PK, FK-target-not-emitted) computed mechanically; judgment-call "gaps" become
advisory, not blocking. This both cuts `independent-reviewer` cost and removes the lap-multiplier.

**1d. The dual-derive parser is re-authored every lap.** It writes a fresh independent parser each
round though the source is pinned. Cache the parser script after lap 0; re-run it (deterministic) on the
updated metadata thereafter.

**1e. Resume churn re-validates loop laps.** Each kill+resume re-executed parts of the amendment loop
(cache churn). The loop's converged state (`blocking=0`) is journaled, but resume re-entered the loop.
Fix direction: checkpoint loop *progress* (last converged emission hash) so resume restarts AFTER the
loop, not inside it.

**1f. Model tiering.** `ioiof-extractor` is pinned to Opus. The script-AUTHORING (parse spec → emit
rows) is largely mechanical; reserve Opus for genuine PK/FK tie-break judgment, run the bulk on Sonnet.
A/B in isolation (one change, measured) per the "don't bundle optimizations" rule.

**Net:** the cost is concentrated in "the amendment loop ran more laps than it should, and each lap
re-narrated the whole catalog." Every lever above attacks "make a lap cheap AND rare."

---

## 2. QUALITY

**2a. Under-enumeration + amendment-shrink (fixed this session, generalize it).** The extractor emitted
69/131 and the amendment collapsed to 6. Root causes + fixes applied: (i) amendment was *subtractive*
("apply only these fixes, don't re-derive, return only touched") → made additive (re-emit complete set,
emit-or-skip every enumerated record, never shrink); (ii) the dual-derive under-enumeration gap was
detected but never *routed* into the re-extract → now routed. **Durability gap:** "role-prose alone does
NOT bind the LLM extractor" (the framework's own comment). The additive + emit-or-skip discipline should
have a MECHANICAL backstop in the primitive (compare emitted∪skipped vs `enumerate-catalog.mjs`; inject
precise residual into gaps) rather than relying on prose compliance.

**2b. Wrapper/compact accounting.** 34 of Hivebrite's 131 component schemas are list-wrappers/compacts/
projections. The extractor must EMIT each genuine record OR `skipped:{reason}` so `emitted ∪ skipped ==
enumerated` — otherwise wrappers masquerade as "missing" (the 62-phantom-missing that inflated the gap).
Fixed in the agent + primitive (subtract skipped from the gap). Keep this as a first-class rule.

**2c. Reviewer determinism (see 1c).** Non-deterministic blocking counts are a QUALITY risk too: a real
gap could be masked on a lucky `0`. Gate on mechanical structural checks; use the LLM reviewer for
semantic plausibility only.

**2d. Artifact/harness failures masquerading as connector defects → CodeBuild deadlock.** T3 (and per the
SF heads-up, T1 PkSourceMatrix) failed for HARNESS reasons but the CodeBuild loop churned chasing them
(2 rounds → `EscalatedCodeDeadlock`). Fix direction: classify a tier failure as connector-fixable vs
artifact/harness BEFORE feeding it to CodeBuild; never let CodeBuild iterate on an artifact bug.

**2e. T3 seed harness bug (fixed this session).** `T3_DocStructureSelfCheck` falsely failed every
Declared connector: its `spawnChildRunner` call omitted `connector`, so `MJ_TIER_METADATA_FILE` was never
set, `seedEngineCache` bailed, the cache-driven `DiscoverObjects` read an empty cache → all persisted
objects reported as "drift." One-line fix applied to dist; durable src fix belongs on the
`agentic/connector-builder` worktree (this tree is dist-only). See memory
`project_connector_t3_seed_harness_bug`.

---

## 3. TESTING IN A PRODUCTION SETTING WITHOUT CREDENTIALS (MJ GraphQL — the consumer gateway)

The bar (per the operator): prove production-level GraphQL-driven MJ usage of the connector actually
works — `mj sync push → codegen → MJAPI → IntegrationCreateConnection → discover → ApplyAll → sync →
rows land`, credential-free via a MOCK vendor — NOT "format-verified-no-creds." Findings:

**3a. The credential-free tiers (T0–T7) are the FLOOR, not the finish.** They prove structure/contract/
mock-replay/SQLite-roundtrip, but NONE proves the connector works *through MJAPI's GraphQL* into a real
DB. The framework treats the hybrid e2e as optional/secondary; it should be the **default gate** for a
build to be called "proven," with the credential-free tiers as the cheap pre-filter.

**3b. The mock-vendor hybrid is the right credential-free production proof — make it first-class.** The
`hybrid-e2e` primitive (mock mode) already: snapshots/restores the generated tree, brings up MJAPI on
caller coords, drives the real engine via GraphQL against a mock vendor, and asserts by SQL rowcount
(forwardCompleteness, incrementalNarrowed, contentHashSkipped, deltaApplied, idempotentZeroWork,
firstSyncComplete, secondSyncGrew, customColumnsCaptured). This is the correct model. Gaps:

**3c. Fixtures are hand-authored + error-prone — auto-scaffold them.** A mock hybrid needs
`fixtures.json` matching the connector's exact shape (config URL key, token route, per-object routes,
PKs, pagination, undeclared fields for custom-column capture, DeltaPasses for C/U/D). Authoring by hand
is a barrier and a defect source. The framework should AUTO-GENERATE a fixtures scaffold from the
Declared metadata + spec examples (object routes from APIPaths, token route from the auth model, sample
records from field types), including: (i) undeclared "custom_*" fields to exercise overflow capture, and
(ii) a default DeltaPass (update one record, delete one, add one) to exercise inbound C/U/D. The human
only tweaks values.

**3d. Outbound write-back is NOT driven through MJAPI by the current harness.** DeltaPasses prove
INBOUND create/update/delete (engine applies C/U/D to the destination from changed source state). The
connector's OUTBOUND CRUD (`CreateRecord`/`UpdateRecord`/`DeleteRecord` POST/PUT/DELETE to the vendor)
is verified at T1 (capability↔method bijection) + the generic per-op implementation, but is not
exercised end-to-end through MJAPI in mock mode. Closing this safely (against the mock only, never real
data) would complete the matrix. This is the one axis where, per operator instruction, best-effort is
acceptable — but the framework gap is real and worth a `writeObject`-driven outbound mock phase.

**3e. Custom-column capture must be ON by default in the e2e.** `customColumnsCaptured` is currently
ADVISORY ("advisory if none") and silently passes when fixtures carry no undeclared fields. Since custom
fields are the real per-tenant story for AMS-class vendors (Hivebrite), the auto-scaffold (3c) should
always include undeclared fields and the assertion should be a GATE when the connector declares
custom-capability, not advisory.

**3f. Credential triage first (operator rule).** Before defaulting to the mock floor, check for a free
dev tier / sandbox / published test token; go live if self-serve. Hivebrite + iMIS are enterprise/
sales-gated (no self-serve) → mock hybrid is correct. Salesforce has a free Developer Edition → that
axis (incl. custom *objects*, a Salesforce-class capability Hivebrite lacks) is better proven there.

---

## 4. THE AGENT ARC MUST BE STRUCTURALLY *ANXIOUS* ABOUT TESTING (never lazy)

The deepest lesson of this build: a connector can be "green" on structure (T0–T2, compiles, registered,
131/131 catalog) and still be **completely unproven in production usage**. The agent arc must treat
"did I actually prove this works the way a real consumer uses it?" as a standing, un-silenceable
question — never satisfied by a structural pass. Concretely, the architecture should bake in these
anxieties as GATES, not vibes:

**4a. "Did I test the integration FRAMEWORK, not just the connector class?"** Structural tiers test the
connector in isolation. The framework value (ApplyAll → entity registration → sync engine → upsert →
content-hash → incremental → DAG ordering → custom-column overflow → delta CRUD) only exists *through
MJAPI*. The arc must require the hybrid GQL e2e as the proof-of-life, and treat a structural-only pass
as **unproven**, loudly — never let "T0–T2 green" read as "works."

**4b. "Did I test PRODUCTION-BASED — through the consumer gateway (GraphQL)?"** The primary consumer
drives the connector via MJAPI GraphQL (`IntegrationCreateConnection` → discover → `ApplyAll` →
`StartSync`), never by calling the connector class directly. The arc's "proven" bar must be a
GraphQL-driven, rowcount-asserted sync into a real DB — credential-free via a mock vendor when no creds
exist. "format-verified-no-creds" must never be presented as production-proven.

**4c. "Did I cover ENOUGH endpoints — or did I lazily prove one happy path?"** A 3–4 object probe
validates mechanics; it does NOT prove the connector. The arc must drive a **broad representative set**
across every distinct capability shape the catalog exposes — paginated, watermarked, nested/child-path,
custom-field-bearing, write-capable — and report coverage as "N of M objects exercised, by shape,"
never silently testing a thin slice. Breadth is a gate; a thin emission that *passes* is a lazy pass.
(Balanced against the Goldilocks rule: prove advancement+termination on mid-size streams, bound the
giant ones — but bound *explicitly and logged*, never by quietly testing 4 of 97.)

**4d. "Did I deal with different CLIENT SITUATIONS?"** Real deployments differ per tenant: custom
columns (per-community custom fields → overflow → promotion), varied configs/base-URLs, incremental vs
content-hash streams, write-back enabled vs read-only, multi-parent FK DAGs, schema drift. The arc must
exercise these *variations*, not one canonical tenant — custom fields on multiple objects, delta C/U/D
on several, incremental on the watermarked ones, idempotent re-runs. A single-shape fixture is a lazy
fixture.

**4e. Make the anxiety MECHANICAL, not behavioral.** "Role-prose alone does NOT bind the LLM" (the
framework's own lesson, twice over this build). So these anxieties must be ENFORCED: the hybrid GQL e2e
as a required floor gate; a coverage metric (objects-by-shape exercised vs catalog) that fails below a
threshold; `customColumnsCaptured`/`deltaApplied` as gates (not advisory) when the connector declares
the capability; an auto-scaffolded fixture set that *by construction* includes undeclared fields +
DeltaPasses + multiple object shapes. The agent should be unable to declare "proven" without these,
exactly as it cannot declare a connector built without floor-check passing.

The throughline: **a structural green is the floor; production-GQL, broad-endpoint, multi-client-situation
proof is the bar — and the arc must be unable to mistake the floor for the bar.**

## Priority (impact × low-risk)
1. **Compact extractor return + delta amendment** (1a/1b) — biggest token win, attacks the #1 cost line.
2. **Mechanical reviewer convergence gate** (1c/2c) — kills the lap-multiplier AND a quality risk.
3. **Auto-scaffold fixtures incl. custom fields + DeltaPasses** (3c/3e) — removes the main barrier to the
   GQL hybrid being the default proof gate.
4. **Tier-failure artifact-vs-connector classifier before CodeBuild** (2d) — prevents deadlock churn.
5. **Make the mock GQL hybrid the default "proven" gate** (3a/3b), credential-free tiers as pre-filter.
6. Outbound write-back mock phase (3d); dual-derive script reuse (1d); model tiering (1f) — secondary.
