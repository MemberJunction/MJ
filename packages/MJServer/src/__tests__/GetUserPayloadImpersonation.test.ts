/**
 * Direct unit tests for `GetUserPayload` user-API-key impersonation stamping (PR #6958 Item 2).
 *
 * Verifies:
 * 1. Single-lookup path: when `ValidateAPIKey` returns `{ IsValid: true, User, APIKey }`,
 *    `GetUserPayload` stamps the impersonation session (and `UserInfo.ImpersonationContext`)
 *    without invoking the legacy fallback `ValidateKeyByHash`.
 * 2. Fail-closed fallback: when `ValidateAPIKey` omits `APIKey` and the fallback
 *    `ValidateKeyByHash` returns `{ Valid: false }`, `{ Valid: true, APIKey: undefined }`,
 *    or when `APIKeyHash` is missing, `GetUserPayload` THROWS `AuthenticationError` instead of
 *    silently admitting the request as an unstamped ordinary API key.
 * 3. Kill-switch fail-closed: an impersonation key is rejected with `AuthenticationError` when
 *    `MJ_ENABLE_USER_IMPERSONATION=false`.
 * 4. Ordinary non-impersonation API keys continue to authenticate cleanly with no impersonation
 *    session attached.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
    mockGetReadOnlyDS,
    mockGetReadWriteDS,
    mockGetAPIKeyEngine,
    mockGetSystemUser,
} = vi.hoisted(() => ({
    mockGetReadOnlyDS: vi.fn(),
    mockGetReadWriteDS: vi.fn(),
    mockGetAPIKeyEngine: vi.fn(),
    mockGetSystemUser: vi.fn(),
}));

vi.mock('../util.js', () => ({
    GetReadOnlyDataSource: mockGetReadOnlyDS,
    GetReadWriteDataSource: mockGetReadWriteDS,
}));

vi.mock('../auth/index.js', () => ({
    GetSigningKeys: vi.fn(),
    GetSystemUser: mockGetSystemUser,
    GetValidationOptions: vi.fn(),
    VerifyUserRecord: vi.fn(),
    ExtractUserInfoFromPayload: vi.fn(),
}));

vi.mock('../config.js', () => ({
    configInfo: {
        baseUrl: 'http://localhost',
        graphqlPort: 4001,
        graphqlRootPath: '/',
        databaseSettings: { metadataCacheRefreshInterval: 0 },
    },
    userEmailMap: {},
    apiKey: 'system-test-key',
    mj_core_schema: '__mj',
}));

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: mockGetAPIKeyEngine,
}));

import { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GetUserPayload } from '../context.js';
import { parse, getOperationAST } from 'graphql';
import {
    BuildImpersonationKeyLabel,
    EvaluateGraphQLOperationForImpersonation,
    GetImpersonationSession,
} from '../auth/impersonationGuard.js';
import { RegisterServerUserImpersonationConfig } from '../userImpersonationConfigUnits.js';
import type { DataSourceInfo } from '../types.js';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const KEY_ID = '66666666-6666-4666-8666-666666666666';

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

describe('GetUserPayload — User API Key Impersonation Single-Lookup & Fail-Closed Stamping', () => {
    const originalEnv = { ...process.env };
    const mockDataSources: DataSourceInfo[] = [];

    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.MJ_ENABLE_USER_IMPERSONATION;
        delete process.env.MJ_USER_IMPERSONATION_ALLOW_WRITES;
        RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: false });
        mockGetReadOnlyDS.mockReturnValue({});
        mockGetReadWriteDS.mockReturnValue({});
        mockGetSystemUser.mockReturnValue(
            makeUser({
                id: '00000000-0000-0000-0000-000000000001',
                name: 'System',
                email: 'system@example.com',
                type: 'System',
            })
        );
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        RegisterServerUserImpersonationConfig(null);
    });

    it('stamps impersonation session and ImpersonationContext in a single lookup when ValidateAPIKey returns APIKey', async () => {
        const target = makeUser({
            id: TARGET_USER_ID,
            name: 'Bob Analyst',
            email: 'bob@example.com',
            roles: [{ RoleID: 'role-analyst', Role: 'Analyst' }],
        });
        vi.spyOn(UserCache.Instance, 'UserByName').mockReturnValue(target);

        const expiresAt = new Date(Date.now() + 15 * 60_000);
        const validateKeyByHash = vi.fn();
        mockGetAPIKeyEngine.mockReturnValue({
            ValidateAPIKey: vi.fn().mockResolvedValue({
                IsValid: true,
                User: target,
                APIKeyId: KEY_ID,
                APIKeyHash: 'sha256-hash-1',
                APIKey: {
                    ID: KEY_ID,
                    Label: BuildImpersonationKeyLabel('ViewAs', ACTOR_USER_ID, TARGET_USER_ID),
                    ExpiresAt: expiresAt,
                },
            }),
            ValidateKeyByHash: validateKeyByHash,
            GetRowFilterBindingsForKey: vi.fn().mockReturnValue(undefined),
        });

        const payload = await GetUserPayload(
            '',
            'sess-1',
            mockDataSources,
            'http://localhost/',
            undefined,
            'mj_sk_valid_impersonation_key'
        );

        expect(validateKeyByHash).not.toHaveBeenCalled();
        expect(payload.impersonationSession).toBeDefined();
        expect(payload.impersonationSession?.mode).toBe('ViewAs');
        expect(payload.impersonationSession?.readOnly).toBe(true);
        expect(payload.impersonationSession?.actorUserId).toBe(ACTOR_USER_ID);
        expect(payload.impersonationSession?.targetUserId).toBe(TARGET_USER_ID);
        expect(GetImpersonationSession(payload.userRecord)?.apiKeyId).toBe(KEY_ID);
        expect(payload.userRecord?.ImpersonationContext).toEqual({
            ActorUserID: ACTOR_USER_ID,
            TargetUserID: TARGET_USER_ID,
            APIKeyID: KEY_ID,
            Mode: 'ViewAs',
        });
    });

    it('FAILS CLOSED (throws AuthenticationError) when ValidateAPIKey omits APIKey and fallback ValidateKeyByHash returns Valid: false', async () => {
        const target = makeUser({
            id: TARGET_USER_ID,
            name: 'Bob Analyst',
            email: 'bob@example.com',
            roles: [{ RoleID: 'role-analyst', Role: 'Analyst' }],
        });
        vi.spyOn(UserCache.Instance, 'UserByName').mockReturnValue(target);

        mockGetAPIKeyEngine.mockReturnValue({
            ValidateAPIKey: vi.fn().mockResolvedValue({
                IsValid: true,
                User: target,
                APIKeyId: KEY_ID,
                APIKeyHash: 'sha256-hash-race',
                // Deliberately omit APIKey to exercise fallback lookup
            }),
            ValidateKeyByHash: vi.fn().mockResolvedValue({
                Valid: false,
                Error: 'API key not found',
            }),
        });

        await expect(
            GetUserPayload(
                '',
                'sess-2',
                mockDataSources,
                'http://localhost/',
                undefined,
                'mj_sk_revoked_mid_race'
            )
        ).rejects.toThrow(/Unable to authenticate user|Invalid API key/);
    });

    it('FAILS CLOSED (throws AuthenticationError) when ValidateAPIKey omits APIKey and fallback ValidateKeyByHash returns Valid: true without APIKey', async () => {
        const target = makeUser({
            id: TARGET_USER_ID,
            name: 'Bob Analyst',
            email: 'bob@example.com',
            roles: [{ RoleID: 'role-analyst', Role: 'Analyst' }],
        });
        vi.spyOn(UserCache.Instance, 'UserByName').mockReturnValue(target);

        mockGetAPIKeyEngine.mockReturnValue({
            ValidateAPIKey: vi.fn().mockResolvedValue({
                IsValid: true,
                User: target,
                APIKeyId: KEY_ID,
                APIKeyHash: 'sha256-hash-empty',
            }),
            ValidateKeyByHash: vi.fn().mockResolvedValue({
                Valid: true,
                APIKey: undefined,
            }),
        });

        await expect(
            GetUserPayload(
                '',
                'sess-3',
                mockDataSources,
                'http://localhost/',
                undefined,
                'mj_sk_missing_entity'
            )
        ).rejects.toThrow(/Unable to authenticate user|Invalid API key/);
    });

    it('FAILS CLOSED (throws AuthenticationError) when ValidateAPIKey omits both APIKey and APIKeyHash', async () => {
        const target = makeUser({
            id: TARGET_USER_ID,
            name: 'Bob Analyst',
            email: 'bob@example.com',
            roles: [{ RoleID: 'role-analyst', Role: 'Analyst' }],
        });
        vi.spyOn(UserCache.Instance, 'UserByName').mockReturnValue(target);

        mockGetAPIKeyEngine.mockReturnValue({
            ValidateAPIKey: vi.fn().mockResolvedValue({
                IsValid: true,
                User: target,
                APIKeyId: KEY_ID,
            }),
            ValidateKeyByHash: vi.fn(),
        });

        await expect(
            GetUserPayload(
                '',
                'sess-4',
                mockDataSources,
                'http://localhost/',
                undefined,
                'mj_sk_missing_hash'
            )
        ).rejects.toThrow(/Unable to authenticate user|Invalid API key/);
    });

    it('stamps impersonationSession even when kill switch MJ_ENABLE_USER_IMPERSONATION=false so GraphQL guard blocks all queries with FEATURE_DISABLED while allowing standalone MJEndUserImpersonation', async () => {
        process.env.MJ_ENABLE_USER_IMPERSONATION = 'false';
        const target = makeUser({
            id: TARGET_USER_ID,
            name: 'Bob Analyst',
            email: 'bob@example.com',
            roles: [{ RoleID: 'role-analyst', Role: 'Analyst' }],
        });
        vi.spyOn(UserCache.Instance, 'UserByName').mockReturnValue(target);

        mockGetAPIKeyEngine.mockReturnValue({
            ValidateAPIKey: vi.fn().mockResolvedValue({
                IsValid: true,
                User: target,
                APIKeyId: KEY_ID,
                APIKeyHash: 'sha256-hash-disabled',
                APIKey: {
                    ID: KEY_ID,
                    Label: BuildImpersonationKeyLabel('ViewAs', ACTOR_USER_ID, TARGET_USER_ID),
                    ExpiresAt: new Date(Date.now() + 60_000),
                },
            }),
            GetRowFilterBindingsForKey: vi.fn().mockReturnValue(undefined),
        });

        const payload = await GetUserPayload(
            '',
            'sess-5',
            mockDataSources,
            'http://localhost/',
            undefined,
            'mj_sk_kill_switch_off'
        );
        expect(payload.impersonationSession).toBeDefined();
        const queryOp = getOperationAST(parse('query { __typename }'));
        expect(EvaluateGraphQLOperationForImpersonation(queryOp, payload)?.extensions?.['code']).toBe(
            'FEATURE_DISABLED'
        );
        const endOp = getOperationAST(
            parse('mutation { MJEndUserImpersonation(input: { APIKeyID: "x" }) { Success } }')
        );
        expect(EvaluateGraphQLOperationForImpersonation(endOp, payload)).toBeNull();
    });

    it('passes ordinary non-impersonation user API keys cleanly with no impersonation session', async () => {
        const user = makeUser({
            id: TARGET_USER_ID,
            name: 'Bob Analyst',
            email: 'bob@example.com',
            roles: [{ RoleID: 'role-analyst', Role: 'Analyst' }],
        });
        vi.spyOn(UserCache.Instance, 'UserByName').mockReturnValue(user);

        mockGetAPIKeyEngine.mockReturnValue({
            ValidateAPIKey: vi.fn().mockResolvedValue({
                IsValid: true,
                User: user,
                APIKeyId: KEY_ID,
                APIKeyHash: 'sha256-hash-ordinary',
                APIKey: {
                    ID: KEY_ID,
                    Label: 'CI Automation Key',
                    ExpiresAt: null,
                },
            }),
            GetRowFilterBindingsForKey: vi.fn().mockReturnValue(undefined),
        });

        const payload = await GetUserPayload(
            '',
            'sess-6',
            mockDataSources,
            'http://localhost/',
            undefined,
            'mj_sk_ordinary_key'
        );

        expect(payload.impersonationSession).toBeUndefined();
        expect(payload.userRecord?.ImpersonationContext).toBeUndefined();
        expect(payload.apiKeyId).toBe(KEY_ID);
    });
});
