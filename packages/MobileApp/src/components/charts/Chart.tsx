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
