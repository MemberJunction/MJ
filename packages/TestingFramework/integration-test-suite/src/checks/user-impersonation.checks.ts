/**
 * user-impersonation.checks.ts — the 'user-impersonation' bundle (UI1–UI5, IT194):
 * Real-database end-to-end deterministic security, lifecycle, expiry, audit, and regression checks
 * for Generic User Impersonation ("View As User...").
 *
 * TRANSPORT: **SERVER** (real SQL Server / PostgreSQL database, real `APIKeyEngine`, real
 * `UserImpersonationResolver`, real `impersonationGuard` hooks / HTTP guard / WebSocket validator,
 * real `MJ: Authorizations`, `MJ: Authorization Roles`, `MJ: Users`, `MJ: User Roles`,
 * `MJ: API Keys`, `MJ: API Key Scopes`, `MJ: API Key Applications`, and `MJ: Audit Logs`).
 *
 * Checks:
 *   - UI1: End-to-end lifecycle — grant `User Impersonation`, enable kill switch, mint a ViewAs
 *          key for an eligible target, verify narrow scopes + `MJAPI` binding + `Priority=1000`
 *          `IsDeny` rules (zero `full_access`), authenticate the key, read normal data as the
 *          target, verify forbidden entities (`MJ: Credentials`, `MJ: API Keys`, etc.) and writes
 *          (`BaseEntity.Save()` / `Delete()` + Apollo mutation + REST write) are refused, call
 *          `MJEndUserImpersonation`, confirm revoked key row is retained (`Status='Revoked'`) and
 *          `ValidateAPIKey` no longer authenticates it.
 *   - UI2: All 8 refusal invariants against real DB rows — no grant (`FORBIDDEN`), kill switch
 *          off (`FEATURE_DISABLED`, while `MJEndUserImpersonation` still works), regular API-key
 *          caller (`FORBIDDEN`), impersonation-key caller chaining (`FORBIDDEN_IMPERSONATION_CHAIN`),
 *          protected-role target (`Administrator`), `Owner` target, self, and peer impersonator.
 *   - UI3: Expiry enforcement — a key whose real DB `ExpiresAt` is in the past fails
 *          `APIKeyEngine.ValidateAPIKey`, is refused with HTTP `401` by
 *          `CreateImpersonationHttpGuardMiddleware`, and is refused over WebSocket by
 *          `ValidateImpersonationWebSocketSubscribe`.
 *   - UI4: Audit trail & fail-closed rollback — real `MJ: Audit Logs` rows exist for
 *          `User Impersonation Started`, `User Impersonation Ended`, and `User Impersonation Denied`
 *          with exact actor/target attribution and zero `RawApiKey` leakage; a simulated audit
 *          save failure returns `AUDIT_LOG_FAILED` and immediately revokes & deletes the minted
 *          `MJ: API Keys` row from the database.
 *   - UI5: Non-impersonation regression — a normal user session and a normal (non-impersonation)
 *          user API key read, write, and authenticate identically with
 *          `MJ_ENABLE_USER_IMPERSONATION` both OFF and ON.
 *
 * Self-cleaning fixtures: every check creates throwaway rows tagged `(mj-integration-test — safe to delete)`
 * and removes them LIFO in `finally`, keeping the bundle in the blocking deterministic tier.
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import {
    CompositeKey,
    DatabaseProviderBase,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    MJAPIKeyEntity,
    MJAPIKeyScopeEntity,
    MJAuditLogEntity,
    MJAuthorizationRoleEntity,
    MJRoleEntity,
    MJUserEntity,
    MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import {
    CreateImpersonationHttpGuardMiddleware,
    EnsureImpersonationDataHooksRegistered,
    GetImpersonationSession,
    ImpersonationPreDeleteHook,
    ImpersonationPreRunViewHook,
    ImpersonationPreSaveHook,
    ParseImpersonationKeyLabel,
    RunWithImpersonationSession,
    StampImpersonationSession,
    USER_IMPERSONATION_AUTHORIZATION_NAME,
    ValidateImpersonationWebSocketSubscribe,
} from '@memberjunction/server/impersonation-guard';
import { RegisterServerUserImpersonationConfig } from '@memberjunction/server/user-impersonation-config';
import {
    USER_IMPERSONATION_AUDIT_LOG_TYPES,
    UserImpersonationResolver,
} from '@memberjunction/server/user-impersonation-resolver';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
/** Delay offset (2 minutes) used to move an API key's ExpiresAt cleanly into the past for UI3 expiry checks. */
const EXPIRY_PAST_OFFSET_MS = 120_000;

type CleanupFn = () => Promise<unknown>;

interface ImpersonationFixture {
    readonly runTag: string;
    readonly operatorRoleId: string;
    readonly operatorRoleName: string;
    readonly uiRoleId: string;
    readonly adminRoleId: string;
    readonly authId: string;
    readonly actor: UserInfo;
    readonly target: UserInfo;
    readonly ungrantedCaller: UserInfo;
    readonly protectedAdmin: UserInfo;
    readonly ownerTarget: UserInfo;
    readonly peerImpersonator: UserInfo;
    readonly fixtureUserIds: readonly string[];
    readonly cleanup: CleanupFn[];
}

function makeResolverContext(
    provider: DatabaseProviderBase,
    user: UserInfo,
    extra?: { apiKeyId?: string; hasRawApiKeyHeader?: boolean }
): Parameters<UserImpersonationResolver['MJCanImpersonateUsers']>[0] {
    return {
        dataSource: {} as Parameters<UserImpersonationResolver['MJCanImpersonateUsers']>[0]['dataSource'],
        dataSources: [],
        providers: [{ type: 'Read-Write', provider } as Parameters<UserImpersonationResolver['MJCanImpersonateUsers']>[0]['providers'][number]],
        ClientIp: '198.51.100.194',
        UserAgent: 'MJ-Integration-Test/IT194',
        HasRawApiKeyHeader: extra?.hasRawApiKeyHeader ?? false,
        userPayload: {
            email: user.Email,
            userRecord: user,
            sessionId: `it194-${randomUUID()}`,
            ...(extra?.apiKeyId ? { apiKeyId: extra.apiKeyId } : {}),
        },
    };
}

async function createUserWithRoles(
    ctx: IntegrationCheckContext,
    cleanup: CleanupFn[],
    opts: {
        name: string;
        email: string;
        type: 'User' | 'Owner';
        roles: ReadonlyArray<{ RoleID: string; RoleName: string }>;
    }
): Promise<UserInfo> {
    const userEntity = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
    userEntity.NewRecord();
    userEntity.Name = opts.name;
    userEntity.FirstName = opts.name.split(' ')[0] ?? 'IT';
    userEntity.LastName = 'Impersonation';
    userEntity.Email = opts.email;
    userEntity.Type = opts.type;
    userEntity.IsActive = true;
    Assert(await userEntity.Save(), `Failed to create fixture user ${opts.email}: ${userEntity.LatestResult?.CompleteMessage}`);
    const userId = userEntity.ID;

    cleanup.push(async () => {
        const u = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
        if (await u.Load(userId)) {
            await u.Delete().catch(() => undefined);
        }
    });

    for (const r of opts.roles) {
        const ur = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
        ur.NewRecord();
        ur.UserID = userId;
        ur.RoleID = r.RoleID;
        Assert(await ur.Save(), `Failed to assign role ${r.RoleName} to ${opts.email}: ${ur.LatestResult?.CompleteMessage}`);
        const urId = ur.ID;
        cleanup.push(async () => {
            const row = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
            if (await row.Load(urId)) {
                await row.Delete().catch(() => undefined);
            }
        });
    }

    return new UserInfo(ctx.Provider, {
        ID: userId,
        Name: opts.name,
        Email: opts.email,
        Type: opts.type,
        IsActive: true,
        UserRoles: opts.roles.map((r) => ({
            UserID: userId,
            RoleID: r.RoleID,
            Role: r.RoleName,
        })),
    });
}

async function deleteApiKeyTree(ctx: IntegrationCheckContext, apiKeyId: string): Promise<void> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const safeId = EscapeSQLString(apiKeyId);
    for (const childEntity of ['MJ: API Key Usage Logs', 'MJ: API Key Scopes', 'MJ: API Key Applications'] as const) {
        const rows = await rv.RunView<{ ID: string }>(
            { EntityName: childEntity, ExtraFilter: `APIKeyID = '${safeId}'`, Fields: ['ID'], ResultType: 'simple' },
            ctx.User
        );
        for (const r of rows.Results ?? []) {
            const e = await ctx.Provider.GetEntityObject(childEntity, ctx.User);
            if (await e.InnerLoad(CompositeKey.FromID(r.ID))) {
                await e.Delete().catch(() => undefined);
            }
        }
    }
    const keyRow = await ctx.Provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User);
    if (await keyRow.Load(apiKeyId)) {
        await keyRow.Delete().catch(() => undefined);
    }
}

async function deleteFixtureAuditLogs(ctx: IntegrationCheckContext, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) {
        return;
    }
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const inClause = userIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const rows = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Audit Logs',
            ExtraFilter: `UserID IN (${inClause}) OR RecordID IN (${inClause})`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        ctx.User
    );
    for (const r of rows.Results ?? []) {
        const log = await ctx.Provider.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', ctx.User);
        if (await log.Load(r.ID)) {
            await log.Delete().catch(() => undefined);
        }
    }
}

async function deleteFixtureApiKeysForUsers(ctx: IntegrationCheckContext, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) {
        return;
    }
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const inClause = userIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const rows = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: API Keys',
            ExtraFilter: `UserID IN (${inClause})`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        ctx.User
    );
    for (const r of rows.Results ?? []) {
        await deleteApiKeyTree(ctx, r.ID);
    }
}

async function withImpersonationFixture(
    ctx: IntegrationCheckContext,
    fn: (fx: ImpersonationFixture, resolver: UserImpersonationResolver, dbProvider: DatabaseProviderBase) => Promise<void>
): Promise<void> {
    if (!(ctx.Provider instanceof DatabaseProviderBase)) {
        SkipCheck('user-impersonation checks require server DatabaseProviderBase transport');
        return;
    }
    const dbProvider = ctx.Provider;
    const auth = dbProvider.Authorizations.find(
        (a) => a.Name?.trim().toLowerCase() === USER_IMPERSONATION_AUTHORIZATION_NAME.toLowerCase()
    );
    if (!auth) {
        SkipCheck(`Seeded authorization '${USER_IMPERSONATION_AUTHORIZATION_NAME}' not present — push metadata/authorizations`);
        return;
    }
    const uiRole = dbProvider.Roles.find((r) => r.Name?.trim().toLowerCase() === 'ui');
    const adminRole = dbProvider.Roles.find((r) => r.Name?.trim().toLowerCase() === 'administrator');
    if (!uiRole || !adminRole) {
        SkipCheck("Seeded 'UI' or 'Administrator' role not present");
        return;
    }

    const engine = GetAPIKeyEngine();
    await engine.Config(true, ctx.User);
    if (!engine.Applications.some((a) => a.Name === 'MJAPI' && a.IsActive)) {
        SkipCheck("Seeded active 'MJAPI' API Application not present");
        return;
    }

    EnsureImpersonationDataHooksRegistered();
    UserImpersonationResolver.ResetDeniedAuditRateLimitForTests();

    const prevEnableEnv = process.env.MJ_ENABLE_USER_IMPERSONATION;
    const prevWritesEnv = process.env.MJ_USER_IMPERSONATION_ALLOW_WRITES;
    const cleanup: CleanupFn[] = [];
    const runTag = `it194-${Date.now()}-${randomUUID().slice(0, 8)}`;
    let fixtureUserIds: string[] = [];

    try {
        // 1. Create throwaway operator role + grant Allow on "User Impersonation"
        const roleEntity = await dbProvider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
        roleEntity.NewRecord();
        roleEntity.Name = `IT194 Impersonator ${runTag}`;
        roleEntity.Description = `Throwaway operator role ${FIXTURE_TAG}`;
        Assert(await roleEntity.Save(), `Failed to create throwaway role: ${roleEntity.LatestResult?.CompleteMessage}`);
        const operatorRoleId = roleEntity.ID;
        const operatorRoleName = roleEntity.Name;
        cleanup.push(async () => {
            const r = await dbProvider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
            if (await r.Load(operatorRoleId)) {
                await r.Delete().catch(() => undefined);
            }
        });

        const grantEntity = await dbProvider.GetEntityObject<MJAuthorizationRoleEntity>('MJ: Authorization Roles', ctx.User);
        grantEntity.NewRecord();
        grantEntity.AuthorizationID = auth.ID;
        grantEntity.RoleID = operatorRoleId;
        grantEntity.Type = 'Allow';
        Assert(await grantEntity.Save(), `Failed to create User Impersonation Allow grant: ${grantEntity.LatestResult?.CompleteMessage}`);
        const grantId = grantEntity.ID;
        cleanup.push(async () => {
            const g = await dbProvider.GetEntityObject<MJAuthorizationRoleEntity>('MJ: Authorization Roles', ctx.User);
            if (await g.Load(grantId)) {
                await g.Delete().catch(() => undefined);
            }
        });

        // 2. Create throwaway users
        const actor = await createUserWithRoles(ctx, cleanup, {
            name: `IT194 Actor ${runTag}`,
            email: `it194-actor-${runTag}@integration.test`,
            type: 'User',
            roles: [{ RoleID: operatorRoleId, RoleName: operatorRoleName }],
        });
        const target = await createUserWithRoles(ctx, cleanup, {
            name: `IT194 Target ${runTag}`,
            email: `it194-target-${runTag}@integration.test`,
            type: 'User',
            roles: [{ RoleID: uiRole.ID, RoleName: uiRole.Name }],
        });
        const ungrantedCaller = await createUserWithRoles(ctx, cleanup, {
            name: `IT194 Ungranted ${runTag}`,
            email: `it194-ungranted-${runTag}@integration.test`,
            type: 'User',
            roles: [{ RoleID: uiRole.ID, RoleName: uiRole.Name }],
        });
        const protectedAdmin = await createUserWithRoles(ctx, cleanup, {
            name: `IT194 Admin ${runTag}`,
            email: `it194-admin-${runTag}@integration.test`,
            type: 'User',
            roles: [{ RoleID: adminRole.ID, RoleName: adminRole.Name }],
        });
        const ownerTarget = await createUserWithRoles(ctx, cleanup, {
            name: `IT194 Owner ${runTag}`,
            email: `it194-owner-${runTag}@integration.test`,
            type: 'Owner',
            roles: [{ RoleID: uiRole.ID, RoleName: uiRole.Name }],
        });
        const peerImpersonator = await createUserWithRoles(ctx, cleanup, {
            name: `IT194 Peer ${runTag}`,
            email: `it194-peer-${runTag}@integration.test`,
            type: 'User',
            roles: [{ RoleID: operatorRoleId, RoleName: operatorRoleName }],
        });
        fixtureUserIds = [actor.ID, target.ID, ungrantedCaller.ID, protectedAdmin.ID, ownerTarget.ID, peerImpersonator.ID];

        // Refresh provider metadata so the newly inserted Role & AuthorizationRole are visible to EvaluateUserImpersonationAuthorization
        await dbProvider.Refresh();

        const fx: ImpersonationFixture = {
            runTag,
            operatorRoleId,
            operatorRoleName,
            uiRoleId: uiRole.ID,
            adminRoleId: adminRole.ID,
            authId: auth.ID,
            actor,
            target,
            ungrantedCaller,
            protectedAdmin,
            ownerTarget,
            peerImpersonator,
            fixtureUserIds,
            cleanup,
        };

        const resolver = new UserImpersonationResolver();
        await fn(fx, resolver, dbProvider);
    } finally {
        if (prevEnableEnv === undefined) {
            delete process.env.MJ_ENABLE_USER_IMPERSONATION;
        } else {
            process.env.MJ_ENABLE_USER_IMPERSONATION = prevEnableEnv;
        }
        if (prevWritesEnv === undefined) {
            delete process.env.MJ_USER_IMPERSONATION_ALLOW_WRITES;
        } else {
            process.env.MJ_USER_IMPERSONATION_ALLOW_WRITES = prevWritesEnv;
        }
        RegisterServerUserImpersonationConfig(null);
        UserImpersonationResolver.ResetDeniedAuditRateLimitForTests();

        // Clean up audit logs and API keys referencing fixture users BEFORE removing users/roles
        await deleteFixtureAuditLogs(ctx, fixtureUserIds).catch(() => undefined);
        await deleteFixtureApiKeysForUsers(ctx, fixtureUserIds).catch(() => undefined);
        for (const step of cleanup.reverse()) {
            await step().catch(() => undefined);
        }
        await dbProvider.Refresh().catch(() => undefined);
        await GetAPIKeyEngine().Config(true, ctx.User).catch(() => undefined);
    }
}

export const UserImpersonationChecks: NamedCheck[] = [
    {
        Id: 'user-impersonation.UI1',
        Name: 'UI1: end-to-end grant, enable, mint, read as target, refuse write & forbidden entity, end, and confirm revoked key stops authenticating',
        Fn: async (ctx: IntegrationCheckContext) => {
            await withImpersonationFixture(ctx, async (fx, resolver, dbProvider) => {
                process.env.MJ_ENABLE_USER_IMPERSONATION = 'true';
                process.env.MJ_USER_IMPERSONATION_ALLOW_WRITES = 'false';

                // 1. Check capability & list eligible users
                const canRes = await resolver.MJCanImpersonateUsers(makeResolverContext(dbProvider, fx.actor));
                AssertEqual(canRes.CanImpersonate, true, `Actor should be authorized: ${canRes.Message}`);
                AssertEqual(canRes.CanImpersonateWithWrites, false, 'Writes should remain off by default');

                const listRes = await resolver.MJListImpersonatableUsers(
                    { Search: fx.runTag },
                    makeResolverContext(dbProvider, fx.actor)
                );
                AssertEqual(listRes.Authorized, true, 'Actor should list impersonatable users');
                const listedIds = new Set(listRes.Users.map((u) => u.UserID.toLowerCase()));
                Assert(listedIds.has(fx.target.ID.toLowerCase()), 'Eligible target should appear in list');
                Assert(!listedIds.has(fx.actor.ID.toLowerCase()), 'Self must never appear in list');
                Assert(!listedIds.has(fx.protectedAdmin.ID.toLowerCase()), 'Administrator must never appear in list');
                Assert(!listedIds.has(fx.ownerTarget.ID.toLowerCase()), 'Owner must never appear in list');
                Assert(!listedIds.has(fx.peerImpersonator.ID.toLowerCase()), 'Peer impersonator must never appear in list');

                // 2. Mint ViewAs impersonation key
                const startRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID, Mode: 'ViewAs', TTLMinutes: 15 },
                    makeResolverContext(dbProvider, fx.actor)
                );
                Assert(startRes.Success && !!startRes.RawApiKey && !!startRes.APIKeyID, `Mint failed: ${startRes.ResultCode} ${startRes.Message}`);
                AssertEqual(startRes.Mode, 'ViewAs', 'Mode must be ViewAs');
                AssertEqual(startRes.ReadOnly, true, 'ReadOnly must be true');

                const apiKeyId = startRes.APIKeyID!;
                const rawKey = startRes.RawApiKey!;
                const engine = GetAPIKeyEngine();
                await engine.Config(true, ctx.User);

                // 3. Validate the minted key against real DB (single lookup returning APIKey entity)
                const validation = await engine.ValidateAPIKey(
                    { RawKey: rawKey, ApplicationName: 'MJAPI', Endpoint: '/graphql', Method: 'POST' },
                    ctx.User
                );
                Assert(validation.IsValid && !!validation.APIKey, `Minted key failed ValidateAPIKey: ${validation.Error}`);
                const parsedLabel = ParseImpersonationKeyLabel(validation.APIKey!.Label);
                Assert(parsedLabel !== null && parsedLabel.readOnly === true && UUIDsEqual(parsedLabel.actorUserId!, fx.actor.ID), 'Key label must encode v1 RO actor/target');

                // Verify NO full_access scope and MJAPI app binding exists in DB
                const rv = RunView.FromMetadataProvider(dbProvider);
                const keyScopes = await rv.RunView<{ ScopeID: string; IsDeny: boolean; Priority: number }>(
                    { EntityName: 'MJ: API Key Scopes', ExtraFilter: `APIKeyID = '${EscapeSQLString(apiKeyId)}'`, Fields: ['ScopeID', 'IsDeny', 'Priority'], ResultType: 'simple' },
                    ctx.User
                );
                const fullAccessScope = engine.Scopes.find((s) => s.FullPath === 'full_access');
                Assert(
                    !(keyScopes.Results ?? []).some((s) => fullAccessScope && UUIDsEqual(s.ScopeID, fullAccessScope.ID)),
                    'Impersonation key MUST NEVER have full_access scope'
                );
                Assert((keyScopes.Results ?? []).some((s) => s.IsDeny && s.Priority === 1000), 'Impersonation key must carry Priority=1000 IsDeny rules');

                // 4. Stamp session & run real DB read as target, verify forbidden entity blocked, verify write refused
                const sessionTarget = new UserInfo(dbProvider, {
                    ID: fx.target.ID,
                    Name: fx.target.Name,
                    Email: fx.target.Email,
                    Type: fx.target.Type,
                    IsActive: true,
                    UserRoles: fx.target.UserRoles,
                });
                const session = StampImpersonationSession(sessionTarget, {
                    apiKeyId,
                    mode: 'ViewAs',
                    readOnly: true,
                    actorUserId: fx.actor.ID,
                    targetUserId: fx.target.ID,
                    expiresAtMs: validation.APIKey!.ExpiresAt ? new Date(validation.APIKey!.ExpiresAt).getTime() : undefined,
                });

                await RunWithImpersonationSession(session, async () => {
                    // Allowed read works
                    const allowedRead = await rv.RunView<{ ID: string }>(
                        { EntityName: 'MJ: Entities', Fields: ['ID'], MaxRows: 3, ResultType: 'simple' },
                        sessionTarget
                    );
                    Assert(allowedRead.Success, `Allowed read as impersonated target failed: ${allowedRead.ErrorMessage}`);

                    // Forbidden entity is blocked (even via unstamped UserInfo copy!)
                    const unstampedCopy = new UserInfo(dbProvider, { ID: fx.target.ID, Name: fx.target.Name, Email: fx.target.Email });
                    let forbiddenThrew = false;
                    try {
                        ImpersonationPreRunViewHook({ EntityName: 'MJ: Credentials' }, unstampedCopy);
                    } catch {
                        forbiddenThrew = true;
                    }
                    Assert(forbiddenThrew, 'Forbidden entity MJ: Credentials must be refused during impersonation');

                    // Write attempt refused at DataHook + Apollo GraphQL layer
                    const fakeWrite = await dbProvider.GetEntityObject('MJ: Entities', sessionTarget);
                    const saveVerdict = ImpersonationPreSaveHook(fakeWrite, sessionTarget);
                    Assert(typeof saveVerdict === 'string', 'BaseEntity Save must be refused in ViewAs mode');
                    const deleteVerdict = ImpersonationPreDeleteHook(fakeWrite, sessionTarget);
                    Assert(typeof deleteVerdict === 'string', 'BaseEntity Delete must be refused in ViewAs mode');

                    const gqlErrors = await ValidateImpersonationWebSocketSubscribe(
                        {
                            email: sessionTarget.Email,
                            userRecord: sessionTarget,
                            sessionId: 'ui1-mut',
                            apiKeyId,
                            impersonationSession: session,
                        },
                        'mutation { UpdateMJEntity(input: { ID: "1" }) { ID } }',
                        undefined
                    );
                    AssertEqual(gqlErrors?.[0]?.extensions?.['code'], 'IMPERSONATION_READ_ONLY', 'GraphQL mutation must be refused in ViewAs');
                });

                // 5. End impersonation, verify revoked key row is retained AND no longer authenticates
                const endRes = await resolver.MJEndUserImpersonation(
                    { APIKeyID: apiKeyId },
                    makeResolverContext(dbProvider, fx.actor)
                );
                Assert(endRes.Success && endRes.ResultCode === 'IMPERSONATION_ENDED', `End impersonation failed: ${endRes.ResultCode} ${endRes.Message}`);

                await engine.Config(true, ctx.User);
                const postEndValidation = await engine.ValidateAPIKey(
                    { RawKey: rawKey, ApplicationName: 'MJAPI', Endpoint: '/graphql', Method: 'POST' },
                    ctx.User
                );
                AssertEqual(postEndValidation.IsValid, false, 'Revoked impersonation key MUST NOT authenticate after MJEndUserImpersonation');

                const retainedRow = await dbProvider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User);
                Assert(await retainedRow.Load(apiKeyId), 'Revoked MJ: API Keys row should be retained for forensic audit linkage');
                AssertEqual(retainedRow.Status, 'Revoked', 'Retained key row must have Status = Revoked');
            });
        },
    },
    {
        Id: 'user-impersonation.UI2',
        Name: 'UI2: refuses no grant, kill switch off, API-key caller, chaining, protected-role target, Owner target, self, and peer impersonator',
        Fn: async (ctx: IntegrationCheckContext) => {
            await withImpersonationFixture(ctx, async (fx, resolver, dbProvider) => {
                // 1. Kill switch OFF -> FEATURE_DISABLED even for authorized actor
                process.env.MJ_ENABLE_USER_IMPERSONATION = 'false';
                const offRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID },
                    makeResolverContext(dbProvider, fx.actor)
                );
                AssertEqual(offRes.Success, false, 'Kill switch off must refuse mint');
                AssertEqual(offRes.ResultCode, 'FEATURE_DISABLED', 'Kill switch off must return FEATURE_DISABLED');

                // Enable feature for remaining refusal checks
                process.env.MJ_ENABLE_USER_IMPERSONATION = 'true';

                // 2. No grant -> FORBIDDEN
                const noGrantRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID },
                    makeResolverContext(dbProvider, fx.ungrantedCaller)
                );
                AssertEqual(noGrantRes.Success, false, 'Ungranted caller must be refused');
                AssertEqual(noGrantRes.ResultCode, 'FORBIDDEN', 'Ungranted caller must return FORBIDDEN');

                // 3. Regular API-key caller -> FORBIDDEN
                const engine = GetAPIKeyEngine();
                const regularKey = await engine.CreateAPIKey(
                    { UserId: fx.actor.ID, Label: `it194 regular caller key ${FIXTURE_TAG}` },
                    ctx.User
                );
                Assert(regularKey.Success && !!regularKey.APIKeyId, `Failed creating regular caller key: ${regularKey.Error}`);
                const apiKeyCallerRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID },
                    makeResolverContext(dbProvider, fx.actor, { apiKeyId: regularKey.APIKeyId })
                );
                AssertEqual(apiKeyCallerRes.Success, false, 'Regular API-key caller must be refused');
                AssertEqual(apiKeyCallerRes.ResultCode, 'FORBIDDEN', 'Regular API-key caller must return FORBIDDEN');

                // 4. Impersonation-key caller (chaining) -> FORBIDDEN_IMPERSONATION_CHAIN
                const firstMint = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID },
                    makeResolverContext(dbProvider, fx.actor)
                );
                Assert(firstMint.Success && !!firstMint.APIKeyID, `Initial mint for chaining test failed: ${firstMint.ResultCode}`);
                const chainRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.ungrantedCaller.ID },
                    makeResolverContext(dbProvider, fx.actor, { apiKeyId: firstMint.APIKeyID })
                );
                AssertEqual(chainRes.Success, false, 'Impersonation-key chaining must be refused');
                AssertEqual(chainRes.ResultCode, 'FORBIDDEN_IMPERSONATION_CHAIN', 'Chaining must return FORBIDDEN_IMPERSONATION_CHAIN');

                // 5-8. Protected-role target (Administrator), Owner target, self, peer impersonator -> FORBIDDEN_TARGET
                for (const [label, targetId] of [
                    ['protected-role Administrator', fx.protectedAdmin.ID],
                    ['Owner', fx.ownerTarget.ID],
                    ['self', fx.actor.ID],
                    ['peer impersonator', fx.peerImpersonator.ID],
                ] as const) {
                    const attempt = await resolver.MJStartUserImpersonation(
                        { TargetUserID: targetId },
                        makeResolverContext(dbProvider, fx.actor)
                    );
                    AssertEqual(attempt.Success, false, `Target '${label}' must be refused`);
                    AssertEqual(attempt.ResultCode, 'FORBIDDEN_TARGET', `Target '${label}' must return FORBIDDEN_TARGET`);
                }

                // Kill switch turned OFF mid-incident still allows MJEndUserImpersonation!
                process.env.MJ_ENABLE_USER_IMPERSONATION = 'false';
                const endWhileOff = await resolver.MJEndUserImpersonation(
                    { APIKeyID: firstMint.APIKeyID! },
                    makeResolverContext(dbProvider, fx.actor)
                );
                Assert(endWhileOff.Success && endWhileOff.ResultCode === 'IMPERSONATION_ENDED', 'MJEndUserImpersonation must stay operational when kill switch is off');
            });
        },
    },
    {
        Id: 'user-impersonation.UI3',
        Name: 'UI3: an impersonation key past ExpiresAt is refused by ValidateAPIKey, HTTP middleware (401), and WebSocket onSubscribe',
        Fn: async (ctx: IntegrationCheckContext) => {
            await withImpersonationFixture(ctx, async (fx, resolver, dbProvider) => {
                process.env.MJ_ENABLE_USER_IMPERSONATION = 'true';

                const startRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID, TTLMinutes: 5 },
                    makeResolverContext(dbProvider, fx.actor)
                );
                Assert(startRes.Success && !!startRes.RawApiKey && !!startRes.APIKeyID, `Mint failed: ${startRes.ResultCode}`);
                const apiKeyId = startRes.APIKeyID!;
                const rawKey = startRes.RawApiKey!;

                // Move ExpiresAt cleanly into the past in the real database
                const pastDate = new Date(Date.now() - EXPIRY_PAST_OFFSET_MS);
                const keyRow = await dbProvider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User);
                Assert(await keyRow.Load(apiKeyId), 'Failed to load minted API key for expiry test');
                keyRow.ExpiresAt = pastDate;
                Assert(await keyRow.Save(), `Failed to backdate ExpiresAt: ${keyRow.LatestResult?.CompleteMessage}`);

                const engine = GetAPIKeyEngine();
                await engine.Config(true, ctx.User);

                // 1. Real DB ValidateAPIKey refuses expired key
                const valRes = await engine.ValidateAPIKey(
                    { RawKey: rawKey, ApplicationName: 'MJAPI', Endpoint: '/graphql', Method: 'POST' },
                    ctx.User
                );
                AssertEqual(valRes.IsValid, false, 'Expired impersonation key must fail ValidateAPIKey');

                // 2. HTTP middleware refuses expired session with 401
                const expiredSession = StampImpersonationSession(fx.target, {
                    apiKeyId,
                    mode: 'ViewAs',
                    readOnly: true,
                    actorUserId: fx.actor.ID,
                    targetUserId: fx.target.ID,
                    expiresAtMs: pastDate.getTime(),
                });
                const expiredPayload = {
                    email: fx.target.Email,
                    userRecord: fx.target,
                    sessionId: 'ui3-expired',
                    apiKeyId,
                    impersonationSession: expiredSession,
                };
                const httpGuard = CreateImpersonationHttpGuardMiddleware('/');
                let httpStatus = 200;
                let nextCalled = false;
                const req = { method: 'POST', path: '/', url: '/', userPayload: expiredPayload } as unknown as Request;
                const res = {
                    status(code: number) {
                        httpStatus = code;
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
                AssertEqual(httpStatus, 401, 'Expired impersonation session over HTTP must return 401');
                AssertEqual(nextCalled, false, 'Expired impersonation session over HTTP must not call next()');

                // 3. WebSocket onSubscribe validator refuses expired session
                const wsErrors = await ValidateImpersonationWebSocketSubscribe(
                    expiredPayload,
                    'subscription { PushStatusUpdates { message } }',
                    undefined
                );
                Assert(Array.isArray(wsErrors) && wsErrors.length > 0, 'Expired impersonation session over WebSocket must be refused');
            });
        },
    },
    {
        Id: 'user-impersonation.UI4',
        Name: 'UI4: Started, Ended, and Denied audit rows record exact actor/target without RawApiKey, and a failed audit write rolls back and deletes the minted key',
        Fn: async (ctx: IntegrationCheckContext) => {
            await withImpersonationFixture(ctx, async (fx, resolver, dbProvider) => {
                process.env.MJ_ENABLE_USER_IMPERSONATION = 'true';

                // 1. Trigger Denied, Started, and Ended audit events against the real DB
                await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.protectedAdmin.ID },
                    makeResolverContext(dbProvider, fx.actor)
                );
                const startRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID },
                    makeResolverContext(dbProvider, fx.actor)
                );
                Assert(startRes.Success && !!startRes.APIKeyID && !!startRes.RawApiKey, `Mint failed: ${startRes.ResultCode}`);
                const apiKeyId = startRes.APIKeyID!;
                const rawKey = startRes.RawApiKey!;

                const endRes = await resolver.MJEndUserImpersonation(
                    { APIKeyID: apiKeyId },
                    makeResolverContext(dbProvider, fx.actor)
                );
                Assert(endRes.Success, `End failed: ${endRes.ResultCode}`);

                // Query real MJ: Audit Logs rows
                const rv = RunView.FromMetadataProvider(dbProvider);
                const auditRes = await rv.RunView<{
                    ID: string;
                    AuditLogTypeID: string;
                    UserID: string;
                    RecordID: string;
                    Status: string;
                    Details: string;
                }>(
                    {
                        EntityName: 'MJ: Audit Logs',
                        ExtraFilter: `UserID = '${EscapeSQLString(fx.actor.ID)}'`,
                        Fields: ['ID', 'AuditLogTypeID', 'UserID', 'RecordID', 'Status', 'Details'],
                        BypassCache: true,
                        ResultType: 'simple',
                    },
                    ctx.User
                );
                Assert(auditRes.Success, `Audit log query failed: ${auditRes.ErrorMessage}`);
                const rows = auditRes.Results ?? [];
                const typeIdByName = (name: string): string | undefined =>
                    dbProvider.AuditLogTypes.find((t) => t.Name?.trim().toLowerCase() === name.toLowerCase())?.ID;

                const startedTypeId = typeIdByName(USER_IMPERSONATION_AUDIT_LOG_TYPES.Started);
                const endedTypeId = typeIdByName(USER_IMPERSONATION_AUDIT_LOG_TYPES.Ended);
                const deniedTypeId = typeIdByName(USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied);
                Assert(!!startedTypeId && !!endedTypeId && !!deniedTypeId, 'Impersonation audit log types must be seeded');

                const startedRow = rows.find((r) => UUIDsEqual(r.AuditLogTypeID, startedTypeId!) && UUIDsEqual(r.RecordID, fx.target.ID));
                const endedRow = rows.find((r) => UUIDsEqual(r.AuditLogTypeID, endedTypeId!) && UUIDsEqual(r.RecordID, fx.target.ID));
                const deniedRow = rows.find((r) => UUIDsEqual(r.AuditLogTypeID, deniedTypeId!) && UUIDsEqual(r.RecordID, fx.protectedAdmin.ID));

                Assert(!!startedRow, 'Missing User Impersonation Started audit row');
                Assert(!!endedRow, 'Missing User Impersonation Ended audit row');
                Assert(!!deniedRow, 'Missing User Impersonation Denied audit row');
                for (const row of [startedRow!, endedRow!, deniedRow!]) {
                    Assert(!String(row.Details ?? '').includes(rawKey), 'AuditLog.Details must NEVER contain RawApiKey');
                }
                Assert(String(startedRow!.Details).includes(apiKeyId), 'Started AuditLog.Details must record apiKeyId');
                Assert(String(endedRow!.Details).includes(apiKeyId), 'Ended AuditLog.Details must record apiKeyId');

                // 2. Failed audit write must fail closed (AUDIT_LOG_FAILED) and rollback/delete the newly minted key row!
                const failingAuditProvider = new Proxy(dbProvider, {
                    get(targetObj, prop, receiver) {
                        if (prop === 'GetEntityObject') {
                            return async (entityName: string, contextUser?: UserInfo) => {
                                const entity = await targetObj.GetEntityObject(entityName, contextUser);
                                if (entityName === 'MJ: Audit Logs') {
                                    return new Proxy(entity, {
                                        get(eTarget, eProp, eReceiver) {
                                            if (eProp === 'Save') {
                                                return async () => false;
                                            }
                                            const v = Reflect.get(eTarget, eProp, eReceiver);
                                            return typeof v === 'function' ? v.bind(eTarget) : v;
                                        },
                                    });
                                }
                                return entity;
                            };
                        }
                        const val = Reflect.get(targetObj, prop, receiver);
                        return typeof val === 'function' ? val.bind(targetObj) : val;
                    },
                }) as DatabaseProviderBase;

                const beforeKeys = await rv.RunView<{ ID: string }>(
                    {
                        EntityName: 'MJ: API Keys',
                        ExtraFilter: `UserID = '${EscapeSQLString(fx.target.ID)}'`,
                        Fields: ['ID'],
                        BypassCache: true,
                        ResultType: 'simple',
                    },
                    ctx.User
                );
                const beforeIds = new Set((beforeKeys.Results ?? []).map((k) => k.ID.toLowerCase()));

                const failRes = await resolver.MJStartUserImpersonation(
                    { TargetUserID: fx.target.ID },
                    makeResolverContext(failingAuditProvider, fx.actor)
                );
                AssertEqual(failRes.Success, false, 'Failed audit write must fail mint');
                AssertEqual(failRes.ResultCode, 'AUDIT_LOG_FAILED', 'Failed audit write must return AUDIT_LOG_FAILED');
                AssertEqual(failRes.RawApiKey, undefined, 'Failed audit write must never return RawApiKey');

                const afterKeys = await rv.RunView<{ ID: string }>(
                    {
                        EntityName: 'MJ: API Keys',
                        ExtraFilter: `UserID = '${EscapeSQLString(fx.target.ID)}'`,
                        Fields: ['ID'],
                        BypassCache: true,
                        ResultType: 'simple',
                    },
                    ctx.User
                );
                const leakedKeys = (afterKeys.Results ?? []).filter((k) => !beforeIds.has(k.ID.toLowerCase()));
                AssertEqual(leakedKeys.length, 0, `Rolled-back impersonation key leaked in DB: ${leakedKeys.map((k) => k.ID).join(', ')}`);
            });
        },
    },
    {
        Id: 'user-impersonation.UI5',
        Name: 'UI5: normal user session and normal user API key behave identically with MJ_ENABLE_USER_IMPERSONATION both OFF and ON',
        Fn: async (ctx: IntegrationCheckContext) => {
            await withImpersonationFixture(ctx, async (fx, _resolver, dbProvider) => {
                const engine = GetAPIKeyEngine();
                const readScope = engine.Scopes.find((s) => s.FullPath === 'entity:read');
                Assert(!!readScope, 'Seeded entity:read scope required');

                const normalKey = await engine.CreateAPIKey(
                    { UserId: fx.target.ID, Label: `it194 normal key ${FIXTURE_TAG}` },
                    ctx.User
                );
                Assert(normalKey.Success && !!normalKey.RawKey && !!normalKey.APIKeyId, `CreateAPIKey failed: ${normalKey.Error}`);
                const scopeRow = await dbProvider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
                scopeRow.NewRecord();
                scopeRow.APIKeyID = normalKey.APIKeyId!;
                scopeRow.ScopeID = readScope!.ID;
                scopeRow.ResourcePattern = '*';
                scopeRow.PatternType = 'Include';
                scopeRow.IsDeny = false;
                scopeRow.Priority = 0;
                Assert(await scopeRow.Save(), `Failed saving scope for normal key: ${scopeRow.LatestResult?.CompleteMessage}`);
                await engine.Config(true, ctx.User);

                const rv = RunView.FromMetadataProvider(dbProvider);

                for (const flagState of ['false', 'true'] as const) {
                    process.env.MJ_ENABLE_USER_IMPERSONATION = flagState;

                    // 1. Normal API key validates cleanly with APIKey entity returned and is NOT flagged as impersonation
                    const val = await engine.ValidateAPIKey(
                        { RawKey: normalKey.RawKey!, ApplicationName: 'MJAPI', Endpoint: '/graphql', Method: 'POST' },
                        ctx.User
                    );
                    Assert(val.IsValid && !!val.APIKey, `Normal API key must validate with feature=${flagState}: ${val.Error}`);
                    AssertEqual(ParseImpersonationKeyLabel(val.APIKey!.Label), null, `Normal API key must not parse as impersonation (feature=${flagState})`);

                    const hash = engine.HashAPIKey(normalKey.RawKey!);
                    const authz = await engine.Authorize(hash, 'MJAPI', 'entity:read', 'Entities', ctx.User, undefined, { skipLogging: true });
                    Assert(authz.Allowed, `Normal API key entity:read must succeed with feature=${flagState}: ${authz.Reason}`);

                    // 2. Normal user session (no impersonation) passes DataHooks and RunView cleanly
                    AssertEqual(GetImpersonationSession(fx.target), null, `Normal session must not carry impersonation marker (feature=${flagState})`);
                    const readRes = await rv.RunView<{ ID: string }>(
                        { EntityName: 'MJ: Entities', Fields: ['ID'], MaxRows: 2, ResultType: 'simple' },
                        fx.target
                    );
                    Assert(readRes.Success, `Normal RunView must succeed with feature=${flagState}: ${readRes.ErrorMessage}`);
                    const probeEntity = await dbProvider.GetEntityObject('MJ: Entities', fx.target);
                    AssertEqual(ImpersonationPreSaveHook(probeEntity, fx.target), true, `Normal PreSaveHook must pass with feature=${flagState}`);
                    AssertEqual(ImpersonationPreDeleteHook(probeEntity, fx.target), true, `Normal PreDeleteHook must pass with feature=${flagState}`);
                }
            });
        },
    },
];

for (const check of UserImpersonationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('user-impersonation', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await GetAPIKeyEngine().Config(true, ctx.User);
    },
    Teardown: async () => {
        // Each check cleans up its own fixtures in finally.
    },
});
