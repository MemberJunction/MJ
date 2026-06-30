import { describe, it, expect } from 'vitest';
import type { BaseEntity, UserInfo, IMetadataProvider } from '@memberjunction/core';

import { MetadataEntityFactory } from '../seams';
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
