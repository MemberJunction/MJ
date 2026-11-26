import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'GraphQLISODateTime',
        'GraphQLTimestamp', 'registerEnumType', 'createMethodDecorator', 'createParamDecorator',
        'buildSchema', 'buildSchemaSync', 'PubSub',
    ];
    return {
        ...Object.fromEntries(exportNames.map((name) => [name, decoratorFactory])),
        AuthorizationError: class AuthorizationError extends Error {},
        AuthenticationError: class AuthenticationError extends Error {},
    };
});

vi.mock('../config.js', () => ({
    configInfo: {
        databaseSettings: {
            requestTimeout: 30000,
        },
    },
}));

import { parse, getOperationAST } from 'graphql';
import type { Request, Response, NextFunction } from 'express';
import type { APIKeyEngine } from '@memberjunction/api-keys';
import {
    AuthorizationInfo,
    AuthorizationRoleInfo,
    BaseEntity,
    EntityInfo,
    RunView,
    ServerOperationScopeManager,
    UserInfo,
    WellKnownUserSource,
    type DatabaseProviderBase,
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
} from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { CloneUserForSessionContext } from '../auth/sessionUserClone.js';
import {
    AssertNotImpersonationSession,
    BuildActorImpersonationKeyLikePattern,
    BuildImpersonationKeyLabel,
    CloseImpersonationWebSockets,
    CreateImpersonationApolloPlugin,
    CreateImpersonationHttpGuardMiddleware,
    EvaluateGraphQLOperationForImpersonation,
    EvaluateTargetImpersonationEligibility,
    GetImpersonationSession,
    HasReservedImpersonationKeyLabelPrefix,
    IMPERSONATION_FORBIDDEN_ENTITY_NAMES,
    IMPERSONATION_READ_ONLY_ALLOWED_SCOPES,
    IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES,
    IMPERSONATION_WRITE_FORBIDDEN_ENTITY_NAMES,
    ImpersonationPostRunViewHook,
    ImpersonationPreDeleteHook,
    ImpersonationPreRunViewHook,
    ImpersonationPreSaveHook,
    IsEntityForbiddenDuringImpersonation,
    IsEntityWriteForbiddenDuringImpersonation,
    IsOnlyEndImpersonationMutation,
    IsSavedQueryForbiddenDuringImpersonation,
    ParseImpersonationKeyLabel,
    RegisterImpersonationWebSocket,
    RunWithImpersonationSession,
    StampImpersonationSession,
    USER_IMPERSONATION_AUTHORIZATION_NAME,
    USER_IMPERSONATION_KEY_LABEL_PREFIX,
    USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME,
    ValidateImpersonationWebSocketSubscribe,
    WithImpersonationCurrentUserBootstrap,
    WithImpersonationKeyMintScope,
} from '../auth/impersonationGuard.js';
import { ImpersonationSessionRefusalGuard } from '../auth/scopeLimitedAccess.js';
import {
    ClampUserImpersonationTtlMinutes,
    IsUserImpersonationEnabled,
    IsUserImpersonationWritesEnabled,
    RegisterServerUserImpersonationConfig,
    ResolveUserImpersonationConfig,
    USER_IMPERSONATION_DEFAULT_TTL_MINUTES,
    USER_IMPERSONATION_MAX_TTL_MINUTES,
    USER_IMPERSONATION_MIN_TTL_MINUTES,
    UserImpersonationConfigSchema,
} from '../userImpersonationConfigUnits.js';
import { QueryEngine } from '@memberjunction/core-entities';
import { RunQueryResolver } from '../resolvers/QueryResolver.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AdhocQueryResolver } from '../resolvers/AdhocQueryResolver.js';
import { APIKeyResolver } from '../resolvers/APIKeyResolver.js';
import { DatasetResolverExtended } from '../resolvers/DatasetResolver.js';
import { EntityRecordNameResolver } from '../resolvers/EntityRecordNameResolver.js';
import { SearchEntitiesResolver } from '../resolvers/SearchEntitiesResolver.js';
import {
    EvaluateUserImpersonationAuthorization,
    EvaluateUserImpersonationWriteAuthorization,
    IMPERSONATION_SENSITIVE_ENTITY_DENY_PATTERN,
    USER_IMPERSONATION_AUDIT_LOG_TYPES,
    UserImpersonationResolver,
} from '../resolvers/UserImpersonationResolver.js';
import type { AppContext, ProviderInfo, UserPayload } from '../types.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const INACTIVE_USER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_TARGET_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_TARGET_ID = '66666666-6666-4666-8666-000000000001';
const DEV_TARGET_ID = '66666666-6666-4666-8666-000000000002';
const INTEGRATION_TARGET_ID = '66666666-6666-4666-8666-000000000003';
const PEER_IMPERSONATOR_TARGET_ID = '66666666-6666-4666-8666-000000000004';

const ADMIN_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000001';
const IMPERSONATOR_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000002';
const DENY_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000003';
const WRITE_IMPERSONATOR_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000004';
const DEVELOPER_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000005';
const INTEGRATION_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000006';
const ANALYST_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000007';

const AUTH_ID = '062370F4-DAEC-4E5E-BD0A-4AF2A28968EE';
const WRITE_AUTH_ID = 'C0D0BBD6-74B8-4CE3-ADF6-4081358EE0B9';
const PARENT_AUTH_ID = '062370F4-DAEC-4E5E-BD0A-4AF2A28968FF';

const AUDIT_TYPE_STARTED_ID = 'AB46EB0B-2286-4D6B-A9A7-FED4AF90E262';
const AUDIT_TYPE_ENDED_ID = '2B43CE9C-58D7-4F65-9DDC-59A59C4EAD93';
const AUDIT_TYPE_DENIED_ID = '1648EFFA-D31A-4E35-A985-C7B56EEB95D8';
const USERS_ENTITY_ID = 'eeee0000-0000-4000-8000-000000000001';
const AUDIT_ENTITY_ID = 'eeee0000-0000-4000-8000-000000000002';

const FULL_ACCESS_SCOPE_ID = '99990000-0000-4000-8000-000000000000';
const VIEW_RUN_SCOPE_ID = '99990000-0000-4000-8000-000000000001';
const ENTITY_READ_SCOPE_ID = '99990000-0000-4000-8000-000000000002';
const USER_READ_SCOPE_ID = '99990000-0000-4000-8000-000000000003';
const QUERY_RUN_SCOPE_ID = '99990000-0000-4000-8000-000000000004';
const ENTITY_CREATE_SCOPE_ID = '99990000-0000-4000-8000-000000000005';
const ENTITY_UPDATE_SCOPE_ID = '99990000-0000-4000-8000-000000000006';
const ENTITY_DELETE_SCOPE_ID = '99990000-0000-4000-8000-000000000007';
const ENTITY_MERGE_SCOPE_ID = '99990000-0000-4000-8000-000000000008';

const MINTED_KEY_ID = '66666666-6666-4666-8666-666666666666';
const PRIOR_ACTOR_KEY_ID = '66666666-6666-4666-8666-666666666667';
const OTHER_ACTOR_KEY_ID = '66666666-6666-4666-8666-666666666668';
const REGULAR_KEY_ID = '77777777-7777-4777-8777-777777777777';
const SCOPE_ROW_ID = '88888888-8888-4888-8888-888888888888';
const MJAPI_APP_ID = '88888888-8888-4888-8888-888888888899';

interface SavedEntityRecord {
    readonly entityName: string;
    readonly data: Record<string, unknown>;
}

interface MockEntity {
    NewRecord: ReturnType<typeof vi.fn>;
    Load: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
    [key: string]: unknown;
}

function makeUser(opts: {
    id: string;
    name: string;
    email: string;
    type?: string;
    isActive?: boolean;
    roles?: Array<{ RoleID: string; Role: string }>;
}): UserInfo {
    return new UserInfo(null, {
        ID: opts.id,
        Name: opts.name,
        Email: opts.email,
        Type: opts.type ?? 'User',
        IsActive: opts.isActive ?? true,
        UserRoles: (opts.roles ?? []).map((r) => ({
            UserID: opts.id,
            RoleID: r.RoleID,
            Role: r.Role,
        })),
    });
}

function makeAuth(overrides?: Partial<AuthorizationInfo>): AuthorizationInfo {
    return new AuthorizationInfo({
        ID: AUTH_ID,
        Name: USER_IMPERSONATION_AUTHORIZATION_NAME,
        IsActive: true,
        UseAuditLog: true,
        ParentID: null,
        ...overrides,
    });
}

function makeWriteAuth(overrides?: Partial<AuthorizationInfo>): AuthorizationInfo {
    return new AuthorizationInfo({
        ID: WRITE_AUTH_ID,
        Name: USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME,
        IsActive: true,
        UseAuditLog: true,
        ParentID: AUTH_ID,
        ...overrides,
    });
}

function makeGrant(
    type: 'Allow' | 'Deny',
    roleId: string,
    authorizationId: string = AUTH_ID
): AuthorizationRoleInfo {
    return new AuthorizationRoleInfo({
        ID: `grant-${type}-${roleId}-${authorizationId}`,
        AuthorizationID: authorizationId,
        RoleID: roleId,
        Type: type,
    });
}

interface HarnessOptions {
    featureEnabled?: boolean;
    allowWrites?: boolean;
    maxTtlMinutes?: number;
    protectedTargetRoles?: string[];
    authorizations?: AuthorizationInfo[];
    authorizationRoles?: AuthorizationRoleInfo[];
    runViewHandler?: (params: RunViewParams) => RunViewResult<unknown>;
    scopeSaveResult?: boolean;
    auditSaveResult?: boolean;
    auditSaveThrows?: boolean;
    createKeyResult?: { Success: boolean; RawKey?: string; APIKeyId?: string; Error?: string };
    extraApiKeys?: Array<{ ID: string; Label: string; Status: string; UserID: string }>;
    applications?: Array<{ ID: string; Name: string; IsActive: boolean }>;
    startedAuditLogs?: Array<{ ID: string; UserID: string; RecordID: string; Details: string }>;
}

class TestableUserImpersonationResolver extends UserImpersonationResolver {
    public constructor(
        private readonly engineMock: APIKeyEngine,
        private readonly systemUser: UserInfo
    ) {
        super();
    }

    protected override getApiKeyEngine(): APIKeyEngine {
        return this.engineMock;
    }

    protected override async resolvePrivilegedUser(): Promise<UserInfo> {
        return this.systemUser;
    }
}

function createHarness(opts: HarnessOptions = {}) {
    RegisterServerUserImpersonationConfig({
        enabled: opts.featureEnabled ?? true,
        allowWrites: opts.allowWrites ?? false,
        defaultTtlMinutes: USER_IMPERSONATION_DEFAULT_TTL_MINUTES,
        maxTtlMinutes: opts.maxTtlMinutes ?? USER_IMPERSONATION_MAX_TTL_MINUTES,
        ...(opts.protectedTargetRoles ? { protectedTargetRoles: opts.protectedTargetRoles } : {}),
    });

    const savedRecords: SavedEntityRecord[] = [];
    const deletedRecords: Array<{ entityName: string; id: string }> = [];

    const systemUser = makeUser({
        id: SYSTEM_USER_ID,
        name: 'System',
        email: 'system@example.com',
        type: 'System',
    });

    const apiKeyEngine = {
        Config: vi.fn().mockResolvedValue(undefined),
        Scopes: [
            { ID: FULL_ACCESS_SCOPE_ID, FullPath: 'full_access' },
            { ID: VIEW_RUN_SCOPE_ID, FullPath: 'view:run' },
            { ID: ENTITY_READ_SCOPE_ID, FullPath: 'entity:read' },
            { ID: USER_READ_SCOPE_ID, FullPath: 'user:read' },
            { ID: QUERY_RUN_SCOPE_ID, FullPath: 'query:run' },
            { ID: ENTITY_CREATE_SCOPE_ID, FullPath: 'entity:create' },
            { ID: ENTITY_UPDATE_SCOPE_ID, FullPath: 'entity:update' },
            { ID: ENTITY_DELETE_SCOPE_ID, FullPath: 'entity:delete' },
            { ID: ENTITY_MERGE_SCOPE_ID, FullPath: 'entity:merge' },
        ],
        Applications: opts.applications ?? [{ ID: MJAPI_APP_ID, Name: 'MJAPI', IsActive: true }],
        CreateAPIKey: vi.fn().mockResolvedValue(
            opts.createKeyResult ?? {
                Success: true,
                RawKey: 'mj_sk_temp_impersonation_secret',
                APIKeyId: MINTED_KEY_ID,
            }
        ),
        RevokeAPIKey: vi.fn().mockResolvedValue(true),
        RefreshCache: vi.fn().mockResolvedValue(undefined),
    };

    const defaultUsers = [
        {
            ID: SYSTEM_USER_ID,
            Name: 'System',
            FirstName: 'System',
            LastName: 'Account',
            Email: 'system@example.com',
            Title: 'System',
            Type: 'System',
            IsActive: true,
        },
        {
            ID: ACTOR_USER_ID,
            Name: 'Alice Support Lead',
            FirstName: 'Alice',
            LastName: 'Support',
            Email: 'alice@example.com',
            Title: 'Support Lead',
            Type: 'User',
            IsActive: true,
        },
        {
            ID: OWNER_TARGET_ID,
            Name: 'Olivia Owner',
            FirstName: 'Olivia',
            LastName: 'Owner',
            Email: 'olivia@example.com',
            Title: 'Platform Owner',
            Type: 'Owner',
            IsActive: true,
        },
        {
            ID: ADMIN_TARGET_ID,
            Name: 'Aaron Admin',
            FirstName: 'Aaron',
            LastName: 'Admin',
            Email: 'aaron@example.com',
            Title: 'SysAdmin',
            Type: 'User',
            IsActive: true,
        },
        {
            ID: DEV_TARGET_ID,
            Name: 'Devon Developer',
            FirstName: 'Devon',
            LastName: 'Developer',
            Email: 'devon@example.com',
            Title: 'Staff Engineer',
            Type: 'User',
            IsActive: true,
        },
        {
            ID: INTEGRATION_TARGET_ID,
            Name: 'Ian Integration',
            FirstName: 'Ian',
            LastName: 'Integration',
            Email: 'ian@example.com',
            Title: 'Integration Bot',
            Type: 'User',
            IsActive: true,
        },
        {
            ID: PEER_IMPERSONATOR_TARGET_ID,
            Name: 'Paula PeerLead',
            FirstName: 'Paula',
            LastName: 'PeerLead',
            Email: 'paula@example.com',
            Title: 'Peer Support Lead',
            Type: 'User',
            IsActive: true,
        },
        {
            ID: TARGET_USER_ID,
            Name: 'Bob Analyst',
            FirstName: 'Bob',
            LastName: 'Analyst',
            Email: 'bob@example.com',
            Title: 'Revenue Analyst',
            Type: 'User',
            IsActive: true,
        },
        {
            ID: OTHER_USER_ID,
            Name: 'Cara Member',
            FirstName: 'Cara',
            LastName: 'Member',
            Email: 'cara@example.com',
            Title: 'Customer Member',
            Type: 'User',
            IsActive: true,
        },
        {
            ID: INACTIVE_USER_ID,
            Name: 'Dave Former',
            FirstName: 'Dave',
            LastName: 'Former',
            Email: 'dave@example.com',
            Title: 'Former Staff',
            Type: 'User',
            IsActive: false,
        },
    ];

    const defaultUserRoles = [
        { UserID: TARGET_USER_ID, RoleID: ANALYST_ROLE_ID, Role: 'Analyst' },
        { UserID: OTHER_USER_ID, RoleID: ANALYST_ROLE_ID, Role: 'Member' },
        { UserID: ADMIN_TARGET_ID, RoleID: ADMIN_ROLE_ID, Role: 'Administrator' },
        { UserID: DEV_TARGET_ID, RoleID: DEVELOPER_ROLE_ID, Role: 'Developer' },
        { UserID: INTEGRATION_TARGET_ID, RoleID: INTEGRATION_ROLE_ID, Role: 'Integration' },
        { UserID: PEER_IMPERSONATOR_TARGET_ID, RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' },
    ];

    const defaultApiKeys = [
        {
            ID: MINTED_KEY_ID,
            Label: BuildImpersonationKeyLabel('ViewAs', ACTOR_USER_ID, TARGET_USER_ID),
            Status: 'Active',
            UserID: TARGET_USER_ID,
        },
        {
            ID: REGULAR_KEY_ID,
            Label: 'CI Integration Key',
            Status: 'Active',
            UserID: ACTOR_USER_ID,
        },
        ...(opts.extraApiKeys ?? []),
    ];

    const configuredAuths = opts.authorizations ?? [makeAuth(), makeWriteAuth()];
    const configuredAuthRoles = opts.authorizationRoles ?? [];

    const runViewMock = vi.fn().mockImplementation(async (params: RunViewParams): Promise<RunViewResult<unknown>> => {
        if (opts.runViewHandler) {
            return opts.runViewHandler(params);
        }
        if (params.EntityName === 'MJ: Users') {
            const filter = params.ExtraFilter ?? '';
            const idMatch = filter.match(/ID\s*=\s*'([^']+)'/i);
            if (idMatch) {
                const found = defaultUsers.filter((u) => u.ID.toLowerCase() === idMatch[1].toLowerCase());
                return { Success: true, Results: found } as RunViewResult<unknown>;
            }
            const activeOnly = /IsActive\s*=\s*1/i.test(filter);
            return {
                Success: true,
                Results: activeOnly ? defaultUsers.filter((u) => u.IsActive) : defaultUsers,
            } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: User Roles') {
            const filter = params.ExtraFilter ?? '';
            const idMatch = filter.match(/UserID\s*=\s*'([^']+)'/i);
            const rows = idMatch
                ? defaultUserRoles.filter((r) => r.UserID.toLowerCase() === idMatch[1].toLowerCase())
                : defaultUserRoles;
            return { Success: true, Results: rows } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: Authorizations') {
            return {
                Success: true,
                Results: configuredAuths.map((a) => ({
                    ID: a.ID,
                    Name: a.Name,
                    ParentID: a.ParentID,
                    IsActive: a.IsActive,
                    UseAuditLog: a.UseAuditLog,
                })),
            } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: Authorization Roles') {
            return {
                Success: true,
                Results: configuredAuthRoles.map((r) => ({
                    ID: r.ID,
                    AuthorizationID: r.AuthorizationID,
                    RoleID: r.RoleID,
                    Type: r.Type,
                })),
            } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: API Keys') {
            const filter = params.ExtraFilter ?? '';
            const idMatch = filter.match(/ID\s*=\s*'([^']+)'/i);
            if (idMatch) {
                const rows = defaultApiKeys.filter((k) => k.ID.toLowerCase() === idMatch[1].toLowerCase());
                return { Success: true, Results: rows } as RunViewResult<unknown>;
            }
            const likeMatch = filter.match(/Label\s+LIKE\s+'MJ-Impersonation:v1:%:([^:']+):%'/i);
            if (likeMatch) {
                const actorUuid = likeMatch[1].toLowerCase();
                const rows = defaultApiKeys.filter((k) =>
                    k.Label.toLowerCase().includes(`:${actorUuid}:`)
                );
                return { Success: true, Results: rows } as RunViewResult<unknown>;
            }
            return { Success: true, Results: defaultApiKeys } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: API Key Scopes') {
            return {
                Success: true,
                Results: [{ ID: SCOPE_ROW_ID }],
            } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: API Key Applications') {
            return {
                Success: true,
                Results: [{ ID: 'app-bind-1' }],
            } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: Audit Logs') {
            const defaultStartedAuditLogs = opts.startedAuditLogs ?? [
                {
                    ID: 'audit-started-default',
                    UserID: ACTOR_USER_ID,
                    RecordID: TARGET_USER_ID,
                    Details: JSON.stringify({
                        action: 'MJStartUserImpersonation',
                        apiKeyId: MINTED_KEY_ID,
                        actorUserId: ACTOR_USER_ID,
                        targetUserId: TARGET_USER_ID,
                    }),
                },
            ];
            return {
                Success: true,
                Results: defaultStartedAuditLogs,
            } as RunViewResult<unknown>;
        }
        return { Success: true, Results: [] } as RunViewResult<unknown>;
    });

    const getEntityObjectMock = vi.fn().mockImplementation(async (entityName: string) => {
        let loadedId: string | null = null;
        const entity: MockEntity = {
            NewRecord: vi.fn(),
            Load: vi.fn().mockImplementation(async (id: string) => {
                loadedId = id;
                return true;
            }),
            Save: vi.fn().mockImplementation(async () => {
                if (entityName === 'MJ: Audit Logs') {
                    if (opts.auditSaveThrows) {
                        throw new Error('Simulated DB outage on AuditLog.Save');
                    }
                    if (opts.auditSaveResult === false) {
                        return false;
                    }
                }
                if (entityName === 'MJ: API Key Scopes' && opts.scopeSaveResult === false) {
                    return false;
                }
                const snapshot: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(entity)) {
                    if (typeof v !== 'function') {
                        snapshot[k] = v;
                    }
                }
                savedRecords.push({ entityName, data: snapshot });
                return true;
            }),
            Delete: vi.fn().mockImplementation(async () => {
                if (loadedId) {
                    deletedRecords.push({ entityName, id: loadedId });
                }
                return true;
            }),
        };
        return entity;
    });

    const provider = {
        Authorizations: configuredAuths,
        AuthorizationRoles: configuredAuthRoles,
        Roles: [
            { ID: ADMIN_ROLE_ID, Name: 'Administrator' },
            { ID: DEVELOPER_ROLE_ID, Name: 'Developer' },
            { ID: INTEGRATION_ROLE_ID, Name: 'Integration' },
            { ID: IMPERSONATOR_ROLE_ID, Name: 'Support Impersonator' },
            { ID: WRITE_IMPERSONATOR_ROLE_ID, Name: 'Support Write Impersonator' },
            { ID: ANALYST_ROLE_ID, Name: 'Analyst' },
        ],
        AuditLogTypes: [
            { ID: AUDIT_TYPE_STARTED_ID, Name: USER_IMPERSONATION_AUDIT_LOG_TYPES.Started },
            { ID: AUDIT_TYPE_ENDED_ID, Name: USER_IMPERSONATION_AUDIT_LOG_TYPES.Ended },
            { ID: AUDIT_TYPE_DENIED_ID, Name: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied },
        ],
        Entities: [
            { ID: USERS_ENTITY_ID, Name: 'MJ: Users' },
            { ID: AUDIT_ENTITY_ID, Name: 'MJ: Audit Logs' },
        ],
        GetEntityObject: getEntityObjectMock,
        RunView: runViewMock,
    } as unknown as DatabaseProviderBase & IMetadataProvider;

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: runViewMock,
    } as unknown as RunView);

    vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);

    const resolver = new TestableUserImpersonationResolver(
        apiKeyEngine as unknown as APIKeyEngine,
        systemUser
    );

    const makeContext = (
        actorUser: UserInfo | null,
        extra?: {
            apiKeyId?: string;
            hasRawApiKeyHeader?: boolean;
            isSystemUser?: boolean;
            clientIp?: string;
            userAgent?: string;
        }
    ): AppContext => ({
        dataSource: {} as AppContext['dataSource'],
        dataSources: [],
        providers: [{ type: 'Read-Write', provider } as ProviderInfo],
        ClientIp: extra?.clientIp ?? '203.0.113.42',
        UserAgent: extra?.userAgent ?? 'Vitest-RedTeam/1.0',
        HasRawApiKeyHeader: extra?.hasRawApiKeyHeader ?? false,
        userPayload: actorUser
            ? {
                  email: actorUser.Email,
                  userRecord: actorUser,
                  sessionId: 'sess-1',
                  ...(extra?.apiKeyId ? { apiKeyId: extra.apiKeyId } : {}),
                  ...(extra?.isSystemUser ? { isSystemUser: true } : {}),
              }
            : (undefined as unknown as AppContext['userPayload']),
    });

    return {
        resolver,
        provider,
        apiKeyEngine,
        savedRecords,
        deletedRecords,
        makeContext,
        runViewMock,
    };
}

describe('User Impersonation — Principal Adversarial Security Suite', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.MJ_ENABLE_USER_IMPERSONATION;
        delete process.env.MJ_USER_IMPERSONATION_ALLOW_WRITES;
        delete process.env.MJ_USER_IMPERSONATION_MAX_TTL_MINUTES;
        RegisterServerUserImpersonationConfig(null);
        UserImpersonationResolver.ResetDeniedAuditRateLimitForTests();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        RegisterServerUserImpersonationConfig(null);
    });

    describe('1. Dual-Key Infrastructure Kill Switch (Off by Default Everywhere)', () => {
        it('defaults enabled=false and allowWrites=false when unconfigured, blocking even authorized roles with FEATURE_DISABLED', async () => {
            const parsedDefaults = UserImpersonationConfigSchema.parse({});
            expect(parsedDefaults.enabled).toBe(false);
            expect(parsedDefaults.allowWrites).toBe(false);
            expect(parsedDefaults.defaultTtlMinutes).toBe(15);
            expect(parsedDefaults.maxTtlMinutes).toBe(60);
            expect(IsUserImpersonationEnabled()).toBe(false);

            const { resolver, makeContext } = createHarness({
                featureEnabled: false,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const canRes = await resolver.MJCanImpersonateUsers(makeContext(caller));
            expect(canRes.CanImpersonate).toBe(false);
            expect(canRes.CanImpersonateWithWrites).toBe(false);
            expect(canRes.ResultCode).toBe('FEATURE_DISABLED');

            const listRes = await resolver.MJListImpersonatableUsers(undefined, makeContext(caller));
            expect(listRes.Authorized).toBe(false);
            expect(listRes.ResultCode).toBe('FEATURE_DISABLED');
            expect(listRes.Users).toEqual([]);

            const startRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                makeContext(caller)
            );
            expect(startRes.Success).toBe(false);
            expect(startRes.ResultCode).toBe('FEATURE_DISABLED');
        });

        it('honors emergency env kill switch MJ_ENABLE_USER_IMPERSONATION=false even when mj.config.cjs sets enabled=true', () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            expect(IsUserImpersonationEnabled()).toBe(true);

            process.env.MJ_ENABLE_USER_IMPERSONATION = 'false';
            expect(IsUserImpersonationEnabled()).toBe(false);
            expect(IsUserImpersonationWritesEnabled()).toBe(false);
        });

        it('STILL allows MJEndUserImpersonation to revoke active impersonation keys (retaining the revoked key row for forensics) when kill switch is flipped OFF mid-incident', async () => {
            const { resolver, makeContext, apiKeyEngine, deletedRecords } = createHarness({
                featureEnabled: false,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const endRes = await resolver.MJEndUserImpersonation(
                { APIKeyID: MINTED_KEY_ID },
                makeContext(caller)
            );
            expect(endRes.Success).toBe(true);
            expect(endRes.ResultCode).toBe('IMPERSONATION_ENDED');
            expect(apiKeyEngine.RevokeAPIKey).toHaveBeenCalledWith(
                MINTED_KEY_ID,
                expect.anything(),
                expect.anything()
            );
            // Scopes and app bindings are purged, while the revoked MJ: API Keys row is retained for forensic lineage
            expect(deletedRecords).toContainEqual({ entityName: 'MJ: API Key Scopes', id: SCOPE_ROW_ID });
            expect(deletedRecords).toContainEqual({ entityName: 'MJ: API Key Applications', id: 'app-bind-1' });
            expect(deletedRecords).not.toContainEqual({ entityName: 'MJ: API Keys', id: MINTED_KEY_ID });
        });

        it('denies even Owner/Administrator/Developer when infrastructure flag is true but User Impersonation has ZERO AuthorizationRoles', async () => {
            const { resolver, makeContext } = createHarness({
                featureEnabled: true,
                authorizationRoles: [],
            });
            const ownerAdmin = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                type: 'Owner',
                roles: [{ RoleID: ADMIN_ROLE_ID, Role: 'Administrator' }],
            });

            const canRes = await resolver.MJCanImpersonateUsers(makeContext(ownerAdmin));
            expect(canRes.CanImpersonate).toBe(false);
            expect(canRes.ResultCode).toBe('FORBIDDEN');

            const startRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                makeContext(ownerAdmin)
            );
            expect(startRes.Success).toBe(false);
            expect(startRes.ResultCode).toBe('FORBIDDEN');
        });

        it('enforces Deny precedence over Allow and ancestor grants', () => {
            const parentAuth = makeAuth({ ID: PARENT_AUTH_ID, Name: 'Security Operations', ParentID: null });
            const leafAuth = makeAuth({ ParentID: PARENT_AUTH_ID });
            const user = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [
                    { RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' },
                    { RoleID: DENY_ROLE_ID, Role: 'Restricted' },
                ],
            });

            expect(
                EvaluateUserImpersonationAuthorization(user, {
                    Authorizations: [parentAuth, leafAuth],
                    AuthorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID, PARENT_AUTH_ID)],
                }).Allowed
            ).toBe(true);

            expect(
                EvaluateUserImpersonationAuthorization(user, {
                    Authorizations: [parentAuth, leafAuth],
                    AuthorizationRoles: [
                        makeGrant('Allow', IMPERSONATOR_ROLE_ID, PARENT_AUTH_ID),
                        makeGrant('Deny', DENY_ROLE_ID, AUTH_ID),
                    ],
                }).Allowed
            ).toBe(false);
        });
    });

    describe('2. Server-Enforced Read-Only ("View As") Default & Triple-Gated "Act As" Write Mode', () => {
        it('mints Read-Only ViewAs sessions by default, NEVER grants full_access, and attaches Priority=1000 IsDeny rules', async () => {
            const { resolver, makeContext, apiKeyEngine, savedRecords } = createHarness({
                featureEnabled: true,
                allowWrites: false,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const res = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                makeContext(caller)
            );
            expect(res.Success).toBe(true);
            expect(res.Mode).toBe('ViewAs');
            expect(res.ReadOnly).toBe(true);
            expect(apiKeyEngine.CreateAPIKey).toHaveBeenCalledWith(
                expect.objectContaining({
                    UserId: TARGET_USER_ID,
                    Label: `MJ-Impersonation:v1:RO:${ACTOR_USER_ID.toLowerCase()}:${TARGET_USER_ID.toLowerCase()}`,
                }),
                expect.anything(),
                expect.anything()
            );

            const scopeRows = savedRecords.filter((r) => r.entityName === 'MJ: API Key Scopes');
            // CRITICAL: full_access MUST NEVER be attached!
            expect(scopeRows.some((r) => r.data['ScopeID'] === FULL_ACCESS_SCOPE_ID)).toBe(false);
            // Write scopes MUST NOT be attached in Read-Only mode!
            expect(scopeRows.some((r) => r.data['ScopeID'] === ENTITY_CREATE_SCOPE_ID)).toBe(false);
            expect(scopeRows.some((r) => r.data['ScopeID'] === ENTITY_UPDATE_SCOPE_ID)).toBe(false);
            expect(scopeRows.some((r) => r.data['ScopeID'] === ENTITY_DELETE_SCOPE_ID)).toBe(false);

            // High-priority IsDeny rules MUST be attached for sensitive entities!
            const denyRows = scopeRows.filter((r) => r.data['IsDeny'] === true);
            expect(denyRows.length).toBeGreaterThanOrEqual(2);
            expect(denyRows[0].data['Priority']).toBe(1000);
            expect(denyRows[0].data['ResourcePattern']).toBe(IMPERSONATION_SENSITIVE_ENTITY_DENY_PATTERN);

            // Bound to MJAPI application to prevent MCP/A2A cross-app replay
            const appBinding = savedRecords.find((r) => r.entityName === 'MJ: API Key Applications');
            expect(appBinding?.data['ApplicationID']).toBe(MJAPI_APP_ID);
        });

        it('NEVER inherits child "User Impersonation: Act As (Allow Writes)" from parent "User Impersonation" grant!', async () => {
            const { resolver, makeContext } = createHarness({
                featureEnabled: true,
                allowWrites: true,
                // Caller ONLY holds Allow on parent User Impersonation — NOT on child Write auth!
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID, AUTH_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            expect(
                EvaluateUserImpersonationWriteAuthorization(caller, {
                    Authorizations: [makeAuth(), makeWriteAuth()],
                    AuthorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID, AUTH_ID)],
                }).Allowed
            ).toBe(false);

            const canRes = await resolver.MJCanImpersonateUsers(makeContext(caller));
            expect(canRes.CanImpersonate).toBe(true);
            expect(canRes.CanImpersonateWithWrites).toBe(false);

            const actAsDenied = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID, Mode: 'ActAs' },
                makeContext(caller)
            );
            expect(actAsDenied.Success).toBe(false);
            expect(actAsDenied.ResultCode).toBe('FORBIDDEN_WRITE_MODE');
        });

        it('requires ALL THREE gates (enabled + allowWrites + direct child Allow grant) before minting ActAs RW key', async () => {
            const callerWithBothRoles = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [
                    { RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' },
                    { RoleID: WRITE_IMPERSONATOR_ROLE_ID, Role: 'Support Write Impersonator' },
                ],
            });

            // Gate 2 off (allowWrites: false) -> WRITES_DISABLED even with direct child grant
            const disabledWritesHarness = createHarness({
                featureEnabled: true,
                allowWrites: false,
                authorizationRoles: [
                    makeGrant('Allow', IMPERSONATOR_ROLE_ID, AUTH_ID),
                    makeGrant('Allow', WRITE_IMPERSONATOR_ROLE_ID, WRITE_AUTH_ID),
                ],
            });
            const blockedByFlag = await disabledWritesHarness.resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID, Mode: 'ActAs' },
                disabledWritesHarness.makeContext(callerWithBothRoles)
            );
            expect(blockedByFlag.Success).toBe(false);
            expect(blockedByFlag.ResultCode).toBe('WRITES_DISABLED');

            // All 3 gates satisfied -> succeeds with RW label, still NO full_access, and attaches write IsDeny rules
            const allGatesHarness = createHarness({
                featureEnabled: true,
                allowWrites: true,
                authorizationRoles: [
                    makeGrant('Allow', IMPERSONATOR_ROLE_ID, AUTH_ID),
                    makeGrant('Allow', WRITE_IMPERSONATOR_ROLE_ID, WRITE_AUTH_ID),
                ],
            });
            const actAsOk = await allGatesHarness.resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID, Mode: 'ActAs' },
                allGatesHarness.makeContext(callerWithBothRoles)
            );
            expect(actAsOk.Success).toBe(true);
            expect(actAsOk.Mode).toBe('ActAs');
            expect(actAsOk.ReadOnly).toBe(false);
            expect(allGatesHarness.apiKeyEngine.CreateAPIKey).toHaveBeenCalledWith(
                expect.objectContaining({
                    Label: `MJ-Impersonation:v1:RW:${ACTOR_USER_ID.toLowerCase()}:${TARGET_USER_ID.toLowerCase()}`,
                }),
                expect.anything(),
                expect.anything()
            );
            const scopeRows = allGatesHarness.savedRecords.filter((r) => r.entityName === 'MJ: API Key Scopes');
            expect(scopeRows.some((r) => r.data['ScopeID'] === FULL_ACCESS_SCOPE_ID)).toBe(false);
            expect(scopeRows.some((r) => r.data['ScopeID'] === ENTITY_UPDATE_SCOPE_ID && r.data['IsDeny'] === true)).toBe(true);
        });

        it('enforces transport-level Read-Only mutation blocking across Apollo plugin, WebSocket onSubscribe, HTTP guard, and PreSave/PreDelete hooks (including batched-mutation smuggling!)', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const roSession = StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ViewAs',
                readOnly: true,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
                expiresAtMs: Date.now() + 60_000,
            });
            const userPayload = {
                email: target.Email,
                userRecord: target,
                sessionId: 's-ro',
                apiKeyId: MINTED_KEY_ID,
                impersonationSession: roSession,
            };

            // 1. Queries are allowed
            const queryOp = getOperationAST(parse('query { RunViewByName(input: { ViewName: "Accounts" }) { Success } }'));
            expect(EvaluateGraphQLOperationForImpersonation(queryOp, userPayload)).toBeNull();

            // 2. Arbitrary mutations are blocked with IMPERSONATION_READ_ONLY
            const mutOp = getOperationAST(parse('mutation { UpdateAccount(input: { ID: "1" }) { ID } }'));
            const mutErr = EvaluateGraphQLOperationForImpersonation(mutOp, userPayload);
            expect(mutErr?.extensions?.['code']).toBe('IMPERSONATION_READ_ONLY');

            // 3. Standalone MJEndUserImpersonation self-revoke IS permitted
            const endOp = getOperationAST(parse('mutation { MJEndUserImpersonation(input: { APIKeyID: "x" }) { Success } }'));
            expect(IsOnlyEndImpersonationMutation(endOp)).toBe(true);
            expect(EvaluateGraphQLOperationForImpersonation(endOp, userPayload)).toBeNull();

            // 4. RED-TEAM SMUGGLING ATTEMPT: Batched MJEndUserImpersonation + CreateMJUserRole in one mutation MUST BE BLOCKED!
            const batchedSmuggleOp = getOperationAST(
                parse('mutation { a: MJEndUserImpersonation(input: { APIKeyID: "x" }) { Success } b: CreateAccount(input: {}) { ID } }')
            );
            expect(IsOnlyEndImpersonationMutation(batchedSmuggleOp)).toBe(false);
            expect(EvaluateGraphQLOperationForImpersonation(batchedSmuggleOp, userPayload)?.extensions?.['code']).toBe(
                'IMPERSONATION_READ_ONLY'
            );

            // 5. Apollo plugin throws on didResolveOperation for mutations
            const plugin = CreateImpersonationApolloPlugin();
            const hooks = await plugin.requestDidStart!({} as Parameters<NonNullable<typeof plugin.requestDidStart>>[0]);
            await expect(
                hooks!.didResolveOperation!({
                    operation: mutOp!,
                    contextValue: { userPayload } as AppContext,
                } as Parameters<NonNullable<NonNullable<typeof hooks>['didResolveOperation']>>[0])
            ).rejects.toThrow(/Read-Only/);

            // 6. WebSocket graphql-ws onSubscribe blocks mutation over WebSocket
            const wsErrors = await ValidateImpersonationWebSocketSubscribe(
                userPayload,
                'mutation { RunAction(input: { ActionID: "1" }) { Success } }',
                undefined
            );
            expect(wsErrors?.[0]?.extensions?.['code']).toBe('IMPERSONATION_READ_ONLY');

            // 7. Express HTTP guard blocks REST writes AND OAuth/MagicLink/Widget capability routes
            const httpGuard = CreateImpersonationHttpGuardMiddleware('/');
            const runHttp = (method: string, path: string): { statusCode: number; nextCalled: boolean } => {
                let statusCode = 200;
                let nextCalled = false;
                const req = { method, path, url: path, userPayload } as unknown as Request;
                const res = {
                    status(code: number) {
                        statusCode = code;
                        return this;
                    },
                    json() {
                        return this;
                    },
                } as unknown as Response;
                const next: NextFunction = () => {
                    nextCalled = true;
                };
                httpGuard(req, res, next);
                return { statusCode, nextCalled };
            };
            expect(runHttp('POST', '/api/v1/entities/Accounts').statusCode).toBe(403);
            expect(runHttp('POST', '/api/v1/views/Accounts').nextCalled).toBe(true);
            expect(runHttp('GET', '/oauth/authorize').statusCode).toBe(403);
            expect(runHttp('POST', '/magic-link/create').statusCode).toBe(403);
            expect(runHttp('POST', '/api/v1/entities/MJ%3A%20Credentials').statusCode).toBe(403);

            // 8. DataHooks block BaseEntity Save & Delete inside ClientCrudBoundary (while allowing server record-access audit writes outside boundary!)
            const accountEntity = { EntityInfo: { Name: 'Accounts' }, IsSaved: false } as unknown as BaseEntity;
            const auditEntity = { EntityInfo: { Name: 'MJ: Audit Logs' }, IsSaved: false } as unknown as BaseEntity;
            expect(typeof ImpersonationPreSaveHook(accountEntity, target)).toBe('string');
            expect(typeof ImpersonationPreDeleteHook(accountEntity, target)).toBe('string');
            expect(ImpersonationPreSaveHook(auditEntity, target)).toBe(true);
            await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(async () => {
                expect(typeof ImpersonationPreSaveHook(auditEntity, target)).toBe('string');
            });
        });

        it('dynamically downgrades an active ActAs session to Read-Only the instant MJ_USER_IMPERSONATION_ALLOW_WRITES flips false', () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ActAs',
                readOnly: false,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
            });
            expect(GetImpersonationSession(target)?.readOnly).toBe(false);

            process.env.MJ_USER_IMPERSONATION_ALLOW_WRITES = 'false';
            expect(GetImpersonationSession(target)?.readOnly).toBe(true);
            expect(GetImpersonationSession(target)?.mode).toBe('ViewAs');
        });
    });

    describe('3. Strict Anti-Escalation & Peer-Admin Target Ceiling (Live DB + UserCache)', () => {
        it('excludes System, Owner, inactive, self, Administrator, Developer, Integration, and peer User Impersonation holders from listing and start', async () => {
            const { resolver, makeContext } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID, AUTH_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice Support Lead',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const listRes = await resolver.MJListImpersonatableUsers(undefined, makeContext(caller));
            expect(listRes.Authorized).toBe(true);
            // ONLY Bob Analyst & Cara Member are eligible out of 10 seeded users!
            expect(listRes.Users.map((u) => u.UserID)).toEqual([TARGET_USER_ID, OTHER_USER_ID]);

            for (const forbiddenId of [
                SYSTEM_USER_ID,
                OWNER_TARGET_ID,
                ADMIN_TARGET_ID,
                DEV_TARGET_ID,
                INTEGRATION_TARGET_ID,
                PEER_IMPERSONATOR_TARGET_ID,
                ACTOR_USER_ID,
            ]) {
                const attempt = await resolver.MJStartUserImpersonation(
                    { TargetUserID: forbiddenId },
                    makeContext(caller)
                );
                expect(attempt.Success).toBe(false);
                expect(attempt.ResultCode).toBe('FORBIDDEN_TARGET');
            }

            const inactiveAttempt = await resolver.MJStartUserImpersonation(
                { TargetUserID: INACTIVE_USER_ID },
                makeContext(caller)
            );
            expect(inactiveAttempt.Success).toBe(false);
            expect(inactiveAttempt.ResultCode).toBe('NOT_FOUND');
        });

        it('defeats TOCTOU cache lag by querying live DB with BypassCache=true AND cross-checking UserCache', async () => {
            const { resolver, makeContext, runViewMock } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID, AUTH_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            // Simulate Bob just being promoted to Administrator in UserCache while mock DB still shows Analyst
            vi.spyOn(UserCache.Instance, 'UserByID').mockImplementation((id: string) => {
                if (id === TARGET_USER_ID) {
                    return makeUser({
                        id: TARGET_USER_ID,
                        name: 'Bob',
                        email: 'bob@example.com',
                        roles: [{ RoleID: ADMIN_ROLE_ID, Role: 'Administrator' }],
                    });
                }
                return undefined;
            });

            const res = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                makeContext(caller)
            );
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('FORBIDDEN_TARGET');
            expect(runViewMock).toHaveBeenCalledWith(
                expect.objectContaining({ BypassCache: true }),
                expect.anything()
            );
        });

        it('honors custom protectedTargetRoles configuration', () => {
            const decision = EvaluateTargetImpersonationEligibility(
                {
                    ID: TARGET_USER_ID,
                    Name: 'Bob Finance',
                    Email: 'bob@example.com',
                    Type: 'User',
                    IsActive: true,
                    RoleNames: ['Payroll Approver'],
                    RoleIDs: new Set([ANALYST_ROLE_ID]),
                },
                {
                    actorUserId: ACTOR_USER_ID,
                    configOverride: { protectedTargetRoles: ['Administrator', 'Payroll Approver'] },
                }
            );
            expect(decision.Eligible).toBe(false);
            expect(decision.Code).toBe('FORBIDDEN_TARGET');
        });
    });

    describe('4. Sensitive Entity, Secret, Conversation & Query Isolation (Even in ActAs Mode)', () => {
        it('blocks reading and writing all security/credential/audit/identity entities while allowing CurrentUser self-bootstrap', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            const rawTarget = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            StampImpersonationSession(rawTarget, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ActAs',
                readOnly: false,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
            });
            // Verify CloneUserForSessionContext preserves impersonation stamping!
            const target = CloneUserForSessionContext(rawTarget);
            expect(GetImpersonationSession(target)?.mode).toBe('ActAs');

            for (const entityName of IMPERSONATION_FORBIDDEN_ENTITY_NAMES) {
                expect(IsEntityForbiddenDuringImpersonation(entityName, target)).toBe(true);
                expect(() => ImpersonationPreRunViewHook({ EntityName: entityName }, target)).toThrow();
                const entityObj = { EntityInfo: { Name: entityName }, IsSaved: true } as unknown as BaseEntity;
                expect(typeof ImpersonationPreSaveHook(entityObj, target)).toBe('string');
                expect(typeof ImpersonationPreDeleteHook(entityObj, target)).toBe('string');
            }

            // Narrow CurrentUser self-bootstrap permits ONLY target's own ID, never another user!
            await WithImpersonationCurrentUserBootstrap(TARGET_USER_ID, async () => {
                expect(IsEntityForbiddenDuringImpersonation('MJ: Users', target)).toBe(false);
                expect(IsEntityForbiddenDuringImpersonation('MJ: User Roles', target)).toBe(false);
                const otherUser = makeUser({ id: OTHER_USER_ID, name: 'Cara', email: 'cara@example.com' });
                expect(IsEntityForbiddenDuringImpersonation('MJ: Users', otherUser)).toBe(true);
                expect(IsEntityForbiddenDuringImpersonation('MJ: Credentials', target)).toBe(true);
            });
            expect(IsEntityForbiddenDuringImpersonation('MJ: Users', target)).toBe(true);
        });

        it('isolates unanchored personal 1:1 MJ: Conversations & MJ: Conversation Details to targetUserId only', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true });
            const sysUser = makeUser({ id: SYSTEM_USER_ID, name: 'System', email: 'sys@example.com', type: 'System' });
            vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);

            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ViewAs',
                readOnly: true,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
            });

            const rewritten = ImpersonationPreRunViewHook(
                { EntityName: 'MJ: Conversations', ExtraFilter: "Status = 'Available'", SaveViewResults: true },
                target
            ) as RunViewParams;
            expect(rewritten.SaveViewResults).toBe(false);
            expect(rewritten.ExtraFilter).toContain(`UserID = '${TARGET_USER_ID}'`);

            // PostRunView strips another user's private unanchored conversation while keeping anchored or own conversations
            const filteredConvs = await ImpersonationPostRunViewHook(
                { EntityName: 'MJ: Conversations' },
                {
                    Success: true,
                    RowCount: 3,
                    TotalRowCount: 3,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                    Results: [
                        { ID: 'c1', UserID: TARGET_USER_ID, AnchorType: null },
                        { ID: 'c2', UserID: OTHER_USER_ID, AnchorType: null },
                        { ID: 'c3', UserID: OTHER_USER_ID, AnchorType: 'Record' },
                    ],
                },
                target
            );
            expect((filteredConvs.Results as Array<{ ID: string }>).map((r) => r.ID)).toEqual(['c1', 'c3']);
        });

        it('blocks AdhocQueryResolver, secret saved queries, non-metadata Datasets with forbidden entities, and private Conversation record-name probes', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const session = StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ViewAs',
                readOnly: true,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
            });
            const userPayload = {
                email: target.Email,
                userRecord: target,
                sessionId: 's1',
                apiKeyId: MINTED_KEY_ID,
                impersonationSession: session,
            };

            // AdhocQueryResolver refuses impersonation sessions outright
            const adhoc = new AdhocQueryResolver();
            const adhocRes = await adhoc.ExecuteAdhocQuery(
                { SQL: 'SELECT * FROM __mj.vwConversations' },
                { providers: [], dataSources: [], dataSource: {} as AppContext['dataSource'], userPayload }
            );
            expect(adhocRes.Success).toBe(false);
            expect(adhocRes.ErrorMessage).toContain('impersonation');

            // Saved query secret check catches linked entity or SQL view reference
            expect(
                IsSavedQueryForbiddenDuringImpersonation(
                    { SQL: 'SELECT * FROM __mj.vwCredentials', Entities: [] },
                    [{ Name: 'MJ: Credentials', BaseView: 'vwCredentials', BaseTable: 'Credential' }]
                )
            ).toBe(true);
            expect(
                IsSavedQueryForbiddenDuringImpersonation(
                    { SQL: 'SELECT a.ID, u.Name FROM crm.vwAccounts a LEFT JOIN __mj.vwUsers u ON u.ID = a.OwnerID', Entities: [{ Entity: 'Accounts' }] },
                    [{ Name: 'MJ: Credentials', BaseView: 'vwCredentials', BaseTable: 'Credential' }]
                )
            ).toBe(false);

            // DatasetResolver strips forbidden items from MJ_Metadata and throws on custom datasets with forbidden items
            const dsResolver = new DatasetResolverExtended();
            const mockDsProvider = {
                EntityByName: () => undefined,
                GetDatasetByName: vi.fn().mockResolvedValue({
                    DatasetID: 'd1',
                    DatasetName: 'MJ_Metadata',
                    Success: true,
                    Status: 'OK',
                    LatestUpdateDate: new Date(),
                    Results: [
                        { Code: 'Entities', EntityName: 'MJ: Entities', EntityID: 'e1', LatestUpdateDate: new Date(), Results: [{ ID: '1' }] },
                        { Code: 'Roles', EntityName: 'MJ: Roles', EntityID: 'e2', LatestUpdateDate: new Date(), Results: [{ ID: 'r1' }] },
                    ],
                }),
            } as unknown as DatabaseProviderBase;
            const metaDs = await dsResolver.GetDatasetByName('MJ_Metadata', {
                providers: [{ type: 'Read-Only', provider: mockDsProvider } as ProviderInfo],
                userPayload,
            } as AppContext);
            const parsedItems = JSON.parse(metaDs.Results) as Array<{ EntityName: string; Results: unknown[] }>;
            expect(parsedItems.find((i) => i.EntityName === 'MJ: Entities')?.Results).toHaveLength(1);
            expect(parsedItems.find((i) => i.EntityName === 'MJ: Roles')?.Results).toHaveLength(0);

            // EntityRecordNameResolver hides another user's private unanchored Conversation title
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
            } as unknown as RunView);
            const nameResolver = new EntityRecordNameResolver();
            const mockNameProvider = {
                Entities: [{ Name: 'MJ: Conversations' }],
                GetEntityRecordName: vi.fn().mockResolvedValue('Secret CEO Board Chat'),
            } as unknown as DatabaseProviderBase;
            const nameRes = await nameResolver.InnerGetEntityRecordName(
                mockNameProvider,
                'MJ: Conversations',
                { KeyValuePairs: [{ FieldName: 'ID', Value: '99999999-9999-4999-8999-999999999999' }] },
                userPayload
            );
            expect(nameRes.Success).toBe(false);
            expect(nameRes.RecordName).toBeUndefined();
            expect(mockNameProvider.GetEntityRecordName).not.toHaveBeenCalled();
        });
    });

    describe('5. Short TTL, UUID Single-Active-Key Enforcement, Dual-Header Smuggling & Fail-Closed Audit Trail', () => {
        it('enforces 15m default TTL, 5m min, 60m hard ceiling, and downward maxTtlMinutes clamping', () => {
            expect(USER_IMPERSONATION_MIN_TTL_MINUTES).toBe(5);
            expect(USER_IMPERSONATION_DEFAULT_TTL_MINUTES).toBe(15);
            expect(USER_IMPERSONATION_MAX_TTL_MINUTES).toBe(60);

            expect(ClampUserImpersonationTtlMinutes(undefined)).toBe(15);
            expect(ClampUserImpersonationTtlMinutes(1)).toBe(5);
            expect(ClampUserImpersonationTtlMinutes(999)).toBe(60);

            RegisterServerUserImpersonationConfig({ enabled: true, maxTtlMinutes: 30 });
            expect(ResolveUserImpersonationConfig().maxTtlMinutes).toBe(30);
            expect(ClampUserImpersonationTtlMinutes(45)).toBe(30);
        });

        it('uses collision-proof UUID v1 labels, revokes only prior keys of the same actor, and fails closed to Read-Only on legacy labels', async () => {
            const label = BuildImpersonationKeyLabel('ViewAs', ACTOR_USER_ID, TARGET_USER_ID);
            expect(label).toBe(`MJ-Impersonation:v1:RO:${ACTOR_USER_ID}:${TARGET_USER_ID}`);
            expect(BuildActorImpersonationKeyLikePattern(ACTOR_USER_ID)).toBe(
                `MJ-Impersonation:v1:%:${ACTOR_USER_ID}:%`
            );

            const legacyParsed = ParseImpersonationKeyLabel(`${USER_IMPERSONATION_KEY_LABEL_PREFIX}spoof->bob@example.com`);
            expect(legacyParsed?.format).toBe('legacy');
            expect(legacyParsed?.readOnly).toBe(true);
            expect(legacyParsed?.mode).toBe('ViewAs');

            const { resolver, makeContext, apiKeyEngine } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                extraApiKeys: [
                    {
                        ID: PRIOR_ACTOR_KEY_ID,
                        Label: BuildImpersonationKeyLabel('ViewAs', ACTOR_USER_ID, OTHER_USER_ID),
                        Status: 'Active',
                        UserID: OTHER_USER_ID,
                    },
                    {
                        ID: OTHER_ACTOR_KEY_ID,
                        Label: BuildImpersonationKeyLabel('ViewAs', PEER_IMPERSONATOR_TARGET_ID, OTHER_USER_ID),
                        Status: 'Active',
                        UserID: OTHER_USER_ID,
                    },
                ],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const res = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID, TTLMinutes: 999 },
                makeContext(caller, { clientIp: '198.51.100.77', userAgent: 'Mozilla/Test' })
            );
            expect(res.Success).toBe(true);
            // Prior key of ACTOR_USER_ID was automatically revoked; OTHER_ACTOR_KEY_ID was untouched!
            expect(apiKeyEngine.RevokeAPIKey).toHaveBeenCalledWith(
                PRIOR_ACTOR_KEY_ID,
                expect.anything(),
                expect.anything()
            );
            expect(apiKeyEngine.RevokeAPIKey).not.toHaveBeenCalledWith(
                OTHER_ACTOR_KEY_ID,
                expect.anything(),
                expect.anything()
            );
        });

        it('FAILS CLOSED (AUDIT_LOG_FAILED) and immediately revokes & deletes the minted key if MJ: Audit Logs persistence returns false or throws!', async () => {
            for (const failureMode of [{ auditSaveResult: false }, { auditSaveThrows: true }]) {
                const { resolver, makeContext, apiKeyEngine, deletedRecords } = createHarness({
                    featureEnabled: true,
                    authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                    ...failureMode,
                });
                const caller = makeUser({
                    id: ACTOR_USER_ID,
                    name: 'Alice',
                    email: 'alice@example.com',
                    roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
                });

                const res = await resolver.MJStartUserImpersonation(
                    { TargetUserID: TARGET_USER_ID },
                    makeContext(caller)
                );
                expect(res.Success).toBe(false);
                expect(res.ResultCode).toBe('AUDIT_LOG_FAILED');
                expect(res.RawApiKey).toBeUndefined();
                expect(apiKeyEngine.RevokeAPIKey).toHaveBeenCalledWith(
                    MINTED_KEY_ID,
                    expect.anything(),
                    expect.anything()
                );
                expect(deletedRecords).toContainEqual({ entityName: 'MJ: API Keys', id: MINTED_KEY_ID });
            }
        });

        it('captures caller IP & User-Agent in AuditLog.Details and NEVER writes RawApiKey to AuditLog', async () => {
            const { resolver, makeContext, savedRecords } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const res = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                makeContext(caller, { clientIp: '198.51.100.99', userAgent: 'Chrome/SecAudit' })
            );
            expect(res.Success).toBe(true);

            const auditRow = savedRecords.find((r) => r.entityName === 'MJ: Audit Logs');
            const detailsJson = String(auditRow?.data['Details'] ?? '');
            expect(detailsJson).not.toContain('mj_sk_temp_impersonation_secret');
            const parsedDetails = JSON.parse(detailsJson) as Record<string, unknown>;
            expect(parsedDetails['ipAddress']).toBe('198.51.100.99');
            expect(parsedDetails['userAgent']).toBe('Chrome/SecAudit');
            expect(parsedDetails['mode']).toBe('ViewAs');
            expect(parsedDetails['readOnly']).toBe(true);
            expect(parsedDetails['ttlMinutes']).toBe(15);
        });

        it('rejects impersonation chaining, regular API keys, and dual-header smuggling (Bearer + x-api-key)', async () => {
            const { resolver, makeContext } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            // 1. Impersonation key -> FORBIDDEN_IMPERSONATION_CHAIN
            const chainRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: OTHER_USER_ID },
                makeContext(caller, { apiKeyId: MINTED_KEY_ID })
            );
            expect(chainRes.Success).toBe(false);
            expect(chainRes.ResultCode).toBe('FORBIDDEN_IMPERSONATION_CHAIN');

            // 2. Non-impersonation user API key -> FORBIDDEN
            const apiKeyRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: OTHER_USER_ID },
                makeContext(caller, { apiKeyId: REGULAR_KEY_ID })
            );
            expect(apiKeyRes.Success).toBe(false);
            expect(apiKeyRes.ResultCode).toBe('FORBIDDEN');

            // 3. Dual-header smuggled request (Bearer JWT + raw x-api-key header) -> FORBIDDEN
            const dualHeaderRes = await resolver.MJCanImpersonateUsers(
                makeContext(caller, { hasRawApiKeyHeader: true })
            );
            expect(dualHeaderRes.CanImpersonate).toBe(false);
            expect(dualHeaderRes.ResultCode).toBe('FORBIDDEN');
        });

        it('keeps scope constants strictly least-privilege (no full_access, apikey:*, agent:trusted, or async execution scopes)', () => {
            expect(IMPERSONATION_READ_ONLY_ALLOWED_SCOPES).not.toContain('full_access');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('full_access');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('apikey:create');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('apikey:revoke');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('agent:trusted');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('action:execute');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('agent:execute');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('agent:cancel');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('prompt:execute');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('task:execute');
            expect(IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES).not.toContain('task:cancel');
        });
    });

    describe('6. Item 1 — Request-Scoped AsyncLocalStorage Fallback for Unstamped UserInfo', () => {
        it('still blocks forbidden entities, filters private conversations, and blocks writes when hooks receive a second unstamped UserInfo for the target ID, while keeping system user exempt', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: false });
            const sysUser = makeUser({ id: SYSTEM_USER_ID, name: 'System', email: 'sys@example.com', type: 'System' });
            vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);

            const stampedTarget = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const session = StampImpersonationSession(stampedTarget, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ViewAs',
                readOnly: true,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
                expiresAtMs: Date.now() + 60_000,
            });

            // A completely distinct, UNSTAMPED UserInfo instance (as if re-resolved from UserCache)
            const unstampedTargetCopy = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            // Outside ALS, the unstamped copy is NOT recognized
            expect(GetImpersonationSession(unstampedTargetCopy)).toBeNull();

            await RunWithImpersonationSession(session, async () => {
                // Inside ALS, the unstamped copy IS recognized by targetUserId!
                expect(GetImpersonationSession(unstampedTargetCopy)?.apiKeyId).toBe(MINTED_KEY_ID);
                expect(IsEntityForbiddenDuringImpersonation('MJ: Credentials', unstampedTargetCopy)).toBe(true);
                expect(() => ImpersonationPreRunViewHook({ EntityName: 'MJ: Credentials' }, unstampedTargetCopy)).toThrow();

                // Private 1:1 conversations are still filtered on the unstamped copy
                const convFilter = ImpersonationPreRunViewHook(
                    { EntityName: 'MJ: Conversations', ExtraFilter: "Status = 'Available'" },
                    unstampedTargetCopy
                ) as RunViewParams;
                expect(convFilter.ExtraFilter).toContain(`UserID = '${TARGET_USER_ID}'`);

                const postFiltered = await ImpersonationPostRunViewHook(
                    { EntityName: 'MJ: Conversations' },
                    {
                        Success: true,
                        RowCount: 2,
                        TotalRowCount: 2,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                        Results: [
                            { ID: 'own', UserID: TARGET_USER_ID, AnchorType: null },
                            { ID: 'other-private', UserID: OTHER_USER_ID, AnchorType: null },
                        ],
                    },
                    unstampedTargetCopy
                );
                expect((postFiltered.Results as Array<{ ID: string }>).map((r) => r.ID)).toEqual(['own']);

                // Writes are still blocked on the unstamped copy
                const accountEntity = { EntityInfo: { Name: 'Accounts' }, IsSaved: false } as unknown as BaseEntity;
                expect(typeof ImpersonationPreSaveHook(accountEntity, unstampedTargetCopy)).toBe('string');
                expect(typeof ImpersonationPreDeleteHook(accountEntity, unstampedTargetCopy)).toBe('string');

                // Internal system-user lookup inside the same request stays exempt!
                expect(GetImpersonationSession(sysUser)).toBeNull();
                expect(() => ImpersonationPreRunViewHook({ EntityName: 'MJ: Credentials' }, sysUser)).not.toThrow();
            });
        });
    });

    describe('7. Item 3 — Reserved MJ-Impersonation: Label Protection & Forged Key Audit Refusal', () => {
        it('rejects MJ-Impersonation: prefix in CreateAPIKey and direct MJ: API Keys saves/modifications for ALL callers, allowing only WithImpersonationKeyMintScope', async () => {
            expect(HasReservedImpersonationKeyLabelPrefix('MJ-Impersonation:v1:RO:a:b')).toBe(true);
            expect(HasReservedImpersonationKeyLabelPrefix('  mj-impersonation:forged')).toBe(true);
            expect(HasReservedImpersonationKeyLabelPrefix('Normal CI Key')).toBe(false);

            // 1. APIKeyResolver.CreateAPIKey refuses the reserved prefix
            const normalUser = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const apiKeyResolver = new APIKeyResolver();
            const createRes = await apiKeyResolver.CreateAPIKey(
                { Label: `MJ-Impersonation:v1:RO:${ADMIN_TARGET_ID}:${TARGET_USER_ID}` },
                {
                    providers: [],
                    dataSources: [],
                    dataSource: {} as AppContext['dataSource'],
                    userPayload: { email: normalUser.Email, userRecord: normalUser, sessionId: 's-1' },
                }
            );
            expect(createRes.Success).toBe(false);
            expect(createRes.Error).toMatch(/reserved/i);

            // 2. ImpersonationPreSaveHook rejects creating a new MJ: API Keys row with the reserved prefix (even for non-impersonated users!)
            const forgedNewKey = {
                EntityInfo: { Name: 'MJ: API Keys' },
                IsSaved: false,
                Fields: [
                    {
                        Name: 'Label',
                        Value: `MJ-Impersonation:v1:RO:${ADMIN_TARGET_ID}:${TARGET_USER_ID}`,
                        OldValue: null,
                        Dirty: true,
                    },
                ],
            } as unknown as BaseEntity;
            expect(typeof ImpersonationPreSaveHook(forgedNewKey, normalUser)).toBe('string');

            // 3. Allowed strictly inside WithImpersonationKeyMintScope (server resolver's own mint)
            await WithImpersonationKeyMintScope(async () => {
                expect(ImpersonationPreSaveHook(forgedNewKey, normalUser)).toBe(true);
            });

            // 4. Rejects stripping or mutating the MJ-Impersonation: prefix mid-session on an existing row
            const strippedExistingKey = {
                EntityInfo: { Name: 'MJ: API Keys' },
                IsSaved: true,
                Fields: [
                    {
                        Name: 'Label',
                        Value: 'Benign Renamed Key',
                        OldValue: `MJ-Impersonation:v1:RO:${ACTOR_USER_ID}:${TARGET_USER_ID}`,
                        Dirty: true,
                    },
                ],
            } as unknown as BaseEntity;
            expect(typeof ImpersonationPreSaveHook(strippedExistingKey, normalUser)).toBe('string');

            // 5. Benign updates (Status/LastUsedAt) where Label is NOT dirty remain allowed for non-impersonated callers
            const statusUpdateOnly = {
                EntityInfo: { Name: 'MJ: API Keys' },
                IsSaved: true,
                Fields: [
                    {
                        Name: 'Label',
                        Value: `MJ-Impersonation:v1:RO:${ACTOR_USER_ID}:${TARGET_USER_ID}`,
                        OldValue: `MJ-Impersonation:v1:RO:${ACTOR_USER_ID}:${TARGET_USER_ID}`,
                        Dirty: false,
                    },
                    {
                        Name: 'Status',
                        Value: 'Revoked',
                        OldValue: 'Active',
                        Dirty: true,
                    },
                ],
            } as unknown as BaseEntity;
            expect(ImpersonationPreSaveHook(statusUpdateOnly, normalUser)).toBe(true);
        });

        it('refuses MJEndUserImpersonation on a forged key with no resolver-minted Started audit row and writes ZERO audit rows naming the admin', async () => {
            const forgedKeyId = '66666666-6666-4666-8666-666666669999';
            const { resolver, makeContext, savedRecords, apiKeyEngine } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                extraApiKeys: [
                    {
                        ID: forgedKeyId,
                        Label: BuildImpersonationKeyLabel('ViewAs', ADMIN_TARGET_ID, TARGET_USER_ID),
                        Status: 'Active',
                        UserID: TARGET_USER_ID,
                    },
                ],
                // No matching Started audit log exists for forgedKeyId!
                startedAuditLogs: [],
            });
            const attacker = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });

            const endRes = await resolver.MJEndUserImpersonation(
                { APIKeyID: forgedKeyId },
                makeContext(attacker, { apiKeyId: forgedKeyId })
            );
            expect(endRes.Success).toBe(false);
            expect(endRes.ResultCode).toBe('FORBIDDEN');
            expect(apiKeyEngine.RevokeAPIKey).not.toHaveBeenCalled();
            const auditRows = savedRecords.filter((r) => r.entityName === 'MJ: Audit Logs');
            expect(auditRows).toHaveLength(0);
        });
    });

    describe('8. Items 4 & 5 — Protected Roles Baseline Union & Live Role/Auth Query Fail-Closed', () => {
        it('always unions configured protectedTargetRoles with Administrator, Developer, and Integration', () => {
            const emptyOverride = ResolveUserImpersonationConfig({ protectedTargetRoles: [] });
            expect(emptyOverride.protectedTargetRoles).toEqual(
                expect.arrayContaining(['Administrator', 'Developer', 'Integration'])
            );

            const customOverride = ResolveUserImpersonationConfig({ protectedTargetRoles: ['HR'] });
            expect(customOverride.protectedTargetRoles).toEqual(
                expect.arrayContaining(['Administrator', 'Developer', 'Integration', 'HR'])
            );

            for (const baselineRole of ['Administrator', 'Developer', 'Integration']) {
                const decision = EvaluateTargetImpersonationEligibility(
                    {
                        ID: TARGET_USER_ID,
                        Name: 'Privileged User',
                        Email: 'priv@example.com',
                        Type: 'User',
                        IsActive: true,
                        RoleNames: [baselineRole],
                        RoleIDs: new Set([ADMIN_ROLE_ID]),
                    },
                    {
                        actorUserId: ACTOR_USER_ID,
                        configOverride: { protectedTargetRoles: [] },
                    }
                );
                expect(decision.Eligible).toBe(false);
                expect(decision.Code).toBe('FORBIDDEN_TARGET');
            }
        });

        it('fails closed (INTERNAL_ERROR / empty user list) when MJ: User Roles or MJ: Authorization Roles RunView returns Success: false', async () => {
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            // 1. MJ: User Roles query fails
            const failedRolesHarness = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                runViewHandler: (params) => {
                    if (params.EntityName === 'MJ: User Roles') {
                        return { Success: false, ErrorMessage: 'Transient DB failure', Results: [] } as RunViewResult<unknown>;
                    }
                    if (params.EntityName === 'MJ: Users') {
                        return {
                            Success: true,
                            Results: [{ ID: TARGET_USER_ID, Name: 'Bob', Email: 'bob@example.com', Type: 'User', IsActive: true }],
                        } as RunViewResult<unknown>;
                    }
                    return { Success: true, Results: [] } as RunViewResult<unknown>;
                },
            });

            const startRes = await failedRolesHarness.resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                failedRolesHarness.makeContext(caller)
            );
            expect(startRes.Success).toBe(false);
            expect(startRes.ResultCode).toBe('INTERNAL_ERROR');
            expect(failedRolesHarness.apiKeyEngine.CreateAPIKey).not.toHaveBeenCalled();

            const listRes = await failedRolesHarness.resolver.MJListImpersonatableUsers(
                undefined,
                failedRolesHarness.makeContext(caller)
            );
            expect(listRes.Authorized).toBe(false);
            expect(listRes.ResultCode).toBe('INTERNAL_ERROR');
            expect(listRes.Users).toEqual([]);

            // 2. MJ: Authorization Roles query fails
            const failedAuthRolesHarness = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                runViewHandler: (params) => {
                    if (params.EntityName === 'MJ: Authorization Roles') {
                        return { Success: false, ErrorMessage: 'Auth DB failure', Results: [] } as RunViewResult<unknown>;
                    }
                    return { Success: true, Results: [] } as RunViewResult<unknown>;
                },
            });

            const listAuthFail = await failedAuthRolesHarness.resolver.MJListImpersonatableUsers(
                undefined,
                failedAuthRolesHarness.makeContext(caller)
            );
            expect(listAuthFail.Authorized).toBe(false);
            expect(listAuthFail.ResultCode).toBe('INTERNAL_ERROR');
            expect(listAuthFail.Users).toEqual([]);
        });
    });

    describe('9. Item 6 — Default-Deny HTTP Guard at Both "/" and "/graphql" Roots', () => {
        const invokeHttp = (
            guard: ReturnType<typeof CreateImpersonationHttpGuardMiddleware>,
            method: string,
            path: string,
            userPayload: UserPayload
        ): { statusCode: number; body: Record<string, unknown> | null; nextCalled: boolean } => {
            let statusCode = 200;
            let body: Record<string, unknown> | null = null;
            let nextCalled = false;
            const req = { method, path, url: path, userPayload } as unknown as Request;
            const res = {
                status(code: number) {
                    statusCode = code;
                    return this;
                },
                json(payload: Record<string, unknown>) {
                    body = payload;
                    return this;
                },
            } as unknown as Response;
            const next: NextFunction = () => {
                nextCalled = true;
            };
            guard(req, res, next);
            return { statusCode, body, nextCalled };
        };

        it.each(['/', '/graphql'])(
            'default-denies non-GraphQL/non-REST routes (extensions, realtime recording, oauth, magic-link, widget) at root "%s" and enforces kill switch + expiry',
            (rootPath) => {
                RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
                const guard = CreateImpersonationHttpGuardMiddleware(rootPath);
                const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });

                const roSession = StampImpersonationSession(target, {
                    apiKeyId: MINTED_KEY_ID,
                    mode: 'ViewAs',
                    readOnly: true,
                    actorUserId: ACTOR_USER_ID,
                    targetUserId: TARGET_USER_ID,
                    expiresAtMs: Date.now() + 60_000,
                });
                const roPayload: UserPayload = {
                    email: target.Email,
                    userRecord: target,
                    sessionId: 'http-ro',
                    apiKeyId: MINTED_KEY_ID,
                    impersonationSession: roSession,
                };

                // Exact GraphQL root passes through to Apollo plugin
                expect(invokeHttp(guard, 'POST', rootPath, roPayload).nextCalled).toBe(true);
                // Non-GraphQL, non-REST routes are REFUSED for ViewAs even when root is '/'!
                for (const forbiddenPath of [
                    '/realtime/recording/abc/shard/0',
                    '/extensions/custom-webhook',
                    '/custom-plugin/action',
                    '/oauth/authorize',
                    '/magic-link/create',
                    '/widget/session',
                ]) {
                    const r = invokeHttp(guard, 'POST', forbiddenPath, roPayload);
                    expect(r.statusCode, `Expected 403 for ${forbiddenPath} under root ${rootPath}`).toBe(403);
                    expect(r.body?.['code']).toBe('IMPERSONATION_FORBIDDEN_ROUTE');
                    expect(r.nextCalled).toBe(false);
                }

                // REST reads pass in ViewAs; REST writes are refused
                expect(invokeHttp(guard, 'GET', '/api/v1/entities/Accounts', roPayload).nextCalled).toBe(true);
                expect(invokeHttp(guard, 'POST', '/api/v1/views/Accounts', roPayload).nextCalled).toBe(true);
                expect(invokeHttp(guard, 'POST', '/api/v1/entities/Accounts', roPayload).statusCode).toBe(403);

                // Kill switch OFF refuses BOTH ViewAs and ActAs on all non-GraphQL paths!
                const actAsTarget = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
                const actAsSession = StampImpersonationSession(actAsTarget, {
                    apiKeyId: MINTED_KEY_ID,
                    mode: 'ActAs',
                    readOnly: false,
                    actorUserId: ACTOR_USER_ID,
                    targetUserId: TARGET_USER_ID,
                    expiresAtMs: Date.now() + 60_000,
                });
                const actAsPayload: UserPayload = {
                    email: actAsTarget.Email,
                    userRecord: actAsTarget,
                    sessionId: 'http-rw',
                    apiKeyId: MINTED_KEY_ID,
                    impersonationSession: actAsSession,
                };

                process.env.MJ_ENABLE_USER_IMPERSONATION = 'false';
                for (const p of [roPayload, actAsPayload]) {
                    const extKill = invokeHttp(guard, 'POST', '/realtime/recording/abc/shard/0', p);
                    expect(extKill.statusCode).toBe(403);
                    expect(extKill.body?.['code']).toBe('FEATURE_DISABLED');

                    const restKill = invokeHttp(guard, 'POST', '/api/v1/views/Accounts', p);
                    expect(restKill.statusCode).toBe(403);
                    expect(restKill.body?.['code']).toBe('FEATURE_DISABLED');
                }

                // Expired session -> 401 UNAUTHENTICATED
                delete process.env.MJ_ENABLE_USER_IMPERSONATION;
                const expiredPayload: UserPayload = {
                    ...roPayload,
                    impersonationSession: { ...roSession, expiresAtMs: Date.now() - 5_000 },
                };
                const expRes = invokeHttp(guard, 'POST', rootPath, expiredPayload);
                expect(expRes.statusCode).toBe(401);
                expect(expRes.body?.['code']).toBe('UNAUTHENTICATED');
            }
        );
    });

    describe('10. Item 7 — Table-Driven Matrix Across ALL IMPERSONATION_FORBIDDEN_ENTITY_NAMES & All 8 Read/Query Surfaces', () => {
        class TestableResolverBase extends ResolverBase {
            public CallCheckUserReadPermissions(
                entityName: string,
                userPayload: UserPayload,
                provider: IMetadataProvider
            ): void {
                this.CheckUserReadPermissions(entityName, userPayload, provider);
            }

            public CallScreenClientViewClauses(
                extraFilter: string,
                user: UserInfo,
                provider: IMetadataProvider
            ): void {
                this.screenClientViewClauses({ extraFilter }, provider, user);
            }

            public async CallCreateAuditLogRecord(
                provider: DatabaseProviderBase,
                userPayload: UserPayload,
                description: string,
                details: string | null
            ): Promise<void> {
                await this.createAuditLogRecord(
                    provider,
                    userPayload,
                    null,
                    'Record Updated',
                    'Success',
                    description,
                    USERS_ENTITY_ID,
                    'rec-1',
                    details
                );
            }
        }

        function syntheticViewNameFor(entityName: string): string {
            const stripped = entityName.replace(/^MJ:\s*/i, '').replace(/[^A-Za-z0-9]/g, '');
            return `vw${stripped}`;
        }

        it('blocks EVERY entity in IMPERSONATION_FORBIDDEN_ENTITY_NAMES across RunView, RunViews, RunViewByID, single-record load, dataset, search, record-name lookup, and ExtraFilter subquery', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const session = StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ActAs',
                readOnly: false,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
                expiresAtMs: Date.now() + 60_000,
            });
            const userPayload: UserPayload = {
                email: target.Email,
                userRecord: target,
                sessionId: 'matrix-1',
                apiKeyId: MINTED_KEY_ID,
                impersonationSession: session,
            };

            const resolverBase = new TestableResolverBase();
            const datasetResolver = new DatasetResolverExtended();
            const searchResolver = new SearchEntitiesResolver();
            const recordNameResolver = new EntityRecordNameResolver();

            // Build metadata entries for Accounts + every forbidden entity so SQL subquery screening can match them
            const allEntitiesMeta = [
                {
                    ID: 'e-accounts',
                    Name: 'Accounts',
                    SchemaName: 'crm',
                    BaseView: 'vwAccounts',
                    BaseTable: 'Account',
                    Fields: [{ Name: 'ID', AllowDecryptInAPI: true, Encrypt: false }],
                    GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                },
                ...IMPERSONATION_FORBIDDEN_ENTITY_NAMES.map((name, idx) => ({
                    ID: `e-forb-${idx}`,
                    Name: name,
                    SchemaName: '__mj',
                    BaseView: syntheticViewNameFor(name),
                    BaseTable: syntheticViewNameFor(name).slice(2),
                    Fields: [{ Name: 'ID', AllowDecryptInAPI: true, Encrypt: false }],
                    GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
                })),
            ];
            const mockProvider = {
                Entities: allEntitiesMeta,
                EntityByName: (n: string) =>
                    allEntitiesMeta.find((e) => e.Name.toLowerCase() === n.toLowerCase()),
                SearchEntities: vi.fn().mockResolvedValue([]),
                GetEntityRecordName: vi.fn().mockResolvedValue('SHOULD_NEVER_LEAK'),
            } as unknown as DatabaseProviderBase & IMetadataProvider;

            for (const entityName of IMPERSONATION_FORBIDDEN_ENTITY_NAMES) {
                const baseView = syntheticViewNameFor(entityName);

                // 1. RunView
                expect(
                    () => ImpersonationPreRunViewHook({ EntityName: entityName }, target),
                    `RunView failed to block ${entityName}`
                ).toThrow();

                // 2. RunViews (batch containing an allowed entity + forbidden entity)
                expect(() => {
                    for (const p of [{ EntityName: 'Accounts' }, { EntityName: entityName }]) {
                        ImpersonationPreRunViewHook(p, target);
                    }
                }, `RunViews batch failed to block ${entityName}`).toThrow();

                // 3. RunViewByID (via ViewEntity.Entity)
                expect(
                    () =>
                        ImpersonationPreRunViewHook(
                            {
                                ViewID: '99999999-9999-4999-8999-999999999991',
                                ViewEntity: { Entity: entityName } as unknown as RunViewParams['ViewEntity'],
                            },
                            target
                        ),
                    `RunViewByID failed to block ${entityName}`
                ).toThrow();

                // 4. Single-record load (CheckUserReadPermissions)
                expect(
                    () => resolverBase.CallCheckUserReadPermissions(entityName, userPayload, mockProvider),
                    `Single-record load CheckUserReadPermissions failed to block ${entityName}`
                ).toThrow();

                // 5. Dataset (custom dataset containing forbidden entity throws)
                const dsProvider = {
                    EntityByName: mockProvider.EntityByName,
                    GetDatasetByName: vi.fn().mockResolvedValue({
                        DatasetID: 'ds-custom',
                        DatasetName: 'Custom_Probe_Dataset',
                        Success: true,
                        Status: 'OK',
                        LatestUpdateDate: new Date(),
                        Results: [
                            {
                                Code: 'Item',
                                EntityName: entityName,
                                EntityID: 'e-1',
                                LatestUpdateDate: new Date(),
                                Results: [{ ID: 'secret-1' }],
                            },
                        ],
                    }),
                } as unknown as DatabaseProviderBase;
                await expect(
                    datasetResolver.GetDatasetByName('Custom_Probe_Dataset', {
                        providers: [{ type: 'Read-Only', provider: dsProvider } as ProviderInfo],
                        userPayload,
                    } as AppContext),
                    `Dataset failed to block ${entityName}`
                ).rejects.toThrow();

                // 6. SearchEntities
                const searchRes = await searchResolver.SearchEntities(
                    {
                        providers: [{ type: 'Read-Only', provider: mockProvider } as ProviderInfo],
                        dataSources: [],
                        dataSource: {} as AppContext['dataSource'],
                        userPayload,
                    },
                    [{ EntityName: entityName, SearchText: 'secret' }]
                );
                expect(searchRes.Success, `SearchEntities failed to block ${entityName}`).toBe(false);

                // 7. EntityRecordNameResolver
                const nameRes = await recordNameResolver.InnerGetEntityRecordName(
                    mockProvider,
                    entityName,
                    { KeyValuePairs: [{ FieldName: 'ID', Value: '11111111-1111-4111-8111-111111111111' }] },
                    userPayload
                );
                expect(nameRes.Success, `EntityRecordNameResolver failed to block ${entityName}`).toBe(false);
                expect(nameRes.RecordName).toBeUndefined();

                // 8. ExtraFilter SQL subquery referencing forbidden view
                expect(
                    () =>
                        resolverBase.CallScreenClientViewClauses(
                            `ID IN (SELECT ID FROM __mj.${baseView})`,
                            target,
                            mockProvider
                        ),
                    `ExtraFilter subquery failed to block ${entityName} (${baseView})`
                ).toThrow();
            }

            expect(mockProvider.SearchEntities).not.toHaveBeenCalled();
            expect(mockProvider.GetEntityRecordName).not.toHaveBeenCalled();

            // Fail-closed on unresolved empty-EntityName RunViewByID (no EntityName and no ViewEntity)
            expect(() =>
                ImpersonationPreRunViewHook({ ViewID: '99999999-9999-4999-8999-999999999992' }, target)
            ).toThrow();

            // Dynamic field-metadata secret check catches unknown custom entities carrying un-decryptable encrypted or secret-named fields
            const customSecretEntity = {
                Name: 'Custom: Vendor Config',
                Fields: [{ Name: 'WebhookSigningSecret', Encrypt: false, AllowDecryptInAPI: true }],
            } as unknown as EntityInfo;
            expect(IsEntityForbiddenDuringImpersonation('Custom: Vendor Config', target, customSecretEntity)).toBe(true);

            const customEncryptedEntity = {
                Name: 'Custom: Vault Entries',
                Fields: [{ Name: 'Payload', Encrypt: true, AllowDecryptInAPI: false }],
            } as unknown as EntityInfo;
            expect(IsEntityForbiddenDuringImpersonation('Custom: Vault Entries', target, customEncryptedEntity)).toBe(true);
        });
    });

    describe('11. Items 9 & 10 — Audit Hardening, Actor Attribution & Durable Background Work Refusal', () => {
        it('refuses isSystemUser callers, truncates oversized TargetUserID, and rate-limits Denied audit log writes', async () => {
            const { resolver, makeContext, savedRecords } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            // System user principal is refused
            const sysCan = await resolver.MJCanImpersonateUsers(makeContext(caller, { isSystemUser: true }));
            expect(sysCan.CanImpersonate).toBe(false);
            expect(sysCan.ResultCode).toBe('FORBIDDEN');

            // Oversized TargetUserID is truncated & >10 denials within 1 minute are rate-limited
            const unauthUser = makeUser({ id: OTHER_USER_ID, name: 'Cara', email: 'cara@example.com' });
            const hugeInput = 'X'.repeat(500);
            for (let i = 0; i < 15; i++) {
                await resolver.MJStartUserImpersonation({ TargetUserID: hugeInput }, makeContext(unauthUser));
            }
            const deniedAudits = savedRecords.filter((r) => r.entityName === 'MJ: Audit Logs');
            expect(deniedAudits.length).toBeLessThanOrEqual(10);
            const firstDetails = JSON.parse(String(deniedAudits[0]?.data['Details'] ?? '{}')) as Record<string, unknown>;
            expect(String(firstDetails['requestedTargetUserId'] ?? '').length).toBeLessThanOrEqual(128);
        });

        it('enriches ResolverBase.createAuditLogRecord with actor/target/apiKeyId/mode attribution during impersonation', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const session = StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ActAs',
                readOnly: false,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
                expiresAtMs: Date.now() + 60_000,
            });
            const userPayload: UserPayload = {
                email: target.Email,
                userRecord: target,
                sessionId: 'audit-attr',
                apiKeyId: MINTED_KEY_ID,
                impersonationSession: session,
            };

            const savedAuditFields: Record<string, unknown> = {};
            const mockAuditEntity = {
                NewRecord: vi.fn(),
                Save: vi.fn().mockImplementation(async () => true),
                set UserID(v: string) { savedAuditFields['UserID'] = v; },
                set AuditLogTypeID(v: string) { savedAuditFields['AuditLogTypeID'] = v; },
                set Status(v: string) { savedAuditFields['Status'] = v; },
                set Description(v: string) { savedAuditFields['Description'] = v; },
                set Details(v: string) { savedAuditFields['Details'] = v; },
                set EntityID(v: string) { savedAuditFields['EntityID'] = v; },
                set RecordID(v: string) { savedAuditFields['RecordID'] = v; },
            };
            const mockProvider = {
                AuditLogTypes: [{ ID: 'type-1', Name: 'Record Updated' }],
                GetEntityObject: vi.fn().mockResolvedValue(mockAuditEntity),
            } as unknown as DatabaseProviderBase;

            class AuditProbeResolver extends ResolverBase {
                public async RunAudit(): Promise<void> {
                    await this.createAuditLogRecord(
                        mockProvider,
                        userPayload,
                        null,
                        'Record Updated',
                        'Success',
                        JSON.stringify({ field: 'Name' }),
                        USERS_ENTITY_ID,
                        'rec-1'
                    );
                }
            }

            await new AuditProbeResolver().RunAudit();
            expect(String(savedAuditFields['Description'])).toContain(`ActorUserID=${ACTOR_USER_ID}`);
            const parsedDetails = JSON.parse(String(savedAuditFields['Details'])) as {
                field?: string;
                impersonation?: { actorUserId: string; targetUserId: string; apiKeyId: string; mode: string };
            };
            expect(parsedDetails.field).toBe('Name');
            expect(parsedDetails.impersonation).toEqual({
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
                apiKeyId: MINTED_KEY_ID,
                mode: 'ActAs',
            });
        });

        it('refuses writes/deletes to durable background-work entities even in ActAs mode', () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ActAs',
                readOnly: false,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
                expiresAtMs: Date.now() + 60_000,
            });

            for (const entityName of IMPERSONATION_WRITE_FORBIDDEN_ENTITY_NAMES) {
                expect(IsEntityWriteForbiddenDuringImpersonation(entityName, target)).toBe(true);
                const entityObj = { EntityInfo: { Name: entityName }, IsSaved: false } as unknown as BaseEntity;
                expect(typeof ImpersonationPreSaveHook(entityObj, target)).toBe('string');
                expect(typeof ImpersonationPreDeleteHook(entityObj, target)).toBe('string');
            }
        });
    });

    describe('12. Hardening #1–#7 — Saved Query Composition Fail-Closed, WS AST & Close, Missing MJAPI, Post-Mint Sweep', () => {
        it('fails closed on unknown saved queries and blocks composed queries touching forbidden entities via Dependencies or {{query:"..."}}', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const session = StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ViewAs',
                readOnly: true,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
            });
            const userPayload: UserPayload = {
                email: target.Email,
                userRecord: target,
                sessionId: 'q-1',
                apiKeyId: MINTED_KEY_ID,
                impersonationSession: session,
            };

            const childSecretQuery = {
                ID: 'qqqq0000-0000-4000-8000-000000000002',
                Name: 'ReadCreds',
                Category: 'Internal',
                CategoryPath: 'Internal',
                SQL: 'SELECT * FROM __mj.vwCredentials',
                Entities: [],
            };
            const parentComposedByDep = {
                ID: 'qqqq0000-0000-4000-8000-000000000001',
                Name: 'ParentViaDep',
                Category: 'Reports',
                CategoryPath: 'Reports',
                SQL: 'SELECT * FROM crm.vwAccounts',
                Entities: [{ Entity: 'Accounts' }],
            };
            const parentComposedByToken = {
                ID: 'qqqq0000-0000-4000-8000-000000000003',
                Name: 'ParentViaToken',
                Category: 'Reports',
                CategoryPath: 'Reports',
                SQL: 'SELECT * FROM {{query:"Internal/ReadCreds"}}',
                Entities: [],
            };
            const safeQuery = {
                ID: 'qqqq0000-0000-4000-8000-000000000004',
                Name: 'SafeAccounts',
                Category: 'Reports',
                CategoryPath: 'Reports',
                SQL: 'SELECT ID, Name FROM crm.vwAccounts',
                Entities: [{ Entity: 'Accounts' }],
            };

            vi.spyOn(QueryEngine.Instance, 'Queries', 'get').mockReturnValue(
                [parentComposedByDep, childSecretQuery, parentComposedByToken, safeQuery] as unknown as typeof QueryEngine.Instance.Queries
            );
            vi.spyOn(QueryEngine.Instance, 'Dependencies', 'get').mockReturnValue(
                [{ QueryID: parentComposedByDep.ID, DependsOnQueryID: childSecretQuery.ID }] as unknown as typeof QueryEngine.Instance.Dependencies
            );
            vi.spyOn(QueryEngine.Instance, 'QuerySQLs', 'get').mockReturnValue([]);
            vi.spyOn(QueryEngine.Instance, 'Config').mockResolvedValue(undefined);

            const md = {
                Entities: [{ Name: 'MJ: Credentials', BaseView: 'vwCredentials', BaseTable: 'Credential' }],
                Queries: [parentComposedByDep, childSecretQuery, parentComposedByToken, safeQuery],
            } as unknown as IMetadataProvider;

            const qr = new RunQueryResolver() as unknown as {
                assertSavedQueryAllowedForImpersonation: (
                    m: IMetadataProvider,
                    up: UserPayload,
                    ref: { QueryID?: string; QueryName?: string }
                ) => Promise<void>;
            };

            // 1. Unknown/unresolvable query FAILS CLOSED
            await expect(
                qr.assertSavedQueryAllowedForImpersonation(md, userPayload, { QueryID: 'qqqq0000-0000-4000-8000-999999999999' })
            ).rejects.toThrow();

            // 2. Composed query via QueryEngine.Dependencies -> blocked!
            await expect(
                qr.assertSavedQueryAllowedForImpersonation(md, userPayload, { QueryID: parentComposedByDep.ID })
            ).rejects.toThrow();

            // 3. Composed query via inline {{query:"Internal/ReadCreds"}} -> blocked!
            await expect(
                qr.assertSavedQueryAllowedForImpersonation(md, userPayload, { QueryID: parentComposedByToken.ID })
            ).rejects.toThrow();

            // 4. Safe query -> allowed
            await expect(
                qr.assertSavedQueryAllowedForImpersonation(md, userPayload, { QueryID: safeQuery.ID })
            ).resolves.toBeUndefined();
        });

        it('rejects WebSocket subscriptions with unresolvable operation AST and closes active sockets on MJEndUserImpersonation', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const session = StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ViewAs',
                readOnly: true,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
                expiresAtMs: Date.now() + 60_000,
            });
            const userPayload: UserPayload = {
                email: target.Email,
                userRecord: target,
                sessionId: 'ws-ast',
                apiKeyId: MINTED_KEY_ID,
                impersonationSession: session,
            };

            // Fragment-only / mismatched operationName -> fails closed!
            const badOpErrors = await ValidateImpersonationWebSocketSubscribe(
                userPayload,
                'query ActualOp { __typename }',
                'WrongOperationName'
            );
            expect(badOpErrors?.[0]?.extensions?.['code']).toBe('BAD_USER_INPUT');

            // Register a fake active WebSocket and verify MJEndUserImpersonation closes it with 4403
            const closeSpy = vi.fn();
            const unregister = RegisterImpersonationWebSocket(MINTED_KEY_ID, closeSpy);
            try {
                const { resolver, makeContext } = createHarness({
                    featureEnabled: true,
                    authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                });
                const caller = makeUser({
                    id: ACTOR_USER_ID,
                    name: 'Alice',
                    email: 'alice@example.com',
                    roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
                });
                const endRes = await resolver.MJEndUserImpersonation({ APIKeyID: MINTED_KEY_ID }, makeContext(caller));
                expect(endRes.Success).toBe(true);
                expect(closeSpy).toHaveBeenCalledTimes(1);
            } finally {
                unregister();
                CloseImpersonationWebSockets(MINTED_KEY_ID);
            }
        });

        it('refuses minting with CONFIGURATION_ERROR if active MJAPI application row is missing', async () => {
            const { resolver, makeContext, apiKeyEngine } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                applications: [], // MJAPI missing!
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const res = await resolver.MJStartUserImpersonation({ TargetUserID: TARGET_USER_ID }, makeContext(caller));
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('CONFIGURATION_ERROR');
            expect(apiKeyEngine.CreateAPIKey).not.toHaveBeenCalled();
        });

        it('performs post-mint sibling sweep to revoke concurrent actor impersonation keys', async () => {
            const concurrentSiblingKeyId = '66666666-6666-4666-8666-666666667777';
            let apiKeyQueryCount = 0;
            const { resolver, makeContext, apiKeyEngine } = createHarness({
                featureEnabled: true,
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                runViewHandler: (params) => {
                    if (params.EntityName === 'MJ: Users') {
                        return {
                            Success: true,
                            Results: [{ ID: TARGET_USER_ID, Name: 'Bob', Email: 'bob@example.com', Type: 'User', IsActive: true }],
                        } as RunViewResult<unknown>;
                    }
                    if (params.EntityName === 'MJ: User Roles') {
                        return {
                            Success: true,
                            Results: [{ UserID: TARGET_USER_ID, RoleID: ANALYST_ROLE_ID, Role: 'Analyst' }],
                        } as RunViewResult<unknown>;
                    }
                    if (params.EntityName === 'MJ: API Keys') {
                        apiKeyQueryCount++;
                        // Simulate a concurrent sibling key appearing on another replica right after CreateAPIKey!
                        if (apiKeyQueryCount >= 2) {
                            return {
                                Success: true,
                                Results: [
                                    {
                                        ID: MINTED_KEY_ID,
                                        Label: BuildImpersonationKeyLabel('ViewAs', ACTOR_USER_ID, TARGET_USER_ID),
                                        Status: 'Active',
                                        UserID: TARGET_USER_ID,
                                    },
                                    {
                                        ID: concurrentSiblingKeyId,
                                        Label: BuildImpersonationKeyLabel('ViewAs', ACTOR_USER_ID, OTHER_USER_ID),
                                        Status: 'Active',
                                        UserID: OTHER_USER_ID,
                                    },
                                ],
                            } as RunViewResult<unknown>;
                        }
                        return { Success: true, Results: [] } as RunViewResult<unknown>;
                    }
                    return { Success: true, Results: [] } as RunViewResult<unknown>;
                },
            });
            const caller = makeUser({
                id: ACTOR_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const res = await resolver.MJStartUserImpersonation({ TargetUserID: TARGET_USER_ID }, makeContext(caller));
            expect(res.Success).toBe(true);
            expect(apiKeyEngine.RevokeAPIKey).toHaveBeenCalledWith(
                concurrentSiblingKeyId,
                expect.anything(),
                expect.anything()
            );
            expect(apiKeyEngine.RevokeAPIKey).not.toHaveBeenCalledWith(
                MINTED_KEY_ID,
                expect.anything(),
                expect.anything()
            );
        });

        it('enforces ImpersonationSessionRefusalGuard and AssertNotImpersonationSession for both ViewAs and ActAs', async () => {
            RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
            const target = makeUser({ id: TARGET_USER_ID, name: 'Bob', email: 'bob@example.com' });
            const session = StampImpersonationSession(target, {
                apiKeyId: MINTED_KEY_ID,
                mode: 'ActAs',
                readOnly: false,
                actorUserId: ACTOR_USER_ID,
                targetUserId: TARGET_USER_ID,
            });
            const impPayload: UserPayload = {
                email: target.Email,
                userRecord: target,
                sessionId: 'g-1',
                apiKeyId: MINTED_KEY_ID,
                impersonationSession: session,
            };
            const normalUser = makeUser({ id: OTHER_USER_ID, name: 'Cara', email: 'cara@example.com' });
            const normalPayload: UserPayload = {
                email: normalUser.Email,
                userRecord: normalUser,
                sessionId: 'g-2',
            };

            expect(() => AssertNotImpersonationSession(impPayload, 'TestOp')).toThrow(/prohibited during user impersonation/i);
            expect(() => AssertNotImpersonationSession(normalPayload, 'TestOp')).not.toThrow();

            const guardInfo = {
                fieldName: 'IntegrationTestConnection',
                parentType: { name: 'Query' },
            } as Parameters<typeof ImpersonationSessionRefusalGuard>[0]['info'];

            const next = vi.fn().mockResolvedValue('ok');
            await expect(
                ImpersonationSessionRefusalGuard(
                    {
                        root: {},
                        args: {},
                        context: { userPayload: impPayload } as AppContext,
                        info: guardInfo,
                    },
                    next
                )
            ).rejects.toThrow(/prohibited during user impersonation/i);
            expect(next).not.toHaveBeenCalled();

            await expect(
                ImpersonationSessionRefusalGuard(
                    {
                        root: {},
                        args: {},
                        context: { userPayload: normalPayload } as AppContext,
                        info: guardInfo,
                    },
                    next
                )
            ).resolves.toBe('ok');
            expect(next).toHaveBeenCalledTimes(1);
        });
    });
});
