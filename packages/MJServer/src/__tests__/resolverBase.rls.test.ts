/**
 * Tests for ResolverBase.getRowLevelSecurityWhereClause.
 *
 * Validates that the resolver's RLS path delegates correctly to the centralized
 * exemption check in EntityInfo.GetUserRowLevelSecurityWhereClause. This was
 * the code path that caused the bug: single-record GraphQL resolvers applied
 * RLS filters even when the user held a role that exempted them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────
const { mockUserCacheUsers } = vi.hoisted(() => ({
    mockUserCacheUsers: [] as Array<{ Email: string; ID: string }>,
}));

// Stub external deps before imports
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

vi.mock('mssql', () => ({}));

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: vi.fn(),
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: {} },
}));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    FieldMapper: class { static Instance = { MapFieldsFromCodeNamesToDBNames: vi.fn() }; },
}));

vi.mock('../generic/PubSubManager.js', () => ({
    PubSubManager: class { static Instance = { publish: vi.fn() }; },
}));

vi.mock('../generic/PushStatusResolver.js', () => ({
    PUSH_STATUS_UPDATES_TOPIC: 'test-push-topic',
    PushStatusNotification: class {},
    PushStatusResolver: class {},
}));

vi.mock('../generic/CacheInvalidationResolver.js', () => ({
    CACHE_INVALIDATION_TOPIC: 'test-cache-topic',
}));

vi.mock('../generic/RunViewResolver.js', () => ({
    RunViewByIDInput: class {},
    RunViewByNameInput: class {},
    RunDynamicViewInput: class {},
}));

vi.mock('../generic/DeleteOptionsInput.js', () => ({
    DeleteOptionsInput: class {},
}));

vi.mock('../types.js', () => ({
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
import { ResolverBase } from '../generic/ResolverBase';
import type { DatabaseProviderBase, EntityInfo, UserInfo } from '@memberjunction/core';

/**
 * Subclass that exposes the protected getRowLevelSecurityWhereClause for testing.
 */
class TestResolver extends ResolverBase {
    public TestGetRLSWhereClause(
        provider: DatabaseProviderBase,
        entityName: string,
        userPayload: { email: string },
        type: string,
        returnPrefix: string,
    ): string {
        return (this as unknown as {
            getRowLevelSecurityWhereClause: (
                p: DatabaseProviderBase, e: string, u: { email: string }, t: string, r: string,
            ) => string;
        }).getRowLevelSecurityWhereClause(provider, entityName, userPayload, type, returnPrefix);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeEntity(name: string, opts: {
    exempt: boolean;
    rlsClause: string;
}): EntityInfo {
    return {
        Name: name,
        UserExemptFromRowLevelSecurity: () => opts.exempt,
        GetUserRowLevelSecurityWhereClause: () => opts.exempt ? '' : opts.rlsClause,
    } as unknown as EntityInfo;
}

function makeProvider(entities: EntityInfo[]): DatabaseProviderBase {
    return {
        Entities: entities,
    } as unknown as DatabaseProviderBase;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ResolverBase.getRowLevelSecurityWhereClause', () => {
    let resolver: TestResolver;

    beforeEach(() => {
        resolver = new TestResolver();
        mockUserCacheUsers.length = 0;
        mockUserCacheUsers.push({
            Email: 'test@example.com',
            ID: 'user-1',
        });
    });

    it('returns empty string when user is exempt from RLS', () => {
        const entity = makeEntity('Test Entity', { exempt: true, rlsClause: "OwnerID = 'user-1'" });
        const provider = makeProvider([entity]);

        const result = resolver.TestGetRLSWhereClause(
            provider, 'Test Entity', { email: 'test@example.com' }, 'Read', 'AND',
        );

        expect(result).toBe('');
    });

    it('returns RLS clause when user is NOT exempt', () => {
        const entity = makeEntity('Test Entity', { exempt: false, rlsClause: "AND OwnerID = 'user-1'" });
        const provider = makeProvider([entity]);

        const result = resolver.TestGetRLSWhereClause(
            provider, 'Test Entity', { email: 'test@example.com' }, 'Read', 'AND',
        );

        expect(result).toContain('OwnerID');
    });

    it('throws when entity not found', () => {
        const provider = makeProvider([]);

        expect(() => resolver.TestGetRLSWhereClause(
            provider, 'Nonexistent Entity', { email: 'test@example.com' }, 'Read', 'AND',
        )).toThrow('Entity Nonexistent Entity not found');
    });

    it('throws when user not found in UserCache', () => {
        const entity = makeEntity('Test Entity', { exempt: true, rlsClause: '' });
        const provider = makeProvider([entity]);
        mockUserCacheUsers.length = 0; // Clear cache

        expect(() => resolver.TestGetRLSWhereClause(
            provider, 'Test Entity', { email: 'unknown@example.com' }, 'Read', 'AND',
        )).toThrow('User unknown@example.com not found');
    });

    it('matches entity name case-insensitively', () => {
        const entity = makeEntity('MJ: AI Prompt Runs', { exempt: true, rlsClause: '' });
        const provider = makeProvider([entity]);

        const result = resolver.TestGetRLSWhereClause(
            provider, 'mj: ai prompt runs', { email: 'test@example.com' }, 'Read', 'AND',
        );

        expect(result).toBe('');
    });

    it('matches user email case-insensitively', () => {
        const entity = makeEntity('Test Entity', { exempt: true, rlsClause: '' });
        const provider = makeProvider([entity]);

        const result = resolver.TestGetRLSWhereClause(
            provider, 'Test Entity', { email: 'TEST@EXAMPLE.COM' }, 'Read', 'AND',
        );

        expect(result).toBe('');
    });
});
