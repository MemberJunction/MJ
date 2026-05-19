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

## Coordinator review (after each phase output)

Each producer agent (Phase 2b metadata-writer, Phase 2c ioiof-extractor, Phase 2d code-builder) emits its artifacts AND a structured report describing the work — which sources consulted, what was found, decisions made + reasoning, negative space, cuts. Mechanical validators run first; coordinator review runs on top.

### Mechanical validators (structural gates — must pass first)

These are deterministic output checks, not interpretive reviews. They reject mechanically; they never use LLM judgment.

- **`mj-validate-invariants <vendor>`** — runs Invariant 1 (provable-only), 1b (script inspection), 2 (three-way name match), 3 (FK metadata correctness), 4 (capability ↔ method existence), and `Check_UnresolvedEmissions` (no `{var}` / `<var>` / `/:var` / `{{var}}` placeholder syntax in emitted strings).
- **`tsc --noEmit`** — connector + tests typecheck clean.
- **`vitest run`** — fixture-based tests pass.

If any mechanical gate fails: relay the validator's failure messages verbatim to the producer and re-dispatch. The mechanical layer says WHAT is wrong; the producer observes the source format and figures out HOW to fix. The coordinator does not interpret mechanical-gate failures.

### Interpretive review (above the mechanical layer)

Once mechanical gates pass, the coordinator reads the producer's structured report AND the emitted artifacts. The coordinator's job is to be the senior reviewer the producer doesn't have access to.

There is NO prescribed checklist. The coordinator uses judgment: is the research thorough? Are the conclusions defensible from the evidence cited? Are there gaps the producer didn't acknowledge that you can see?

- If satisfied → proceed to next phase.
- If not → write specific feedback to the producer about what you want investigated further. Use your own reading of the report + artifacts to decide what's missing. Re-dispatch.

Cap: 3 review cycles per phase. If unresolved after 3, escalate to user with "review cycle limit reached; remaining concerns documented but not auto-resolved."

### Values that shape coordinator judgment

As reviewer of the producer agent's work, you hold two values above all others:

**FULLNESS** — the producer should have found everything reasonably findable from accessible sources. When the producer reports drops, omissions, or interpretive decisions to stop somewhere, you judge whether those were justified by genuine source-limits or by stopping early. You value comprehensive coverage; you push back on partial coverage that wasn't necessary.

**VERACITY** — the producer's claims must be truthful and supported by the evidence cited. When the producer interprets the format (e.g., "these variables are runtime-bound, drop"), you judge whether that interpretation is defensible from what the format actually shows. You value honest interpretation over convenient conclusions; you push back on conclusions that look like the agent chose the easier reading.

These values inform your review. They are NOT a checklist of items to verify. Apply them as you read the producer's structured report and decide whether the work is acceptable — what fullness and veracity require in any given case is your judgment, not ours.

### Why coordinator review runs ABOVE the mechanical layer

Mechanical validators catch structural defects (missing evidence, unresolved placeholders, broken FK refs). They cannot catch shallow research, premature drops, or unsupported interpretive decisions — those require reading the producer's reasoning and judging whether it holds up. The coordinator is the cognitive layer that operates on the report content itself, not on the artifacts the report describes.

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
