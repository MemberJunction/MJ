# Architecture & flow diagrams skill (built on archify)

**Status:** proposal · **Phase 0 shipped** with this plan (Mermaid fix, see below)

## Goal

Give Research, Query Builder and Sage a way to produce presentation-quality, interactive
architecture, workflow, sequence, data-flow and state-machine diagrams. Build it on
[archify](https://github.com/tt-a1i/archify) (MIT), and keep MJ's copy current as archify releases.

## What archify is, and why it is not a drop-in skill

archify is an Anthropic-style Agent Skill (`SKILL.md` plus references, schemas, examples and a
~7k-line Node toolchain). The model writes a **typed JSON spec**: nodes with explicit positions and
sizes, plus edges. The toolchain validates it against JSON schemas and layout rules (overlaps, label
gaps, routing) and returns structured diagnostics the model repairs against. It then renders **one
standalone HTML file** with inline SVG: themes, an animated "trace", a node finder, a focus panel,
and PNG/JPEG/WebP/SVG/WebM export.

| | Mermaid | archify |
|---|---|---|
| Model writes | short text DSL | typed JSON with explicit layout |
| Layout | automatic | model-placed, routes automatic |
| Validation | syntax only | schema + layout, repairable diagnostics |
| Output | SVG | interactive standalone HTML (~728 KB template, mostly fonts) |
| Types | many (incl. ERD, Gantt, pie…) | architecture, workflow, sequence, dataflow, lifecycle — **no ERD** |
| Cost | a few hundred tokens | ~3–10k tokens of instructions + a repair loop |

So the two are complementary. **Mermaid stays the default** for quick inline diagrams and ERDs.
**archify is for when the diagram is the deliverable.**

What blocks a straight import:

- **Runtime.** Every step is `node bin/archify.mjs …` against the filesystem, and the final gate
  needs headless Chrome. MJ agents have no shell.
- **Skill model.** An MJ skill (`MJ: AI Skills`) is one `Instructions` string plus bundled Actions
  and sub-agents. There are no `references/`, `scripts/` or assets (see
  `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md`). archify's instructions are ~2.7k tokens of
  `SKILL.md` plus ~24k of references, schemas and examples.
- **No import/sync.** `SkillImportExportService` imports a single MJ-dialect SKILL.md by manual
  upload. It records no source, version or content hash, and has no update detection.

## Phase 0 — make Mermaid real (shipped with this plan)

`Create Mermaid Diagram` called `mermaid.render()` in plain Node and always threw
`document is not defined`. That is why the Research Report Writer prompt told the model both to use
it and not to. It now renders in headless Chromium (`MermaidRenderer`) and returns
`BROWSER_UNAVAILABLE` when no browser exists. The prompt now recommends Mermaid, with a fallback.
Phase 2 builds on this: a host that can render Mermaid already has the Chromium that archify's
browser gate wants.

## Phase 1 — renderer package and actions

1. **Vendor archify as code**, pinned to a release tag, in a new server package
   (working name `@memberjunction/ai-diagrams`):
   - Vendor `renderers/`, `schemas/`, `assets/template.html`, `examples/`, `LICENSE` and
     `THIRD_PARTY_NOTICES.md`. Fonts are under the OFL.
   - Record the tag, tree SHA and zip SHA-256 in an `UPSTREAM.json`.
   - The renderer is dependency-free Node ESM. Shim the few file reads in
     `renderers/shared/cli.mjs` so rendering happens in memory.
   - Check it against `check:esm`.
2. **`Render Architecture Diagram` action.**
   - Inputs: `DiagramType`, `SpecJSON`, optional `Output` (`svg` | `html` | `both`).
   - Runs validate → render in-process. On failure it returns archify's diagnostics as JSON, so the
     Loop agent repairs and calls again. The agent's iteration limits cap the loop.
   - On success it returns:
     - `SVG`, for embedding in Research reports, the Query Builder Plan tab, and markdown.
     - Standalone `HTML` as a **file output with `visibility: 'Always'`**, so it surfaces as a
       normal artifact even from Sage, whose `ArtifactCreationMode` is `System Only`. That mode
       governs only the agent's payload artifact (`AgentRunner.ts`); action file outputs carry their
       own visibility.
   - Optional browser-readability gate via the same Chromium as `MermaidRenderer`.
   - **Lite template:** swap the ~728 KB of embedded fonts for MJ's.
3. **`Get Architecture Diagram Reference` action.**
   - Input: `(type, topic)`. Returns the matching schema, example or reference doc.
   - This replaces archify's "read the references" step and gives progressive disclosure without
     multi-file skills.

## Phase 2 — the skill and agent wiring

- **New skill "Architecture & Flow Diagrams".**
  - `ActivationMode: Auto`, bundling the two actions.
  - Its description must not overlap **Data Visualization**: diagrams of systems, flows, sequences
    and state machines, not charts of numbers.
  - Its `Instructions` are MJ's own rewrite of archify's `SKILL.md` (~3–5k tokens): type router,
    authoring defaults, coordinate heuristics, and the repair loop, with CLI steps replaced by
    action calls.
- **Research Agent.**
  - The orchestrator activates skills, but the **Report Writer** child writes the HTML, so grant
    `Render Architecture Diagram` to the Report Writer directly, next to its SVG actions.
  - Add a report-writer section for system and architecture explanations.
- **Query Builder.**
  - Use archify's `dataflow` type for query lineage: source tables → joins → aggregations → output.
  - Keep the Mermaid `erDiagram`, since archify has no ERD.
  - Either set `AcceptsSkills` on the Query Strategist or have the parent render on request.
  - **Verify first** that the Data artifact's Plan-tab markdown pipeline passes inline SVG.
- **Sage.** Already `AcceptsSkills: All` + `Auto`, so it picks the skill up for "how does X work"
  questions. Nothing else to change.

## Phase 3 — keeping our copy current

**Upstream signal.** archify publishes
`https://tt-a1i.github.io/archify/skill-updates/archify/stable.json`, mirrored in its repo at
`docs/skill-updates/archify/stable.json`. It carries `version`, `publishedAt`, `source.ref` (the
tag), `treeSha`, `artifact.sha256` and `severity`.

Upstream moves fast: 629 commits in September 2026, roughly weekly tags, and v3.0 landed
2026-09-28 with schema migrations. So we **pin to tags, never `main`**.

**Weekly sync job** (GitHub workflow):

1. Read `stable.json`. Stop if `source.ref` matches `UPSTREAM.json`.
2. Download the release zip, verify `artifact.sha256`, and replace the vendored files.
3. Re-render every upstream example through our action as regression tests.
4. Diff upstream `SKILL.md` and `references/` since our pinned tag.
5. **Open a PR**, never auto-merge. The upstream instruction diff goes in the PR body for a human
   (or SkillSmith / a Claude routine) to fold into MJ's rewritten `Instructions`.
   - Upstream instruction text becomes prompt content in every customer's agents, so it is a
     supply-chain and prompt-injection surface and needs review.
   - Vendored code is ordinary third-party code under review.

**Shipping.** Code ships in the package version. The skill row ships in the release's consolidated
metadata-sync migration (`metadata/CLAUDE.md` §1b), like any other metadata.

## Phase 4 (optional, generic) — first-class external skills

Worth doing independently of archify.

- **Source fields on `AISkill`:** `SourceType`, `SourceURL`, `SourceRef`, `SourceVersion`,
  `SourceContentHash`, `LastSyncedAt`.
- **Multi-file skills:** an `AISkillFile` table plus a "read skill file" step.
- **Real YAML frontmatter** in `SkillMarkdownConverter` (`license`, `metadata.version`, unknown keys
  preserved).
- **URL / GitHub import** in `SkillImportExportService`.
- **Scheduled update check.** When upstream changes, it sets an imported skill to `Pending` for
  admin review instead of overwriting it.

This makes any *instruction-only* Anthropic skill importable and trackable. Skills that ship scripts
(archify included) still need the vendored-code route of Phases 1–3, because the server does not run
a skill's scripts.

## Risks and open questions

- **Upstream churn.** Covered by tag pinning plus example re-render tests.
- **Artifact weight.** The lite template must hold up visually.
- **Rollout depends on Chromium.** Any host that wants Mermaid or the archify browser gate needs
  Chromium in its MJAPI image. Should the published Docker image ship it?
- **Query Builder Plan tab.** Does its markdown sanitizer keep inline SVG?
- **One skill or two.** Should this be its own skill, or a section of Data Visualization? A separate
  skill keeps Data Visualization lean and its description sharp.
