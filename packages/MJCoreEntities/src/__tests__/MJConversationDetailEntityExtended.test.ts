import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Owner gate on `MJ: Conversation Details`.
 *
 * Issue #4791: `currentUserMayWrite()` denies a non-owner correctly, but the old `recordDenied()`
 * only mutated an EXISTING `LatestResult`. A brand-new record has none — nothing has been saved
 * yet — so the denial reason was silently dropped and every caller fell back to logging "unknown
 * error". These tests drive `Save()`/`Delete()` end to end and assert on `LatestResult`, the same
 * surface real callers read (see `data-access.md` → "BaseEntity Save/Delete Error Handling").
 */

const mocks = vi.hoisted(() => ({
    superSave: vi.fn(),
    superDelete: vi.fn(),
    logError: vi.fn(),
    getUserAvailableResources: vi.fn(),
    engineConfig: vi.fn(),
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
    return { BaseEntity: class {}, BaseEntityResult, LogError: mocks.logError };
});

/** Shape of the mocked `BaseEntityResult` — mirrors the real class's public surface. */
type MockResultEntry = {
    Success: boolean;
    Type: 'create' | 'update' | 'delete';
    Message: string;
    CompleteMessage: string;
};

vi.mock('../generated/entity_subclasses', () => ({
    MJConversationDetailEntity: class {
        public ConversationID = 'conv-1';
        public IsSaved = false;
        public ContextCurrentUser: { ID: string } | null = { ID: 'system-1' };
        public ProviderToUse: unknown = {
            ProviderType: 'Database',
            GetEntityObject: async () => ({
                UserID: 'anon-1',
                Load: async () => true,
            }),
        };
        public Fields: { Name: string; Dirty: boolean }[] = [];

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

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        GetProviderInstance: () => ({
            Config: mocks.engineConfig,
            GetUserAvailableResources: mocks.getUserAvailableResources,
        }),
    },
}));

type Harness = {
    ConversationID: string;
    IsSaved: boolean;
    ContextCurrentUser: { ID: string } | null;
    Fields: { Name: string; Dirty: boolean }[];
    ResultHistory: MockResultEntry[];
    LatestResult: MockResultEntry | null;
    Save: () => Promise<boolean>;
    Delete: () => Promise<boolean>;
};

async function makeEntity(): Promise<Harness> {
    const { MJConversationDetailEntityExtended } = await import('../custom/MJConversationDetailEntityExtended');
    // Constructed through a zero-arg alias — see MJDashboardEntityExtended.ownership.test.ts for
    // why: Vitest's typecheck pass statically resolves the real generated constructor's required
    // args, and a bare `new` against it fails typecheck as an unhandled source error even though
    // `vi.mock` replaces the module at runtime.
    const Ctor = MJConversationDetailEntityExtended as unknown as new () => Harness;
    return new Ctor();
}

describe('MJConversationDetailEntityExtended owner gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.superDelete.mockResolvedValue(true);
        mocks.engineConfig.mockResolvedValue(undefined);
        mocks.getUserAvailableResources.mockReturnValue([]);
    });

    it('records "You do not have access to this conversation." on a NEW record when a non-owner without a grant saves', async () => {
        const entity = await makeEntity();

        const result = await entity.Save();

        expect(result).toBe(false);
        expect(entity.LatestResult).not.toBeNull();
        expect(entity.LatestResult?.Success).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
        expect(entity.LatestResult?.Type).toBe('create');
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('still lets the conversation owner save', async () => {
        const entity = await makeEntity();
        entity.ContextCurrentUser = { ID: 'anon-1' };

        const result = await entity.Save();

        expect(result).toBe(true);
        expect(entity.ResultHistory).toHaveLength(0);
    });

    it('records the denial on Delete too', async () => {
        const entity = await makeEntity();

        const result = await entity.Delete();

        expect(result).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBeTruthy();
        expect(entity.LatestResult?.Type).toBe('delete');
    });

    it('appends a new entry rather than mutating an earlier successful one', async () => {
        const entity = await makeEntity();
        entity.ResultHistory.push({
            Success: true,
            Type: 'create',
            Message: 'earlier',
            CompleteMessage: 'earlier',
        });
        entity.IsSaved = true;

        const result = await entity.Save();

        expect(result).toBe(false);
        expect(entity.ResultHistory).toHaveLength(2);
        expect(entity.ResultHistory[0].Success).toBe(true);
        expect(entity.ResultHistory[0].Message).toBe('earlier');
        expect(entity.LatestResult?.Type).toBe('update');
    });

    it('records the rating-field denial message for a non-owner', async () => {
        const entity = await makeEntity();
        entity.Fields = [{ Name: 'UserRating', Dirty: true }];

        const result = await entity.Save();

        expect(result).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe(
            'Only the conversation owner can set or change the rating and feedback on this message.'
        );
    });
});
