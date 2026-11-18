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

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
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
        EntityFieldInfo: actual.EntityFieldInfo,
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
        public Role: string = 'User';
        public UserID: string | null = null;
        public Fields: { Name: string; Dirty: boolean; OldValue?: unknown }[] = [];
        /** Mirrors `BaseEntity.GetFieldByName`: trimmed, any case. */
        public GetFieldByName(name: string) {
            const key = name.trim().toLowerCase();
            return this.Fields.find((f) => f.Name.toLowerCase() === key) ?? null;
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
    Role: string;
    UserID: string | null;
    CloneContext?: { CloneLogID: string; SourceRecordID: string; RootEntityName: string } | null;
    Fields: { Name: string; Dirty: boolean; OldValue?: unknown }[];
    TransactionGroup?: { Variables: { EntityObject: unknown; FieldName: string; Type: 'Define' | 'Use' }[] };
    ResultHistory: MockResultEntry[];
    LatestResult: MockResultEntry | null;
    Save: () => Promise<boolean>;
    Delete: () => Promise<boolean>;
    MarkServerAuthoredReply: () => void;
    IsServerAuthoredReply: boolean;
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

    it('lets the clone engine create a message in a conversation it copied for another user', async () => {
        const entity = await makeEntity();
        entity.CloneContext = { CloneLogID: 'log-1', SourceRecordID: 'source-detail', RootEntityName: 'MJ: Users' };

        const result = await entity.Save();

        expect(result).toBe(true);
        expect(mocks.superSave).toHaveBeenCalled();
        expect(mocks.getUserAvailableResources).not.toHaveBeenCalled();
    });

    it('does not let a clone context bypass the check on an update or delete', async () => {
        const updated = await makeEntity();
        updated.CloneContext = { CloneLogID: 'log-1', SourceRecordID: 'source-detail', RootEntityName: 'MJ: Users' };
        updated.IsSaved = true;
        expect(await updated.Save()).toBe(false);
        expect(updated.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');

        const deleted = await makeEntity();
        deleted.CloneContext = { CloneLogID: 'log-1', SourceRecordID: 'source-detail', RootEntityName: 'MJ: Users' };
        expect(await deleted.Delete()).toBe(false);
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

    it('denies a rating change by a non-owner even when they hold an Edit grant', async () => {
        mocks.getUserAvailableResources.mockReturnValue([{ ResourceRecordID: 'conv-1', PermissionLevel: 'Edit' }]);
        const entity = await makeEntity();
        entity.Fields = [{ Name: 'UserFeedback', Dirty: true }];

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe(
            'Only the conversation owner can set or change the rating and feedback on this message.'
        );
        expect(mocks.superSave).not.toHaveBeenCalled();

        entity.Fields = [{ Name: 'UserFeedback', Dirty: false }];
        expect(await entity.Save()).toBe(true);
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
    async function savedMessageAs(
        userID: string,
        authorID: string | null,
        dirty: string[],
        storedRole = 'User'
    ): Promise<Harness> {
        const entity = await messageAs(userID);
        entity.IsSaved = true;
        entity.UserID = authorID;
        entity.Role = storedRole;
        entity.Fields = [
            { Name: 'Role', Dirty: dirty.includes('Role'), OldValue: storedRole },
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

        it("refuses posting as someone else with the role in another case or padded, which validation and the database accept", async () => {
            for (const role of ['user', 'USER', 'User ']) {
                const entity = await messageAs(GRANTEE);
                entity.Role = role;
                entity.UserID = OTHER;

                expect(await entity.Save()).toBe(false);
                expect(entity.LatestResult?.CompleteMessage).toBe('You can post a message only as yourself.');
            }
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

        it("refuses turning an agent's reply into a person's message: that would post as anyone", async () => {
            const entity = await savedMessageAs(GRANTEE, OTHER, ['Role', 'Message'], 'AI');
            entity.Role = 'User';

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe("A message's role cannot be changed.");
        });

        it('refuses moving a person\'s message to another conversation, its author included', async () => {
            const someoneElses = await savedMessageAs(GRANTEE, OTHER, ['ConversationID']);
            expect(await someoneElses.Save()).toBe(false);
            expect(someoneElses.LatestResult?.CompleteMessage).toBe('A message cannot be moved to another conversation or fork.');

            const own = await savedMessageAs(OWNER, null, ['ConversationID']);
            expect(await own.Save()).toBe(false);
        });

        it("refuses a grantee moving the owner's message onto a fork they started", async () => {
            for (const ownersMessage of [await savedMessageAs(GRANTEE, OWNER, ['BranchID']), await savedMessageAs(GRANTEE, null, ['BranchID'])]) {
                expect(await ownersMessage.Save()).toBe(false);
                expect(ownersMessage.LatestResult?.CompleteMessage).toBe('A message cannot be moved to another conversation or fork.');
            }
            expect(mocks.superSave).not.toHaveBeenCalled();
        });

        it("refuses moving a person's message to another fork, its author included", async () => {
            expect(await (await savedMessageAs(GRANTEE, GRANTEE, ['BranchID'])).Save()).toBe(false);
            expect(await (await savedMessageAs(OWNER, null, ['BranchID'])).Save()).toBe(false);
        });

        it('treats a stored role in another case as a person\'s message', async () => {
            const entity = await savedMessageAs(GRANTEE, OTHER, ['Message'], 'user');

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('Only the person who wrote this message can change it.');
        });

        it('refuses an author handing their message to someone else, or to no one', async () => {
            const toOther = await savedMessageAs(GRANTEE, GRANTEE, ['UserID']);
            toOther.UserID = OTHER;
            expect(await toOther.Save()).toBe(false);

            const toNoOne = await savedMessageAs(GRANTEE, GRANTEE, ['UserID']);
            toNoOne.UserID = null;
            expect(await toNoOne.Save()).toBe(false);
        });

        it("refuses the owner handing their message with no UserID to a grantee", async () => {
            const entity = await savedMessageAs(OWNER, null, ['UserID']);
            entity.UserID = GRANTEE;

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('You can post a message only as yourself.');
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

    it('exempts the system user from the authorship rules when it holds a grant: it may name anyone', async () => {
        mocks.isSystemUser.mockReturnValue(true);
        const entity = await messageAs('system-account');
        entity.UserID = OTHER;

        expect(await entity.Save()).toBe(true);
        expect(await entity.Delete()).toBe(true);
    });

    it('still refuses the system user on a conversation it neither owns nor holds a grant on (the MJ#4791 boundary)', async () => {
        mocks.isSystemUser.mockReturnValue(true);
        mocks.getUserAvailableResources.mockReturnValue([]);
        const entity = await messageAs('system-account');

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
        expect(await entity.Delete()).toBe(false);
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
        expect(entity.UserID).toBe(GRANTEE);
    });

    it('still refuses posting as someone else when no one can find the conversation', async () => {
        mocks.conversationVisible.mockReturnValue(false);
        const entity = await messageAs(GRANTEE);
        entity.UserID = OTHER;

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe('You can post a message only as yourself.');
    });

    /** A new message from the grantee, one of whose fields (`fieldName`) a 'Use' variable sets at submit. */
    async function messageWithVariable(fieldName: string, variableFieldName = fieldName): Promise<Harness> {
        const entity = await messageAs(GRANTEE);
        entity.Fields = [{ Name: fieldName, Dirty: false }];
        entity.TransactionGroup = { Variables: [{ EntityObject: entity, FieldName: variableFieldName, Type: 'Use' }] };
        return entity;
    }

    it('refuses a message whose author, text, rating or place a transaction variable fills in at submit, after this check', async () => {
        for (const field of ['UserID', 'Role', 'Message', 'ParentID', 'ConversationID', 'BranchID', 'UserRating', 'ID']) {
            const entity = await messageWithVariable(field);

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe(
                'A conversation message cannot take its values from a transaction variable.'
            );
        }
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it("refuses a variable on the message's ID: an update's SQL is rebuilt at submit and would write another row", async () => {
        const entity = await messageWithVariable('ID');
        entity.IsSaved = true;

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe(
            'A conversation message cannot take its values from a transaction variable.'
        );
    });

    it('holds the system user to the variable rule for the row, conversation, role and rating, not for authorship', async () => {
        mocks.isSystemUser.mockReturnValue(true);
        for (const field of ['ID', 'ConversationID', 'Role', 'UserRating']) {
            const entity = await messageWithVariable(field);
            entity.ContextCurrentUser = { ID: 'system-account' };
            expect(await entity.Save()).toBe(false);
        }
        const authored = await messageWithVariable('UserID');
        authored.ContextCurrentUser = { ID: 'system-account' };
        expect(await authored.Save()).toBe(true);
    });

    it("matches a variable's field the way Set does at submit: trimmed, any case", async () => {
        expect(await (await messageWithVariable('UserID', ' userid ')).Save()).toBe(false);
    });

    it('allows a variable on a field the gate does not decide on', async () => {
        expect(await (await messageWithVariable('HiddenToUser')).Save()).toBe(true);
    });

    it('does not refuse a delete for a variable: a delete sets no field', async () => {
        const entity = await messageWithVariable('UserID');
        entity.UserID = GRANTEE;

        expect(await entity.Delete()).toBe(true);
    });

    it("allows a message whose own values define a variable, or whose group's variables are another item's", async () => {
        const defines = await messageAs(GRANTEE);
        defines.TransactionGroup = { Variables: [{ EntityObject: defines, FieldName: 'ID', Type: 'Define' }] };
        expect(await defines.Save()).toBe(true);

        const other = await messageAs(GRANTEE);
        other.TransactionGroup = { Variables: [{ EntityObject: {}, FieldName: 'UserID', Type: 'Use' }] };
        expect(await other.Save()).toBe(true);
    });

    it('logs when there is no system user to tell a hidden conversation from a missing one', async () => {
        mocks.conversationVisible.mockReturnValue(false);
        mocks.getSystemUser.mockResolvedValue(null);
        const entity = await messageAs(GRANTEE);

        expect(await entity.Save()).toBe(true);
        expect(mocks.logError).toHaveBeenCalledTimes(1);
        expect(mocks.logError.mock.calls[0][0]).toContain('no system user');
    });

    it("puts back the caller's empty UserID when the save the gate let through fails", async () => {
        mocks.superSave.mockResolvedValue(false);
        const entity = await messageAs(GRANTEE);

        expect(await entity.Save()).toBe(false);
        expect(entity.UserID).toBeNull();
    });

    it('checks access before authorship: a person without a grant is told they have no access', async () => {
        mocks.getUserAvailableResources.mockReturnValue([]);
        const entity = await messageAs(GRANTEE);
        entity.UserID = OTHER;

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
    });
});

describe('MJConversationDetailEntityExtended: only the server writes an agent reply (A19)', () => {
    const OWNER = 'anon-1';
    const GRANTEE = 'grantee-1';
    const REPLY_REFUSAL = "Only the server writes an agent's reply.";

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

    /** A new reply written as `userID`. */
    async function newReplyAs(userID: string, role = 'AI'): Promise<Harness> {
        const entity = await makeEntity();
        entity.ContextCurrentUser = { ID: userID };
        entity.Role = role;
        return entity;
    }

    /** A stored reply that `userID` saves with the named fields changed. */
    async function savedReplyAs(userID: string, dirty: string[], storedRole = 'AI'): Promise<Harness> {
        const entity = await newReplyAs(userID, storedRole);
        entity.IsSaved = true;
        entity.Fields = [
            { Name: 'Role', Dirty: dirty.includes('Role'), OldValue: storedRole },
            ...dirty.filter((name) => name !== 'Role').map((name) => ({ Name: name, Dirty: true })),
        ];
        return entity;
    }

    /** A transaction variable sets its field at submit, after the gate: an unmarked one may not reach a reply field. */
    it('refuses a transaction variable on a reply field unless server code marked the write, the system user included', async () => {
        mocks.isSystemUser.mockReturnValue(true);
        const withVariable = async (field: string): Promise<Harness> => {
            const entity = await savedReplyAs('system-account', []);
            entity.Fields.push({ Name: field, Dirty: false });
            entity.TransactionGroup = { Variables: [{ EntityObject: entity, FieldName: field, Type: 'Use' }] };
            return entity;
        };
        for (const field of ['Message', 'Status', 'AgentID']) {
            expect(await (await withVariable(field)).Save()).toBe(false);
        }
        const marked = await withVariable('Message');
        marked.MarkServerAuthoredReply();
        expect(await marked.Save()).toBe(true);
    });

    describe("a person's save of a reply", () => {
        it("refuses a grantee's reply, and the owner's, in any spelling of the role", async () => {
            for (const [user, role] of [[GRANTEE, 'AI'], [OWNER, 'AI'], [GRANTEE, 'Error'], [GRANTEE, 'ai '], [OWNER, 'ERROR']]) {
                const entity = await newReplyAs(user, role);

                expect(await entity.Save()).toBe(false);
                expect(entity.LatestResult?.CompleteMessage).toBe(REPLY_REFUSAL);
                expect(entity.LatestResult?.Type).toBe('create');
            }
            expect(mocks.superSave).not.toHaveBeenCalled();
        });

        it.each([
            'UserID',
            'Role',
            'Message',
            'ArtifactID',
            'ArtifactVersionID',
            'MediaType',
            'ParentID',
            'ConversationID',
            'BranchID',
            'AgentID',
            'Status',
            'Error',
            'ResponseForm',
            'ActionableCommands',
            'AutomaticCommands',
            'SuggestedResponses',
            'ReflectionInsights',
            'CompletionTime',
            'ExternalID',
        ])("refuses a person changing reply field %s, the owner's own conversation included", async (field) => {
            const entity = await savedReplyAs(OWNER, [field]);

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe(REPLY_REFUSAL);
            expect(entity.LatestResult?.Type).toBe('update');
        });

        it("lets the owner rate a reply, and keeps the rating the owner's alone", async () => {
            expect(await (await savedReplyAs(OWNER, ['UserRating', 'UserFeedback'])).Save()).toBe(true);

            const grantee = await savedReplyAs(GRANTEE, ['UserRating']);
            expect(await grantee.Save()).toBe(false);
            expect(grantee.LatestResult?.CompleteMessage).toBe(
                'Only the conversation owner can set or change the rating and feedback on this message.'
            );
        });

        it('keeps pinning, hiding and other bookkeeping on the conversation-level rules', async () => {
            expect(await (await savedReplyAs(GRANTEE, ['IsPinned'])).Save()).toBe(true);
            expect(await (await savedReplyAs(OWNER, ['HiddenToUser'])).Save()).toBe(true);
            expect(await (await savedReplyAs(GRANTEE, ['SummaryOfEarlierConversation'])).Save()).toBe(true);
        });

        it('keeps deleting a reply on the conversation-level rules', async () => {
            expect(await (await newReplyAs(GRANTEE)).Delete()).toBe(true);
            expect(await (await newReplyAs(OWNER)).Delete()).toBe(true);
        });
    });

    describe('a marked server write', () => {
        it('creates and updates a reply in a conversation the context user owns or holds a grant on', async () => {
            for (const user of [OWNER, GRANTEE]) {
                const created = await newReplyAs(user);
                created.MarkServerAuthoredReply();
                expect(await created.Save()).toBe(true);

                const updated = await savedReplyAs(user, ['Message', 'Status']);
                updated.MarkServerAuthoredReply();
                expect(await updated.Save()).toBe(true);
            }
        });

        it("is still refused in a conversation the context user can't write to", async () => {
            mocks.getUserAvailableResources.mockReturnValue([]);
            const noGrant = await newReplyAs(GRANTEE);
            noGrant.MarkServerAuthoredReply();
            expect(await noGrant.Save()).toBe(false);
            expect(noGrant.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');

            mocks.getUserAvailableResources.mockReturnValue([{ ResourceRecordID: 'conv-1', PermissionLevel: 'View' }]);
            const viewOnly = await newReplyAs(GRANTEE);
            viewOnly.MarkServerAuthoredReply();
            expect(await viewOnly.Save()).toBe(false);
            expect(viewOnly.LatestResult?.CompleteMessage).toBe('You have view-only access to this conversation.');
        });

        it('is refused in a conversation that exists but is hidden from the context user', async () => {
            mocks.conversationVisible.mockImplementation((userID: string | undefined) => userID === 'system-account');
            const entity = await newReplyAs(GRANTEE);
            entity.MarkServerAuthoredReply();

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
        });

        it("does not let a person post as someone else: the marker is for replies only", async () => {
            const entity = await newReplyAs(GRANTEE, 'User');
            entity.UserID = OWNER;
            entity.MarkServerAuthoredReply();

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('You can post a message only as yourself.');
        });

        it('stays on the instance for later saves', async () => {
            const entity = await newReplyAs(GRANTEE);
            expect(entity.IsServerAuthoredReply).toBe(false);
            entity.MarkServerAuthoredReply();
            expect(await entity.Save()).toBe(true);
            entity.IsSaved = true;
            entity.Fields = [{ Name: 'Role', Dirty: false, OldValue: 'AI' }, { Name: 'Message', Dirty: true }];

            expect(await entity.Save()).toBe(true);
            expect(entity.IsServerAuthoredReply).toBe(true);
        });
    });

    describe('the system user', () => {
        beforeEach(() => mocks.isSystemUser.mockReturnValue(true));

        it("is refused an unmarked reply in someone else's conversation (the scoped-anon-elevation SA6 shape)", async () => {
            mocks.getUserAvailableResources.mockReturnValue([]);
            const entity = await newReplyAs('system-account');

            expect(await entity.Save()).toBe(false);
            expect(entity.LatestResult?.CompleteMessage).toBe('You do not have access to this conversation.');
        });

        it('is refused an unmarked reply even where it holds a grant: being the system user grants nothing new', async () => {
            const created = await newReplyAs('system-account');
            expect(await created.Save()).toBe(false);
            expect(created.LatestResult?.CompleteMessage).toBe(REPLY_REFUSAL);

            const turned = await savedReplyAs('system-account', ['Role'], 'User');
            turned.Role = 'AI';
            expect(await turned.Save()).toBe(false);
            expect(turned.LatestResult?.CompleteMessage).toBe(REPLY_REFUSAL);
        });

        it('writes a marked reply where it holds a grant (a host-driven turn)', async () => {
            const entity = await newReplyAs('system-account');
            entity.MarkServerAuthoredReply();

            expect(await entity.Save()).toBe(true);
        });
    });

    it("lets a reply the record-cloning engine copies through, as before", async () => {
        const entity = await newReplyAs(GRANTEE);
        entity.CloneContext = { CloneLogID: 'log-1', SourceRecordID: 'source-detail', RootEntityName: 'MJ: Users' };

        expect(await entity.Save()).toBe(true);
    });

    it("refuses a person's reply even when no one can find the conversation", async () => {
        mocks.conversationVisible.mockReturnValue(false);
        const entity = await newReplyAs(GRANTEE);

        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toBe(REPLY_REFUSAL);
    });

    it("leaves a person's own conversation working as before: their messages, edits, pins and deletes", async () => {
        const post = await makeEntity();
        post.ContextCurrentUser = { ID: OWNER };
        expect(await post.Save()).toBe(true);

        const pin = await savedReplyAs(OWNER, ['IsPinned']);
        expect(await pin.Save()).toBe(true);
        expect(await (await newReplyAs(OWNER)).Delete()).toBe(true);
    });
});
