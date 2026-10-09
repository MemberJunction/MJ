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
    isSystemUser: vi.fn(),
    getSystemUser: vi.fn(),
    conversationVisible: vi.fn(),
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
    return {
        BaseEntity: class {},
        BaseEntityResult,
        LogError: mocks.logError,
        UserInfo: class {},
        WellKnownUserSource: {
            Instance: {
                IsSystemUser: (user: unknown) => mocks.isSystemUser(user),
                GetSystemUser: async () => mocks.getSystemUser(),
            },
        },
    };
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
            GetEntityObject: async (_name: string, user: { ID: string } | undefined) => ({
                UserID: 'anon-1',
                Load: async () => mocks.conversationVisible(user?.ID) !== false,
            }),
        };
        public Role: 'AI' | 'Error' | 'User' = 'User';
        public UserID: string | null = null;
        public Fields: { Name: string; Dirty: boolean; OldValue?: unknown }[] = [];

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
    Role: 'AI' | 'Error' | 'User';
    UserID: string | null;
    Fields: { Name: string; Dirty: boolean; OldValue?: unknown }[];
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
        mocks.isSystemUser.mockReturnValue(false);
        mocks.getSystemUser.mockResolvedValue({ ID: 'system-account' });
        mocks.conversationVisible.mockReturnValue(true);
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

    it('fails closed and logs the operation, conversation and user when the permission check throws', async () => {
        mocks.engineConfig.mockRejectedValue(new Error('engine offline'));
        const entity = await makeEntity();

        const result = await entity.Delete();

        expect(result).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe('Unable to verify conversation permissions.');
        expect(mocks.logError).toHaveBeenCalledTimes(1);
        expect(mocks.logError).toHaveBeenCalledWith(
            'MJConversationDetailEntityExtended.currentUserMayWrite failed (delete on conversation conv-1, user system-1): engine offline'
        );
        expect(mocks.superDelete).not.toHaveBeenCalled();
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

describe('MJConversationDetailEntityExtended: who a message is from (A19)', () => {
    const OWNER = 'anon-1';
    const GRANTEE = 'grantee-1';
    const OTHER = 'other-1';

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.superDelete.mockResolvedValue(true);
        mocks.engineConfig.mockResolvedValue(undefined);
        mocks.getUserAvailableResources.mockReturnValue([{ ResourceRecordID: 'conv-1', PermissionLevel: 'Edit' }]);
        mocks.isSystemUser.mockReturnValue(false);
        mocks.getSystemUser.mockResolvedValue({ ID: 'system-account' });
        mocks.conversationVisible.mockReturnValue(true);
    });

    async function messageAs(userID: string): Promise<Harness> {
        const entity = await makeEntity();
        entity.ContextCurrentUser = { ID: userID };
        return entity;
    }

    /** An existing person's message written by `authorID` (null: no UserID, which reads as the owner). */
    async function savedMessageAs(userID: string, authorID: string | null, dirty: string[]): Promise<Harness> {
        const entity = await messageAs(userID);
        entity.IsSaved = true;
        entity.UserID = authorID;
        entity.Fields = [
            { Name: 'Role', Dirty: dirty.includes('Role'), OldValue: 'User' },
            { Name: 'UserID', Dirty: dirty.includes('UserID'), OldValue: authorID },
            ...dirty.filter((name) => name !== 'Role' && name !== 'UserID').map((name) => ({ Name: name, Dirty: true })),
        ];
        return entity;
    }

    describe('posting', () => {
        it("refuses a grantee's message naming another person", async () => {
            const entity = await messageAs(GRANTEE);
            entity.UserID = OTHER;

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('You can post a message only as yourself.');
            expect(mocks.superSave).not.toHaveBeenCalled();
        });

        it("saves a grantee's message with no UserID as the grantee's", async () => {
            const entity = await messageAs(GRANTEE);

            expect(await entity.Save()).toBe(true);
            expect(entity.UserID).toBe(GRANTEE);
        });

        it("leaves the owner's message with no UserID empty: it already reads as the owner", async () => {
            const entity = await messageAs(OWNER);

            expect(await entity.Save()).toBe(true);
            expect(entity.UserID).toBeNull();
        });

        it('refuses the owner posting as someone else', async () => {
            const entity = await messageAs(OWNER);
            entity.UserID = GRANTEE;

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('You can post a message only as yourself.');
        });

        it('lets a person post as themselves, in any case of their ID', async () => {
            const entity = await messageAs(GRANTEE);
            entity.UserID = GRANTEE.toUpperCase();

            expect(await entity.Save()).toBe(true);
        });
    });

    describe('changing a message', () => {
        it("refuses a grantee changing another person's words", async () => {
            const entity = await savedMessageAs(GRANTEE, OTHER, ['Message']);

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('Only the person who wrote this message can change it.');
            expect(entity.LatestResult?.Type).toBe('update');
        });

        it("refuses the owner changing a grantee's words", async () => {
            const entity = await savedMessageAs(OWNER, GRANTEE, ['Message']);

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('Only the person who wrote this message can change it.');
        });

        it("refuses a grantee changing a message with no UserID: it is the owner's", async () => {
            const entity = await savedMessageAs(GRANTEE, null, ['Message']);

            expect(await entity.Save()).toBe(false);
        });

        it('lets an author edit their own message, and the owner edit theirs', async () => {
            expect(await (await savedMessageAs(GRANTEE, GRANTEE, ['Message'])).Save()).toBe(true);
            expect(await (await savedMessageAs(OWNER, null, ['Message'])).Save()).toBe(true);
        });

        it("still lets a grantee pin another person's message: pinning is not authorship", async () => {
            const entity = await savedMessageAs(GRANTEE, OTHER, ['IsPinned']);

            expect(await entity.Save()).toBe(true);
        });

        it("refuses anyone changing a person's message's role, its author included", async () => {
            const entity = await savedMessageAs(GRANTEE, GRANTEE, ['Role']);
            entity.Role = 'AI';

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe("A message's role cannot be changed.");
        });

        it('refuses an author handing their message to someone else, or to no one', async () => {
            const toOther = await savedMessageAs(GRANTEE, GRANTEE, ['UserID']);
            toOther.UserID = OTHER;
            expect(await toOther.Save()).toBe(false);

            const toNoOne = await savedMessageAs(GRANTEE, GRANTEE, ['UserID']);
            toNoOne.UserID = null;
            expect(await toNoOne.Save()).toBe(false);
        });
    });

    describe('deleting a message', () => {
        it("refuses a grantee deleting another person's message", async () => {
            const entity = await messageAs(GRANTEE);
            entity.UserID = OTHER;

            expect(await entity.Delete()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe("Only the message's author or the conversation's owner can delete it.");
            expect(mocks.superDelete).not.toHaveBeenCalled();
        });

        it('lets its author delete it, and the owner delete anyone\'s', async () => {
            const own = await messageAs(GRANTEE);
            own.UserID = GRANTEE;
            expect(await own.Delete()).toBe(true);

            const someoneElses = await messageAs(OWNER);
            someoneElses.UserID = GRANTEE;
            expect(await someoneElses.Delete()).toBe(true);
        });
    });

    it('lets the system user write any message, with no grant and naming anyone', async () => {
        mocks.isSystemUser.mockReturnValue(true);
        mocks.getUserAvailableResources.mockReturnValue([]);
        const entity = await messageAs('system-account');
        entity.UserID = OTHER;

        expect(await entity.Save()).toBe(true);
        expect(await entity.Delete()).toBe(true);
        expect(mocks.engineConfig).not.toHaveBeenCalled();
    });

    it("keeps today's rules for agent replies until the chat stops writing them from the browser", async () => {
        const entity = await messageAs(GRANTEE);
        entity.Role = 'AI';
        entity.UserID = OTHER;

        expect(await entity.Save()).toBe(true);
    });

    it('refuses a person who cannot read a conversation that exists (hidden by a row filter)', async () => {
        mocks.conversationVisible.mockImplementation((userID: string | undefined) => userID === 'system-account');
        const entity = await messageAs(GRANTEE);

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
        expect(await entity.Delete()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('lets the save through when no one can find the conversation: the foreign key decides, as before', async () => {
        mocks.conversationVisible.mockReturnValue(false);
        const entity = await messageAs(GRANTEE);

        expect(await entity.Save()).toBe(true);
    });

    it('checks access before authorship: a person without a grant is told they have no access', async () => {
        mocks.getUserAvailableResources.mockReturnValue([]);
        const entity = await messageAs(GRANTEE);
        entity.UserID = OTHER;

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
    });
});
