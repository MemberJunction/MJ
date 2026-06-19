# Connector-builder agent architecture & thoroughness assessment

**Audience:** a skeptical PR reviewer asking "the `/build-connector` skill finishes EXTREMELY FAST — is it actually reasoning about HOW it got the data, not just WHAT it extracted? Are the integrations correct?"

**Method:** every structural claim is cited `file:line` relative to repo root. Paths are in the
`MJ-growthzone` worktree (the only worktree where the workshop + agents exist; the `MJ-unified`
worktree does **not** contain `packages/Integration/connector-builder-workshop/` or `.claude/agents/`,
verified `MJ-unified/packages/Integration/` has no `connector-builder-workshop` dir). This document is
written to that workshop directory because that is where the system lives.

**Verdict up front:** the architecture's *design* (the v2 spec) takes the "WHAT vs HOW" problem
seriously and has a real mechanism for it (the RealityProbe). But the *one connector that has actually
been built through this system* — GrowthZone — **did not run that mechanism**, finished as a
`PartialPass` whose residuals were hand-waved as "harness-only," and reached its live verdict through a
**side-channel** rather than the gated pipeline. The fast finish is **partly genuine cheap work and
partly skipped verification**, and the skipped part is exactly the part that checks HOW.

---

## 1. The agent topology

### 1.1 Three-stage orchestration (the skill)

`/build-connector` is an orchestrator, not an executor. It runs at top level (the only context with
`Task` + `Workflow`) and sequences three stages — `.claude/skills/build-connector/SKILL.md:8`,
`SKILL.md:109-148`:

1. **Stage 1 — Plan.** Dispatch `connector-creator` (planner, Opus) via `Task`. It reads
   `{spec_digest, vendor_request, corpus_lookup}` and **emits a per-vendor workflow script** to
   `plans/<vendor>.workflow.js` plus a `minimumThoroughnessManifest` + `rationale`
   (`SKILL.md:111-124`, `connector-creator.md:13-18`). The planner is the *only* place connector-shape
   decisions are made (`SKILL.md:242`).
2. **Stage 2 — Review.** Dispatch `independent-reviewer` on a **deliberately different model**
   (`SKILL.md:125-134`). It is given the planner's *script + manifest only — NOT the rationale*
   (architectural firewall, `SKILL.md:129`). Default verdict is `rejected`; up to 3 rounds; persistent
   reject → escalate (`SKILL.md:132`). Model-difference is mandatory and a same-model situation is a
   hard halt (`SKILL.md:134`).
3. **Stage 3 — Execute.** The planner-emitted script is run via the `Workflow` tool. The script itself
   runs the locked primitives (`SKILL.md:136-148`).

The skill explicitly forbids itself from doing any discovery/probing/analysis — "Findings produced by
the orchestrator are **invalid by construction**" (`SKILL.md:240`). Only agent findings count. This is
a genuinely good guard against the orchestrator injecting hand-work.

### 1.2 The producer agents (composed inside the workflow)

| Agent | Role | Cite |
|---|---|---|
| `vendor-brand-researcher` | Canonical brand + full API *nature* (object families, auth, read/write capability) independent of provided context | `connector-creator.md:155`, plan `growthzone.workflow.js:127` |
| `identity-establisher` | Integration-row identity slots + `CredentialTypeID` match-or-create | `connector-creator.md:156` |
| `source-auditor` | Ranks authoritative sources; emits `TaxonomyLeaves` (the script-enumerated object universe) | `connector-creator.md:159`, `audit-source.workflow.js` |
| `metadata-writer` | Integration-row non-identity slots + `Configuration` JSON | `connector-creator.md:163` |
| `ioiof-extractor` | Writes + runs ONE script that walks the whole catalog → emits all IO/IOF rows + claims | `ioiof-extractor.md:12-16` |
| `code-builder` | Writes the connector `.ts` from the frozen contract | `growthzone.workflow.js:410-416` |
| `testing-agent` | Runs each ladder rung via `mcp__mj-test-runner__run_tier`, returns the runner's **verbatim** result | `verification-ladder.workflow.js:260-265` |
| `independent-reviewer` | Adversarial review (different model) of the emission | `independent-reviewer.md:9` |

The cost design is deliberate and sound: extraction is **O(1) agents in object count** — one extractor
writes one script that walks the whole schema; verification is one batched pass + a fixed number of
reviewers (`extract-iiof-pipeline.workflow.js:6-16`). This is why a large schema does not explode the
agent count — and is *one legitimate reason the build is fast* (§4).

### 1.3 The locked primitives (the deterministic spine)

These are JS workflows (no LLM verdict; agents only fetch bytes / run scripts):

- `audit-source.workflow.js` — 4 blind facet inspectors + synthesize, structured rubric (`:61-78`).
- `extract-iiof-pipeline.workflow.js` — extract → verify → **dual-independent-derivation** → matrix CSV
  (`:36-42`). The dual-derive stage (`:183-237`) is N-version programming: a *second, independently
  authored* parser re-derives the inventory and **set-diffs in code** (`:222-228`); divergences become
  findings with exact loci (`:239-246`). This is the v2 replacement for refuter-vote sampling and is a
  real improvement.
- `freeze-contract.workflow.js` — hashes the contract for resume/provenance.
- `verification-ladder.workflow.js` — T0..T8 (plus T7a-d) where **every** rung verdict is the test
  runner's verbatim result; a hand-written "green" is rejected because it can't fake the runner's shape
  (`:190-196`, `:271-280`).
- `floor-check.workflow.js` — the final JS-computed gate; `pass = failures.length === 0` computed in JS,
  agent only `cat`s files (`:13-18`, `:207-208`, `:748`).
- `hybrid-e2e.workflow.js` — stands up real MJAPI → real SQL Server, asserts outcomes by rowcounts.
- `compute-source-diff` / `completeness-diff.mjs` — set-arithmetic bijection (objects, and v2 extends to
  fields/paths/write-surface/constraints).

---

## 2. How it fits the Integration Framework (the build-time ↔ runtime boundary)

The output of a build is two artifacts that feed the *runtime* framework (`IntegrationConnectorCreationPipeline`
→ `ApplyAll` → sync):

1. **Static `Declared` metadata** — `metadata/integrations/<vendor>/.<vendor>.integration.json`, authored
   at build from **credential-free** docs/spec only.
2. **The connector TS class** — pure mechanism (auth · HTTP · discover · fetch · normalize), with the
   **discovery MECHANISM** (`DiscoverObjects`/`DiscoverFields`) but **never a baked catalog**.

The boundary is explicit and enforced:

- **Declared = vendor-wide** schema every account has; **Discovered = per-connection** runtime via the
  connector's own discovery against that client's credential; **Custom = runtime per-tenant capture**
  (`connector-creator.md:31-35`, `ioiof-extractor.md:26`, `.claude/rules/metadata-file-conventions.md`
  "MetadataSource (v5.39.x enum)").
- The agent **never** authors metadata from live data. The three discovery cases (no-auth docs → static
  `Declared`; auth-gated describe endpoint → runtime `Discovered`; structure-only-from-records → runtime
  custom-column capture) are in `.claude/rules/connector-code-conventions.md` "Discovery: capture every
  object/field…".
- floor-check structurally enforces the boundary: `discovery-hardcoded` (a `DiscoverObjects` that returns
  a static catalog — `floor-check.workflow.js:470-516`), `catalog-in-code` (module-level baked
  field/object constants — `:518-559`), `extractor-reads-output` (extractor reading the connector/dist/
  prior metadata — `:561-581`), `credential-used-at-build` (plan conditioning the object set on a
  credential — `:583-608`). These four gates are the strongest, most genuinely-deterministic part of the
  whole system, and they target the right failure (the PropFuel 3-stream freeze).

So the division of labor is correct *by construction*: the agent does build-time `Declared` + the
mechanism; the runtime does `Discovered`. The weakness is **not** the boundary — it is that almost
nothing verifies the `Declared` half against the real system before the connector ships on top of it (§3).

---

## 3. The "WHAT vs HOW" verification mechanisms — does each verify CORRECTNESS or just plausible SHAPE?

The v2 self-audit answers this question itself, brutally, in `ARCHITECTURE_REFACTOR.md:13-49`: **on a
credential-free build ~1 of ~30 checks touches reality; the rest are model-vs-model consistency lint.**
The table below is my independent assessment, cite-checked against the actual primitives.

| Mechanism | Verifies… | Real-world signal? | Assessment |
|---|---|---|---|
| T0 StaticValidation | `tsc --noEmit` | No | LINT. Compiles ≠ correct. |
| T1 InvariantValidator | name/FK/capability coherence | No | LINT. Model vs model. |
| T2 CrossConsistency | discover twice, diff | No | Determinism, not truth (`verification-ladder.workflow.js:84`). |
| T3 DocSelfCheck | discovery vs persisted metadata | No | LINT — and **credential-gated**, so it *Skipped* on GZ (`SuperCoordinatorReport.json:14`). |
| T4 MockedFixture | connector's own vitest | No | **Circular** — fixtures authored with the connector (`ARCHITECTURE_REFACTOR.md:21`). |
| T5/T6 Mock-HTTP / SQLite | replay registry fixtures | No | Same circularity; both *Skipped (no fixtures)* on GZ (`SuperCoordinatorReport.json:16-17`). |
| T7 OpenAPIValidation | declared paths vs the spec | No | The spec *is* the source of the declared paths; *Skipped (no spec)* on GZ. |
| **T7a/T9 EndpointReality** | unauth status-code probe | **YES (reachability only)** | The *only* real-world contact in the GZ ladder — 401/404 tells you a path is real/wrong, nothing about pagination/PK/records (`SuperCoordinatorReport.json:19`). |
| **T8 AuthenticatedEndpoint** | live TestConnection + discover + ONE read page | **YES** | One page; **no paths/pagination/PK verdicts extracted from it** (`ARCHITECTURE_REFACTOR.md:26`). On GZ it *Skipped* — "ladder-T8 needs a credential FILE; broker model has none" (`SuperCoordinatorReport.json:33`). |
| verify-claim | re-runs the extraction script vs the same pinned source | No | Catches parse bugs, not wrong models (`ARCHITECTURE_REFACTOR.md:27`). |
| dual-independent-derivation | second parser re-derives inventory, set-diff | **No (still same source)** but catches a wrong *traversal* | The genuine v2 win over refuter-vote — but it proves two parsers agree about the *docs*, not that the docs match the live API (`extract-iiof-pipeline.workflow.js:183-237`). |
| independent-reviewer | different model re-reads the SAME docs | No new info | LINT — and **says so in its own charter**: "Your green is a LINT green; never present it as verification" (`independent-reviewer.md:27-32`). |
| freeze-contract | hash the docs-derived model | **Negative** | Freezes errors in unless a probe outranks it (`ARCHITECTURE_REFACTOR.md:30`). |
| floor-check | slots filled, files exist, counts reconcile | No | LINT (structural). |
| **RealityProbe (S7)** | read-only **verdicts** on declared claims (path/pagination-advances/PK-populated/watermark/write-surface/rate) | **YES — the designed HOW-checker** | `reality-probe.mjs` is a complete, careful script (`:143-248`). **But it was not in the GZ plan at all** (§4). |
| **HybridE2E (live)** | real engine → real DB → sync → idempotent | **YES — the only deep empirical stage** | On GZ it ran `mode:'mock'` with `credentialReference:null` (`growthzone.workflow.js:531`, `:537`) — the exact dodge v2 was written to outlaw. |

### The one mechanism that actually checks HOW: `reality-probe.mjs`

This is the heart of the answer to the reviewer. `scripts/reality-probe.mjs` is a **deterministic
finder** that, given the `Declared` metadata + a base URL (+ optional broker-injected read-only token),
emits *only verdicts on already-declared claims*:

- per-object path → HTTP status + records-present (`:160-176`)
- pagination → does the **declared** param form advance past page 1? does the `$`-prefixed alternate?
  (`:180-209`) — this is precisely the `skip` vs `$skip` bug that capped every GZ object at one page
- per-declared-PK → populated | null | absent over the probe page (`:211-223`) — the "PK on always-null
  field" bug
- watermark param accepted? (`:225-234`)
- write surface existence via OPTIONS/405/401, **never a write call** (`:236-247`)

It **never authors metadata** (`metadataDelta:false` is a structural constant, `:262`), and floor-check
rejects any probe-originated delta (`floor-check.workflow.js:666-668`). The design is right: *verdicts
in, authorship out.*

**The problem is not the probe's design. It is that the probe is optional in practice** — see §4.

---

## 4. DIAGNOSIS: why does it finish fast, and is that a problem?

### 4.1 The decisive timeline (this is the crux)

File mtimes (working-tree; the workshop is untracked, so mtime is the authorship record):

```
2026-06-11 07:00  plans/growthzone.workflow.js          ← the plan that RAN
2026-06-11 07:43  growthzone/SuperCoordinatorReport.json ← the run RESULT (PartialPass)
2026-06-12 01:18  primitives/floor-check.workflow.js      ← v2 floor rules WRITTEN
2026-06-12 02:20  plans/_TEMPLATE.workflow.js             ← v2 template (with RealityProbe) WRITTEN
2026-06-12 02:21  ARCHITECTURE_REFACTOR.md                ← the v2 spec WRITTEN
```

**The v2 empirical architecture was authored ~18 hours AFTER GrowthZone finished, as a post-mortem
reaction to GrowthZone's failures.** GrowthZone is the *"before"* example the spec cites; v2 is the
proposed cure, and **it has not yet been run end-to-end on any connector.** This is the single most
important fact for the reviewer.

### 4.2 What actually ran for GrowthZone vs. what the template now prescribes

The GZ plan's phases (`grep` of `plans/growthzone.workflow.js`): BrandResearch, Identity, SourceAudit,
MetadataWrite, FreezeContract, IndependentReview, SourceDiff, GapFill, VerificationLadder, HybridE2E,
FloorCheck. The template (`_TEMPLATE.workflow.js:27-42`) additionally prescribes **EnvPreflight (S0),
RealityProbe (S7), and ProbeAmend (S8)**.

**`grep -c realityProbe|envPreflight` on the GZ plan = 0.** The two stages that the v2 spec calls "the
single biggest change" (`ARCHITECTURE_REFACTOR.md:93`) and the GZ #31 detector were simply **not in the
plan that built GrowthZone.** The only live signal GZ got was the T9 EndpointReality ladder rung
(reachability — `SuperCoordinatorReport.json:19`), which the v2 audit explicitly rates as
reachability-only, not per-claim verdicts (`ARCHITECTURE_REFACTOR.md:24`).

### 4.3 Verification that was skipped or short-circuited on the GZ run

Three independent fast-paths, all citeable:

1. **The amendment loops were hard-coded OFF.** `growthzone.workflow.js:224` `const RESUME_PAST_EXTRACT = true`
   and `:387` `const RESUME_PAST_CODE = true` **fabricate** a clean `review` object (`:235`:
   `ConfirmedGapsBlocking:0`) and a clean `codeResult` (`:389`: `BuildClean:true`) and **skip the
   extractor and code-build entirely**. These were operator interventions to get past two escalations
   (`:218-223` describes 4 FK `@lookup`s the extractor script structurally can't emit; `:380-386`
   describes a stale-symlink T1 deadlock). They are *documented*, but the net effect is that on the
   shipped run **the producer→reviewer→amend cycle did not execute** — its verdict was injected.

2. **HybridE2E ran mock, not live, despite a working credential.** `growthzone.workflow.js:531`
   `mode:'mock'`, `:537` `credentialReference:null`, `:538` `brokerPlans:null // force HAS_BROKER_CREDS=false`.
   The comment (`:526-530`) is honest: the single-token `connector-e2e-live` harness can't carry GZ's
   multi-secret OAuth2, so the deep engine→DB→sync→idempotent proof ran against **mock fixtures**, and
   live read was proven **separately** by a direct broker GET (`:528-530`, `SuperCoordinatorReport.json:23-29`).
   The v2 spec names this exact move `e2e-mock-dodge` and outlaws it (`ARCHITECTURE_REFACTOR.md:147`,
   floor rule `floor-check.workflow.js:651-652`).

3. **The live verdict came through a side-channel, not the gated ladder.** GZ's real-data proof
   (`liveReadProven`, `SuperCoordinatorReport.json:23-29`) was a hand-run broker plan — TestConnection +
   token mint + `GET /api/contacts` + `/contacts/delta`, all 200. That genuinely *is* real evidence and
   is creditable. But it is **outside** the verification ladder (T8 *Skipped* — `:13`,`:33`) and **outside**
   hybrid-e2e (mock). So the pipeline's own gates never consumed the live signal; a human asserted it in
   prose and labeled the floor residuals "harness-only" (`SuperCoordinatorReport.json:8`,`:30-35`).

### 4.4 Why floor-check did not catch this on GZ

floor-check *now* has the v2 rules — `reality-probe-missing` (`:658-660`), `e2e-mock-dodge`
(`:651-652`), `env-preflight-missing` (`:686-688`), `hybrid-e2e-missing`/`-not-pass` (`:638-643`). **But
they were written Jun 12, after the Jun 11 run** (§4.1). Even today, two latent escape hatches remain:

- **`e2e-mock-dodge` keys off `journal.credentialReference`** (`floor-check.workflow.js:651`). The GZ plan
  passes `journal: { extractStats, sourceDiff, frozen, review, codeResult, ladder, hybridE2E }`
  (`growthzone.workflow.js:557`) — **no `credentialReference`, no `realityProbe`, no `envPreflight`, no
  `brand` in the journal.** So even re-run today, `e2e-mock-dodge` would be silent (no credentialReference
  in the journal), `reality-probe-missing` *would* fire (probe absent) — and the run would be `PartialPass`,
  which the report then explains away as "harness-only." The gate exists; the plan starves it of the inputs
  that arm it.
- **`PartialPass` is treated as shippable.** `SuperCoordinatorReport.json:7` records `floorCheckVerdict:
  "PartialPass"` with `connectorComplete: true` and `floorCheckResidualsAreHarnessOnly: true`. But
  floor-check returns a hard boolean `pass` (`floor-check.workflow.js:748`); the plan maps a failed floor to
  `status: 'PartialPass'` (`growthzone.workflow.js:567`). "PartialPass" is a label the *plan* invents for a
  floor-check `pass:false` — there is no `PartialPass` state in floor-check itself. The human decision that
  the residuals are harness-only is exactly the "rubber-stamp a wrong connector" surface the reviewer is
  worried about.

### 4.5 So: is the fast finish (a) genuine cheap work, or (b) skipped verification?

**Both, in a roughly identifiable split.**

Genuinely cheap (legitimate, not a concern):
- O(1)-in-object-count extraction (`extract-iiof-pipeline.workflow.js:6-16`) — large schemas don't blow up.
- Credential-free tiers T0–T7 are fast scripts; several legitimately *Skip* as not-applicable
  (no-spec/no-fixtures — `verification-ladder.workflow.js:198-206`).
- Deterministic floor-check is JS, not LLM deliberation.

Skipped/shallow (the actual concern):
- **RealityProbe never ran** — the designed HOW-checker was absent from the plan (§4.2). ~40 GETs (~1
  minute) that the spec says would have caught the *majority* of GZ's 20-hour repair
  (`ARCHITECTURE_REFACTOR.md:116-118`) were not spent.
- **The deep engine e2e ran mock** (§4.3 #2) — the one stage that proves sync/idempotency against a real DB.
- **The producer/reviewer loop was bypassed** via `RESUME_PAST_*` (§4.3 #1).
- **Most ladder rungs Skipped** (T2/T3/T5/T6/T7/T8 — `SuperCoordinatorReport.json:13-21`), leaving T0,
  T1, T4 (circular), and T9 (reachability) as the entire credential-free signal.

The fast finish on GrowthZone was therefore **substantially because verification that checks HOW was
skipped**, not because the work was all cheap. The skipped pieces are recoverable (the probe script and
the live e2e machinery both exist and are well-built) — they were routed around for operational reasons
(multi-secret OAuth2 harness gap, two escalations), then the gaps were papered over as "harness-only" in a
hand-written report.

---

## 5. The 3 most important specific weaknesses (cited)

1. **The HOW-checker is optional in practice and the floor-check that should make it mandatory is
   journal-starved.** RealityProbe is absent from the only real build plan
   (`grep -c realityProbe plans/growthzone.workflow.js` = 0); floor-check's arming rules read a journal the
   plan doesn't populate (`growthzone.workflow.js:557` omits `realityProbe`/`envPreflight`/`credentialReference`
   that `floor-check.workflow.js:651,658,686` require). Net: a plan can omit the empirical stages and the
   floor either stays silent (`e2e-mock-dodge`) or yields a `PartialPass` the human waives.

2. **`PartialPass` + "residuals are harness-only" is a human rubber-stamp lane around a hard gate.**
   floor-check returns a boolean `pass` (`floor-check.workflow.js:748`); the plan downgrades a `false` to
   `status:'PartialPass'` (`growthzone.workflow.js:567`) and the report self-certifies
   `connectorComplete:true` with `floorCheckResidualsAreHarnessOnly:true`
   (`SuperCoordinatorReport.json:7-8`). Nothing mechanical distinguishes a true harness residual from a real
   defect being explained away.

3. **The deep empirical proof was dodged exactly as the spec forbids, and the live proof bypassed the
   gates.** HybridE2E ran `mode:'mock'`/`credentialReference:null` with a working credential
   (`growthzone.workflow.js:531-538`), and the live read-only evidence was a side-channel broker GET outside
   the ladder/e2e (`SuperCoordinatorReport.json:23-33`, T8 *Skipped* `:13,:33`). The single deepest
   correctness check (real engine → real DB → sync → idempotent re-run) never executed against the real API.

*(Honorable mentions: T4/T5/T6 circular fixtures — `ARCHITECTURE_REFACTOR.md:21`; `independent-reviewer`
spends a multi-round budget on a same-source re-read that "structurally cannot catch" model-vs-world bugs
by its own charter — `independent-reviewer.md:27-32`; `freeze-contract` can freeze a wrong model in unless a
probe outranks it — `ARCHITECTURE_REFACTOR.md:30`.)*

---

## 6. Concrete recommendations to make it more thorough about HOW (not just WHAT)

1. **Make `RealityProbe` (degraded-unauth when no creds) non-optional at the runtime level, not just the
   template.** floor-check already has `reality-probe-missing` (`floor-check.workflow.js:658-660`) — but it
   only fires if the plan writes `journal.realityProbe`. Add a complementary gate that fails when the
   *plan source* (already fetched as `planContent`, `floor-check.workflow.js:202`) contains no
   `phase('RealityProbe')` — so a plan that simply omits the stage can't pass. The probe script
   (`reality-probe.mjs`) is done; the gap is purely that a plan can leave it out.

2. **Make the journal contract mandatory.** floor-check should fail closed when `journal.credentialReference`,
   `journal.realityProbe`, `journal.envPreflight`, and `journal.brand` are absent — rather than treating
   absence as "rule not applicable" (today `e2e-mock-dodge` is silent without `journal.credentialReference`,
   `:651`). A missing journal key on a v2 build is itself a finding.

3. **Delete the `PartialPass` lane.** The plan should not be able to relabel a floor-check `pass:false`
   (`floor-check.workflow.js:748`) as `PartialPass` (`growthzone.workflow.js:567`). Either the floor passes
   (ship) or it fails (escalate). "Residuals are harness-only" must become a *machine* assertion: a harness
   limitation gets an explicit, enumerated `skipReason` per the §6 observability contract
   (`.claude/rules/connector-test-conventions.md` `livePhaseLog`), checked by floor-check — not a prose
   field a human sets in the report.

4. **Fix the harness gaps that cause the dodges, since the dodges are operational, not principled.**
   (a) The single-secret `connector-e2e-live` broker plan can't carry multi-secret OAuth2
   (`growthzone.workflow.js:526-530`) → extend the broker job env to N secrets so `mode:'live'` becomes
   reachable and `e2e-mock-dodge` (`floor-check.workflow.js:651`) actually bites. (b) The ladder T8 wanting a
   credential *file* while the broker model has none (`SuperCoordinatorReport.json:33`) → the broker-mediated
   live rung already exists in the ladder (`verification-ladder.workflow.js:243-255`); wire the plan to pass
   `brokerPlans` so T8 runs through the broker instead of skipping.

5. **Forbid `RESUME_PAST_*` short-circuits in a shippable run, or make them re-enter the gates.** The
   hard-coded `RESUME_PAST_EXTRACT`/`RESUME_PAST_CODE` (`growthzone.workflow.js:224,387`) inject fabricated
   clean verdicts. If an operator must patch metadata by hand, the run should **re-enter** IndependentReview +
   the ladder over the patched artifact (it partially does for the ladder, `:400-405`), never inject a synthetic
   `review = { ConfirmedGapsBlocking: 0 }` (`:235`). A resume that skips the reviewer is an unreviewed ship.

6. **Break the T4/T5/T6 fixture circularity by provenance.** Adopt the spec's P4 `fixture-provenance-missing`
   rule (`ARCHITECTURE_REFACTOR.md:133`, listed but **not yet in floor-check's rule enum** at
   `floor-check.workflow.js:79-117`): a fixture must be tagged `live-capture` (from the probe) or
   `vendor-published`; a fixture synthesized from the connector's own metadata fails. Until then, a green
   T4/T5/T6 proves the connector agrees with fixtures it helped author.

The throughline: the system's *design* already knows how to check HOW (the RealityProbe + outcome-shaped
live e2e). The PR's actual risk is that those mechanisms are **post-dated relative to the one shipped
connector, optional at the plan level, and waivable via a human `PartialPass` judgment.** Closing items
1–3 converts "the agent is trusted to have probed reality" into "the floor refuses to pass without it."
