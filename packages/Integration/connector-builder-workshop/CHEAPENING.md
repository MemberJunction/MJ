# Connector-arc cost reduction — cheaper, never less thorough

Goal: cut token cost of a connector build **without reducing coverage**. Every item below names
its **thoroughness floor** — the guard that keeps rigor intact while cost drops. Status: ✅ applied on
this branch · ◻︎ present already · ⏳ documented/next.

## 1. Per-stage model tiering ✅ / ◻︎
Mechanical stages run on cheap models; only genuine hard-reasoning stays on Opus.
- `testing-agent` → **haiku** (returns the MCP runner's result verbatim) ◻︎
- `vendor-brand-researcher`, `identity-establisher` → **haiku** ◻︎
- `metadata-writer`, `source-auditor`, `independent-reviewer` → **sonnet** ◻︎
- `super-coordinator` → **sonnet** (pure orchestration; downgraded from opus) ✅
- `connector-creator` (plan), `code-builder`, `ioiof-extractor` → **opus** (kept) ◻︎
- **Floor:** the extractor stays on Opus — under-enumeration is the famous failure; flat-in-object-count
  design means model choice is about quality, not token count. The reviewer + count-reconcile catch any
  extractor miss regardless of its model.

## 2. Cheapest-defect-first ordering ✅
Run `deploy-preflight` + offline behavioral tiers (T5 mock / T6 SQLite) **first**, before structural
tiers + extraction. Doomed runs (wrong enumeration, deploy-blockers) die in round 1 on near-free
detectors instead of after full extraction spend. (Section now in build-connector SKILL.md.)
- **Floor:** ordering only — it changes *when* a gate runs, never *whether*. Same 17 cells + T9–T12 run.

## 3. SLIM-mode reviewers ◻︎ / ⏳
`independent-reviewer` reads a count-reconcile script output + ~15-field sample, not the whole source —
caps reviewer cost **flat** regardless of catalog size.
- **Floor:** the **count-reconcile is mandatory** and is what catches under-enumeration (the
  Salesforce/path-LMS class). Sampling rides on top of, never replaces, the count check.

## 4. Adaptive fan-out by source tier ✅ (CORRECTNESS-WEIGHTED)
Implemented in `connector-creator.md`. N scales **UP on risk, down only when correctness is already
secured**: N=1 ONLY when the source is Tier-1 machine-readable **AND** the RealityProbe confirmed the
claims live; N=2 default; **N=3 on any risk signal** (Tier-3/docs-only source, write-capable connector,
hard-constraint-heavy emission, a probe-falsified claim, or auditor-flagged thin coverage). >3 → diverse
LENSES over the same slim count-reconcile, never N full-schema copies.
- **Floor:** N never below 1; structural gates run unconditionally; risk *earns* scrutiny.

## 5. Empirical verdict retires doc-recheck; residual gets MORE scrutiny ✅
Implemented in `connector-creator.md` (RealityProbe already does "reality outranks the contract" for
falsified claims). A claim the probe **confirmed live** is correct by observation → no doc re-litigation;
the saved scrutiny **redirects** onto the `gatedExists` / `format-verified-no-creds` residual the probe
couldn't reach — exactly where a doc-only inference can still be wrong.
- **Floor:** only a *confirmed* live verdict retires a doc check; unprobed/failed claims keep full doc
  verification. Empirical ≥ doc — correctness only goes up.

## 6. Corpus reuse for known vendor-shapes ◻︎ (review always runs)
`corpus_lookup` exists and is NON-gating. Reuse skips plan *authoring*, never the per-vendor
`independent-reviewer` gate. (Populating the corpus is the remaining bit; the safety invariant — reuse ≠
skip review — is already the rule.)
- **Floor:** the cached plan is **still reviewed** for the specific vendor; reuse never bypasses a gate.

## 7. Resilient handoffs (retry/backoff) ✅ (helper in template)
`withRetry()` added to `_TEMPLATE.workflow.js`, wired into the code-build handoff (the most expensive
single result to lose). Retries TRANSPORT throws (ECONN/timeout/429/5xx/overloaded) with backoff; a real
stage failure (schema-invalid, build error) is returned by the agent and routes to the amendment loop —
never retried as transport. Resume-from-cache covers hard process death.
- **Floor:** transport-only retry; correctness-bearing failures still go through the amendment loop.
- **Next:** wire `withRetry` into the remaining heavy handoffs + runtime-level retry on every `agent()`.

## Impact ranking (per effort)
1–2 are the big, low-risk wins (model tiering already mostly in place + the ordering change here).
3–5 cut the verification tail. 6–7 cut repeat/restart cost. None removes a gate; each names its floor.
