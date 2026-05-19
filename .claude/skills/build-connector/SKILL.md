---
name: build-connector
description: Top-level entry point for connector creation. Spawns SuperCoordinator agent who orchestrates Phase 1 (Identity) → Phase 2 (ConnectorCreator) → Phase 3 (Testing). Triggered by /build-connector slash command. Use when the user wants to scaffold a new MJ connector from a vendor name.
---

# build-connector

Top-level pipeline orchestration. The skill itself does very little — it spawns the SuperCoordinator agent, which owns end-to-end coordination.

## Invocation

```
/build-connector <vendor-name> [--credentials <path>] [--budget <dollars>]
```

Examples:
- `/build-connector hubspot` — research-only mode (no live API testing).
- `/build-connector hubspot --credentials ~/.mj-credentials/hubspot.json` — full sweep through T8.
- `/build-connector salesforce --budget 75` — override default $50 budget cap.

## What this skill does

1. Validates the vendor name format (non-empty, no special chars).
2. Validates the credentials path if provided (file exists; readable).
3. **Orchestrates the agent pipeline directly via the top-level Task tool** (NOT through `super-coordinator` — see Known runtime limitation below):
   - Phase 1: spawns `identity-establisher` (skipped if `Phase1Handoff.json` already exists on disk)
   - Phase 2a: spawns `source-auditor` → produces `SOURCES.json`
   - Phase 2b: spawns `metadata-writer` → produces `metadata/integrations/.<vendor>.json` (root fields) + `PROVENANCE.json`
   - Phase 2c: spawns `ioiof-extractor` → produces `scripts/extract-io-iof.ts` (+ runs it), populates IOs/IOFs in the metadata file, writes `CODE_EVIDENCE.json`
   - Phase 2d: spawns `code-builder` → produces `src/<Name>Connector.ts` + tests + README
   - Phase 3: spawns `testing-agent` → runs T0–T4 (+ T8 if credentials provided)
4. Collects each phase's structured handoff JSON, gates on each before proceeding.
5. Emits the human-readable summary (Phase report).

## Known runtime limitation — Task tool not propagated to sub-agents (Gap 1, surfaced 2026-05-18)

The Claude Code harness restricts the `Task` tool to the top-level (main conversation) context. Sub-agents that declare `Task` in frontmatter receive their toolset with `Task` silently dropped. Consequence: `super-coordinator` and `connector-creator` agents **cannot delegate** to their downstream subagents when themselves spawned as sub-agents.

**This skill is the workaround.** It runs at the top-level context where Task IS available, and performs the multi-phase fanout directly. The `super-coordinator.md` and `connector-creator.md` role files remain in place as **specifications of orchestration SHAPE** (phase order, inputs/outputs, gate conditions) — read them to understand what each phase requires. They are NOT runtime orchestrators in the current harness.

Fresh-context per-subagent isolation is preserved: each Phase 2a/b/c/d/Phase 3 call this skill makes is a separate Task invocation with its own fresh context. The architectural promise of subagent isolation is intact; only the multi-level delegation shape collapses to a single level (skill → leaf-agent) instead of two (skill → SC → leaf-agent).

Verified in the HubSpot clean-build verification run (2026-05-18). See `connectors-registry/hubspot/CLEAN_BUILD_REPORT.md` for the empirical trace.

## What this skill does NOT do

- Does NOT read the credentials file. The credential-guard hook blocks any attempt by this skill or downstream agents (other than the mj-test-runner MCP subprocess).
- Does NOT make decisions about what the connector looks like. The SuperCoordinator + downstream agents own all design decisions.
- Does NOT commit or push code. SC triggers PR creation at the end; the actual `git commit` requires explicit user approval (per MJ rule #1).

## Outputs

When SC finishes successfully:
- `connectors-registry/<vendor>/` directory populated with src/, metadata/, scripts/, PROVENANCE.json, CODE_EVIDENCE.json, REPORT.json, REPORT.md
- Print REPORT.md to the conversation
- Print the structured `SuperCoordinatorReport` JSON for downstream tooling

## Pre-flight checklist

Before SC spawns, verify:
- `packages/Integration/engine/` exists + built
- `packages/Integration/connector-generator/` exists + built
- `packages/Integration/connector-validator/` exists + built
- `packages/MCP/mj-metadata/` + `packages/MCP/mj-test-runner/` exist + built
- `.mcp.json` registers `mj-metadata` and `mj-test-runner`
- `connectors-registry/` directory exists (create if missing)

If any prereq fails, error to the user clearly with the missing piece.
