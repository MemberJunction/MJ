# @memberjunction/ng-charts

Bar, donut and area chart widgets for Angular, built on `d3` (the same dependency MJ hosts already declare for `ng-graph-view`) and colored only through CSS custom properties (`var(--token-name)`) — MemberJunction design tokens are the expected source. Light/dark themes and org brand overlays re-color the charts through CSS — no re-render, no theme flag.

This is an L1 presentational package (`"mjUILayer": "widgets"`): data in through inputs, events out through outputs, no data access.

## Installation

```bash
npm install @memberjunction/ng-charts
```

## Usage

The components are standalone. Import them into a standalone component or list them in an NgModule's `imports`.

### Bar chart

```typescript
import { MJBarChartComponent, ChartSeries, ChartPointEvent } from '@memberjunction/ng-charts';

@Component({
    imports: [MJBarChartComponent],
    template: `
        <mj-bar-chart
            AriaLabel="Score bands by model"
            [Categories]="Models"
            [Series]="Bands"
            Orientation="horizontal"
            [Stacked]="true"
            (SegmentClick)="OnSegment($event)">
        </mj-bar-chart>
    `,
})
export class PortfolioOverview {
    Models = ['Churn v3', 'Renewal v1'];
    Bands: ChartSeries[] = [
        { Name: 'Healthy', Values: [120, 80], Color: 'var(--mj-status-success)' },
        { Name: 'Critical', Values: [4, 9], Color: 'var(--mj-status-error)' },
    ];
    OnSegment(e: ChartPointEvent): void { /* e.Category, e.SeriesName, e.Value (raw) */ }
}
```

`Orientation`: `vertical` (default) or `horizontal`. `Stacked` defaults to `false` (grouped).

### Donut chart

```html
<mj-donut-chart
    AriaLabel="Band distribution"
    [Slices]="[{ Label: 'Healthy', Value: 120, Color: 'var(--mj-status-success)' }, { Label: 'Critical', Value: 4, Color: 'var(--mj-status-error)' }]"
    CenterLabel="Scored"
    CenterValue="124"
    [ShowPercentLabels]="true"
    (SliceClick)="OnSlice($event)">
</mj-donut-chart>
```

```typescript
OnSlice(e: ChartSliceEvent): void { /* e.Label, e.Value (raw), e.Percent (0-100) */ }
```

`InnerRadiusRatio` defaults to `0.7`; `0` draws a pie. Values above `0.85` are clamped. `ShowPercentLabels` defaults to `false`. `SliceClick` emits a `ChartSliceEvent`.

### Area chart

```html
<mj-area-chart
    AriaLabel="Band mix over time"
    [Categories]="Weeks"
    [Series]="Bands"
    StackMode="percent"
    Curve="smooth"
    (PointClick)="OnPoint($event)">
</mj-area-chart>
```

```typescript
OnPoint(e: ChartPointEvent): void { /* e.Category, e.SeriesName, e.Value (raw), e.Percent */ }
```

`StackMode`: `none` (default), `stacked`, `percent`. `Curve`: `smooth` (default; monotone — never overshoots 0–100%) or `linear`. `FillOpacity` defaults to `0.85` and is clamped to 0–1. `PointClick` emits a `ChartPointEvent`.

## Inputs shared by all charts

| Input | Default | Notes |
|---|---|---|
| `AriaLabel` | — | Required. Names the chart for screen readers; missing is logged. |
| `Height` | `300` | Outer height in px, including legend and axes, or `'fill'` (see Sizing). Minimum `120`. Width follows the container. |
| `AspectRatio` | — | Width ÷ height, e.g. `16 / 9`. When set it wins over `Height` (see Sizing). |
| `ShowLegend` | `true` | Wraps to two rows, then "+N more". |
| `ShowTooltip` | `true` | Hides only the visual tooltip; keyboard focus still announces values. |
| `ValueFormatter` | `toLocaleString()` | Receives raw values. Percent axes are formatted by the chart. |
| `EmptyMessage` | `'No data'` | Shown when there is nothing to draw. |

`mj-bar-chart` and `mj-area-chart` also take `ShowGridlines` (default `true`). `false` removes the gridlines and keeps the axis labels. Toggling it, `Height` or `AspectRatio` at runtime re-lays the chart out without a resize.

Optional inputs that are `null` or `undefined` (`Height`, `AspectRatio`, `ShowGridlines`, `FillOpacity`, `InnerRadiusRatio`, `StackMode`, `Curve`, `Orientation`, `Stacked`, `ShowPercentLabels`) silently fall back to their defaults, so a binding to a not-yet-loaded value is safe. Only a real out-of-range number is clamped to the nearest limit and logged once.

## Sizing

Width always follows the container. Height comes from, in order of precedence (on every path the resolved height is never below `120px`):

1. `AspectRatio`: the height is `width ÷ AspectRatio`, so the chart keeps its shape as the container resizes. A smaller ratio is taller for the same width: `[AspectRatio]="4 / 3"` is taller than `[AspectRatio]="16 / 9"`. Values are clamped to `0.25`-`8` and logged once; a non-finite or non-positive value, or a string attribute (`AspectRatio="1.5"`), is logged once and ignored. Bind a number: `[AspectRatio]="16 / 9"`, not a string attribute.
2. `Height="fill"`: the chart takes its parent's height. **The parent needs a definite height** (a fixed height, a flex or grid track with a size, or `height: 100%` all the way up). Without one the chart falls back to `300px` and logs a hint once.
3. `[Height]="240"`: a fixed px height. The minimum is `120`; smaller values are clamped and logged.

```html
<mj-bar-chart AriaLabel="Score bands" [Categories]="Models" [Series]="Bands" [AspectRatio]="4 / 3"></mj-bar-chart>

<div style="height: 360px">
    <mj-donut-chart AriaLabel="Band distribution" [Slices]="Slices" Height="fill"></mj-donut-chart>
</div>
```

A chart with `AspectRatio` inside a scrolling page changes height when its width changes, and a scrollbar appearing or disappearing changes the width. Add `scrollbar-gutter: stable` to the scroll container so the scrollbar never changes the width; the chart also damps a quick back-and-forth between two widths, but a stable gutter avoids it entirely.

Text sizing is host-driven: the chart reads the font size it computes from `--mj-chart-font-size` (default `--mj-text-xs`, `0.75rem`), and axes, legend rows, donut labels and the plot box all scale with it.

## Styling variables

Every variable is optional; set it on the chart, a wrapper or an ancestor to restyle that subtree. Charts re-color through CSS only, with no re-render.

| Variable | Default | Styles |
|---|---|---|
| `--mj-chart-font-size` | `var(--mj-text-xs, 0.75rem)` | Axis labels, legend, donut labels, tooltip text; the donut center value is `1.67×` this |
| `--mj-chart-grid-color` | `var(--mj-border-default)` | Gridlines |
| `--mj-chart-axis-color` | `var(--mj-text-muted)` | Axis labels and empty/invalid state text |
| `--mj-chart-label-color` | `var(--mj-text-secondary)` | Donut center label and percent labels |
| `--mj-chart-value-color` | `var(--mj-text-primary)` | Donut center value |
| `--mj-chart-legend-color` | `var(--mj-text-secondary)` | Legend text, including the "+N more" entry (slightly dimmed) |
| `--mj-chart-tooltip-bg` | `var(--mj-bg-surface-elevated)` | Tooltip background |
| `--mj-chart-tooltip-color` | `var(--mj-text-primary)` | Tooltip text (rows for inactive series are dimmed) |
| `--mj-chart-tooltip-border` | `var(--mj-border-default)` | Tooltip border |

Two caveats:

- **The tooltip renders in a CDK overlay outside the chart**, so `--mj-chart-tooltip-*` (and the tooltip's use of `--mj-chart-font-size`) apply only when set on an ancestor of the overlay container, that is `:root` or `body`. Setting them on the chart or a wrapper restyles everything except the tooltip.
- A runtime change to the font size with no change to the chart's box takes effect at the next resize or input change; the chart does not watch computed styles.

## Line chart

For a line chart, use `mj-area-chart` with `[FillOpacity]="0"`: the series lines are still drawn and the fills are transparent.

```html
<mj-area-chart AriaLabel="Weekly scores" [Categories]="Weeks" [Series]="Scores" [FillOpacity]="0"></mj-area-chart>
```

## Colors

`Color` must be a CSS custom-property reference: `var(--token-name)`. MemberJunction tokens are the expected source. Any other value (hex, a named color, `--token` without `var()`) is logged once and replaced by the series' default, `var(--mj-viz-N)`. For series with meaning, use the status tokens (`--mj-status-success`, `--mj-status-info`, `--mj-status-warning`, `--mj-status-error`); for arbitrary series, leave `Color` unset.

The host page must define these custom properties (every MJ host does): `--mj-viz-1` … `--mj-viz-10`, `--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted`, `--mj-border-default`, `--mj-bg-surface-elevated`, `--mj-focus-ring-color`, `--mj-radius-sm`, `--mj-radius-md`, `--mj-shadow-md`, plus any status tokens you pass.

## Data rules

| Case | Bar | Area `none` | Area `stacked` / `percent` | Donut |
|---|---|---|---|---|
| No categories / series / slices | empty state | empty state | empty state | empty state |
| `Values.length` ≠ `Categories.length` | invalid state + logged | invalid | invalid | — |
| All values `0` | axes + baseline | flat at 0 | flat at 0 | empty state |
| `null`, `NaN`, `±Infinity` | no bar; "—" in tooltip/table | gap in the line | counted as 0, drawn continuous | slice skipped |
| Negative values | grouped: below 0; stacked: away from 0 | allowed | invalid + logged | slice excluded + logged |

**Inputs are snapshots.** Mutating an array in place does not update the chart — pass a new array.

Events carry the caller's raw value, except that non-finite values (`NaN`, `±Infinity`) are reported as `null`. In percent mode `ChartPointEvent.Percent` adds the 0–100 share.

## Size limits

Documented soft caps: bar ≤ 200 categories × 10 series; area ≤ 2,000 categories × 10 series; donut ≤ 50 slices. Above a cap the chart still renders and logs once; the screen-reader table lists the first 500 rows. Aggregate or decimate before charting.

## Pointer, touch and keyboard

- **Mouse / pen:** hover shows the tooltip; a click emits the click event.
- **Touch:** the first tap on a point shows its value, and a second tap on the same point emits the click event, so a chart wired to navigation never navigates on the first tap. Tapping empty space on the plot dismisses the value. Touch moves do not scrub the tooltip, so scrolling past a chart is safe.
- **Keyboard:** see Accessibility.

## Accessibility

Each chart is one tab stop (`role="group"`). Arrow keys move between values, Home/End jump to the ends, Enter/Space activates. Escape closes the tooltip — from anywhere on the page, for as long as the tooltip is open. A visually hidden data table carries every value for screen readers, up to the first 500 rows; the legend is text plus a swatch.
