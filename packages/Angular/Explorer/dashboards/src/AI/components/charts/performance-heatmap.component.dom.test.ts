import { describe, it, expect } from 'vitest';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { PerformanceHeatmapComponent } from './performance-heatmap.component';
import type { HeatmapData } from './performance-heatmap.component';

/**
 * DOM coverage for <app-performance-heatmap> (module-declared, d3, uses [(ngModel)] → FormsModule).
 * The heatmap grid cells/axes are drawn imperatively into the SVG by d3 and depend on a measured
 * container size jsdom can't provide, so we DON'T assert cell pixels. The Angular-template-driven
 * surface is the header (title with a default fallback), the metric <select>, the svg host, and the
 * legend title/labels which are functions of the selected metric. Pure @Input → single render.
 */

const cell = (over: Partial<HeatmapData> = {}): HeatmapData =>
  ({ agent: 'Sage', model: 'GPT', avgTime: 1000, successRate: 0.9, ...over }) as HeatmapData;

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(PerformanceHeatmapComponent, {
    imports: [FormsModule],
    declarations: [PerformanceHeatmapComponent],
    inputs: { data: [cell()], ...inputs },
  });

describe('PerformanceHeatmapComponent (DOM)', () => {
  it('renders the default title when none is supplied', () => {
    const fixture = render();
    expect(text(fixture, '.chart-title')).toBe('Agent vs Model Performance');
  });

  it('renders a supplied title', () => {
    const fixture = render({ title: 'Speed Grid' });
    expect(text(fixture, '.chart-title')).toBe('Speed Grid');
  });

  it('renders the metric selector with the three metric options', () => {
    const fixture = render();
    const options = Array.from((query(fixture, '.metric-selector select') as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['performance', 'avgTime', 'successRate']);
  });

  it('always renders the chart svg host', () => {
    const fixture = render();
    expect(query(fixture, '.chart-container svg')).not.toBeNull();
  });

  it('shows the performance-score legend title for the default metric', () => {
    const fixture = render();
    expect(text(fixture, '.legend-title')).toBe('Performance Score');
  });

  it('renders min and max legend labels', () => {
    const fixture = render();
    expect(query(fixture, '.legend-min')).not.toBeNull();
    expect(query(fixture, '.legend-max')).not.toBeNull();
  });
});
