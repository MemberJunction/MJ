# INTEGRATION_MODES.md — the 3 build modes for the build-connector skill

Today the arc has exactly **one** mode: *new*. Every `/build-connector` runs the full Plan→Review→Execute
pipeline from scratch (`build-connector/SKILL.md`), even when the integration already exists and only a small
delta is needed. The overnight run made the cost of this concrete: re-proving 20 existing connectors meant
re-running the full matrix on every one, and the *real* fixes were often a single metadata name-strip (cvent
E15), one watermark-field add, or one connector-code honor-AccessToken change (E21). A full rebuild for a
patch is the token-waste analog of the structural-green-over-broken-behavior accuracy waste.

This document hones **three modes** the build-connector skill must support, and wires each fully into the
arc's stages, reviewer checks, version-bump rule, and detection.

The governing principle (SemVer for connectors, stated by the user):
- **new metadata** (added objects/fields, no code change) → **minor** bump.
- **code changes** (connector `.ts` logic) → **patch** bump (within the same shape) or **minor** (new capability).
- **breaking changes** (removed/renamed objects, changed PK/identity, narrowed types, dropped capability) →
  **major** bump → treated as a *redo*.

---

## Mode summary

| Mode | Trigger | Version effect | Arc stages run | Arc stages skipped |
|---|---|---|---|---|
| **new** | no Integration row for this vendor exists | `1.0.0` (births the connector) | ALL (full Plan→Review→Execute) | none |
| **redo** | integration exists but is structurally wrong / a breaking change is required | **major** (`2.0.0`) | ALL — re-extract + re-test fully, treated as new | none (a redo IS a new build over a deprecated prior) |
| **additive** | integration exists, is sound, and only a localized delta is needed | **minor** (new metadata) or **patch** (code-only) | localized: re-audit newest docs → delta-extract → delta-test → deploy-reconcile | full re-enumeration of unchanged objects, full matrix on unchanged cells |

---

## Mode 1 — `new` (1.0.0)

**Entry condition.** No `MJ: Integrations.Name=<vendor>` row exists in the target DB, AND no
`metadata/integrations/<vendor>/.<vendor>.integration.json` is present. This is the current flow — unchanged.

**Stages.** The full skeleton: EnvPreflight → BrandResearch → Identity → SourceAudit → MetadataWrite →
(extract amendment loop) → FreezeContract → IndependentReview → SourceDiff → GapFill → RealityProbe →
ProbeAmend → CodeBuild → VerificationLadder → HybridE2E → FloorCheck → `/test-connector` terminal gate
(`_TEMPLATE.workflow.js` phases; `SKILL.md` three-stage orchestration).

**Reviewer checks.** The full `independent-reviewer` adversarial pass: rebuild the expected inventory from the
docs independently, set-diff against the emission, classify Confirmed-gaps / Judgment-calls / Reviewer-errors.

**Version-bump rule.** Births the connector at `1.0.0` (floor met) or its verified tier per
`INTEGRATION_RUBRIC_2N.md` (`1.x verified-mock` / `2.x verified-live`).

**Specified in context.** Default mode — no flag needed. `/build-connector <vendor>`.

---

## Mode 2 — `redo` (major update)

**Entry condition.** The integration exists but is **wrong in a way a patch cannot fix**, OR the change is
**breaking**. Concretely, any of:
- A structural floor gate now fails the existing metadata: `io-name-quality` flags garbage names (cvent's 66
  `.json` IOs — E-FLEET1), `zero-field-io` flags SOAP stubs (netforum 10 — E-FLEET1), `fk-lookup-qualifier`
  flags the `@parent:ID` defect, `enumerate-catalog` shows declared ≪ universe (path-LMS 16/38).
- The connector's **identity model** must change: PK/FK redefined, an object renamed/removed, a capability
  dropped, types narrowed (the `PUBLISH_NO_BREAK_POLICY` major-bump triggers).
- The vendor shipped a **breaking API change** (a v1→v2 base path, an auth-scheme change, an object retired).

**Stages.** **ALL of them — a redo is a `new` build over a deprecated prior.** It does NOT trust any existing
metadata; it re-extracts the full catalog and re-tests the full matrix. The one addition over `new`: a
**deprecation/migration step** that records what the old connector exposed (so the major bump can document
removed objects/columns for downstream consumers, per the publish-then-no-break policy) and a **reseed-delete**
of the prior IO/IOF before laying down the new (the `metadata-file-conventions.md` "Rebuilding a connector that
was ALREADY seeded" recipe — `mj sync push` has no prune, so stale rows must be explicitly deleted via
top-level `deleteRecord` + `--delete-db-only`, or a `UQ_IntegrationObject_Name` collision rolls back).

**Reviewer checks.** Same full adversarial pass as `new`, PLUS a **regression diff**: the reviewer is given the
*prior* connector's object/field inventory and must confirm every removed object/column is an *intentional*
breaking change (listed in the major-bump changelog), not an accidental under-enumeration. This is the guard
against a "redo" silently dropping objects the prior build had right (the inverse of E15).

**Version-bump rule.** **Major** (`N.0.0`). A redo always bumps major because it is, by definition, a breaking
re-shape (or a fix to something so wrong it's effectively a new connector). The prior version is marked
deprecated.

**Specified in context.** `/build-connector <vendor> --mode redo` — OR auto-detected: if the skill's pre-flight
runs the structural floor gates over the existing metadata and any HARD gate fails, it proposes `redo` to the
user ("the existing <vendor> metadata fails `io-name-quality` on 66 names — this is a major rebuild, not a
patch; proceed as redo?"). The user confirms; the arc never silently chooses major.

---

## Mode 3 — `additive` (minor / patch)

**Entry condition.** The integration exists, **passes all structural floor gates**, and only a **localized,
non-breaking delta** is needed:
- The vendor **added** objects/fields (a minor): re-study the newest docs, find the new record types/columns,
  extract ONLY those, append them as new IO/IOF.
- A **connector-code** fix within the same shape (a patch): a pagination param correction, an AccessToken-bypass
  honor (E21 rhythm), a `ResponseDataKey` fix (E1 novi), an envelope-key fix — code changes that don't alter the
  object/identity model.
- A **re-prove** after a credential arrives (lift the read-only ceiling to live-verified, no metadata/code
  change — pure `/test-connector --mode live`).

**Stages — localized, NOT the full pipeline:**
1. **EnvPreflight** (always — the env can rot between builds).
2. **DocDelta study** — re-run `SourceAudit` + `enumerate-catalog` against the **newest** vendor docs and
   **diff the universe** against the existing metadata. This answers "did the API change? are there new
   objects/fields?" deterministically (`compute-source-diff` over old-vs-new universe). If the diff is empty AND
   no code fix is requested, the additive run is a no-op re-prove (skip to test).
3. **Motif audit** — scan the NEW objects/fields for the known defect motifs (FK qualifier, name garbage,
   zero-field, by-id-hub, missing `@parent` FK) using the floor gates. New objects must clear the same bar.
4. **Delta extract** — `ioiof-extractor` over ONLY the changed/new objects (the `_TEMPLATE` already supports a
   `isDeltaRound` scoped extract — ARC_IMPROVEMENT_LOG P0-2; reuse that path). Unchanged objects are **not**
   re-walked.
5. **Delta CodeBuild** (only if a code fix is requested) — re-emit the connector with the targeted change;
   re-run the ladder.
6. **Localized test** — re-run ONLY the matrix cells touched by the delta (new objects' coverage + the changed
   cell), plus the always-on deploy-preflight. The full 24-cell matrix over unchanged objects is **skipped**
   (their prior green stands, recorded in the connector's last result).
7. **Deploy-reconcile** — `deploy-preflight` over the merged metadata, then an additive `mj sync push` (append
   new IO/IOF; no prune needed since nothing was removed).

**Stages skipped vs `new`:** BrandResearch (identity is settled), full SourceAudit ranking (only the newest doc
is re-fetched), Identity, full re-enumeration of unchanged objects, full HybridE2E over the whole catalog (only
the delta's objects are e2e-tested). The skip is justified by the floor-pass precondition: an additive run is
*only allowed* when the existing connector already passed the gates, so the unchanged surface is trusted.

**Reviewer checks.** A **scoped** `independent-reviewer` pass over the delta only: confirm the new objects/fields
are real (not invented), the motif audit is clean, and — critically — that **nothing was removed** (an additive
run that drops an object is mis-classified; it should be a `redo`). The reviewer's job in additive mode is to
*reject the mode itself* if the change is actually breaking ("this 'additive' run removes `Account.legacyId` —
that's a major; re-run as redo").

**Version-bump rule.**
- New metadata only (added objects/fields) → **minor** (`1.1.0`).
- Code-only change, same shape → **patch** (`1.0.1`).
- New capability via code (e.g. add bidirectional write) → **minor**.
- If the delta turns out breaking → the reviewer kicks it to **redo** (major).

**Specified in context.** `/build-connector <vendor> --mode additive` — OR auto-detected: the skill's pre-flight
sees an existing, floor-passing integration and a small/empty doc-delta → proposes `additive`. The
`/test-connector <vendor> --mode live --ad-hoc` re-prove (credential-arrived-later) is the degenerate additive
case (no metadata/code delta, just a ceiling lift) — already an entry point in `test-connector/SKILL.md`.

---

## Mode detection — how build-connector picks (or proposes) the mode

The skill runs a **deterministic pre-flight classifier** in Step 0 (before the planner), so the mode is a
machine decision the user confirms, never a guess:

```
1. existing = does MJ: Integrations.Name=<vendor> exist (DB) OR .<vendor>.integration.json exist (file)?
   └─ NO  → mode = NEW.                                            (births 1.0.0)

2. existing = YES → run the structural floor gates over the existing metadata:
   io-name-quality, zero-field-io, fk-lookup-qualifier, enumerate-catalog (declared vs universe),
   iof-field-conformance, materializability.
   └─ ANY hard gate FAILS, OR user requested a breaking change  → propose REDO (major).

3. existing = YES, floor-clean → run DocDelta (enumerate-catalog over NEWEST docs vs existing universe):
   ├─ universe grew (new objects/fields) OR a code fix is requested → propose ADDITIVE (minor/patch).
   ├─ universe shrank / object removed / identity change           → propose REDO (major — breaking).
   └─ universe identical AND no code fix → propose ADDITIVE re-prove (no-op delta; pure /test-connector).
```

**Rules for the classifier (so it can't silently mis-grade):**
- The classifier only **proposes**; the user confirms the mode (especially a major). The arc never silently
  picks `redo` (which deprecates) or downgrades a breaking change to `additive`.
- An `additive` run that the scoped reviewer discovers is actually breaking is **promoted to `redo`** mid-run
  (the reviewer's veto on the mode) — it never proceeds to ship a breaking change under a minor bump.
- The mode is recorded in `SuperCoordinatorReport.json` (`mode`, `priorVersion`, `newVersion`, `bumpReason`) so
  the version history is auditable.

**Where it's wired.** Step 0 of `build-connector/SKILL.md` gains a `0c — Mode detection` sub-step between the
context intake (0a) and the credential intake (0b): run the classifier, present the proposed mode + evidence,
WAIT for the user's confirm/override, then thread `mode` into the planner's `vendor_request`. The planner
emits a stage skeleton appropriate to the mode (full for new/redo; localized for additive — the `_TEMPLATE`
already has the `isDeltaRound` scoping path for the additive case).

---

## Why three modes, not one (the token + accuracy case)

- **Token:** the overnight run re-proved 20 connectors at full-matrix cost. With `additive`, a clean re-prove
  is a deploy-preflight + a scoped delta test (minutes), not a full Plan→Review→Execute (millions of tokens per
  the Neon accounting in ARC_IMPROVEMENT_LOG). The arc already has the cheap-delta machinery (`isDeltaRound`,
  resume-from-cache); modes make it the *default* path for the common case (vendor added a few fields).
- **Accuracy:** a `redo` is the honest response to a structurally-wrong connector (cvent's 66 garbage names) —
  it forces a full re-extract + a major bump + a deprecation record, rather than papering over the defect with
  a patch. And the `additive` reviewer's "is this actually breaking?" veto is the guard that a minor bump never
  silently drops an object (the publish-then-no-break policy, enforced per-build).
