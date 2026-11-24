import { beforeEach, describe, expect, it } from 'vitest';
import type { MonitoringMirror, MonitoringTriggerFired } from '@memberjunction/predictive-studio-core';

import { TrainingInFlightError } from '../../training/training-claims';
import { ChallengerStep } from '../challenger-step';
import { CURRENT, MonitoringWorld, PIPELINE } from './monitoring-world';

/** Task M6.3 — the challenger step: what a fired trigger starts, and every gate outcome as the period stores it. */
const RUN = 'run-7';
const MIRROR: MonitoringMirror = { challengerModelId: 'challenger', paired: 10, agreement: 0.9, meanScoreDelta: 0.01, failures: 0 };
const DEGRADED: MonitoringTriggerFired = { kind: 'outcome-degradation', reason: 'lower bound 0.02 > margin 0.01' };
const MISCALIBRATED: MonitoringTriggerFired = { kind: 'calibration-drift', reason: 'slope 0.6 outside [0.8, 1.2]' };

let world: MonitoringWorld;
const scheduled = { kind: 'scheduled-job', scheduledJobRunId: 'job-run' } as const;

beforeEach(() => {
  world = new MonitoringWorld();
});

describe('ChallengerStep.FromOutcome', () => {
  it('a published or already-published outcome is published with its publish record', () => {
    expect(ChallengerStep.FromOutcome(RUN, { Kind: 'published', Purpose: 'publish', ModelID: 'm', PublishRecordID: 'P1', Replaces: CURRENT, Approver: 'automated-gate' }, MIRROR))
      .toEqual({ outcome: 'published', trainingRunId: RUN, recordId: 'P1', reason: null, mirror: MIRROR });
    expect(ChallengerStep.FromOutcome(RUN, { Kind: 'already-published', Purpose: 'publish', ModelID: 'm', PublishRecordID: 'P2' }, null))
      .toEqual({ outcome: 'published', trainingRunId: RUN, recordId: 'P2', reason: null, mirror: null });
  });

  it('a withheld outcome is withheld with its refusal record and the refusal in words', () => {
    const r = ChallengerStep.FromOutcome(RUN, { Kind: 'withheld', Purpose: 'publish', ModelID: 'm', Status: 'Validated', Refusal: { kind: 'no-sign-off' }, Transient: false, RefusalRecordID: 'R1' }, null);
    expect(r).toMatchObject({ outcome: 'withheld', trainingRunId: RUN, recordId: 'R1', reason: expect.any(String) });
    expect(r.reason).not.toBe('');
  });

  it('a run recorded at Evaluate is stopped with its record; an evaluated model that did not publish is stopped with none', () => {
    expect(ChallengerStep.FromOutcome(RUN, { Kind: 'run-recorded', TrainingRunID: RUN, Refusal: { kind: 'kept-existing-rule', rule: 'keep-baseline' }, RefusalRecordID: 'R2' }, null)).toMatchObject({ outcome: 'stopped', recordId: 'R2' });
    expect(ChallengerStep.FromOutcome(RUN, { Kind: 'evaluated', ModelID: 'm', From: 'Draft', To: 'KeepBaseline' }, null)).toMatchObject({ outcome: 'stopped', recordId: null, reason: 'the challenger was evaluated KeepBaseline and not published' });
  });

  it('a refused outcome is withheld with no record', () => {
    expect(ChallengerStep.FromOutcome(RUN, { Kind: 'refused', Refusal: { kind: 'publish-in-progress' } }, null)).toMatchObject({ outcome: 'withheld', recordId: null, reason: expect.any(String) });
  });
});

describe('ChallengerStep.RunChallenger', () => {
  const model = (): ReturnType<MonitoringWorld['Current']> => world.Current();

  it('nothing fired: none, and nothing is trained', async () => {
    const r = await new ChallengerStep().RunChallenger(model(), [], [], MIRROR, scheduled, world.Ctx());
    expect(r).toEqual({ ChallengerRunID: null, Result: { outcome: 'none', trainingRunId: null, recordId: null, reason: null, mirror: MIRROR } });
    expect(world.Publisher.Calls).toEqual([]);
  });

  it('every fired trigger fired the period before: waiting, and nothing is trained (D4-11)', async () => {
    const r = await new ChallengerStep().RunChallenger(model(), [DEGRADED], [DEGRADED], null, scheduled, world.Ctx());
    expect(r.Result).toMatchObject({ outcome: 'waiting', reason: expect.stringContaining('outcome-degradation') });
    expect(world.Publisher.Calls).toEqual([]);
  });

  it('a fresh trigger prepares, trains and publishes through the gate with the initiator', async () => {
    const r = await new ChallengerStep().RunChallenger(model(), [DEGRADED, MISCALIBRATED], [DEGRADED], null, scheduled, world.Ctx());
    expect(r).toMatchObject({ ChallengerRunID: 'run-1', Result: { outcome: 'published', trainingRunId: 'run-1' } });
    expect(world.Publisher.Calls).toEqual([`prepare:${PIPELINE}`, `train:${PIPELINE}`]);
    expect(world.Publisher.Published).toEqual([{ TrainingRunID: 'run-1', Initiator: scheduled }]);
  });

  it('a refused preparation is stopped with its reason, and nothing is trained', async () => {
    world.Publisher.PrepareRefusal = 'the holdout cannot be re-carved';
    const r = await new ChallengerStep().RunChallenger(model(), [DEGRADED], [], null, scheduled, world.Ctx());
    expect(r.Result).toMatchObject({ outcome: 'stopped', reason: 'the holdout cannot be re-carved' });
    expect(world.Publisher.Trained).toEqual([]);
  });

  it('a training in flight fails the challenger naming the run, and restores the protocol a re-carve replaced', async () => {
    world.Publisher.RecarvedFrom = 'protocol-before';
    world.Publisher.TrainFailure = new TrainingInFlightError(PIPELINE, 'in-flight-run');
    const r = await new ChallengerStep().RunChallenger(model(), [DEGRADED], [], null, scheduled, world.Ctx());
    expect(r).toMatchObject({ ChallengerRunID: null, Result: { outcome: 'failed', reason: expect.stringContaining('in-flight-run') } });
    expect(r.Result.reason).toContain('restored to protocol-before');
    expect(world.Publisher.Calls).toContain(`restore:${PIPELINE}:protocol-before`);
  });
});
