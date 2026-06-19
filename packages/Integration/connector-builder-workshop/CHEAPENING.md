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

## 4. Adaptive fan-out by source tier ⏳
Scale adversarial reviewer N by source quality: a Tier-1 machine-readable source (OpenAPI / GraphQL
SDL) → N=1; docs-thin vendors → higher N. (Planner already sets `adversarialN`; make it a function of
the audited source tier rather than a fixed constant.)
- **Floor:** N never drops below 1, and the structural gates (floor-check, T1 invariants, §0b
  finding-floor) run unconditionally — fan-out tunes *redundancy*, not the gate set.

## 5. Empirical verdicts retire doc verification ⏳
When the credentialed RealityProbe confirms a claim live (path / PK / pagination-advance / watermark),
**drop** the doc-based adversarial re-litigation of that same claim. Don't pay twice for one fact.
- **Floor:** only a *confirmed* live verdict retires a doc check; an unprobed or failed claim keeps full
  doc verification. Empirical ≥ doc, so coverage only goes up.

## 6. Corpus reuse for known vendor-shapes ⏳
Cache the emitted plan per shape tuple (e.g. `REST+OpenAPI+oauth2-cc`). The next same-shape vendor
reuses a parameterized plan and skips the full Opus planner+reviewer cycle.
- **Floor:** the cached plan is **still run through `independent-reviewer`** for the specific vendor —
  reuse skips authoring, never review.

## 7. Resilient handoffs (retry/backoff) ⏳
A transport blip that aborts a build forces a full re-run — the most expensive failure. Retry on
`agent()` handoff; resume-from-cache (`resumeFromRunId`) already makes a killed run cheap to continue.
- **Floor:** retries are transport-only; a real stage failure still routes to the amendment loop.

## Impact ranking (per effort)
1–2 are the big, low-risk wins (model tiering already mostly in place + the ordering change here).
3–5 cut the verification tail. 6–7 cut repeat/restart cost. None removes a gate; each names its floor.
