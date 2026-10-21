# @memberjunction/ng-charts

## 6.2.0-edge.4

### Patch Changes

- cd6f3ba: New package `@memberjunction/ng-charts`: token-themed bar, donut and area chart widgets for Angular (#5289).
  - `mj-bar-chart` (horizontal/vertical, grouped/stacked with diverging negatives), `mj-donut-chart` (center label/value, outside percent labels, pie at `InnerRadiusRatio` 0) and `mj-area-chart` (plain, stacked or 100%-stacked; monotone smooth or linear).
  - Built on `d3` (math only — Angular draws the SVG). `@memberjunction/*` packages are excluded from the host dev-server prebundle, so their bare imports resolve from the host; every MJ host already declares `d3`, so no host change is needed. Colors come only from CSS custom properties (`var(--token-name)`; MemberJunction `--mj-*` tokens are the expected source), so light/dark and brand overlays re-color through CSS.
  - Accessible by default: one tab stop with arrow-key navigation, a live-region announcement, a screen-reader data table, and a hoverable, Escape-dismissable CDK-overlay tooltip.
  - First consumer: the Sonar Portfolio lenses, which can now drop `apexcharts` / `ng-apexcharts` (MemberJunction/bizapps-sonar#83).
  - Responsive sizing (`Height="fill"`, `AspectRatio`), host-driven typography (`--mj-chart-font-size`), per-chart styling variables (`--mj-chart-*`), and `ShowGridlines`.

- Updated dependencies [49f26d9]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [90829e3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
  - @memberjunction/core@6.2.0-edge.4
