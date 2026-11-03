import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { IMetadataProvider } from '@memberjunction/core';
import { WidgetFixtures } from './evaluation-results/widget-fixtures';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { ExperimentSessions, type GateDecision, type GateReasonCode } from '@memberjunction/predictive-studio-core';
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

describe('PSExperimentsComponent (DOM) — ViewResultsArtifact payload', () => {
  interface ArtifactPayload {
    Summary: string;
    GateOutcome: string | null;
    GateReason: string | null;
    Leaderboard: Array<{ isWinner: boolean }>;
    BestModel?: { ID: string; Name: string };
  }

  /** Runs ViewResultsArtifact on a one-iteration completed session whose top run stores `validationResults`; returns the saved payload. */
  async function payloadFor(validationResults: string | null): Promise<ArtifactPayload> {
    const row: Row = { ID: 'it-a', ExperimentSessionID: 's1', Sequence: 1, Label: null, Status: 'Completed', Score: 0.3, ComputeCost: null, TokensUsed: null, Rationale: null, AlgorithmName: 'XGBoost' };
    const Leaderboard = JSON.stringify([{ IterationID: 'it-a', Metric: -0.3, ScoreMetric: 'log-loss', OnSuccessMetric: true }]);
    const engine = {
      Sessions: [{ ID: 's1', Name: 'Run', Status: 'Completed', Budget: null, Leaderboard, PlanSpec: null }],
      IterationRowsForSession: () => [row],
      IterationsForSession: () => [{ ID: 'it-a' }],
      TrainingRuns: [{ ExperimentSessionIterationID: 'it-a', ResultingModelID: 'model-1', ValidationResults: validationResults }],
    } as unknown as PredictiveStudioEngine;
    let saved = '';
    const entity = (): { Save: () => Promise<boolean>; Content?: string } => ({
      Save: async () => true,
      set Content(value: string) { saved = value; },
    });
    const provider = {
      RunView: async () => ({ Success: true, Results: [] }),
      GetEntityObject: async () => entity(),
    } as unknown as IMetadataProvider;
    const fixture = renderComponentFixture(PSExperimentsComponent, { inputs: { engine, provider } });
    await fixture.componentInstance.ViewResultsArtifact();
    return JSON.parse(saved) as ArtifactPayload;
  }

  const gateDecisions: Record<'model' | 'no-signal', GateDecision> = {
    model: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
    'no-signal': { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
  };
  const reasonCodes: Record<'model' | 'no-signal', GateReasonCode> = { model: 'model-beats-best-simple', 'no-signal': 'nothing-beats-dummy' };
  /** A stored run envelope whose gate record decided `outcome`. */
  const gateOutcome = (outcome: 'model' | 'no-signal'): string => {
    const gate = WidgetFixtures.StoredRunEnvelope().gate;
    if (gate === null) throw new Error('the fixture stores no gate');
    return WidgetFixtures.StoredRunJson({ gate: { ...gate, decision: gateDecisions[outcome], reason: { code: reasonCodes[outcome], text: `The gate decided ${outcome}.` } } });
  };

  it('names no winner when the stored gate kept a simple baseline', async () => {
    const p = await payloadFor(WidgetFixtures.StoredRunJson());
    expect(p.GateOutcome).toBe('keep-simple-baseline');
    expect(p.GateReason).toBeTruthy();
    expect(p.Summary).not.toContain('Winning');
    expect(p.Summary).toContain('The gate kept a simple baseline: The simple baseline glm beats');
    expect(p.Summary).not.toContain('..');
    expect(p.Leaderboard[0].isWinner).toBe(false);
    expect(p.BestModel?.Name).toBe('Kept simple baseline');
  });

  it('names no winner when the stored gate found no signal', async () => {
    const p = await payloadFor(gateOutcome('no-signal'));
    expect(p.GateOutcome).toBe('no-signal');
    expect(p.GateReason).toBeTruthy();
    expect(p.Summary).not.toContain('Winning');
    expect(p.Summary).toContain('No model shipped:');
    expect(p.Leaderboard[0].isWinner).toBe(false);
    expect(p.BestModel).toBeUndefined();
  });

  it('reads as not evaluated for a legacy run with no stored gate record', async () => {
    const p = await payloadFor(null);
    expect(p.GateOutcome).toBeNull();
    expect(p.GateReason).toBeNull();
    expect(p.Summary).toContain('Not evaluated');
    expect(p.Summary).not.toContain('Winning');
    expect(p.Leaderboard[0].isWinner).toBe(false);
    expect(p.BestModel).toBeUndefined();
  });

  it('crowns the leaderboard winner only when the stored gate shipped the model', async () => {
    const p = await payloadFor(gateOutcome('model'));
    expect(p.GateOutcome).toBe('model');
    expect(p.Summary).toContain('Winning algorithm: XGBoost.');
    expect(p.Leaderboard[0].isWinner).toBe(true);
    expect(p.BestModel?.Name).toBe('XGBoost');
  });
});
