# Independent Review — Eventbrite Build Plan (Stage 2: Plan Review)

**Reviewer model**: Sonnet 5 (independent of the planner, which produced this plan on Opus per the harness's model-diversity requirement).

**Verdict: `approved-with-amendments`**

The plan is well-constructed, honestly reasons about Eventbrite's genuinely-testable credential-free
contract, correctly wires the anti-vacuous MOCK-full-coverage floor gates, and preserves the locked-primitive
composition + both amendment loops verbatim from `_TEMPLATE.workflow.js`. However, independent tracing of the
plan's `capability-dishonest` gate wiring against the actual `floor-check.workflow.js` source turned up **one
blocking, silently-dead gate** that defeats exactly the GZ #30 defense the plan's own commentary claims to
arm. One additional advisory-severity dead-argument issue is also documented. Both are mechanically fixable.

---

## 1. Confirmed gaps

### 1.1 [BLOCKING] `capability-dishonest` gate is structurally dead — `WriteCapability` is typed as an object but the gate's trigger regex only matches a string

**Location**: `plans/eventbrite.workflow.js` lines 172-174 (BRAND_SCHEMA) interacting with
`primitives/floor-check.workflow.js` lines 908-918 (the `capability-dishonest` rule).

**What's wrong, traced mechanically:**

The plan's `BRAND_SCHEMA` types `WriteCapability` as `{ type: ['object', 'null'] }` (line 173) and the
`BrandResearch` prompt (lines 182) instructs the researcher to "populate WriteCapability with the
object→operation map" — i.e., an object like `{events: ['create','update'], ticket_classes: [...], ...}`,
not a plain enum string.

The floor-check gate that is supposed to enforce capability honesty reads:

```js
// primitives/floor-check.workflow.js:911-917
const brandWrite = (journal.brand && journal.brand.WriteCapability) || null;
if (brandWrite && /read-write|bidirectional/i.test(String(brandWrite))) {
    const writeIOs = Number.isInteger(journal.writeCapableIOCount) ? journal.writeCapableIOCount : null;
    const scopedOut = !!(journal.outOfScopeFamilies && JSON.stringify(journal.outOfScopeFamilies).match(/write/i)) || !!journal.writeScopeDecision;
    if (writeIOs === 0 && !scopedOut) {
        failures.push({ rule: 'capability-dishonest', detail: ... });
    }
}
```

`String({...})` in JavaScript always evaluates to the literal string `"[object Object]"`, regardless of the
object's contents. I confirmed this directly:

```
node -e "
const brandWrite = { objects: ['events','ticket_classes'], operations: ['create','update','delete'], summary: 'bidirectional' };
console.log('String(obj) =', String(brandWrite));                      // -> [object Object]
console.log('regex test =', /read-write|bidirectional/i.test(String(brandWrite)));  // -> false
"
```

Because `brand.WriteCapability` will be an object (per the plan's own schema + prompt), the
`/read-write|bidirectional/i.test(String(brandWrite))` guard **can never be true**, so the entire
`capability-dishonest` `if` block is dead code for this plan. The `writeCapableIOCount` computation stage
(lines 615-634 of the plan) is correctly wired and does arm `journal.writeCapableIOCount` with a real,
deterministically-computed integer from the persisted metadata — but the *trigger condition* that would use
that count is unreachable. So even if the extractor silently ships Eventbrite pull-only (the exact GZ #30
class the plan's commentary repeatedly cites and claims to defend against — "SupportsCreate/Update/Delete +
per-operation CRUD columns are emitted where the docs prove the endpoint, and the capability-dishonest floor
gate (armed below) proves the write count is non-zero"), **FloorCheck will not fail on it.**

**Why this is not caught elsewhere (I checked):**

- `write-coverage-mock-incomplete` (floor-check lines 1030-1042) computes its `writable` set from
  `activeIOFields.filter(isWritable)` — i.e., from the IOs *actually emitted with write columns*. If the
  extractor emits **zero** write-capable IOs, `writable.length === 0`, so `unproven.length` is also 0 and this
  gate passes trivially. It proves declared writes work; it cannot detect the *absence* of writes that should
  have been declared.
- `graders/bijection.mjs` only checks the forward direction (capability flag set ⇒ columns present); it has
  no notion of "this vendor should have write capability."
- No other gate in `floor-check.workflow.js` references `brand.WriteCapability` or `writeCapableIOCount`.

**Is this specific to Eventbrite's plan, or systemic?** I grepped every other plan in `plans/*.workflow.js`
(blackbaud, cvent, fonteva, hivebrite, imis, microsoft-dynamics-365, neon-crm, netsuite, ...). Every one of
them types `WriteCapability` as `{type:['object','null']}` or `{type:'object'}` (hubspot and
microsoft-dynamics-365 additionally allow `'string'` as a union member, which would at least sometimes work).
So this is a **pre-existing, corpus-wide defect in the gate's regex assumption**, not something the Eventbrite
planner introduced — but the Eventbrite plan repeats and relies on the broken gate without noticing or
correcting it, and Eventbrite is precisely the vendor where this matters (a genuinely write-capable API where
a silent pull-only ship is a real, plausible failure mode this build should defend against).

**Severity: Blocking.** The plan's own narrative claims this gate is the write-capability backstop; it is not
live. Per Charter item 5, I must reject a plan that merely *references* a fix without confirming it actually
fires.

**Mechanical fix** (does not require touching the locked primitive's rule *logic*, only how the trigger is
armed — or, preferably, fix the primitive since the defect is corpus-wide):

- **Preferred (fixes it for every plan, not just Eventbrite)**: in `floor-check.workflow.js`, change the
  trigger check to inspect the *shape* of `brand.WriteCapability` rather than assuming a string enum, e.g.:
  ```js
  const bw = journal.brand && journal.brand.WriteCapability;
  const brandWriteText = typeof bw === 'string' ? bw
      : (bw && typeof bw === 'object') ? JSON.stringify(bw) : '';
  if (brandWriteText && /read-write|bidirectional|create|update|delete/i.test(brandWriteText)) { ... }
  ```
  This is a one-line change to the LOCKED primitive and is out of scope for a per-vendor plan amendment, but
  it is the correct fix and should be flagged to the workshop maintainers as a corpus-wide bug independent of
  this plan-review gate.
- **Immediate per-plan mitigation** (keeps the plan self-sufficient without waiting on a primitive change):
  add a `WriteCapabilitySummary` string field to `BRAND_SCHEMA` (e.g. `enum: ['read-only','read-write','bidirectional','unknown']`)
  that the `BrandResearch` prompt is instructed to also populate alongside the object map, and thread that
  string into `journal.brand.WriteCapability` at the FloorCheck call site instead of the object (or as an
  additional key the gate can read). Concretely in `plans/eventbrite.workflow.js`:
  1. Add to `BRAND_SCHEMA` (near line 173): `WriteCapabilitySummary: { type: ['string','null'] }` — one of
     `'read-only'|'read-write'|'bidirectional'|'unknown'`.
  2. Update the `BrandResearch` prompt to require it be set to `'bidirectional'` when the researcher confirms
     documented create/update/delete endpoints (as it already expects to conclude for Eventbrite).
  3. At the FloorCheck journal assembly (plan line 654), pass `brand: { ...brand, WriteCapability: brand.WriteCapabilitySummary ?? brand.WriteCapability }` so the gate receives a string it can regex-match, while the
     full object map is preserved elsewhere (e.g. `brand.WriteCapabilityDetail`) for the extractor/reviewer to
     consume.

Either fix is mechanical. I recommend flagging the primitive-level fix to the workshop maintainers as a
follow-up regardless of what the per-plan mitigation does, since this defect silently disarms capability
honesty across the entire connector-builder corpus, not just Eventbrite.

---

### 1.2 [ADVISORY] `outOfScopeFamilies` / `scopeReason` passed to `extract-iiof-pipeline` are silently dropped — dead arguments that could mislead a plan reader

**Location**: `plans/eventbrite.workflow.js` lines 306-307 (the `IOIOFExtract` `workflow()` call args) vs.
`primitives/extract-iiof-pipeline.workflow.js` — I read its full input contract (documented at the top of the
file, lines 18-27) and its full body; it never declares, reads, or forwards `outOfScopeFamilies` or
`scopeReason` anywhere. Extra keys on the args object are harmlessly ignored by the primitive (no crash), but
they do nothing.

**Consequence, traced**: this is **not** a live bug for the object-scope-honesty gate
(`scope-unjustified-thin`), because `floor-check.workflow.js`'s journal assembly at plan line 649 uses
`extractStats.scopeDecision ?? sources.scopeDecision ?? null` — and since `extractStats.scopeDecision` is
always `undefined` (the primitive never returns that key), the fallback correctly resolves to
`sources.scopeDecision`, which **is** populated directly by the `SourceAudit` agent (per its own
`SOURCES_SCHEMA`, line 220). So the `scope-unjustified-thin` gate is armed correctly through the fallback
chain, independent of the dead extract-pipeline args.

Same applies to `writeScopeDecision` at plan line 633
(`extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null`) — although note
this fallback conflates two semantically different concepts (object-scope decision vs. write-scope decision);
it happens to be moot because of finding 1.1's dead trigger, but if 1.1 is fixed this fallback should be
reconsidered (see Judgment Calls, 2.2).

**Severity: Advisory.** No downstream gate is actually weakened by this — it is purely a plan-hygiene issue
(passing arguments a primitive doesn't consume, giving a false impression the extractor is scope-aware). Safe
for the extractor to proceed; worth cleaning up but not blocking.

**Mechanical fix**: remove the `outOfScopeFamilies`/`scopeReason` keys from the `extract-iiof-pipeline`
`workflow()` call args at plan lines 306-307 (they do nothing there), OR — better — extend
`extract-iiof-pipeline.workflow.js`'s documented input contract to actually consume and echo back
`scopeDecision`/`outOfScopeFamilies` on its return object, so `extractStats.scopeDecision` stops being
permanently `undefined`. The latter is a primitive-level enhancement, out of scope for this plan alone.

---

## 2. Judgment calls

### 2.1 `adversarialVerifyMinReviewers = 2` (not 1) for a strong Tier-1/2 source with no live confirmation

**What the plan chose**: N=2, reasoning that Eventbrite's public REST v3 reference is Tier-1/2
machine-readable, but this is a credential-free run with no live RealityProbe confirmation, so N=1 (which
per the plan's own comment "requires empirical live confirmation") is not warranted; N=2 is the correct
default, escalating to N=3 only if source-auditor flags thin/ambiguous coverage.

**What I would have chosen**: The same. Eventbrite's object universe is moderately large (events + ~10
nested/related families) with several access-path subtleties (nested attendees/orders/ticket_classes under
`/events/{id}/...`) that are exactly the kind of thing a second reviewer catches. N=2 with an escalation path
to N=3 on ambiguity is a reasonable, source-grounded calibration; I would not have defaulted to N=1 for a
credential-free run either.

**Why neither is wrong**: both readings are grounded in the plan's own stated policy (N=1 requires live
confirmation; this run has none), and the risk profile (real object graph with several nested access-paths)
supports N=2 as a sensible middle ground rather than an arbitrary pick.

### 2.2 Reusing `sources.scopeDecision` (object-scope) as a fallback for `writeScopeDecision` (write-capability-scope)

**What the plan chose**: at line 633, `extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null` — i.e. if the extractor never sets a dedicated write-scope decision, fall back first to the
object-scope decision, then to the raw brand WriteCapability object.

**What I would have chosen**: I would keep `sources.scopeDecision` out of this specific fallback chain,
since it answers a different question (which *object families* are in/out of scope) than
`writeScopeDecision` (which *write operations* are in/out of scope for in-scope objects). Conflating them
means a `sources.scopeDecision` documenting "we excluded webhooks/media because they're not sync-relevant"
would satisfy the `capability-dishonest` gate's `scopedOut` check even though it says nothing about writes —
if the object-scope decision object happens to be truthy, `!!journal.writeScopeDecision` becomes true
regardless of content.

**Why neither is wrong**: this fallback is currently inert because finding 1.1 already prevents the
`capability-dishonest` block from ever executing — so in practice this ambiguity has zero live effect today.
It only becomes a real design question once 1.1 is fixed, at which point I'd flag it as worth tightening
(require `writeScopeDecision` to be a dedicated, purpose-built decision object rather than an overloaded
existing field) — but that's a defensible next-iteration refinement, not something that makes the current
plan wrong given the fix in 1.1 hasn't landed yet.

### 2.3 `maxTier = 'T8'` vs. the manifest default `'T9'` in `_TEMPLATE.workflow.js`

**What the plan chose**: `MANIFEST.e2eTier = A?.maxTier ?? 'T8'` (line 120), diverging from the template's
default `'T9'` (`PropertyBasedFuzz`).

**What I would have chosen**: Same, or would not have objected. Per the spec digest's `tierLadder`, T8 is
`FailureModeInjection` (inject 429/500/timeout/bad-JSON, verify retry+classify) and T9 is
`PropertyBasedFuzz` — both credential-free (`requiresCredentials: false`), so this isn't a live-vs-mock
distinction. The plan's own commentary frames T8 as "the credential-free ceiling" for this run, which is a
defensible scoping choice for a first-build given the manifest is explicitly injectable via `args.maxTier`
and the operator can raise it. Not flagging this as a gap since it's an explicit, stated choice within the
tier ladder's non-live range, not a corner-cut on live verification.

---

## 3. Reviewer errors

### 3.1 Initial suspicion: pagination mislabeling risk

I initially expected to find the plan's continuation-token pagination guidance loosely worded enough to risk
being mis-extracted as page-number/offset (the GZ dead-pagination class named explicitly in the charter). On
inspection, the plan is precise at every layer — `PaginationType=Cursor` is explicitly named three times
(BrandResearch prompt, SourceAudit prompt, MetadataWrite prompt), the exact envelope shape
(`pagination.has_more_items` + `pagination.continuation`) is spelled out, and CodeBuild's prompt explicitly
instructs `ExtractPaginationInfo` to read those exact fields and forbids a page-number/offset loop. I also
independently confirmed `extract-iiof-pipeline.workflow.js` has its own independent
`paginationMismatch` check (line 308/328) comparing declared `PaginationType` against the spec's actual
paging params — a second, primitive-level backstop independent of the plan's prose. This concern did not
hold up; I withdraw it.

### 3.2 Initial suspicion: isolated-infra wiring might be a placeholder that silently falls back to shared workbench coords

I expected the `dbProfile`/`mjapi` args threading in the `HybridE2E` stage to be cosmetic — i.e., that
`hybrid-e2e.workflow.js` might ignore the caller-supplied coords and default back to the shared
`MJ_SS_E2E`/`sql-claude`/`:4007` workbench regardless. On reading the primitive directly, this is false: the
primitive explicitly reads `A?.dbProfile`/`A?.mjapi` (lines 73-79), and only falls back to the historical
HubSpot defaults when those are `null`/absent — which is exactly the documented, safe default behavior. The
plan's comment describing this ("this run uses a DEDICATED, separately-provisioned SQL container... injected
into this call post-emission") matches the primitive's actual `ISOLATION_OVERRIDE` banner mechanism verbatim.
This concern did not hold up; I withdraw it.

### 3.3 Initial suspicion: the anti-vacuous MOCK-full-coverage rule might be aspirational prose without a live enforcing gate

Given the charter's explicit warning about a "0-row mock pass" being let through, I expected to find the
plan's "GENUINE-GREEN-MOCK... no Goldilocks subset" language was merely descriptive commentary with no
corresponding enforcement. I traced this into `floor-check.workflow.js` lines 1010-1042
(`behavioral-coverage-mock-incomplete` / `write-coverage-mock-incomplete`) and confirmed the MOCK-mode
full-coverage rule is real, deterministic JS logic that explicitly rejects a `coverageScopeReason` downgrade
in mock mode, plus the `e2e-landed-zero-rows` gate (line 964) that fails on `syncLandedRows !== true`. This
concern did not hold up as stated; I withdraw it (the more precise version of this concern is documented as
the real, confirmed gap 1.1 above, which is a different mechanism entirely).

---

## Stats block

```json
{
  "Verdict": "approved-with-amendments",
  "ConfirmedGapsBlocking": 1,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 3,
  "ReviewerErrors": 3,
  "PrimitivesIndependentlyTraced": [
    "primitives/floor-check.workflow.js",
    "primitives/extract-iiof-pipeline.workflow.js",
    "primitives/hybrid-e2e.workflow.js",
    "floor/graders/bijection.mjs",
    "floor/phase0-slots.json"
  ],
  "FixInstructions": [
    {
      "slot": "plan.eventbrite.BRAND_SCHEMA.WriteCapabilitySummary",
      "operation": "add-field",
      "before": "BRAND_SCHEMA has no string-typed WriteCapability summary field; journal.brand.WriteCapability is always an object, so floor-check's capability-dishonest gate's `/read-write|bidirectional/i.test(String(brandWrite))` trigger is permanently false (String({...}) === '[object Object]').",
      "after": "Add `WriteCapabilitySummary: { type: ['string','null'] }` (enum-like: 'read-only'|'read-write'|'bidirectional'|'unknown') to BRAND_SCHEMA; require BrandResearch to set it to 'bidirectional' when documented create/update/delete endpoints are confirmed (which the plan already expects for Eventbrite); pass `brand: { ...brand, WriteCapability: brand.WriteCapabilitySummary ?? brand.WriteCapability }` into the FloorCheck journal so the gate receives a matchable string while the full object map is preserved under a separate key (e.g. WriteCapabilityDetail) for extractor/reviewer consumption.",
      "evidence": "packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js lines 911-917; verified via `node -e \"console.log(String({...}))\"` -> '[object Object]'",
      "rationale": "Without this fix, the capability-dishonest gate — the plan's own claimed defense against shipping Eventbrite pull-only (the GZ #30 defect) — can never fire, regardless of what the extractor emits.",
      "requiresEscalation": false
    },
    {
      "slot": "floor-check.workflow.js.capability-dishonest-trigger",
      "operation": null,
      "before": "const brandWrite = (journal.brand && journal.brand.WriteCapability) || null; if (brandWrite && /read-write|bidirectional/i.test(String(brandWrite))) { ... }",
      "after": "Shape-aware stringification: typeof bw === 'string' ? bw : (bw && typeof bw === 'object') ? JSON.stringify(bw) : ''; then regex-match against a broader pattern including create/update/delete tokens.",
      "evidence": "packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js lines 911-917; corpus-wide grep of plans/*.workflow.js shows every plan types WriteCapability as an object, not a string.",
      "rationale": "This is a locked-primitive-level defect affecting every vendor plan in the corpus, not just Eventbrite. Recommend flagging to workshop maintainers as a follow-up independent of this plan's approval.",
      "requiresEscalation": true
    },
    {
      "slot": "plan.eventbrite.IOIOFExtract.args.outOfScopeFamilies",
      "operation": "clear",
      "before": "outOfScopeFamilies + scopeReason passed as args to extract-iiof-pipeline.workflow.js, which never declares or reads them (dead arguments).",
      "after": "Remove the two dead keys from the workflow() call args at plan lines 306-307 (or, as a primitive-level follow-up, extend extract-iiof-pipeline's contract to actually consume + echo scopeDecision/outOfScopeFamilies).",
      "evidence": "packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js — full read of the documented input contract (lines 18-27) and the whole file confirms no reference to outOfScopeFamilies or scopeReason.",
      "rationale": "Advisory only — the scope-unjustified-thin gate is still armed correctly via the sources.scopeDecision fallback at the FloorCheck journal assembly, so no downstream gate is weakened. Cleanup for plan clarity.",
      "requiresEscalation": false
    }
  ]
}
```
