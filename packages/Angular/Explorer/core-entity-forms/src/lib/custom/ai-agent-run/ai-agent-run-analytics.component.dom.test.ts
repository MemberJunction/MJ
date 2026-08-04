import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { AIAgentRunAnalyticsComponent } from './ai-agent-run-analytics.component';
import { AIAgentRunCostService } from './ai-agent-run-cost.service';

/**
 * DOM coverage for <mj-ai-agent-run-analytics> — the per-run metrics dashboard. Data loading (RunView
 * + d3 charting) only runs when `agentRunId` is set; we render WITHOUT it so ngOnInit is a no-op and
 * no backend / d3 / chart ViewChilds are exercised. That leaves the top-level state gate testable:
 * `isLoading` (default true) → spinner, error → empty-state, loaded → content. We stub the injected
 * cost service (never called on these paths) and the heavy `mj-empty-state` child.
 */

@Component({ standalone: true, selector: 'mj-empty-state', template: '<ng-content></ng-content>' })
class EmptyStateStub {
  @Input() Variant = '';
  @Input() Message = '';
  @Input() ActionText = '';
  @Input() ActionIcon = '';
  @Output() Action = new EventEmitter<void>();
}

const render = (setup?: (i: AIAgentRunAnalyticsComponent) => void) =>
  renderComponentFixture(AIAgentRunAnalyticsComponent, {
    imports: [EmptyStateStub],
    declarations: [AIAgentRunAnalyticsComponent],
    providers: [{ provide: AIAgentRunCostService, useValue: {} }],
    setup,
    autoDetect: true,
  });

describe('AIAgentRunAnalyticsComponent (DOM)', () => {
  it('shows the loading state by default (no agentRunId provided)', () => {
    const fixture = render();
    expect(query(fixture, '.loading-state')).not.toBeNull();
    expect(text(fixture, '.loading-state p')).toContain('Loading analytics data');
  });

  it('does not render the analytics content while loading', () => {
    expect(query(render(), '.analytics-content')).toBeNull();
  });

  it('shows an error empty-state when an error is set and loading has finished', () => {
    const fixture = render((i) => {
      i.isLoading = false;
      i.error = 'Boom';
    });
    expect(query(fixture, '.loading-state')).toBeNull();
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('shows neither the error empty-state nor the content while still loading', () => {
    const fixture = render();
    expect(query(fixture, 'mj-empty-state')).toBeNull();
    expect(query(fixture, '.analytics-content')).toBeNull();
    // The loading state uses a spinning icon.
    expect(query(fixture, '.loading-state .fa-spin')).not.toBeNull();
  });
});
