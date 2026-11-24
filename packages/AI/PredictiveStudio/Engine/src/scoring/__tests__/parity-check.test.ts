import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import type { ScoredRow } from '@memberjunction/predictive-studio-core';

import { ParityCheck, type ParitySample, type StoredPrediction } from '../parity-check';
import { ScoringService } from '../scoring-service';
import { MEMBERSHIPS, MEMBERSHIPS_ID, RUN_DATE, Records, ScoringServiceWorld, type WorldModelRef } from '../../__tests__/fakes/scoring-service-world';
import { GateTestProvider } from '../../__tests__/fakes/gate-test-store';

/**
 * Tests for {@link ParityCheck} (Task M5.8, §5.8.6): a seeded sample of a binding's stored `Champion` `Model` rows,
 * recomputed through `ScoringService.Predict` as of each row's own `EffectiveAsOf` on the `parity` path, and compared
 * with the stored values at a tolerance. The scoring world is the provider and the service's doubles.
 */

const DAY1 = new Date('2026-03-01T00:00:00Z');
const DAY2 = new Date('2026-03-02T00:00:00Z');
const MODEL = 'B0000000-0000-4000-8000-0000000000B1';

let world: ScoringServiceWorld;
let published: WorldModelRef;
let binding: MJMLModelScoringBindingEntity;

beforeEach(async () => {
  world = new ScoringServiceWorld();
  published = WithUnit(world.Model());
  binding = await world.Binding(published);
});

/** The model with a Lineage that names a Prediction Unit (as unit training writes it). */
function WithUnit(model: WorldModelRef): WorldModelRef {
  const row = world.ModelRow(model);
  if (row === undefined) throw new Error(`the world stores no model ${model.ID}`);
  row['Lineage'] = JSON.stringify({ predictionUnitId: 'U1' });
  return model;
}

/** A stored prediction of `MODEL` on `recordId` as of `day`. */
function Stored(recordId: string, value: number, day: Date = DAY1, modelId: string = MODEL): StoredPrediction {
  return { FeatureValueID: `fv-${recordId}-${day.toISOString()}`, RecordID: recordId, ModelID: modelId, EffectiveAsOf: day, Value: value };
}

/** The recomputed row of a stored prediction, its value moved by `skew`. */
function Recomputed(s: StoredPrediction, skew: number): ScoredRow {
  return {
    recordId: s.RecordID, modelId: s.ModelID, modelVersion: 1, artifactSha256: 'sha', scoringRunId: 'run', asOfDate: s.EffectiveAsOf.toISOString(), inTraining: false,
    featureSchemaHash: 'hash', drivers: { wording: 'drivers', baseline: 'training-mean', items: [] },
    output: { kind: 'class-probabilities', classOrder: ['lapsed', 'renewed'], probabilities: [s.Value + skew, 1 - s.Value - skew], calibrated: true, adverseProbability: s.Value + skew },
  };
}

const Same = (stored: readonly StoredPrediction[]): ScoredRow[] => stored.map((s) => Recomputed(s, 0));
const Skewed = (stored: readonly StoredPrediction[], skew: number): ScoredRow[] => stored.map((s, i) => Recomputed(s, i === 0 ? skew : 0));
const stored = [Stored('r1', 0.25), Stored('r2', 0.5), Stored('r3', 0.75, DAY2)];

/** A sample of the world binding: one stored row of `published` per day, on `r1` and `r2` alternately. */
function SampleOf(days: readonly Date[]): ParitySample {
  return { BindingID: binding.ID, Entity: MEMBERSHIPS, ModelID: published.ID, Reason: null, Rows: days.map((d, i) => Stored(i % 2 === 0 ? 'r1' : 'r2', 0.5, d, published.ID)) };
}

/** A `Model` row of a binding in the world's store. */
function InsertModelRow(over: Record<string, string | number | Date | null>): void {
  world.Store.Insert('MJ: Feature Values', {
    ID: `fv-${world.Values.Store().length + 1}-${String(over['RecordID'] || 'r')}`, Source: 'Model', Role: 'Champion', MLModelScoringBindingID: binding.ID, EntityID: MEMBERSHIPS_ID,
    FeatureName: 'Renewal', RecordID: 'r1', MLModelID: published.ID, EffectiveAsOf: DAY1, ValueNumeric: 0.5, ...over,
  });
}

describe('ParityCheck.Compare', () => {
  it('passes identical recomputations and fails a 1e-6 skew at tolerance 1e-9', () => {
    expect(ParityCheck.Compare(stored, Same(stored), 1e-9).Passed).toBe(true);
    expect(ParityCheck.Compare(stored, Skewed(stored, 1e-6), 1e-9)).toMatchObject({ Passed: false, MaxAbsDifference: expect.closeTo(1e-6, 12) });
  });

  it('reports the sample size and the largest difference, and passes a difference within tolerance', () => {
    expect(ParityCheck.Compare(stored, Skewed(stored, 1e-12), ParityCheck.DefaultTolerance)).toEqual({ Sampled: 3, MaxAbsDifference: expect.closeTo(1e-12, 15), Passed: true });
  });

  it('fails a stored row with no recomputed row, and a sample of nothing', () => {
    expect(ParityCheck.Compare(stored, Same(stored).slice(1), 1e-9)).toEqual({ Sampled: 3, MaxAbsDifference: 0, Passed: false });
    expect(ParityCheck.Compare([], [], 1e-9)).toEqual({ Sampled: 0, MaxAbsDifference: 0, Passed: false });
  });

  it('pairs rows by record (case-insensitively), model and as-of day, never across days or models', () => {
    const lower = Same(stored).map((r) => ({ ...r, recordId: r.recordId.toUpperCase(), modelId: r.modelId.toLowerCase() }));
    expect(ParityCheck.Compare(stored, lower, 1e-9).Passed).toBe(true);
    const otherDay = Same([stored[0]]).map((r) => ({ ...r, asOfDate: DAY2.toISOString() }));
    expect(ParityCheck.Compare([stored[0]], otherDay, 1e-9).Passed).toBe(false);
    const otherModel = Same([stored[0]]).map((r) => ({ ...r, modelId: published.ID }));
    expect(ParityCheck.Compare([stored[0]], otherModel, 1e-9).Passed).toBe(false);
  });

  it('compares a regression\'s point prediction', () => {
    const point: ScoredRow = { ...Recomputed(stored[0], 0), output: { kind: 'value', point: 0.25 + 2e-9, interval: null } };
    expect(ParityCheck.Compare([stored[0]], [point], 1e-9)).toMatchObject({ Passed: false, MaxAbsDifference: expect.closeTo(2e-9, 15) });
  });

  it('refuses a tolerance that is negative or not finite', () => {
    expect(() => ParityCheck.Compare(stored, Same(stored), -1)).toThrow(/tolerance/);
    expect(() => ParityCheck.Compare(stored, Same(stored), Number.NaN)).toThrow(/tolerance/);
  });
});

describe('ParityCheck.Recompute', () => {
  it('recomputes each sampled row as of its own EffectiveAsOf', async () => {
    await ParityCheck.Recompute(SampleOf([DAY1, DAY2]), world.Ctx());
    expect(world.Runtime.AsOfArguments()).toEqual([DAY1, DAY2]);
  });

  it('runs on the parity path, records one run per model and day, and writes no Feature Value', async () => {
    const r = await ParityCheck.Recompute(SampleOf([DAY2, DAY1, DAY1]), world.Ctx({ Path: 'monitoring' }));
    expect(world.Runs().map((run) => [run['Path'], run['AsOfDate']])).toEqual([['parity', DAY1], ['parity', DAY2]]);
    expect(r.Results.map((x) => x.Status)).toEqual(['completed', 'completed']);
    expect(r.Rows.map((row) => [row.recordId, row.asOfDate])).toEqual([['r2', DAY1.toISOString()], ['r1', DAY1.toISOString()], ['r1', DAY2.toISOString()]]);
    expect(world.Values.Calls()).toEqual([]);
  });

  it('returns a refused recomputation with no rows, so the comparison fails', async () => {
    world.Artifacts.Set(`file-${published.ID}`, new TextEncoder().encode('tampered'));
    const sample = SampleOf([DAY1]);
    const r = await ParityCheck.Recompute(sample, world.Ctx());
    expect(r.Results).toMatchObject([{ Status: 'refused', Reason: { kind: 'artifact-hash-mismatch' } }]);
    expect(ParityCheck.Compare(sample.Rows, r.Rows, ParityCheck.DefaultTolerance).Passed).toBe(false);
  });
});

describe('ParityCheck.Sample', () => {
  it('reads only the binding\'s Champion Model rows', async () => {
    InsertModelRow({ RecordID: 'keep' });
    InsertModelRow({ RecordID: 'challenger', Role: 'Challenger' });
    InsertModelRow({ RecordID: 'human', Source: 'Human' });
    InsertModelRow({ RecordID: 'other-binding', MLModelScoringBindingID: 'C0000000-0000-4000-8000-0000000000C1' });
    const sample = await ParityCheck.Sample(binding, 10, 7, world.Ctx());
    expect(sample).toEqual({ BindingID: binding.ID, Entity: MEMBERSHIPS, ModelID: published.ID, Reason: null, Rows: [{ FeatureValueID: expect.any(String), RecordID: 'keep', ModelID: published.ID, EffectiveAsOf: DAY1, Value: 0.5 }] });
  });

  it('selects the same n rows for the same seed whatever the read order, and other rows for another seed', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `m${i + 1}`);
    ids.forEach((id) => InsertModelRow({ ID: `fv-${id}`, RecordID: id }));
    const first = (await ParityCheck.Sample(binding, 5, 42, world.Ctx())).Rows.map((r) => r.RecordID);
    world.Store.Tables['MJ: Feature Values'] = [...(world.Store.Tables['MJ: Feature Values'] || [])].reverse();
    const again = (await ParityCheck.Sample(binding, 5, 42, world.Ctx())).Rows.map((r) => r.RecordID);
    const other = (await ParityCheck.Sample(binding, 5, 43, world.Ctx())).Rows.map((r) => r.RecordID);
    expect(first).toHaveLength(5);
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
    expect((await ParityCheck.Sample(binding, 100, 42, world.Ctx())).Rows).toHaveLength(30);
  });

  it('reads the rows in keyset pages', async () => {
    const total = ParityCheck.PageSize + 3;
    for (let i = 0; i < total; i++) InsertModelRow({ ID: `fv-${String(i).padStart(6, '0')}`, RecordID: `m${i}` });
    const provider = world.Provider;
    if (!(provider instanceof GateTestProvider)) throw new Error('the world provider is the gate test provider');
    const pages: number[] = [];
    provider.RunView = vi.fn().mockImplementation(async (params: RunViewParams, user?: UserInfo) => {
      if (params.EntityName !== 'MJ: Feature Values') return world.Store.RunViewRows(params, user);
      const all = world.Store.RunViewRows({ ...params, MaxRows: undefined }, user).Results.map((r) => ({ ...r }));
      const after = params.AfterKey ? String(params.AfterKey.KeyValuePairs[0].Value) : '';
      const page = all.filter((r) => 'ID' in r && String(r.ID) > after).slice(0, params.MaxRows);
      pages.push(page.length);
      return { Success: true, Results: page, TotalRowCount: page.length, ErrorMessage: '' };
    });
    expect((await ParityCheck.Sample(binding, total, 1, world.Ctx())).Rows).toHaveLength(total);
    expect(pages).toEqual([ParityCheck.PageSize, 3]);
  });

  it('never samples the rows of a superseded model of the binding\'s pipeline', async () => {
    const superseded = world.Model({ Status: 'Archived' }, published.PipelineID);
    InsertModelRow({ RecordID: 'current' });
    InsertModelRow({ RecordID: 'old', MLModelID: superseded.ID });
    InsertModelRow({ RecordID: 'lower-case', MLModelID: published.ID.toLowerCase() });
    expect((await ParityCheck.Sample(binding, 10, 7, world.Ctx())).Rows.map((r) => r.RecordID)).toEqual(['current', 'lower-case']);
  });

  it('samples a model without a Prediction Unit only on the run date', async () => {
    const unitless = world.Model({ Unit: null });
    const legacy = await world.Binding(unitless, { FeatureName: 'Legacy' });
    InsertModelRow({ RecordID: 'earlier', MLModelScoringBindingID: legacy.ID, MLModelID: unitless.ID, EffectiveAsOf: DAY1 });
    InsertModelRow({ RecordID: 'today', MLModelScoringBindingID: legacy.ID, MLModelID: unitless.ID, EffectiveAsOf: RUN_DATE });
    expect((await ParityCheck.Sample(legacy, 10, 7, world.Ctx())).Rows.map((r) => r.RecordID)).toEqual(['today']);
    InsertModelRow({ RecordID: 'unit-earlier', EffectiveAsOf: DAY1 });
    expect((await ParityCheck.Sample(binding, 10, 7, world.Ctx())).Rows.map((r) => r.RecordID)).toEqual(['unit-earlier']);
  });

  it('returns an empty sample naming the reason for a binding with no published champion, which does not pass', async () => {
    const draft = world.Model({ Status: 'Validated' });
    const none = await world.Binding(draft, { FeatureName: 'Draft' });
    InsertModelRow({ RecordID: 'draft', MLModelScoringBindingID: none.ID, MLModelID: draft.ID });
    const sample = await ParityCheck.Sample(none, 10, 7, world.Ctx());
    expect(sample).toEqual({ BindingID: none.ID, Entity: MEMBERSHIPS, ModelID: null, Reason: { kind: 'no-published-model', pipelineId: draft.PipelineID }, Rows: [] });
    expect(ParityCheck.Compare(sample.Rows, [], ParityCheck.DefaultTolerance)).toEqual({ Sampled: 0, MaxAbsDifference: 0, Passed: false });
  });

  it('refuses a sample size that is not a positive integer', async () => {
    await expect(ParityCheck.Sample(binding, 0, 1, world.Ctx())).rejects.toThrow(/sample size/);
    await expect(ParityCheck.Sample(binding, 2.5, 1, world.Ctx())).rejects.toThrow(/sample size/);
  });
});

describe('ParityCheck — stored scores reproduce', () => {
  it('a sample of a binding\'s scored rows recomputes within the default tolerance, and a moved stored value fails', async () => {
    await new ScoringService(world.Ctx()).Score(binding, Records('r1', 'r2'), DAY1, false);
    await new ScoringService(world.Ctx()).Score(binding, Records('r1', 'r2'), RUN_DATE, false);
    const sample = await ParityCheck.Sample(binding, 10, 3, world.Ctx());
    const recomputed = await ParityCheck.Recompute(sample, world.Ctx());
    expect(ParityCheck.Compare(sample.Rows, recomputed.Rows, ParityCheck.DefaultTolerance)).toEqual({ Sampled: 4, MaxAbsDifference: 0, Passed: true });
    const moved = sample.Rows.map((r, i) => (i === 0 ? { ...r, Value: r.Value + 1e-6 } : r));
    expect(ParityCheck.Compare(moved, recomputed.Rows, ParityCheck.DefaultTolerance).Passed).toBe(false);
  });
});
