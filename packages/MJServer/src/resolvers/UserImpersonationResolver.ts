import { GetAPIKeyEngine, type APIKeyEngine } from '@memberjunction/api-keys';
import {
    AuthorizationInfo,
    AuthorizationRoleInfo,
    LogError,
    RunView,
    WellKnownUserSource,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import type {
    MJAPIKeyApplicationEntity,
    MJAPIKeyEntity,
    MJAPIKeyScopeEntity,
    MJAuditLogEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
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
import {
    BuildActorImpersonationKeyLikePattern,
    BuildImpersonationKeyLabel,
    CloseImpersonationWebSockets,
    DoRolesHoldImpersonationReadAuthorization,
    DoRolesHoldImpersonationWriteAuthorization,
    EvaluateTargetImpersonationEligibility,
    GetImpersonationSession,
    IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES,
    IMPERSONATION_ENTITY_DENY_SCOPE_PATHS,
    IMPERSONATION_READ_ONLY_ALLOWED_SCOPES,
    ParseImpersonationKeyLabel,
    USER_IMPERSONATION_AUTHORIZATION_NAME,
    USER_IMPERSONATION_KEY_LABEL_PREFIX,
    USER_IMPERSONATION_KEY_LABEL_V1_PREFIX,
    USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME,
    WithImpersonationKeyMintScope,
    type ImpersonationMode,
} from '../auth/impersonationGuard.js';
import { RefuseScopeLimitedPrincipals } from '../auth/scopeLimitedAccess.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import {
    ClampUserImpersonationTtlMinutes,
    IsUserImpersonationEnabled,
    IsUserImpersonationWritesEnabled,
    ResolveUserImpersonationConfig,
    USER_IMPERSONATION_DEFAULT_TTL_MINUTES,
    USER_IMPERSONATION_MAX_TTL_MINUTES,
    USER_IMPERSONATION_MIN_TTL_MINUTES,
} from '../userImpersonationConfigUnits.js';
import { GetReadWriteProvider } from '../util.js';

export {
    USER_IMPERSONATION_AUTHORIZATION_NAME,
    USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME,
    USER_IMPERSONATION_KEY_LABEL_PREFIX,
    USER_IMPERSONATION_KEY_LABEL_V1_PREFIX,
    USER_IMPERSONATION_MIN_TTL_MINUTES,
    USER_IMPERSONATION_DEFAULT_TTL_MINUTES,
    USER_IMPERSONATION_MAX_TTL_MINUTES,
};

/** Default page size returned by `MJListImpersonatableUsers`. */
export const USER_IMPERSONATION_DEFAULT_LIMIT = 100;

/** Maximum page size returned by `MJListImpersonatableUsers`. */
export const USER_IMPERSONATION_MAX_LIMIT = 500;

const MAX_AUDIT_INPUT_STRING_LENGTH = 128; // Bounds raw client-supplied TargetUserID/Mode strings recorded in Denied audit Details
const DENIED_AUDIT_WINDOW_MS = 60_000; // Sliding 60-second window bounding per-caller Denied audit writes against log flooding
const DENIED_AUDIT_MAX_PER_WINDOW = 10; // Caps Denied audit log writes per caller per window so unprivileged users cannot flood MJ: Audit Logs

/** Canonical `MJ: Audit Log Types` names emitted by {@link UserImpersonationResolver}. */
export const USER_IMPERSONATION_AUDIT_LOG_TYPES = {
    Started: 'User Impersonation Started',
    Ended: 'User Impersonation Ended',
    Denied: 'User Impersonation Denied',
} as const;

/**
 * Comma-separated glob pattern attached as `Priority = 1000, IsDeny = true` on `MJ: API Key Scopes`
 * (`view:run`, `entity:read`, `entity:create`, `entity:update`, `entity:delete`, `entity:merge`)
 * so `APIKeyEngine` denies sensitive entities at the key-scope tier in addition to `MJServer`'s
 * `PreRunView`/`PreSave`/`PreDelete`/`ResolverBase` data-layer isolation.
 */
export const IMPERSONATION_SENSITIVE_ENTITY_DENY_PATTERN =
    'MJ: API Key*,MJ: API Scopes,MJ: API Application*,MJ: Credential*,MJ: AI *Credential*,MJ: Company Integrations,MJ: MCP Servers,MJ: Encryption*,MJ: O Auth*,MJ: Audit Log*,MJ: Record Changes,MJ: Communication Logs,MJ: Communication Principal Preferences,MJ: Users,MJ: Roles,MJ: User Roles,MJ: Authorization*,MJ: Entity *Permissions,MJ: Access Control Rules,MJ: Application Roles,MJ: Resource Permissions,MJ: Row Level Security Filters,MJ: Query Permissions,MJ: Authentication Providers,MJ: Magic Link*,MJ: Artifact Guest Share Links,MJ: Public Links,MJ: List Invitations';

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
    RoleID?: string | null;
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

interface AuthorizationQueryRow {
    ID: string;
    Name: string | null;
    ParentID?: string | null;
    IsActive?: boolean | null;
    UseAuditLog?: boolean | null;
}

interface AuthorizationRoleQueryRow {
    ID: string;
    AuthorizationID: string;
    RoleID: string;
    Type: string;
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
 * - Any `Deny` on the `User Impersonation` row or ancestor immediately rejects.
 * - Inactive authorization rows are never honored.
 */
export function EvaluateUserImpersonationAuthorization(
    user: UserInfo | null | undefined,
    provider: Pick<IMetadataProvider, 'Authorizations' | 'AuthorizationRoles'> | null | undefined
): { readonly Allowed: boolean; readonly Reason: string } {
    if (!user) {
        return { Allowed: false, Reason: 'An authenticated user session is required.' };
    }
    if (IsScopeLimitedPrincipal(user) || GetImpersonationSession(user) !== null) {
        return { Allowed: false, Reason: 'Scope-limited or impersonated sessions are not permitted to impersonate users.' };
    }

    const userRoleIds = new Set(
        (user.UserRoles ?? [])
            .map((ur) => (ur.RoleID ? NormalizeUUID(ur.RoleID) : ''))
            .filter(Boolean)
    );
    return DoRolesHoldImpersonationReadAuthorization(
        userRoleIds,
        provider?.Authorizations ?? [],
        provider?.AuthorizationRoles ?? [],
        user
    );
}

/**
 * Pure helper evaluating whether `user` holds BOTH `User Impersonation` AND a DIRECT `Allow` grant
 * (never inherited from parent `User Impersonation`!) on `User Impersonation: Act As (Allow Writes)`.
 */
export function EvaluateUserImpersonationWriteAuthorization(
    user: UserInfo | null | undefined,
    provider: Pick<IMetadataProvider, 'Authorizations' | 'AuthorizationRoles'> | null | undefined
): { readonly Allowed: boolean; readonly Reason: string } {
    const baseEval = EvaluateUserImpersonationAuthorization(user, provider);
    if (!baseEval.Allowed || !user) {
        return baseEval;
    }

    const userRoleIds = new Set(
        (user.UserRoles ?? [])
            .map((ur) => (ur.RoleID ? NormalizeUUID(ur.RoleID) : ''))
            .filter(Boolean)
    );
    return DoRolesHoldImpersonationWriteAuthorization(
        userRoleIds,
        provider?.Authorizations ?? [],
        provider?.AuthorizationRoles ?? []
    );
}

function parseCleanUuid(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }
    const trimmed = raw.trim();
    return IsValidUUID(trimmed) ? trimmed : null;
}

function truncateAuditInput(raw: string | null | undefined): string | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.length > MAX_AUDIT_INPUT_STRING_LENGTH
        ? trimmed.slice(0, MAX_AUDIT_INPUT_STRING_LENGTH)
        : trimmed;
}

function clampListLimit(rawLimit: number | null | undefined): number {
    if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) {
        return USER_IMPERSONATION_DEFAULT_LIMIT;
    }
    return Math.min(USER_IMPERSONATION_MAX_LIMIT, Math.max(1, Math.round(rawLimit)));
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

    @Field(() => Boolean)
    CanImpersonateWithWrites: boolean;

    @Field(() => String)
    AuthorizationName: string;

    @Field(() => String)
    WriteAuthorizationName: string;

    @Field(() => Int)
    DefaultTTLMinutes: number;

    @Field(() => Int)
    MaxTTLMinutes: number;

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

    @Field(() => String, {
        nullable: true,
        description: "Impersonation mode: 'ViewAs' (default, server-enforced Read-Only) or 'ActAs' (write-enabled; requires server allowWrites + direct 'User Impersonation: Act As (Allow Writes)' grant).",
    })
    Mode?: string;
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

    @Field(() => String, { nullable: true })
    Mode?: string;

    @Field(() => Boolean, { nullable: true })
    ReadOnly?: boolean;

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
 * Built-in GraphQL control plane for MemberJunction Dual-Key, Read-Only-by-Default User Impersonation.
 *
 * Security invariants (fail-closed across all 6 layers):
 * 1. Dual-key kill switch: requires BOTH `MJ_ENABLE_USER_IMPERSONATION=true` (`userImpersonation.enabled=true`,
 *    off by default) AND an explicit active `Allow` grant on `User Impersonation` (`0` roles by default).
 *    `MJEndUserImpersonation` remains operational even when the kill switch is flipped `false` mid-incident.
 * 2. Read-Only `ViewAs` by default: mints narrow read-only scoped keys (`MJ-Impersonation:v1:RO:...`),
 *    never `full_access`, and blocks 100% of mutations at the Apollo/WS/HTTP/DataHook layers. Optional `ActAs`
 *    write mode requires a triple gate (`enabled`, `allowWrites`, and direct `Allow` on child authorization).
 * 3. Strict target privilege ceiling (live DB `BypassCache: true` + `UserCache` cross-check): blocks `System`,
 *    `Owner`, inactive accounts, self-impersonation, `Administrator`/`Developer`/`Integration` (`protectedTargetRoles`),
 *    and any peer user holding `User Impersonation` privileges.
 * 4. Sensitive-entity isolation: attaches `Priority = 1000, IsDeny = true` scope rules AND data-layer blocks
 *    against API keys, credentials, encryption keys, OAuth tokens, audit logs, users/roles/permissions, and
 *    other users' private 1:1 conversations.
 * 5. Short blast-radius TTL (`15m` default, `5m..60m` bounds), UUID-keyed single-active-session per actor,
 *    and mandatory fail-closed audit logging (`AUDIT_LOG_FAILED` revokes & deletes the key before returning).
 */
@RefuseScopeLimitedPrincipals()
@Resolver()
export class UserImpersonationResolver extends ResolverBase {
    private static readonly actorMintLocks = new Map<string, Promise<void>>();
    private static readonly deniedAuditTimestamps = new Map<string, number[]>();

    /** Clears per-caller Denied audit rate-limit buckets; intended for unit tests only. */
    public static ResetDeniedAuditRateLimitForTests(): void {
        UserImpersonationResolver.deniedAuditTimestamps.clear();
    }

    private shouldWriteDeniedAuditLog(actorUserId: string): boolean {
        const key = IsValidUUID(actorUserId) ? NormalizeUUID(actorUserId) : actorUserId.trim().toLowerCase();
        const now = Date.now();
        const cutoff = now - DENIED_AUDIT_WINDOW_MS;
        const existing = UserImpersonationResolver.deniedAuditTimestamps.get(key) ?? [];
        const recent = existing.filter((ts) => ts > cutoff);
        if (recent.length >= DENIED_AUDIT_MAX_PER_WINDOW) {
            UserImpersonationResolver.deniedAuditTimestamps.set(key, recent);
            return false;
        }
        recent.push(now);
        UserImpersonationResolver.deniedAuditTimestamps.set(key, recent);
        return true;
    }

    protected getApiKeyEngine(): APIKeyEngine {
        return GetAPIKeyEngine();
    }

    protected async resolvePrivilegedUser(
        provider: IMetadataProvider,
        fallbackUser: UserInfo
    ): Promise<UserInfo> {
        return (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? fallbackUser;
    }

    private async withActorMintLock<T>(actorUserId: string, fn: () => Promise<T>): Promise<T> {
        const lockKey = NormalizeUUID(actorUserId);
        const prior = UserImpersonationResolver.actorMintLocks.get(lockKey) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const chained = prior.then(() => gate, () => gate);
        UserImpersonationResolver.actorMintLocks.set(lockKey, chained);
        await prior.catch(() => undefined);
        try {
            return await fn();
        } finally {
            release();
            if (UserImpersonationResolver.actorMintLocks.get(lockKey) === chained) {
                UserImpersonationResolver.actorMintLocks.delete(lockKey);
            }
        }
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
            return true;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const keyRes = await rv.RunView<ApiKeyLabelRow>(
            {
                EntityName: 'MJ: API Keys',
                ExtraFilter: `ID = '${EscapeSQLString(cleanKeyId)}'`,
                Fields: ['ID', 'Label'],
                MaxRows: 1,
                BypassCache: true,
                ResultType: 'simple',
            },
            privilegedUser
        );
        if (!keyRes.Success || !keyRes.Results?.[0]) {
            return true;
        }
        return ParseImpersonationKeyLabel(keyRes.Results[0].Label) !== null;
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

        // 0. System API keys carry no human actor attribution and must never initiate impersonation.
        if (context.userPayload?.isSystemUser) {
            return {
                authorized: false,
                code: 'FORBIDDEN',
                message: 'System API key sessions are not permitted to invoke user impersonation because human actor attribution cannot be established.',
                actorUser,
                privilegedUser,
            };
        }

        // 1. Anti-chaining & dual-credential smuggling check FIRST so impersonation keys can never probe state.
        if (GetImpersonationSession(context.userPayload) !== null) {
            return {
                authorized: false,
                code: 'FORBIDDEN_IMPERSONATION_CHAIN',
                message: 'Impersonation sessions cannot list users or start nested impersonation sessions.',
                actorUser,
                privilegedUser,
            };
        }

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

        // Refuse non-impersonation API keys and dual-header smuggled requests (Bearer + x-api-key).
        if (context.userPayload?.apiKeyId || context.HasRawApiKeyHeader) {
            return {
                authorized: false,
                code: 'FORBIDDEN',
                message: 'API key credentials and dual-header requests are not permitted to invoke user impersonation.',
                actorUser,
                privilegedUser,
            };
        }

        // 2. Dual-key infrastructure kill switch (strictly off by default everywhere).
        if (!IsUserImpersonationEnabled()) {
            return {
                authorized: false,
                code: 'FEATURE_DISABLED',
                message: 'User impersonation is disabled on this server (MJ_ENABLE_USER_IMPERSONATION is off).',
                actorUser,
                privilegedUser,
            };
        }

        // 3. Explicit active Allow grant on "User Impersonation" (zero roles granted by default).
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
        const resolvedCfg = ResolveUserImpersonationConfig();
        const auth = await this.authorizeImpersonationCaller(provider, context);

        let canImpersonateWithWrites = false;
        if (auth.authorized && auth.actorUser && resolvedCfg.allowWrites) {
            canImpersonateWithWrites = EvaluateUserImpersonationWriteAuthorization(
                auth.actorUser,
                provider
            ).Allowed;
        }

        return {
            CanImpersonate: auth.authorized,
            CanImpersonateWithWrites: canImpersonateWithWrites,
            AuthorizationName: USER_IMPERSONATION_AUTHORIZATION_NAME,
            WriteAuthorizationName: USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME,
            DefaultTTLMinutes: resolvedCfg.defaultTtlMinutes,
            MaxTTLMinutes: resolvedCfg.maxTtlMinutes,
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
            if (auth.actorUser && auth.privilegedUser && this.shouldWriteDeniedAuditLog(auth.actorUser.ID)) {
                await this.tryWriteAuditLog(provider, auth.privilegedUser, context, {
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
            if (auth.actorUser && auth.privilegedUser && this.shouldWriteDeniedAuditLog(auth.actorUser.ID)) {
                await this.tryWriteAuditLog(provider, auth.privilegedUser, context, {
                    auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                    status: 'Failed',
                    actorUserId: auth.actorUser.ID,
                    targetUserId: parseCleanUuid(input?.TargetUserID) ?? auth.actorUser.ID,
                    description: `Denied MJStartUserImpersonation (${auth.code}): ${auth.message}`,
                    details: {
                        action: 'MJStartUserImpersonation',
                        resultCode: auth.code,
                        actorUserId: auth.actorUser.ID,
                        requestedTargetUserId: truncateAuditInput(input?.TargetUserID),
                        requestedMode: truncateAuditInput(input?.Mode) ?? 'ViewAs',
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

        const rawMode = input.Mode?.trim() || 'ViewAs';
        if (rawMode !== 'ViewAs' && rawMode !== 'ActAs') {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: "Invalid Mode: must be 'ViewAs' (Read-Only) or 'ActAs'.",
            };
        }
        const effectiveMode: ImpersonationMode = rawMode;
        const effectiveReadOnly = effectiveMode !== 'ActAs';

        const actorUser = auth.actorUser;
        const privilegedUser = auth.privilegedUser;

        // Triple-gate check when caller requests write-enabled ActAs mode
        if (effectiveMode === 'ActAs') {
            if (!IsUserImpersonationWritesEnabled()) {
                await this.tryWriteAuditLog(provider, privilegedUser, context, {
                    auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                    status: 'Failed',
                    actorUserId: actorUser.ID,
                    targetUserId: cleanTargetUserId,
                    description: 'Denied ActAs impersonation: server allowWrites flag is disabled.',
                    details: {
                        action: 'MJStartUserImpersonation',
                        resultCode: 'WRITES_DISABLED',
                        actorUserId: actorUser.ID,
                        targetUserId: cleanTargetUserId,
                        requestedMode: effectiveMode,
                    },
                });
                return {
                    Success: false,
                    ResultCode: 'WRITES_DISABLED',
                    Message: "Write-mode user impersonation ('ActAs') is disabled on this server.",
                };
            }

            const writeAuthEval = EvaluateUserImpersonationWriteAuthorization(actorUser, provider);
            if (!writeAuthEval.Allowed) {
                await this.tryWriteAuditLog(provider, privilegedUser, context, {
                    auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                    status: 'Failed',
                    actorUserId: actorUser.ID,
                    targetUserId: cleanTargetUserId,
                    description: `Denied ActAs impersonation: ${writeAuthEval.Reason}`,
                    details: {
                        action: 'MJStartUserImpersonation',
                        resultCode: 'FORBIDDEN_WRITE_MODE',
                        actorUserId: actorUser.ID,
                        targetUserId: cleanTargetUserId,
                        requestedMode: effectiveMode,
                        reason: writeAuthEval.Reason,
                    },
                });
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN_WRITE_MODE',
                    Message: writeAuthEval.Reason,
                };
            }
        }

        if (UUIDsEqual(cleanTargetUserId, actorUser.ID)) {
            return {
                Success: false,
                ResultCode: 'FORBIDDEN_TARGET',
                Message: 'Impersonating your own user account is not permitted.',
            };
        }

        return this.withActorMintLock(actorUser.ID, () =>
            this.mintImpersonationSessionLocked({
                provider,
                context,
                actorUser,
                privilegedUser,
                cleanTargetUserId,
                requestedTtlMinutes: input.TTLMinutes,
                effectiveMode,
                effectiveReadOnly,
            })
        );
    }

    private async mintImpersonationSessionLocked(params: {
        readonly provider: IMetadataProvider;
        readonly context: AppContext;
        readonly actorUser: UserInfo;
        readonly privilegedUser: UserInfo;
        readonly cleanTargetUserId: string;
        readonly requestedTtlMinutes: number | undefined;
        readonly effectiveMode: ImpersonationMode;
        readonly effectiveReadOnly: boolean;
    }): Promise<MJStartUserImpersonationPayload> {
        const {
            provider,
            context,
            actorUser,
            privilegedUser,
            cleanTargetUserId,
            requestedTtlMinutes,
            effectiveMode,
            effectiveReadOnly,
        } = params;
        const rv = RunView.FromMetadataProvider(provider);

        try {
            // Live DB read (BypassCache: true) to defeat stale UserCache / role-grant TOCTOU races!
            const [targetUserRes, targetRolesRes, liveAuthMeta] = await Promise.all([
                rv.RunView<UserQueryRow>(
                    {
                        EntityName: 'MJ: Users',
                        ExtraFilter: `ID = '${EscapeSQLString(cleanTargetUserId)}'`,
                        Fields: ['ID', 'Name', 'FirstName', 'LastName', 'Email', 'Title', 'Type', 'IsActive'],
                        MaxRows: 1,
                        BypassCache: true,
                        ResultType: 'simple',
                    },
                    privilegedUser
                ),
                rv.RunView<UserRoleQueryRow>(
                    {
                        EntityName: 'MJ: User Roles',
                        ExtraFilter: `UserID = '${EscapeSQLString(cleanTargetUserId)}'`,
                        Fields: ['UserID', 'RoleID', 'Role'],
                        BypassCache: true,
                        ResultType: 'simple',
                    },
                    privilegedUser
                ),
                this.loadLiveAuthorizationMetadata(provider, privilegedUser),
            ]);

            if (!targetUserRes.Success || !targetRolesRes.Success) {
                return {
                    Success: false,
                    ResultCode: 'INTERNAL_ERROR',
                    Message: 'Unable to verify target user eligibility (live user or role lookup failed).',
                };
            }

            const targetRow = targetUserRes.Results?.[0];
            if (!targetRow || targetRow.IsActive === false) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: 'Target user was not found or is inactive.',
                };
            }

            // Merge live DB roles with UserCache roles so privilege promotion in EITHER store fails closed.
            const cachedTarget = UserCache.Instance?.UserByID?.(cleanTargetUserId);
            if (cachedTarget && cachedTarget.IsActive === false) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: 'Target user was not found or is inactive.',
                };
            }

            const roleNameSet = new Set<string>();
            const roleIdSet = new Set<string>();
            const roleIdsByLowerName = new Map<string, string>();
            for (const r of provider.Roles ?? []) {
                if (r.Name && r.ID) {
                    roleIdsByLowerName.set(r.Name.trim().toLowerCase(), NormalizeUUID(r.ID));
                }
            }

            for (const r of targetRolesRes.Results ?? []) {
                const rn = r.Role?.trim();
                if (rn) {
                    roleNameSet.add(rn);
                    const mappedId = roleIdsByLowerName.get(rn.toLowerCase());
                    if (mappedId) {
                        roleIdSet.add(mappedId);
                    }
                }
                if (r.RoleID && IsValidUUID(r.RoleID)) {
                    roleIdSet.add(NormalizeUUID(r.RoleID));
                }
            }
            for (const ur of cachedTarget?.UserRoles ?? []) {
                const rn = ur.Role?.trim();
                if (rn) {
                    roleNameSet.add(rn);
                }
                if (ur.RoleID && IsValidUUID(ur.RoleID)) {
                    roleIdSet.add(NormalizeUUID(ur.RoleID));
                }
            }

            const roleNames = Array.from(roleNameSet).sort((a, b) => a.localeCompare(b));
            const effectiveType =
                (cachedTarget?.Type ?? '').trim().toLowerCase() === 'owner' ||
                (cachedTarget?.Type ?? '').trim().toLowerCase() === 'system'
                    ? cachedTarget?.Type
                    : targetRow.Type;

            const eligibility = EvaluateTargetImpersonationEligibility(
                {
                    ID: targetRow.ID,
                    Name: targetRow.Name,
                    Email: targetRow.Email,
                    Type: effectiveType,
                    IsActive: targetRow.IsActive,
                    RoleNames: roleNames,
                    RoleIDs: roleIdSet,
                },
                {
                    actorUserId: actorUser.ID,
                    systemUserId: privilegedUser.ID,
                    authorizations: liveAuthMeta.authorizations,
                    authorizationRoles: liveAuthMeta.authorizationRoles,
                }
            );

            if (!eligibility.Eligible) {
                if (eligibility.Code === 'FORBIDDEN_TARGET') {
                    await this.tryWriteAuditLog(provider, privilegedUser, context, {
                        auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Denied,
                        status: 'Failed',
                        actorUserId: actorUser.ID,
                        targetUserId: cleanTargetUserId,
                        description: `Denied MJStartUserImpersonation: ${eligibility.Reason}`,
                        details: {
                            action: 'MJStartUserImpersonation',
                            resultCode: eligibility.Code,
                            actorUserId: actorUser.ID,
                            targetUserId: cleanTargetUserId,
                            targetRoles: roleNames,
                            reason: eligibility.Reason,
                        },
                    });
                }
                return {
                    Success: false,
                    ResultCode: eligibility.Code,
                    Message: eligibility.Reason,
                };
            }

            const engine = this.getApiKeyEngine();
            await engine.Config(false, privilegedUser, provider);

            // Resolve least-privilege scopes (NEVER full_access!)
            const desiredScopePaths = effectiveReadOnly
                ? [...IMPERSONATION_READ_ONLY_ALLOWED_SCOPES]
                : [...IMPERSONATION_READ_ONLY_ALLOWED_SCOPES, ...IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES];
            const scopeByPath = new Map<string, string>();
            for (const s of engine.Scopes ?? []) {
                if (s.FullPath && s.ID && s.FullPath !== 'full_access') {
                    scopeByPath.set(s.FullPath, s.ID);
                }
            }
            const allowScopeIds = desiredScopePaths
                .map((p) => scopeByPath.get(p))
                .filter((id): id is string => Boolean(id));

            if (allowScopeIds.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'CONFIGURATION_ERROR',
                    Message: 'Required read/entity API scopes are not configured in APIKeyEngine.',
                };
            }

            // Require an active MJAPI application row BEFORE minting so an impersonation key can
            // NEVER be minted without an explicit MJAPI application binding (prevents MCP/A2A replay).
            const mjApiApp = (engine.Applications ?? []).find(
                (app) => app.Name?.trim().toLowerCase() === 'mjapi' && app.IsActive !== false
            );
            if (!mjApiApp?.ID) {
                return {
                    Success: false,
                    ResultCode: 'CONFIGURATION_ERROR',
                    Message: "Required 'MJAPI' API application is not configured; refusing to mint an unbound impersonation key.",
                };
            }

            // Single-active-key enforcement per actor: revoke any prior impersonation keys minted by actorUser.
            await this.revokeExistingActorImpersonationKeys(engine, provider, privilegedUser, actorUser.ID);

            const ttlMinutes = ClampUserImpersonationTtlMinutes(requestedTtlMinutes);
            const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
            const actorEmail = (actorUser.Email ?? actorUser.Name ?? actorUser.ID).trim();
            const targetEmail = (targetRow.Email ?? targetRow.Name ?? cleanTargetUserId).trim();
            const label = BuildImpersonationKeyLabel(effectiveMode, actorUser.ID, cleanTargetUserId);

            const created = await WithImpersonationKeyMintScope(() =>
                engine.CreateAPIKey(
                    {
                        UserId: cleanTargetUserId,
                        Label: label,
                        Description: `Temporary ${effectiveMode} (${effectiveReadOnly ? 'Read-Only' : 'Write-Enabled'}) user impersonation session initiated by ${actorUser.ID}.`,
                        ExpiresAt: expiresAt,
                    },
                    privilegedUser,
                    provider
                )
            );

            if (!created.Success || !created.RawKey || !created.APIKeyId) {
                return {
                    Success: false,
                    ResultCode: 'KEY_MINT_FAILED',
                    Message: created.Error ?? 'Failed to create temporary impersonation API key.',
                };
            }

            // Bind exclusively to MJAPI so the key cannot replay on MCP/A2A servers.
            const appBinding = await provider.GetEntityObject<MJAPIKeyApplicationEntity>(
                'MJ: API Key Applications',
                privilegedUser
            );
            appBinding.NewRecord();
            appBinding.APIKeyID = created.APIKeyId;
            appBinding.ApplicationID = mjApiApp.ID;
            if (!(await appBinding.Save())) {
                await this.revokeImpersonationKey(engine, provider, privilegedUser, created.APIKeyId, {
                    deleteKeyRowOnRollback: true,
                });
                return {
                    Success: false,
                    ResultCode: 'KEY_SCOPE_FAILED',
                    Message: 'Failed to bind temporary impersonation key to MJAPI application.',
                };
            }

            // 1. Attach explicit least-privilege Allow scope rules (Priority = 10, IsDeny = false)
            for (const scopeId of allowScopeIds) {
                const scopeEntity = await provider.GetEntityObject<MJAPIKeyScopeEntity>(
                    'MJ: API Key Scopes',
                    privilegedUser
                );
                scopeEntity.NewRecord();
                scopeEntity.APIKeyID = created.APIKeyId;
                scopeEntity.ScopeID = scopeId;
                scopeEntity.ResourcePattern = '*';
                scopeEntity.PatternType = 'Include';
                scopeEntity.IsDeny = false;
                scopeEntity.Priority = 10;

                if (!(await scopeEntity.Save())) {
                    await this.revokeImpersonationKey(engine, provider, privilegedUser, created.APIKeyId, {
                        deleteKeyRowOnRollback: true,
                    });
                    return {
                        Success: false,
                        ResultCode: 'KEY_SCOPE_FAILED',
                        Message: 'Failed to attach least-privilege scopes to temporary impersonation key.',
                    };
                }
            }

            // 2. Attach high-priority Deny scope rules (Priority = 1000, IsDeny = true) for sensitive entities
            const denyScopePathsToAttach = effectiveReadOnly
                ? ['view:run', 'entity:read']
                : [...IMPERSONATION_ENTITY_DENY_SCOPE_PATHS];
            for (const denyPath of denyScopePathsToAttach) {
                const denyScopeId = scopeByPath.get(denyPath);
                if (!denyScopeId) {
                    continue;
                }
                const denyEntity = await provider.GetEntityObject<MJAPIKeyScopeEntity>(
                    'MJ: API Key Scopes',
                    privilegedUser
                );
                denyEntity.NewRecord();
                denyEntity.APIKeyID = created.APIKeyId;
                denyEntity.ScopeID = denyScopeId;
                denyEntity.ResourcePattern = IMPERSONATION_SENSITIVE_ENTITY_DENY_PATTERN;
                denyEntity.PatternType = 'Include';
                denyEntity.IsDeny = true;
                denyEntity.Priority = 1000;

                if (!(await denyEntity.Save())) {
                    await this.revokeImpersonationKey(engine, provider, privilegedUser, created.APIKeyId, {
                        deleteKeyRowOnRollback: true,
                    });
                    return {
                        Success: false,
                        ResultCode: 'KEY_SCOPE_FAILED',
                        Message: 'Failed to attach sensitive-entity deny scopes to temporary impersonation key.',
                    };
                }
            }

            // Cross-replica concurrent-mint mitigation: revoke any competing sibling impersonation key
            // minted for the same actor while this request was in flight (skipping the newly minted key).
            await this.revokeExistingActorImpersonationKeys(
                engine,
                provider,
                privilegedUser,
                actorUser.ID,
                created.APIKeyId
            );

            try {
                await engine.RefreshCache(privilegedUser);
            } catch {
                // Non-fatal in mock environments
            }

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

            // 3. MANDATORY FAIL-CLOSED AUDIT LOG: must succeed BEFORE returning RawApiKey!
            // NOTE: RawApiKey is NEVER written to audit details or logs.
            const auditSucceeded = await this.writeAuditLogStrict(provider, privilegedUser, context, {
                auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Started,
                status: 'Success',
                actorUserId: actorUser.ID,
                targetUserId: cleanTargetUserId,
                authorizationName: effectiveReadOnly
                    ? USER_IMPERSONATION_AUTHORIZATION_NAME
                    : USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME,
                description: `Started ${effectiveMode} (${effectiveReadOnly ? 'Read-Only' : 'Write-Enabled'}) user impersonation as ${targetUser.Name} (${targetEmail})`,
                details: {
                    action: 'MJStartUserImpersonation',
                    actorUserId: actorUser.ID,
                    actorEmail,
                    targetUserId: cleanTargetUserId,
                    targetEmail,
                    apiKeyId: created.APIKeyId,
                    mode: effectiveMode,
                    readOnly: effectiveReadOnly,
                    ttlMinutes,
                    expiresAt: expiresAt.toISOString(),
                },
            });

            if (!auditSucceeded) {
                await this.revokeImpersonationKey(engine, provider, privilegedUser, created.APIKeyId, {
                    deleteKeyRowOnRollback: true,
                });
                return {
                    Success: false,
                    ResultCode: 'AUDIT_LOG_FAILED',
                    Message: 'Impersonation session aborted because mandatory audit log persistence failed.',
                };
            }

            return {
                Success: true,
                ResultCode: 'IMPERSONATION_STARTED',
                Message: effectiveReadOnly
                    ? `Now viewing as ${targetUser.Name} (Read-Only).`
                    : `Now acting as ${targetUser.Name} (Write Mode Enabled).`,
                RawApiKey: created.RawKey,
                APIKeyID: created.APIKeyId,
                ExpiresAt: expiresAt.toISOString(),
                Mode: effectiveMode,
                ReadOnly: effectiveReadOnly,
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

    /**
     * Revokes and deletes a temporary `MJ-Impersonation:` key.
     *
     * Deliberately NOT gated on `MJ_ENABLE_USER_IMPERSONATION`: if an operator flips the kill switch
     * off mid-incident, active impersonation keys can STILL be cleanly revoked and purged!
     */
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
                    BypassCache: true,
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

            const parsedLabel = ParseImpersonationKeyLabel(keyRow.Label);
            if (!parsedLabel) {
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN',
                    Message: 'Only temporary user impersonation keys may be revoked via this mutation.',
                };
            }

            // Server-verified mint check: require a valid v1 label matching keyRow.UserID AND a
            // server-persisted "User Impersonation Started" audit record proving this resolver
            // actually minted the key for (actorUserId, targetUserId). Prevents an attacker who
            // somehow forged an MJ-Impersonation: label from spoofing an "Ended" audit row naming an admin.
            const labelStructurallyValid = Boolean(
                parsedLabel.format === 'v1' &&
                parsedLabel.actorUserId &&
                parsedLabel.targetUserId &&
                keyRow.UserID &&
                UUIDsEqual(parsedLabel.targetUserId, keyRow.UserID) &&
                !UUIDsEqual(parsedLabel.actorUserId, keyRow.UserID)
            );
            const verifiedMintActorId = labelStructurallyValid && parsedLabel.actorUserId && keyRow.UserID
                ? await this.verifyResolverMintedImpersonationKey(
                      provider,
                      privilegedUser,
                      cleanApiKeyId,
                      parsedLabel.actorUserId,
                      keyRow.UserID
                  )
                : null;
            if (!verifiedMintActorId) {
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN',
                    Message: 'This API key does not have a verified server-minted impersonation session record.',
                };
            }

            const callerApiKeyId = parseCleanUuid(context.userPayload?.apiKeyId);
            const isSameImpersonationKey = Boolean(callerApiKeyId && UUIDsEqual(callerApiKeyId, cleanApiKeyId));

            // Allow revocation when:
            // 1. Caller is self-revoking the exact active impersonation key, OR
            // 2. Caller is a non-API-key human session who EITHER originally minted this key (verifiedMintActorId match)
            //    OR holds `Allow` on `User Impersonation` — even if `MJ_ENABLE_USER_IMPERSONATION` was just turned off!
            let isAuthorizedActorSession = false;
            if (
                !callerApiKeyId &&
                !context.HasRawApiKeyHeader &&
                !context.userPayload?.isSystemUser &&
                !GetImpersonationSession(context.userPayload)
            ) {
                const isOriginalMintingActor = UUIDsEqual(verifiedMintActorId, actorUser.ID);
                const holdsImpersonationGrant = EvaluateUserImpersonationAuthorization(
                    actorUser,
                    provider
                ).Allowed;
                isAuthorizedActorSession = isOriginalMintingActor || holdsImpersonationGrant;
            }

            if (!isSameImpersonationKey && !isAuthorizedActorSession) {
                if (this.shouldWriteDeniedAuditLog(actorUser.ID)) {
                    await this.tryWriteAuditLog(provider, privilegedUser, context, {
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
                }
                return {
                    Success: false,
                    ResultCode: 'FORBIDDEN',
                    Message: 'Caller is not authorized to end this impersonation session.',
                };
            }

            const engine = this.getApiKeyEngine();
            await this.revokeImpersonationKey(engine, provider, privilegedUser, cleanApiKeyId);

            await this.tryWriteAuditLog(provider, privilegedUser, context, {
                auditTypeName: USER_IMPERSONATION_AUDIT_LOG_TYPES.Ended,
                status: 'Success',
                actorUserId: verifiedMintActorId,
                targetUserId: keyRow.UserID ?? parsedLabel.targetUserId ?? actorUser.ID,
                description: `Ended user impersonation session (key ${cleanApiKeyId})`,
                details: {
                    action: 'MJEndUserImpersonation',
                    actorUserId: verifiedMintActorId,
                    invokedByUserId: actorUser.ID,
                    apiKeyId: cleanApiKeyId,
                    targetUserId: keyRow.UserID ?? parsedLabel.targetUserId ?? null,
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

    private async loadLiveAuthorizationMetadata(
        provider: IMetadataProvider,
        privilegedUser: UserInfo
    ): Promise<{
        readonly authorizations: readonly AuthorizationInfo[];
        readonly authorizationRoles: readonly AuthorizationRoleInfo[];
    }> {
        const rv = RunView.FromMetadataProvider(provider);
        const [authRes, authRolesRes] = await Promise.all([
            rv.RunView<AuthorizationQueryRow>(
                {
                    EntityName: 'MJ: Authorizations',
                    Fields: ['ID', 'Name', 'ParentID', 'IsActive', 'UseAuditLog'],
                    BypassCache: true,
                    ResultType: 'simple',
                },
                privilegedUser
            ),
            rv.RunView<AuthorizationRoleQueryRow>(
                {
                    EntityName: 'MJ: Authorization Roles',
                    Fields: ['ID', 'AuthorizationID', 'RoleID', 'Type'],
                    BypassCache: true,
                    ResultType: 'simple',
                },
                privilegedUser
            ),
        ]);

        if (!authRes.Success || !authRolesRes.Success) {
            throw new Error(
                authRes.ErrorMessage ||
                    authRolesRes.ErrorMessage ||
                    'Failed to query live authorization metadata.'
            );
        }

        const liveAuths =
            authRes.Results && authRes.Results.length > 0
                ? authRes.Results.map((r) => new AuthorizationInfo(r))
                : (provider.Authorizations ?? []);
        const liveAuthRoles =
            authRolesRes.Results && authRolesRes.Results.length > 0
                ? authRolesRes.Results.map((r) => new AuthorizationRoleInfo(r))
                : (provider.AuthorizationRoles ?? []);

        return {
            authorizations: liveAuths,
            authorizationRoles: liveAuthRoles,
        };
    }

    private async loadImpersonatableUsers(
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        actorUserId: string
    ): Promise<MJImpersonatableUser[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const [usersRes, userRolesRes, liveAuthMeta] = await Promise.all([
            rv.RunView<UserQueryRow>(
                {
                    EntityName: 'MJ: Users',
                    ExtraFilter: 'IsActive = 1',
                    Fields: ['ID', 'Name', 'FirstName', 'LastName', 'Email', 'Title', 'Type', 'IsActive'],
                    BypassCache: true,
                    ResultType: 'simple',
                },
                privilegedUser
            ),
            rv.RunView<UserRoleQueryRow>(
                {
                    EntityName: 'MJ: User Roles',
                    Fields: ['UserID', 'RoleID', 'Role'],
                    BypassCache: true,
                    ResultType: 'simple',
                },
                privilegedUser
            ),
            this.loadLiveAuthorizationMetadata(provider, privilegedUser),
        ]);

        if (!usersRes.Success || !userRolesRes.Success) {
            throw new Error(
                usersRes.ErrorMessage || userRolesRes.ErrorMessage || 'Failed to query active users or user roles.'
            );
        }

        const roleIdsByLowerName = new Map<string, string>();
        for (const r of provider.Roles ?? []) {
            if (r.Name && r.ID) {
                roleIdsByLowerName.set(r.Name.trim().toLowerCase(), NormalizeUUID(r.ID));
            }
        }

        const rolesByUserId = new Map<string, Set<string>>();
        const roleIdsByUserId = new Map<string, Set<string>>();
        for (const row of userRolesRes.Results ?? []) {
            if (!row.UserID || !IsValidUUID(row.UserID)) {
                continue;
            }
            const userKey = NormalizeUUID(row.UserID);
            const roleName = row.Role?.trim();
            if (roleName) {
                let nameSet = rolesByUserId.get(userKey);
                if (!nameSet) {
                    nameSet = new Set<string>();
                    rolesByUserId.set(userKey, nameSet);
                }
                nameSet.add(roleName);

                const mappedRoleId = roleIdsByLowerName.get(roleName.toLowerCase());
                if (mappedRoleId) {
                    let idSet = roleIdsByUserId.get(userKey);
                    if (!idSet) {
                        idSet = new Set<string>();
                        roleIdsByUserId.set(userKey, idSet);
                    }
                    idSet.add(mappedRoleId);
                }
            }
            if (row.RoleID && IsValidUUID(row.RoleID)) {
                let idSet = roleIdsByUserId.get(userKey);
                if (!idSet) {
                    idSet = new Set<string>();
                    roleIdsByUserId.set(userKey, idSet);
                }
                idSet.add(NormalizeUUID(row.RoleID));
            }
        }

        const results: MJImpersonatableUser[] = [];
        for (const row of usersRes.Results ?? []) {
            if (!row.ID || !IsValidUUID(row.ID)) {
                continue;
            }
            const normId = NormalizeUUID(row.ID);
            const roles = Array.from(rolesByUserId.get(normId) ?? []).sort((a, b) => a.localeCompare(b));
            const roleIds = roleIdsByUserId.get(normId) ?? new Set<string>();

            const eligibility = EvaluateTargetImpersonationEligibility(
                {
                    ID: row.ID,
                    Name: row.Name,
                    Email: row.Email,
                    Type: row.Type,
                    IsActive: row.IsActive,
                    RoleNames: roles,
                    RoleIDs: roleIds,
                },
                {
                    actorUserId,
                    systemUserId: privilegedUser.ID,
                    authorizations: liveAuthMeta.authorizations,
                    authorizationRoles: liveAuthMeta.authorizationRoles,
                }
            );
            if (!eligibility.Eligible) {
                continue;
            }

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

    /**
     * Verifies that `apiKeyId` was genuinely minted by `UserImpersonationResolver` by checking
     * `MJ: Audit Logs` for a persisted `User Impersonation Started` (`Status = 'Success'`) row
     * matching `(actorUserId, targetUserId, apiKeyId)`. Returns the verified actor UUID or `null`.
     */
    private async verifyResolverMintedImpersonationKey(
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        apiKeyId: string,
        expectedActorUserId: string,
        expectedTargetUserId: string
    ): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(provider);
        let startedTypeId: string | undefined = provider.AuditLogTypes?.find(
            (t) => t?.Name?.trim().toLowerCase() === USER_IMPERSONATION_AUDIT_LOG_TYPES.Started.toLowerCase()
        )?.ID;
        if (!startedTypeId) {
            const typesRes = await rv.RunView<AuditLogTypeRow>(
                {
                    EntityName: 'MJ: Audit Log Types',
                    Fields: ['ID', 'Name'],
                    MaxRows: 200,
                    BypassCache: true,
                    ResultType: 'simple',
                },
                privilegedUser
            );
            startedTypeId = (typesRes.Success ? typesRes.Results ?? [] : []).find(
                (t) => t.Name?.trim().toLowerCase() === USER_IMPERSONATION_AUDIT_LOG_TYPES.Started.toLowerCase()
            )?.ID;
        }
        if (!startedTypeId) {
            return null;
        }

        const auditRes = await rv.RunView<{ ID?: string; UserID?: string | null; RecordID?: string | null; Details?: string | null }>(
            {
                EntityName: 'MJ: Audit Logs',
                ExtraFilter: `AuditLogTypeID = '${EscapeSQLString(startedTypeId)}' AND UserID = '${EscapeSQLString(expectedActorUserId)}' AND RecordID = '${EscapeSQLString(expectedTargetUserId)}' AND Status = 'Success'`,
                Fields: ['ID', 'UserID', 'RecordID', 'Details'],
                BypassCache: true,
                ResultType: 'simple',
            },
            privilegedUser
        );
        if (!auditRes.Success) {
            return null;
        }

        for (const row of auditRes.Results ?? []) {
            if (!row.Details) {
                continue;
            }
            try {
                const parsed: unknown = JSON.parse(row.Details);
                if (parsed && typeof parsed === 'object') {
                    const detailsObj = parsed as Record<string, unknown>;
                    const loggedKeyId = typeof detailsObj['apiKeyId'] === 'string' ? detailsObj['apiKeyId'].trim() : '';
                    const loggedAction = detailsObj['action'];
                    if (
                        loggedAction === 'MJStartUserImpersonation' &&
                        loggedKeyId &&
                        UUIDsEqual(loggedKeyId, apiKeyId)
                    ) {
                        return NormalizeUUID(expectedActorUserId);
                    }
                }
            } catch {
                // Ignore malformed audit details
            }
        }
        return null;
    }

    /**
     * Enforces single-active-key per actor: revokes any existing active `MJ-Impersonation:v1:`
     * keys previously minted by `actorUserId` (optionally excluding `keepApiKeyId` for post-mint
     * cross-replica sibling sweeps). Preserves the revoked `MJ: API Keys` row for forensic history.
     */
    private async revokeExistingActorImpersonationKeys(
        engine: APIKeyEngine,
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        actorUserId: string,
        keepApiKeyId?: string
    ): Promise<void> {
        const likePattern = BuildActorImpersonationKeyLikePattern(actorUserId);
        if (!likePattern) {
            return;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const existingRes = await rv.RunView<ApiKeyLabelRow>(
            {
                EntityName: 'MJ: API Keys',
                ExtraFilter: `Label LIKE '${likePattern}'`,
                Fields: ['ID', 'Label', 'Status'],
                BypassCache: true,
                ResultType: 'simple',
            },
            privilegedUser
        );
        if (!existingRes.Success) {
            return;
        }
        for (const existing of existingRes.Results ?? []) {
            if (keepApiKeyId && existing.ID && UUIDsEqual(existing.ID, keepApiKeyId)) {
                continue;
            }
            if (existing.Status && existing.Status.trim().toLowerCase() === 'revoked') {
                continue;
            }
            const parsed = ParseImpersonationKeyLabel(existing.Label);
            if (
                existing.ID &&
                parsed?.format === 'v1' &&
                parsed.actorUserId &&
                UUIDsEqual(parsed.actorUserId, actorUserId)
            ) {
                await this.revokeImpersonationKey(engine, provider, privilegedUser, existing.ID);
            }
        }
    }

    /**
     * Revokes a temporary impersonation key, strips its scope/application bindings, immediately closes
     * any active GraphQL WebSocket connections authenticated with that key, and refreshes `APIKeyEngine`.
     *
     * By default, **retains** the `MJ: API Keys` row with `Status = 'Revoked'` so forensic audit
     * history remains intact. Pass `deleteKeyRowOnRollback: true` only when rolling back an aborted
     * mint whose `RawApiKey` was never issued.
     */
    private async revokeImpersonationKey(
        engine: APIKeyEngine,
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        apiKeyId: string,
        options?: { readonly deleteKeyRowOnRollback?: boolean }
    ): Promise<void> {
        const cleanId = parseCleanUuid(apiKeyId);
        if (!cleanId) {
            return;
        }

        // 0. Immediately sever any active GraphQL WebSocket connections authenticated with this key.
        CloseImpersonationWebSockets(cleanId);

        const rv = RunView.FromMetadataProvider(provider);

        // 1. Delete all MJ: API Key Scopes bound to this temporary key
        try {
            const scopesRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: API Key Scopes',
                    ExtraFilter: `APIKeyID = '${EscapeSQLString(cleanId)}'`,
                    Fields: ['ID'],
                    BypassCache: true,
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
                        `Impersonation key cleanup: failed to delete scope ${scopeRow.ID}: ${err instanceof Error ? err.message : String(err)}`
                    );
                }
            }
        } catch {
            // Continue revocation
        }

        // 2. Delete all MJ: API Key Applications bound to this temporary key
        try {
            const appBindingsRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: API Key Applications',
                    ExtraFilter: `APIKeyID = '${EscapeSQLString(cleanId)}'`,
                    Fields: ['ID'],
                    BypassCache: true,
                    ResultType: 'simple',
                },
                privilegedUser
            );
            for (const appRow of appBindingsRes.Success ? appBindingsRes.Results ?? [] : []) {
                try {
                    const appEntity = await provider.GetEntityObject<MJAPIKeyApplicationEntity>(
                        'MJ: API Key Applications',
                        privilegedUser
                    );
                    if (await appEntity.Load(appRow.ID)) {
                        await appEntity.Delete();
                    }
                } catch {
                    // Continue revocation
                }
            }
        } catch {
            // Continue revocation
        }

        // 3. Revoke via APIKeyEngine (immediately marks Status='Revoked' and evicts validation cache)
        try {
            await engine.RevokeAPIKey(cleanId, privilegedUser, provider);
        } catch (err) {
            LogError(
                `Impersonation key cleanup: RevokeAPIKey failed for ${cleanId}: ${err instanceof Error ? err.message : String(err)}`
            );
        }

        // 4. Keep the revoked MJ: API Keys row for forensic history; delete only on aborted-mint rollback.
        if (options?.deleteKeyRowOnRollback) {
            try {
                const keyEntity = await provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', privilegedUser);
                if (await keyEntity.Load(cleanId)) {
                    await keyEntity.Delete();
                }
            } catch {
                // Non-fatal: key is already Revoked with 0 scopes and cache-evicted.
            }
        }

        try {
            await engine.RefreshCache(privilegedUser);
        } catch {
            // Best-effort cache refresh
        }
    }

    /**
     * Strict fail-closed audit log writer used by `MJStartUserImpersonation`.
     * Returns `true` ONLY if the `MJ: Audit Logs` row is resolved and persisted (`Save() === true`).
     */
    private async writeAuditLogStrict(
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        context: AppContext,
        params: {
            readonly auditTypeName: string;
            readonly status: 'Success' | 'Failed';
            readonly actorUserId: string;
            readonly targetUserId: string;
            readonly authorizationName?: string;
            readonly description: string;
            readonly details: Record<string, unknown>;
        }
    ): Promise<boolean> {
        try {
            const auditEntityMeta = provider.Entities?.find((e) => e.Name === 'MJ: Audit Logs');
            if (!auditEntityMeta) {
                return false;
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
                        MaxRows: 200,
                        BypassCache: true,
                        ResultType: 'simple',
                    },
                    privilegedUser
                );
                const types = typesRes.Success ? typesRes.Results ?? [] : [];
                auditTypeId = types.find(
                    (t) => t.Name?.trim().toLowerCase() === params.auditTypeName.toLowerCase()
                )?.ID;
            }

            if (!auditTypeId) {
                return false;
            }

            const sanitizedDetails: Record<string, unknown> = {
                ...params.details,
                ipAddress: context.ClientIp ?? null,
                userAgent: context.UserAgent ?? null,
                requestOrigin: context.RequestOrigin ?? null,
            };
            // Defense-in-depth: guarantee raw key fields can NEVER enter AuditLog.Details
            delete sanitizedDetails['RawApiKey'];
            delete sanitizedDetails['rawApiKey'];
            delete sanitizedDetails['RawKey'];

            const auditLog = await provider.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', privilegedUser);
            auditLog.NewRecord();
            auditLog.UserID = params.actorUserId;
            auditLog.AuditLogTypeID = auditTypeId;
            if (params.authorizationName) {
                const matchedAuth = provider.Authorizations?.find(
                    (a) => a.Name?.trim().toLowerCase() === params.authorizationName!.toLowerCase()
                );
                if (matchedAuth?.ID) {
                    auditLog.AuthorizationID = matchedAuth.ID;
                }
            }
            auditLog.Status = params.status;
            auditLog.Description = params.description;
            auditLog.Details = JSON.stringify(sanitizedDetails);
            const usersEntity = provider.Entities?.find((e) => e.Name === 'MJ: Users');
            auditLog.EntityID = usersEntity?.ID ?? null;
            auditLog.RecordID = params.targetUserId;
            return Boolean(await auditLog.Save());
        } catch (err) {
            LogError(
                `UserImpersonationResolver mandatory audit log write failed: ${err instanceof Error ? err.message : String(err)}`
            );
            return false;
        }
    }

    /**
     * Best-effort audit writer for Denied / Ended events (must not block revocation or mask denials).
     */
    private async tryWriteAuditLog(
        provider: IMetadataProvider,
        privilegedUser: UserInfo,
        context: AppContext,
        params: {
            readonly auditTypeName: string;
            readonly status: 'Success' | 'Failed';
            readonly actorUserId: string;
            readonly targetUserId: string;
            readonly description: string;
            readonly details: Record<string, unknown>;
        }
    ): Promise<void> {
        await this.writeAuditLogStrict(provider, privilegedUser, context, params);
    }
}
