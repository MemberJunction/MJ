---
name: build-connector
description: Top-level entry point for connector creation. Drives the three-stage orchestration — Plan (connector-creator), Review (independent-reviewer, different model), Execute (planner-emitted dynamic Workflow under the workshop's locked primitives + bijection floor-check). Triggered by the /build-connector slash command.
---

# build-connector

The orchestrator. Runs at top-level context (the only context where `Task` and `Workflow` are available). The skill is **NOT** the executor — it sequences three structural stages and forwards the planner-emitted Workflow to the runtime harness.

Canonical references:
- Workshop layout + primitives: `packages/Integration/connector-builder-workshop/README.md`
- Bijection slot table: `packages/Integration/connector-builder-workshop/floor/phase0-slots.json`
- Agentic plan: `plans/integration-agentic-local.md`
- Phase 0 framework: `plans/integration-phase-0-pr1.md`

## NO SHORTCUTS

Models are imperfect at any single step. The framework's mechanism for converging on the right answer is **iteration with reviewer + floor-check at every gate**. No phase begins until the prior phase's output is gate-satisfied. Re-dispatching with specific feedback is the default response to any concern.

## Invocation

```
/build-connector <vendor-name> [--credentials <path>] [--budget <tokens>] [--max-tier <T0..T12>]
```

Examples:
- `/build-connector hubspot` — runs through T0..T9 (no live API).
- `/build-connector hubspot --credentials ~/.mj-credentials/hubspot.json` — adds T10/T11 (live).
- `/build-connector hubspot --max-tier T4` — workshop dry-run at the mocked-fixture ceiling.

## Concrete invocation procedure (the skill's runbook)

### Step 0 — workspace bootstrap

Run the workspace provisioner:
```bash
node packages/Integration/connector-builder-workshop/scripts/start-run.mjs \
  --vendor <vendor-name> \
  [--credential-reference <path>] \
  [--budget <tokens>] \
  [--max-tier <T0..T12>]
```

Capture its stdout JSON. This blob contains `runID`, `workspaceDir`, `planPath`, `manifestPath`, `specDigestPath`, `slotsPath`, `corpusEntries`. All subsequent stages reference these paths.

### Step 0a — regenerate spec digest (drift gate)

```bash
node packages/Integration/connector-builder-workshop/scripts/regenerate-spec-digest.mjs
```

Non-zero exit = drift; halt and surface the drift evidence as an architecture finding.

## Three-stage orchestration

### Stage 1 — Plan (connector-creator)

Dispatch `connector-creator` (the planner agent, Opus) via `Task` with:
- `vendor_request` — `{ vendor_name, credentialReference?, budget?, max_tier? }`
- `spec_digest` — the contents of `packages/Integration/connector-builder-workshop/planner/spec-digest.json` (regenerated up-front; see Pre-flight).
- `corpus_lookup` — any matching entries from `packages/Integration/connector-builder-workshop/corpus/` keyed by vendor-shape tuple (Gap 6).

Planner output (validated by output schema):
- Workflow script written to `packages/Integration/connector-builder-workshop/plans/<vendor>.workflow.js`.
- `minimumThoroughnessManifest`.
- `vendorShape` + `authPattern` + `discoveredCapabilities`.
- `scriptHash` (content-addressed for resumption).
- `rationale` (≤500 words).

### Stage 2 — Review (independent-reviewer, different model)

Dispatch `independent-reviewer` via `Task`, explicitly setting a model that differs from the planner. Pass:
- The planner's script path + manifest only — NOT the rationale (architectural firewall).
- The spec digest.
- Corpus failure modes for this vendor-shape (`workshop/corpus/<shape>/failures.json` if present).

Reviewer's default verdict is `rejected`. On `approved` / `approved-with-amendments`: proceed to Stage 3. On `rejected`: re-dispatch the planner with the reviewer's amendment requests; up to 3 rounds. Persistent rejection → escalate.

**Model-difference enforcement**: when invoking `independent-reviewer`, the Task call MUST pass a model identifier different from the planner's. If you cannot deterministically pick a different model, halt and report the orchestration failure rather than silently risk same-model groupthink.

### Stage 3 — Execute (planner-emitted Workflow)

Invoke the workflow script via the `Workflow` tool with `scriptPath` pointing to the planner's emitted file at `packages/Integration/connector-builder-workshop/plans/<vendor>.workflow.js`. Pass `args` containing:
- `vendor` — the vendor name.
- `runID` — from Step 0's stdout.
- `credentialReference` — opaque path, or `null` for credential-free runs.
- `manifestPath` — path to the planner's manifest (the script reads it).
- `slotsPath` — `packages/Integration/connector-builder-workshop/floor/phase0-slots.json`.
- `maxTier` — the realistic verification ceiling.

The Workflow itself runs the locked primitives (`audit-source`, `extract-iiof-pipeline`, `freeze-contract`, `verification-ladder`, `floor-check`). Each primitive composes the appropriate `agentType` subagent stages internally (e.g., `extract-iiof-pipeline` dispatches `ioiof-extractor` per-object; `verification-ladder` dispatches `testing-agent` per-rung).

The plan-script template at `packages/Integration/connector-builder-workshop/plans/_TEMPLATE.workflow.js` is the shape the planner is expected to customize. Read it once before the run so you know what the runtime will be executing.

### Gate — Floor-check verdict

After the Workflow returns, read the final `floor-check` verdict:
- `pass: true` → write `SuperCoordinatorReport.{json,md}` to `connectors-registry/<vendor>/` + announce success to the user. NO commit, NO PR (per MJ Rule #1; explicit user approval each time).
- `pass: false` → surface the structural failures. Route back through the planner amendment loop (one round); if it still fails, escalate.

## Pre-flight

Before Stage 1 spawns, verify:
- `packages/Integration/engine/dist/` exists (`npm run build` in the package if missing).
- `packages/Integration/pk-classifier/dist/` exists.
- `packages/Integration/progress-artifacts/dist/` exists.
- `packages/MCP/mj-metadata/dist/` + `packages/MCP/mj-test-runner/dist/` exist if referenced by the planner's manifest.
- `.mcp.json` registers any MCPs the workflow will use.
- `packages/Integration/connector-builder-workshop/` + `packages/Integration/connectors-registry/` exist.
- Spec digest regeneration: `node packages/Integration/connector-builder-workshop/scripts/regenerate-spec-digest.mjs`. Exit non-zero = digest drift; halt and surface the drift evidence as an architecture finding (the bijection is supposed to stay in lockstep; drift means the agentic doc or Phase 0 doc moved without the slot table catching up).

If any prerequisite is missing, error to the user with the specific missing piece.

## Failure response

Per the agentic plan §12 standing rule: **if the gap can't be fixed by ONE LINE in ONE role file or ONE primitive, that's an architectural finding — escalate, don't iterate the framework.**

Concretely:
- Planner persistent reject after 3 amendment rounds → escalate to user with the reviewer's evidence chain.
- Workflow execution failure inside a locked primitive → surface the primitive's structured error; route to the responsible upstream agent.
- Floor-check structural failure after one amendment round → escalate to user with the failure list.
- Budget hits 1M ceiling → halt with `budget-exhausted` and escalate.

## What this skill does NOT do

- Does NOT read the credentials file. The `credential-guard.sh` hook blocks any attempt by this skill or any sub-agent. Only the `mj-test-runner` MCP subprocess dereferences the path internally.
- Does NOT make design decisions about the connector's shape — the planner owns those (and the workflow runtime executes them deterministically).
- Does NOT commit or push. Final commit requires explicit user approval each time.
- Does NOT call `SoftPKClassifier` directly. That's runtime D4's job inside `IntegrationConnectorCreationPipeline` if/when the connector is later registered against a live system.
- Does NOT bypass `floor-check`. The bijection floor is the structural truth.
