---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-tabstrip": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-composer": patch
"@memberjunction/ng-entity-action-ux": patch
"@memberjunction/ng-record-process-studio": patch
"@memberjunction/ng-user-routines": patch
"@memberjunction/ng-list-management": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-scheduling": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-actions": patch
"@memberjunction/ng-testing": patch
"@memberjunction/ng-bootstrap": patch
---

Angular DOM unit-testing — Phase 4 coverage push. Dev-only (test files + test-config/CI-gate scoping); no runtime change.

Drives the Generic DOM-coverage ratchet (`scripts/dom-test-report.mjs … --max-none`) from **185 → 137** by writing DOM specs, in usage-ranked order, for every Generic Angular component appropriate for a DOM unit test. Highlights:

- **Highest-leverage primitives** — `MjFormFieldComponent` (the field renderer behind ~4,000 usages) across its read/edit type matrix; the `ui-components` design system (`MJEmptyStateComponent`, the `mj-page-*` chrome family, `MJDropdown`/`MJCombobox`/`MJFilterPopover` via a new CDK-overlay test helper in `ng-test-utils`, the `mj-dialog` family, tabs, filter panel, left-nav).
- **Form host stack** — `MjRecordFormContainer`, `MjFormToolbar`, `MjEntityFormHost`, `MjIsaRelatedPanel`, `FormPanelSlot`, `ExplorerEntityDataGrid`, `InteractiveForm`.
- **Viewers, grids & dialogs** — `EntityDataGrid` + `QueryDataGrid` (AG-Grid chrome), `EntityViewer`, `ArtifactViewerPanel`, the ERD component family (`ERDComposite`/`MJEntityERD`/`ERDDiagram`), plus a broad set of panels/editors/dialogs across agents, artifacts, search, composer, list-management, scheduling, record-process-studio, user-routines, entity-action-ux, actions, and testing.
- **`Angular/Bootstrap` onboarded** — the last untracked library tree gains a DOM test tier (`MJAuthShell`, `MJBootstrap`) and its own `--max-none=0` CI gate, so every shipped Angular library tree (Explorer, Generic, Bootstrap) is now gated.

Reusable patterns established for the harder components: drive internal state before the first render (`setup`) rather than mutating post-render (unreliable under zoneless CD); stub the heavy core (AG-Grid, React bridge, SVG layout, plugin viewers) and spy async loaders so specs exercise the component's own chrome/wiring; add each component **and its injected services** to enumerated `tsconfig.spec.json` files (or AOT drops decorator metadata → NG0202).

Deliberately **not** covered, and left at the 137 floor: five integration/e2e-tier orchestrators (`ConversationChatArea`, `MessageInput`, `RealtimeWhiteboardBoard`, `AITestHarness`, `RealtimeSessionOverlay`) — 1,800–4,600-line components with realtime/WebRTC/canvas cores or 14–30 dependencies, which belong in the browser regression suite rather than DOM units.
