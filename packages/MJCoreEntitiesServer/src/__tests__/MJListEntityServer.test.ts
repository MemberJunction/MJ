import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefresh = vi.fn();
const mockReconcile = vi.fn();
const mockDeleteRoutine = vi.fn();
const writes: Array<Record<string, unknown>> = [];

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    /** Stands in for the generated base: plain fields, dirty tracking, and a Save that records the write. */
    class StubList {
        public ID = 'list-1';
        public Name = 'Members';
        public UserID = 'owner-1';
        public SourceViewID: string | null = null;
        public SourceQueryID: string | null = null;
        public SourceQueryKeyField: string | null = null;
        public SourceFingerprint: string | null = 'fp-linked';
        public AutoRefresh = false;
        public RefreshRoutineID: string | null = null;
        public IsSaved = true;
        public ContextCurrentUser: { ID: string } | undefined = { ID: 'owner-1' };
        public ProviderToUse = {};
        public LatestResult = { CompleteMessage: '' };
        public History: Array<{ Success: boolean; Message: string }> = [];
        public dirty = new Set<string>();
        public saveSucceeds = true;
        public deleted = false;

        public static UserCanDelete(ownerID: string, user?: { ID: string }): boolean {
            return !!user && ownerID === user.ID;
        }
        public GetFieldByName(name: string) { return { Dirty: this.dirty.has(name) }; }
        public RegisterResultHistoryEntry(entry: { Success: boolean; Message: string }) { this.History.push(entry); }
        public Validate() { return { Success: true, Errors: [] as unknown[] }; }
        public async Save(): Promise<boolean> {
            if (!this.saveSucceeds) return false;
            writes.push({ SourceFingerprint: this.SourceFingerprint, RefreshRoutineID: this.RefreshRoutineID, AutoRefresh: this.AutoRefresh });
            this.dirty.clear();
            this.IsSaved = true;
            return true;
        }
        public async Delete(): Promise<boolean> {
            this.deleted = true;
            return true;
        }
    }
    return { ...actual, MJListEntityExtended: StubList };
});

vi.mock('@memberjunction/lists', () => ({
    ListOperations: class {
        RefreshFromSource(...args: unknown[]) { return mockRefresh(...args); }
    },
}));

vi.mock('../custom/list-refresh/ListRefreshRoutine', () => ({
    ListRefreshRoutine: class {
        ReconcileAsync(list: unknown) { return mockReconcile(list); }
        DeleteAsync(id: string) { return mockDeleteRoutine(id); }
    },
}));

import { MJListEntityServer } from '../custom/MJListEntityServer.server';

type TestList = MJListEntityServer & { dirty: Set<string>; History: Array<{ Success: boolean; Message: string }>; saveSucceeds: boolean; deleted: boolean };

function makeList(fields: Partial<Record<string, unknown>> = {}, dirty: string[] = []): TestList {
    const list = Reflect.construct(MJListEntityServer as unknown as new () => TestList, []);
    Object.assign(list, fields);
    for (const f of dirty) list.dirty.add(f);
    return list;
}

beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    mockRefresh.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: 'ok' });
    mockReconcile.mockResolvedValue(null);
    mockDeleteRoutine.mockResolvedValue(undefined);
});

describe('MJListEntityServer — linking a source', () => {
    it('fills an existing list from its newly linked source, adding records only', async () => {
        const list = makeList({ SourceViewID: 'view-1' }, ['SourceViewID']);
        expect(await list.Save()).toBe(true);
        expect(mockRefresh).toHaveBeenCalledWith('list-1', 'Additive', { ConfirmDrops: false });
    });

    it('clears the stored fingerprint, so the first refresh takes the new source\'s', async () => {
        const list = makeList({ SourceQueryID: 'query-1', SourceQueryKeyField: 'ContactID' }, ['SourceQueryID']);
        await list.Save();
        expect(writes[0].SourceFingerprint).toBeNull();
    });

    it('does not fill a list created with a source; whatever created it filled it', async () => {
        const list = makeList({ IsSaved: false, SourceViewID: 'view-1' }, ['SourceViewID']);
        await list.Save();
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('a save that leaves the source alone neither refreshes nor clears the fingerprint', async () => {
        const list = makeList({ SourceViewID: 'view-1', Name: 'Renamed' }, ['Name']);
        await list.Save();
        expect(mockRefresh).not.toHaveBeenCalled();
        expect(writes[0].SourceFingerprint).toBe('fp-linked');
    });

    it('refuses a non-owner who links a source, and writes nothing', async () => {
        const list = makeList({ SourceViewID: 'view-1', ContextCurrentUser: { ID: 'other-1' } }, ['SourceViewID']);
        expect(await list.Save()).toBe(false);
        expect(writes).toHaveLength(0);
        expect(list.History[0].Message).toMatch(/Only the owner/);
    });

    it('a failed fill is logged and never fails the save', async () => {
        mockRefresh.mockResolvedValue({ Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: 'boom' });
        const list = makeList({ SourceViewID: 'view-1' }, ['SourceViewID']);
        expect(await list.Save()).toBe(true);
    });
});

describe('MJListEntityServer — Refresh automatically', () => {
    it('creates the routine when the owner ticks it, and stores its ID', async () => {
        mockReconcile.mockResolvedValue('routine-1');
        const list = makeList({ SourceViewID: 'view-1', AutoRefresh: true }, ['AutoRefresh']);
        expect(await list.Save()).toBe(true);
        expect(mockReconcile).toHaveBeenCalledTimes(1);
        expect(writes.at(-1)?.RefreshRoutineID).toBe('routine-1');
    });

    it('refuses a non-owner who ticks it', async () => {
        const list = makeList({ SourceViewID: 'view-1', AutoRefresh: true, ContextCurrentUser: { ID: 'other-1' } }, ['AutoRefresh']);
        expect(await list.Save()).toBe(false);
        expect(mockReconcile).not.toHaveBeenCalled();
    });

    it('lets anyone untick it; the routine is then disabled by the reconciler', async () => {
        mockReconcile.mockResolvedValue('routine-1');
        const list = makeList({ SourceViewID: 'view-1', AutoRefresh: false, RefreshRoutineID: 'routine-1', ContextCurrentUser: { ID: 'other-1' } }, ['AutoRefresh']);
        expect(await list.Save()).toBe(true);
        expect(mockReconcile).toHaveBeenCalledTimes(1);
        expect(writes).toHaveLength(1);
    });

    it('reconciles the routine when the list is renamed or changes owner', async () => {
        await makeList({ RefreshRoutineID: 'routine-1' }, ['Name']).Save();
        await makeList({ RefreshRoutineID: 'routine-1' }, ['UserID']).Save();
        expect(mockReconcile).toHaveBeenCalledTimes(2);
    });

    it('does not touch routines on an unrelated save', async () => {
        await makeList({ RefreshRoutineID: 'routine-1' }, ['Description']).Save();
        expect(mockReconcile).not.toHaveBeenCalled();
    });

    it('a ReplayOnly save runs no side effects', async () => {
        const list = makeList({ SourceViewID: 'view-1', AutoRefresh: true }, ['SourceViewID', 'AutoRefresh']);
        await list.Save({ ReplayOnly: true });
        expect(mockReconcile).not.toHaveBeenCalled();
        expect(mockRefresh).not.toHaveBeenCalled();
    });
});

describe('MJListEntityServer — validation and delete', () => {
    it('a query source needs SourceQueryKeyField', () => {
        const result = makeList({ SourceQueryID: 'query-1', SourceQueryKeyField: ' ' }).Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['SourceQueryKeyField']);
    });

    it('deletes the routine after the list', async () => {
        const list = makeList({ RefreshRoutineID: 'routine-1' });
        expect(await list.Delete()).toBe(true);
        expect(list.deleted).toBe(true);
        expect(mockDeleteRoutine).toHaveBeenCalledWith('routine-1');
    });

    it('a non-owner cannot delete, and the routine stays', async () => {
        const list = makeList({ RefreshRoutineID: 'routine-1', ContextCurrentUser: { ID: 'other-1' } });
        expect(await list.Delete()).toBe(false);
        expect(mockDeleteRoutine).not.toHaveBeenCalled();
    });
});
