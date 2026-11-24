import { describe, expect, it, vi } from 'vitest';
import type { RemoteOpServerContext } from '@memberjunction/core';
import type { PredictiveStudioMigratePreGateModelsInput, PredictiveStudioMigratePreGateModelsOutput } from '@memberjunction/core-entities';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { PreGateModelMigration, type PreChangePassOptions, type PreChangePassResult, type PreChangeStepDetails } from '../../migration/pre-gate-model-migration';
import { PredictiveStudioMigratePreGateModelsServerOperation } from '../migrate-pre-gate-models.operation';

/**
 * `PredictiveStudio.MigratePreGateModels` (M7-26): the adapter over `PreGateModelMigration.RunPass` — how it reads its
 * input (a dry run by default, the limits through `ConfigFrom`) and how it maps the pass onto its output counts.
 */
class OperationUnderTest extends PredictiveStudioMigratePreGateModelsServerOperation {
  /** The adapter's body, as the framework calls it. */
  public Run(input: PredictiveStudioMigratePreGateModelsInput): Promise<PredictiveStudioMigratePreGateModelsOutput> {
    return this.InternalExecute(input, PROVIDER, USER, CONTEXT);
  }
}

const USER = GateWorld.User;
const PROVIDER = new GateTestStore().Provider();
const CONTEXT: RemoteOpServerContext = { provider: PROVIDER, user: USER, emitProgress: () => undefined };
const SURVEY: PreChangePassResult['Survey'] = { EvidenceBearing: 4, UnverifiedArtifacts: 3, SchedulesToDisable: 2, PipelinesToReEvaluate: 1 };
const DETAILS: PreChangeStepDetails = {
  Reverified: { Visited: 3, Adopted: ['M-1', 'M-2'], Demoted: [{ ModelID: 'M-3', Refusal: { kind: 'gate-no-signal', reason: 'the interval spans zero' }, RolledBackTo: null }], Evaluated: [], Retry: [] },
  Artifacts: { Visited: 2, Changed: 2, Verified: ['M-4'], LegacyLocal: ['M-5'], Missing: [], HashMismatch: [], Retry: [] },
  Schedules: { Disabled: ['RP-1'], ScoringActionsDisabled: ['M-3'] },
  ReEvaluation: { Trained: 1, Findings: [] },
  DisabledProcessIDs: ['RP-1'],
};

/** Spies `RunPass` to answer with `details` and returns the spy. */
function passReturning(details: PreChangeStepDetails | null) {
  return vi.spyOn(PreGateModelMigration, 'RunPass').mockImplementation(async (options: PreChangePassOptions) => ({ DryRun: options.DryRun, Survey: SURVEY, Details: details }));
}

describe('PredictiveStudio.MigratePreGateModels', () => {
  it('is a dry run by default, with the default limits, as the request\'s user on its provider', async () => {
    const pass = passReturning(null);
    expect(await new OperationUnderTest().Run({})).toEqual({ dryRun: true, evidenceBearing: 4, unverifiedArtifacts: 3, schedulesToDisable: 2, pipelinesToReEvaluate: 1 });
    expect(pass.mock.calls[0].slice(0, 2)).toEqual([{ DryRun: true, ScheduledJobRunID: null, Config: PreGateModelMigration.DefaultConfig }, { ContextUser: USER, Provider: PROVIDER }]);
  });

  it('passes a writing pass its job run and limits, and maps what each step did', async () => {
    const pass = passReturning(DETAILS);
    const out = await new OperationUnderTest().Run({ dryRun: false, scheduledJobRunId: 'RUN-1', batchSize: 10, retrainPerRun: 0 });
    expect(pass.mock.calls[0][0]).toEqual({ DryRun: false, ScheduledJobRunID: 'RUN-1', Config: { BatchSize: 10, RetrainPerRun: 0 } });
    expect(out).toEqual({
      dryRun: false, evidenceBearing: 4, unverifiedArtifacts: 3, schedulesToDisable: 2, pipelinesToReEvaluate: 1,
      adopted: 2, demoted: 1, artifactsChanged: 2, schedulesDisabled: 1, retrained: 1,
    });
  });

  it('reads a limit that is not a positive integer as its default', async () => {
    const pass = passReturning(null);
    await new OperationUnderTest().Run({ batchSize: -5, retrainPerRun: 1.5 });
    expect(pass.mock.calls[0][0].Config).toEqual(PreGateModelMigration.DefaultConfig);
  });

  it('lets the pass\'s refusal through as the operation\'s error', async () => {
    vi.spyOn(PreGateModelMigration, 'RunPass').mockRejectedValue(new Error('a writing pass runs only as a Predictive Studio Registry Check job run'));
    await expect(new OperationUnderTest().Run({ dryRun: false })).rejects.toThrow('Predictive Studio Registry Check');
  });
});
