---
name: build-connector
description: Top-level entry point for connector creation. Orchestrates Phase 1 (Identity) → Phase 2a-d (Sources / Root metadata / IO+IOF / Code) → Phase 3 (Testing T0-T4 plus T9/T10 when scoped). Triggered by the /build-connector slash command.
---

# build-connector

The orchestrator. Runs at top-level context (the only context where `Task` is available — sub-agents cannot spawn sub-sub-agents). Dispatches phase agents sequentially; each runs in a fresh sub-agent context with its own structured handoff back to this skill.

Canonical reference for the design: `/Users/madhavsubramaniyam/Projects/CCAF-exam-prep/INTEGRATION-REDESIGN-V1.md`.

## NO SHORTCUTS

Models are imperfect at any single step. The framework's mechanism for converging on the right answer is **iteration with coordinator review at every phase boundary, not first-attempt correctness**. Take as long as needed to satisfy fullness + veracity + the three proofs at each gate. The goal is the right answer eventually, not the fastest answer now.

No phase begins until the prior phase's output is coordinator-satisfied. Producer agents do their work; the coordinator gates every transition. Re-dispatching the prior phase with specific feedback is the default response to any concern — not "good enough" + move on.

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
5. Spawn `ioiof-extractor` (Phase 2c) → `scripts/extract-io-iof.ts` written + run; IO/IOF rows upserted into the metadata file; `CODE_EVIDENCE.json` populated. **Phase 2c gate is multi-step — see "Phase 2c gate (extended)" below.**
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

### Interpretive review (above the mechanical layer) — two-pass

The coordinator's review of phase output runs in **two ordered passes**. The order is enforced: Pass 1 commits its inventory BEFORE Pass 2 opens the EXTRACTION_REPORT. This makes COMPLETION mechanical against the SOURCE_STUDY skeleton instead of a value the coordinator has to remember to deploy.

**Pass 1 — Inventory (before reading EXTRACTION_REPORT)**

Open `SOURCE_STUDY.md`. Build the inventory by extracting ONLY the COVERABLE taxonomies — the leaves of any container hierarchy, excluding internal/test scaffolding, excluding L1 container labels that aren't themselves coverable, excluding INFORMATIONAL taxonomies. This is the expected coverage skeleton. Write it to a coordinator scratch file (`/tmp/<vendor>_inventory.txt`) BEFORE proceeding to Pass 2. Pass 1's output is committed before Pass 2 sees the producer's report — this prevents the producer's framing from shaping the coordinator's inventory.

If SOURCE_STUDY doesn't clearly distinguish COVERABLE vs INFORMATIONAL or doesn't pin L1↔L2 container/surface relationships, that's a SOURCE_STUDY defect — re-dispatch the source-auditor with feedback before proceeding to Phase 2c. The inventory must be unambiguous BEFORE the producer is asked to classify against it.

**Pass 2 — Reactive review (after Pass 1 inventory committed)**

Open `EXTRACTION_REPORT.md`. For each taxonomy in the Pass 1 inventory:
- Confirm it appears in either the report's "Taxonomies covered" or "Taxonomies excluded with reasoning" section.
- For taxonomies in "excluded," verify the exclusion reasoning is source-grounded and specific (not vague hand-wavy "out of scope"; cites the source URL / section that justifies exclusion).

After taxonomy coverage is verified, run the existing checks against the producer's claims: authenticity + veracity + the three proofs, applied to specific assertions the report makes.

If the inventory has any item not classified in the report (covered or excluded): report rejected, re-dispatch with the specific unclassified taxonomies named.

If exclusion reasoning fails source-grounding or specificity: re-dispatch with that exclusion flagged.

If a producer claim fails authenticity / veracity: re-dispatch with that claim flagged.

**Iteration policy** — no fixed cycle cap. Stop when one of these holds:
- First-attempt pass of a cycle (no rework needed → satisfied).
- Two consecutive cycles produce byte-identical output (convergence — further cycles won't change anything).
- Escalation: if the producer's response fails to address a previously-named coordinator concern for 3 consecutive cycles on that same concern, escalate.

The two-pass structure is the discipline. The lack of a cap reflects "no shortcuts" — the right answer eventually, not the fastest answer now.

### Values that shape coordinator judgment

As reviewer of the producer agent's work, you hold two values above all others:

**FULLNESS** — the producer should have found everything reasonably findable from accessible sources. When the producer reports drops, omissions, or interpretive decisions to stop somewhere, you judge whether those were justified by genuine source-limits or by stopping early. You value comprehensive coverage; you push back on partial coverage that wasn't necessary.

**VERACITY** — the producer's claims must be truthful and supported by the evidence cited. When the producer interprets the format (e.g., "these variables are runtime-bound, drop"), you judge whether that interpretation is defensible from what the format actually shows. You value honest interpretation over convenient conclusions; you push back on conclusions that look like the agent chose the easier reading.

These values inform your review. They are NOT a checklist of items to verify. Apply them as you read the producer's structured report and decide whether the work is acceptable — what fullness and veracity require in any given case is your judgment, not ours.

### The three proofs at every phase boundary

At each phase boundary — Phase 2a (source study) → Phase 2b (root metadata), 2b → 2c (IO/IOF extraction), 2c → 2d (code build), 2d → Phase 3 (testing) — before dispatching the next phase, the coordinator reviews the previous phase's output through fullness + veracity AND verifies three proofs:

- **AUTHENTICITY** — are the sources/data/claims from the vendor or vendor-controlled? Not third-party, not mirrored, not stale. The producer's evidence chain must trace back to a vendor-published artifact, not a community wiki or screenshot.
- **VERACITY** — do the report's claims actually hold against the underlying evidence? Patterns named accurately? Conclusions defensible from cited sources? When the producer asserts "X works this way," you can find that assertion supported by the evidence the producer cites — not by interpretive leaps the evidence doesn't carry.
- **COMPLETION** — have all reasonably-accessible scope items been covered? Has the agent missed kinds of sources, patterns, or interpretations that should have been considered? Empty negative-space + empty cuts-list = stopped early.

These three proofs apply at every phase boundary — source study, metadata, extraction, code-build. Each phase's output must satisfy them before the next phase begins.

If satisfied: proceed.
If not: re-dispatch the prior phase with specific feedback about what's missing or unverified.

3 cycles per phase. If unconverged after 3, escalate.

**Same model throughout. The coordinator is the reviewer the producer doesn't have. Independent walk of accessible sources to verify producer's claims is part of the coordinator's job at each gate — do not rely on the producer's report alone.** When the producer says "the catalog has N items," the coordinator opens the catalog and counts. When the producer says "this variable is runtime-bound," the coordinator looks at the variable's documented domain to verify. The report is the producer's claim; the coordinator's job is to test it against the source.

## Phase 2c gate (extended) — independent reviewer step

Phase 2c is the highest-stakes gate. The IO/IOF emission is what every downstream phase reads — code-builder builds against it, testing-agent tests against it, the connector ships against it. A coverage gap or interpretive blind spot at this gate propagates. So Phase 2c gets an **additional, independent reviewer** the other phases don't have.

The gate runs in this order:

1. **Mechanical validators** — `mj-validate-invariants`, `tsc`, `vitest` (as defined above). Fail → re-dispatch producer with verbatim validator messages.
2. **Coordinator two-pass audit** — Pass 1 inventory commit → Pass 2 reactive review against EXTRACTION_REPORT (as defined above). Fail → re-dispatch producer with specific feedback.
3. **Independent reviewer** — spawned only after #1 and #2 pass. Runs on a **different model** than the producer + coordinator (this is the discipline; same model surface = shared blind spots = no value-add). Produces `INDEPENDENT_REVIEW.md` with three sections (Confirmed gaps / Judgment calls / Reviewer errors). See `.claude/agents/independent-reviewer.md` for the full role spec.
4. **Reviewer gate decision**:
   - **0 confirmed gaps** → Phase 2c locks; advance to Phase 2d.
   - **≥1 confirmed gap (Blocking)** → re-dispatch producer with the reviewer's gap evidence; on producer's new emission, re-run #1, #2, AND #3 (reviewer regenerates its expected inventory; doesn't reuse prior inventory). Iterate until 0 confirmed blocking gaps.
   - **Confirmed gaps (Advisory)** → document in handoff; do not block. Code-builder / testing-agent reads them and decides.
   - **Judgment calls** → document, do not block; these are legitimate framework-judgment territory.

**Model-difference orchestration requirement**: when spawning the independent-reviewer via `Task`, pick a model name that is NOT the model currently executing this skill. If you cannot identify the current model with certainty, pick a model from a different vendor or different family than the producer used. The reviewer's value depends on different training → different blind spots; spawning it on the same model surface is the orchestration failure the reviewer's role file calls out.

**Why Phase 2c and not the others**: Phase 1 (identity) is mechanically verifiable (6 fields, name conventions). Phase 2a (sources) is verified by Phase 2b/2c using its output. Phase 2b (root metadata) has narrow scope (root-level config facts, all hard-constraint-citable). Phase 2d (code) is verified by Phase 3 (tests). Phase 2c is the only phase that produces a large interpretive output (the IO/IOF catalog), is consumed by every later phase, and has no later mechanical gate that catches its interpretive errors. The independent reviewer fills that gap.

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
