---
"@memberjunction/core-actions": minor
---

`Create Mermaid Diagram` now actually renders, and the Research Report Writer is told to use it.

- **The action never worked on the server.** It called `mermaid.render()` in plain Node, which throws `document is not defined`: Mermaid lays diagrams out by measuring rendered text, so it needs a real DOM. A jsdom shim was tried and still fails on flowcharts and ER diagrams. Rendering now runs in headless Chromium through Playwright (new `MermaidRenderer` singleton in `custom/visualization/shared/mermaid-renderer.ts`). The browser is launched once, lazily, and shared. Renders run on a pool of at most four warm pages with Mermaid preloaded and every network request blocked, so concurrent renders can't grow the browser without bound and a render no longer reloads the 3 MB bundle. A page that crashed or timed out is closed, never reused, and each render is capped at 20 seconds. Mermaid's strict security level and the requested theme cannot be overridden by `Config`. The SVG is still sanitized before it is returned.
- **New result codes.** `BROWSER_UNAVAILABLE` (no Chromium could be launched, or it failed mid-render — don't retry; use an SVG action instead) and `TIMEOUT`. Only Mermaid syntax errors return `DIAGRAM_GENERATION_FAILED`. The input check now flags event handlers only inside a tag, so a label like `online = true` renders.
- **Hosts need a Chromium build to use this action.** `@memberjunction/core-actions` now depends on `playwright` (`^1.58.1`), which installs no browser. The MJAPI Docker image now installs one (about 650 MB; build with `--build-arg INSTALL_CHROMIUM=false` to leave it out). Elsewhere, install one with `npx playwright install chromium`, or point `MJ_CHROMIUM_EXECUTABLE_PATH` at an existing binary. Without one, the action returns `BROWSER_UNAVAILABLE`; nothing else changes.
- **Research Report Writer prompt.** It recommended `Create Mermaid Diagram` in one section and banned Mermaid ("not supported in our HTML reports") in another. It now recommends Mermaid for most diagrams, says to embed the action's SVG and never paste Mermaid source into HTML, and falls back to `Create SVG Diagram` on `BROWSER_UNAVAILABLE`.

Also adds `plans/archify-diagram-skill.md`, a plan for an architecture-diagram skill built on archify.
