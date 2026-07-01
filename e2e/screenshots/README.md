# e2e/screenshots — ad-hoc visual capture scripts

Browser-driven **screenshot-capture** helpers (not test specs). Each drives a
**running** MJExplorer via `playwright-cli` and writes full-page PNGs in both
light and dark themes, so a change can be reviewed side-by-side.

These are distinct from `../specs/*.spec.ts` (assertion-based Playwright tests):
they capture images for human review, they don't assert. They were originally
built for the collapsible → `mj-accordion-panel` consolidation, but the
mechanism (force some UI state, then shoot `-light.png` / `-dark.png`) is reusable
for any surface.

## Prerequisites

Same running stack as the rest of `e2e/` (see [`../README.md`](../README.md)):
MJAPI + MJExplorer up, and a primed signed-in `playwright-cli` session on the
target page.

## Usage

Run from the **repo root**, e.g.:

```bash
e2e/screenshots/navpanel-shot.sh nav-panel-baseline 1 1 1
```

Each script prints where it wrote its `-light.png` / `-dark.png` pair. Output
lands under `plans/complete/collapsible-section-screenshots/<surface>/` (the
archived home of the collapsible-migration captures).

| Script | Captures |
|--------|----------|
| `agent-props-shot.sh` | Agent flow-editor step properties panel accordions |
| `app-dialog-shot.sh` | Application config dialog |
| `erd-details-shot.sh` | ERD entity-details (fields / related) sections |
| `integration-fieldmaps-shot.sh` | Integration field-maps / sync-info sections |
| `mcp-log-shot.sh` | MCP log-detail disclosure |
| `navpanel-shot.sh` | Nav panel fill sections (favorites / recent / entities) |
