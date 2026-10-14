---
"@memberjunction/ng-charts": patch
---

New package `@memberjunction/ng-charts`: token-themed bar, donut and area chart widgets for Angular (#5289).

- `mj-bar-chart` (horizontal/vertical, grouped/stacked with diverging negatives), `mj-donut-chart` (center label/value, outside percent labels, pie at `InnerRadiusRatio` 0) and `mj-area-chart` (plain, stacked or 100%-stacked; monotone smooth or linear).
- Built on `d3` (math only — Angular draws the SVG). `@memberjunction/*` packages are excluded from the host dev-server prebundle, so their bare imports resolve from the host; every MJ host already declares `d3`, so no host change is needed. Colors come only from CSS custom properties (`var(--token-name)`; MemberJunction `--mj-*` tokens are the expected source), so light/dark and brand overlays re-color through CSS.
- Accessible by default: one tab stop with arrow-key navigation, a live-region announcement, a screen-reader data table, and a hoverable, Escape-dismissable CDK-overlay tooltip.
- First consumer: the Sonar Portfolio lenses, which can now drop `apexcharts` / `ng-apexcharts` (MemberJunction/bizapps-sonar#83).
- Responsive sizing (`Height="fill"`, `AspectRatio`), host-driven typography (`--mj-chart-font-size`), per-chart styling variables (`--mj-chart-*`), and `ShowGridlines`.
