/**
 * Tests for ReportResolverExtended.CreateReportFromConversationDetailID.
 *
 * Regression coverage for a SQL injection fix: ConversationDetailID (a plain GraphQL
 * String arg) used to be interpolated directly into the WHERE clause. It is now bound
 * via mssql's parameterized `request.input(...)`, so a hostile value must never appear
 * spliced into the executed SQL text, and query structure must stay identical regardless
 * of what the value contains.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────
const { mockUserCacheUsers, mssqlState } = vi.hoisted(() => ({
    mockUserCacheUsers: [] as Array<{ Email: string; ID: string }>,
    mssqlState: {
        inputCalls: [] as Array<{ name: string; type: unknown; value: unknown }>,
        queryCalls: [] as string[],
        poolArgs: [] as unknown[],
        recordset: [] as Array<Record<string, unknown>>,
    },
}));

// Stub external deps before imports (mirrors resolverBase.rls.test.ts)
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SQLServerDataProvider: class {},
    UserCache: {
        get Users() { return mockUserCacheUsers; },
    },
}));

vi.mock('cloudevents', () => ({
    CloudEvent: class {},
    httpTransport: () => () => undefined,
    emitterFor: () => () => undefined,
}));

vi.mock('type-graphql', () => ({
    Resolver:           () => () => undefined,
    Mutation:           () => () => undefined,
    Query:              () => () => undefined,
    Subscription:       () => () => undefined,
    Ctx:                () => () => undefined,
    Arg:                () => () => undefined,
    PubSub:             () => () => undefined,
    Root:               () => () => undefined,
    ObjectType:         () => () => undefined,
    InputType:          () => () => undefined,
    Field:              () => () => undefined,
    FieldResolver:      () => () => undefined,
    Int:                () => undefined,
    Float:              () => undefined,
    registerEnumType:   () => undefined,
}));

vi.mock('graphql', () => ({
    GraphQLError: class extends Error {
        constructor(msg: string) { super(msg); }
    },
}));

vi.mock('mssql', () => {
    const UniqueIdentifier = { __marker: 'UniqueIdentifier' };
    class Request {
        constructor(pool: unknown) {
            mssqlState.poolArgs.push(pool);
        }
        input(name: string, type: unknown, value: unknown) {
            mssqlState.inputCalls.push({ name, type, value });
        }
        async query(sql: string) {
            mssqlState.queryCalls.push(sql);
            return { recordset: mssqlState.recordset };
        }
    }
    return { default: { Request, UniqueIdentifier }, Request, UniqueIdentifier };
});

vi.mock('@memberjunction/data-context', () => {
    class DataContext {
        LoadMetadata = vi.fn(async () => true);
    }
    (DataContext as unknown as { Clone: unknown }).Clone = vi.fn(async () => ({ ID: 'dctx-clone-1' }));
    return { DataContext };
});

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: vi.fn(),
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: {} },
}));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    FieldMapper: class { static Instance = { MapFieldsFromCodeNamesToDBNames: vi.fn() }; },
}));

vi.mock('../../generic/PubSubManager.js', () => ({
    PubSubManager: class { static Instance = { publish: vi.fn() }; },
}));

vi.mock('../../generic/PushStatusResolver.js', () => ({
    PUSH_STATUS_UPDATES_TOPIC: 'test-push-topic',
    PushStatusNotification: class {},
    PushStatusResolver: class {},
}));

vi.mock('../../generic/CacheInvalidationResolver.js', () => ({
    CACHE_INVALIDATION_TOPIC: 'test-cache-topic',
}));

vi.mock('../../generic/RunViewResolver.js', () => ({
    RunViewByIDInput: class {},
    RunViewByNameInput: class {},
    RunDynamicViewInput: class {},
}));

vi.mock('../../generic/DeleteOptionsInput.js', () => ({
    DeleteOptionsInput: class {},
}));

vi.mock('../../types.js', () => ({
    RunViewGenericParams: class {},
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

vi.mock('@memberjunction/core-entities', () => ({}));

// ─── Import after mocks ──────────────────────────────────────────────────
import { ReportResolverExtended } from '../ReportResolver';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeReportEntity() {
    return {
        ID: 'report-1',
        Name: '',
        Description: '',
        ConversationID: '',
        ConversationDetailID: '',
        DataContextID: '',
        Configuration: '',
        SharingScope: '',
        UserID: '',
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
    };
}

function makeContext(
    getEntityObject: () => ReturnType<typeof makeReportEntity>,
    userPayload: Record<string, unknown> = { email: 'test@example.com' } // no apiKeyHash -> scope check no-ops
) {
    const getEntityObjectSpy = vi.fn(async (_name: string, _contextUser: unknown) => getEntityObject());
    const md = {
        Entities: [
            { Name: 'MJ: Conversation Details', SchemaName: 'dbo', BaseView: 'vwConversationDetails' },
            { Name: 'MJ: Conversations', SchemaName: 'dbo', BaseView: 'vwConversations' },
        ],
        GetEntityObject: getEntityObjectSpy,
    };
    return {
        context: {
            dataSource: { __fakePool: true },
            userPayload,
            providers: [{ type: 'Read-Write', provider: md }],
        } as unknown as Parameters<ReportResolverExtended['CreateReportFromConversationDetailID']>[1],
        getEntityObjectSpy,
    };
}

describe('ReportResolverExtended.CreateReportFromConversationDetailID', () => {
    let resolver: ReportResolverExtended;

    beforeEach(() => {
        resolver = new ReportResolverExtended();
        mssqlState.inputCalls.length = 0;
        mssqlState.queryCalls.length = 0;
        mssqlState.poolArgs.length = 0;
        mssqlState.recordset.length = 0;
        mssqlState.recordset.push({
            Message: JSON.stringify({ title: 'Test Report', userExplanation: 'exp' }),
            ConversationID: 'conv-1',
            DataContextID: 'dctx-1',
        });

        mockUserCacheUsers.length = 0;
        mockUserCacheUsers.push({ Email: 'test@example.com', ID: 'user-1' });
    });

    it('binds ConversationDetailID as a query parameter rather than splicing it into the SQL text', async () => {
        const maliciousID = "1'; DROP TABLE MJ_Reports; --";
        const { context } = makeContext(makeReportEntity);

        const result = await resolver.CreateReportFromConversationDetailID(maliciousID, context);

        expect(result.Success).toBe(true);

        // The query text must use a bound parameter, never the raw value.
        expect(mssqlState.queryCalls).toHaveLength(1);
        expect(mssqlState.queryCalls[0]).toContain('@ConversationDetailID');
        expect(mssqlState.queryCalls[0]).not.toContain(maliciousID);
        expect(mssqlState.queryCalls[0]).not.toContain('DROP TABLE');

        // The value must be bound through request.input, not string concatenation.
        expect(mssqlState.inputCalls).toHaveLength(1);
        expect(mssqlState.inputCalls[0].name).toBe('ConversationDetailID');
        expect(mssqlState.inputCalls[0].value).toBe(maliciousID);
    });

    it('does not alter query structure for values containing quotes, --, or OR 1=1', async () => {
        const hostileID = "abc' OR '1'='1' --";
        const { context } = makeContext(makeReportEntity);

        await resolver.CreateReportFromConversationDetailID(hostileID, context);

        expect(mssqlState.queryCalls[0]).toMatch(/WHERE\s+cd\.ID=@ConversationDetailID\s*$/);
        expect(mssqlState.inputCalls[0].value).toBe(hostileID);
    });

    it('still succeeds end to end for a normal GUID-shaped value', async () => {
        const normalID = '12345678-1234-1234-1234-123456789012';
        const { context } = makeContext(makeReportEntity);

        const result = await resolver.CreateReportFromConversationDetailID(normalID, context);

        expect(result.Success).toBe(true);
        expect(result.ReportName).toBe('Test Report');
        expect(mssqlState.inputCalls[0].value).toBe(normalID);
    });

    // §5.6 row 11 — the operating user must come from the stamped payload user
    // (GetUserFromPayload), never a fresh UserCache lookup by email. A fresh lookup would
    // silently drop any per-request API-key row-filter binding (APIKeyRowFilters /
    // APIKeyActingContext) already stamped onto userPayload.userRecord, so a filtered key's
    // report-creation work would run unfiltered.
    describe('operating user resolution (§5.6 row 11)', () => {
        it('uses userPayload.userRecord (with its stamped bindings) when present, not a fresh UserCache lookup', async () => {
            const stampedUser = {
                ID: 'user-1',
                Email: 'test@example.com',
                APIKeyRowFilters: [{ EntityID: 'e1', PermissionType: 'Create', FilterID: 'f1' }],
            };
            // A DIFFERENT UserCache entry for the same email — if the resolver fell back to a
            // UserCache lookup, it would get THIS unstamped object instead.
            mockUserCacheUsers.length = 0;
            mockUserCacheUsers.push({ Email: 'test@example.com', ID: 'user-1' });

            const { context, getEntityObjectSpy } = makeContext(makeReportEntity, {
                email: 'test@example.com',
                userRecord: stampedUser,
            });

            const result = await resolver.CreateReportFromConversationDetailID('12345678-1234-1234-1234-123456789012', context);

            expect(result.Success).toBe(true);
            // GetEntityObject's contextUser must be the SAME stamped object reference — proving
            // the row-filter binding flows through to the entity work, not a fresh, unstamped one.
            expect(getEntityObjectSpy.mock.calls[0][1]).toBe(stampedUser);
        });

        it('falls back to a UserCache lookup by email when no payload user is present', async () => {
            const { context, getEntityObjectSpy } = makeContext(makeReportEntity, { email: 'test@example.com' });

            const result = await resolver.CreateReportFromConversationDetailID('12345678-1234-1234-1234-123456789012', context);

            expect(result.Success).toBe(true);
            expect((getEntityObjectSpy.mock.calls[0][1] as { ID: string }).ID).toBe('user-1');
        });
    });
});
