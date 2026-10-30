import { describe, it, expect } from 'vitest';
import type { BaseEntity, UserInfo, IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';

import { MetadataEntityFactory, RunViewRecordLoader } from '../seams';
import { MetadataExperimentEntityFactory } from '../../experiment/seams';

/**
 * H7 regression — the production entity factories must HONOR an injected
 * `IMetadataProvider` (multi-provider correctness) rather than silently falling
 * back to the global `new Metadata()`. When a provider is supplied the factory
 * MUST call `provider.GetEntityObject(...)` and default the context user to the
 * provider's `CurrentUser` when none is passed. No live DB — the provider is a
 * minimal spy double exposing only the members the factory touches.
 */

interface FakeEntity extends BaseEntity {
  __tag: string;
}

/** A spy provider capturing GetEntityObject calls and returning a tagged entity. */
class SpyProvider {
  public Calls: Array<{ entityName: string; contextUser?: UserInfo }> = [];
  public readonly CurrentUser = { Email: 'provider-user@example.com' } as UserInfo;

  public async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
    this.Calls.push({ entityName, contextUser });
    return { __tag: `from-provider:${entityName}` } as unknown as T;
  }
}

/** Cast the spy to the structural provider type the factory depends on (test boundary). */
function asProvider(spy: SpyProvider): IMetadataProvider {
  return spy as unknown as IMetadataProvider;
}

describe('MetadataEntityFactory — honors injected provider (H7)', () => {
  it('routes through provider.GetEntityObject and defaults to provider.CurrentUser', async () => {
    const spy = new SpyProvider();
    const factory = new MetadataEntityFactory(asProvider(spy));

    const entity = await factory.getEntityObject<FakeEntity>('MJ: ML Models');

    expect(entity.__tag).toBe('from-provider:MJ: ML Models');
    expect(spy.Calls).toHaveLength(1);
    expect(spy.Calls[0].entityName).toBe('MJ: ML Models');
    // No explicit context user → falls back to the provider's CurrentUser.
    expect(spy.Calls[0].contextUser).toBe(spy.CurrentUser);
  });

  it('passes an explicit context user through to the provider', async () => {
    const spy = new SpyProvider();
    const factory = new MetadataEntityFactory(asProvider(spy));
    const user = { Email: 'explicit@example.com' } as UserInfo;

    await factory.getEntityObject<FakeEntity>('MJ: ML Training Pipelines', user);

    expect(spy.Calls[0].contextUser).toBe(user);
  });
});

describe('MetadataExperimentEntityFactory — honors injected provider (H7)', () => {
  it('routes through provider.GetEntityObject and defaults to provider.CurrentUser', async () => {
    const spy = new SpyProvider();
    const factory = new MetadataExperimentEntityFactory(asProvider(spy));

    const entity = await factory.getEntityObject<FakeEntity>('MJ: Experiments');

    expect(entity.__tag).toBe('from-provider:MJ: Experiments');
    expect(spy.Calls).toHaveLength(1);
    expect(spy.Calls[0].contextUser).toBe(spy.CurrentUser);
  });
});

describe('RunViewRecordLoader.ResolveAlgorithmIdForDriver', () => {
  /** A provider serving the given `MJ: ML Algorithms` rows to RunView and recording each request. */
  class AlgorithmRowsProvider {
    public Requests: RunViewParams[] = [];
    constructor(private readonly rows: ReadonlyArray<{ ID: string; Name: string }>, private readonly success = true) {}
    public async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
      this.Requests.push(params);
      const results = this.rows as unknown as T[];
      return { Success: this.success, Results: this.success ? results : [], RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: this.success ? '' : 'database unavailable' };
    }
  }
  const user = { ID: 'U-1' } as UserInfo;
  const resolve = (p: AlgorithmRowsProvider, key: string) => new RunViewRecordLoader().ResolveAlgorithmIdForDriver(key, user, p as unknown as IMetadataProvider);

  it('reads one catalog row by DriverClass (at most two rows) and returns its ID', async () => {
    const provider = new AlgorithmRowsProvider([{ ID: 'B4B84DB7-C255-4118-BE36-7A0489A5AFCE', Name: 'Logistic Regression' }]);
    await expect(resolve(provider, 'logistic_regression')).resolves.toBe('B4B84DB7-C255-4118-BE36-7A0489A5AFCE');
    expect(provider.Requests).toEqual([expect.objectContaining({ EntityName: 'MJ: ML Algorithms', ExtraFilter: "DriverClass='logistic_regression'", MaxRows: 2, ResultType: 'simple' })]);
  });

  it('returns null when no catalog row has the driver, and escapes the key in the filter', async () => {
    const provider = new AlgorithmRowsProvider([]);
    await expect(resolve(provider, "poisson'_glm")).resolves.toBeNull();
    expect(provider.Requests[0].ExtraFilter).toBe("DriverClass='poisson''_glm'");
  });

  it('refuses two catalog rows with the same driver, naming both', async () => {
    const provider = new AlgorithmRowsProvider([{ ID: 'A1', Name: 'Ridge Regression' }, { ID: 'A2', Name: 'Ridge (copy)' }]);
    await expect(resolve(provider, 'ridge')).rejects.toThrow("Driver 'ridge' matches more than one MJ: ML Algorithms row: 'Ridge Regression' (a1) and 'Ridge (copy)' (a2); the shipped model's algorithm is ambiguous.");
  });

  it('throws when the catalog read fails (a failed read is not "no row")', async () => {
    await expect(resolve(new AlgorithmRowsProvider([], false), 'ridge')).rejects.toThrow("Reading MJ: ML Algorithms for driver 'ridge' failed: database unavailable");
  });
});
