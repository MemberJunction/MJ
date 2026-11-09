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

/** An engine double (Object.create(null) + assign, no cast) with the two members the panel reads. */
const makeEngine = (sessions: Array<{ ID: string; Name: string; Status: string; Budget?: string | null; Leaderboard?: string | null; PlanSpec?: string | null }>, rows: Row[] = []): PredictiveStudioEngine =>
  Object.assign(Object.create(null), {
    Sessions: sessions,
    IterationRowsForSession: () => rows,
  });

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
    const row = (ID: string, Score: number, AlgorithmName: string, Sequence: number): Row =>
      ({ ID, ExperimentSessionID: 's1', Sequence, Label: null, Status: 'Completed', Score, ComputeCost: null, TokensUsed: null, Rationale: null, AlgorithmName });
    const Leaderboard = JSON.stringify([
      { IterationID: 'it-a', Metric: -12.5, ScoreMetric: 'rmse', OnSuccessMetric: true },
      { IterationID: 'it-c', Metric: -0.3, ScoreMetric: 'log-loss', OnSuccessMetric: false },
    ]);
    const PlanSpec = JSON.stringify({ TargetDefinition: { SuccessMetric: 'RMSE' } });
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Completed', Budget: null, Leaderboard, PlanSpec }], [row('it-c', -0.3, 'GLM', 2), row('it-a', -12.5, 'XGBoost', 1)]));
    const pills = queryAll(fixture, '[data-testid="ps-experiments-lp-score"]').map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim());
    expect(pills).toEqual(['12.500 rmse', '0.300 log-loss']);
  });

  it('badges the top-ranked iteration "Top scorer", the label the compare panel gives it, never "Best"', () => {
    const row = (ID: string, AlgorithmName: string, Sequence: number): Row =>
      ({ ID, ExperimentSessionID: 's1', Sequence, Label: null, Status: 'Completed', Score: null, ComputeCost: null, TokensUsed: null, Rationale: null, AlgorithmName });
    const Leaderboard = JSON.stringify([
      { IterationID: 'it-a', Metric: -12.5, ScoreMetric: 'rmse', OnSuccessMetric: true },
      { IterationID: 'it-b', Metric: -13.5, ScoreMetric: 'rmse', OnSuccessMetric: true },
    ]);
    const PlanSpec = JSON.stringify({ TargetDefinition: { SuccessMetric: 'RMSE' } });
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Completed', Budget: null, Leaderboard, PlanSpec }], [row('it-a', 'XGBoost', 1), row('it-b', 'GLM', 2)]));
    const badges = queryAll(fixture, '[data-testid="ps-kanban-col-completed"] .icard .ps-badge').map((e) => (e.textContent || '').trim());
    expect(badges).toEqual(['Top scorer', 'Completed']);
    // The card reads the view-model's own (PascalCase) fields: the algorithm name and the top card's highlight render.
    expect(queryAll(fixture, '[data-testid="ps-kanban-col-completed"] .icard .nm').map((e) => e.textContent?.trim())).toEqual(['XGBoost', 'GLM']);
    expect(queryAll(fixture, '[data-testid="ps-kanban-col-completed"] .icard.best')).toHaveLength(1);
  });
});

describe('PSExperimentsComponent (DOM) — ViewResultsArtifact payload', () => {
  interface ArtifactPayload {
    Summary: string;
    GateOutcome: string | null;
    GateReason: string | null;
    Leaderboard: Array<{ isWinner: boolean }>;
    BestModelID?: string;
    BestModel?: { ID: string; Name: string };
    /** The artifact record's Description (not part of the version content). */
    ArtifactDescription: string;
  }

  /** Runs ViewResultsArtifact on a one-iteration completed session whose top run stores `validationResults`; returns the saved payload. */
  async function payloadFor(validationResults: string | null): Promise<ArtifactPayload> {
    const row: Row = { ID: 'it-a', ExperimentSessionID: 's1', Sequence: 1, Label: null, Status: 'Completed', Score: 0.3, ComputeCost: null, TokensUsed: null, Rationale: null, AlgorithmName: 'XGBoost' };
    const Leaderboard = JSON.stringify([{ IterationID: 'it-a', Metric: -0.3, ScoreMetric: 'log-loss', OnSuccessMetric: true }]);
    const engine: PredictiveStudioEngine = Object.assign(Object.create(null), {
      Sessions: [{ ID: 's1', Name: 'Run', Status: 'Completed', Budget: null, Leaderboard, PlanSpec: null }],
      IterationRowsForSession: () => [row],
      IterationsForSession: () => [{ ID: 'it-a' }],
      TrainingRuns: [{ ExperimentSessionIterationID: 'it-a', ResultingModelID: 'model-1', ValidationResults: validationResults }],
    });
    let saved = '';
    let described = '';
    const entity = (): { Save: () => Promise<boolean>; Content?: string; Description?: string } => ({
      Save: async () => true,
      set Content(value: string) { saved = value; },
      set Description(value: string) { described = value; },
    });
    const provider: IMetadataProvider = Object.assign(Object.create(null), {
      RunView: async () => ({ Success: true, Results: [] }),
      GetEntityObject: async () => entity(),
    });
    const fixture = renderComponentFixture(PSExperimentsComponent, { inputs: { engine, provider } });
    await fixture.componentInstance.ViewResultsArtifact();
    return { ...(JSON.parse(saved) as Omit<ArtifactPayload, 'ArtifactDescription'>), ArtifactDescription: described };
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

  it('describes the artifact record without a winning model, whatever the stored gate decided', async () => {
    for (const vr of [WidgetFixtures.StoredRunJson(), gateOutcome('no-signal'), null]) {
      const p = await payloadFor(vr);
      expect(p.ArtifactDescription).toBe('Modeling results and leaderboard for Run.');
    }
  });

  it('names no winner when the stored gate kept a simple baseline', async () => {
    const p = await payloadFor(WidgetFixtures.StoredRunJson());
    expect(p.GateOutcome).toBe('keep-simple-baseline');
    expect(p.GateReason).toBeTruthy();
    expect(p.Summary).not.toContain('Winning');
    expect(p.Summary).toContain('The gate kept a simple baseline: The simple baseline glm beats');
    expect(p.Summary).not.toContain('..');
    expect(p.Leaderboard[0].isWinner).toBe(false);
    expect(p.BestModel?.Name).toBe('Kept simple baseline');
    expect(p.BestModelID).toBe('model-1');
  });

  it('names no winner when the stored gate found no signal', async () => {
    const p = await payloadFor(gateOutcome('no-signal'));
    expect(p.GateOutcome).toBe('no-signal');
    expect(p.GateReason).toBeTruthy();
    expect(p.Summary).not.toContain('Winning');
    expect(p.Summary).toContain('No model shipped:');
    expect(p.Leaderboard[0].isWinner).toBe(false);
    expect(p.BestModel).toBeUndefined();
    expect(p.BestModelID).toBeUndefined();
  });

  it('reads as not evaluated for a legacy run with no stored gate record', async () => {
    const p = await payloadFor(null);
    expect(p.GateOutcome).toBeNull();
    expect(p.GateReason).toBeNull();
    expect(p.Summary).toContain('Not evaluated');
    expect(p.Summary).not.toContain('Winning');
    expect(p.Leaderboard[0].isWinner).toBe(false);
    expect(p.BestModel).toBeUndefined();
    expect(p.BestModelID).toBeUndefined();
  });

  it('crowns the leaderboard winner only when the stored gate shipped the model', async () => {
    const p = await payloadFor(gateOutcome('model'));
    expect(p.GateOutcome).toBe('model');
    expect(p.Summary).toContain('Winning algorithm: XGBoost.');
    expect(p.Leaderboard[0].isWinner).toBe(true);
    expect(p.BestModel?.Name).toBe('XGBoost');
    expect(p.BestModelID).toBe('model-1');
  });
});
