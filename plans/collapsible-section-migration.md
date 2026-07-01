# Collapsible-Section Migration — Scoping

Migrate bespoke "click-a-header-to-expand/collapse" sections to the canonical
`<mj-accordion-panel>` (`@memberjunction/ng-ui-components`). Scoped up front via a
classification pass so we only touch genuine collapsibles — not the ~37 static
`.section-header` styles that the adoption marker also matches.

## Why this one is worth doing

Every target is currently a `<div (click)>` header — **not focusable, no keyboard
support, not announced to screen readers.** `mj-accordion-panel` renders the header
as `<button [attr.aria-expanded]>`. So this is **11 real accessibility fixes**, not
cosmetic consistency. (Contrast with empty-states, which were mostly visual.)

## Classification (of the 53 files matching the `.section-header` marker)

- **11 genuine collapsibles** → migrate (below)
- **~5 already canonical** → the core-entity-forms forms using `mj-collapsible-panel` (correct; leave)
- **~37 static headers** → just styled headings, no toggle → **out of scope**

Two corrections vs. a naive `section-header + (click)` grep:
- **Excluded** `ComponentStudio/form-builder-canvas` — its `OnSectionHeaderClick` emits
  `SectionSelected` (it *selects* a section, doesn't collapse). False positive.
- **Added** `entity-relationship-diagram/entity-details` — toggles via a child chevron
  button, so the header-click grep missed it.

## The 11 targets

| # | Component | Toggle handler | Where to see it |
|---|---|---|---|
| 1 | `DataExplorer/navigation-panel` | `onSectionToggle()` | Data Explorer → left sidebar (Favorites / Recent sections) |
| 2 | `DataExplorer/data-explorer-dashboard` | `toggleQuickAccessSection()` | Data Explorer → Quick Access (Recent Records / Recent Entities) |
| 3 | `Integration/pipelines` | `ToggleFieldMaps()` | Integration → Pipelines → expand a pipeline card → Field Maps |
| 4 | `Integration/visual-editor` | `ToggleFieldMaps()` | Integration → Visual Editor → a node's Field Maps |
| 5 | `MCP/mcp-log-detail-panel` | `toggleSection()` | MCP → Logs → a log's detail (Error / Input Args sections) |
| 6 | `explorer-settings/application-dialog` | `toggleSection()` | Admin → App config → edit an app (Basic Info section) |
| 7 | `Generic/action-test-harness` | `ToggleInputsCollapsed()` | Action test harness → Inputs section |
| 8 | `Generic/entity-record-detail-panel` | `toggleSection()` | An entity record detail panel → Details section |
| 9 | `Generic/agent-properties-panel` | `ToggleSection()` | Agent flow editor → a step's properties (General section) |
| 10 | `Generic/query-viewer/query-info-panel` | `ToggleSection()` | Query viewer → info panel (Overview section) |
| 11 | `Generic/entity-relationship-diagram/entity-details` | `toggleFieldsSection()` | ERD → select an entity → Fields section |

## Canonical: `mj-accordion-panel` (NOT `mj-collapsible-panel`)

`mj-collapsible-panel` (base-forms) is form-coupled — that's what the 5 already-canon
core-entity-forms files correctly use. For these 11 dashboard/generic sections use
`mj-accordion-panel` (general-purpose, in `ui-components`).

API confirmed to fit all 11:
- `[(Expanded)]` two-way (↔ the existing per-section booleans + toggle methods, 1:1)
- `<ng-template mjAccordionTitle>` rich title slot (icon + label + count badge)
- built-in rotating chevron + `<button aria-expanded>` header
- `@if (Expanded)` body projection

## Migration pattern (per section)

```html
<!-- BEFORE -->
<div class="x-section" [class.collapsed]="!fooExpanded">
  <div class="section-header" (click)="toggleFoo()">
    <i class="fa-solid fa-star"></i> <span>Favorites</span>
    <span class="count">{{ n }}</span>
    <i class="fa-solid fa-chevron-down chevron"></i>
  </div>
  @if (fooExpanded) { <div class="body">…</div> }
</div>

<!-- AFTER -->
<mj-accordion-panel [(Expanded)]="fooExpanded">
  <ng-template mjAccordionTitle>
    <i class="fa-solid fa-star"></i> Favorites <span class="count">{{ n }}</span>
  </ng-template>
  …body…
</mj-accordion-panel>
```
Then delete the bespoke `.section-header` / chevron CSS + the manual toggle plumbing
(keep the boolean only if it's persisted, e.g. via `UserInfoEngine` — just bind it).
Wire `MJAccordionPanelComponent` + `MJAccordionTitleDirective` into each consumer's
module/imports.

## Caveats to handle during migration (minor, not blockers)

1. **Header has no nested non-toggle actions** — verified across all 11 (the only
   "nested buttons" were the chevron toggle itself, which the accordion replaces). So
   no `<button>`-in-`<button>` risk.
2. **Content destroyed on collapse** — `@if (Expanded)` removes the body from the DOM.
   Fine for all that already use `@if`; watch any section holding a live chart/grid or
   unsaved form state (it gets recreated each open).
3. **Density** — adopting the accordion's header/body styling is the goal, but eyeball
   the tight `navigation-panel` sidebar so default padding isn't too heavy.

## Before-screenshots

Baseline captures live in `plans/collapsible-section-screenshots/before/`.
This dev environment is data-sparse (0 saved queries, 0 MCP logs, no integration
connections), so several deeply-nested panels can't be opened here — those are best
captured before/after **at migration time** (the per-component workflow we already use).

| Target(s) | Capture | Status |
|-----------|---------|--------|
| #2 dashboard group sections | `01-dataexplorer-navpanel-sections.png` | ✅ captured |
| #1 navigation-panel (Favorites/Recent/Entities) | `02-dataexplorer-navigation-panel-sections.png` | ✅ captured |
| #8 entity-record-detail-panel (Details / Related Records) | `03-entity-record-detail-panel-sections.png` | ✅ captured |
| #7 action-test-harness (Input Parameters) | `04-action-test-harness-inputs.png` | ✅ captured |
| #10 query-info-panel | — | ⛔ not reachable (0 saved queries) |
| #5 mcp-log-detail-panel | — | ⛔ not reachable (0 MCP logs) |
| #3/#4 Integration pipelines + visual-editor | — | ⛔ not reachable (no connections) |
| #6 application-dialog · #9 agent-properties-panel · #11 ERD entity-details | — | 🔶 reachable but deeply nested — capture at migration time |

The 4 captured shots span 4 distinct components and are representative of the whole
pattern: a `<div (click)>` header + chevron toggling an `@if`-gated body.
