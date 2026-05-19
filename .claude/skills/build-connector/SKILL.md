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

### Source-accessibility cross-check (runs before the three audit checks)

`WebFetch` (the source-auditor's only web tool) and `Bash + curl` (the coordinator + downstream extractor + metadata-writer's web access) do NOT see the same internet. Some vendors block WebFetch via CDN bot-rules while leaving curl-from-local-machine fully accessible. Empirically observed on YourMembership's `ws.yourmembership.com/metadata` endpoint: WebFetch → HTTP 403; curl → HTTP 200, 123KB of operation index HTML.

Before accepting any source-auditor URL marked `AccessStatus: 'WebFetchBlocked'` as truly inaccessible, the coordinator MUST:

1. For each blocked URL, run `curl -sS -o /tmp/<hash>.html -w "%{http_code}" <URL>` to independently fetch.
2. If curl returns 2xx, the URL IS accessible to script-based extractors. Reclassify as `AccessStatus: 'AccessibleViaScripts'`.
3. Update `SOURCES.json` with the corrected accessibility status BEFORE Phase 2b/2c spawn.
4. When dispatching Phase 2b (metadata-writer) and Phase 2c (ioiof-extractor), pass the corrected list — downstream agents use Bash + script-based fetch (Node fetch / curl) and will succeed where WebFetch failed.

This perseverance principle is non-negotiable: the framework does NOT give up on a URL based on a single tool surface's blocked-status. Every "ungettable" verdict is cross-checked across the full coordinator tool surface (WebFetch + Bash + curl + Node fetch via script) before being accepted. The coordinator makes the final accessibility decision; phase agents report structured evidence.

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

### Phase-specific rubrics

In addition to the three general vendor-agnostic checks above, each phase has its own rubric the coordinator runs against the phase output.

#### Phase 2b (metadata-writer) rubric

- **Coverage threshold**: every entity named in the vendor's product overview that maps to a root-level concept (auth model, pagination shape, rate limits, error envelope, webhook signature, etc.) has a corresponding root field or `Configuration` JSON entry. Mismatch → flag.
- **Structural completeness**: every hard-constraint root field (the set named in `.claude/rules/metadata-file-conventions.md`) has a `PROVENANCE.json` entry whose `TargetField` matches exactly (single-target, not pipe-delimited compound).
- **Cross-source corroboration**: when multiple Tier-1 sources in `SOURCES.json` describe the same root fact, the emitted value aligns with all of them. Surfacing contradiction → flag (don't pick silently).

#### Phase 2c (ioiof-extractor) rubric

- **Coverage threshold**: IO count ~ 100% of entities identifiable from the vendor's product overview / catalog index. Less than that → flag (per Control Comparison + Product Overview Cross-Reference checks).
- **Structural completeness**: every IO has ≥ 1 IOF; every IOF emitted with `IsPrimaryKey=true` / `IsRequired=true` / `IsReadOnly=true` (non-default) / `SupportsWrite=true` / `SupportsIncrementalSync=true` has a corresponding `CODE_EVIDENCE.json` entry at per-(IO|IOF, field, signal) granularity.
- **Cross-source corroboration**: when multiple sources describe the same entity (e.g., OpenAPI + SDK + docs page), the emitted IO/IOF rows align across all. Divergence → flag.
- **Bidirectional set-completeness**: no orphans from prior runs (extractor's bidirectional-merge deletes IOs/IOFs in existing metadata that aren't in this run's emissions).

#### Phase 2d (code-builder) rubric

- **Metadata-driven routing**: every method body uses metadata routing fields (`APIPath` from IO, `CreateAPIPath` / `UpdateAPIPath` / etc. if present in vendor config). No hardcoded URLs in method bodies.
- **No inline crypto**: imports come from `@memberjunction/integration-engine/auth-helpers` (`OAuth2TokenManager`, `JWTSigner`, `HMACSigner`, `APIKeyHeaderBuilder`). If a primitive is missing, extend `auth-helpers` — don't inline a crypto path in the connector.
- **DiscoverObjects override**: present if the metadata declares runtime catalog discovery (vendor exposes `/schemas`, `/describe`, `/preferences`, or equivalent enumeration endpoint).
- **WatermarkService integration**: if any IO has `SupportsIncrementalSync=true`, `FetchChanges` reads + advances watermark via `WatermarkService.Load` / `.Update`. Watermark advances only on full-batch success.
- **MatchEngine integration**: Update / Delete paths flow through `MatchEngine` for Create-vs-Update decision via `IsKeyField` lookup.
- **NO hardcoded catalog mirror**: connector class's `DiscoverObjects` reads from `IntegrationEngineBase.Instance` cache (per `MJ-INTEGRATIONS-ARCHITECTURE.md` §4.6), NOT from a hardcoded TypeScript constant. Tests assert against the cache, not against a hardcoded count.
- **Capability ↔ method coherence**: every `SupportsX=true` flag has: (1) a method declared on the concrete class, (2) a real non-stub body (not `throw "not implemented"`), (3) at least one fixture-based unit test asserting URL / method / body shape.
- **Control connector cross-reference**: if `packages/Integration/connectors/src/<Name>Connector.ts` exists as a control, diff method signatures + capability flag set + base class choice. Mismatches → flag.

Each rubric check failure → re-dispatch the phase with structured feedback citing the specific check + the specific mismatch. Audit loop cap (3 cycles) applies per phase.

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
