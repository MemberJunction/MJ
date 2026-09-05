---
"@memberjunction/ng-base-forms": minor
"@memberjunction/testing-engine": minor
"@memberjunction/ng-chat": patch
---

Accessibility-by-Default, Phases 1–2 (plan: `plans/accessibility-by-default/README.md`):

- **`ng-base-forms` — WCAG 2.1 AA for every MJ form, generated or custom.** `mj-form-field` now associates labels with controls (`for`/unique `id`), advertises `aria-required`/`aria-invalid`/`aria-describedby` from the existing validation state, announces validation messages (`role="alert"`/`role="status"`), gives controls an `aria-label` fallback when the visible label is hidden, and upgrades the custom widgets to real ARIA patterns: the select is now a keyboard-operable combobox/listbox (previously **mouse-only** — Enter/Space/Arrows/Home/End/Escape all work), the value-list autocomplete gains arrow-key navigation + combobox ARIA, and the FK search exposes combobox + grid semantics with `aria-activedescendant` (also fixes a latent bug where FK arrow-key scrolling queried a selector that doesn't exist in the multi-column grid). Read-only FK/Email/URL links are keyboard-focusable and Enter-activatable. `mj-collapsible-panel` headers — previously click-only despite `role="button"` — toggle on Enter/Space and expose `aria-expanded`/`aria-controls` over a labelled `role="region"` body. Decorative icons are `aria-hidden`; icon-only buttons have explicit labels.
- **`testing-engine` — new built-in `accessibility` oracle.** Evaluates axe-core-shaped scan findings (`AccessibilityScanOutput`) passed by a driver as `actualOutput`, with `failOn` severity gating, `maxViolations` threshold, and an `allowedRules` reviewed-exception list. Deliberately DOM-agnostic so the Testing Engine keeps its no-browser-dependency guarantee; a Playwright/axe `AccessibilityAuditDriver` is Phase 3.
- **`ng-chat`** — decorative welcome image gets `alt=""`, making the whole `packages/` tree pass the new gate.
- **New CI gate: `check:a11y`** (`.github/scripts/check-a11y-templates.sh` + `ci-a11y.yml`) — diff-scoped static template checks (`img-alt`, `positive-tabindex`, `hidden-but-focusable`) mirroring the design-token gate's contract, with an empty starting allowlist (839 templates, 0 violations).
