import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import type {
  MJExperimentEntity,
  MJExperimentSessionEntity,
  MJMLModelEntity,
} from '@memberjunction/core-entities';

import { PredictiveStudioRunExperimentAction } from '../run-experiment.action';
import { ExperimentOrchestrator } from '../../experiment/experiment-orchestrator';
import type { ExperimentDeps, ExperimentRunOptions, ExperimentSessionResult } from '../../experiment/types';

/**
 * Unit tests for the Run Experiment Session action. NO live DB, NO live sidecar —
 * the ExperimentOrchestrator is mocked via the action's overridable
 * `createOrchestrator` seam. These prove the action stays thin: plan validation +
 * the approval gate, correctly-mapped delegation to `runSession` (plan + budget +
 * experiment-id option), and result→output-param mapping.
 */

/** A captured-call mock orchestrator. */
class MockOrchestrator extends ExperimentOrchestrator {
  public LastPlan: ModelingPlanSpec | null = null;
  public LastOptions: ExperimentRunOptions | null = null;
  public CallCount = 0;
  constructor(private readonly result: ExperimentSessionResult) {
    super();
  }
  public override async runSession(
    plan: ModelingPlanSpec,
    _deps: ExperimentDeps,
    options: ExperimentRunOptions = {},
  ): Promise<ExperimentSessionResult> {
    this.CallCount++;
    this.LastPlan = plan;
    this.LastOptions = options;
    return this.result;
  }
}

/** Inert deps — the mock orchestrator never reads them. */
function inertDeps(): ExperimentDeps {
  return {
    entityFactory: {} as ExperimentDeps['entityFactory'],
    trainer: {} as ExperimentDeps['trainer'],
    clock: { now: () => 0 },
  };
}

/** Test subclass injecting a mock orchestrator + inert deps, exposing a clean `run`. */
class TestableExperimentAction extends PredictiveStudioRunExperimentAction {
  constructor(private readonly orchestrator: ExperimentOrchestrator) {
    super();
  }
  protected override createOrchestrator(): ExperimentOrchestrator {
    return this.orchestrator;
  }
  protected override buildDeps(): ExperimentDeps {
    return inertDeps();
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

function approvedPlan(over: Partial<ModelingPlanSpec> = {}): ModelingPlanSpec {
  return {
    Goal: 'Predict member churn',
    TargetDefinition: { EntityName: 'Members', TargetVariable: 'Churned', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [],
    CandidateFeatures: [],
    LeakageNotes: [],
    ProposedExperiments: [{ Label: 'xgb-baseline', AlgorithmName: 'xgboost', FeatureSet: ['tenure'], Rationale: 'baseline', Priority: 1 }],
    ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 },
    ProposedBudget: { MaxRuns: 5 },
    Approved: true,
    ...over,
  };
}

function sessionResult(over: Partial<ExperimentSessionResult> = {}): ExperimentSessionResult {
  return {
    experiment: { ID: 'exp-1' } as unknown as MJExperimentEntity,
    session: { ID: 'sess-1' } as unknown as MJExperimentSessionEntity,
    iterations: [],
    leaderboard: [{ IterationID: 'it-1', Metric: 0.8, ModelID: 'model-9' }],
    bestModel: { ID: 'model-9' } as unknown as MJMLModelEntity,
    stopReason: 'completed',
    ...over,
  };
}

function params(list: ActionParam[]): RunActionParams {
  return { Params: list } as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}

describe('PredictiveStudioRunExperimentAction — validation', () => {
  it('fails when PlanSpec is missing', async () => {
    const orch = new MockOrchestrator(sessionResult());
    const result = await new TestableExperimentAction(orch).run(params([]));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(orch.CallCount).toBe(0);
  });

  it('refuses an unapproved plan with PLAN_NOT_APPROVED', async () => {
    const orch = new MockOrchestrator(sessionResult());
    const p = params([{ Name: 'PlanSpec', Type: 'Input', Value: approvedPlan({ Approved: false }) }]);
    const result = await new TestableExperimentAction(orch).run(p);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('PLAN_NOT_APPROVED');
    expect(orch.CallCount).toBe(0);
  });
});

describe('PredictiveStudioRunExperimentAction — happy path', () => {
  it('delegates to runSession with the plan + mapped budget/experiment options and maps outputs', async () => {
    const orch = new MockOrchestrator(sessionResult());
    const p = params([
      { Name: 'PlanSpec', Type: 'Input', Value: approvedPlan() },
      { Name: 'ExperimentID', Type: 'Input', Value: 'exp-existing' },
      { Name: 'Budget', Type: 'Input', Value: { MaxRuns: 3, MaxComputeCost: 10 } },
    ]);

    const result = await new TestableExperimentAction(orch).run(p);

    expect(orch.CallCount).toBe(1);
    expect(orch.LastPlan?.Goal).toBe('Predict member churn');
    expect(orch.LastOptions?.experimentID).toBe('exp-existing');
    expect(orch.LastOptions?.budget).toEqual({ MaxRuns: 3, MaxComputeCost: 10 });

    expect(result.Success).toBe(true);
    expect(out(p, 'SessionID')).toBe('sess-1');
    expect(out(p, 'BestModelID')).toBe('model-9');
    expect(out(p, 'StopReason')).toBe('completed');
    const leaderboard = JSON.parse(out(p, 'Leaderboard') as string);
    expect(leaderboard).toEqual([{ IterationID: 'it-1', Metric: 0.8, ModelID: 'model-9' }]);
  });

  it('maps a budget-paused session with no best model', async () => {
    const orch = new MockOrchestrator(sessionResult({ bestModel: null, stopReason: 'budget-maxRuns' }));
    const p = params([{ Name: 'PlanSpec', Type: 'Input', Value: approvedPlan() }]);
    const result = await new TestableExperimentAction(orch).run(p);
    expect(result.Success).toBe(true);
    expect(out(p, 'BestModelID')).toBeNull();
    expect(out(p, 'StopReason')).toBe('budget-maxRuns');
  });
});

describe('PredictiveStudioRunExperimentAction — orchestrator error', () => {
  it('maps a thrown orchestrator error to EXPERIMENT_FAILED', async () => {
    class ThrowingOrch extends ExperimentOrchestrator {
      public override async runSession(): Promise<ExperimentSessionResult> {
        throw new Error('no pipeline resolver configured');
      }
    }
    const result = await new TestableExperimentAction(new ThrowingOrch()).run(
      params([{ Name: 'PlanSpec', Type: 'Input', Value: approvedPlan() }]),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXPERIMENT_FAILED');
    expect(result.Message).toContain('pipeline resolver');
  });
});
