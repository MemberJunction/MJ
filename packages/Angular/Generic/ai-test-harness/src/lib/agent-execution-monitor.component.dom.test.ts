import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, queryAll } from '@memberjunction/ng-test-utils';
import { AgentExecutionMonitorComponent } from './agent-execution-monitor.component';

/**
 * DOM-level spec for <mj-agent-execution-monitor> — the presentational surface only:
 * header (LIVE indicator / current-step), empty state, the stats footer, the step-type
 * badges, and the "View Run" button + its @Output.
 *
 * The execution TREE itself is rendered by imperatively creating child ExecutionNode
 * components into a #executionNodesContainer ViewContainerRef from inside ngOnChanges'
 * data-processing path. That path needs entity-shaped data and View refs — out of scope
 * for a unit test — so we deliberately do NOT drive `agentRun`/`liveSteps` via setInput
 * (which would fire ngOnChanges → processing). Internal state (`stats`, `currentStep`,
 * `agentRun`) is set via `setup` BEFORE the first detectChanges (zoneless §5 safe) so the
 * footer/header bindings render without invoking the tree builder.
 */

type Stats = AgentExecutionMonitorComponent['stats'];

const makeStats = (overrides: Partial<Stats> = {}): Stats => ({
  totalSteps: 0,
  completedSteps: 0,
  failedSteps: 0,
  totalTokens: 0,
  totalCost: 0,
  stepsByType: {},
  totalPrompts: 0,
  ...overrides,
});

describe('AgentExecutionMonitorComponent (DOM)', () => {
  it('shows the empty state when there is no run and no live steps', () => {
    const f = renderComponentFixture(AgentExecutionMonitorComponent, { inputs: { mode: 'live' } });
    const empty = query(f, '.empty-state');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('Waiting for execution to begin');
  });

  it('renders the LIVE indicator only in live mode', () => {
    const live = renderComponentFixture(AgentExecutionMonitorComponent, { inputs: { mode: 'live' } });
    expect(query(live, '.live-indicator')).not.toBeNull();
    expect(query(live, '.execution-monitor.live-mode')).not.toBeNull();

    const historical = renderComponentFixture(AgentExecutionMonitorComponent, { inputs: { mode: 'historical' } });
    expect(query(historical, '.live-indicator')).toBeNull();
  });

  it('shows the current-step name in live mode when a currentStep is set', () => {
    const f = renderComponentFixture(AgentExecutionMonitorComponent, {
      inputs: { mode: 'live' },
      setup: (c) => {
        c.currentStep = { StepName: 'Calling sub-agent' } as AgentExecutionMonitorComponent['currentStep'];
      },
    });
    expect(text(f, '.current-status .step-name')).toBe('Calling sub-agent');
  });

  it('renders the stats footer values from the stats object', () => {
    const f = renderComponentFixture(AgentExecutionMonitorComponent, {
      inputs: { mode: 'historical' },
      setup: (c) => {
        c.stats = makeStats({
          totalSteps: 5,
          completedSteps: 4,
          failedSteps: 1,
          totalPrompts: 3,
          totalTokens: 12345,
          totalCost: 0.1234,
        });
      },
    });
    const values = queryAll(f, '.stats-grid .stat-value').map((e) => (e.textContent ?? '').trim());
    const joined = values.join(' || ');
    expect(joined).toContain('4/5');
    expect(joined).toContain('(1 failed)');
    expect(joined).toContain('3'); // prompts
    expect(joined).toContain('12,345'); // tokens (toLocaleString)
    expect(joined).toContain('0.1234'); // cost
  });

  it('renders the duration stat only when stats.totalDuration is set', () => {
    const without = renderComponentFixture(AgentExecutionMonitorComponent, {
      inputs: { mode: 'historical' },
      setup: (c) => {
        c.stats = makeStats();
      },
    });
    expect(without.nativeElement.textContent).not.toContain('Duration');

    const withDur = renderComponentFixture(AgentExecutionMonitorComponent, {
      inputs: { mode: 'historical' },
      setup: (c) => {
        c.stats = makeStats({ totalDuration: 65000 });
      }, // 1m 5s
    });
    expect(withDur.nativeElement.textContent).toContain('Duration');
    const last = queryAll(withDur, '.stats-grid .stat-value').pop();
    expect(last?.textContent).toContain('1m 5s');
  });

  it('renders pluralized step-type badges from stats.stepsByType', () => {
    const f = renderComponentFixture(AgentExecutionMonitorComponent, {
      inputs: { mode: 'historical' },
      setup: (c) => {
        c.stats = makeStats({ stepsByType: { Prompt: 2, Validation: 1 } });
      },
    });
    const badges = queryAll(f, '.step-types .type-badge').map((b) => (b.textContent ?? '').trim());
    expect(badges).toContain('2 Prompts'); // count !== 1 → pluralized
    expect(badges).toContain('1 Validation'); // count === 1 → singular
  });

  // NOTE: the "View Run" button (gated on `mode==='historical' && agentRun &&
  // isExecutionComplete()`) is NOT DOM-tested here. The moment `agentRun` is truthy,
  // ngAfterViewInit → processAgentRun → calculateStats RECOMPUTES `stats` from
  // `agentRun.Steps` (overwriting any hand-set stats back to zero), so the only honest
  // way to satisfy `isExecutionComplete()` is to feed entity-shaped Steps through the
  // imperative tree-builder path — out of scope for a unit test. Deferred to a live/e2e
  // test. Its emission (onViewRunClick → viewRunClick) is covered by class-level specs.
});
