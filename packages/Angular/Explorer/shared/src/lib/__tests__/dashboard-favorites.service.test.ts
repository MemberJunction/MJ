import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Metadata } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

const mocks = vi.hoisted(() => ({
  engine: {
    IsPermissionConstrained: false,
    UserFavorites: [] as Array<{ Entity: string; RecordID: string }>,
    Config: vi.fn(),
  },
  getProviderInstance: vi.fn(),
}));

vi.mock('@angular/core', () => ({ Injectable: () => (target: Function) => target }));
// The entity-name mapping itself is covered by dashboard-favorites.test.ts with the real helper.
vi.mock('@memberjunction/ng-shared-generic', () => ({
  ResourceTypeForEntity: (name: string) => (name.replace(/^MJ: /, '') === 'Dashboards' ? 'dashboard' : 'record'),
}));
vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: { Instance: mocks.engine, GetProviderInstance: mocks.getProviderInstance },
}));

import { DashboardFavoritesService } from '../dashboard-favorites.service';

const user = { ID: 'u1' } as UserInfo;

function createProvider() {
  const setStatus = vi.fn<IMetadataProvider['SetRecordFavoriteStatus']>(async () => undefined);
  const provider = { CurrentUser: user, SetRecordFavoriteStatus: setStatus } as unknown as IMetadataProvider;
  return { provider, setStatus };
}

describe('DashboardFavoritesService', () => {
  const { engine, getProviderInstance } = mocks;
  let provider: IMetadataProvider;
  let setStatus: ReturnType<typeof createProvider>['setStatus'];
  let service: DashboardFavoritesService;

  beforeEach(() => {
    engine.IsPermissionConstrained = false;
    engine.UserFavorites = [];
    engine.Config.mockReset();
    getProviderInstance.mockReset();
    getProviderInstance.mockReturnValue(engine);
    ({ provider, setStatus } = createProvider());
    service = new DashboardFavoritesService();
    service.Provider = provider;
  });

  it('lists only dashboard favorites, once each, in the engine order', () => {
    engine.UserFavorites = [
      { Entity: 'MJ: Dashboards', RecordID: 'd2' },
      { Entity: 'MJ: Accounts', RecordID: 'a1' },
      { Entity: 'MJ: Dashboards', RecordID: 'd1' },
      { Entity: 'MJ: Dashboards', RecordID: 'D2' },
    ];
    expect(service.FavoriteIds()).toEqual(['d2', 'd1']);
    expect(service.IsFavorite('D1')).toBe(true);
    expect(service.IsFavorite('a1')).toBe(false);
  });

  it('returns no favorites when the engine is permission-constrained', () => {
    engine.IsPermissionConstrained = true;
    engine.UserFavorites = [{ Entity: 'MJ: Dashboards', RecordID: 'd1' }];
    expect(service.FavoriteIds()).toEqual([]);
  });

  it('saves the favorite on MJ: Dashboards, reloads the cache, then emits Changed$', async () => {
    const order: string[] = [];
    setStatus.mockImplementation(async () => { order.push('save'); });
    engine.Config.mockImplementation(async () => { order.push('reload'); });
    service.Changed$.subscribe(() => order.push('changed'));

    await service.SetFavorite('d1', true);

    const [userId, entityName, key, isFavorite, contextUser] = setStatus.mock.calls[0];
    expect([userId, entityName, isFavorite, contextUser]).toEqual(['u1', 'MJ: Dashboards', true, user]);
    expect(key.GetValueByFieldName('ID')).toBe('d1');
    expect(engine.Config).toHaveBeenCalledWith(true, user, provider);
    expect(order).toEqual(['save', 'reload', 'changed']);
  });

  it('toggles to the opposite state and returns it', async () => {
    engine.UserFavorites = [{ Entity: 'MJ: Dashboards', RecordID: 'd1' }];
    expect(await service.Toggle('d1')).toBe(false);
    expect(await service.Toggle('d2')).toBe(true);
    expect(setStatus.mock.calls.map(call => call[3])).toEqual([false, true]);
  });

  it('applies quick repeated toggles one at a time, so they alternate', async () => {
    let stored: string[] = [];
    setStatus.mockImplementation(async (_userId, _entityName, key, isFavorite) => {
      const id = String(key.GetValueByFieldName('ID'));
      stored = isFavorite ? [...stored, id] : stored.filter(s => !UUIDsEqual(s, id));
    });
    engine.Config.mockImplementation(async () => {
      engine.UserFavorites = stored.map(id => ({ Entity: 'MJ: Dashboards', RecordID: id }));
    });

    const states = await Promise.all([service.Toggle('d1'), service.Toggle('d1')]);

    expect(setStatus.mock.calls.map(call => call[3])).toEqual([true, false]);
    expect(states).toEqual([true, false]);
    expect(service.FavoriteIds()).toEqual([]);
  });

  it('keeps accepting writes after a failed write', async () => {
    setStatus.mockRejectedValueOnce(new Error('Network error'));

    await expect(service.SetFavorite('d1', true)).rejects.toThrow('Network error');
    await service.SetFavorite('d2', true);

    expect(setStatus).toHaveBeenCalledTimes(2);
    expect(setStatus.mock.calls[1][3]).toBe(true);
  });

  it('reads the engine for the provider it was given', () => {
    service.FavoriteIds();
    expect(getProviderInstance).toHaveBeenCalledWith(provider, UserInfoEngine);
  });

  it('uses the global provider and engine instance when no provider is set', async () => {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(provider);
    const globalService = new DashboardFavoritesService();

    await globalService.SetFavorite('d1', false);

    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(engine.Config).toHaveBeenCalledWith(true, user, provider);
    expect(getProviderInstance).not.toHaveBeenCalled();
  });
});
