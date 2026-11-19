import { beforeEach, describe, expect, it } from 'vitest';
import type { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import type { ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { EvaluationProtocol, type MonitoringChallengerResult, type MonitoringJobSpec } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioModelMonitoringJobDriver } from '../monitoring-driver';
import { SPEC } from './monitoring-spec';
import { CURRENT, D, JOB_RUN, MonitoringWorld, OWNER, PIPELINE, PREDECESSOR } from './monitoring-world';

/** Task M6.3 — the monitoring job driver over the in-memory world. */

/** June 2026 is the last complete month through July; its 30-day label windows close on July 30th. */
const NOW = D('2026-07-31');
const NOW_INSIDE_WINDOW = D('2026-07-10');
const JUNE = D('2026-06-10');

let world: MonitoringWorld;
let driver: PredictiveStudioModelMonitoringJobDriver;

async function Context(now: Date, spec: MonitoringJobSpec = SPEC): Promise<ScheduledJobExecutionContext> {
  world.Now = now;
  const schedule = await world.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', MonitoringWorld.User);
  schedule.Configuration = JSON.stringify(spec);
  schedule.Name = 'monitoring';
  schedule.OwnerUserID = OWNER;
  const run = await world.Provider.GetEntityObject<MJScheduledJobRunEntity>('MJ: Scheduled Job Runs', MonitoringWorld.User);
  run.ID = JOB_RUN;
  return { Schedule: schedule, Run: run, ContextUser: MonitoringWorld.User, Provider: world.Provider };
}

/** `n` July-scored predictions of June decisions with realised outcomes: a well-calibrated period (`p`, rate `rate`). */
function PeriodRows(day: Date, n: number, score: number, positives: number, prefix = 'r'): void {
  for (let i = 0; i < n; i++) {
    const id = `${prefix}${i}`;
    world.Store.Predict(CURRENT, id, day, score);
    world.Store.Outcome(id, day, i < positives ? '1' : '0');
  }
  world.Store.UnitRows.push(...Array.from({ length: n }, (_, i) => ({ RecordID: `${prefix}${i}`, DecisionDate: day })));
}

const challengerOf = (): MonitoringChallengerResult | null => world.Store.Last().Challenger;

beforeEach(() => {
  world = new MonitoringWorld();
  world.Store.Binding = MonitoringWorld.BINDING;
  driver = new PredictiveStudioModelMonitoringJobDriver(world.Seams());
});

describe('PredictiveStudioModelMonitoringJobDriver.Execute', () => {
  it('stores the primary score with its 95% bounds and the calibration report', async () => {
    PeriodRows(JUNE, 200, 0.3, 60);
    const r = await driver.Execute(await Context(NOW));
    expect(r.Success).toBe(true);
    const row = world.Store.Last();
    expect(row).toMatchObject({ State: 'evaluated', JoinedRows: 200, ScoredRows: 200, Period: { Grain: 'month', Start: D('2026-06-01') } });
    expect(row.Primary).toMatchObject({ metric: 'log-loss', value: expect.any(Number), interval: { lower: expect.any(Number), upper: expect.any(Number) }, n: 200 });
    expect(row.Calibration).toMatchObject({ method: 'platt', slope: expect.any(Number), intercept: expect.any(Number) });
  });

  it('a job owner without the binding\'s view authorization gets a failed period naming it, and the run fails (D4-157)', async () => {
    PeriodRows(JUNE, 200, 0.3, 60);
    world.Store.HoldsView = false;
    const r = await driver.Execute(await Context(NOW));
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain(`does not hold the view authorization of scoring binding ${MonitoringWorld.BINDING.ID}`);
    expect(world.Store.Last()).toMatchObject({ State: 'failed', JoinedRows: 0, ScoredRows: 0 });
    expect(world.Store.ModelRowReads).toBe(0);
  });

  it('a period whose label window is open is stored window-open with 0 joined rows', async () => {
    PeriodRows(JUNE, 50, 0.3, 15);
    await driver.Execute(await Context(NOW_INSIDE_WINDOW));
    expect(world.Store.Last()).toMatchObject({ State: 'window-open', JoinedRows: 0, Period: { Start: D('2026-06-01') } });
    expect(world.Scorer.Calls).toEqual([]);
  });

  it('re-runs an earlier window-open period once its window has closed, updating its one row', async () => {
    PeriodRows(JUNE, 50, 0.3, 15);
    await driver.Execute(await Context(NOW_INSIDE_WINDOW));
    await driver.Execute(await Context(D('2026-08-03')));
    const june = world.Store.Rows.filter((r) => r.Period.Start.getTime() === D('2026-06-01').getTime());
    expect(june.map((r) => r.State)).toEqual(['evaluated']);
  });

  it('a Published model with no Active binding is monitored through a shadow Predict run of the period\'s unit rows', async () => {
    world.Store.Binding = null;
    world.Store.UnitRows.push(...Array.from({ length: 40 }, (_, i) => ({ RecordID: `u${i}`, DecisionDate: JUNE })));
    for (let i = 0; i < 40; i++) world.Store.Outcome(`u${i}`, JUNE, i < 12 ? '1' : '0');
    world.Scorer.ScoreOf = () => 0.3;
    await driver.Execute(await Context(D('2026-07-31')));
    expect(world.Store.Last()).toMatchObject({ State: 'evaluated', JoinedRows: 40 });
    expect(world.Scorer.Runs[world.Scorer.Runs.length - 1]).toMatchObject({ Path: 'monitoring', DryRun: true, Written: 0 });
    expect(world.Store.Last().Parity).toMatchObject({ skipped: expect.stringContaining('no Active binding') });
  });

  it('a fired trigger starts one challenger through AutomatedPublisher and records the outcome; monitoring writes no Status', async () => {
    PeriodRows(JUNE, 300, 0.1, 150);
    await driver.Execute(await Context(D('2026-07-31')));
    expect(world.Store.Last().TriggersFired).toEqual([expect.objectContaining({ kind: 'outcome-degradation' })]);
    expect(world.Publisher.Published).toEqual([expect.objectContaining({ Initiator: { kind: 'scheduled-job', scheduledJobRunId: JOB_RUN } })]);
    expect(world.Publisher.Trained).toEqual([PIPELINE]);
    expect(world.Store.Last().ChallengerRunID).toBe('run-1');
    expect(challengerOf()).toMatchObject({ outcome: expect.stringMatching(/published|withheld/), recordId: 'publish-of-run-1' });
    expect(world.Gate.Requests).toHaveLength(0);
    expect(world.Store.Models.get(CURRENT.toLowerCase())?.Status).toBe('Published');
  });

  it('a trigger that stays fired the next period waits instead of starting a second challenger', async () => {
    PeriodRows(JUNE, 300, 0.1, 150);
    PeriodRows(D('2026-07-10'), 300, 0.1, 150, 'j');
    await driver.Execute(await Context(D('2026-07-31')));
    await driver.Execute(await Context(D('2026-08-31')));
    expect(world.Publisher.Published).toHaveLength(1);
    expect(challengerOf()).toMatchObject({ outcome: 'waiting' });
  });

  it('a withheld challenger is recorded with the gate\'s refusal record', async () => {
    world.Publisher.Answer = (id) => ({ Kind: 'withheld', Purpose: 'publish', ModelID: `model-of-${id}`, Status: 'Validated', Refusal: { kind: 'gate-no-signal' }, Transient: false, RefusalRecordID: `refusal-of-${id}` });
    PeriodRows(JUNE, 300, 0.1, 150);
    await driver.Execute(await Context(D('2026-07-31')));
    expect(challengerOf()).toMatchObject({ outcome: 'withheld', recordId: 'refusal-of-run-1', reason: expect.any(String) });
  });

  it('a drift alarm is recorded and notified and starts nothing', async () => {
    PeriodRows(JUNE, 200, 0.3, 60);
    world.Store.Reference = null;
    world.Store.Inputs = [{ Name: 'EngagementZ', Reference: [0, 1, 2, 3, 4], Current: [5, 6, 7] }, { Name: 'TenureZ', Reference: [0, 1, 2, 3, 4], Current: [1, 2, 3] }];
    world.Drift.NextDrift(['EngagementZ']);
    await driver.Execute(await Context(D('2026-07-31')));
    expect([world.Store.Last().DriftAlarms.length, world.Publisher.Published.length, world.Notifier.Sent.length]).toEqual([1, 0, 1]);
    expect(world.Store.Last().DriftAlarms[0]).toMatchObject({ input: 'EngagementZ', flagged: true });
    expect(world.Drift.Requests[0]).toMatchObject({ look: 1, q: 0.0171 });
    expect(world.Notifier.Sent[0].UserID).toBe(OWNER);
  });

  it('a parity failure is re-sampled once; a confirmed failure starts a training run, a passing re-sample does not', async () => {
    PeriodRows(JUNE, 200, 0.3, 60);
    world.Store.Reference = null;
    world.Parity.Queue.push({ Sampled: 100, MaxAbsDifference: 1e-6, Passed: false }, { Sampled: 100, MaxAbsDifference: 1e-6, Passed: false });
    await driver.Execute(await Context(D('2026-07-31')));
    expect(world.Store.Last().Parity).toMatchObject({ passed: false, resampled: true, trainingRunId: 'run-1' });
    expect(world.Parity.Seeds).toHaveLength(2);
    world.Parity.Queue.push({ Sampled: 100, MaxAbsDifference: 1e-6, Passed: false });
    await driver.Execute(await Context(D('2026-07-31')));
    expect(world.Store.Last().Parity).toMatchObject({ passed: true, resampled: true, trainingRunId: null });
    expect(world.Publisher.Trained).toHaveLength(1);
  });

  it('rolls back through the gate when the protocol\'s rule fires on the predecessor\'s shadow scores', async () => {
    PeriodRows(JUNE, 200, 0.3, 0);
    world.Store.PredecessorOf = { ModelID: PREDECESSOR, Model: world.Store.Models.get(PREDECESSOR.toLowerCase()) || null };
    world.Scorer.ScoreOf = (m) => (m === PREDECESSOR ? 0.05 : 0.3);
    const spec: MonitoringJobSpec = { ...SPEC, retrainTriggers: [], rollback: { kind: 'previous-beats-current', margin: EvaluationProtocol.ToNonNegative(0.01), consecutivePeriods: 1 } };
    await driver.Execute(await Context(D('2026-07-31'), spec));
    expect(world.Gate.Requests).toEqual([expect.objectContaining({ modelId: PREDECESSOR, purpose: 'rollback' })]);
    expect(world.Store.Last().Rollback).toMatchObject({ kind: 'rolled-back', predecessorModelId: PREDECESSOR });
  });

  it('a model that is no longer Published writes no period', async () => {
    const m = world.Store.Models.get(CURRENT.toLowerCase());
    if (m) world.Store.Models.set(CURRENT.toLowerCase(), { ...m, Status: 'Archived' });
    const r = await driver.Execute(await Context(NOW));
    expect([r.Success, world.Store.Rows.length]).toEqual([true, 0]);
  });

  it('refuses a Configuration that is not a MonitoringJobSpec', async () => {
    const ctx = await Context(NOW);
    ctx.Schedule.Configuration = JSON.stringify({ modelId: CURRENT });
    const r = await driver.Execute(ctx);
    expect(r).toMatchObject({ Success: false, ErrorMessage: expect.stringContaining('MonitoringJobSpec') });
    expect(driver.ValidateConfiguration(ctx.Schedule).Success).toBe(false);
  });
});
