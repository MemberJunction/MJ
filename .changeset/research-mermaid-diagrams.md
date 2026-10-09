---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-diagrams": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/network-utils": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

`Create Mermaid Diagram` now actually renders, and the Research Report Writer is told to use it.

- **The action never worked on the server.** It called `mermaid.render()` in plain Node, which throws `document is not defined`: Mermaid lays diagrams out by measuring rendered text, so it needs a real DOM. A jsdom shim was tried and still fails on flowcharts and ER diagrams. Rendering now runs in headless Chromium through Playwright (new `MermaidRenderer` singleton in `custom/visualization/shared/mermaid-renderer.ts`). The browser is launched once, lazily, and shared. Renders run on a pool of at most four warm pages with Mermaid preloaded and every network request blocked, so concurrent renders can't grow the browser without bound and a render no longer reloads the 3 MB bundle. A page that crashed or timed out is closed, never reused, and each render is capped at 20 seconds. Mermaid's strict security level and the requested theme cannot be overridden by `Config`. The SVG is still sanitized before it is returned.
- **New result codes.** `BROWSER_UNAVAILABLE` (no Chromium could be launched, or it failed mid-render — don't retry; use an SVG action instead) and `TIMEOUT`. Only Mermaid syntax errors return `DIAGRAM_GENERATION_FAILED`. The input check now flags event handlers only inside a tag, so a label like `online = true` renders.
- **Hosts need a Chromium build to use this action.** `@memberjunction/core-actions` now depends on `playwright` (`^1.58.1`), which installs no browser. The MJAPI Docker image now installs one (about 650 MB; build with `--build-arg INSTALL_CHROMIUM=false` to leave it out). Elsewhere, install one with `npx playwright install chromium`, or point `MJ_CHROMIUM_EXECUTABLE_PATH` at an existing binary. Without one, the action returns `BROWSER_UNAVAILABLE`; nothing else changes.
- **Research Report Writer prompt.** It recommended `Create Mermaid Diagram` in one section and banned Mermaid ("not supported in our HTML reports") in another. It now recommends Mermaid for most diagrams, says to embed the action's SVG and never paste Mermaid source into HTML, and falls back to `Create SVG Diagram` on `BROWSER_UNAVAILABLE`.

Also adds `plans/archify-diagram-skill.md`, a plan for an architecture-diagram skill built on archify, and implements it:

- **New package `@memberjunction/ai-diagrams`.** It vendors archify v3.0.1 (MIT), pinned in `UPSTREAM.json`, and renders its architecture, workflow, sequence, data-flow and lifecycle diagrams in-process: one worker thread per render, with an empty environment, a capped heap and a 30-second cap.
  - The only change to upstream is `archify-shims.patch`, in `renderers/shared/cli.mjs`: input and output in memory, no repository-evidence reads, and no fetching of brand marks from URLs.
  - Renders return archify's validation diagnostics for repair.
  - The SVG is made self-contained: styles scoped to its own id, light-theme colors resolved to literals, a solid background, and no quotes or `--`, which MJ's markdown would rewrite.
  - The interactive page uses a lite template with MJ's fonts in place of the embedded ones.
- **New actions `Render Architecture Diagram` and `Get Architecture Diagram Reference`.**
  - The first returns the SVG, and the standalone page as a file output with visibility `Always`. It has an optional browser-readability gate on the same Chromium as `Create Mermaid Diagram` (new `MermaidRenderer.WithIsolatedPage`).
  - The second serves a type's schema, its example, or an archify reference document.
- **New core skill "Architecture & Flow Diagrams"** (`Auto`), bundling both actions. Its instructions are MJ's rewrite of archify's `SKILL.md`: a type router, authoring defaults, layout heuristics, and a diagnostics-driven repair loop.
- **Research Report Writer** is granted both actions and told to use them when the diagram is the deliverable, embedding the returned SVG.
- **Query Builder** draws a data-lineage `dataflow` diagram on request and puts it in the Data artifact's Plan tab inside an `svg` fence. The Mermaid ER diagram stays.
- **Monthly archify sync job** (`.github/workflows/archify-sync.yml`). It opens or updates one review PR when archify publishes a new release, and does nothing otherwise.
- **First-class external skills** (migration `V202610070956__v6.2.x__AISkill_External_Sources_And_Files`):
  - `AISkill` gains source tracking (`SourceType`, `SourceURL`, `SourceRef`, `SourceVersion`, `SourceContentHash`, `LastSyncedAt`) and `Frontmatter`.
  - New `AISkillFile` table for multi-file skills. The new `Read Skill File` action is offered when a skill that has files activates.
  - SKILL.md frontmatter is now real YAML (`yaml`) and keeps unknown keys on a round trip.
  - Skills can be imported from an https URL or a GitHub folder (`SkillImportExportService.ImportSkillFromSource`).
  - A daily **Skill Update Check** job sets a skill whose upstream changed to `Pending` for review, instead of overwriting it. To keep the current version, pin `SourceRef` to the imported commit (shown in `SourceURL`) or clear `SourceType`; re-importing accepts the change and keeps the skill's local Name and bundled Actions and sub-agents.
  - Every skill fetch goes through `SafeFetch` with the new `RequireHttps` option (`@memberjunction/network-utils`): https on every hop, no private or link-local address, a timeout and a size cap.
  - SKILL.md files MJ exported before the YAML parser still read as they did: MJ's own keys are read literally (`#`, `1.10`, `null`, `C:\temp` and a comma-separated `codeOnlyActions` line keep their meaning), and a `codeOnlyActions` list naming anything not under `actions` fails closed instead of making every bundled action model-callable.
