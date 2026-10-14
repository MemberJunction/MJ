import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Save and delete guards on `MJ: Conversation Branches` (forks).
 *
 * Creating a fork on the server needs the `Conversations: Fork` authorization for the context user.
 * Deleting a fork row clears `BranchID` on its messages and `ParentBranchID` on its child forks
 * (the generated delete procedure), which would move them into Main. The entity refuses the delete
 * of a fork that still has its own messages or child forks, and refuses when it cannot read them.
 * These tests drive `Save()` and `Delete()` end to end and assert on `LatestResult`.
 */

const mocks = vi.hoisted(() => ({
    superSave: vi.fn(),
    superDelete: vi.fn(),
    logError: vi.fn(),
    runViews: vi.fn(),
    getUserAvailableResources: vi.fn(),
    engineConfig: vi.fn(),
    userCanFork: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', () => {
    class BaseEntityResult {
        Success = false;
        Type: 'create' | 'update' | 'delete' = 'create';
        Message = '';
        Errors: unknown[] = [];
        StartedAt = new Date();
        EndedAt = new Date();
        get CompleteMessage(): string {
            return this.Message;
        }
    }
    class RunView {
        async RunViews(params: unknown[], contextUser: unknown) {
            return mocks.runViews(params, contextUser);
        }
    }
    return { BaseEntity: class {}, BaseEntityResult, LogError: mocks.logError, RunView };
});

/** Shape of the mocked `BaseEntityResult` — mirrors the real class's public surface. */
type MockResultEntry = {
    Success: boolean;
    Type: 'create' | 'update' | 'delete';
    Message: string;
    CompleteMessage: string;
};

vi.mock('../generated/entity_subclasses', () => ({
    MJConversationBranchEntity: class {
        public ID = 'fork-1';
        public ConversationID = 'conv-1';
        public IsSaved = true;
        public ContextCurrentUser: { ID: string } | null = { ID: 'owner-1' };
        public ProviderToUse: unknown = {
            ProviderType: 'Database',
            GetEntityObject: async () => ({
                UserID: 'owner-1',
                Load: async () => true,
            }),
        };
        public get RunViewProviderToUse(): unknown {
            return this.ProviderToUse;
        }

        public ResultHistory: MockResultEntry[] = [];
        public get LatestResult(): MockResultEntry | null {
            return this.ResultHistory[this.ResultHistory.length - 1] ?? null;
        }
        public RegisterResultHistoryEntry(r: MockResultEntry) {
            this.ResultHistory.push(r);
        }

        public async Save() {
            return mocks.superSave();
        }
        public async Delete() {
            return mocks.superDelete();
        }
    },
    MJConversationEntity: class {},
    MJResourcePermissionEntity: class {},
}));

vi.mock('../custom/ConversationForkAccess', () => ({
    CONVERSATIONS_FORK_AUTHORIZATION: 'Conversations: Fork',
    UserCanFork: mocks.userCanFork,
}));

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        GetProviderInstance: () => ({
            Config: mocks.engineConfig,
            GetUserAvailableResources: mocks.getUserAvailableResources,
        }),
    },
}));

type Harness = {
    ID: string;
    IsSaved: boolean;
    ProviderToUse: unknown;
    ContextCurrentUser: { ID: string } | null;
    ResultHistory: MockResultEntry[];
    LatestResult: MockResultEntry | null;
    Save: () => Promise<boolean>;
    Delete: () => Promise<boolean>;
};

/** A count result as `RunViews` returns it for `ResultType: 'count_only'`. */
function counted(total: number, success = true): { Success: boolean; TotalRowCount: number; Results: unknown[]; ErrorMessage?: string } {
    return success
        ? { Success: true, TotalRowCount: total, Results: [] }
        : { Success: false, TotalRowCount: 0, Results: [], ErrorMessage: 'read failed' };
}

async function makeEntity(): Promise<Harness> {
    const { MJConversationBranchEntityExtended } = await import('../custom/MJConversationBranchEntityExtended');
    // Constructed through a zero-arg alias — see MJConversationDetailEntityExtended.test.ts.
    const Ctor = MJConversationBranchEntityExtended as unknown as new () => Harness;
    return new Ctor();
}

const REFUSED = 'A fork that has messages or forks under it cannot be deleted.';

describe('MJConversationBranchEntityExtended delete guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.superDelete.mockResolvedValue(true);
        mocks.engineConfig.mockResolvedValue(undefined);
        mocks.getUserAvailableResources.mockReturnValue([]);
    });

    it('refuses to delete a fork that still has its own messages', async () => {
        mocks.runViews.mockResolvedValue([counted(2), counted(0)]);
        const entity = await makeEntity();

        expect(await entity.Delete()).toBe(false);

        expect(entity.LatestResult?.Success).toBe(false);
        expect(entity.LatestResult?.Type).toBe('delete');
        expect(entity.LatestResult?.CompleteMessage).toBe(REFUSED);
        expect(mocks.superDelete).not.toHaveBeenCalled();
    });

    it('refuses to delete a fork that has a child fork', async () => {
        mocks.runViews.mockResolvedValue([counted(0), counted(1)]);
        const entity = await makeEntity();

        expect(await entity.Delete()).toBe(false);

        expect(entity.LatestResult?.CompleteMessage).toBe(REFUSED);
        expect(mocks.superDelete).not.toHaveBeenCalled();
    });

    it('deletes an empty fork with no child forks', async () => {
        mocks.runViews.mockResolvedValue([counted(0), counted(0)]);
        const entity = await makeEntity();

        expect(await entity.Delete()).toBe(true);

        expect(mocks.superDelete).toHaveBeenCalledTimes(1);
        expect(entity.ResultHistory).toHaveLength(0);
    });

    it("counts the fork's own messages and its child forks as the current user", async () => {
        mocks.runViews.mockResolvedValue([counted(0), counted(0)]);
        const entity = await makeEntity();

        await entity.Delete();

        expect(mocks.runViews).toHaveBeenCalledTimes(1);
        const [params, user] = mocks.runViews.mock.calls[0];
        expect(params).toEqual([
            { EntityName: 'MJ: Conversation Details', ExtraFilter: "BranchID='fork-1'", ResultType: 'count_only' },
            { EntityName: 'MJ: Conversation Branches', ExtraFilter: "ParentBranchID='fork-1'", ResultType: 'count_only' },
        ]);
        expect(user).toEqual({ ID: 'owner-1' });
    });

    it('refuses and logs when a count read fails', async () => {
        mocks.runViews.mockResolvedValue([counted(0), counted(0, false)]);
        const entity = await makeEntity();

        expect(await entity.Delete()).toBe(false);

        expect(entity.LatestResult?.Type).toBe('delete');
        expect(entity.LatestResult?.CompleteMessage).toBe('Unable to check whether the fork has messages or forks under it.');
        expect(mocks.logError).toHaveBeenCalledTimes(1);
        expect(mocks.superDelete).not.toHaveBeenCalled();
    });

    it('refuses and logs when the count read throws', async () => {
        mocks.runViews.mockRejectedValue(new Error('db offline'));
        const entity = await makeEntity();

        expect(await entity.Delete()).toBe(false);

        expect(entity.LatestResult?.CompleteMessage).toBe('Unable to check whether the fork has messages or forks under it.');
        expect(mocks.logError).toHaveBeenCalledTimes(1);
        expect(mocks.superDelete).not.toHaveBeenCalled();
    });

    it('checks permission before the counts and does not read when the user may not write', async () => {
        const entity = await makeEntity();
        entity.ContextCurrentUser = { ID: 'stranger-1' };

        expect(await entity.Delete()).toBe(false);

        expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
        expect(mocks.runViews).not.toHaveBeenCalled();
        expect(mocks.superDelete).not.toHaveBeenCalled();
    });
});

describe('creating a fork needs the Conversations: Fork authorization', () => {
    beforeEach(() => {
        mocks.superSave.mockReset().mockResolvedValue(true);
        mocks.userCanFork.mockReset().mockReturnValue(true);
        mocks.getUserAvailableResources.mockReset();
    });

    it('creates the row for a person who holds it, checking the context user against the provider', async () => {
        const e = await makeEntity();
        e.IsSaved = false;
        expect(await e.Save()).toBe(true);
        expect(mocks.userCanFork).toHaveBeenCalledWith({ ID: 'owner-1' }, e.ProviderToUse);
        expect(mocks.superSave).toHaveBeenCalledOnce();
    });

    it('refuses a person who does not hold it, writes nothing and says why', async () => {
        mocks.userCanFork.mockReturnValue(false);
        const e = await makeEntity();
        e.IsSaved = false;
        expect(await e.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(mocks.getUserAvailableResources).not.toHaveBeenCalled();
        expect(e.LatestResult).toMatchObject({ Success: false, Type: 'create', Message: 'You do not have permission to fork conversations.' });
    });

    it('trusts a save with no context user', async () => {
        const e = await makeEntity();
        e.IsSaved = false;
        e.ContextCurrentUser = null;
        expect(await e.Save()).toBe(true);
        expect(mocks.userCanFork).not.toHaveBeenCalled();
    });

    it('leaves the check to the server on a non-database provider', async () => {
        const e = await makeEntity();
        e.IsSaved = false;
        e.ProviderToUse = { ProviderType: 'Network' };
        expect(await e.Save()).toBe(true);
        expect(mocks.userCanFork).not.toHaveBeenCalled();
    });

    it('does not check it when an existing fork is updated', async () => {
        const e = await makeEntity();
        expect(await e.Save()).toBe(true);
        expect(mocks.userCanFork).not.toHaveBeenCalled();
    });
});
