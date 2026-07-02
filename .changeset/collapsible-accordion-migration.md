---
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-actions": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-clustering": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-filter-builder": patch
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-record-tags": patch
"@memberjunction/ng-resource-permissions": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-testing": patch
"@memberjunction/ng-versions": patch
---

Consolidate collapsible/disclosure UI onto the canonical `<mj-accordion-panel>` across MJ Explorer, and level up the accordion component itself.

**`@memberjunction/ng-ui-components` (the component):**
- New **`MJAccordionModule`** — bundles the panel + all three slot directives (`mjAccordionTitle`, `mjAccordionActions`, `mjAccordionBody`) so consumers import one symbol instead of four (works in both NgModule and standalone `imports`). An NgModule is used because AOT can't expand a value-array across a compiled-package boundary (NG1010) and an `as const` tuple is rejected by the `imports` type (TS2322).
- New lazy **`[mjAccordionBody]`** slot — heavy bodies (code editors, grids, charts) instantiate on first expand and stay alive for animated re-toggle, so consumers don't have to reason about content weight or hand-write `@if (expanded)`.
- Hardening: `--sm`/`--disabled`/`--muted-icon` modifiers scoped to child combinators (no nested-panel style bleed); `hasBeenExpanded` made non-public per naming conventions; added a DOM test proving the module exposes every declarable.

**~50 disclosure surfaces migrated** from bespoke `<div (click)>`-header + `@if` markup to `<mj-accordion-panel>` across 20 Angular packages — dashboard-viewer config panels, DevTools Class Registry, Version History diff/snapshot groups, the test-run dialog, Explorer section toggles (about-dialog, sql-logging, SystemDiagnostics, App Roles, Home add-pin, Integration activity, Actions/Permissions/Credentials/Testing/ComponentStudio), and Generic components (agents, clustering, conversations, search, entity-viewer, filter-builder, record-tags, resource-permissions, core-entity-forms). Each replaces a non-focusable `<div (click)>` header with a real `<button [attr.aria-expanded]>` — a genuine accessibility improvement, not cosmetic — and deletes the per-consumer collapse chrome CSS. Card-based collapsibles, trees, and fill-panes are intentionally out of scope (they route to their own primitives).

No public API changes in the consumer packages (internal refactor). Verified: all affected package test suites pass, CI UI gates green (design tokens + button overrides), and a full audit confirmed side-effects preserved with two visual regressions caught and fixed (SystemDiagnostics severity tint restored with semantic tokens; cluster-scatter members list scroll-confined via `[Fill]`).
</content>
