# HubSpot Ground-Truth Dry Run

**Purpose.** HubSpot is already built (`packages/Integration/connectors/src/HubSpotConnector.ts` + seeded DB rows). We feed its existing state to the workshop as **ground truth** and see whether the planner + locked primitives produce something *equivalent*. Pure dry run; no PR, no existing-file modification.

Per the agentic plan §13:
> Build skeleton of workshop, locked primitives, planner agent stub. Use HubSpot
> as test target since it's already built — feed its current code/metadata to
> the system as ground truth, see if the system can produce something
> *equivalent* to what already exists. Pure dry-run; no PR generated.

## Ready-state checklist

The full agentic framework is in place on this branch (`agentic/connector-builder`):
- 10 subagents under `.claude/agents/` (adapted for v5.39.x + dynamic-workflow + locked primitives)
- 5 rules under `.claude/rules/` (adapted for new schema)
- 2 skills under `.claude/skills/` (`build-connector` + `playwright-cli`)
- 11 locked-primitive workflow scripts under `packages/Integration/connector-builder-workshop/primitives/`
- Planner system prompt at `packages/Integration/connector-builder-workshop/planner/system-prompt.md` (Gap 1 canonical)
- Reviewer system prompt at `packages/Integration/connector-builder-workshop/reviewer/system-prompt.md` (Gap 2 canonical)
- Bijection slot table at `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` (65 slots)
- Spec digest extractor + drift gate at `packages/Integration/connector-builder-workshop/scripts/regenerate-spec-digest.mjs`
- Workspace provisioner at `packages/Integration/connector-builder-workshop/scripts/start-run.mjs`
- Plan-script template at `packages/Integration/connector-builder-workshop/plans/_TEMPLATE.workflow.js`

## Ground-truth inputs

Source-of-truth files for comparison (do NOT modify during the dry run):

| Artifact | Path | Role in comparison |
|---|---|---|
| Connector class | `packages/Integration/connectors/src/HubSpotConnector.ts` | Code-builder output should be equivalent |
| Connector test | `packages/Integration/connectors/src/__tests__/HubSpotConnector.test.ts` | Behavior captured |
| Mock data | `packages/Integration/mock-data/MockHubSpot.sql` | Seeded fixture set |
| Per-vendor metadata file (TARGET) | `metadata/integrations/hubspot/.hubspot.integration.json` | Does **not yet exist** — the dry run produces a candidate; we diff against pulled DB state |
| Public API docs | https://developers.hubspot.com/docs/api/crm/contacts (etc.) | Tier-1 source for `audit-source` |

## How to run the dry run

From the repo root:

```bash
# 1) Snapshot the existing DB state as baseline (one-time setup)
npx mj sync pull --dir=metadata --include="integrations"   # populates metadata/integrations/hubspot/.hubspot.integration.json
cp metadata/integrations/hubspot/.hubspot.integration.json \
   packages/Integration/connectors-registry/hubspot/ground-truth/baseline.integration.json

# 2) Trigger the workshop via the slash command
/build-connector hubspot --max-tier T4
```

The slash command invokes the `build-connector` skill (see `.claude/skills/build-connector/SKILL.md`), which:

1. Runs `start-run.mjs` to provision a workspace under `connectors-registry/hubspot/runs/<runID>/`.
2. Runs `regenerate-spec-digest.mjs` to enforce drift-free spec→digest alignment.
3. Dispatches the `connector-creator` planner agent (Opus) — emits `plans/hubspot.workflow.js` + manifest.
4. Dispatches the `independent-reviewer` agent on a different model (Sonnet) — reviews the plan; default reject.
5. Invokes the planner-emitted workflow via the `Workflow` tool — runs `BrandResearch → Identity → SourceAudit → MetadataWrite → IOIOFExtract → FreezeContract → IndependentReview → CodeBuild → VerificationLadder → FloorCheck`.
6. Reads the final `floor-check` verdict; writes `connectors-registry/hubspot/REPORT.{json,md}`.

## Acceptance criteria for the dry run

- **`floor-check.pass === true`** even without credentials (T4 ceiling).
- Planner's `vendorShape === 'REST+OpenAPI'` (HubSpot publishes OpenAPI).
- Planner's `authPattern === 'api-key'` (Private App Bearer token).
- `compute-source-diff` between planner output and baseline returns:
  - `missing.length <= 5` (small drift in display labels/descriptions OK).
  - `orphan.length <= 5` (likewise).
- Adversarial reviewer's first-pass verdict NOT `rejected`.

## Why HubSpot first

- **Lowest-risk learning case.** Existing connector is the regression baseline; if the workshop produces something fundamentally different, that's a workshop bug, not a HubSpot bug.
- **Tier-1 sources exist** (OpenAPI + structured public docs) → tests every primitive that depends on quality sources without being limited by source quality.
- **No credentials needed** to reach T0..T4; the workshop's no-creds path is exercised fully.

## Out of scope for the dry run

- No PR opened.
- No HubSpot live API calls (T10/T11 skipped).
- No modification to the existing `HubSpotConnector.ts`.
- No replacement of the existing HubSpot Integration row.
- No commit of dry-run artifacts (they live under `connectors-registry/<vendor>/runs/<runID>/` which is gitignored from PR mainlines per workshop discipline).
