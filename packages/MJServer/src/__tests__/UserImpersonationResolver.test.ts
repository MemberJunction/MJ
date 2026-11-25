import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIKeyEngine } from '@memberjunction/api-keys';
import {
    AuthorizationInfo,
    AuthorizationRoleInfo,
    RunView,
    UserInfo,
    WellKnownUserSource,
    type DatabaseProviderBase,
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
} from '@memberjunction/core';
import type { AppContext, ProviderInfo } from '../types.js';
import {
    EvaluateUserImpersonationAuthorization,
    USER_IMPERSONATION_AUDIT_LOG_TYPES,
    USER_IMPERSONATION_AUTHORIZATION_NAME,
    USER_IMPERSONATION_KEY_LABEL_PREFIX,
    UserImpersonationResolver,
} from '../resolvers/UserImpersonationResolver.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const OWNER_USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const INACTIVE_USER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';

const ADMIN_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000001';
const IMPERSONATOR_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000002';
const DENY_ROLE_ID = 'aaaa0000-0000-4000-8000-000000000003';

const AUTH_ID = '062370F4-DAEC-4E5E-BD0A-4AF2A28968EE';
const PARENT_AUTH_ID = '062370F4-DAEC-4E5E-BD0A-4AF2A28968FF';
const AUDIT_TYPE_STARTED_ID = 'AB46EB0B-2286-4D6B-A9A7-FED4AF90E262';
const AUDIT_TYPE_ENDED_ID = '2B43CE9C-58D7-4F65-9DDC-59A59C4EAD93';
const AUDIT_TYPE_DENIED_ID = '1648EFFA-D31A-4E35-A985-C7B56EEB95D8';
const USERS_ENTITY_ID = 'eeee0000-0000-4000-8000-000000000001';
const AUDIT_ENTITY_ID = 'eeee0000-0000-4000-8000-000000000002';
const FULL_ACCESS_SCOPE_ID = '55555555-5555-4555-8555-555555555555';
const MINTED_KEY_ID = '66666666-6666-4666-8666-666666666666';
const REGULAR_KEY_ID = '77777777-7777-4777-8777-777777777777';
const SCOPE_ROW_ID = '88888888-8888-4888-8888-888888888888';

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
    roles?: Array<{ RoleID: string; Role: string }>;
}): UserInfo {
    return new UserInfo(null, {
        ID: opts.id,
        Name: opts.name,
        Email: opts.email,
        Type: opts.type ?? 'User',
        IsActive: true,
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

function makeGrant(
    type: 'Allow' | 'Deny',
    roleId: string,
    authorizationId: string = AUTH_ID
): AuthorizationRoleInfo {
    return new AuthorizationRoleInfo({
        ID: `grant-${type}-${roleId}`,
        AuthorizationID: authorizationId,
        RoleID: roleId,
        Type: type,
    });
}

interface HarnessOptions {
    authorizations?: AuthorizationInfo[];
    authorizationRoles?: AuthorizationRoleInfo[];
    runViewHandler?: (params: RunViewParams) => RunViewResult<unknown>;
    scopeSaveResult?: boolean;
    createKeyResult?: { Success: boolean; RawKey?: string; APIKeyId?: string; Error?: string };
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
        Scopes: [{ ID: FULL_ACCESS_SCOPE_ID, FullPath: 'full_access' }],
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
            ID: OWNER_USER_ID,
            Name: 'Alice Owner',
            FirstName: 'Alice',
            LastName: 'Owner',
            Email: 'alice@example.com',
            Title: 'Platform Owner',
            Type: 'Owner',
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
            Name: 'Cara Support',
            FirstName: 'Cara',
            LastName: 'Support',
            Email: 'cara@example.com',
            Title: 'Support Engineer',
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
        { UserID: TARGET_USER_ID, Role: 'Analyst' },
        { UserID: OTHER_USER_ID, Role: 'Support' },
        { UserID: OWNER_USER_ID, Role: 'Administrator' },
    ];

    const defaultApiKeys = [
        {
            ID: MINTED_KEY_ID,
            Label: `${USER_IMPERSONATION_KEY_LABEL_PREFIX}alice@example.com->bob@example.com`,
            Status: 'Active',
            UserID: TARGET_USER_ID,
        },
        {
            ID: REGULAR_KEY_ID,
            Label: 'CI Integration Key',
            Status: 'Active',
            UserID: OWNER_USER_ID,
        },
    ];

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
        if (params.EntityName === 'MJ: API Keys') {
            const filter = params.ExtraFilter ?? '';
            const idMatch = filter.match(/ID\s*=\s*'([^']+)'/i);
            const rows = idMatch
                ? defaultApiKeys.filter((k) => k.ID.toLowerCase() === idMatch[1].toLowerCase())
                : defaultApiKeys;
            return { Success: true, Results: rows } as RunViewResult<unknown>;
        }
        if (params.EntityName === 'MJ: API Key Scopes') {
            return {
                Success: true,
                Results: [{ ID: SCOPE_ROW_ID }],
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
                const snapshot: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(entity)) {
                    if (typeof v !== 'function') {
                        snapshot[k] = v;
                    }
                }
                savedRecords.push({ entityName, data: snapshot });
                if (entityName === 'MJ: API Key Scopes' && opts.scopeSaveResult === false) {
                    return false;
                }
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
        Authorizations: opts.authorizations ?? [makeAuth()],
        AuthorizationRoles: opts.authorizationRoles ?? [],
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

    const makeContext = (actorUser: UserInfo | null, apiKeyId?: string): AppContext => ({
        dataSource: {} as AppContext['dataSource'],
        dataSources: [],
        providers: [{ type: 'Read-Write', provider } as ProviderInfo],
        userPayload: actorUser
            ? {
                  email: actorUser.Email,
                  userRecord: actorUser,
                  sessionId: 'sess-1',
                  ...(apiKeyId ? { apiKeyId } : {}),
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
    };
}

describe('UserImpersonationResolver', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('Default-deny authorization gating (nobody has access by default)', () => {
        it('denies even an Owner/Administrator/Developer when User Impersonation has ZERO AuthorizationRoles', async () => {
            const { resolver, makeContext } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [],
            });
            const ownerAdmin = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                type: 'Owner',
                roles: [{ RoleID: ADMIN_ROLE_ID, Role: 'Administrator' }],
            });

            const canRes = await resolver.MJCanImpersonateUsers(makeContext(ownerAdmin));
            expect(canRes.CanImpersonate).toBe(false);
            expect(canRes.AuthorizationName).toBe(USER_IMPERSONATION_AUTHORIZATION_NAME);
            expect(canRes.ResultCode).toBe('FORBIDDEN');

            const listRes = await resolver.MJListImpersonatableUsers(undefined, makeContext(ownerAdmin));
            expect(listRes.Authorized).toBe(false);
            expect(listRes.Users).toEqual([]);

            const startRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                makeContext(ownerAdmin)
            );
            expect(startRes.Success).toBe(false);
            expect(startRes.ResultCode).toBe('FORBIDDEN');
        });

        it('allows a caller whose role holds an explicit Allow grant on User Impersonation', async () => {
            const { resolver, makeContext } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const authorizedUser = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Support Lead',
                email: 'alice@example.com',
                type: 'User',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Support Impersonator' }],
            });

            const canRes = await resolver.MJCanImpersonateUsers(makeContext(authorizedUser));
            expect(canRes.CanImpersonate).toBe(true);
            expect(canRes.ResultCode).toBe('OK');
        });

        it('enforces Deny precedence over Allow when the caller holds both roles', () => {
            const auth = makeAuth();
            const user = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [
                    { RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' },
                    { RoleID: DENY_ROLE_ID, Role: 'Restricted' },
                ],
            });
            const result = EvaluateUserImpersonationAuthorization(user, {
                Authorizations: [auth],
                AuthorizationRoles: [
                    makeGrant('Allow', IMPERSONATOR_ROLE_ID),
                    makeGrant('Deny', DENY_ROLE_ID),
                ],
            });
            expect(result.Allowed).toBe(false);
        });

        it('denies when the User Impersonation authorization is inactive or missing', () => {
            const user = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });
            expect(
                EvaluateUserImpersonationAuthorization(user, {
                    Authorizations: [makeAuth({ IsActive: false })],
                    AuthorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                }).Allowed
            ).toBe(false);
            expect(
                EvaluateUserImpersonationAuthorization(user, {
                    Authorizations: [],
                    AuthorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                }).Allowed
            ).toBe(false);
        });

        it('supports ancestor authorization grant while still honoring explicit Deny on leaf', () => {
            const parentAuth = makeAuth({ ID: PARENT_AUTH_ID, Name: 'Security Operations', ParentID: null });
            const leafAuth = makeAuth({ ParentID: PARENT_AUTH_ID });
            const user = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'SecOps' }],
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
                        makeGrant('Deny', IMPERSONATOR_ROLE_ID, AUTH_ID),
                    ],
                }).Allowed
            ).toBe(false);
        });
    });

    describe('Anti-chaining protection', () => {
        it('rejects MJCanImpersonateUsers, MJListImpersonatableUsers, and MJStartUserImpersonation when authenticated via an MJ-Impersonation API key', async () => {
            const { resolver, makeContext, savedRecords } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const callerWithRole = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });

            const canRes = await resolver.MJCanImpersonateUsers(makeContext(callerWithRole, MINTED_KEY_ID));
            expect(canRes.CanImpersonate).toBe(false);
            expect(canRes.ResultCode).toBe('FORBIDDEN_IMPERSONATION_CHAIN');

            const listRes = await resolver.MJListImpersonatableUsers(
                undefined,
                makeContext(callerWithRole, MINTED_KEY_ID)
            );
            expect(listRes.Authorized).toBe(false);
            expect(listRes.ResultCode).toBe('FORBIDDEN_IMPERSONATION_CHAIN');

            const startRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: OTHER_USER_ID },
                makeContext(callerWithRole, MINTED_KEY_ID)
            );
            expect(startRes.Success).toBe(false);
            expect(startRes.ResultCode).toBe('FORBIDDEN_IMPERSONATION_CHAIN');
            expect(savedRecords.some((r) => r.entityName === 'MJ: Audit Logs' && r.data['AuditLogTypeID'] === AUDIT_TYPE_DENIED_ID)).toBe(true);
        });
    });

    describe('Listing and search filtering', () => {
        it('excludes System, inactive users, and the caller themselves, and filters by Search and Limit', async () => {
            const { resolver, makeContext } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });

            const allRes = await resolver.MJListImpersonatableUsers(undefined, makeContext(caller));
            expect(allRes.Authorized).toBe(true);
            expect(allRes.TotalCount).toBe(2);
            expect(allRes.Users.map((u) => u.UserID)).toEqual([TARGET_USER_ID, OTHER_USER_ID]);
            expect(allRes.Users[0].RoleNames).toEqual(['Analyst']);

            const searchRes = await resolver.MJListImpersonatableUsers(
                { Search: 'support' },
                makeContext(caller)
            );
            expect(searchRes.TotalCount).toBe(1);
            expect(searchRes.Users[0].UserID).toBe(OTHER_USER_ID);

            const limitedRes = await resolver.MJListImpersonatableUsers(
                { Limit: 1 },
                makeContext(caller)
            );
            expect(limitedRes.TotalCount).toBe(2);
            expect(limitedRes.Users).toHaveLength(1);
        });
    });

    describe('Starting impersonation & safety guards', () => {
        it('mints a short-lived scoped API key, clamps TTL to 4h max, attaches full_access scope, and writes audit log', async () => {
            const { resolver, makeContext, apiKeyEngine, savedRecords } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });

            const before = Date.now();
            const res = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID, TTLMinutes: 999 },
                makeContext(caller)
            );
            expect(res.Success).toBe(true);
            expect(res.ResultCode).toBe('IMPERSONATION_STARTED');
            expect(res.RawApiKey).toBe('mj_sk_temp_impersonation_secret');
            expect(res.APIKeyID).toBe(MINTED_KEY_ID);
            expect(res.TargetUser?.Email).toBe('bob@example.com');
            expect(res.TargetUser?.RoleNames).toEqual(['Analyst']);

            // Verify TTL was clamped to 240 minutes (4 hours)
            const expiresMs = Date.parse(res.ExpiresAt!);
            expect(expiresMs - before).toBeLessThanOrEqual(240 * 60 * 1000 + 5000);
            expect(expiresMs - before).toBeGreaterThanOrEqual(239 * 60 * 1000);

            expect(apiKeyEngine.CreateAPIKey).toHaveBeenCalledWith(
                expect.objectContaining({
                    UserId: TARGET_USER_ID,
                    Label: `${USER_IMPERSONATION_KEY_LABEL_PREFIX}alice@example.com->bob@example.com`,
                }),
                expect.anything(),
                expect.anything()
            );

            const scopeRecord = savedRecords.find((r) => r.entityName === 'MJ: API Key Scopes');
            expect(scopeRecord?.data['APIKeyID']).toBe(MINTED_KEY_ID);
            expect(scopeRecord?.data['ScopeID']).toBe(FULL_ACCESS_SCOPE_ID);

            const auditRecord = savedRecords.find((r) => r.entityName === 'MJ: Audit Logs');
            expect(auditRecord?.data['AuditLogTypeID']).toBe(AUDIT_TYPE_STARTED_ID);
            expect(auditRecord?.data['UserID']).toBe(OWNER_USER_ID);
            expect(auditRecord?.data['RecordID']).toBe(TARGET_USER_ID);
        });

        it('refuses impersonating System, inactive users, or oneself', async () => {
            const { resolver, makeContext } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });

            const sysRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: SYSTEM_USER_ID },
                makeContext(caller)
            );
            expect(sysRes.Success).toBe(false);
            expect(sysRes.ResultCode).toBe('FORBIDDEN_TARGET');

            const inactiveRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: INACTIVE_USER_ID },
                makeContext(caller)
            );
            expect(inactiveRes.Success).toBe(false);
            expect(inactiveRes.ResultCode).toBe('NOT_FOUND');

            const selfRes = await resolver.MJStartUserImpersonation(
                { TargetUserID: OWNER_USER_ID },
                makeContext(caller)
            );
            expect(selfRes.Success).toBe(false);
            expect(selfRes.ResultCode).toBe('FORBIDDEN_TARGET');
        });

        it('cleans up orphaned API key if scope attachment fails', async () => {
            const { resolver, makeContext, apiKeyEngine } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
                scopeSaveResult: false,
            });
            const caller = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });

            const res = await resolver.MJStartUserImpersonation(
                { TargetUserID: TARGET_USER_ID },
                makeContext(caller)
            );
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('KEY_SCOPE_FAILED');
            expect(apiKeyEngine.RevokeAPIKey).toHaveBeenCalledWith(
                MINTED_KEY_ID,
                expect.anything(),
                expect.anything()
            );
        });
    });

    describe('Ending impersonation & key revocation', () => {
        it('deletes scopes, revokes and deletes the impersonation key, and logs User Impersonation Ended', async () => {
            const { resolver, makeContext, apiKeyEngine, deletedRecords, savedRecords } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });

            const res = await resolver.MJEndUserImpersonation(
                { APIKeyID: MINTED_KEY_ID },
                makeContext(caller)
            );
            expect(res.Success).toBe(true);
            expect(res.ResultCode).toBe('IMPERSONATION_ENDED');
            expect(apiKeyEngine.RevokeAPIKey).toHaveBeenCalledWith(
                MINTED_KEY_ID,
                expect.anything(),
                expect.anything()
            );
            expect(deletedRecords).toContainEqual({ entityName: 'MJ: API Key Scopes', id: SCOPE_ROW_ID });
            expect(deletedRecords).toContainEqual({ entityName: 'MJ: API Keys', id: MINTED_KEY_ID });
            const auditRecord = savedRecords.find((r) => r.entityName === 'MJ: Audit Logs');
            expect(auditRecord?.data['AuditLogTypeID']).toBe(AUDIT_TYPE_ENDED_ID);
        });

        it('refuses revoking a non-impersonation API key', async () => {
            const { resolver, makeContext, apiKeyEngine } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [makeGrant('Allow', IMPERSONATOR_ROLE_ID)],
            });
            const caller = makeUser({
                id: OWNER_USER_ID,
                name: 'Alice Owner',
                email: 'alice@example.com',
                roles: [{ RoleID: IMPERSONATOR_ROLE_ID, Role: 'Impersonator' }],
            });

            const res = await resolver.MJEndUserImpersonation(
                { APIKeyID: REGULAR_KEY_ID },
                makeContext(caller)
            );
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('FORBIDDEN');
            expect(apiKeyEngine.RevokeAPIKey).not.toHaveBeenCalled();
        });

        it('allows an impersonated session to revoke its OWN temporary key, but refuses unauthorized callers', async () => {
            const { resolver, makeContext } = createHarness({
                authorizations: [makeAuth()],
                authorizationRoles: [],
            });
            const targetUser = makeUser({
                id: TARGET_USER_ID,
                name: 'Bob Analyst',
                email: 'bob@example.com',
                roles: [],
            });

            // Unauthorized caller without matching key is denied
            const deniedRes = await resolver.MJEndUserImpersonation(
                { APIKeyID: MINTED_KEY_ID },
                makeContext(targetUser)
            );
            expect(deniedRes.Success).toBe(false);
            expect(deniedRes.ResultCode).toBe('FORBIDDEN');

            // Same impersonation key can revoke itself
            const selfRevokeRes = await resolver.MJEndUserImpersonation(
                { APIKeyID: MINTED_KEY_ID },
                makeContext(targetUser, MINTED_KEY_ID)
            );
            expect(selfRevokeRes.Success).toBe(true);
            expect(selfRevokeRes.ResultCode).toBe('IMPERSONATION_ENDED');
        });
    });
});
