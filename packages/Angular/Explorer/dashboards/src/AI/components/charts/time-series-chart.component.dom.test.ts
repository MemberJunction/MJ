import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { TimeSeriesChartComponent } from './time-series-chart.component';
import type { TrendData } from '../../services/ai-instrumentation.service';

/**
 * DOM coverage for <app-time-series-chart> (module-declared, d3). The chart body (lines/dots/axes)
 * is drawn imperatively into the SVG by d3 and needs a measured container size jsdom can't provide,
 * so we DON'T assert chart pixels. What IS Angular-template-driven is the header: it only renders
 * when a `title` is set, and within it the legend (`@for` over visibleMetrics, gated by showLegend)
 * with a color swatch + label per metric that toggles a disabled class when a metric is hidden.
 * The SVG host itself always renders. Pure @Input; toggling a metric goes through a click event.
 */

const trend = (over: Partial<TrendData> = {}): TrendData =>
  ({ timestamp: new Date(), executions: 1, cost: 0.1, tokens: 10, avgTime: 100, errors: 0, ...over }) as TrendData;

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(TimeSeriesChartComponent, {
    declarations: [TimeSeriesChartComponent],
    inputs: { data: [trend()], showLegend: true, ...inputs },
  });

describe('TimeSeriesChartComponent (DOM)', () => {
  it('always renders the chart svg host', () => {
    const fixture = render({});
    expect(query(fixture, '.chart-container svg')).not.toBeNull();
  });

  it('hides the header entirely when no title is supplied', () => {
    const fixture = render({ title: undefined });
    expect(query(fixture, '.chart-header')).toBeNull();
  });

  it('renders the title in the header when supplied', () => {
    const fixture = render({ title: 'Executions Over Time' });
    expect(text(fixture, '.chart-title')).toBe('Executions Over Time');
  });

  it('renders one legend item per visible metric (with a color swatch and label)', () => {
    const fixture = render({ title: 'T' });
    const items = queryAll(fixture, '.legend-item');
    expect(items.length).toBe(fixture.componentInstance.visibleMetrics.length);
    expect(queryAll(fixture, '.legend-color').length).toBe(items.length);
    expect(text(fixture, '.legend-item .legend-label')).toBe('Executions');
  });

  it('omits the legend when showLegend is false', () => {
    const fixture = render({ title: 'T', showLegend: false });
    expect(query(fixture, '.chart-legend')).toBeNull();
  });

  it('marks a metric legend item disabled after it is toggled off via click', () => {
    const fixture = render({ title: 'T' });
    (queryAll(fixture, '.legend-item')[0] as HTMLElement).click();
    fixture.detectChanges(false);
    expect(query(fixture, '.legend-item.legend-item--disabled')).not.toBeNull();
  });
});
