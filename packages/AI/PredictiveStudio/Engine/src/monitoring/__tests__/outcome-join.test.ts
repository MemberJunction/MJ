import { beforeEach, describe, expect, it } from 'vitest';

import { OutcomeJoin } from '../outcome-join';
import { CURRENT, D, MonitoringWorld, Month } from './monitoring-world';

/** Task M6.3 — the outcome join: the prediction as of each period, never the latest, training rows excluded. */
let world: MonitoringWorld;
const PERIOD_2 = Month('2026-02-01');

beforeEach(() => {
  world = new MonitoringWorld();
  world.Store.Binding = MonitoringWorld.BINDING;
  // r1 and r2 scored in January, February and March; r3 only in February and in the training snapshot.
  for (const [day, s] of [['2026-01-10', 0.1], ['2026-02-10', 0.2], ['2026-03-10', 0.3]] as const) {
    world.Store.Predict(CURRENT, 'r1', D(day), s);
    world.Store.Predict(CURRENT, 'r2', D(day), s + 0.5);
  }
  world.Store.Predict(CURRENT, 'r3', D('2026-02-11'), 0.9, { InTraining: true });
  world.Store.Outcome('r1', D('2026-02-10'), '1');
  world.Store.Outcome('r2', D('2026-02-10'), '0');
  world.Store.Outcome('r3', D('2026-02-11'), '1');
});

/** The score `record` was given as of `period` (its newest row inside the period). */
const scoreAsOf = (record: string, period: typeof PERIOD_2): number | undefined =>
  world.Store.Values.filter((v) => v.RecordID === record && v.EffectiveAsOf >= period.Start && v.EffectiveAsOf < period.End).map((v) => v.Score).pop();

describe('OutcomeJoin', () => {
  it('joins outcomes to the prediction as of each period, never the latest one, and excludes training rows', async () => {
    const rows = await OutcomeJoin.Rows(world.Current(), PERIOD_2, world.Ctx());
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.EffectiveAsOf >= PERIOD_2.Start && r.EffectiveAsOf < PERIOD_2.End && r.InTraining === false)).toBe(true);
    expect(rows.map((r) => r.ScoreFromPeriod)).toEqual(rows.map((r) => scoreAsOf(r.RecordID, PERIOD_2)));
    expect(rows.map((r) => r.Outcome)).toEqual(['1', '0']);
  });

  it('counts the training rows it excluded and the predictions it found', async () => {
    const join = await OutcomeJoin.Join(world.Current(), world.Store.Unit, PERIOD_2, world.Ctx());
    expect([join.Path, join.ScoredRows, join.ExcludedInTrainingRows, join.Rows.length]).toEqual(['binding', 3, 1, 2]);
  });

  it('a closed-window record with no realised outcome joins with Outcome null', async () => {
    world.Store.OutcomeRows.splice(0, world.Store.OutcomeRows.length);
    const rows = await OutcomeJoin.Rows(world.Current(), PERIOD_2, world.Ctx());
    expect(rows.map((r) => r.Outcome)).toEqual([null, null]);
  });

  it('with no Active binding the period\'s unit rows are shadow-scored (Path monitoring, dry run) and joined', async () => {
    world.Store.Binding = null;
    world.Store.UnitRows.push({ RecordID: 'u1', DecisionDate: D('2026-02-03') }, { RecordID: 'u2', DecisionDate: D('2026-03-03') });
    world.Store.Outcome('u1', D('2026-02-03'), '1');
    world.Scorer.ScoreOf = () => 0.7;
    const join = await OutcomeJoin.Join(world.Current(), world.Store.Unit, PERIOD_2, world.Ctx());
    expect([join.Path, join.Rows.map((r) => r.RecordID), join.ShadowScoringRunID]).toEqual(['shadow', ['u1'], 'shadow-1']);
    expect(world.Scorer.Calls).toEqual([{ ModelID: CURRENT, PredecessorOf: null, Records: ['u1'] }]);
    expect(world.Scorer.Runs).toEqual([{ Path: 'monitoring', DryRun: true, Written: 0, ModelID: CURRENT }]);
  });
});
