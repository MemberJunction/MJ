---
name: build-connector
description: Top-level entry point for connector creation. Orchestrates Phase 1 (Identity) → Phase 2a-d (Sources / Root metadata / IO+IOF / Code) → Phase 3 (Testing T0-T4 plus T9/T10 when scoped). Triggered by the /build-connector slash command.
---

# build-connector

The orchestrator. Runs at top-level context (the only context where `Task` is available — sub-agents cannot spawn sub-sub-agents). Dispatches phase agents sequentially; each runs in a fresh sub-agent context with its own structured handoff back to this skill.

Canonical reference for the design: `/Users/madhavsubramaniyam/Projects/CCAF-exam-prep/INTEGRATION-REDESIGN-V1.md`.

## Invocation

```
/build-connector <vendor-name> [--credentials <path>] [--budget <dollars>]
```

Examples:
- `/build-connector hubspot` — runs through T0-T4 only (no live API).
- `/build-connector hubspot --credentials ~/.mj-credentials/hubspot.json` — adds T10 (live vendor sandbox via mj-test-runner MCP).

## Phase pipeline

1. Validate vendor name + (if provided) credentials path exists + is readable. NEVER read its contents — pass the path as a string to T10 only.
2. Skip Phase 1 if `connectors-registry/<vendor>/Phase1Handoff.json` already exists with `Status: 'Complete'`. Otherwise spawn `identity-establisher`. Gate on output.
3. Spawn `source-auditor` (Phase 2a) → `SOURCES.json`. Gate.
4. Spawn `metadata-writer` (Phase 2b) → root fields written to `metadata/integrations/.<vendor>.json` + `PROVENANCE.json` entries. Gate.
5. Spawn `ioiof-extractor` (Phase 2c) → `scripts/extract-io-iof.ts` written + run; IO/IOF rows upserted into the metadata file; `CODE_EVIDENCE.json` populated. Gate.
6. Spawn `code-builder` (Phase 2d) → `src/<Name>Connector.ts` + `src/__tests__/<Name>Connector.test.ts` + README. Gate on build clean.
7. Spawn `testing-agent` (Phase 3) → runs T0-T4. If `--credentials` was provided, also T10. Produces `Phase3Report.json`.
8. Print the `Phase3Report.json` to the user. Do NOT commit, do NOT open a PR (per MJ Rule #1).

## Coordinator audit (after each phase output)

After each major phase produces output, the coordinator runs three vendor-agnostic audit checks. If any check surfaces a gap, the coordinator re-dispatches the phase agent with structured feedback. Audit loop is capped at 3 cycles per phase — after the cap, remaining gaps are documented but not auto-resolved.

### Three vendor-agnostic audit checks

**1. CONTROL COMPARISON**

Check if a manually-built reference exists for this vendor at `packages/Integration/connectors/src/<Name>Connector.ts` AND/OR `metadata/integrations/.<vendor>.json`. If yes: extract IO Names + APIPath patterns from the control and diff against the agent's emitted metadata.

Thresholds:
- IO Name overlap < 80% OR APIPath overlap < 60% → mismatch.

Re-dispatch feedback template:
> "Your output has X% overlap with the reference at [path]. Reference has these IOs/APIPaths you don't: [list]. Investigate whether your extraction missed them, or whether your sources differ from the reference's. Re-extract with broader source coverage if needed. Do NOT bias toward latest/newest spec versions if the control uses stable older versions — investigate why."

**2. PRODUCT-OVERVIEW CROSS-REFERENCE**

Fetch the vendor's product overview / docs root URL (from Phase 1's `NavigationBaseURL` or the top-tier `SOURCES.json` URL). Extract entity / module / service names mentioned in headings, navigation, feature lists. Cross-reference against the agent's IO Name list.

For each named entity in the product overview NOT in the agent's IOs, surface as a gap.

Re-dispatch feedback template:
> "Vendor's product overview at [URL] names these entities you don't have IOs for: [list]. Investigate."

**3. TAUTOLOGY CHECK**

Inspect the agent's extractor script (`scripts/extract-io-iof.ts`). Determine its data source. If the source is a file already in the MJ repo (e.g., reading from `packages/Integration/connectors/src/<X>Connector.ts`), the extraction is tautological — agent extracted from prior art, not from independent sources.

Audit-log only (do NOT re-dispatch):
> "Extraction is from in-tree prior art at [path]. Not independent verification. True cross-paradigm verification requires accessing vendor's independent source (Swagger UI / docs site / runtime endpoint) which needs credentials."

### Audit loop

1. Run all applicable checks after the phase output.
2. If any check fires re-dispatch → re-spawn the phase agent with structured feedback → wait → audit again.
3. Cap at 3 audit cycles per phase. After the cap, escalate to user: "audit cycle limit reached; remaining gaps documented but not auto-resolved."

### Phase-specific application

- **After Phase 2b (metadata-writer)**: audit root fields only. Every emitted root field (`CredentialTypeID`, `BatchMaxRequestCount`, `APIBaseURL` if present, etc.) has provenance AND aligns with control if a control exists.
- **After Phase 2c (ioiof-extractor)**: full three-check audit on the IO list.
- **After Phase 2d (code-builder)**: method-coverage audit. Every IO with `SupportsX=true` has a corresponding `XRecord` method on the connector class.

### Why audit is part of the coordinator and not the phase agent

Each phase agent runs in fresh context — it can't see how its output diverges from a reference because it doesn't have the reference. The coordinator has full workspace visibility + can pull external references (control files, vendor docs). The audit step is the cognitive layer the phase agent cannot reach on its own.

This is the operational lift of the set-completeness meta-principle: the agent says "I think I'm done"; the coordinator verifies against the authoritative source the agent didn't reach.

## What this skill does NOT do

- Does NOT read the credentials file. The `credential-guard.sh` hook blocks any attempt by this skill or any sub-agent. Only the `mj-test-runner` MCP subprocess dereferences the path internally.
- Does NOT make design decisions about the connector's shape — phase agents own those.
- Does NOT commit or push. Final commit requires explicit user approval each time.

## Pre-flight

Before Phase 1 spawns, verify:
- `packages/Integration/engine/dist/` exists
- `packages/Integration/connector-validator/dist/` exists
- `packages/MCP/mj-metadata/dist/` + `packages/MCP/mj-test-runner/dist/` exist
- `.mcp.json` registers `mj-metadata` and `mj-test-runner`
- `packages/Integration/connectors-registry/` exists

If any prerequisite is missing, error to the user with the specific missing piece.

## Failure response

If a phase's structured handoff reports `Fail`, surface the failure to the user with the specific role + reason. The redesign discipline (§12) is: if the gap can't be fixed by ONE LINE in ONE role file, that's an architectural finding — escalate, don't iterate the framework.
