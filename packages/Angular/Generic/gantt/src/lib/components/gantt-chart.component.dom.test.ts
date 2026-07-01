import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { MjGanttChartComponent } from './gantt-chart.component';

/**
 * DOM-level tests for MjGanttChartComponent.
 *
 * This component wraps DHTMLX Gantt, which it loads via a dynamic `import('dhtmlx-gantt')`
 * in `ngAfterViewInit`. The Gantt library renders into a real DOM canvas / measures layout,
 * which jsdom cannot honestly run — so the actual chart rendering, drag/resize, and the
 * `ItemClicked` / `ItemChanged` outputs (which are wired through DHTMLX's own event system)
 * are NOT unit-testable here and belong to a live/e2e test.
 *
 * What IS honestly testable is the component's OWN template surface, which renders
 * synchronously before the dynamic import resolves:
 *   - the `@if (loading)` loading placeholder
 *   - the `[style.height]` binding on the container
 *   - the `[style.display]` toggle driven by `loading`
 *
 * We assert immediately after the first `detectChanges()`, i.e. before the async
 * `import()` microtask flips `loading` to false — so these checks are deterministic
 * regardless of whether `dhtmlx-gantt` resolves in the jsdom environment.
 */
describe('MjGanttChartComponent (DOM)', () => {
  it('renders the loading placeholder while the chart library loads', () => {
    const fixture = renderComponentFixture(MjGanttChartComponent);

    const loading = query(fixture, '.mj-gantt-loading');
    expect(loading).not.toBeNull();
    expect(text(fixture, '.mj-gantt-loading')).toBe('Loading Gantt chart...');
  });

  it('always renders the container element', () => {
    const fixture = renderComponentFixture(MjGanttChartComponent);

    expect(query(fixture, '.mj-gantt-container')).not.toBeNull();
  });

  it('hides the container (display:none) while loading', () => {
    const fixture = renderComponentFixture(MjGanttChartComponent);

    const container = query(fixture, '.mj-gantt-container') as HTMLElement;
    expect(container.style.display).toBe('none');
  });

  it('applies the default Height to the container', () => {
    const fixture = renderComponentFixture(MjGanttChartComponent);

    const container = query(fixture, '.mj-gantt-container') as HTMLElement;
    expect(container.style.height).toBe('500px');
  });

  it('applies a custom Height input to the container', () => {
    const fixture = renderComponentFixture(MjGanttChartComponent, {
      inputs: { Height: '750px' },
    });

    const container = query(fixture, '.mj-gantt-container') as HTMLElement;
    expect(container.style.height).toBe('750px');
  });
});
