import { AsyncLocalStorage } from 'node:async_hooks';
import type { ApolloServerPlugin } from '@apollo/server';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { GraphQLError, getOperationAST, parse, type OperationDefinitionNode } from 'graphql';
import { AuthorizationError } from 'type-graphql';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import {
    AuthorizationEvaluator,
    AuthorizationInfo,
    AuthorizationRoleInfo,
    AuthorizationRoleType,
    BaseEntity,
    IsPlatformSQL,
    Metadata,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunView,
    ServerOperationScopeManager,
    WellKnownUserSource,
    type IMetadataProvider,
    type PlatformSQL,
    type PostRunViewHook,
    type PreDeleteHook,
    type PreRunViewHook,
    type PreSaveHook,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
    GetGlobalObjectStore,
    IndexByUUID,
    IsValidUUID,
    NormalizeUUID,
    UUIDsEqual,
} from '@memberjunction/global';
import type { AppContext, UserPayload } from '../types.js';
import {
    IsUserImpersonationEnabled,
    IsUserImpersonationWritesEnabled,
    ResolveUserImpersonationConfig,
    type UserImpersonationConfig,
} from '../userImpersonationConfigUnits.js';

/** Canonical `MJ: Authorizations` row required for Read-Only (`ViewAs`) user impersonation. */
export const USER_IMPERSONATION_AUTHORIZATION_NAME = 'User Impersonation';

/**
 * Canonical child `MJ: Authorizations` row required for optional write-enabled (`ActAs`) impersonation.
 * Evaluated strictly for a DIRECT `Allow` grant (never inherited from parent `User Impersonation`!).
 */
export const USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME = 'User Impersonation: Act As (Allow Writes)';

/** Prefix stamped onto every temporary API key minted by `UserImpersonationResolver`. */
export const USER_IMPERSONATION_KEY_LABEL_PREFIX = 'MJ-Impersonation:';

/** Structured v1 label prefix (`MJ-Impersonation:v1:<RO|RW>:<actorUserUUID>:<targetUserUUID>`). */
export const USER_IMPERSONATION_KEY_LABEL_V1_PREFIX = 'MJ-Impersonation:v1:';

/** Execution mode of an impersonation session. `'ViewAs'` (Read-Only) is the strict default. */
export type ImpersonationMode = 'ViewAs' | 'ActAs';

/** Immutable server-stamped impersonation metadata attached to `UserPayload` and `UserInfo`. */
export interface ImpersonationSessionInfo {
    readonly isImpersonating: true;
    readonly apiKeyId: string;
    readonly mode: ImpersonationMode;
    readonly readOnly: boolean;
    readonly actorUserId: string | null;
    readonly targetUserId: string;
    readonly expiresAtMs?: number;
}

export interface ParsedImpersonationKeyLabel {
    readonly isImpersonation: true;
    readonly format: 'v1' | 'legacy';
    readonly mode: ImpersonationMode;
    readonly readOnly: boolean;
    readonly actorUserId: string | null;
    readonly targetUserId: string | null;
}

/**
 * Security-critical entities that NO impersonation session (`ViewAs` OR `ActAs`) may EVER read or write.
 * Lowercase normalized names for O(1) comparison.
 */
export const IMPERSONATION_FORBIDDEN_ENTITY_NAMES: ReadonlyArray<string> = Object.freeze([
    // API Keys & Scopes
    'MJ: API Keys',
    'MJ: API Key Scopes',
    'MJ: API Key Applications',
    'MJ: API Key Usage Logs',
    // Credentials, Encryption & OAuth Secrets
    'MJ: Credentials',
    'MJ: Credential Types',
    'MJ: Credential Categories',
    'MJ: AI Agent Credentials',
    'MJ: AI Credential Bindings',
    'MJ: Encryption Keys',
    'MJ: Encryption Key Sources',
    'MJ: O Auth Tokens',
    'MJ: O Auth Authorization States',
    'MJ: O Auth Client Registrations',
    'MJ: O Auth Auth Server Metadata Caches',
    // Audit Trail
    'MJ: Audit Logs',
    'MJ: Audit Log Types',
    // Identity, Roles, Authorizations, Permissions & Capability Links
    'MJ: Users',
    'MJ: Roles',
    'MJ: User Roles',
    'MJ: Authorizations',
    'MJ: Authorization Roles',
    'MJ: Entity Permissions',
    'MJ: Entity Field Permissions',
    'MJ: Authentication Providers',
    'MJ: Magic Link Invites',
    'MJ: Magic Link Invite Roles',
    'MJ: Magic Link Invite Applications',
    'MJ: Magic Link Invite Allowed Domains',
    'MJ: Magic Link Invite Allowed Paths',
    'MJ: Magic Link Redemptions',
    'MJ: Artifact Guest Share Links',
]);

const FORBIDDEN_ENTITY_LOWER_SET: ReadonlySet<string> = new Set(
    IMPERSONATION_FORBIDDEN_ENTITY_NAMES.map((name) => name.trim().toLowerCase())
);

const SAVED_QUERY_SECRET_ENTITY_LOWER_SET: ReadonlySet<string> = new Set([
    'mj: api keys',
    'mj: api key scopes',
    'mj: api key applications',
    'mj: api key usage logs',
    'mj: credentials',
    'mj: credential types',
    'mj: credential categories',
    'mj: ai agent credentials',
    'mj: ai credential bindings',
    'mj: encryption keys',
    'mj: encryption key sources',
    'mj: o auth tokens',
    'mj: o auth authorization states',
    'mj: o auth client registrations',
    'mj: o auth auth server metadata caches',
    'mj: audit logs',
    'mj: audit log types',
    'mj: authentication providers',
    'mj: magic link invites',
    'mj: magic link invite roles',
    'mj: magic link invite applications',
    'mj: magic link invite allowed domains',
    'mj: magic link invite allowed paths',
    'mj: magic link redemptions',
    'mj: artifact guest share links',
]);

/**
 * Scopes granted to a Read-Only (`ViewAs`) impersonation API key.
 * Deliberately omits `full_access`, `apikey:*`, `entity:create|update|delete|merge`,
 * `action:execute`, `agent:execute|cancel|trusted`, `prompt:execute`, `task:execute|cancel`,
 * `communication:send`, `embedding:generate`, and `query:create|update|delete`.
 */
export const IMPERSONATION_READ_ONLY_ALLOWED_SCOPES: ReadonlyArray<string> = Object.freeze([
    'view:run',
    'view:batch',
    'entity:read',
    'query:run',
    'query:read',
    'user:read',
    'dataset:read',
    'datacontext:read',
    'action:read',
    'agent:read',
    'agent:monitor',
    'prompt:read',
    'task:read',
    'communication:read',
]);

/**
 * Additional scopes granted ONLY when minting a triple-gated `ActAs` write-enabled impersonation key.
 * Still NEVER includes `full_access`, `apikey:create`, `apikey:revoke`, or `agent:trusted`!
 */
export const IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES: ReadonlyArray<string> = Object.freeze([
    'entity:create',
    'entity:update',
    'entity:delete',
    'entity:merge',
    'action:execute',
    'agent:execute',
    'agent:cancel',
    'prompt:execute',
    'task:execute',
    'task:cancel',
]);

/**
 * Scopes onto which explicit `Priority = 1000, IsDeny = true` rules are attached for sensitive entities.
 */
export const IMPERSONATION_ENTITY_DENY_SCOPE_PATHS: ReadonlyArray<string> = Object.freeze([
    'view:run',
    'entity:read',
    'entity:create',
    'entity:update',
    'entity:delete',
    'entity:merge',
]);

const IMPERSONATION_HOOKS_REGISTERED_KEY = '___MJServer___ImpersonationDataHooksRegistered';
const INTERNAL_SECURITY_LOOKUP_PARAMS = new WeakSet<object>();
const impersonationByUser = new WeakMap<UserInfo, ImpersonationSessionInfo>();
const currentUserBootstrapStorage = new AsyncLocalStorage<string>();

const V1_LABEL_REGEX =
    /^MJ-Impersonation:v1:(RO|RW):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/i;

/**
 * Builds a deterministic, collision-proof v1 impersonation key label from actor and target UUIDs.
 * UUIDs are fixed-width 36-char hex+hyphen strings — immune to email changes, truncation, or delimiter injection.
 */
export function BuildImpersonationKeyLabel(
    mode: ImpersonationMode,
    actorUserId: string,
    targetUserId: string
): string {
    const cleanActor = actorUserId.trim();
    const cleanTarget = targetUserId.trim();
    if (!IsValidUUID(cleanActor) || !IsValidUUID(cleanTarget)) {
        throw new Error('BuildImpersonationKeyLabel requires valid actorUserId and targetUserId UUIDs.');
    }
    const modeCode = mode === 'ActAs' ? 'RW' : 'RO';
    return `${USER_IMPERSONATION_KEY_LABEL_V1_PREFIX}${modeCode}:${NormalizeUUID(cleanActor)}:${NormalizeUUID(cleanTarget)}`;
}

/**
 * Builds the SQL `LIKE` prefix pattern matching every v1 impersonation key minted by `actorUserId`
 * across both `RO` and `RW` modes (`MJ-Impersonation:v1:%:<actorUuid>:%`).
 */
export function BuildActorImpersonationKeyLikePattern(actorUserId: string): string | null {
    const cleanActor = actorUserId.trim();
    if (!IsValidUUID(cleanActor)) {
        return null;
    }
    return `MJ-Impersonation:v1:%:${EscapeSQLString(NormalizeUUID(cleanActor))}:%`;
}

/**
 * Parses an `MJ: API Keys.Label` value to determine whether it belongs to a temporary user
 * impersonation session. Any legacy or malformed `MJ-Impersonation:*` label fails closed as
 * Read-Only (`ViewAs`) with `readOnly: true`.
 */
export function ParseImpersonationKeyLabel(
    label: string | null | undefined
): ParsedImpersonationKeyLabel | null {
    if (typeof label !== 'string') {
        return null;
    }
    const trimmed = label.trim();
    if (!trimmed.toLowerCase().startsWith(USER_IMPERSONATION_KEY_LABEL_PREFIX.toLowerCase())) {
        return null;
    }
    const match = V1_LABEL_REGEX.exec(trimmed);
    if (match) {
        const modeCode = match[1].toUpperCase();
        const actorId = match[2];
        const targetId = match[3];
        if (IsValidUUID(actorId) && IsValidUUID(targetId)) {
            const isRw = modeCode === 'RW';
            return {
                isImpersonation: true,
                format: 'v1',
                mode: isRw ? 'ActAs' : 'ViewAs',
                readOnly: !isRw,
                actorUserId: NormalizeUUID(actorId),
                targetUserId: NormalizeUUID(targetId),
            };
        }
    }
    // Fail closed: any non-v1 key carrying the MJ-Impersonation: prefix is treated as Read-Only.
    return {
        isImpersonation: true,
        format: 'legacy',
        mode: 'ViewAs',
        readOnly: true,
        actorUserId: null,
        targetUserId: null,
    };
}

/**
 * Stamps immutable impersonation metadata onto a per-request cloned `UserInfo` (never a shared
 * `UserCache` instance!) and returns the frozen descriptor for `UserPayload.impersonationSession`.
 */
export function StampImpersonationSession(
    userRecord: UserInfo,
    input: {
        readonly apiKeyId: string;
        readonly mode: ImpersonationMode;
        readonly readOnly: boolean;
        readonly actorUserId: string | null;
        readonly targetUserId: string;
        readonly expiresAtMs?: number;
    }
): ImpersonationSessionInfo {
    const writesCurrentlyPermitted = IsUserImpersonationWritesEnabled();
    const effectiveReadOnly = input.readOnly || input.mode !== 'ActAs' || !writesCurrentlyPermitted;
    const effectiveMode: ImpersonationMode = effectiveReadOnly ? 'ViewAs' : 'ActAs';
    const frozen: ImpersonationSessionInfo = Object.freeze({
        isImpersonating: true,
        apiKeyId: input.apiKeyId,
        mode: effectiveMode,
        readOnly: effectiveReadOnly,
        actorUserId: input.actorUserId ? NormalizeUUID(input.actorUserId) : null,
        targetUserId: NormalizeUUID(input.targetUserId),
        ...(input.expiresAtMs !== undefined ? { expiresAtMs: input.expiresAtMs } : {}),
    });
    impersonationByUser.set(userRecord, frozen);
    return frozen;
}

/**
 * Preserves any stamped `ImpersonationSessionInfo` when `CloneUserForSessionContext` clones a `UserInfo`.
 */
export function CopyImpersonationSessionToClone(source: UserInfo, clone: UserInfo): void {
    const existing = impersonationByUser.get(source);
    if (existing) {
        impersonationByUser.set(clone, existing);
    }
}

/**
 * Resolves the active `ImpersonationSessionInfo` from either a `UserInfo` or a `UserPayload`,
 * re-evaluating the server write kill-switch dynamically so flipping `MJ_USER_IMPERSONATION_ALLOW_WRITES`
 * off mid-session immediately enforces `readOnly: true` on the next request.
 */
export function GetImpersonationSession(
    subject: UserInfo | UserPayload | null | undefined
): ImpersonationSessionInfo | null {
    if (!subject || typeof subject !== 'object') {
        return null;
    }
    let raw: ImpersonationSessionInfo | undefined;
    if ('userRecord' in subject) {
        const payload = subject as UserPayload;
        raw =
            payload.impersonationSession ??
            (payload.userRecord ? impersonationByUser.get(payload.userRecord as UserInfo) : undefined);
    } else {
        raw = impersonationByUser.get(subject as UserInfo);
    }
    if (!raw) {
        return null;
    }
    if (!raw.readOnly && !IsUserImpersonationWritesEnabled()) {
        return Object.freeze({
            ...raw,
            mode: 'ViewAs' as const,
            readOnly: true,
        });
    }
    return raw;
}

export function IsImpersonationSession(subject: UserInfo | UserPayload | null | undefined): boolean {
    return GetImpersonationSession(subject) !== null;
}

/**
 * Scoped execution wrapper used exclusively by `UserResolver.CurrentUser` so an impersonated
 * session can resolve its OWN `CurrentUser` + `Roles` payload at session bootstrap while keeping
 * `MJ: Users` and `MJ: User Roles` 100% blocked on every other read/write path.
 */
export function WithImpersonationCurrentUserBootstrap<T>(
    targetUserId: string,
    fn: () => Promise<T>
): Promise<T> {
    if (!IsValidUUID(targetUserId)) {
        return fn();
    }
    return currentUserBootstrapStorage.run(NormalizeUUID(targetUserId), fn);
}

export function IsInImpersonationCurrentUserBootstrapFor(userId: string | null | undefined): boolean {
    if (!userId || !IsValidUUID(userId)) {
        return false;
    }
    const activeBootstrapId = currentUserBootstrapStorage.getStore();
    return Boolean(activeBootstrapId && UUIDsEqual(activeBootstrapId, userId));
}

/**
 * Returns `true` when `entityName` is forbidden to an impersonated session (`ViewAs` or `ActAs`),
 * honoring the narrow `CurrentUser` self-bootstrap scope for `MJ: Users` and `MJ: User Roles`.
 */
export function IsEntityForbiddenDuringImpersonation(
    entityName: string | null | undefined,
    contextUser?: UserInfo | null
): boolean {
    if (!entityName) {
        return false;
    }
    const normalized = entityName.trim().toLowerCase();
    if (!FORBIDDEN_ENTITY_LOWER_SET.has(normalized)) {
        return false;
    }
    if (
        (normalized === 'mj: users' || normalized === 'mj: user roles') &&
        contextUser?.ID &&
        IsInImpersonationCurrentUserBootstrapFor(contextUser.ID)
    ) {
        return false;
    }
    return true;
}

/**
 * Returns `true` when a saved `MJ: Queries` definition touches secret, credential, API-key,
 * encryption, OAuth, magic-link, or audit-log entities that an impersonated session must NEVER
 * read even through a role-permitted saved query.
 */
export function IsSavedQueryForbiddenDuringImpersonation(
    queryInfo: {
        readonly SQL?: string | null;
        readonly Entities?: ReadonlyArray<{ readonly Entity?: string | null }> | null;
    } | null | undefined,
    allEntities?: ReadonlyArray<{ readonly Name: string; readonly BaseView?: string | null; readonly BaseTable?: string | null }>
): boolean {
    if (!queryInfo) {
        return false;
    }
    for (const qe of queryInfo.Entities ?? []) {
        const nameLower = (qe.Entity ?? '').trim().toLowerCase();
        if (nameLower && SAVED_QUERY_SECRET_ENTITY_LOWER_SET.has(nameLower)) {
            return true;
        }
    }
    const sqlLower = (queryInfo.SQL ?? '').toLowerCase();
    if (!sqlLower) {
        return false;
    }
    for (const ent of allEntities ?? []) {
        if (!SAVED_QUERY_SECRET_ENTITY_LOWER_SET.has(ent.Name.trim().toLowerCase())) {
            continue;
        }
        const baseView = (ent.BaseView ?? '').trim().toLowerCase();
        const baseTable = (ent.BaseTable ?? '').trim().toLowerCase();
        if ((baseView && sqlLower.includes(baseView)) || (baseTable && sqlLower.includes(baseTable))) {
            return true;
        }
    }
    return false;
}

// ============================================================================
// Authorization & Target Privilege Ceiling Evaluation
// ============================================================================

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

/**
 * Evaluates whether `roleIds` hold an active `Allow` grant (direct or ancestor, with no `Deny`)
 * on `USER_IMPERSONATION_AUTHORIZATION_NAME`.
 */
export function DoRolesHoldImpersonationReadAuthorization(
    userRoleIds: ReadonlySet<string>,
    authorizations: readonly AuthorizationInfo[],
    authorizationRoles: readonly AuthorizationRoleInfo[],
    fallbackUser?: UserInfo
): { readonly Allowed: boolean; readonly Reason: string } {
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
    if (userRoleIds.size === 0) {
        return {
            Allowed: false,
            Reason: `User holds no roles granted the "${USER_IMPERSONATION_AUTHORIZATION_NAME}" authorization.`,
        };
    }

    if (authorizationRoles.length > 0) {
        if (hasDirectGrantType(targetAuth.ID, userRoleIds, authorizationRoles, AuthorizationRoleType.Deny)) {
            return {
                Allowed: false,
                Reason: `User is explicitly denied the "${USER_IMPERSONATION_AUTHORIZATION_NAME}" authorization.`,
            };
        }

        const authById = IndexByUUID([...authorizations]);
        const visited = new Set<string>();
        let node: AuthorizationInfo | undefined = targetAuth;
        while (node && !visited.has(NormalizeUUID(node.ID))) {
            visited.add(NormalizeUUID(node.ID));
            const hasDeny = hasDirectGrantType(node.ID, userRoleIds, authorizationRoles, AuthorizationRoleType.Deny);
            if (hasDeny) {
                return {
                    Allowed: false,
                    Reason: `User is explicitly denied via "${node.Name}".`,
                };
            }
            const hasAllow = hasDirectGrantType(node.ID, userRoleIds, authorizationRoles, AuthorizationRoleType.Allow);
            if (node.IsActive && hasAllow) {
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

    if (fallbackUser) {
        const evaluator = new AuthorizationEvaluator();
        if (evaluator.UserCanExecuteWithAncestors(targetAuth, fallbackUser, [...authorizations])) {
            return {
                Allowed: true,
                Reason: `Authorized via "${targetAuth.Name}".`,
            };
        }
    }
    return {
        Allowed: false,
        Reason: `None of the caller's roles holds an Allow grant for "${USER_IMPERSONATION_AUTHORIZATION_NAME}".`,
    };
}

/**
 * Evaluates whether `userRoleIds` hold a DIRECT active `Allow` grant (with zero `Deny` on leaf or ancestors)
 * on `USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME` (`"User Impersonation: Act As (Allow Writes)"`).
 *
 * CRITICAL SECURITY INVARIANT: Never walks up `ParentID` to inherit `Allow` from `"User Impersonation"`,
 * because `"User Impersonation: Act As (Allow Writes)"` is a child of `"User Impersonation"` in the
 * metadata hierarchy and read-only impersonators MUST NOT automatically inherit write mode!
 */
export function DoRolesHoldImpersonationWriteAuthorization(
    userRoleIds: ReadonlySet<string>,
    authorizations: readonly AuthorizationInfo[],
    authorizationRoles: readonly AuthorizationRoleInfo[]
): { readonly Allowed: boolean; readonly Reason: string } {
    const writeAuth = authorizations.find(
        (a) => a.Name?.trim().toLowerCase() === USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME.toLowerCase()
    );
    if (!writeAuth || !writeAuth.IsActive) {
        return {
            Allowed: false,
            Reason: `Write authorization "${USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME}" is not configured or is inactive.`,
        };
    }
    if (userRoleIds.size === 0 || authorizationRoles.length === 0) {
        return {
            Allowed: false,
            Reason: `Caller holds no direct Allow grant on "${USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME}".`,
        };
    }

    // Check that neither leaf nor any ancestor carries a Deny or is inactive.
    const authById = IndexByUUID([...authorizations]);
    const visited = new Set<string>();
    let node: AuthorizationInfo | undefined = writeAuth;
    while (node && !visited.has(NormalizeUUID(node.ID))) {
        visited.add(NormalizeUUID(node.ID));
        if (!node.IsActive) {
            return {
                Allowed: false,
                Reason: `Authorization "${node.Name}" is inactive.`,
            };
        }
        if (hasDirectGrantType(node.ID, userRoleIds, authorizationRoles, AuthorizationRoleType.Deny)) {
            return {
                Allowed: false,
                Reason: `User is explicitly denied on "${node.Name}".`,
            };
        }
        node = node.ParentID ? authById.Get(node.ParentID) : undefined;
    }

    // Require an explicit DIRECT Allow grant on the write leaf authorization itself!
    const hasDirectWriteAllow = hasDirectGrantType(
        writeAuth.ID,
        userRoleIds,
        authorizationRoles,
        AuthorizationRoleType.Allow
    );
    if (!hasDirectWriteAllow) {
        return {
            Allowed: false,
            Reason: `Caller does not hold a direct Allow grant on "${USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME}".`,
        };
    }

    return {
        Allowed: true,
        Reason: `Authorized for write-mode impersonation via "${writeAuth.Name}".`,
    };
}

export interface TargetEligibilityCandidate {
    readonly ID: string;
    readonly Name?: string | null;
    readonly Email?: string | null;
    readonly Type?: string | null;
    readonly IsActive?: boolean | null;
    readonly RoleNames: readonly string[];
    readonly RoleIDs: ReadonlySet<string>;
}

export interface TargetEligibilityDecision {
    readonly Eligible: boolean;
    readonly Code: 'OK' | 'NOT_FOUND' | 'FORBIDDEN_TARGET';
    readonly Reason: string;
}

/**
 * Evaluates strict anti-escalation & peer-impersonator target eligibility rules:
 * - Rejects missing or inactive (`IsActive === false`) accounts
 * - Rejects `System` accounts (`Type = 'System'`, `Name = 'System'`, matching `systemUserId`, or shared anonymous guest)
 * - Rejects `Owner` accounts (`Type = 'Owner'`)
 * - Rejects self-impersonation (`actorUserId` equals `target.ID`)
 * - Rejects holders of any `protectedTargetRoles` (default: `Administrator`, `Developer`, `Integration`)
 * - Rejects any user whose roles hold `Allow` on `User Impersonation` or `User Impersonation: Act As (Allow Writes)`
 */
export function EvaluateTargetImpersonationEligibility(
    target: TargetEligibilityCandidate | null | undefined,
    options: {
        readonly actorUserId?: string | null;
        readonly systemUserId?: string | null;
        readonly authorizations?: readonly AuthorizationInfo[];
        readonly authorizationRoles?: readonly AuthorizationRoleInfo[];
        readonly configOverride?: Partial<UserImpersonationConfig>;
    }
): TargetEligibilityDecision {
    if (!target || target.IsActive === false) {
        return {
            Eligible: false,
            Code: 'NOT_FOUND',
            Reason: 'Target user was not found or is inactive.',
        };
    }

    if (options.actorUserId && UUIDsEqual(target.ID, options.actorUserId)) {
        return {
            Eligible: false,
            Code: 'FORBIDDEN_TARGET',
            Reason: 'Impersonating your own user account is not permitted.',
        };
    }

    const nameLower = (target.Name ?? '').trim().toLowerCase();
    const typeLower = (target.Type ?? '').trim().toLowerCase();
    const emailLower = (target.Email ?? '').trim().toLowerCase();

    if (
        (options.systemUserId && UUIDsEqual(target.ID, options.systemUserId)) ||
        nameLower === 'system' ||
        typeLower === 'system' ||
        emailLower === 'anonymous@magic-link.local'
    ) {
        return {
            Eligible: false,
            Code: 'FORBIDDEN_TARGET',
            Reason: 'Impersonating the System or synthetic guest user is prohibited.',
        };
    }

    if (typeLower === 'owner') {
        return {
            Eligible: false,
            Code: 'FORBIDDEN_TARGET',
            Reason: 'Impersonating Owner user accounts is prohibited.',
        };
    }

    const resolvedCfg = ResolveUserImpersonationConfig(options.configOverride);
    const protectedRoleSet = new Set(resolvedCfg.protectedTargetRoles.map((r) => r.trim().toLowerCase()));
    const matchedProtectedRole = target.RoleNames.find((rn) => protectedRoleSet.has(rn.trim().toLowerCase()));
    if (matchedProtectedRole) {
        return {
            Eligible: false,
            Code: 'FORBIDDEN_TARGET',
            Reason: `Impersonating users holding the protected "${matchedProtectedRole}" role is prohibited.`,
        };
    }

    const authorizations = options.authorizations ?? [];
    const authorizationRoles = options.authorizationRoles ?? [];
    if (target.RoleIDs.size > 0 && authorizations.length > 0 && authorizationRoles.length > 0) {
        const canImpersonateRead = DoRolesHoldImpersonationReadAuthorization(
            target.RoleIDs,
            authorizations,
            authorizationRoles
        );
        const canImpersonateWrite = DoRolesHoldImpersonationWriteAuthorization(
            target.RoleIDs,
            authorizations,
            authorizationRoles
        );
        if (canImpersonateRead.Allowed || canImpersonateWrite.Allowed) {
            return {
                Eligible: false,
                Code: 'FORBIDDEN_TARGET',
                Reason: 'Impersonating another user who holds User Impersonation privileges is prohibited.',
            };
        }
    }

    return {
        Eligible: true,
        Code: 'OK',
        Reason: 'Target user is eligible for impersonation.',
    };
}

// ============================================================================
// GraphQL Operation Inspection & Transport Guards (Apollo + WebSocket + HTTP)
// ============================================================================

/**
 * True ONLY when `operation` is a `mutation` whose EVERY root selection is `MJEndUserImpersonation`
 * (preventing batched `mutation { MJEndUserImpersonation(...) OtherMutation(...) }` smuggling!).
 */
export function IsOnlyEndImpersonationMutation(
    operation: OperationDefinitionNode | null | undefined
): boolean {
    if (!operation || operation.operation !== 'mutation') {
        return false;
    }
    const selections = operation.selectionSet?.selections ?? [];
    if (selections.length === 0) {
        return false;
    }
    return selections.every(
        (sel) => sel.kind === 'Field' && sel.name.value === 'MJEndUserImpersonation'
    );
}

/**
 * Evaluates whether a resolved GraphQL `OperationDefinitionNode` is permitted for `userPayload`.
 * Shared by the Apollo Server `didResolveOperation` plugin (HTTP) and `graphql-ws` `onSubscribe` (WebSocket).
 */
export function EvaluateGraphQLOperationForImpersonation(
    operation: OperationDefinitionNode | null | undefined,
    userPayload: UserPayload | null | undefined
): GraphQLError | null {
    const session = GetImpersonationSession(userPayload);
    if (!session) {
        return null;
    }

    if (session.expiresAtMs !== undefined && session.expiresAtMs <= Date.now()) {
        return new GraphQLError('Impersonation session has expired.', {
            extensions: { code: 'UNAUTHENTICATED' },
        });
    }

    const isSelfRevoke = IsOnlyEndImpersonationMutation(operation);

    if (!IsUserImpersonationEnabled() && !isSelfRevoke) {
        return new GraphQLError(
            'User impersonation is disabled on this server (MJ_ENABLE_USER_IMPERSONATION is off).',
            { extensions: { code: 'FEATURE_DISABLED' } }
        );
    }

    if (session.readOnly && operation?.operation === 'mutation' && !isSelfRevoke) {
        return new GraphQLError(
            "Write operations are disabled during Read-Only ('View As User') impersonation sessions.",
            { extensions: { code: 'IMPERSONATION_READ_ONLY' } }
        );
    }

    return null;
}

/**
 * Apollo Server plugin enforcing transport-level Read-Only (`ViewAs`) mutation blocking and
 * mid-session kill-switch enforcement across 100% of generated, custom, and OpenApp resolvers.
 */
export function CreateImpersonationApolloPlugin(): ApolloServerPlugin<AppContext> {
    return {
        async requestDidStart() {
            return {
                async didResolveOperation(requestContext) {
                    const err = EvaluateGraphQLOperationForImpersonation(
                        requestContext.operation,
                        requestContext.contextValue?.userPayload
                    );
                    if (err) {
                        throw err;
                    }
                },
            };
        },
    };
}

/**
 * Validates a `graphql-ws` `subscribe` message (which can carry `subscription`, `query`, OR `mutation`!)
 * against impersonation session expiry, live key revocation, kill switch, and Read-Only mutation guards.
 */
export async function ValidateImpersonationWebSocketSubscribe(
    userPayload: UserPayload | undefined,
    query: string | undefined,
    operationName: string | null | undefined
): Promise<readonly GraphQLError[] | undefined> {
    const session = GetImpersonationSession(userPayload);
    if (!session) {
        return undefined;
    }

    if (session.expiresAtMs !== undefined && session.expiresAtMs <= Date.now()) {
        return [
            new GraphQLError('Impersonation session has expired.', {
                extensions: { code: 'UNAUTHENTICATED' },
            }),
        ];
    }

    // Re-check live revocation status in APIKeyEngine so revoked keys cannot open new WS operations.
    if (userPayload?.apiKeyHash) {
        const systemUser = UserCache.Instance.GetSystemUser();
        if (systemUser) {
            const keyCheck = await GetAPIKeyEngine().ValidateKeyByHash(userPayload.apiKeyHash, systemUser);
            if (!keyCheck.Valid) {
                return [
                    new GraphQLError('Impersonation API key has been revoked or expired.', {
                        extensions: { code: 'UNAUTHENTICATED' },
                    }),
                ];
            }
        }
    }

    if (!query?.trim()) {
        return [
            new GraphQLError('Empty GraphQL operation rejected.', {
                extensions: { code: 'BAD_USER_INPUT' },
            }),
        ];
    }

    let opAst: OperationDefinitionNode | null = null;
    try {
        const doc = parse(query);
        opAst = getOperationAST(doc, operationName ?? undefined) ?? null;
    } catch {
        return [
            new GraphQLError('Malformed GraphQL document.', {
                extensions: { code: 'GRAPHQL_PARSE_FAILED' },
            }),
        ];
    }

    const opErr = EvaluateGraphQLOperationForImpersonation(opAst, userPayload);
    return opErr ? [opErr] : undefined;
}

/**
 * Post-auth Express HTTP guard covering REST (`/api/v1/*`), `/oauth/*`, `/magic-link/*`, `/widget/*`,
 * and any post-auth server extensions when authenticated with an `MJ-Impersonation:` API key.
 */
export function CreateImpersonationHttpGuardMiddleware(graphqlPathPrefix: string = '/'): RequestHandler {
    const normalizedGqlPrefix = graphqlPathPrefix.trim() || '/';

    return (req: Request, res: Response, next: NextFunction): void => {
        const session = GetImpersonationSession(req.userPayload);
        if (!session) {
            next();
            return;
        }

        const pathLower = (req.path || req.url || '/').toLowerCase();

        // Impersonation sessions may NEVER initiate/exchange OAuth tokens, create magic links, or promote widget identities.
        if (
            pathLower.includes('/oauth/') ||
            pathLower.endsWith('/oauth') ||
            pathLower.includes('/magic-link/') ||
            pathLower.endsWith('/magic-link') ||
            pathLower.includes('/widget/') ||
            pathLower.endsWith('/widget')
        ) {
            res.status(403).json({
                error: 'OAuth, Magic Link, and Widget capability routes are prohibited during user impersonation.',
                code: 'IMPERSONATION_FORBIDDEN_ROUTE',
            });
            return;
        }

        // GraphQL requests pass through to Apollo's didResolveOperation plugin (which permits MJEndUserImpersonation).
        const isGraphqlRoute =
            normalizedGqlPrefix === '/'
                ? !pathLower.startsWith('/api/v1')
                : pathLower.startsWith(normalizedGqlPrefix.toLowerCase());

        if (!IsUserImpersonationEnabled() && !isGraphqlRoute) {
            res.status(403).json({
                error: 'User impersonation is disabled on this server.',
                code: 'FEATURE_DISABLED',
            });
            return;
        }

        if (pathLower.startsWith('/api/v1')) {
            // Check REST entity path segments (`/api/v1/entities/:entityName...`, `/api/v1/views/:entityName...`, `/api/v1/metadata/entities/:entityName...`)
            const restSubpath = (req.path || '').slice('/api/v1'.length);
            const entitySegMatch = /^\/(?:entities|views|metadata\/entities)\/([^/]+)/i.exec(restSubpath);
            if (entitySegMatch) {
                let decodedEntity = entitySegMatch[1];
                try {
                    decodedEntity = decodeURIComponent(decodedEntity);
                } catch {
                    // Keep raw segment
                }
                if (
                    decodedEntity.toLowerCase() !== 'batch' &&
                    decodedEntity.toLowerCase() !== 'entity' &&
                    IsEntityForbiddenDuringImpersonation(decodedEntity, req.userPayload?.userRecord as UserInfo | undefined)
                ) {
                    res.status(403).json({
                        error: `Access to '${decodedEntity}' is prohibited during user impersonation sessions.`,
                        code: 'IMPERSONATION_FORBIDDEN_ENTITY',
                    });
                    return;
                }
            }

            if (session.readOnly) {
                const method = req.method.toUpperCase();
                // Allow GET/HEAD/OPTIONS and read-only view/query POSTs (/views/*, /queries/run); block all writes/transactions.
                const isReadPost =
                    method === 'POST' &&
                    (/^\/views\//i.test(restSubpath) || /^\/queries\/run\/?$/i.test(restSubpath));
                const isSafeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || isReadPost;
                if (!isSafeMethod) {
                    res.status(403).json({
                        error: "Write operations are disabled during Read-Only ('View As User') impersonation sessions.",
                        code: 'IMPERSONATION_READ_ONLY',
                    });
                    return;
                }
            }
        } else if (!isGraphqlRoute && session.readOnly) {
            const method = req.method.toUpperCase();
            if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
                res.status(403).json({
                    error: "Write operations are disabled during Read-Only ('View As User') impersonation sessions.",
                    code: 'IMPERSONATION_READ_ONLY',
                });
                return;
            }
        }

        next();
    };
}

// ============================================================================
// Data-Layer Hooks (`PreRunView`, `PostRunView`, `PreSave`, `PreDelete`)
// ============================================================================

interface ConversationOwnershipRow {
    ID?: string;
    UserID?: string | null;
    AnchorType?: string | null;
}

interface ConversationDetailOwnershipRow {
    ConversationID?: string | null;
}

function appendClauseToSqlFilter(
    existingFilter: string | PlatformSQL | undefined,
    clause: string
): string | PlatformSQL {
    if (typeof existingFilter === 'string') {
        const trimmed = existingFilter.trim();
        return trimmed ? `(${trimmed}) AND ${clause}` : clause;
    }
    if (IsPlatformSQL(existingFilter)) {
        return {
            default: existingFilter.default?.trim()
                ? `(${existingFilter.default.trim()}) AND ${clause}`
                : clause,
            ...(existingFilter.sqlserver?.trim()
                ? { sqlserver: `(${existingFilter.sqlserver.trim()}) AND ${clause}` }
                : {}),
            ...(existingFilter.postgresql?.trim()
                ? { postgresql: `(${existingFilter.postgresql.trim()}) AND ${clause}` }
                : {}),
        };
    }
    return clause;
}

function resolveRunViewTargetEntityName(params: RunViewParams): string {
    if (typeof params.EntityName === 'string' && params.EntityName.trim().length > 0) {
        return params.EntityName.trim();
    }
    const entityFieldVal = params.ViewEntity?.Fields?.find((f) => f.Name === 'Entity')?.Value;
    if (typeof entityFieldVal === 'string' && entityFieldVal.trim().length > 0) {
        return entityFieldVal.trim();
    }
    return '';
}

export const ImpersonationPreRunViewHook: PreRunViewHook = (
    params: RunViewParams,
    contextUser: UserInfo | undefined
): RunViewParams => {
    if (INTERNAL_SECURITY_LOOKUP_PARAMS.has(params)) {
        return params;
    }
    const session = GetImpersonationSession(contextUser);
    if (!session) {
        return params;
    }

    if (!IsUserImpersonationEnabled()) {
        throw new AuthorizationError(
            'User impersonation is disabled on this server (MJ_ENABLE_USER_IMPERSONATION is off).'
        );
    }

    const entityName = resolveRunViewTargetEntityName(params);
    if (IsEntityForbiddenDuringImpersonation(entityName, contextUser)) {
        throw new AuthorizationError(
            `Access to '${entityName}' is prohibited during user impersonation sessions.`
        );
    }

    let nextParams = params;
    if (session.readOnly && nextParams.SaveViewResults) {
        nextParams = { ...nextParams, SaveViewResults: false };
    }

    // Isolate personal 1:1 unanchored conversations to the impersonated target user only.
    if (
        entityName.trim().toLowerCase() === 'mj: conversations' &&
        IsValidUUID(session.targetUserId)
    ) {
        const ownerClause = `(AnchorType IS NOT NULL OR UserID = '${EscapeSQLString(session.targetUserId)}')`;
        nextParams = {
            ...nextParams,
            ExtraFilter: appendClauseToSqlFilter(nextParams.ExtraFilter, ownerClause),
        };
    }

    return nextParams;
};

export const ImpersonationPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined,
    provider?: IMetadataProvider
): Promise<RunViewResult> => {
    if (INTERNAL_SECURITY_LOOKUP_PARAMS.has(params) || !results?.Success || !results.Results?.length) {
        return results;
    }
    const session = GetImpersonationSession(contextUser);
    if (!session || !IsValidUUID(session.targetUserId)) {
        return results;
    }

    const entityLower = resolveRunViewTargetEntityName(params).toLowerCase();
    if (entityLower === 'mj: conversations') {
        const rows = results.Results as ConversationOwnershipRow[];
        const permitted = rows.filter((row) => {
            if (!row || typeof row !== 'object') {
                return false;
            }
            if (row.AnchorType) {
                return true;
            }
            return Boolean(row.UserID && UUIDsEqual(row.UserID, session.targetUserId));
        });
        if (permitted.length === rows.length) {
            return results;
        }
        const removed = rows.length - permitted.length;
        return {
            ...results,
            Results: permitted,
            RowCount: permitted.length,
            TotalRowCount: Math.max(permitted.length, (results.TotalRowCount ?? rows.length) - removed),
        };
    }

    if (entityLower === 'mj: conversation details') {
        const detailRows = results.Results as ConversationDetailOwnershipRow[];
        const convIds = Array.from(
            new Set(
                detailRows
                    .map((r) => (typeof r?.ConversationID === 'string' ? r.ConversationID.trim() : ''))
                    .filter((id) => IsValidUUID(id))
                    .map((id) => NormalizeUUID(id))
            )
        );
        if (convIds.length === 0) {
            return results;
        }
        const md = provider ?? contextUser?.OwningProvider ?? Metadata.Provider; // global-provider-ok: server security hook fallback
        const systemUser =
            UserCache.Instance.GetSystemUser() ??
            (md ? await WellKnownUserSource.Instance.GetSystemUser(md) : undefined);
        if (!md || !systemUser) {
            // Fail closed if parent conversation ownership cannot be verified.
            return { ...results, Results: [], RowCount: 0, TotalRowCount: 0 };
        }
        const inList = convIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const lookupParams: RunViewParams = {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `ID IN (${inList})`,
            Fields: ['ID', 'UserID', 'AnchorType'],
            SkipTotalRowCount: true,
            ResultType: 'simple',
        };
        INTERNAL_SECURITY_LOOKUP_PARAMS.add(lookupParams);
        const convRes = await RunView.FromMetadataProvider(md).RunView<ConversationOwnershipRow>(
            lookupParams,
            systemUser
        );
        if (!convRes.Success) {
            return { ...results, Results: [], RowCount: 0, TotalRowCount: 0 };
        }
        const allowedConvIds = new Set<string>();
        for (const conv of convRes.Results ?? []) {
            if (!conv.ID) {
                continue;
            }
            if (conv.AnchorType || (conv.UserID && UUIDsEqual(conv.UserID, session.targetUserId))) {
                allowedConvIds.add(NormalizeUUID(conv.ID));
            }
        }
        const permittedDetails = detailRows.filter((row) => {
            const cid = typeof row?.ConversationID === 'string' ? row.ConversationID.trim() : '';
            return IsValidUUID(cid) && allowedConvIds.has(NormalizeUUID(cid));
        });
        if (permittedDetails.length === detailRows.length) {
            return results;
        }
        const removed = detailRows.length - permittedDetails.length;
        return {
            ...results,
            Results: permittedDetails,
            RowCount: permittedDetails.length,
            TotalRowCount: Math.max(
                permittedDetails.length,
                (results.TotalRowCount ?? detailRows.length) - removed
            ),
        };
    }

    return results;
};

export const ImpersonationPreSaveHook: PreSaveHook = (
    entity: BaseEntity,
    contextUser: UserInfo | undefined
): boolean | string => {
    const session = GetImpersonationSession(contextUser);
    if (!session) {
        return true;
    }
    if (!IsUserImpersonationEnabled()) {
        return 'User impersonation is disabled on this server (MJ_ENABLE_USER_IMPERSONATION is off).';
    }

    const entityName = entity.EntityInfo?.Name ?? '';
    if (session.readOnly) {
        // Allow server-initiated record-access audit log writes outside ClientCrudBoundary so
        // reading an entity with `AuditRecordAccess = true` continues to record its access audit row.
        const isInternalReadAuditWrite =
            !ServerOperationScopeManager.Instance.IsInDirectClientCrud() &&
            entityName.trim().toLowerCase() === 'mj: audit logs' &&
            !entity.IsSaved;
        if (!isInternalReadAuditWrite) {
            return "Write operations are disabled during Read-Only ('View As User') impersonation sessions.";
        }
        return true;
    }

    if (IsEntityForbiddenDuringImpersonation(entityName, contextUser)) {
        return `Modifying '${entityName}' is prohibited during user impersonation sessions.`;
    }
    return true;
};

export const ImpersonationPreDeleteHook: PreDeleteHook = (
    entity: BaseEntity,
    contextUser: UserInfo | undefined
): boolean | string => {
    const session = GetImpersonationSession(contextUser);
    if (!session) {
        return true;
    }
    if (!IsUserImpersonationEnabled()) {
        return 'User impersonation is disabled on this server (MJ_ENABLE_USER_IMPERSONATION is off).';
    }
    if (session.readOnly) {
        return "Delete operations are disabled during Read-Only ('View As User') impersonation sessions.";
    }
    const entityName = entity.EntityInfo?.Name ?? '';
    if (IsEntityForbiddenDuringImpersonation(entityName, contextUser)) {
        return `Deleting '${entityName}' is prohibited during user impersonation sessions.`;
    }
    return true;
};

/**
 * Registers the impersonation `PreRunView`, `PostRunView`, `PreSave`, and `PreDelete` data hooks
 * once per process (and protects `MJ: Conversations` / `MJ: Conversation Details` in `ClientClauseScreen`).
 */
export function EnsureImpersonationDataHooksRegistered(): void {
    const store = GetGlobalObjectStore();
    if (store?.[IMPERSONATION_HOOKS_REGISTERED_KEY]) {
        return;
    }
    RegisterDataHook('PreRunView', ImpersonationPreRunViewHook);
    RegisterDataHook('PostRunView', ImpersonationPostRunViewHook);
    RegisterDataHook('PreSave', ImpersonationPreSaveHook);
    RegisterDataHook('PreDelete', ImpersonationPreDeleteHook);
    RegisterPostRunViewProtectedEntity('MJ: Conversations');
    RegisterPostRunViewProtectedEntity('MJ: Conversation Details');
    if (store) {
        store[IMPERSONATION_HOOKS_REGISTERED_KEY] = true;
    }
}
