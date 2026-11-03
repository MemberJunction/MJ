import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { ExperimentSessions } from '@memberjunction/predictive-studio-core';
import { PSExperimentsComponent } from './ps-experiments.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-experiments> — the kanban + leaderboard for the active experiment session. The
 * engine is an @Input; a minimal fake supplies `Sessions` + `IterationRowsForSession`. The active
 * session is the first Running one (else most recent). Experiment sessions are switched off, so the
 * panel shows earlier sessions read-only with an unavailable notice and offers no start or control action.
 */

type Row = ReturnType<PredictiveStudioEngine['IterationRowsForSession']>[number];

const makeEngine = (sessions: Array<{ ID: string; Name: string; Status: string; Budget?: string | null; Leaderboard?: string | null; PlanSpec?: string | null }>, rows: Row[] = []) =>
  ({
    Sessions: sessions,
    IterationRowsForSession: () => rows,
  } as unknown as PredictiveStudioEngine);

const render = (engine: PredictiveStudioEngine) => renderComponentFixture(PSExperimentsComponent, { inputs: { engine } });

describe('PSExperimentsComponent (DOM)', () => {
  it('shows the empty state when there are no sessions', () => {
    const fixture = render(makeEngine([]));
    expect(query(fixture, '[data-testid="ps-experiments-empty"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-experiments-panel"]')?.textContent).toContain('No experiment sessions yet');
  });

  it('renders the session header + kanban columns for a running session', () => {
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Retention search', Status: 'Running', Budget: null }]));
    expect(query(fixture, '[data-testid="ps-experiments-empty"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Retention search');
    expect(query(fixture, '[data-testid="ps-kanban-col-running"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-kanban-col-completed"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-kanban-col-pruned"]')).not.toBeNull();
  });

  it('offers no New Experiment, Pause, Resume or Cancel while sessions are switched off', () => {
    for (const status of ['Running', 'Paused']) {
      const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: status, Budget: null }]));
      for (const id of ['ps-experiments-new-btn', 'ps-experiments-pause', 'ps-experiments-resume', 'ps-experiments-cancel']) {
        expect(query(fixture, `[data-testid="${id}"]`)).toBeNull();
      }
      expect(query(fixture, '[data-testid="ps-experiments-unavailable"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="ps-experiments-unavailable-reason"]')?.textContent?.trim()).toBe(ExperimentSessions.DisabledReason);
    }
  });

  it('explains why in the empty state and offers no New Experiment', () => {
    const fixture = render(makeEngine([]));
    expect(query(fixture, '[data-testid="ps-experiments-new-btn-empty"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-experiments-empty"]')?.textContent).toContain(ExperimentSessions.DisabledReason);
    expect(query(fixture, '[data-testid="ps-experiments-disabled-reason"]')?.textContent?.trim()).toBe(ExperimentSessions.DisabledReason);
  });

  it('shows the empty-leaderboard note when the session has no scored iterations', () => {
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Running', Budget: null }]));
    expect(query(fixture, '[data-testid="ps-experiments-leaderboard"]')?.textContent).toContain('No scored iterations yet');
  });

  it("labels each leaderboard pill with its own metric, a kept baseline's fallback score after every success-metric score", () => {
    const row = (ID: string, Score: number, AlgorithmName: string): Row =>
      ({ ID, ExperimentSessionID: 's1', Sequence: 1, Label: null, Status: 'Completed', Score, ComputeCost: null, TokensUsed: null, Rationale: null, AlgorithmName });
    const Leaderboard = JSON.stringify([
      { IterationID: 'it-a', Metric: -12.5, ScoreMetric: 'rmse', OnSuccessMetric: true },
      { IterationID: 'it-c', Metric: -0.3, ScoreMetric: 'log-loss', OnSuccessMetric: false },
    ]);
    const PlanSpec = JSON.stringify({ TargetDefinition: { SuccessMetric: 'RMSE' } });
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Completed', Budget: null, Leaderboard, PlanSpec }], [row('it-c', -0.3, 'GLM'), row('it-a', -12.5, 'XGBoost')]));
    const pills = queryAll(fixture, '[data-testid="ps-experiments-lp-score"]').map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim());
    expect(pills).toEqual(['12.500 rmse', '0.300 log-loss']);
  });
});
