import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, hasClass, capture, click } from '@memberjunction/ng-test-utils';
import { FlowToolbarComponent } from './flow-toolbar.component';

/**
 * DOM tests for FlowToolbarComponent — a module-declared (`standalone: false`) leaf with
 * pure primitive @Inputs and void/boolean @Outputs. Verifies the template contract:
 * the {{ZoomLevel}} binding, the @if(!ReadOnly) gating of the auto-layout group, the
 * [class.--active] conditional classes, and the (click)->emit wiring on each button.
 */
describe('FlowToolbarComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}) {
    return renderComponentFixture(FlowToolbarComponent, {
      declarations: [FlowToolbarComponent],
      inputs,
    });
  }

  it('renders the zoom level binding as a percentage', () => {
    const fixture = render({ ZoomLevel: 75 });
    expect(text(fixture, '.mj-flow-toolbar-zoom')).toBe('75%');
  });

  it('shows the auto-layout (Auto Arrange) button when not read-only', () => {
    const fixture = render({ ReadOnly: false });
    expect(query(fixture, 'button[title="Auto Arrange"]')).not.toBeNull();
  });

  it('hides the auto-layout button when read-only', () => {
    const fixture = render({ ReadOnly: true });
    expect(query(fixture, 'button[title="Auto Arrange"]')).toBeNull();
  });

  it('marks the Select-mode button active when PanMode is false', () => {
    const fixture = render({ PanMode: false });
    expect(hasClass(fixture, 'button[title="Select Mode (pointer)"]', 'mj-flow-toolbar-btn--active')).toBe(true);
    expect(hasClass(fixture, 'button[title="Pan Mode (drag to move canvas)"]', 'mj-flow-toolbar-btn--active')).toBe(false);
  });

  it('marks the Pan-mode button active when PanMode is true', () => {
    const fixture = render({ PanMode: true });
    expect(hasClass(fixture, 'button[title="Pan Mode (drag to move canvas)"]', 'mj-flow-toolbar-btn--active')).toBe(true);
    expect(hasClass(fixture, 'button[title="Select Mode (pointer)"]', 'mj-flow-toolbar-btn--active')).toBe(false);
  });

  it('reflects ShowGrid / ShowMinimap / ShowLegend on their toggle buttons', () => {
    const fixture = render({ ShowGrid: true, ShowMinimap: false, ShowLegend: true });
    expect(hasClass(fixture, 'button[title="Toggle Grid"]', 'mj-flow-toolbar-btn--active')).toBe(true);
    expect(hasClass(fixture, 'button[title="Toggle Minimap"]', 'mj-flow-toolbar-btn--active')).toBe(false);
    expect(hasClass(fixture, 'button[title="Toggle Legend"]', 'mj-flow-toolbar-btn--active')).toBe(true);
  });

  it('emits ZoomInClicked / ZoomOutClicked / FitToScreenClicked on click', () => {
    const fixture = render();
    const zoomIn = capture(fixture.componentInstance.ZoomInClicked);
    const zoomOut = capture(fixture.componentInstance.ZoomOutClicked);
    const fit = capture(fixture.componentInstance.FitToScreenClicked);

    click(fixture, 'button[title="Zoom In"]');
    click(fixture, 'button[title="Zoom Out"]');
    click(fixture, 'button[title="Fit to Screen"]');

    expect(zoomIn.length).toBe(1);
    expect(zoomOut.length).toBe(1);
    expect(fit.length).toBe(1);
  });

  it('emits PanModeToggled with the target mode on click', () => {
    const fixture = render({ PanMode: false });
    const events = capture(fixture.componentInstance.PanModeToggled);

    click(fixture, 'button[title="Pan Mode (drag to move canvas)"]');
    click(fixture, 'button[title="Select Mode (pointer)"]');

    expect(events).toEqual([true, false]);
  });

  it('emits Grid/Minimap/Legend toggles with the inverted current value', () => {
    const fixture = render({ ShowGrid: true, ShowMinimap: false, ShowLegend: true });
    const grid = capture(fixture.componentInstance.GridToggled);
    const minimap = capture(fixture.componentInstance.MinimapToggled);
    const legend = capture(fixture.componentInstance.LegendToggled);

    click(fixture, 'button[title="Toggle Grid"]');
    click(fixture, 'button[title="Toggle Minimap"]');
    click(fixture, 'button[title="Toggle Legend"]');

    expect(grid).toEqual([false]);
    expect(minimap).toEqual([true]);
    expect(legend).toEqual([false]);
  });

  it('emits AutoLayoutClicked when the auto-layout button is clicked', () => {
    const fixture = render({ ReadOnly: false });
    const events = capture(fixture.componentInstance.AutoLayoutClicked);
    click(fixture, 'button[title="Auto Arrange"]');
    expect(events.length).toBe(1);
  });

  it('renders 3 dividers when editable (zoom | mode | auto-layout | view groups)', () => {
    const fixture = render({ ReadOnly: false });
    expect(queryAll(fixture, '.mj-flow-toolbar-divider').length).toBe(3);
  });

  it('renders 2 dividers when read-only (the auto-layout divider is gated out)', () => {
    const fixture = render({ ReadOnly: true });
    expect(queryAll(fixture, '.mj-flow-toolbar-divider').length).toBe(2);
  });
});
