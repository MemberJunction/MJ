import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { LiveExecutionWidgetComponent } from './live-execution-widget.component';
import type { LiveExecution } from '../../services/ai-instrumentation.service';

/**
 * DOM coverage for <app-live-execution-widget> (module-declared) — a live list of agent/prompt
 * executions. Renders one item per execution (capped at maxVisible), an active-count badge that
 * pulses when any are running, a status-modifier class per row, an empty-state when the list is
 * empty, and a "show all" affordance when the list overflows maxVisible. Clicking an item emits
 * executionClick. Pure @Input, no DI/async → single synchronous render; the click is a real event.
 */

const exec = (over: Partial<LiveExecution> = {}): LiveExecution =>
  ({ id: 'e1', type: 'agent', name: 'Run A', status: 'running', startTime: new Date(), ...over }) as LiveExecution;

const render = (executions: LiveExecution[], maxVisible = 8) =>
  renderComponentFixture(LiveExecutionWidgetComponent, {
    declarations: [LiveExecutionWidgetComponent],
    inputs: { executions, maxVisible },
  });

describe('LiveExecutionWidgetComponent (DOM)', () => {
  it('shows the empty-state (no items) when there are no executions', () => {
    const fixture = render([]);
    expect(query(fixture, '.no-executions')).not.toBeNull();
    expect(queryAll(fixture, '.execution-item').length).toBe(0);
  });

  it('renders one item per execution with its name', () => {
    const fixture = render([exec({ id: 'a', name: 'Alpha' }), exec({ id: 'b', name: 'Beta', status: 'completed' })]);
    const items = queryAll(fixture, '.execution-item');
    expect(items.length).toBe(2);
    expect(text(fixture, '.execution-item .execution-name')).toBe('Alpha');
  });

  it('reflects the running-count in the active badge (and pulses)', () => {
    const fixture = render([exec({ id: 'a', status: 'running' }), exec({ id: 'b', status: 'running' }), exec({ id: 'c', status: 'completed' })]);
    expect(text(fixture, '.active-count')).toContain('2 active');
    expect(query(fixture, '.active-count.pulsing')).not.toBeNull();
  });

  it('applies a status-specific modifier class per execution item', () => {
    const fixture = render([exec({ id: 'a', status: 'failed' })]);
    expect(query(fixture, '.execution-item.execution-item--failed')).not.toBeNull();
  });

  it('caps visible items at maxVisible and offers a show-all toggle when overflowing', () => {
    const many = Array.from({ length: 5 }, (_, i) => exec({ id: `x${i}`, name: `X${i}` }));
    const fixture = render(many, 2);
    expect(queryAll(fixture, '.execution-item').length).toBe(2);
    expect(text(fixture, '.show-more-btn')).toContain('Show All (5)');
  });

  it('emits executionClick with the clicked execution', () => {
    const fixture = render([exec({ id: 'clicked', name: 'Target' })]);
    const clicks = capture(fixture.componentInstance.executionClick);
    (query(fixture, '.execution-item') as HTMLElement).click();
    expect(clicks.length).toBe(1);
    expect(clicks[0].id).toBe('clicked');
  });
});
