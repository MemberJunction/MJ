import { describe, it, expect } from 'vitest';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { BuildHomeDashboardStrip } from '../Home/home-dashboards-strip.helpers';

const ME = 'user-me';
const d = (ID: string, UserID: string, Type = 'Config') => ({ ID, UserID, Type, Name: ID } as unknown as MJDashboardEntity);

const MINE = d('mine', ME);
const SHARED = d('shared', 'user-ana');
const OTHER_SHARED = d('other-shared', 'user-bo');
const CODE = d('code', ME, 'Code');
const DYNAMIC_CODE = d('dynamic', 'user-ana', 'Dynamic Code');
const ACCESSIBLE = [MINE, SHARED, OTHER_SHARED, CODE, DYNAMIC_CODE];

const ids = (dashboards: MJDashboardEntity[]) => dashboards.map(x => x.ID);

describe('BuildHomeDashboardStrip', () => {
  it('continues with the most recently opened dashboard', () => {
    expect(BuildHomeDashboardStrip(ACCESSIBLE, ['shared', 'mine'], [], ME).Continue).toBe(SHARED);
  });

  it('skips recent ids the user can no longer open and dashboards that are not Config', () => {
    const strip = BuildHomeDashboardStrip(ACCESSIBLE, ['deleted', 'code', 'dynamic', 'other-shared', 'mine'], [], ME);
    expect(strip.Continue).toBe(OTHER_SHARED);
  });

  it('matches recent ids in any letter case', () => {
    const upper = d('AAAA-0001', ME);
    expect(BuildHomeDashboardStrip([upper], ['aaaa-0001'], [], ME).Continue).toBe(upper);
  });

  it('has no Continue dashboard when nothing opened is available', () => {
    expect(BuildHomeDashboardStrip(ACCESSIBLE, [], [], ME).Continue).toBeNull();
    expect(BuildHomeDashboardStrip(ACCESSIBLE, ['deleted', 'code'], [], ME).Continue).toBeNull();
  });

  it('lists the favorite Config dashboards in favorites order, skipping ids the user cannot open', () => {
    const strip = BuildHomeDashboardStrip(ACCESSIBLE, [], ['other-shared', 'gone', 'code', 'MINE'], ME);
    expect(ids(strip.Favorites)).toEqual(['other-shared', 'mine']);
  });

  it('counts the Config dashboards the user can open, and those other people own', () => {
    const strip = BuildHomeDashboardStrip(ACCESSIBLE, [], [], ME);
    expect(strip.TotalCount).toBe(3);
    expect(strip.SharedCount).toBe(2);
  });

  it('compares the owner id in any letter case', () => {
    expect(BuildHomeDashboardStrip([d('a', 'USER-ME'), SHARED], [], [], ME).SharedCount).toBe(1);
  });

  it('returns an empty strip when the user can open no dashboards', () => {
    expect(BuildHomeDashboardStrip([], ['mine'], ['mine'], ME)).toEqual({ Continue: null, Favorites: [], TotalCount: 0, SharedCount: 0 });
  });

  it('does not change the input list', () => {
    const accessible = [...ACCESSIBLE];
    BuildHomeDashboardStrip(accessible, ['mine'], ['shared'], ME);
    expect(accessible).toEqual(ACCESSIBLE);
  });
});
