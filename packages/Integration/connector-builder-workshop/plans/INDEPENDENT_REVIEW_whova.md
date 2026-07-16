# Independent Plan Review — Whova connector build

**Reviewer model**: Sonnet 5 (independent of planner, which produced this plan on Opus per task
framing). Reviewing `plans/whova.workflow.js` against `plans/_TEMPLATE.workflow.js` and
`planner/spec-digest.json`, without access to the planner's rationale.

**Default verdict posture**: rejected-until-proven-sound. Verdict below is
**`approved-with-amendments`**.

---

## 1. Locked-primitive composition — PRESERVED

Checked every `workflow({ scriptPath: ... })` call site against the template: `audit-source`,
`extract-iiof-pipeline`, `compute-source-diff`, `gap-fill-fork`, `freeze-contract`,
`verification-ladder`, `hybrid-e2e`, `floor-check` are all invoked with parameter shapes matching
the template call sites (no parameter dropped or weakened). `freeze-contract` runs before the
`CodeBuild` phase (inside the extract/review loop, before the loop that gates `CodeBuild`).
`floor-check` is the terminal gate before `OpenAppPublish`. Order is identical to the template:
EnvPreflight → BrandResearch → Identity → SourceAudit → MetadataWrite → [Extract→Freeze→Review] →
SourceDiff/GapFill → RealityProbe → ProbeAmend → [CodeBuild→Ladder] → HybridE2E → FloorCheck →
OpenAppPublish. **No concern.**

## 2. Both amendment loops — PRESERVED, correctly bounded

- Extract loop: `MAX_AMENDMENT_ROUNDS = 3`, slot-routing (`integration.*` → metadata-writer,
  `connector.*` → deferred to CodeBuild via `deferredConnectorFindings`, everything else → extractor)
  is byte-identical to the template, including the connector-only-blocking-gaps early break and the
  byte-identical-fingerprint deadlock detector (`previousReviewFingerprint`).
- Code+ladder loop: `MAX_CODE_BUILD_ROUNDS = 3`, same fingerprint-deadlock pattern
  (`previousCodeFingerprint`), same file-existence gate forcing `BuildClean=false` on a missing
  connector file, same artifact-staging + index.ts registration steps.
- No single-`return`-on-first-gap pattern present anywhere. **No concern.**

## 3. Different-model adversarial review — PRESERVED

`IndependentReview` stage: `{ agentType: 'independent-reviewer', model: 'sonnet', ... }` — pinned to
sonnet, distinct from the (Opus) planner. Matches template. **No concern.**

## 4. Credential-free adaptation — mostly correct, one dead gate (see §7 below)

- `RealityProbe` is present and its prompt correctly instructs the DEGRADED unauthenticated status
  probe (401/403 = gated-exists, not falsified; 404/405 = correctable). `achievedCeiling:
  'format-verified-no-creds'` is hardcoded into the expected return, consistent with a credential-free
  run.
- `HybridE2E` is present, unconditionally invoked (not skipped), and its `mode` expression —
  `(A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' :
  'mock'` — is byte-identical to the template's Facet-D-#H7 fix. Verified against
  `primitives/hybrid-e2e.workflow.js`: with no credential, this correctly resolves to `mock`, and the
  primitive's own mock-mode contract requires FULL object coverage (no Goldilocks subset) — matching
  the plan's phase description ("Full object coverage in mock (no Goldilocks subset)").
- `maxTier: 'T8'` — verified against `primitives/verification-ladder.workflow.js`: T8 is the *only*
  credential-required rung in the real T0–T8 ladder (per the binding read-only revision in
  `connector-test-conventions.md`), and with no `credentialReference`/`brokerPlans` it legitimately
  skips via `no-credential-reference` rather than a fabricated pass. T0–T7 (the full non-live battery)
  run unconditionally regardless of `maxTier`. This is the correct credential-free configuration.
  **No concern** on any of the above three points.

## 5. Capability honesty — plan text is right, but the wiring that would enforce it is dead (BLOCKING — see §7)

The plan's language throughout (BrandResearch prompt, IndependentReview prompt, CodeBuild prompt) is
appropriately alarmed about the GZ #30 defect class and repeatedly instructs agents to prove/disprove
write capability rather than assume. That's correct *intent*. But see §7 below: the actual
`journal.writeCapableIOCount` value that the `capability-dishonest` floor-check rule keys off of is
**never computed by any stage in the plan**, so the mechanical gate that is supposed to catch a false
"pull-only" claim cannot fire. Intent without a live enforcement wire is not enough for a vendor the
plan itself flags as the highest-risk area of this build.

## 6. Anti-thin discipline — correctly implemented

BrandResearch is explicitly told to establish the object/capability universe independent of the thin
public docs and record `ObjectFamilies` (full discovered surface) + `WriteCapability` +
`ScopeReason`. SourceAudit is told to record `outOfScopeFamilies` **with reasons** rather than
silently drop under-documented families, and to feed them into `Integration.Configuration
.OutOfScopeObjectFamilies` via MetadataWrite. This correctly implements §0b ("sparse docs are not
evidence of a thin system") and is a legitimate, well-reasoned vendor-specific customization over the
generic template. **No concern.**

## 7. CONFIRMED GAP (Blocking) — `writeCapableIOCount` has no producer; `capability-dishonest` gate is structurally dead

**Location**: `plans/whova.workflow.js` line 586 (`writeCapableIOCount:
extractStats.writeCapableIOCount ?? null`), consumed by `primitives/floor-check.workflow.js` lines
908–918.

**What's wrong**: `primitives/floor-check.workflow.js`'s `capability-dishonest` rule (the exact GZ
#30 detector this task charter names by name) only fires when:
```js
const writeIOs = Number.isInteger(journal.writeCapableIOCount) ? journal.writeCapableIOCount : null;
if (writeIOs === 0 && !scopedOut) { failures.push({ rule: 'capability-dishonest', ... }); }
```
`writeIOs === 0` is the ONLY way to trip it. I traced every producer in the plan
(`extract-iiof-pipeline.workflow.js`'s `return` statement, the `IOIOFExtract`/`AmendmentRound*`
stages, the `IndependentReview` stage) — **none of them ever sets `extractStats.writeCapableIOCount`**.
`extract-iiof-pipeline.workflow.js`'s return object (verified by reading its final `return {...}`
block, lines 453–469) has no such field. So `extractStats.writeCapableIOCount` is always `undefined`,
the `?? null` fallback always fires, and `journal.writeCapableIOCount` is always `null` —
`Number.isInteger(null)` is `false`, so `writeIOs` is always `null`, and `writeIOs === 0` is always
`false`. **The gate can never fire, regardless of what the emission actually contains.** A pull-only
Whova connector shipped silently for a bidirectional vendor — the exact defect class named in this
task's charter — would sail through `capability-dishonest` clean.

The secondary escape hatch (`scopedOut`, keyed on `journal.outOfScopeFamilies` containing "write" or
`journal.writeScopeDecision`) is irrelevant here since the primary condition (`writeIOs === 0`) never
becomes true in the first place — but for completeness, `writeScopeDecision` also has no producer
anywhere in the plan (`extractStats.writeScopeDecision ?? null` — same dead-field pattern).

**Root cause is NOT Whova-specific** — I confirmed the identical dead wiring exists verbatim in
`plans/_TEMPLATE.workflow.js` (line 666: `writeCapableIOCount: extractStats.writeCapableIOCount ??
null`). This is an inherited template defect, not something the planner introduced for Whova.
However: this plan's own preamble explicitly flags WriteCapability as the highest-scrutiny item for
this specific vendor ("adversarialN=3... correctness earns MORE scrutiny"), and the planner had the
opportunity — and, given the elevated risk framing, the obligation — to notice that the mechanical
backstop for exactly this risk is non-functional, and patch it rather than inherit it silently.

**Severity**: Blocking. The task charter names this exact scenario (GrowthZone #30) as the paradigm
case this review exists to prevent slipping through.

**Mechanical fix**: Compute `writeCapableIOCount` from the persisted metadata (not from the extractor
agent's self-report) at a point where it's cheap and trustworthy — e.g. immediately after the extract
loop converges (same place `SourceDiff` already re-reads `extractStats.extractedObjects`), by reading
the written-back `.whova.integration.json` and counting IOs with `SupportsCreate ||
SupportsUpdate || SupportsDelete === true`. A single small node script invocation (mirroring the
pattern already used for `enforce-finding-floor.mjs` / `build-matrix-from-metadata.mjs`) is
sufficient — no new agent call needed. Then set `extractStats.writeCapableIOCount = <that count>`
before the `FloorCheck` phase reads it, e.g.:

```js
// After the extract/review loop converges, before SourceDiff or right before FloorCheck:
const writeCapCheck = await agent(
    `Run: node -e "const m=require('${METADATA_FILE}'); const ios=(m.relatedEntities?.['MJ: Integration Objects']??m['MJ: Integration Objects']??[]); const n=ios.filter(io => io.fields?.SupportsCreate||io.fields?.SupportsUpdate||io.fields?.SupportsDelete).length; console.log(JSON.stringify({writeCapableIOCount:n}));" ` +
    `and return its JSON verbatim.`,
    { schema: { type: 'object', required: ['writeCapableIOCount'], properties: { writeCapableIOCount: { type: 'integer' } } }, phase: 'FloorCheck', label: 'compute-write-capable-count' }
);
extractStats.writeCapableIOCount = writeCapCheck.writeCapableIOCount;
```//pseudocode — adapt to the actual mj-sync file shape / a dedicated script under floor/.

This also applies to `plans/_TEMPLATE.workflow.js` since the defect is inherited — worth flagging to
whoever owns template maintenance so every future vendor plan isn't born with this gate already dead.
Recommend the planner patch `whova.workflow.js` directly (since that's the artifact under review) and
separately flag the template defect for a follow-up fix so it isn't silently re-inherited by the next
vendor plan.

## 8. Args normalization — PRESERVED

`const A = (typeof args === 'string') ? (() => {...})() : (args ?? {});` present verbatim, matches
template. **No concern.**

---

## Other observations (non-blocking)

- **Two extra `args` keys silently ignored by the primitive they're passed to.** The extract-loop
  `workflow()` calls pass `outOfScopeFamilies` and `scopeReason` into
  `extract-iiof-pipeline.workflow.js`'s `args` (lines 272–273 of `whova.workflow.js`), but I confirmed
  by reading the primitive's arg-destructuring (`args?.vendor`, `args?.objectList`, `args?.sourceBundle`,
  etc.) that neither key is ever read there. This isn't a "weakened primitive parameter" (the
  primitive's actual contract is untouched) and isn't blocking, but it does mean the extractor agent
  never receives the out-of-scope list through this channel — only through its own prompt text
  (which does separately embed `sources.outOfScopeFamilies` via `JSON.stringify`, so the information
  isn't entirely lost, just redundantly/confusingly passed twice through different channels, one of
  which is a no-op). Advisory: drop the two unused keys from the `extract-iiof-pipeline` call args, or
  file it as a primitive enhancement if the intent was for the extractor to consume them
  programmatically.
- The plan's `VENDOR_SLUG` / default `VENDOR = A?.vendor ?? 'whova'` hardcodes the vendor as a
  fallback, which is appropriate for a per-vendor plan (template defaults to `'(unknown)'`) — correct
  customization, not a defect.

---

## Verdict

**`approved-with-amendments`**

One blocking, mechanically-fixable gap (§7): `writeCapableIOCount` has no producer anywhere in the
plan, which structurally defuses the `capability-dishonest` floor-check gate — the exact GZ #30
detector this build's own risk framing calls out as the top concern for a vendor whose write
capability is genuinely unknown going in. Everything else — locked-primitive composition, both
amendment loops, different-model review, credential-free RealityProbe/HybridE2E/maxTier wiring,
anti-thin discipline, args normalization — checks out against independent re-derivation from the
primitives themselves (not just the template diff).

### FixInstructions

```json
[
  {
    "location": "plans/whova.workflow.js, after the extract/review amendment loop converges (~line 361, before SourceDiff) or immediately before the FloorCheck phase (~line 567)",
    "what": "extractStats.writeCapableIOCount is read by FloorCheck's journal but never computed by any stage; capability-dishonest floor-check rule is structurally unreachable",
    "fix": "Add a small agent step (or dedicated script under floor/) that reads the persisted metadata file, counts IOs with SupportsCreate||SupportsUpdate||SupportsDelete true, and assigns the result to extractStats.writeCapableIOCount before FloorCheck runs. Also set extractStats.writeScopeDecision from the SourceAudit/extractor scope output if available, since that field is equally dead today.",
    "severity": "blocking",
    "alsoAffects": "plans/_TEMPLATE.workflow.js (same dead wiring inherited by every future vendor plan) — flag separately for template maintenance"
  }
]
```
