---
"@memberjunction/ng-shared-generic": patch
---

fix(tokens): dark-theme `--mj-status-*-text` now carries a status signal (#4564)

In `[data-theme="dark"]` all four `--mj-status-*-text` tokens resolved to the **100** step of their ramp, a near-white tint within 1.00 to 1.12:1 of `--mj-text-primary`. Anything whose only status affordance was `color: var(--mj-status-*-text)` was legible but indistinguishable from body text in dark theme.

- **Dark `-text` tokens move to the 300 step.** 300 reads as its hue and clears WCAG AA on every dark surface, including `--mj-bg-surface-elevated` and the matching 15% `-bg` tint (lowest measured: info at 4.92:1). The 400 step separates further from body text but fails AA for error and info on elevated surfaces, so 300 is the step that is safe everywhere. Light theme is unchanged.
- **The info ramp gains its missing `200`, `300` and `400` steps.** `--mj-color-info-*` only defined 50, 100, 500, 600 and 700, so `var(--mj-color-info-300)` would have been invalid and fallen back to the inherited body color. This also repairs the Integration overview's refresh and sync button hover borders, which already referenced the undefined `--mj-color-info-200`.
- **Visible side effect:** the `mjButton` danger, success and warning variants (and about 17 bespoke buttons) use `--mj-status-*-text` as their hover background. In dark theme their hover now lifts to a lighter tint of the button's own hue instead of flashing to near-white. The label is `--mj-text-inverse` (neutral-900 in dark), so it stays well above AA either way.
