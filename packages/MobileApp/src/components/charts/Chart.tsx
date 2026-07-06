/**
 * Chart dispatcher — the single entry point callers use to render a chart.
 *
 * Takes a normalized {@link ChartSpec} (from `./chart-spec`) and routes to the
 * concrete SVG chart component (`BarChart` / `LineChart` / `PieChart`) based on
 * `spec.kind`. Every chart is drawn with `react-native-svg`; this module itself
 * renders no SVG — it only selects the right component.
 */
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { PieChart } from './PieChart';
import type { ChartSpec } from './chart-spec';

/** Props for {@link Chart}. */
export type ChartProps = {
    /** Normalized chart description (kind + data). */
    spec: ChartSpec;
    /** Available container width in px. */
    width: number;
};

/**
 * Dispatcher that renders the appropriate SVG chart for a {@link ChartSpec}.
 * Keeps callers (artifact + dashboard renderers) agnostic of the concrete
 * chart component — they just hand over a parsed spec and a width.
 *
 * Routing on `spec.kind`: `'line'` → {@link LineChart}, `'pie'` → {@link PieChart},
 * `'bar'` (and any unrecognized kind, via the `default` case) → {@link BarChart}.
 * `spec.data` and `spec.title` are forwarded to the chosen component unchanged.
 *
 * @param props See {@link ChartProps} — the spec and container width.
 * @returns The selected react-native-svg chart element.
 */
export function Chart({ spec, width }: ChartProps) {
    switch (spec.kind) {
        case 'line':
            return <LineChart data={spec.data} width={width} title={spec.title} />;
        case 'pie':
            return <PieChart data={spec.data} width={width} title={spec.title} />;
        case 'bar':
        default:
            return <BarChart data={spec.data} width={width} title={spec.title} />;
    }
}
