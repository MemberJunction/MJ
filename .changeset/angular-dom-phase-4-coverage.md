---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-ui-components": patch
---

Angular DOM unit-testing — Phase 4 coverage push. Dev-only (test files + a scoping-tool CI gate); no runtime change.

- **`MjFormFieldComponent`** — the visibility report's highest-leverage gap (4,144 usages, 0 tests) —
  gains 21 DOM specs across its read/edit field-type matrix (textbox/textarea/checkbox/dropdown/date/
  numeric, links, value-list options, label/gating). The FK-dropdown machinery (reads
  `LinkedFieldOptionsStore`/`BaseEngineRegistry` singletons) is documented as the deferred half.
- **`ui-components` primitives** — the next-highest-leverage gaps by usage: `MJEmptyStateComponent`
  (~500× — the component every other spec stubs; 13 specs), plus the page-chrome wrappers
  `MJPageBodyComponent` / `MJPageLayoutComponent` / `MJPageHeaderInteriorComponent`. Also `MJFilterPanelComponent` (config-driven filter sidebar; text/chips fields + reset) and `MJTabNavComponent` (ARIA tablist). Adds an `overlay-helpers` module to `ng-test-utils` (query the CDK connected-overlay container) and uses it to cover `MJDropdownComponent` (~93×; open/select/filter/disabled/empty). The same helper covers `MJComboboxComponent` (focus/type/filter/mousedown-select/clear/custom-on-blur) and `MJFilterPopoverComponent` (trigger badge, open/close, projected panel, ClearAll). Plus the no-overlay chrome primitives `MJPageBodyInteriorComponent`, `MJDialogActionsComponent`, `MJLeftNavContentComponent` (error/loading/busy states) and `MJLeftNavComponent` (sectioned nav: items, active/aria-current, ItemClicked, disabled guard).
- **`conversations`** follow-up pass: 9 new specs (active-tasks panel, agent-process panel, active-agent
  indicator, and the presentational realtime widgets — agent banner, channel strip, composer, delegation
  card, session-timeline card, channel-onboarding), 18 → 27 of 70. Each new component + spec pair added to
  the package's enumerated `tsconfig.spec.json` (required there, or AOT drops decorator metadata → NG0202).
- **Generic DOM coverage ratchet**: `scripts/dom-test-report.mjs` gains `--max-none`/`--min-solid` CI
  gates; the workflow runs `--max-none=170` (absolute cap on unspecified Generic components — ratchet down
  as specs land). Complements the Explorer `--min 85` gate.
- Guide documents the enumerated-tsconfig/NG0202 gotcha.
