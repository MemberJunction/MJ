/**
 * The daily prediction maintenance (Task M5b.5, §5.8.7, D4-25, D4-28): the retention sweep deletes a binding's Model
 * rows older than its RetentionDays — active and withdrawn bindings alike, the cutoff exact, a null RetentionDays
 * keeping all — and never anything but Feature Values; the backfill gives each binding without a view authorization the
 * seeded one, once, and changes nothing while that authorization is not loaded.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AuthorizationInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    PredictionRetention,
  type IPredictionRetentionStore,
  type PredictionRetentionContext,
  type RetentionBatchOutcome,
  type RetentionBindingRow,
  type UnauthorizedBinding,
} from '../prediction-retention';
import { PredictiveStudioPredictionRetentionJobDriver, type PredictionRetentionDetails } from '../prediction-retention-driver';

const SWEEP_DAY = new Date('2026-11-19T02:00:00Z');
/** 30 days before the sweep day's midnight: a row dated here is exactly RetentionDays old and stays. */
const BOUNDARY_DAY = new Date('2026-10-20T00:00:00Z');
const KEPT_DAY = new Date('2026-11-10T00:00:00Z');
const OLD_DAYS = [new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'), new Date('2026-10-19T00:00:00Z')];
const SEEDED_AUTH = 'A0000000-0000-4000-8000-00000000AA01';
const CUSTOM_AUTH = 'A0000000-0000-4000-8000-00000000AA02';

/** One stored Feature Value row of the fake store. */
interface StoredValue {
  readonly ID: string;
  readonly BindingID: string;
  readonly Source: 'Model' | 'Pipeline' | 'Human';
  readonly EffectiveAsOf: Date;
}

/** A stored binding of the fake store. */
interface StoredBinding extends RetentionBindingRow {
  ViewAuthorizationID: string | null;
}

/** The fake store: bindings and Feature Values in memory; every delete recorded by entity name. */
class FakeRetentionStore implements IPredictionRetentionStore {
  public readonly Bindings: StoredBinding[] = [];
  public Values: StoredValue[] = [];
  /** The entity name of every delete, in order. */
  public readonly DeletedEntities: string[] = [];
  /** Feature Value IDs whose delete fails. */
  public readonly FailingDeletes = new Set<string>();
  /** The `max` of every batch read. */
  public readonly BatchSizes: number[] = [];

  public AddBinding(id: string, retentionDays: number | null, status: StoredBinding['Status'], viewAuthorizationId: string | null): StoredBinding {
    const b: StoredBinding = { ID: id, FeatureName: `feature ${id}`, Status: status, RetentionDays: retentionDays, ViewAuthorizationID: viewAuthorizationId };
    this.Bindings.push(b);
    return b;
  }

  public AddValues(bindingId: string, days: readonly Date[], source: StoredValue['Source'] = 'Model'): void {
    for (const d of days) this.Values.push({ ID: `${bindingId}-${source}-${d.toISOString()}-${this.Values.length}`, BindingID: bindingId, Source: source, EffectiveAsOf: d });
  }

  public ModelRows(binding: Pick<StoredBinding, 'ID'>): StoredValue[] {
    return this.Values.filter((v) => v.BindingID === binding.ID && v.Source === 'Model').sort((a, b) => a.EffectiveAsOf.getTime() - b.EffectiveAsOf.getTime());
  }

  public Get(id: string): StoredBinding {
    const b = this.Bindings.find((x) => UUIDsEqual(x.ID, id) || x.ID === id);
    if (!b) throw new Error(`no binding ${id}`);
    return b;
  }

  public async ReadRetainedBindings(): Promise<RetentionBindingRow[]> {
    return this.Bindings.filter((b) => b.RetentionDays !== null).map((b) => ({ ID: b.ID, FeatureName: b.FeatureName, Status: b.Status, RetentionDays: b.RetentionDays }));
  }

  public async ReadBindingsWithoutViewAuthorization(): Promise<UnauthorizedBinding[]> {
    return this.Bindings.filter((b) => b.ViewAuthorizationID === null).map((b) => ({
      ID: b.ID,
      Assign: async (authorizationId: string) => { b.ViewAuthorizationID = authorizationId; return null; },
    }));
  }

  public async DeleteExpiredModelRows(bindingId: string, before: Date, max: number, skipIDs: readonly string[]): Promise<RetentionBatchOutcome> {
    this.BatchSizes.push(max);
    const batch = this.ModelRows({ ID: bindingId })
      .filter((v) => v.EffectiveAsOf.getTime() < before.getTime() && !skipIDs.includes(v.ID))
      .slice(0, max);
    const failed = batch.filter((v) => this.FailingDeletes.has(v.ID));
    const failures = failed.map((v) => ({ ID: v.ID, Message: 'refused' }));
    const gone = new Set(batch.filter((v) => !this.FailingDeletes.has(v.ID)).map((v) => v.ID));
    this.Values = this.Values.filter((v) => !gone.has(v.ID));
    for (let i = 0; i < gone.size; i++) this.DeletedEntities.push('MJ: Feature Values');
    return { Read: batch.length, Deleted: gone.size, Failures: failures };
  }
}

/** The metadata double: only the authorizations the backfill looks up by name. */
class AuthorizationsProvider {
  public Authorizations: AuthorizationInfo[] = [
    new AuthorizationInfo({ ID: SEEDED_AUTH, Name: 'View Model Predictions', IsActive: true }),
    new AuthorizationInfo({ ID: CUSTOM_AUTH, Name: 'Custom Predictions', IsActive: true }),
  ];
  public Remove(name: string): void {
    this.Authorizations = this.Authorizations.filter((a) => a.Name !== name);
  }
}

let values: FakeRetentionStore;
let authorizations: AuthorizationsProvider;
let ctx: PredictionRetentionContext;
/** Every heartbeat the maintenance sent, in order. */
let heartbeats: number;
let active: StoredBinding;
let withdrawn: StoredBinding;
let unlimited: StoredBinding;
let boundary: StoredBinding;
let custom: StoredBinding;

beforeEach(() => {
  values = new FakeRetentionStore();
  authorizations = new AuthorizationsProvider();
  heartbeats = 0;
  ctx = { Authorizations: authorizations, Store: values, Heartbeat: async () => { heartbeats++; } };
  active = values.AddBinding('active', 30, 'Active', null);
  withdrawn = values.AddBinding('withdrawn', 30, 'Withdrawn', null);
  unlimited = values.AddBinding('unlimited', null, 'Active', SEEDED_AUTH);
  boundary = values.AddBinding('boundary', 30, 'Active', SEEDED_AUTH);
  custom = values.AddBinding('custom', 30, 'Active', CUSTOM_AUTH);
  values.AddValues(active.ID, [...OLD_DAYS, KEPT_DAY]);
  values.AddValues(withdrawn.ID, [...OLD_DAYS, KEPT_DAY]);
  values.AddValues(unlimited.ID, [...OLD_DAYS, BOUNDARY_DAY, KEPT_DAY]);
  values.AddValues(boundary.ID, [OLD_DAYS[2], BOUNDARY_DAY, KEPT_DAY]);
  values.AddValues(active.ID, OLD_DAYS, 'Pipeline');
});

/** The driver over the fake store, run on the sweep day. */
async function runDriver(): Promise<PredictionRetentionDetails> {
  const driver = new PredictiveStudioPredictionRetentionJobDriver();
  const details = await driver.Maintain(ctx, SWEEP_DAY);
  expect([details.BackfillFailures, details.DeleteFailures]).toEqual([[], 0]);
  return details;
}

describe('PredictiveStudioPredictionRetentionJobDriver', () => {
  it('deletes Model rows older than RetentionDays for an active and a withdrawn binding', async () => {
    await runDriver();
    expect(values.ModelRows(active).map((r) => r.EffectiveAsOf)).toEqual([KEPT_DAY]);
    expect(values.ModelRows(withdrawn).map((r) => r.EffectiveAsOf)).toEqual([KEPT_DAY]);
  });

  it('keeps every row when RetentionDays is null and never deletes a binding, model or pipeline', async () => {
    await runDriver();
    expect(values.ModelRows(unlimited)).toHaveLength(5);
    expect([...new Set(values.DeletedEntities)]).toEqual(['MJ: Feature Values']);
    expect(values.Bindings).toHaveLength(5);
    // Pipeline and Human rows of a binding's feature are never the sweep's.
    expect(values.Values.filter((v) => v.Source === 'Pipeline')).toHaveLength(3);
  });

  it('the cutoff is exact: a row RetentionDays old on the sweep date stays', async () => {
    await runDriver();
    expect(values.ModelRows(boundary).map((r) => r.EffectiveAsOf)).toEqual([BOUNDARY_DAY, KEPT_DAY]);
    expect(PredictionRetention.Cutoff(SWEEP_DAY, 30).toISOString()).toBe(BOUNDARY_DAY.toISOString());
  });

  it('writes the counts per binding to the run\'s Details, in batches of 1,000', async () => {
    const details = await runDriver();
    expect(details.Bindings.map((b) => [b.BindingID, b.Status, b.Deleted])).toEqual([['active', 'Active', 3], ['withdrawn', 'Withdrawn', 3], ['boundary', 'Active', 1], ['custom', 'Active', 0]]);
    expect([details.Deleted, details.DeleteFailures, details.BackfilledBindings, details.AuthorizationLoaded]).toEqual([7, 0, 2, true]);
    expect(new Set(values.BatchSizes)).toEqual(new Set([PredictionRetention.BatchSize]));
  });

  it('a batch of 1,000 is followed by another until the expired rows are gone', async () => {
    const many = Array.from({ length: PredictionRetention.BatchSize + 5 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 60_000));
    values.AddValues(custom.ID, many);
    const details = await runDriver();
    expect(details.Bindings.find((b) => b.BindingID === 'custom')?.Deleted).toBe(PredictionRetention.BatchSize + 5);
    expect(values.ModelRows(custom)).toEqual([]);
  });

  it('a row whose delete fails is counted, fails the run and does not loop the sweep', async () => {
    const [first] = values.ModelRows(active);
    values.FailingDeletes.add(first.ID);
    const result = await new PredictiveStudioPredictionRetentionJobDriver().RunMaintenance(ctx, SWEEP_DAY);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('1 prediction delete(s) failed');
    expect(values.ModelRows(active).map((r) => r.EffectiveAsOf)).toEqual([OLD_DAYS[0], KEPT_DAY]);
  });

  it('a row whose delete keeps failing is tried and reported once, and the rows behind it are still swept', async () => {
    const many = Array.from({ length: PredictionRetention.BatchSize + 5 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 60_000));
    values.AddValues(custom.ID, many);
    const [oldest] = values.ModelRows(custom);
    values.FailingDeletes.add(oldest.ID);
    const details = await new PredictiveStudioPredictionRetentionJobDriver().Maintain(ctx, SWEEP_DAY);
    const swept = details.Bindings.find((b) => b.BindingID === 'custom');
    expect(swept?.Failures).toEqual([`${oldest.ID}: refused`]);
    expect(swept?.Deleted).toBe(PredictionRetention.BatchSize + 4);
    expect(values.ModelRows(custom).map((r) => r.ID)).toEqual([oldest.ID]);
  });

  it('renews the job lease once per binding and once per batch', async () => {
    const many = Array.from({ length: PredictionRetention.BatchSize + 5 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 60_000));
    values.AddValues(custom.ID, many);
    await runDriver();
    // Four bindings with a RetentionDays: one beat each; batches: active 1, withdrawn 1, boundary 1, custom 2.
    expect(heartbeats).toBe(4 + 5);
  });
});

describe('PredictionRetention.BackfillBindingViewAuthorization', () => {
  it('backfills the seeded authorization on bindings without one, once, and leaves others untouched', async () => {
    expect(await PredictionRetention.BackfillBindingViewAuthorization(ctx)).toBe(2);
    expect(await PredictionRetention.BackfillBindingViewAuthorization(ctx)).toBe(0);
    expect(values.Get(custom.ID).ViewAuthorizationID).toBe(CUSTOM_AUTH);
    expect([values.Get(active.ID).ViewAuthorizationID, values.Get(withdrawn.ID).ViewAuthorizationID]).toEqual([SEEDED_AUTH, SEEDED_AUTH]);
  });

  it('changes nothing and raises nothing when the authorization is not loaded yet', async () => {
    authorizations.Remove('View Model Predictions');
    expect(await PredictionRetention.BackfillBindingViewAuthorization(ctx)).toBe(0);
    expect(values.Bindings.filter((b) => b.ViewAuthorizationID === null).map((b) => b.ID)).toEqual(['active', 'withdrawn']);
  });
});

describe('PredictionRetention.ExpiredFilter', () => {
  it('selects the binding\'s Model rows strictly before the cutoff', () => {
    expect(PredictionRetention.ExpiredFilter("o'brien", BOUNDARY_DAY))
      .toBe(`MLModelScoringBindingID = 'o''brien' AND Source = 'Model' AND EffectiveAsOf < '2026-10-20T00:00:00.000Z'`);
  });

  it('leaves out the rows whose delete already failed this run', () => {
    expect(PredictionRetention.ExpiredFilter('b', BOUNDARY_DAY, ['x1', "x'2"]))
      .toBe(`MLModelScoringBindingID = 'b' AND Source = 'Model' AND EffectiveAsOf < '2026-10-20T00:00:00.000Z' AND ID NOT IN ('x1', 'x''2')`);
  });
});
