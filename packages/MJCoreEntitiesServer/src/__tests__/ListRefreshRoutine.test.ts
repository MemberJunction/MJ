import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSetting = vi.fn();
const mockActionLookup = vi.fn();

vi.mock('@memberjunction/core-entities', () => ({
    ApplicationSettingEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            GetSetting: (name: string, appID: string) => mockGetSetting(name, appID),
        },
    },
}));

vi.mock('@memberjunction/core', () => ({
    RunView: { FromMetadataProvider: () => ({ RunView: (params: unknown) => mockActionLookup(params) }) },
}));

import { LISTS_APPLICATION_ID, ListRefreshRoutine } from '../custom/list-refresh/ListRefreshRoutine';

/** A stand-in for an `MJ: User Routines` entity object, with dirty tracking. */
class StubRoutine {
    public ID = 'routine-new';
    public Status = 'Active';
    public Name = '';
    public UserID = '';
    public RoutineType = '';
    public ScheduleMode = '';
    public TargetType = '';
    public TargetID = '';
    public StartingPayload: string | null = null;
    public CronExpression: string | null = null;
    public Timezone = '';
    public NotifyCondition = '';
    public NotifyViaInApp = false;
    public NotifyViaEmail = true;
    public LatestResult = { CompleteMessage: '' };
    public loaded: Record<string, unknown> | null = null;
    public saves = 0;
    public deleted = false;
    public NewRecord() { this.loaded = {}; }
    public async Load(id: string) {
        if (id !== 'routine-1') return false;
        Object.assign(this, { ID: 'routine-1', Status: 'Paused', Name: 'Refresh list: Members', UserID: 'owner-1' });
        this.loaded = { Status: this.Status, Name: this.Name, UserID: this.UserID };
        return true;
    }
    public get Dirty() {
        return !this.loaded || this.loaded.Status !== this.Status || this.loaded.Name !== this.Name || this.loaded.UserID !== this.UserID || !this.loaded.Status;
    }
    public async Save() { this.saves++; this.loaded = { Status: this.Status, Name: this.Name, UserID: this.UserID }; return true; }
    public async Delete() { this.deleted = true; return true; }
}

let routine: StubRoutine;
const provider = { GetEntityObject: vi.fn(async () => routine) };
const user = { ID: 'owner-1' };

function list(fields: Partial<Record<string, unknown>> = {}) {
    return { ID: 'list-1', Name: 'Members', UserID: 'owner-1', SourceViewID: 'view-1', SourceQueryID: null, AutoRefresh: true, RefreshRoutineID: null, ...fields } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    routine = new StubRoutine();
    mockGetSetting.mockImplementation((name: string) => (name === 'Lists.Refresh.DefaultCron' ? '30 6 * * 1' : 'Europe/London'));
    mockActionLookup.mockResolvedValue({ Success: true, Results: [{ ID: 'action-refresh' }] });
});

describe('ListRefreshRoutine', () => {
    it('creates an active routine that runs the refresh action as the owner, on the Lists app default schedule', async () => {
        const id = await new ListRefreshRoutine(provider as never, user as never).ReconcileAsync(list());
        expect(id).toBe('routine-new');
        expect(routine).toMatchObject({
            Name: 'Refresh list: Members', UserID: 'owner-1', Status: 'Active',
            RoutineType: 'Scheduled', ScheduleMode: 'Recurring', TargetType: 'Action', TargetID: 'action-refresh',
            CronExpression: '30 6 * * 1', Timezone: 'Europe/London', NotifyCondition: 'OnFailure', NotifyViaInApp: true, NotifyViaEmail: false,
        });
        expect(JSON.parse(routine.StartingPayload ?? '')).toEqual({ ListID: 'list-1', ConfirmDrops: true });
        expect(mockGetSetting).toHaveBeenCalledWith('Lists.Refresh.DefaultCron', LISTS_APPLICATION_ID);
    });

    it('falls back to daily at 2:00 am New York time when the settings are missing', async () => {
        mockGetSetting.mockReturnValue(undefined);
        await new ListRefreshRoutine(provider as never, user as never).ReconcileAsync(list());
        expect(routine).toMatchObject({ CronExpression: '0 2 * * *', Timezone: 'America/New_York' });
    });

    it('creates nothing when Refresh automatically is off, or the list has no source', async () => {
        const reconciler = new ListRefreshRoutine(provider as never, user as never);
        expect(await reconciler.ReconcileAsync(list({ AutoRefresh: false }))).toBeNull();
        expect(await reconciler.ReconcileAsync(list({ SourceViewID: null }))).toBeNull();
        expect(routine.saves).toBe(0);
    });

    it('disables an existing routine when Refresh automatically is turned off', async () => {
        await new ListRefreshRoutine(provider as never, user as never).ReconcileAsync(list({ AutoRefresh: false, RefreshRoutineID: 'routine-1' }));
        expect(routine.Status).toBe('Disabled');
        expect(routine.deleted).toBe(false);
    });

    it('leaves a paused routine paused: it is waiting for the owner to approve a source change', async () => {
        await new ListRefreshRoutine(provider as never, user as never).ReconcileAsync(list({ RefreshRoutineID: 'routine-1' }));
        expect(routine.Status).toBe('Paused');
        expect(routine.saves).toBe(0);
    });

    it('follows the list\'s name and owner', async () => {
        await new ListRefreshRoutine(provider as never, user as never).ReconcileAsync(list({ RefreshRoutineID: 'routine-1', Name: 'Renamed', UserID: 'owner-2' }));
        expect(routine).toMatchObject({ Name: 'Refresh list: Renamed', UserID: 'owner-2' });
        expect(routine.saves).toBe(1);
    });

    it('fails clearly when the refresh action is not seeded', async () => {
        mockActionLookup.mockResolvedValue({ Success: true, Results: [] });
        await expect(new ListRefreshRoutine(provider as never, user as never).ReconcileAsync(list())).rejects.toThrow(/Refresh List From Source/);
    });
});
