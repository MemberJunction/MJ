# Architecture & flow diagrams skill (built on archify)

**Status:** Phases 0–4 built in this PR (see the *As built* notes under each phase)

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
| Output | SVG | interactive standalone HTML (~728 KB template: ~405 KB viewer JS, ~286 KB CSS, 90 KB embedded fonts) |
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

**As built (Phase 1).**
- `packages/AI/Diagrams` vendors archify v3.0.1 at `vendor/archify/`, pinned in `UPSTREAM.json`.
  - It also vendors `references/`, `SKILL.md` and `brand-marks/catalog.json`: the Get Reference action needs the first, the sync diffs the second, and the renderers read the third.
  - It leaves out upstream's pre-rendered `examples/*.html` (`UPSTREAM.json` `exclude`). They are about 760 KB each, and the tests re-render the JSON specs.
- **The shims** are `archify-shims.patch`, all in `renderers/shared/cli.mjs`:
  - input from, and output to, an in-memory job;
  - no repository-evidence reads, since a server has no checkout;
  - no fetching of brand marks from URLs a spec names (an SSRF guard). Catalog marks still work.
- **"In-process" means a fresh `worker_threads` worker per render, in the same process.** archify's renderers are CLI scripts that render as they load. An ES module evaluates once per module graph, so re-importing in the main thread would never re-run, or would leak a module per render. The worker gets an empty `env`, a 512 MB heap and a 30 s cap. All 15 upstream examples render in 40–80 ms each.
- **The `SVG` is made self-contained.** The plan didn't call for this, but embedding needs it. archify styles its SVG from the page CSS, so a bare SVG renders black.
  - The rules the SVG uses are copied into a `<style>`, scoped to its own id, using the light theme with colors resolved to literals.
  - A solid background is added, because MJ's dark-mode cards would otherwise hide the text.
  - The style has no quotes or `--`, because MJ's markdown smartypants rewrites those.
- **Lite template:** fonts make up only 90 KB of the 728 KB. The lite template drops them for MJ's font stacks, saving about 12%. The rest is viewer JS and CSS that the interactive page needs.
- **The actions live in `@memberjunction/core-actions`,** next to the other visualization actions, and delegate to the package.
  - `Render Architecture Diagram` also returns `TIMEOUT`.
  - Its optional `BrowserCheck` gate returns `BROWSER_CHECK_FAILED`. It runs on `MermaidRenderer`'s Chromium through the new `WithIsolatedPage`.

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

**As built (Phase 2).**
- **The skill** is in `metadata/ai-skills/.core-skills.json` and `templates/architecture-flow-diagrams.skill.md` (about 4k tokens).
- **The Report Writer** gets both actions and a short how-to in its own prompt. It can't activate skills, so it never sees the skill's Instructions.
- **Query Builder: verified that the Plan tab keeps inline SVG only inside a ```` ```svg ```` fence** (the svg-renderer extension plus DOMPurify's svg profile). A raw `<svg>` breaks, and the plan-only view has `enableHtml` off.
  - **The parent renders lineage on request,** since it already accepts skills.
  - The Strategist is unchanged. It writes a plan for every query, so making it run archify would add that cost to every query.
- **Sage: confirmed,** with no change.

## Phase 3 — keeping our copy current

**Upstream signal.** archify publishes
`https://tt-a1i.github.io/archify/skill-updates/archify/stable.json`, mirrored in its repo at
`docs/skill-updates/archify/stable.json`. It carries `version`, `publishedAt`, `source.ref` (the
tag), `treeSha`, `artifact.sha256` and `severity`.

Upstream moves fast: 629 commits in September 2026, roughly weekly tags, and v3.0 landed
2026-09-28 with schema migrations. So we **pin to tags, never `main`**.

**Monthly sync job** (scheduled GitHub workflow, also runnable by hand via `workflow_dispatch`).
Monthly is enough: we pin to releases and review every bump, so a faster cadence would only queue
up more PRs to review. A `severity: critical` release can still be pulled in by hand-dispatching
the job.

1. Read `stable.json` and compare its `source.ref` with the tag recorded in `UPSTREAM.json`.
   **If they match, exit quietly: no PR, no issue, no comment.** A month without an upstream
   release produces nothing to review.
2. Download the release zip, verify `artifact.sha256`, and replace the vendored files.
3. Re-render every upstream example through our action as regression tests.
4. Diff upstream `SKILL.md` and `references/` since our pinned tag.
5. **Open a PR**, never auto-merge. The PR body carries the upstream release notes and
   instruction diff, for a human (or SkillSmith / a Claude routine) to fold into MJ's rewritten
   `Instructions`.
   - Upstream instruction text becomes prompt content in every customer's agents, so it is a
     supply-chain and prompt-injection surface and needs review.
   - Vendored code is ordinary third-party code under review.
   - If a sync PR from an earlier month is still open, update that PR rather than opening a second.

**As built (Phase 3).**
- `.github/workflows/archify-sync.yml` plus `.github/scripts/archify-sync.mjs`, with 51 tests. Cron: the 1st of each month, plus `workflow_dispatch`.
- **Two jobs.** The job that runs the freshly downloaded upstream code (shims, lite template, the example re-render tests) holds no write token and no secret, and saves no cache: it sets up pnpm and node itself, with caching off, rather than through `mj-setup`, whose `cache: 'pnpm'` would save a store the upstream code could have tampered with.
- **The publishing job trusts nothing the first job hands it.** That job ran unreviewed code, so it could have rewritten its own output. The publishing job never runs upstream code. It re-validates the tags and the manifest. It recomputes the changeset path from the tags. It keeps check results only under the names the sync uses. It refuses a patch that touches, deletes or renames anything outside the vendored paths, `UPSTREAM.json`, the lite template and that changeset.
- **No PAT, so CI does not run on the sync PR by itself.** The PR is opened and updated with `GITHUB_TOKEN` (`contents: write` and `pull-requests: write`, nothing more), and GitHub starts no workflows for that. This is on purpose: CI would run the vendored upstream code with the turbo remote-cache secrets in reach before anyone had read it. The PR body says so. A maintainer reviews the vendored diff, then starts CI by closing and reopening the PR. Pushing a commit also starts CI, but then the monthly job stops instead of updating the branch.
- **The PR body is assembled and capped at GitHub's size limit before anything is pushed.** Every piece of upstream text in it is inside a code fence or a single code span.
- **When a sync can't be applied cleanly** (the shims no longer apply, or the tests fail), it still opens the PR, as a draft with a CAUTION banner, and the run fails. A SHA mismatch aborts with no PR.
- **The PR body** carries every release between the pinned tag and the new one, not only the newest.
- **Severity values:** archify uses `normal | security`, not `critical`, so read "severity: critical" above as `security`.
- **The regression run is the package's upstream-example test**, not a call through the action.

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

**As built (Phase 4).** Migration `V202610061800__v6.2.x__AISkill_External_Sources_And_Files`, with its CodeGen output.
- **Source fields as planned,** with `SourceType` limited by a CHECK to `URL` | `GitHub` (NULL means authored here). One addition: `Frontmatter`, which stores unknown SKILL.md keys so they survive an import followed by an export, not just a pass through the converter.
- **`AISkillFile`** (`SkillID`, `Path`, `Content`, unique per skill and path).
  - The "read skill file" step is a `Read Skill File` action. It is offered automatically, with the file list, when a skill that has files activates. The action reads only files of skills active in the run.
  - Files are not cached in `AIEngineBase`, which would ship their content to every browser.
- **YAML frontmatter** uses `yaml`, which was already in the workspace. `license` and `metadata.version` are exposed, and unknown keys are preserved.
- **URL / GitHub import:** `SkillImportExportService.ImportSkillFromSource`, https only. It makes one tree-listing call for a GitHub folder and skips binaries and files over 512 KB. It is service-only for now: anything that exposes it to users needs an SSRF guard.
- **Update check:** a daily `Skill Update Check` scheduled job (shipped Active). A changed `SourceContentHash` sets the skill to `Pending`, which already existed in `AISkill.Status`, and leaves its content untouched. Re-importing with `updateSkillId` approves the change. A Pending skill can't be activated, so an upstream change takes it offline until an admin reviews it, as the plan intends.
- **Known limits:**
  - GitHub's unauthenticated limit is 60 calls an hour, and the check makes one per sourced skill.
  - Export is still a single SKILL.md.
  - Realtime agents don't get the file list.

## Risks and open questions

- **Upstream churn.** Covered by tag pinning plus example re-render tests.
- **Artifact weight.** The lite template must hold up visually. *As built:* fonts were only 90 KB of the 728 KB. The interactive page is about 640 KB, mostly viewer code.
- **Rollout depends on Chromium.** Any host that wants Mermaid or the archify browser gate needs
  Chromium in its MJAPI image. *Resolved:* `docker/MJAPI/Dockerfile` installs Chromium's headless shell, about 650 MB. `--build-arg INSTALL_CHROMIUM=false` leaves it out. archify rendering itself needs no browser.
- **Query Builder Plan tab.** Does its markdown sanitizer keep inline SVG? *Resolved:* yes, inside an `svg` fence (see Phase 2, as built).
- **One skill or two.** Should this be its own skill, or a section of Data Visualization? A separate
  skill keeps Data Visualization lean and its description sharp.
