import { GetAPIKeyEngine, type APIKeyEngine } from '@memberjunction/api-keys';
import {
    AuthorizationEvaluator,
    AuthorizationInfo,
    AuthorizationRoleInfo,
    AuthorizationRoleType,
    LogError,
    RunView,
    WellKnownUserSource,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import type {
    MJAPIKeyEntity,
    MJAPIKeyScopeEntity,
    MJAuditLogEntity,
} from '@memberjunction/core-entities';
import {
    EscapeSQLString,
    IndexByUUID,
    IsValidUUID,
    NormalizeUUID,
    UUIDsEqual,
} from '@memberjunction/global';
import {
    Arg,
    Ctx,
    Field,
    InputType,
    Int,
    Mutation,
    ObjectType,
    Query,
    Resolver,
} from 'type-graphql';
import { RefuseScopeLimitedPrincipals } from '../auth/scopeLimitedAccess.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';

/** Canonical `MJ: Authorizations` name required to impersonate another user. Granted to nobody by default. */
export const USER_IMPERSONATION_AUTHORIZATION_NAME = 'User Impersonation';

/** Label prefix stamped onto every temporary API key minted by {@link UserImpersonationResolver}. */
export const USER_IMPERSONATION_KEY_LABEL_PREFIX = 'MJ-Impersonation:';

/** Default lifetime (minutes) for temporary impersonation API keys (2 hours). */
export const USER_IMPERSONATION_DEFAULT_TTL_MINUTES = 120;

/** Minimum allowed lifetime (minutes) for temporary impersonation API keys. */
export const USER_IMPERSONATION_MIN_TTL_MINUTES = 5;

/** Maximum allowed lifetime (minutes) for temporary impersonation API keys (4 hours). */
export const USER_IMPERSONATION_MAX_TTL_MINUTES = 240;

/** Default page size returned by `MJListImpersonatableUsers`. */
export const USER_IMPERSONATION_DEFAULT_LIMIT = 100;

/** Maximum page size returned by `MJListImpersonatableUsers`. */
export const USER_IMPERSONATION_MAX_LIMIT = 500;

/** Canonical `MJ: Audit Log Types` names emitted by {@link UserImpersonationResolver}. */
export const USER_IMPERSONATION_AUDIT_LOG_TYPES = {
    Started: 'User Impersonation Started',
    Ended: 'User Impersonation Ended',
    Denied: 'User Impersonation Denied',
} as const;

const MAX_KEY_LABEL_LENGTH = 240;

interface UserQueryRow {
    ID: string;
    Name: string | null;
    FirstName?: string | null;
    LastName?: string | null;
    Email: string | null;
    Title?: string | null;
    Type?: string | null;
    IsActive?: boolean | null;
}

interface UserRoleQueryRow {
    UserID: string;
    Role: string | null;
}

interface ApiKeyLabelRow {
    ID: string;
    Label: string | null;
    Status?: string | null;
    UserID?: string | null;
}

interface AuditLogTypeRow {
    ID: string;
    Name: string | null;
}

interface ImpersonationCallerAuthorization {
    readonly authorized: boolean;
    readonly code: string;
    readonly message: string;
    readonly actorUser?: UserInfo;
    readonly privilegedUser?: UserInfo;
}

/**
 * Pure helper evaluating whether `user` holds an explicit active `Allow` grant (with no `Deny`)
 * on the `User Impersonation` authorization (or an active ancestor authorization).
 *
 * Strictly fails closed:
 * - Never auto-allows `Owner`, `Administrator`, or `Developer` without an explicit `MJ: Authorization Roles` grant.
 * - Any `Deny` on the `User Impersonation` row itself immediately rejects, even if an ancestor grants `Allow`.
 * - Inactive authorization rows are never honored.
 */
export function EvaluateUserImpersonationAuthorization(
    user: UserInfo | null | undefined,
    provider: Pick<IMetadataProvider, 'Authorizations' | 'AuthorizationRoles'> | null | undefined
): { readonly Allowed: boolean; readonly Reason: string } {
    if (!user) {
        return { Allowed: false, Reason: 'An authenticated user session is required.' };
    }
    if (IsScopeLimitedPrincipal(user)) {
        return { Allowed: false, Reason: 'Scope-limited sessions are not permitted to impersonate users.' };
    }

    const authorizations = provider?.Authorizations ?? [];
    const targetAuth = authorizations.find(
        (a) => a.Name?.trim().toLowerCase() === USER_IMPERSONATION_AUTHORIZATION_NAME.toLowerCase()
    );
    if (!targetAuth) {
        return {
            Allowed: false,
            Reason: `Authorization "${USER_IMPERSONATION_AUTHORIZATION_NAME}" is not configured.`,
        };
    }
    if (!targetAuth.IsActive) {
        return {
            Allowed: false,
            Reason: `Authorization "${USER_IMPERSONATION_AUTHORIZATION_NAME}" is inactive.`,
        };
    }

    const authorizationRoles = provider?.AuthorizationRoles ?? [];
    const userRoleIds = new Set((user.UserRoles ?? []).map((ur) => NormalizeUUID(ur.RoleID)));
    if (userRoleIds.size === 0) {
        return {
            Allowed: false,
            Reason: `User holds no roles granted the "${USER_IMPERSONATION_AUTHORIZATION_NAME}" authorization.`,
        };
    }

    // Use provider-scoped AuthorizationRoles whenever present (multi-provider safe);
    // fall back to AuthorizationEvaluator when a minimal test stub overrides UserCanExecute directly.
    if (authorizationRoles.length > 0) {
        if (hasDirectGrantType(targetAuth.ID, userRoleIds, authorizationRoles, AuthorizationRoleType.Deny)) {
            return {
                Allowed: false,
                Reason: `User is explicitly denied the "${USER_IMPERSONATION_AUTHORIZATION_NAME}" authorization.`,
            };
        }

        const authById = IndexByUUID(authorizations);
        const visited = new Set<string>();
        let node: AuthorizationInfo | undefined = targetAuth;
        while (node && !visited.has(NormalizeUUID(node.ID))) {
            visited.add(NormalizeUUID(node.ID));
            const hasDeny = hasDirectGrantType(node.ID, userRoleIds, authorizationRoles, AuthorizationRoleType.Deny);
            const hasAllow = hasDirectGrantType(node.ID, userRoleIds, authorizationRoles, AuthorizationRoleType.Allow);
            if (node.IsActive && hasAllow && !hasDeny) {
                return {
                    Allowed: true,
                    Reason: `Authorized via "${node.Name}".`,
                };
            }
            node = node.ParentID ? authById.Get(node.ParentID) : undefined;
        }
        return {
            Allowed: false,
            Reason: `None of the caller's roles holds an Allow grant for "${USER_IMPERSONATION_AUTHORIZATION_NAME}".`,
        };
    }

    // Fallback path when provider.AuthorizationRoles is empty (e.g., stubbed AuthorizationInfo.UserCanExecute).
    const evaluator = new AuthorizationEvaluator();
    if (evaluator.UserCanExecuteWithAncestors(targetAuth, user, authorizations)) {
        return {
            Allowed: true,
            Reason: `Authorized via "${targetAuth.Name}".`,
        };
    }
    return {
        Allowed: false,
        Reason: `None of the caller's roles holds an Allow grant for "${USER_IMPERSONATION_AUTHORIZATION_NAME}".`,
    };
}

function hasDirectGrantType(
    authorizationId: string,
    userRoleIds: ReadonlySet<string>,
    grants: readonly AuthorizationRoleInfo[],
    expectedType: AuthorizationRoleType
): boolean {
    return grants.some(
        (grant) =>
            UUIDsEqual(grant.AuthorizationID, authorizationId) &&
            userRoleIds.has(NormalizeUUID(grant.RoleID)) &&
            grant.AuthorizationType() === expectedType
    );
}

function parseCleanUuid(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }
    const trimmed = raw.trim();
    return IsValidUUID(trimmed) ? trimmed : null;
}

function isSystemUserRecord(
    user: { readonly ID: string; readonly Name?: string | null; readonly Type?: string | null },
    systemUserId: string | null
): boolean {
    if (systemUserId && UUIDsEqual(user.ID, systemUserId)) {
        return true;
    }
    const nameLower = (user.Name ?? '').trim().toLowerCase();
    const typeLower = (user.Type ?? '').trim().toLowerCase();
    return nameLower === 'system' || typeLower === 'system';
}

function clampTtlMinutes(rawMinutes: number | null | undefined): number {
    if (typeof rawMinutes !== 'number' || !Number.isFinite(rawMinutes)) {
        return USER_IMPERSONATION_DEFAULT_TTL_MINUTES;
    }
    return Math.min(
        USER_IMPERSONATION_MAX_TTL_MINUTES,
        Math.max(USER_IMPERSONATION_MIN_TTL_MINUTES, Math.round(rawMinutes))
    );
}

function clampListLimit(rawLimit: number | null | undefined): number {
    if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) {
        return USER_IMPERSONATION_DEFAULT_LIMIT;
    }
    return Math.min(USER_IMPERSONATION_MAX_LIMIT, Math.max(1, Math.round(rawLimit)));
}

function buildImpersonationKeyLabel(actorEmail: string, targetEmail: string): string {
    const raw = `${USER_IMPERSONATION_KEY_LABEL_PREFIX}${actorEmail}->${targetEmail}`;
    return raw.length <= MAX_KEY_LABEL_LENGTH ? raw : raw.slice(0, MAX_KEY_LABEL_LENGTH);
}

function formatUserDisplayName(user: UserQueryRow): string {
    const explicitName = user.Name?.trim();
    if (explicitName) {
        return explicitName;
    }
    const combined = [user.FirstName?.trim(), user.LastName?.trim()].filter(Boolean).join(' ').trim();
    if (combined) {
        return combined;
    }
    return user.Email?.trim() || user.ID;
}

function matchesSearchTerm(user: MJImpersonatableUser, normalizedSearch: string): boolean {
    if (!normalizedSearch) {
        return true;
    }
    const haystacks = [
        user.Name,
        user.FirstName ?? '',
        user.LastName ?? '',
        user.Email,
        user.Title ?? '',
        ...user.RoleNames,
    ];
    return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
}

// ============================================================================
// GraphQL Input & Output Types
// ============================================================================

@ObjectType()
export class MJCanImpersonateUsersPayload {
    @Field(() => Boolean)
    CanImpersonate: boolean;

    @Field(() => String)
    AuthorizationName: string;

    @Field(() => String)
    ResultCode: string;

    @Field(() => String, { nullable: true })
    Message?: string;
}

@ObjectType()
export class MJImpersonatableUser {
    @Field(() => String)
    UserID: string;

    @Field(() => String)
    Name: string;

    @Field(() => String, { nullable: true })
    FirstName?: string;

    @Field(() => String, { nullable: true })
    LastName?: string;

    @Field(() => String)
    Email: string;

    @Field(() => String, { nullable: true })
    Title?: string;

    @Field(() => String, { nullable: true })
    Type?: string;

    @Field(() => [String])
    RoleNames: string[];
}

@InputType()
export class MJListImpersonatableUsersInput {
    @Field(() => String, { nullable: true })
    Search?: string;

    @Field(() => Int, { nullable: true })
    Limit?: number;
}

@ObjectType()
export class MJListImpersonatableUsersPayload {
    @Field(() => Boolean)
    Authorized: boolean;

    @Field(() => String)
    ResultCode: string;

    @Field(() => String, { nullable: true })
    Message?: string;

    @Field(() => Int)
    TotalCount: number;

    @Field(() => [MJImpersonatableUser])
    Users: MJImpersonatableUser[];
}

@InputType()
export class MJStartUserImpersonationInput {
    @Field(() => String)
    TargetUserID: string;

    @Field(() => Int, { nullable: true })
    TTLMinutes?: number;
}

@ObjectType()
export class MJStartUserImpersonationPayload {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String)
    ResultCode: string;

    @Field(() => String, { nullable: true })
    Message?: string;

    @Field(() => String, { nullable: true })
    RawApiKey?: string;

    @Field(() => String, { nullable: true })
    APIKeyID?: string;

    @Field(() => String, { nullable: true })
    ExpiresAt?: string;

    @Field(() => MJImpersonatableUser, { nullable: true })
    TargetUser?: MJImpersonatableUser;
}

@InputType()
export class MJEndUserImpersonationInput {
    @Field(() => String)
    APIKeyID: string;
}

@ObjectType()
export class MJEndUserImpersonationPayload {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String)
    ResultCode: string;

    @Field(() => String, { nullable: true })
    Message?: string;

    @Field(() => String, { nullable: true })
    APIKeyID?: string;
}

// ============================================================================
// Resolver
// ============================================================================

/**
 * Built-in GraphQL control plane for MemberJunction Authorization-gated User Impersonation.
 *
 * Security invariants (fail-closed):
 * 1. Requires an explicit active `Allow` grant (and no `Deny`) on the `User Impersonation`
 *    `MJ: Authorizations` row. Granted to NOBODY by default — `Owner`, `Administrator`, and
 *    `Developer` roles are NOT auto-allowed unless an administrator explicitly grants the
 *    authorization in `MJ: Authorization Roles`.
 * 2. Strictly rejects any request authenticated via an `MJ-Impersonation:` API key so an
 *    impersonated session can never list users or mint chained impersonation keys.
 * 3. Refuses scope-limited principals via `@RefuseScopeLimitedPrincipals()` and inline checks.
 * 4. Excludes and refuses `System` users, inactive users (`IsActive = 0`), and self-impersonation.
 * 5. Mints short-lived (`2h` default, `4h` max) scoped `MJ: API Keys` tokens labeled
 *    `MJ-Impersonation:<ActorEmail>-><TargetEmail>`, writes `MJ: Audit Logs` entries, and
 *    revokes/deletes the key and its scopes immediately on `MJEndUserImpersonation`.
 */
@RefuseScopeLimitedPrincipals()
@Resolver()
export class UserImpersonationResolver extends ResolverBase {
    protected getApiKeyEngine(): APIKeyEngine {
        return GetAPIKeyEngine();
    }

    protected async resolvePrivilegedUser(
        provider: IMetadataProvider,
        fallbackUser: UserInfo
    ): Promise<UserInfo> {
        return (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? fallbackUser;
    }

    protected async isImpersonationApiKey(
        provider: IMetadataProvider,
        apiKeyId: string | undefined,
        privilegedUser: UserInfo
    ): Promise<boolean> {
        if (!apiKeyId?.trim()) {
            return false;
        }
        const cleanKeyId = parseCleanUuid(apiKeyId);
        if (!cleanKeyId) {
            // Fail closed: a malformed apiKeyId must not bypass the anti-chaining check.
            return true;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const keyRes = await rv.RunView<ApiKeyLabelRow>(
            {
                EntityName: 'MJ: API Keys',
                ExtraFilter: `ID = '${EscapeSQLString(cleanKeyId)}'`,
                Fields: ['ID', 'Label'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            privilegedUser
        );
        if (!keyRes.Success || !keyRes.Results?.[0]) {
            // Fail closed: if the active API key cannot be verified, refuse impersonation escalation.
            return true;
        }
        return (keyRes.Results[0].Label ?? '').startsWith(USER_IMPERSONATION_KEY_LABEL_PREFIX);
    }

    protected async authorizeImpersonationCaller(
        provider: IMetadataProvider,
        context: AppContext
    ): Promise<ImpersonationCallerAuthorization> {
        const actorUser = this.GetUserFromPayload(context.userPayload);
        if (!actorUser) {
            return {
                authorized: false,
                code: 'FORBIDDEN',
                message: 'An authenticated user session is required.',
            };
        }

        const privilegedUser = await this.resolvePrivilegedUser(provider, actorUser);

        // Anti-chaining check FIRST: never allow an impersonated session to invoke impersonation APIs.
        const usingImpersonationKey = await this.isImpersonationApiKey(
            provider,
            context.userPayload?.apiKeyId,
            privilegedUser
        );
        if (usingImpersonationKey) {
            return {
                authorized: false,
                code: 'FORBIDDEN_IMPERSONATION_CHAIN',
                message: 'Impersonation sessions cannot list users or start nested impersonation sessions.',
                actorUser,
                privilegedUser,
            };
        }

        const evalResult = EvaluateUserImpersonationAuthorization(actorUser, provider);
        if (!evalResult.Allowed) {
            return {
                authorized: false,
                code: 'FORBIDDEN',
                message: evalResult.Reason,
                actorUser,
                privilegedUser,
            };
        }

        return {
            authorized: true,
            code: 'OK',
            message: evalResult.Reason,
            actorUser,
            privilegedUser,
        };
    }

    @Query(() => MJCanImpersonateUsersPayload)
    async MJCanImpersonateUsers(
        @Ctx() context: AppContext
    ): Promise<MJCanImpersonateUsersPayload> {
        const provider = GetReadWriteProvider(context.providers);
        const auth = await this.authorizeImpersonationCaller(provider, context);
        return {
            CanImpersonate: auth.authorized,
            AuthorizationName: USER_IMPERSONATION_AUTHORIZATION_NAME,
            ResultCode: auth.code,
            Message: auth.message,
        };
    }

    @Query(() => MJListImpersonatableUsersPayload)
    async MJListImpersonatableUsers(
        @Arg('input', () => MJListImpersonatableUsersInput, { nullable: true })
        input: MJListImpersonatableUsersInput | undefined,
        @Ctx() context: AppContext
    ): Promise<MJListImpersonatableUsersPayload> {
        const provider = GetReadWriteProvider(context.providers);
        const auth = await this.authorizeImpersonationCaller(provider, context);
        if (!auth.authorized || !auth.actorUser || !auth.privilegedUser) {
            if (auth.actorUser && auth.privilegedUser) {
                await this.tryWriteAuditLog(provider, auth.privilegedUser, {
                    auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                    status: 'Failed',
                    actorUserId: auth.actorUser.ID,
                    targetUserId: auth.actorUser.ID,
                    description: `Denied MJListImpersonatableUsers (${auth.code}): ${auth.message}`,
                    details: {
                        action: 'MJListImpersonatableUsers',
                        resultCode: auth.code,
                        actorUserId: auth.actorUser.ID,
                        reason: auth.message,
                    },
                });
            }
            return {
                Authorized: false,
                ResultCode: auth.code,
                Message: auth.message,
                TotalCount: 0,
                Users: [],
            };
        }

        try {
            const normalizedSearch = (input?.Search ?? '').trim().toLowerCase();
            const limit = clampListLimit(input?.Limit);
            const allUsers = await this.loadImpersonatableUsers(provider, auth.privilegedUser, auth.actorUser.ID);
            const filtered = normalizedSearch
                ? allUsers.filter((u) => matchesSearchTerm(u, normalizedSearch))
                : allUsers;
            const page = filtered.slice(0, limit);

            return {
                Authorized: true,
                ResultCode: 'OK',
                Message: `Loaded ${page.length} of ${filtered.length} impersonatable users.`,
                TotalCount: filtered.length,
                Users: page,
            };
        } catch (err) {
            LogError(
                `MJListImpersonatableUsers failed: ${err instanceof Error ? err.message : String(err)}`
            );
            return {
                Authorized: false,
                ResultCode: 'INTERNAL_ERROR',
                Message: 'Unable to load impersonatable users.',
                TotalCount: 0,
                Users: [],
            };
        }
    }

    @Mutation(() => MJStartUserImpersonationPayload)
    async MJStartUserImpersonation(
        @Arg('input', () => MJStartUserImpersonationInput) input: MJStartUserImpersonationInput,
        @Ctx() context: AppContext
    ): Promise<MJStartUserImpersonationPayload> {
        const provider = GetReadWriteProvider(context.providers);
        const auth = await this.authorizeImpersonationCaller(provider, context);
        if (!auth.authorized || !auth.actorUser || !auth.privilegedUser) {
            if (auth.actorUser && auth.privilegedUser) {
                await this.tryWriteAuditLog(provider, auth.privilegedUser, {
                    auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                    status: 'Failed',
                    actorUserId: auth.actorUser.ID,
                    targetUserId: parseCleanUuid(input?.TargetUserID) ?? auth.actorUser.ID,
                    description: `Denied MJStartUserImpersonation (${auth.code}): ${auth.message}`,
                    details: {
                        action: 'MJStartUserImpersonation',
                        resultCode: auth.code,
                        actorUserId: auth.actorUser.ID,
                        requestedTargetUserId: input?.TargetUserID ?? null,
                        reason: auth.message,
                    },
                });
            }
            return {
                Success: false,
                ResultCode: auth.code,
                Message: auth.message,
            };
        }

        const cleanTargetUserId = parseCleanUuid(input.TargetUserID);
        if (!cleanTargetUserId) {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: 'A valid TargetUserID UUID is required.',
            };
        }

        const actorUser = auth.actorUser;
        const privilegedUser = auth.privilegedUser;

        if (UUIDsEqual(cleanTargetUserId, actorUser.ID)) {
            return {
                Success: false,
                ResultCode: 'FORBIDDEN_TARGET',
                Message: 'Impersonating your own user account is not permitted.',
            };
        }

        const rv = RunView.FromMetadataProvider(provider);

        try {
            const [targetUserRes, targetRolesRes] = await Promise.all([
                rv.RunView<UserQueryRow>(
                    {
                        EntityName: 'MJ: Users',
                        ExtraFilter: `ID = '${EscapeSQLString(cleanTargetUserId)}'`,
                        Fields: ['ID', 'Name', 'FirstName', 'LastName', 'Email', 'Title', 'Type', 'IsActive'],
                        MaxRows: 1,
                        ResultType: 'simple',
                    },
                    privilegedUser
                ),
                rv.RunView<UserRoleQueryRow>(
                    {
                        EntityName: 'MJ: User Roles',
                        ExtraFilter: `UserID = '${EscapeSQLString(cleanTargetUserId)}'`,
                        Fields: ['UserID', 'Role'],
                        ResultType: 'simple',
                    },
                    privilegedUser
                ),
            ]);

            const targetRow = targetUserRes.Success ? targetUserRes.Results?.[0] : undefined;
            if (!targetRow || targetRow.IsActive === false) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: 'Target user was not found or is inactive.',
                };
            }

            if (isSystemUserRecord(targetRow, privilegedUser.ID)) {
                await this.tryWriteAuditLog(provider, privilegedUser, {
                    auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                    status: 'Failed',
                    actorUserId: actorUser.ID,
                    targetUserId: cleanTargetUserId,
                    description: 'Denied attempt to impersonate the System user.',
                    details: {
                        action: 'MJStartUserImpersonation',
                        resultCode: 'FORBIDDEN_TARGET',
                        actorUserId: actorUser.ID,
                        targetUserId: cleanTargetUserId,
                    },
                });
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN_TARGET',
                    Message: 'Impersonating the System user is prohibited.',
                };
            }

            const engine = this.getApiKeyEngine();
            await engine.Config(false, privilegedUser, provider);

            const fullAccessScope = engine.Scopes.find((s) => s.FullPath === 'full_access');
            if (!fullAccessScope) {
                return {
                    Success: false,
                    ResultCode: 'CONFIGURATION_ERROR',
                    Message: "Required 'full_access' API scope is not configured in APIKeyEngine.",
                };
            }

            const ttlMinutes = clampTtlMinutes(input.TTLMinutes);
            const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
            const actorEmail = (actorUser.Email ?? actorUser.Name ?? actorUser.ID).trim();
            const targetEmail = (targetRow.Email ?? targetRow.Name ?? cleanTargetUserId).trim();
            const label = buildImpersonationKeyLabel(actorEmail, targetEmail);

            const created = await engine.CreateAPIKey(
                {
                    UserId: cleanTargetUserId,
                    Label: label,
                    Description: `Temporary user impersonation session initiated by ${actorEmail}.`,
                    ExpiresAt: expiresAt,
                },
                privilegedUser,
                provider
            );

            if (!created.Success || !created.RawKey || !created.APIKeyId) {
                return {
                    Success: false,
                    ResultCode: 'KEY_MINT_FAILED',
                    Message: created.Error ?? 'Failed to create temporary impersonation API key.',
                };
            }

            const scopeEntity = await provider.GetEntityObject<MJAPIKeyScopeEntity>(
                'MJ: API Key Scopes',
                privilegedUser
            );
            scopeEntity.NewRecord();
            scopeEntity.APIKeyID = created.APIKeyId;
            scopeEntity.ScopeID = fullAccessScope.ID;
            scopeEntity.ResourcePattern = '*';
            scopeEntity.PatternType = 'Include';
            scopeEntity.IsDeny = false;
            scopeEntity.Priority = 0;

            const scopeSaved = await scopeEntity.Save();
            if (!scopeSaved) {
                await this.cleanupOrphanedImpersonationKey(engine, provider, privilegedUser, created.APIKeyId);
                return {
                    Success: false,
                    ResultCode: 'KEY_SCOPE_FAILED',
                    Message: 'Failed to attach full_access scope to temporary impersonation key.',
                };
            }

            try {
                await engine.RefreshCache(privilegedUser);
            } catch {
                // Non-fatal: cache refresh is best-effort in isolated/mock environments.
            }

            const roleNames = Array.from(
                new Set(
                    (targetRolesRes.Success ? targetRolesRes.Results ?? [] : [])
                        .map((r) => r.Role?.trim())
                        .filter((r): r is string => Boolean(r))
                )
            ).sort((a, b) => a.localeCompare(b));

            const targetUser: MJImpersonatableUser = {
                UserID: targetRow.ID,
                Name: formatUserDisplayName(targetRow),
                FirstName: targetRow.FirstName?.trim() || undefined,
                LastName: targetRow.LastName?.trim() || undefined,
                Email: (targetRow.Email ?? '').trim(),
                Title: targetRow.Title?.trim() || undefined,
                Type: targetRow.Type?.trim() || undefined,
                RoleNames: roleNames,
            };

            await this.tryWriteAuditLog(provider, privilegedUser, {
                auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Started,
                status: 'Success',
                actorUserId: actorUser.ID,
                targetUserId: cleanTargetUserId,
                description: `Started user impersonation as ${targetUser.Name} (${targetEmail})`,
                details: {
                    action: 'MJStartUserImpersonation',
                    actorUserId: actorUser.ID,
                    actorEmail,
                    targetUserId: cleanTargetUserId,
                    targetEmail,
                    apiKeyId: created.APIKeyId,
                    ttlMinutes,
                    expiresAt: expiresAt.toISOString(),
                },
            });

            return {
                Success: true,
                ResultCode: 'IMPERSONATION_STARTED',
                Message: `Now viewing as ${targetUser.Name}.`,
                RawApiKey: created.RawKey,
                APIKeyID: created.APIKeyId,
                ExpiresAt: expiresAt.toISOString(),
                TargetUser: targetUser,
            };
        } catch (err) {
            LogError(
                `MJStartUserImpersonation failed for target ${cleanTargetUserId}: ${err instanceof Error ? err.message : String(err)}`
            );
            return {
                Success: false,
                ResultCode: 'INTERNAL_ERROR',
                Message: 'Unable to start user impersonation session.',
            };
        }
    }

    @Mutation(() => MJEndUserImpersonationPayload)
    async MJEndUserImpersonation(
        @Arg('input', () => MJEndUserImpersonationInput) input: MJEndUserImpersonationInput,
        @Ctx() context: AppContext
    ): Promise<MJEndUserImpersonationPayload> {
        const actorUser = this.GetUserFromPayload(context.userPayload);
        if (!actorUser) {
            return {
                Success: false,
                ResultCode: 'FORBIDDEN',
                Message: 'Authentication is required to end user impersonation.',
            };
        }

        const cleanApiKeyId = parseCleanUuid(input.APIKeyID);
        if (!cleanApiKeyId) {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: 'A valid APIKeyID UUID is required.',
            };
        }

        const provider = GetReadWriteProvider(context.providers);
        const privilegedUser = await this.resolvePrivilegedUser(provider, actorUser);
        const rv = RunView.FromMetadataProvider(provider);

        try {
            const keyRes = await rv.RunView<ApiKeyLabelRow>(
                {
                    EntityName: 'MJ: API Keys',
                    ExtraFilter: `ID = '${EscapeSQLString(cleanApiKeyId)}'`,
                    Fields: ['ID', 'Label', 'Status', 'UserID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                privilegedUser
            );
            const keyRow = keyRes.Success ? keyRes.Results?.[0] : undefined;
            if (!keyRow) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: 'Impersonation API key was not found or has already been cleaned up.',
                    APIKeyID: cleanApiKeyId,
                };
            }

            if (!(keyRow.Label ?? '').startsWith(USER_IMPERSONATION_KEY_LABEL_PREFIX)) {
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN',
                    Message: 'Only temporary user impersonation keys may be revoked via this mutation.',
                };
            }

            const callerApiKeyId = parseCleanUuid(context.userPayload?.apiKeyId);
            const isSameImpersonationKey = Boolean(callerApiKeyId && UUIDsEqual(callerApiKeyId, cleanApiKeyId));
            const callerAuth = await this.authorizeImpersonationCaller(provider, context);

            if (!callerAuth.authorized && !isSameImpersonationKey) {
                await this.tryWriteAuditLog(provider, privilegedUser, {
                    auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                    status: 'Failed',
                    actorUserId: actorUser.ID,
                    targetUserId: keyRow.UserID ?? actorUser.ID,
                    description: `Denied MJEndUserImpersonation for key ${cleanApiKeyId}.`,
                    details: {
                        action: 'MJEndUserImpersonation',
                        resultCode: 'FORBIDDEN',
                        actorUserId: actorUser.ID,
                        apiKeyId: cleanApiKeyId,
                    },
                });
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN',
                    Message: 'Caller is not authorized to end this impersonation session.',
                };
            }

            // 1. Delete all MJ: API Key Scopes bound to this temporary key
            const scopesRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: API Key Scopes',
                    ExtraFilter: `APIKeyID = '${EscapeSQLString(cleanApiKeyId)}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                privilegedUser
            );
            for (const scopeRow of scopesRes.Success ? scopesRes.Results ?? [] : []) {
                try {
                    const scopeEntity = await provider.GetEntityObject<MJAPIKeyScopeEntity>(
                        'MJ: API Key Scopes',
                        privilegedUser
                    );
                    if (await scopeEntity.Load(scopeRow.ID)) {
                        await scopeEntity.Delete();
                    }
                } catch (err) {
                    LogError(
                        `MJEndUserImpersonation: failed to delete scope ${scopeRow.ID}: ${err instanceof Error ? err.message : String(err)}`
                    );
                }
            }

            // 2. Revoke via APIKeyEngine (immediately marks Revoked and evicts validation cache)
            const engine = this.getApiKeyEngine();
            try {
                await engine.RevokeAPIKey(cleanApiKeyId, privilegedUser, provider);
            } catch (err) {
                LogError(
                    `MJEndUserImpersonation: RevokeAPIKey failed for ${cleanApiKeyId}: ${err instanceof Error ? err.message : String(err)}`
                );
            }

            // 3. Delete the MJ: API Keys row when possible (if usage-log FK retains it, Status is already Revoked)
            try {
                const keyEntity = await provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', privilegedUser);
                if (await keyEntity.Load(cleanApiKeyId)) {
                    await keyEntity.Delete();
                }
            } catch {
                // Non-fatal: key is already Revoked with 0 scopes and cache-evicted.
            }

            try {
                await engine.RefreshCache(privilegedUser);
            } catch {
                // Best-effort cache refresh
            }

            await this.tryWriteAuditLog(provider, privilegedUser, {
                auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Ended,
                status: 'Success',
                actorUserId: actorUser.ID,
                targetUserId: keyRow.UserID ?? actorUser.ID,
                description: `Ended user impersonation session (key ${cleanApiKeyId})`,
                details: {
                    action: 'MJEndUserImpersonation',
                    actorUserId: actorUser.ID,
                    apiKeyId: cleanApiKeyId,
                    targetUserId: keyRow.UserID ?? null,
                },
            });

            return {
                Success: true,
                ResultCode: 'IMPERSONATION_ENDED',
                Message: 'Impersonation session ended and temporary key revoked.',
                APIKeyID: cleanApiKeyId,
            };
        } catch (err) {
            LogError(
                `MJEndUserImpersonation failed for key ${cleanApiKeyId}: ${err instanceof Error ? err.message : String(err)}`
            );
            return {
                Success: false,
                ResultCode: 'INTERNAL_ERROR',
                Message: 'Unable to end user impersonation session.',
                APIKeyID: cleanApiKeyId,
            };
        }
    }

    private async loadImpersonatableUsers(
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        actorUserId: string
    ): Promise<MJImpersonatableUser[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const [usersRes, userRolesRes] = await Promise.all([
            rv.RunView<UserQueryRow>(
                {
                    EntityName: 'MJ: Users',
                    ExtraFilter: 'IsActive = 1',
                    Fields: ['ID', 'Name', 'FirstName', 'LastName', 'Email', 'Title', 'Type', 'IsActive'],
                    ResultType: 'simple',
                },
                privilegedUser
            ),
            rv.RunView<UserRoleQueryRow>(
                {
                    EntityName: 'MJ: User Roles',
                    Fields: ['UserID', 'Role'],
                    ResultType: 'simple',
                },
                privilegedUser
            ),
        ]);

        if (!usersRes.Success) {
            throw new Error(usersRes.ErrorMessage || 'Failed to query active users.');
        }

        const rolesByUserId = new Map<string, Set<string>>();
        for (const row of userRolesRes.Success ? userRolesRes.Results ?? [] : []) {
            const roleName = row.Role?.trim();
            if (!row.UserID || !roleName) {
                continue;
            }
            const key = NormalizeUUID(row.UserID);
            let set = rolesByUserId.get(key);
            if (!set) {
                set = new Set<string>();
                rolesByUserId.set(key, set);
            }
            set.add(roleName);
        }

        const results: MJImpersonatableUser[] = [];
        for (const row of usersRes.Results ?? []) {
            if (row.IsActive === false) {
                continue;
            }
            if (isSystemUserRecord(row, privilegedUser.ID)) {
                continue;
            }
            if (UUIDsEqual(row.ID, actorUserId)) {
                continue;
            }

            const roles = Array.from(rolesByUserId.get(NormalizeUUID(row.ID)) ?? []).sort((a, b) =>
                a.localeCompare(b)
            );
            results.push({
                UserID: row.ID,
                Name: formatUserDisplayName(row),
                FirstName: row.FirstName?.trim() || undefined,
                LastName: row.LastName?.trim() || undefined,
                Email: (row.Email ?? '').trim(),
                Title: row.Title?.trim() || undefined,
                Type: row.Type?.trim() || undefined,
                RoleNames: roles,
            });
        }

        results.sort((a, b) => {
            const nameCmp = a.Name.localeCompare(b.Name);
            return nameCmp !== 0 ? nameCmp : a.Email.localeCompare(b.Email);
        });
        return results;
    }

    private async cleanupOrphanedImpersonationKey(
        engine: APIKeyEngine,
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        apiKeyId: string
    ): Promise<void> {
        try {
            await engine.RevokeAPIKey(apiKeyId, privilegedUser, provider);
            const keyEntity = await provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', privilegedUser);
            if (await keyEntity.Load(apiKeyId)) {
                await keyEntity.Delete();
            }
        } catch {
            // Best-effort cleanup of partially minted key
        }
    }

    private async tryWriteAuditLog(
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        params: {
            readonly auditTypeName: string;
            readonly status: 'Success' | 'Failed';
            readonly actorUserId: string;
            readonly targetUserId: string;
            readonly description: string;
            readonly details: Record<string, unknown>;
        }
    ): Promise<void> {
        try {
            const auditEntityMeta = provider.Entities?.find((e) => e.Name === 'MJ: Audit Logs');
            if (!auditEntityMeta) {
                return;
            }

            let auditTypeId: string | undefined = provider.AuditLogTypes?.find(
                (t) => t?.Name?.trim().toLowerCase() === params.auditTypeName.toLowerCase()
            )?.ID;

            if (!auditTypeId) {
                const rv = RunView.FromMetadataProvider(provider);
                const typesRes = await rv.RunView<AuditLogTypeRow>(
                    {
                        EntityName: 'MJ: Audit Log Types',
                        Fields: ['ID', 'Name'],
                        MaxRows: 100,
                        ResultType: 'simple',
                    },
                    privilegedUser
                );
                const types = typesRes.Success ? typesRes.Results ?? [] : [];
                auditTypeId =
                    types.find((t) => t.Name?.trim().toLowerCase() === params.auditTypeName.toLowerCase())?.ID ??
                    types.find((t) => /impersonat|authorization|security|auth/i.test(t.Name ?? ''))?.ID ??
                    types[0]?.ID;
            }

            if (!auditTypeId) {
                return;
            }

            const auditLog = await provider.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', privilegedUser);
            auditLog.NewRecord();
            auditLog.UserID = params.actorUserId;
            auditLog.AuditLogTypeID = auditTypeId;
            auditLog.Status = params.status;
            auditLog.Description = params.description;
            auditLog.Details = JSON.stringify(params.details);
            const usersEntity = provider.Entities?.find((e) => e.Name === 'MJ: Users');
            auditLog.EntityID = usersEntity?.ID ?? null;
            auditLog.RecordID = params.targetUserId;
            await auditLog.Save();
        } catch {
            // Audit log write is best-effort and must not block revocation or mask caller errors.
        }
    }
}
