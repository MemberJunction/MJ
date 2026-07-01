import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { FlowStatusBarComponent } from './flow-status-bar.component';

/**
 * DOM tests for FlowStatusBarComponent — a display-only module-declared leaf. Verifies the
 * template contract: the count bindings, the singular/plural ternary for node/connection
 * labels, the @if(SelectedCount > 0) gating of the "selected" item, and the zoom binding.
 */
describe('FlowStatusBarComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}) {
    return renderComponentFixture(FlowStatusBarComponent, {
      declarations: [FlowStatusBarComponent],
      inputs,
    });
  }

  it('uses singular labels for counts of 1', () => {
    const fixture = render({ NodeCount: 1, ConnectionCount: 1 });
    const items = queryAll(fixture, '.mj-flow-status-item').map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(items[0]).toBe('1 node');
    expect(items[1]).toBe('1 connection');
  });

  it('uses plural labels for counts other than 1', () => {
    const fixture = render({ NodeCount: 3, ConnectionCount: 0 });
    const items = queryAll(fixture, '.mj-flow-status-item').map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(items[0]).toBe('3 nodes');
    expect(items[1]).toBe('0 connections');
  });

  it('hides the selected-count item when SelectedCount is 0', () => {
    const fixture = render({ SelectedCount: 0 });
    const items = queryAll(fixture, '.mj-flow-status-item').map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(items.some((t) => t.includes('selected'))).toBe(false);
  });

  it('shows the selected-count item when SelectedCount is greater than 0', () => {
    const fixture = render({ SelectedCount: 2 });
    const items = queryAll(fixture, '.mj-flow-status-item').map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(items.some((t) => t === '2 selected')).toBe(true);
  });

  it('renders the zoom level in the right-aligned item', () => {
    const fixture = render({ ZoomLevel: 150 });
    expect(text(fixture, '.mj-flow-status-item--right')).toBe('150%');
  });

  it('always renders the right-aligned zoom item', () => {
    const fixture = render();
    expect(query(fixture, '.mj-flow-status-item--right')).not.toBeNull();
  });
});
