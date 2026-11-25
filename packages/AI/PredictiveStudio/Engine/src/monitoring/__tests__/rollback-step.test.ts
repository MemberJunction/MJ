import { beforeEach, describe, expect, it } from 'vitest';
import { EvaluationProtocol, type Interval, type RollbackTrigger } from '@memberjunction/predictive-studio-core';

import type { MonitoredModel, MonitoringContext, MonitoringPeriod } from '../monitoring-seams';
import { RollbackStep, type PairedPeriod, type RollbackPlan } from '../rollback-step';
import { BINARY, CURRENT, D, JOB_RUN, MonitoringWorld, Month, PREDECESSOR } from './monitoring-world';

/** Task M6.3 — the automated rollback (D4-17, §5.7 R5). */

/** A rollback step whose paired comparison per period is the test's lower bounds, in order. */
class PairedLowers extends RollbackStep {
  private lowers: number[] = [];
  public readonly Compared: string[] = [];
  public Lowers(lowers: number[]): void {
    this.lowers = [...lowers];
  }
  protected override async ComparePeriod(_c: MonitoredModel, p: MonitoredModel, period: MonitoringPeriod): Promise<PairedPeriod> {
    this.Compared.push(`${p.ID}@${period.Start.toISOString().slice(0, 10)}`);
    const lower = this.lowers.shift();
    if (lower === undefined) throw new Error('no paired lower bound queued');
    const difference: Interval = { level: 0.95, lower, upper: lower + 0.05 };
    return { SharedRows: 40, Difference: difference };
  }
}

const RULE: RollbackTrigger = { kind: 'previous-beats-current', margin: EvaluationProtocol.ToNonNegative(0.01), consecutivePeriods: 2 };
const Periods = (n: number): MonitoringPeriod[] => Array.from({ length: n }, (_, i) => Month(`2026-0${i + 1}-01`));

let world: MonitoringWorld;
let step: PairedLowers;
let ctx: MonitoringContext;
let plan: RollbackPlan;

beforeEach(() => {
  world = new MonitoringWorld();
  step = new PairedLowers();
  ctx = world.Ctx();
  world.Store.PredecessorOf = { ModelID: PREDECESSOR, Model: world.Store.Models.get(PREDECESSOR.toLowerCase()) || null };
  plan = {
    Rule: RULE, Unit: world.Store.Unit, Initiator: { kind: 'scheduled-job', scheduledJobRunId: JOB_RUN },
    Scoring: { PrimaryScore: { family: 'binary', metric: 'log-loss' }, Interval: { level: 0.95, method: 'bootstrap', resamples: 200, pairedTest: 'paired-bootstrap' }, Task: BINARY, Seed: 1 },
  };
});

describe('RollbackStep.CheckRollback', () => {
  it('rolls back after two consecutive periods where the predecessor beats the current model on the same rows', async () => {
    step.Lowers([0.02, 0.03]);
    const check = await step.CheckRollback(world.Current(), Periods(2), plan, ctx);
    expect(world.Gate.Requests).toEqual([expect.objectContaining({ modelId: PREDECESSOR, purpose: 'rollback', initiator: { kind: 'scheduled-job', scheduledJobRunId: JOB_RUN }, signOffId: null })]);
    expect(check).toMatchObject({ kind: 'rolled-back', predecessorModelId: PREDECESSOR, recordId: 'rollback-1', sharedRowIds: 40 });
  });

  it('a lower bound equal to the margin in one of the periods rolls back nothing', async () => {
    step.Lowers([0.01, 0.03]);
    expect(await step.CheckRollback(world.Current(), Periods(2), plan, ctx)).toMatchObject({ kind: 'checked' });
    expect(world.Gate.Requests).toHaveLength(0);
  });

  it('records not-eligible when the predecessor has no verified artifact, and rolls back nothing', async () => {
    world.Store.Artifacts.set(PREDECESSOR.toLowerCase(), { Verified: false, Reason: 'the stored artifact loads missing' });
    step.Lowers([0.5, 0.5]);
    expect(await step.CheckRollback(world.Current(), Periods(2), plan, ctx)).toMatchObject({ kind: 'not-eligible', reason: expect.stringContaining('artifact') });
    expect(world.Gate.Requests).toHaveLength(0);
    expect(step.Compared).toEqual([]);
  });

  it('a deleted predecessor makes the rollback not-eligible', async () => {
    world.Store.PredecessorOf = { ModelID: PREDECESSOR, Model: null };
    expect(await step.CheckRollback(world.Current(), Periods(2), plan, ctx)).toMatchObject({ kind: 'not-eligible', reason: expect.stringContaining('deleted') });
  });

  it('rollbackOn null never fires', async () => {
    step.Lowers([0.5, 0.5, 0.5]);
    expect(await step.CheckRollback(world.Current(), Periods(3), { ...plan, Rule: null }, ctx)).toEqual({ kind: 'off' });
    expect(world.Gate.Requests).toHaveLength(0);
  });

  it('a model that replaced no predecessor is checked against nothing', async () => {
    world.Store.PredecessorOf = null;
    expect(await step.CheckRollback(world.Current(), Periods(2), plan, ctx)).toEqual({ kind: 'no-predecessor' });
  });
});

describe('RollbackStep.ComparePeriod (the production comparison over the world\'s seams)', () => {
  it('scores the predecessor on the current model\'s joined rows through the monitoring path and leaves out its training rows', async () => {
    world.Store.Binding = MonitoringWorld.BINDING;
    for (let i = 0; i < 30; i++) {
      const id = `r${i}`;
      world.Store.Predict(CURRENT, id, D('2026-01-10'), 0.9);
      world.Store.Outcome(id, D('2026-01-10'), '0');
    }
    world.Scorer.ScoreOf = () => 0.1;
    world.Scorer.InTraining = (_m, id) => id === 'r0';
    const real = new RollbackStep();
    const check = await real.CheckRollback(world.Current(), Periods(2).slice(0, 1).concat(Periods(1)), plan, ctx);
    expect(world.Scorer.Calls.every((c) => c.ModelID === PREDECESSOR && c.PredecessorOf === CURRENT)).toBe(true);
    expect(check).toMatchObject({ kind: 'rolled-back', sharedRowIds: 29 });
  });
});
