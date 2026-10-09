/**
 * Tests for the recently opened dashboards helper (`shared/dashboard-recents.ts`): the pure
 * ordering over record logs, the query of the user's MJ: Dashboards record logs, and the stream that
 * reads them again each time its trigger emits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  DashboardRecordLog,
  DASHBOARDS_ENTITY_NAME,
  LoadRecentDashboardIds,
  ObserveRecentDashboardIds,
  OrderRecentDashboardIds,
} from '../shared/dashboard-recents';

const hoisted = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: hoisted.logError,
}));

const DASHBOARDS_ENTITY_ID = 'E0000000-0000-4000-8000-00000000da5b';
const USER_ID = 'U0000000-0000-4000-8000-000000000001';

const log = (RecordID: string, LatestAt: string): DashboardRecordLog => ({ RecordID, LatestAt: new Date(LatestAt) });

/** The provider double: its metadata, its current user, and a RunView that answers with `result`. */
interface ProviderOptions {
  knowsDashboards?: boolean;
  user?: Pick<UserInfo, 'ID'> | null;
  result?: Partial<RunViewResult<DashboardRecordLog>>;
}

function provider(options: ProviderOptions = {}) {
  const { knowsDashboards = true, user = { ID: USER_ID }, result = { Success: true, Results: [] } } = options;
  const dashboards = { ID: DASHBOARDS_ENTITY_ID, Name: DASHBOARDS_ENTITY_NAME } as unknown as EntityInfo;
  const runView = vi.fn(async (_params: RunViewParams): Promise<RunViewResult<DashboardRecordLog>> => ({
    Success: true,
    Results: [],
    RowCount: result.Results?.length ?? 0,
    TotalRowCount: result.Results?.length ?? 0,
    ExecutionTime: 0,
    ErrorMessage: '',
    ...result,
  }) as RunViewResult<DashboardRecordLog>);
  const md = {
    CurrentUser: user,
    EntityByName: vi.fn((name: string) => (knowsDashboards && name === DASHBOARDS_ENTITY_NAME ? dashboards : undefined)),
    RunView: runView,
  } as unknown as IMetadataProvider;
  return { md, runView };
}

beforeEach(() => {
  hoisted.logError.mockClear();
});

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

  it('orders a LatestAt given as text, as a simple RunView row carries it', () => {
    const logs: DashboardRecordLog[] = [
      { RecordID: 'A', LatestAt: '2026-09-01T10:00:00Z' },
      { RecordID: 'B', LatestAt: '2026-09-02T10:00:00Z' },
    ];
    expect(OrderRecentDashboardIds(logs)).toEqual(['B', 'A']);
  });

  it('returns an empty list for no logs or a max of 0', () => {
    expect(OrderRecentDashboardIds([])).toEqual([]);
    expect(OrderRecentDashboardIds([log('A', '2026-09-01')], 0)).toEqual([]);
  });
});

describe('LoadRecentDashboardIds', () => {
  it("reads the current user's record logs of the MJ: Dashboards entity, newest first", async () => {
    const { md, runView } = provider({ result: { Success: true, Results: [log('A', '2026-09-01'), log('B', '2026-09-02')] } });

    await expect(LoadRecentDashboardIds(md)).resolves.toEqual(['B', 'A']);
    expect(md.EntityByName).toHaveBeenCalledWith('MJ: Dashboards');
    expect(runView).toHaveBeenCalledTimes(1);
    expect(runView.mock.calls[0][0]).toEqual({
      EntityName: 'MJ: User Record Logs',
      ExtraFilter: `UserID='${USER_ID}' AND EntityID='${DASHBOARDS_ENTITY_ID}'`,
      OrderBy: 'LatestAt DESC',
      Fields: ['RecordID', 'LatestAt'],
      ResultType: 'simple',
    });
  });

  it('escapes the user id in the filter', async () => {
    const { md, runView } = provider({ user: { ID: "U'1" } });

    await LoadRecentDashboardIds(md);

    expect(runView.mock.calls[0][0].ExtraFilter).toBe(`UserID='U''1' AND EntityID='${DASHBOARDS_ENTITY_ID}'`);
  });

  it('applies maxItems after removing repeats', async () => {
    const { md } = provider({ result: { Success: true, Results: [log('A', '2026-09-03'), log('a', '2026-09-02'), log('B', '2026-09-01')] } });
    await expect(LoadRecentDashboardIds(md, 2)).resolves.toEqual(['A', 'B']);
  });

  it('returns an empty list without reading when the metadata has no MJ: Dashboards entity', async () => {
    const { md, runView } = provider({ knowsDashboards: false });
    await expect(LoadRecentDashboardIds(md)).resolves.toEqual([]);
    expect(runView).not.toHaveBeenCalled();
  });

  it('returns an empty list without reading when there is no current user', async () => {
    const { md, runView } = provider({ user: null });
    await expect(LoadRecentDashboardIds(md)).resolves.toEqual([]);
    expect(runView).not.toHaveBeenCalled();
  });

  it('returns an empty list and logs the error when the read fails, as when the user cannot read the record logs', async () => {
    const { md } = provider({ result: { Success: false, Results: [], ErrorMessage: 'denied' } });

    await expect(LoadRecentDashboardIds(md)).resolves.toEqual([]);
    expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('denied'));
  });

  it('returns an empty list and logs the error when the read throws', async () => {
    const { md, runView } = provider();
    runView.mockRejectedValueOnce(new Error('network down'));
    await expect(LoadRecentDashboardIds(md)).resolves.toEqual([]);
    expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('network down'));
  });
});

describe('ObserveRecentDashboardIds', () => {
  it('reads the ids again each time the trigger emits', async () => {
    const trigger = new Subject<void>();
    const load = vi.fn(async () => ['A']);
    const seen: string[][] = [];
    const subscription = ObserveRecentDashboardIds(provider().md, trigger, load).subscribe((ids) => seen.push(ids));

    trigger.next();
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    trigger.next();
    await vi.waitFor(() => expect(seen).toHaveLength(2));

    expect(load).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([['A'], ['A']]);
    subscription.unsubscribe();
  });

  it('drops a read that a newer emission overtakes', async () => {
    const trigger = new Subject<void>();
    const answers: Array<(ids: string[]) => void> = [];
    const load = vi.fn(() => new Promise<string[]>((resolve) => answers.push(resolve)));
    const seen: string[][] = [];
    const subscription = ObserveRecentDashboardIds(provider().md, trigger, load).subscribe((ids) => seen.push(ids));

    trigger.next();
    trigger.next();
    answers[1](['NEW']);
    answers[0](['OLD']);
    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([['NEW']]);
    subscription.unsubscribe();
  });

  it('reads with LoadRecentDashboardIds by default', async () => {
    const { md, runView } = provider({ result: { Success: true, Results: [log('X', '2026-09-01')] } });
    const trigger = new Subject<void>();
    const seen: string[][] = [];
    const subscription = ObserveRecentDashboardIds(md, trigger).subscribe((ids) => seen.push(ids));

    trigger.next();
    await vi.waitFor(() => expect(seen).toEqual([['X']]));

    expect(runView).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('still delivers ids on a later RecentItems emission after a read throws', async () => {
    const { md, runView } = provider({ result: { Success: true, Results: [log('X', '2026-09-01')] } });
    runView.mockRejectedValueOnce(new Error('network down'));
    // Stands for RecentAccessService.RecentItems, the trigger the Library passes.
    const recentItems = new Subject<void>();
    const seen: string[][] = [];
    const subscription = ObserveRecentDashboardIds(md, recentItems).subscribe({
      next: (ids) => seen.push(ids),
      error: () => seen.push(['stream errored']),
    });

    recentItems.next();
    await vi.waitFor(() => expect(seen).toEqual([[]]));
    expect(hoisted.logError).toHaveBeenCalledWith(expect.stringContaining('network down'));

    recentItems.next();
    await vi.waitFor(() => expect(seen).toEqual([[], ['X']]));

    expect(runView).toHaveBeenCalledTimes(2);
    expect(subscription.closed).toBe(false);
    subscription.unsubscribe();
  });
});
