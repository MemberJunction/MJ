/**
 * Tests for the recently opened dashboards helper (`shared/dashboard-recents.ts`): the pure
 * ordering over record logs, the read from UserInfoEngine's record-log cache, and the change
 * signal that fires when that cache reloads after a dashboard open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import type { EngineDataChangeEvent, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import {
  DashboardRecordLog,
  DASHBOARDS_ENTITY_NAME,
  GetRecentDashboardIds,
  IsRecordLogChange,
  ObserveRecentDashboardChanges,
  OrderRecentDashboardIds,
} from '../shared/dashboard-recents';

const hoisted = vi.hoisted(() => ({ engine: null as unknown }));

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    get Instance() {
      return hoisted.engine;
    },
  },
}));

const DASHBOARDS_ENTITY_ID = 'E0000000-0000-4000-8000-00000000da5b';

const log = (RecordID: string, LatestAt: string): DashboardRecordLog => ({ RecordID, LatestAt: new Date(LatestAt) });

/** A record-log source holding dashboard logs, and a change stream the test drives. */
function fakeSource(logs: DashboardRecordLog[] = [], permissionConstrained = false) {
  const changes = new Subject<EngineDataChangeEvent>();
  const source = {
    IsPermissionConstrained: permissionConstrained,
    DataChange$: changes.asObservable(),
    GetRecentRecordsForEntity: vi.fn((entityId: string, _maxItems?: number): DashboardRecordLog[] =>
      entityId === DASHBOARDS_ENTITY_ID ? logs : []
    ),
  };
  return { source, changes };
}

function provider(knowsDashboards = true): IMetadataProvider {
  const dashboards = { ID: DASHBOARDS_ENTITY_ID, Name: DASHBOARDS_ENTITY_NAME } as unknown as EntityInfo;
  return {
    EntityByName: vi.fn((name: string) => (knowsDashboards && name === DASHBOARDS_ENTITY_NAME ? dashboards : undefined)),
  } as unknown as IMetadataProvider;
}

const changeFor = (EntityName: string): EngineDataChangeEvent =>
  ({ config: { EntityName, PropertyName: '_x' }, changeType: 'refresh', data: [] }) as unknown as EngineDataChangeEvent;

describe('OrderRecentDashboardIds', () => {
  it('orders by LatestAt, most recent first, whatever the input order', () => {
    const logs = [log('A', '2026-09-01'), log('C', '2026-09-03'), log('B', '2026-09-02')];
    expect(OrderRecentDashboardIds(logs)).toEqual(['C', 'B', 'A']);
  });

  it('lists each dashboard once, comparing ids with UUIDsEqual and keeping the newest', () => {
    const logs = [
      log('d0000000-0000-4000-8000-000000000001', '2026-09-01'),
      log('D0000000-0000-4000-8000-000000000002', '2026-09-02'),
      log('D0000000-0000-4000-8000-000000000001', '2026-09-03'),
    ];
    expect(OrderRecentDashboardIds(logs)).toEqual(['D0000000-0000-4000-8000-000000000001', 'D0000000-0000-4000-8000-000000000002']);
  });

  it('returns at most maxItems ids, counting distinct dashboards', () => {
    const logs = [log('A', '2026-09-05'), log('a', '2026-09-04'), log('B', '2026-09-03'), log('C', '2026-09-02')];
    expect(OrderRecentDashboardIds(logs, 2)).toEqual(['A', 'B']);
  });

  it('returns every dashboard when maxItems is omitted', () => {
    const logs = Array.from({ length: 40 }, (_, i) => log(`D-${i}`, `2026-01-01T00:00:${String(59 - i).padStart(2, '0')}Z`));
    expect(OrderRecentDashboardIds(logs)).toHaveLength(40);
  });

  it('skips logs without a record id, and keeps the input order for equal times', () => {
    const logs = [log('', '2026-09-09'), log('A', '2026-09-01'), log('B', '2026-09-01')];
    expect(OrderRecentDashboardIds(logs)).toEqual(['A', 'B']);
  });

  it('returns an empty list for no logs or a max of 0', () => {
    expect(OrderRecentDashboardIds([])).toEqual([]);
    expect(OrderRecentDashboardIds([log('A', '2026-09-01')], 0)).toEqual([]);
  });
});

describe('GetRecentDashboardIds', () => {
  it('reads every log of the MJ: Dashboards entity, resolving its id from the metadata', () => {
    const { source } = fakeSource([log('A', '2026-09-01'), log('B', '2026-09-02')]);
    const md = provider();

    expect(GetRecentDashboardIds(md, undefined, source)).toEqual(['B', 'A']);
    expect(md.EntityByName).toHaveBeenCalledWith('MJ: Dashboards');
    expect(source.GetRecentRecordsForEntity).toHaveBeenCalledWith(DASHBOARDS_ENTITY_ID, Number.MAX_SAFE_INTEGER);
  });

  it('applies maxItems after removing repeats', () => {
    const { source } = fakeSource([log('A', '2026-09-03'), log('a', '2026-09-02'), log('B', '2026-09-01')]);
    expect(GetRecentDashboardIds(provider(), 2, source)).toEqual(['A', 'B']);
  });

  it('returns an empty list when the metadata has no MJ: Dashboards entity', () => {
    const { source } = fakeSource([log('A', '2026-09-01')]);
    expect(GetRecentDashboardIds(provider(false), undefined, source)).toEqual([]);
    expect(source.GetRecentRecordsForEntity).not.toHaveBeenCalled();
  });

  it('returns an empty list without reading when the user cannot read the record logs', () => {
    const { source } = fakeSource([log('A', '2026-09-01')], true);
    expect(GetRecentDashboardIds(provider(), undefined, source)).toEqual([]);
    expect(source.GetRecentRecordsForEntity).not.toHaveBeenCalled();
  });

  describe('with the default source', () => {
    beforeEach(() => {
      hoisted.engine = fakeSource([log('X', '2026-09-01')]).source;
    });

    it('reads UserInfoEngine.Instance', () => {
      expect(GetRecentDashboardIds(provider())).toEqual(['X']);
    });
  });
});

describe('ObserveRecentDashboardChanges', () => {
  it('emits when the record-log cache changes and ignores other caches', () => {
    const { source, changes } = fakeSource();
    let count = 0;
    const subscription = ObserveRecentDashboardChanges(source).subscribe(() => count++);

    changes.next(changeFor('MJ: User Settings'));
    changes.next(changeFor('MJ: User Record Logs'));
    changes.next(changeFor('MJ: User Favorites'));

    expect(count).toBe(1);
    subscription.unsubscribe();
  });

  it('observes UserInfoEngine.Instance by default', () => {
    const fake = fakeSource();
    hoisted.engine = fake.source;
    let count = 0;
    const subscription = ObserveRecentDashboardChanges().subscribe(() => count++);

    fake.changes.next(changeFor('MJ: User Record Logs'));

    expect(count).toBe(1);
    subscription.unsubscribe();
  });
});

describe('IsRecordLogChange', () => {
  it('matches the MJ: User Record Logs entity without regard to case or spaces', () => {
    expect(IsRecordLogChange(changeFor('MJ: User Record Logs'))).toBe(true);
    expect(IsRecordLogChange(changeFor(' mj: user record logs '))).toBe(true);
    expect(IsRecordLogChange(changeFor('MJ: User Settings'))).toBe(false);
  });

  it('is false for a config without an entity name', () => {
    expect(IsRecordLogChange({ config: {}, changeType: 'refresh', data: [] } as unknown as EngineDataChangeEvent)).toBe(false);
  });
});
