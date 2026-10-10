---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/theme-engine": patch
"@memberjunction/ng-dashboards": patch
---

fix(tokens): dark-theme `--mj-status-*-text` now carries a status signal (#4564)

In `[data-theme="dark"]` all four `--mj-status-*-text` tokens resolved to the **100** step of their ramp, a near-white tint within 1.00 to 1.12:1 of `--mj-text-primary`. Anything whose only status affordance was `color: var(--mj-status-*-text)` was legible but indistinguishable from body text in dark theme.

- **Dark `-text` tokens move to the 300 step.** 300 reads as its hue and clears WCAG AA on every resting dark surface (page, surface, card, elevated), including on the matching 15% `-bg` tint (lowest measured: info at 4.92:1 over elevated). The 400 step separates further from body text but fails AA for error and info on elevated surfaces, so 300 is the deepest step that holds across the resting surfaces. See the known limitation below for the hover and active surfaces. Light theme is unchanged.
- **The info ramp gains its missing `200`, `300` and `400` steps.** `--mj-color-info-*` only defined 50, 100, 500, 600 and 700, so `var(--mj-color-info-300)` would have been invalid and fallen back to the inherited body color. The Integration overview's refresh and sync button hover borders, which referenced the undefined `--mj-color-info-200`, now use the theme-aware `--mj-status-info-border` instead of a primitive.
- **Visible side effect:** the `mjButton` danger, success and warning variants (and about 17 bespoke buttons) use `--mj-status-*-text` as their hover background. In dark theme their hover now lifts to a lighter tint of the button's own hue instead of flashing to near-white. The label is `--mj-text-inverse` (neutral-900 in dark), so it stays well above AA either way.
- **`ThemeEngine` follows.** `derive.ts` held a hardcoded parallel copy of the dark `-text` values at the old 100 step. The runtime overlay never emits semantic tokens, so branded orgs already got the fix from the stylesheet, but ThemeStudio reads `derived.tokens.dark` for its previews and would have shown the old near-white values next to an app rendering the 300 step.
- **Known limitation:** on a hovered row (`--mj-bg-surface-hover`, neutral-600) status text on its own tint drops below AA for warning (4.37), error (3.81) and info (3.78), where the 100 step passed. On `--mj-bg-surface-active` (neutral-500) both steps fail. The tint and border still carry the status there, and the root cause is how light those two dark surfaces are, which is a separate change.
