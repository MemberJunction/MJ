import { beforeEach, describe, expect, it } from 'vitest';
import type { MJMLModelScoringBindingEntity, MJRecordProcessEntity_IRecordProcessChallengerConfig } from '@memberjunction/core-entities';
import { ScoringService } from '../scoring-service';
import { ShadowScoringCoordinator, type ShadowSampleKey } from '../shadow-scoring';
import { Records, ScoringServiceWorld, type WorldModelRef } from '../../__tests__/fakes/scoring-service-world';

/**
 * Task M5.11 (D-069, §5.8.3 step 5): a bound process's champion and challenger rows are `Source = 'Model'` rows of their
 * scoring runs, written by `ScoringService`. The coordinator is the run's challenger source: it reads the binding's
 * Record Process `ChallengerConfiguration`, and samples each record by #6180's rule (`SampleRate` ≥ 1 mirrors every
 * record, otherwise a draw in [0, 1) below the rate) with a draw that is a pure function of the binding, the record and
 * the as-of date. It writes no Feature Value of its own.
 */

const AS_OF = new Date('2026-03-04T00:00:00Z');
const BINDING_ID = 'B0000000-0000-4000-8000-0000000000B1';

const mlConfig = (over: Partial<MJRecordProcessEntity_IRecordProcessChallengerConfig> = {}): MJRecordProcessEntity_IRecordProcessChallengerConfig => ({
  Enabled: true, WorkType: 'ML Model', ChallengerModelID: 'Model-Challenger-V2', SampleRate: 1, ...over,
});
/** A coordinator reading `config` as the binding's challenger configuration, drawing with `draw`. */
const coordinatorFor = (
  config: MJRecordProcessEntity_IRecordProcessChallengerConfig | null,
  draw?: (key: ShadowSampleKey) => number,
): ShadowScoringCoordinator => new ShadowScoringCoordinator({ Configs: { ChallengerConfiguration: async () => config }, Draw: draw });
const key = (recordId: string, asOf: Date = AS_OF, bindingId: string = BINDING_ID): ShadowSampleKey => ({ BindingID: bindingId, RecordID: recordId, AsOf: asOf });

describe('ShadowScoringCoordinator.ShouldSample', () => {
  it("samples by #6180's rule: Enabled, a finite positive numeric SampleRate and an ML Model challenger; a rate of 1 or more takes every record, a lower rate a draw below it", () => {
    const coordinator = coordinatorFor(null, (k) => (k.RecordID === 'low' ? 0.25 : 0.75));
    const unsampled: (MJRecordProcessEntity_IRecordProcessChallengerConfig | null | undefined)[] = [
      undefined, null, mlConfig({ Enabled: false }), mlConfig({ SampleRate: 0 }), mlConfig({ SampleRate: -0.5 }), mlConfig({ SampleRate: Number.NaN }),
      JSON.parse(JSON.stringify(mlConfig({ SampleRate: 0.5 })).replace('0.5', '"0.5"')) as MJRecordProcessEntity_IRecordProcessChallengerConfig,
      mlConfig({ ChallengerModelID: '  ' }), mlConfig({ WorkType: 'Infer', ChallengerModelID: undefined, ChallengerPromptID: 'prompt-1' }),
    ];
    expect(unsampled.map((c) => coordinator.ShouldSample(c, key('low')))).toEqual(unsampled.map(() => false));
    expect([coordinator.ShouldSample(mlConfig(), key('high')), coordinator.ShouldSample(mlConfig({ SampleRate: 3 }), key('high'))]).toEqual([true, true]);
    expect([coordinator.ShouldSample(mlConfig({ SampleRate: 0.5 }), key('low')), coordinator.ShouldSample(mlConfig({ SampleRate: 0.5 }), key('high'))]).toEqual([true, false]);
  });

  it('the production draw is a pure function of binding, record and as-of date in [0, 1): the same key draws the same value; a record ID in another case is the same record', () => {
    const draws = ['r1', 'r2', 'r3'].map((r) => ShadowScoringCoordinator.DeterministicDraw(key(r)));
    expect(draws).toEqual(['r1', 'r2', 'r3'].map((r) => ShadowScoringCoordinator.DeterministicDraw(key(r))));
    expect(draws.every((d) => d >= 0 && d < 1)).toBe(true);
    expect(new Set(draws).size).toBe(3);
    expect(ShadowScoringCoordinator.DeterministicDraw(key('ABC-1'))).toBe(ShadowScoringCoordinator.DeterministicDraw(key('abc-1', AS_OF, BINDING_ID.toLowerCase())));
    // the time of day does not move the draw (as-of is a date); another date or binding does
    expect(ShadowScoringCoordinator.DeterministicDraw(key('r1', new Date('2026-03-04T17:30:00Z')))).toBe(draws[0]);
    expect(ShadowScoringCoordinator.DeterministicDraw(key('r1', new Date('2026-03-05T00:00:00Z')))).not.toBe(draws[0]);
    expect(ShadowScoringCoordinator.DeterministicDraw(key('r1', AS_OF, 'B0000000-0000-4000-8000-0000000000B2'))).not.toBe(draws[0]);
  });

  it('the production draw samples a share of records close to SampleRate (10,000 records at 0.2 → within 0.18–0.22)', () => {
    const coordinator = new ShadowScoringCoordinator({ Configs: { ChallengerConfiguration: async () => null } });
    const ids = Array.from({ length: 10_000 }, (_, i) => `member-${i}`);
    const share = ids.filter((id) => coordinator.ShouldSample(mlConfig({ SampleRate: 0.2 }), key(id))).length / ids.length;
    expect(share).toBeGreaterThan(0.18);
    expect(share).toBeLessThan(0.22);
  });
});

describe('ShadowScoringCoordinator as the challenger source of a binding run', () => {
  let world: ScoringServiceWorld;
  let champion: WorldModelRef;
  let challenger: WorldModelRef;
  let binding: MJMLModelScoringBindingEntity;

  beforeEach(async () => {
    world = new ScoringServiceWorld();
    champion = world.Model();
    challenger = world.Model({ Status: 'Validated' }, champion.PipelineID);
    binding = await world.Binding(champion);
  });

  const challengerConfig = (over: Partial<MJRecordProcessEntity_IRecordProcessChallengerConfig> = {}): MJRecordProcessEntity_IRecordProcessChallengerConfig =>
    mlConfig({ ChallengerModelID: challenger.ID, ...over });
  const scoreWith = async (coordinator: ShadowScoringCoordinator, ...ids: string[]): Promise<void> => {
    const ctx = world.Ctx();
    await new ScoringService({ ...ctx, Seams: { ...ctx.Seams, Challengers: coordinator } }).Score(binding, Records(...ids), AS_OF, false);
  };

  it("a sampled record's champion and challenger rows are Model rows of two scoring runs", async () => {
    await scoreWith(coordinatorFor(challengerConfig()), 'r1');
    const values = world.Values;
    expect(values.Store().map((r) => [r['Source'], r['Role']])).toEqual([['Model', 'Champion'], ['Model', 'Challenger']]);
    const runIds = world.Runs().map((r) => r['ID']);
    expect(world.Runs().map((r) => [r['ModelID'], r['Status']])).toEqual([[champion.ID, 'completed'], [challenger.ID, 'completed']]);
    expect(values.Calls().map((c) => [c.Role, c.MLModelID, c.MLScoringRunID])).toEqual([['Champion', champion.ID, runIds[0]], ['Challenger', challenger.ID, runIds[1]]]);
    expect(values.Store().every((r) => typeof r['MLScoringRunID'] === 'string' && r['MLScoringRunID'] !== '')).toBe(true);
  });

  it('the challenger scores only the sampled records of the run; its run row counts them', async () => {
    await scoreWith(coordinatorFor(challengerConfig({ SampleRate: 0.5 }), (k) => (k.RecordID === 'r2' || k.RecordID === 'r4' ? 0.1 : 0.9)), 'r1', 'r2', 'r3', 'r4', 'r5');
    const rows = world.Values.Store();
    expect(rows.filter((r) => r['Role'] === 'Champion').map((r) => r['RecordID'])).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(rows.filter((r) => r['Role'] === 'Challenger').map((r) => r['RecordID'])).toEqual(['r2', 'r4']);
    expect(world.Runs().map((r) => [r['ModelID'], r['Status'], r['Written']])).toEqual([[champion.ID, 'completed', 5], [challenger.ID, 'completed', 2]]);
  });

  it('a run none of whose records the sample draws writes only the champion rows under one run row', async () => {
    await scoreWith(coordinatorFor(challengerConfig({ SampleRate: 0.25 }), () => 0.5), 'r1', 'r2');
    expect(world.Values.Store().map((r) => [r['Source'], r['Role']])).toEqual([['Model', 'Champion'], ['Model', 'Champion']]);
    expect(world.Runs().map((r) => r['ModelID'])).toEqual([champion.ID]);
  });

  it('two runs of the same records and as-of date sample the same records (a same-day re-run replaces exactly the challenger rows it wrote)', async () => {
    const coordinator = coordinatorFor(challengerConfig({ SampleRate: 0.5 }));
    const ids = Array.from({ length: 12 }, (_, i) => `m${i}`);
    await scoreWith(coordinator, ...ids);
    const first = world.Values.Store().filter((r) => r['Role'] === 'Challenger').map((r) => r['RecordID']);
    await Promise.all([scoreWith(coordinator, ...ids.slice(0, 6)), scoreWith(coordinator, ...ids.slice(6))]);
    const after = world.Values.Store().filter((r) => r['Role'] === 'Challenger').map((r) => r['RecordID']);
    expect(after.sort()).toEqual([...first].sort());
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(ids.length);
  });

  it('names no challenger for a disabled configuration, a prompt challenger, a zero rate or no configuration, and reads no model', async () => {
    const configs: (MJRecordProcessEntity_IRecordProcessChallengerConfig | null)[] = [
      challengerConfig({ Enabled: false }), challengerConfig({ WorkType: 'Infer', ChallengerModelID: undefined, ChallengerPromptID: 'prompt-1' }), challengerConfig({ SampleRate: 0 }), null,
    ];
    const named = await Promise.all(configs.map((c) => coordinatorFor(c).Challenger(binding, AS_OF, world.Ctx())));
    expect(named).toEqual([null, null, null, null]);
  });
});
