---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-ui-components": patch
---

A dialog opened from a slide panel now renders above it. `mj-dialog`'s backdrop shipped at `z-index: 1000` and `mj-slide-panel` at 1001, so a modal launched from a drawer (the User-360 / asset-preview pattern) landed underneath the surface that opened it, and hosts bridged it with their own `z-index` overrides keyed to MJ class names.

- **Two new stacking tokens.** `--mj-z-drawer` (1000) and `--mj-z-dialog` (1200) join the `Z-INDEX SCALE` in `_tokens.scss`. The slide panel's backdrop sits on the drawer rung and the panel itself one above it; the dialog backdrop sits on the dialog rung.
- **The ladder is documented.** The token section now lists the de-facto overlay order (shell header, drawer, dialog, mobile chrome band, window, confirm, search, toasts) so a host composing its own surfaces knows where to land. Only the two new rungs are tokens; the legacy 0–800 rungs are unchanged and keep their consumers.
- Tests pin the ordering in `_tokens.scss` and the rung each stylesheet names.
