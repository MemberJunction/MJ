# Connector-builder agentic architecture — the empirical refactor (v2 spec)

**Status: BINDING spec for the v2 architecture. Written 2026-06-12 after the GrowthZone build/repair
marathon. Every claim in here is grounded in a documented failure (GZ PROBLEMS_LOG #1–36, Path LMS,
PropFuel, ORCID, OpenWater) or a line-cited audit of the current architecture files.**

---

## 0. The verdict the evidence forces

The v1 architecture is an **elaborate consistency apparatus with almost no empiricism**. Audited
check-by-check (2026-06-12, line-cited):

| Mechanism | What it actually does | Does real-world information enter? |
|---|---|---|
| T0 StaticValidation | `tsc --noEmit` | No (compiler) |
| T1 InvariantValidator | name/FK/capability-coherence/matrix lint | No (model vs model) |
| T2 CrossConsistency | run discovery twice, diff | No (determinism, not truth) |
| T3 DocSelfCheck | discovery output vs persisted metadata | No (model vs model) |
| T4 MockedFixture | connector's own vitest suite | No (fixtures authored by/with the connector — **circular**) |
| T5 MockHTTPServer | replay registry fixtures | No (fixtures derived from the same docs the connector was built from) |
| T6 SQLite apply | upsert semantics over T5 fixtures | No |
| T7 OpenAPIValidation | declared paths vs the spec | No (the spec IS the source of the declared paths) |
| **T7a EndpointReality** | unauthenticated status-code probe of declared endpoints | **YES — the only build-time reality contact** (reachability only) |
| T7b/T7c | TLS/DNS smoke, public sandbox | Marginal |
| **T8** | live TestConnection + discover + ONE read page | **YES** (but one page; no paths/pagination/PK verdicts extracted from it) |
| verify-claim | re-runs the extraction script against the same pinned source | No (catches parse bugs, not wrong models) |
| adversarial-verify | 24 sampled claims, same-source refuters, majority vote | No (**procedure-shaped noise**) |
| independent-reviewer | different model re-reads the SAME docs; coverage + bijection | No new info; coherence not truth |
| freeze-contract | hash the docs-derived model; forbid re-litigation downstream | **Negative** — freezes errors in |
| floor-check (23 rules) | slots filled, files exist, counts reconcile, no baked catalog | No |
| hybrid-e2e (live) | real engine → real DB → sync → idempotent re-run | **YES — the only deep empirical stage** — and GZ ran it in **mock mode** |

**Net: on a credential-free build, ~1 of ~30 checks touches reality. On GZ (creds available!), the
official pipeline still routed around its only deep empirical stage.** Every bug that mattered lived
in the model↔world gap, where no gate looks:

| GZ defect (log #) | Would ANY v1 gate catch it? | What actually caught it |
|---|---|---|
| `skip`/`top` vs `$skip`/`$top` — every object capped at one page (#1) | No — docs-coherent, mock-coherent | Live probe `?skip=3` vs `?$skip=3` |
| 17 of ~38 API paths wrong; one object pointed at ANOTHER object's path (#B) | No — paths "validated" against the docs that stated them | Live 404/400 probing |
| Page cap 100 + wrong end-of-stream test (#2,#3) | No | Live counts |
| PKs declared on always-null fields, 13 objects (#5) | No — docs say it's the id | Live records (null) |
| Pull-only connector for a bidirectional vendor (#30) | No — bijection-coherent | Operator knowledge |
| Custom-column capture silently dead framework-wide (#29/#31) | No — silent no-op, no gate asks "did capture engage?" | Manual DB inspection |
| Empty-event-child placeholder → unbounded dupes (#22/#23) | No — single-pass tiers only | TWO-pass sync + counting |
| Children-before-doors ZERO_PARENTS on fresh DB (#21) | No — dirty DB masked it | Fresh-DB full sync |
| NVARCHAR truncation via 255-floor (#6/#8) | No | Live long values |
| Env churn (stale dists, stale manifests, generated.ts boot crash) (#9,#11,#13,#19,#31,#33) | No — no env gate at all | Hours of hand-debugging |

Prior connectors, same class: **Path LMS** shipped 16 of ~38 objects (auditor eyeballed a 1.2MB doc —
no enumeration-script gate then); **PropFuel** froze 3 streams as the whole connector (context treated
as the universe) and its extractor read the prior connector as a "source" (circularity); **ORCID**'s
ladder false-redded on a slug-vs-ClassName mismatch and deadlocked the build on harness plumbing.

**The conclusion is structural, not incremental: verification must be re-founded on acquired
empirical signal. Consistency checks are lint, not verification, and must be demoted to that status.**

---

## 1. The root defect, named precisely

**v1 verifies that the model agrees with itself. Nothing verifies that the model agrees with the
world.** Sub-defects:

1. **Circular fixtures.** Mock tiers replay the model's own assumptions back at it. A wrong
   assumption can NEVER fail such a test.
2. **The credential quarantine over-rotated.** "Credential is test-time only" was designed to stop
   sample-discovery being baked into static catalogs (a real failure — PropFuel). But it threw out
   *verification* with *authorship*: nothing may even CHECK a declared path/pagination/PK against the
   live system before code is built on them. The fix is not "let the build read live data" — it is a
   **verdict-only probe** (§2, P2).
3. **Reviewer mis-aimed.** A different model reading the same docs catches transcription slips, not
   model-vs-world divergence. Its budget (multi-round loops, fingerprint deadlock dances, 24-claim
   refuter sampling) vastly exceeds its catch rate (GZ: 4 FK name-matches).
4. **The e2e is dodgeable.** maxTier=T8 was *declared* on GZ while hybrid-e2e ran mock — the one deep
   empirical stage was optional in practice.
5. **No environment gate.** 10 stages burn before a broken DB/MJAPI/stale-dist surfaces. The #31
   class (stale nested dist silently disabling a framework feature) is invisible to everything.
6. **Pass criteria are presence-shaped, not outcome-shaped.** "Ran, exit 0, counts reconcile" instead
   of "rows match ground truth, second pass is flat, every declared object landed or has a logged
   reason."

---

## 2. The v2 principles (binding)

**P1 — Empirical signal is the spine.** Every check is classified `EMPIRICAL` (information from the
real system enters) or `LINT` (internal consistency). Only EMPIRICAL checks can raise the assurance
tier. LINT failures still block (they're cheap), but LINT passes claim nothing. Reports must state
the split explicitly — never launder lint-green as verification.

**P2 — The Reality Probe: live verdicts BEFORE code is built (the single biggest change).**
When a credential exists, a **read-only Reality Probe stage runs after extraction and before
code-build**. Its output contract is the anti-baking firewall:

- It may emit **only VERDICTS on declared claims**, never catalog content:
  - per declared object: `path → {status, recordCount, sampleKeys}` (200/404/400 + did records come back)
  - pagination: `paramName-as-declared advances? alt-form advances? server page cap observed?`
  - per declared PK field: `populated | null | absent` over the probe page
  - watermark/incremental param: accepted (200) or rejected
  - write surface: documented write endpoints exist (OPTIONS/405/401 probing — **never** a write call)
  - rate headers: `X-RateLimit-*`, `Retry-After` observed values
- It may **NOT** add objects, fields, or paths to the metadata (floor-check rejects any metadata
  delta originating from the probe stage — the existing `credential-used-at-build` rule narrows to
  exactly this: *authorship* from live data is forbidden; *verdicts* on declared claims are required).
- Probe verdicts feed ONE mandatory amendment round: wrong paths fixed, pagination params corrected,
  null PKs demoted to content-hash identity, missing-write-surface reconciled — all from the docs,
  re-checked by re-probe.
- **No credential → the probe degrades, never disappears:** unauthenticated status-code probing of
  every declared door (today's T7a, promoted from "reachability" to per-claim verdicts: 401 = path
  real; 404 = path wrong; param probing where the endpoint tolerates it), and the report's ceiling is
  labeled `format-verified-no-creds` with the un-probed claims enumerated by name.

GZ arithmetic: the probe is ~40 unauthenticated-or-read-only GETs (~1 minute). It would have caught
#1, #2, #3, all of section B (17 wrong paths), #5 (null PKs), and flagged #30 (write endpoints exist
while metadata says pull-only) — i.e., the majority of the 20-hour repair, before a line of connector
code existed.

**P3 — Two-pass everything (idempotency as a first-class rung).**
- **Ladder (mock):** a new mandatory rung replays every fixture set TWICE — including a
  volatile-field variant (a per-fetch field that changes between passes, the GZ #22 trigger) — and
  asserts record-identity sets are byte-flat across passes. A connector whose identity drifts on
  unchanged-but-noisy input fails at T-mock, not in production.
- **Live (hybrid-e2e):** full sync → full sync → **per-table rowcount diff must be zero-growth**, on a
  **FRESH DB** (dirty DBs masked #21; fresh-only is a hard rule). "Processed/Success" fields are not
  accepted as evidence; row counts are.

**P4 — Fixtures must descend from reality.** When a credential exists, the Reality Probe's scrubbed
captured pages become the canonical fixtures (`PROVENANCE: live-capture`); mock tiers replay reality.
When no credential exists, fixtures come ONLY from vendor-published examples/Postman (`PROVENANCE:
vendor-published`) — never synthesized from the connector's own metadata. A fixture without a
provenance tag fails floor-check. (Kills the T4/T5 circularity.)

**P5 — Capability honesty is a gate, not a vibe.** The brand study's `WriteCapability` and
custom-field findings are **binding**:
- Vendor study says writes exist + build emits zero write-capable IOs → floor-check **fails** unless
  `OutOfScopeObjectFamilies` carries an explicit, evidenced scope decision for writes.
- Custom-field capability: the e2e must show capture ENGAGED (overflow column exists on every created
  table + populated where the source carries customs) or carry `vendor-confirmed-no-customs`
  evidence. "Capture silently no-opped" (#29/#31) becomes a red rung, not an advisory.
- The same gate covers pagination (declared type observed live), incremental (watermark param
  accepted live), rate policy (declared limits vs observed headers).

**P6 — The e2e is not dodgeable and asserts outcomes.** When a credential exists, **live hybrid-e2e
is mandatory** — mock mode cannot satisfy the requirement (the GZ dodge is outlawed; multi-secret
credentials are a harness deficiency to fix, not a reason to skip). Its gates become outcome-shaped:
- per-object rowcounts vs ground truth (source counts where obtainable); every declared object lands
  rows or carries a logged structural reason (tenant-disabled / genuinely empty / parent-empty)
- two-pass zero-growth (P3); three-pass advisory
- doors-before-children proven on the fresh DB (no second-sync self-heal accepted — ContactWebsite
  40→57 (#28) is a FAIL under this rule, not a footnote)
- capture engaged (P5); promotion smoke (a synthetic pervasive key mints)
- bounded typing: no unexpected NVARCHAR(MAX) columns beyond the declared-unsized set; no truncation
  errors in the run log
- rate behavior: observed 429s were absorbed losslessly (when the vendor emitted any); concurrency >1
  exercised
- structured `SyncWarning`s read and zero unexplained

**P7 — Environment preflight + churn containment (stage 0).** Before ANY build stage:
- DB reachable + at expected migration level; MJAPI boots from the current tree (or is bootable);
  generated tree clean vs HEAD or explicitly accounted; **no stale nested
  `@memberjunction/integration-*` dist copies** under any package's `node_modules` (the #31 detector:
  diff nested dist file hashes vs workspace dist); turbo dist freshness for the packages under test
  (#13).
- Mid-run rules, enforced by the runbook: never restart MJAPI during a sync (#14 zombies); any
  ApplyAll/codegen that rewrites the generated tree is followed by the restore-or-regen sequence
  BEFORE the next restart (#19/#33); a failed run leaves a terminal `result.json` (no zombie
  `IsInFlight`).

**P8 — Repurpose the consistency apparatus deterministically; never gut it (REVISED per operator
directive 2026-06-12: "things are there for a reason").** Each v1 mechanism exists to catch producer
blind spots — the failure was the *method* (same-source re-reading + vote sampling), not the purpose.
v2 keeps every purpose and replaces the method with a deterministic one:
- **adversarial-verify (purpose: catch wrong extraction)** → **DUAL INDEPENDENT DERIVATION**: a
  second, independently-written script (different parser strategy — e.g. AST walk vs regex walk vs
  JSON-pointer walk; ideally authored by a different model) re-derives the SAME inventory from the
  SAME pinned source, and the two outputs are SET-DIFFED in code. Divergence is a finding with an
  exact locus; convergence is reproducible evidence. This is N-version programming for extraction —
  deterministic, re-runnable, and it catches exactly what refuter-vote sampling pretended to
  (a wrong-but-internally-consistent traversal CANNOT survive an independent traversal that
  disagrees, whereas it sails through majority-vote sampling of its own claims).
- **independent-reviewer (purpose: catch shared producer/coordinator blind spots)** → ONE round,
  refocused on the four same-source-catchable classes (coverage-vs-script-enumerated-catalog,
  bijection, capability honesty, naming/evidence-tier), and its review must be expressed as
  **scripted set arithmetic wherever possible** (its expected-inventory is itself a script output,
  diffed against the emission in code — not an eyeball). The charter states what it cannot certify.
- **freeze-contract (purpose: a stable, hash-addressed build input)** → kept as the recording
  artifact; it must never block probe-driven amendments — reality outranks the frozen model.
- Token math stands (GZ: the loops caught 4 FK name-matches while ~25 of 36 defects needed minutes
  of probing) — but the correction is *reallocation to deterministic finders*, not deletion.

**P9 — DETERMINISTIC FINDING (binding; operator directive).** "A much more thorough way to find
things that adheres to determinism." Every *finding* in the pipeline — objects, fields, paths,
PK/FK signals, capabilities, write-surface ops, pagination params, enums, probe verdicts, coverage
gaps, defects — MUST be the **output of a script over pinned inputs**, recorded to an artifact, and
re-runnable to the same answer. The LLM's judgment chooses WHICH scripts to write and interprets
results; it never *is* the finder. Concretely:
- **Pinned inputs**: every finder cites its input artifact (saved spec/SDL/HTML snapshot, fixture
  set, probe capture) by path+hash. Re-running the finder on the same input MUST reproduce the
  output byte-for-byte (modulo timestamps). A finder whose output isn't reproducible is defective.
- **Completeness by set arithmetic at EVERY level**, not just objects: `compute-source-diff` today
  proves object-level bijection; v2 extends the same scripted set-diff to **fields-per-object**
  (spec properties vs emitted IOFs), **paths** (spec operations vs declared APIPath/CRUD columns),
  **write surface** (spec POST/PUT/PATCH/DELETE ops vs write-capable IOs + scope decisions),
  **enums/required/maxLength** (spec constraints vs emitted column facts), and **probe coverage**
  (declared claims vs probed claims — un-probed claims enumerated BY NAME, never a blanket green).
  An eyeballed inventory is the Path-LMS defect (16/38) in any of these dimensions.
- **Deterministic probes**: the RealityProbe is a SCRIPT (pinned claim-list in, verdict-list out,
  captures recorded), not agent improvisation; the same claims probed twice yield the same verdicts
  (modulo live-data drift, which the verdict records explicitly).
- **Deterministic replay**: fixture-declared object sets drive the replay tiers (T12 does this);
  discovery-dependent inputs are recorded into the fixture so the rung's input is pinned.
- The runtime already enforces adjacent determinism (no Date.now/Math.random in workflows; T2's
  double-discovery diff); P9 generalizes it: **finding = script output, always.**

**P10 — VENDOR-SHAPE GENERALITY (binding; operator directive 2026-06-12: "do not overfit to
GrowthZone — that was ONE example; you don't know what kind you will get").** GrowthZone supplied
the evidence base for v2, and that is exactly its role: **citation, never the rule's shape.** Every
gate/finder/invariant must be stated as a GENERAL property first (cited evidence second), and must
degrade HONESTLY on vendor shapes it doesn't fit:
- **Rules are invariants, not vendor patterns.** "Record identity must be a function of stable bytes"
  is the rule; "GZ #22 doubled 9 tables" is the citation. A rule that only makes sense for an
  OData/REST/envelope vendor is mis-stated — generalize it or scope it explicitly to a declared
  vendor-shape facet (transport, pagination family, auth family) read from the metadata.
- **Convention lists are DATA, not logic** — DTO-suffix lists, envelope-key lists, paging-prefix
  lists, pagination-param alternates. They must be (a) explicit and visible in the script, (b)
  extensible per vendor (an override argument / per-vendor config, never a code fork), and (c)
  **fail-LOUD when they don't match**: an unmatched name/shape becomes a NAMED finding for review —
  never a silent misclassification. The OpenWater validation tuned the defaults; the next vendor's
  conventions go into the LIST, not into new hard-coding.
- **Transport applicability is declared, not assumed.** The RealityProbe is HTTP-shaped; a file-feed
  or message-queue source gets its probe-equivalent (list+download verification) or a NAMED
  `not-probeable: <transport>` ceiling — the report never silently extends HTTP conclusions to a
  non-HTTP shape. Same for pagination families (offset/cursor/page/keyset/none), auth families,
  write-shapes (flat CRUD vs wizard/operation vs batch): each finder states WHICH facet values it
  covers, and out-of-coverage claims are enumerated BY NAME.
- **The connector-shape tuple drives applicability.** The planner's vendorShape (transport ×
  pagination × auth × write-shape × schema-source) selects which finders/gates apply; a gate that
  doesn't apply is a named, justified skip (floor-visible) — never assumed-pass and never
  force-fit. New shapes extend the tuple; they don't get squeezed through the last vendor's mold.

---

## 3. The v2 stage graph

```
S0  EnvPreflight        (P7 — DB/MJAPI/generated-tree/nested-dist/turbo gates; abort cheap)
S1  BrandResearch       (unchanged charter; WriteCapability/customs now BINDING — P5)
S2  Identity            (unchanged)
S3  SourceAudit         (unchanged + catalog-by-script is already the law — Path LMS)
S4  MetadataWrite       (unchanged)
S5  IOIOFExtract        (unchanged mechanics; verify-claim kept as parse-lint)
S6  IndependentReview   (ONE round, refocused charter — P8)
S7  RealityProbe        (P2 — creds: read-only verdicts; no creds: unauth probe; ALWAYS runs)
S8  ProbeAmend          (ONE mandatory amendment round from verdicts; re-probe to confirm)
S9  FreezeContract      (recording only — P8)
S10 CodeBuild           (unchanged + fixtures-from-reality requirement — P4)
S11 VerificationLadder  (+ T-idem two-pass volatile-field rung — P3; fixture provenance enforced)
S12 HybridE2E           (live MANDATORY when creds — P6; outcome-shaped gates; fresh DB only)
S13 FloorCheck          (new rules below; EMPIRICAL/LINT split in the verdict — P1)
```

New floor-check rules (mechanical, JS):
- `reality-probe-missing` / `reality-probe-verdicts-unresolved` — probe ran; no declared-claim
  verdict left in `wrong`/`unverified-blocking` state.
- `capability-dishonest` — brand study capability ∩ emitted capability mismatch without an evidenced
  scope decision (P5).
- `capture-not-engaged` — e2e (live) shows overflow column absent on any created table, or capture
  wrote nothing while the probe observed custom-marker fields (P5).
- `idempotency-rung-missing` / `second-sync-grew` — P3 at both tiers.
- `fixture-provenance-missing` — any fixture without `live-capture` or `vendor-published` provenance (P4).
- `e2e-mock-dodge` — credential existed but hybrid-e2e ran mock (P6).
- `env-preflight-missing` / `stale-nested-dist` — P7 (the #31 detector).
- `first-sync-incomplete` — an object that landed rows only on a second pass (the #21/#28 detector).

---

## 4. Failure → invariant ledger (why each v2 rule exists)

| Evidence | v2 invariant |
|---|---|
| GZ #1/#2/#3 pagination; GZ §B 17 wrong paths; #5 null PKs | P2 RealityProbe verdicts + S8 amend |
| GZ #30 writes scoped out silently; #29 customs dead | P5 capability-honesty gate |
| GZ #22/#23/#27 dupes & placeholder; PropFuel nested-PK dupe | P3 two-pass volatile-field rung |
| GZ #21 ZERO_PARENTS; #28 ContactWebsite 40→57 | P6 fresh-DB first-sync completeness gate |
| GZ #31 stale nested dist (framework-wide silent kill); #13 turbo-stale | P7 preflight `stale-nested-dist` |
| GZ #9/#11/#19/#33 generated-tree churn, boot crashes, zombies | P7 churn containment runbook gates |
| GZ #6/#8 truncation | P6 bounded-typing assertion |
| GZ hybrid-e2e ran mock with creds present | P6 `e2e-mock-dodge` |
| T4/T5 circular fixtures (audit) | P4 fixture provenance |
| adversarial-verify/multi-round reviews caught ~nothing for most tokens (audit + GZ) | P8 cuts |
| Path LMS 16/38 | catalog-by-script (kept) + reviewer coverage-vs-script focus |
| PropFuel 3-stream freeze; extractor read own output | context-is-not-the-universe (kept) + `extractor-reads-output` (kept) |
| ORCID slug-vs-ClassName false-red; T8 creds plumbing | harness contracts fixed in runners, not re-litigated per build (ladder identity = registry slug; creds via Configuration) |
| OpenWater rebase-drift breaking runtime | S0 preflight catches unbuildable runtime before stages burn |

## 5. What v2 does NOT change

- Credential **safety** (broker, agent never sees bytes) — unchanged. P2 changes credential
  *epistemology* (verdicts in, authorship still out), not custody.
- Catalog-by-script, no-baked-catalog, extractor-source rules, provable-only metadata, scrub-fixture,
  PII rules — all kept as-is.
- Live writes remain forbidden by default; the write surface is probed with OPTIONS/405/401 evidence
  only, and write-path code is proven by mock against vendor-published shapes until a human
  authorizes a live write test.

## 6. Implementation map

| File | Change |
|---|---|
| `.claude/rules/connector-credential-testing.md` | Carve-out: RealityProbe verdict-only stage is sanctioned pre-codebuild; degraded unauth probe mandatory creds-or-not |
| `.claude/agents/connector-creator.md` | Stage graph S0/S7/S8; e2e-mock-dodge prohibition; P1 EMPIRICAL/LINT labeling in plan output |
| `.claude/agents/independent-reviewer.md` | Refocused ONE-round charter + explicit cannot-certify list |
| `.claude/skills/build-connector/SKILL.md` | S0 preflight; probe in the intake flow; live-e2e mandatory when [A] |
| `plans/_TEMPLATE.workflow.js` | EnvPreflight + RealityProbe + ProbeAmend phases; remove adversarial-verify round; live-mandatory hybrid-e2e |
| `primitives/floor-check.workflow.js` | §3 new rules |
| `primitives/verification-ladder.workflow.js` (+ runner) | T-idem two-pass volatile rung; fixture provenance check |
| `primitives/hybrid-e2e.workflow.js` | outcome-shaped gates (rowcounts/zero-growth/first-sync-complete/capture-engaged/bounded-typing); fresh-DB enforcement; mock-cannot-satisfy-with-creds |
| `primitives/adversarial-verify.workflow.js` | retire from the default path (kept on disk for forensic use) |

## 7. Rollout across the 5-connector program

1. This branch: spec + directive-file changes (this commit).
2. PropFuel/Path-LMS branch: port the agentic architecture (local-only) + integration core (no GZ/OW
   connector code); re-validate Path LMS under v2 gates (expect probe to find wrong paths).
3. ORCID branch: rerun S7 RealityProbe + P3/P6 gates against the existing build before trusting it.
4. OpenWater: finish under v2.
5. Only after 5/5 pass v2 gates: Fonteva/Salesforce, with the v2 spec re-reviewed first.
