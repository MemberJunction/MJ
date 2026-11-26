import { AsyncLocalStorage } from 'node:async_hooks';
import type { ApolloServerPlugin } from '@apollo/server';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import {
    GraphQLError,
    getOperationAST,
    parse,
    type ExecutionArgs,
    type OperationDefinitionNode,
} from 'graphql';
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
 * Covers credentials, API keys, encryption keys, OAuth tokens, audit logs, record-change history,
 * capability/invitation links, company integrations, MCP server secrets, and all identity/permission/RLS tables.
 */
export const IMPERSONATION_FORBIDDEN_ENTITY_NAMES: ReadonlyArray<string> = Object.freeze([
    // API Keys, Applications & Scopes
    'MJ: API Keys',
    'MJ: API Key Scopes',
    'MJ: API Key Applications',
    'MJ: API Key Usage Logs',
    'MJ: API Scopes',
    'MJ: API Applications',
    'MJ: API Application Scopes',
    // Credentials, Integrations, Encryption, MCP & OAuth Secrets
    'MJ: Credentials',
    'MJ: Credential Types',
    'MJ: Credential Categories',
    'MJ: AI Agent Credentials',
    'MJ: AI Credential Bindings',
    'MJ: Company Integrations',
    'MJ: MCP Servers',
    'MJ: Encryption Keys',
    'MJ: Encryption Key Sources',
    'MJ: O Auth Tokens',
    'MJ: O Auth Authorization States',
    'MJ: O Auth Client Registrations',
    'MJ: O Auth Auth Server Metadata Caches',
    // Audit Trail & Full Record-Change History (captures snapshots of forbidden entities)
    'MJ: Audit Logs',
    'MJ: Audit Log Types',
    'MJ: Record Changes',
    // Communication Tracking/Unsubscribe/Confirmation Tokens
    'MJ: Communication Logs',
    'MJ: Communication Principal Preferences',
    // Identity, Roles, Authorizations, Permissions, ACLs, RLS & Capability Links
    'MJ: Users',
    'MJ: Roles',
    'MJ: User Roles',
    'MJ: Authorizations',
    'MJ: Authorization Roles',
    'MJ: Entity Permissions',
    'MJ: Entity Field Permissions',
    'MJ: Access Control Rules',
    'MJ: Application Roles',
    'MJ: Resource Permissions',
    'MJ: Row Level Security Filters',
    'MJ: Query Permissions',
    'MJ: Authentication Providers',
    'MJ: Magic Link Invites',
    'MJ: Magic Link Invite Roles',
    'MJ: Magic Link Invite Applications',
    'MJ: Magic Link Invite Allowed Domains',
    'MJ: Magic Link Invite Allowed Paths',
    'MJ: Magic Link Redemptions',
    'MJ: Artifact Guest Share Links',
    'MJ: Public Links',
    'MJ: List Invitations',
]);

/**
 * Additional entities that `ActAs` impersonation sessions may NEVER create, update, or delete
 * because they enqueue durable background jobs, scheduled tasks, or out-of-band agent work that
 * outlives the short-lived impersonation key TTL and re-resolves the target user without the guard.
 */
export const IMPERSONATION_WRITE_FORBIDDEN_ENTITY_NAMES: ReadonlyArray<string> = Object.freeze([
    'MJ: Scheduled Jobs',
    'MJ: Work Queue Items',
    'MJ: Work Queue Deliveries',
    'MJ: AI Agent Requests',
    'MJ: AI Agent Runs',
    'MJ: User Routines',
]);

const FORBIDDEN_ENTITY_LOWER_SET: ReadonlySet<string> = new Set(
    IMPERSONATION_FORBIDDEN_ENTITY_NAMES.map((name) => name.trim().toLowerCase())
);

const WRITE_FORBIDDEN_ENTITY_LOWER_SET: ReadonlySet<string> = new Set(
    IMPERSONATION_WRITE_FORBIDDEN_ENTITY_NAMES.map((name) => name.trim().toLowerCase())
);

/**
 * Pattern fallback covering Open App or future entities whose names follow sensitive secret,
 * credential, token, capability-link, or access-control naming conventions even before they are
 * explicitly listed in {@link IMPERSONATION_FORBIDDEN_ENTITY_NAMES}.
 */
const SENSITIVE_ENTITY_NAME_PATTERN =
    /(?:^|:\s*)(?:api\s*keys?|api\s*key\s*(?:scopes?|applications?|usage\s*logs?)|credentials?|credential\s*(?:types?|categories?)|encryption\s*keys?|o\s*auth\s*(?:tokens?|client\s*registrations?|authorization\s*states?)|magic\s*link\s*(?:invites?|redemptions?)|public\s*links?|access\s*control\s*rules?|row\s*level\s*security\s*filters?)$/i;

/**
 * Strict field-name pattern for real credential/secret columns (excludes LLM token counters,
 * concurrency lock/lease tokens, and sync cursors). Used when entity metadata is available.
 */
const SECRET_FIELD_NAME_PATTERN =
    /^(?:AccessToken|RefreshToken|ClientSecret|ClientSecretEncrypted|OAuthClientSecretEncrypted|APIKey|PasswordHash|PrivateKey|SecretKey|SigningSecret|WebhookSecret|WebhookSigningSecret|RegistrationAccessToken)$/i;

/**
 * Entities prohibited in saved `MJ: Queries` during impersonation: every forbidden security,
 * secret, audit, record-change, integration, and permission entity (excluding `MJ: Users` only so
 * standard business reports joining `vwUsers` for owner display names continue to operate).
 */
const SAVED_QUERY_SECRET_ENTITY_LOWER_SET: ReadonlySet<string> = new Set(
    IMPERSONATION_FORBIDDEN_ENTITY_NAMES
        .map((name) => name.trim().toLowerCase())
        .filter((name) => name !== 'mj: users')
);

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
 * Intentionally restricted to synchronous entity CRUD (`entity:create|update|delete|merge`) so
 * `ActAs` cannot launch out-of-band agents, actions, prompts, or tasks that outlive the key's TTL.
 * Still NEVER includes `full_access`, `apikey:create`, `apikey:revoke`, or `agent:trusted`!
 */
export const IMPERSONATION_ACT_AS_ADDITIONAL_SCOPES: ReadonlyArray<string> = Object.freeze([
    'entity:create',
    'entity:update',
    'entity:delete',
    'entity:merge',
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
const IMPERSONATION_ACTIVE_WS_STORE_KEY = '___MJServer___ImpersonationActiveWebSockets';
/** Upper bound (256 KiB) on saved-query SQL length inspected during impersonation; larger SQL fails closed. */
export const MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH = 262_144;
const INTERNAL_SECURITY_LOOKUP_PARAMS = new WeakSet<object>();
const impersonationByUser = new WeakMap<UserInfo, ImpersonationSessionInfo>();
const currentUserBootstrapStorage = new AsyncLocalStorage<string>();
const impersonationRequestStorage = new AsyncLocalStorage<ImpersonationSessionInfo>();
const impersonationKeyMintStorage = new AsyncLocalStorage<boolean>();
const impersonationKeyRevokeStorage = new AsyncLocalStorage<boolean>();

/**
 * Returns `true` when `label` starts with the server-reserved `MJ-Impersonation:` prefix
 * (case-insensitive, after trimming leading whitespace).
 */
export function HasReservedImpersonationKeyLabelPrefix(label: string | null | undefined): boolean {
    if (typeof label !== 'string') {
        return false;
    }
    return label.trim().toLowerCase().startsWith(USER_IMPERSONATION_KEY_LABEL_PREFIX.toLowerCase());
}

/**
 * Scoped execution wrapper owned exclusively by `UserImpersonationResolver` when minting a
 * server-controlled `MJ-Impersonation:` API key. Every other caller attempting to create or
 * modify protected fields (`Label`, `Status`, `ExpiresAt`, `UserID`) on an `MJ: API Keys` row
 * carrying that prefix is refused by `ImpersonationPreSaveHook`.
 */
export function WithImpersonationKeyMintScope<T>(fn: () => Promise<T>): Promise<T> {
    return impersonationKeyMintStorage.run(true, fn);
}

/** True ONLY while executing inside {@link WithImpersonationKeyMintScope}. */
export function IsInImpersonationKeyMintScope(): boolean {
    return impersonationKeyMintStorage.getStore() === true;
}

/**
 * Scoped execution wrapper owned exclusively by `UserImpersonationResolver` when revoking an
 * `MJ-Impersonation:` API key (`Status = 'Revoked'`). Outside this scope and the mint scope,
 * mutating `Status` (including reactivation), `ExpiresAt`, `UserID`, or `Label` is refused.
 */
export function WithImpersonationKeyRevokeScope<T>(fn: () => Promise<T>): Promise<T> {
    return impersonationKeyRevokeStorage.run(true, fn);
}

/** True ONLY while executing inside {@link WithImpersonationKeyRevokeScope}. */
export function IsInImpersonationKeyRevokeScope(): boolean {
    return impersonationKeyRevokeStorage.getStore() === true;
}

/**
 * Binds `session` into request-scoped `AsyncLocalStorage` so even resolvers or library calls that
 * re-resolve the target user from `UserCache` (producing a distinct `UserInfo` object reference)
 * still enforce every impersonation data hook and guard for that target user's ID.
 */
export function RunWithImpersonationSession<T>(
    session: ImpersonationSessionInfo | null | undefined,
    fn: () => T
): T {
    if (!session) {
        return fn();
    }
    return impersonationRequestStorage.run(session, fn);
}

/** Returns the active request-scoped `ImpersonationSessionInfo` from `AsyncLocalStorage`, if any. */
export function GetActiveRequestImpersonationSession(): ImpersonationSessionInfo | undefined {
    return impersonationRequestStorage.getStore();
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        Symbol.asyncIterator in value &&
        typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
    );
}

function wrapAsyncIterableWithImpersonationSession<T>(
    iterable: AsyncIterable<T>,
    session: ImpersonationSessionInfo
): AsyncIterable<T> {
    return {
        [Symbol.asyncIterator](): AsyncIterator<T> {
            const inner = iterable[Symbol.asyncIterator]();
            const wrapped: AsyncIterator<T> = {
                next: (...args) => RunWithImpersonationSession(session, () => inner.next(...args)),
            };
            if (inner.return) {
                const innerReturn = inner.return.bind(inner);
                wrapped.return = (...args) => RunWithImpersonationSession(session, () => innerReturn(...args));
            }
            if (inner.throw) {
                const innerThrow = inner.throw.bind(inner);
                wrapped.throw = (...args) => RunWithImpersonationSession(session, () => innerThrow(...args));
            }
            return wrapped;
        },
    };
}

/**
 * Wraps GraphQL `execute` / `subscribe` (used by `graphql-ws` `useServer`) inside the request-scoped
 * impersonation `AsyncLocalStorage` store whenever `args.contextValue` carries an impersonation session,
 * and wraps any returned `AsyncIterable` so every yielded subscription step also executes inside the store.
 */
export function RunGraphQLOperationWithImpersonationSession<TResult>(
    args: ExecutionArgs,
    runner: (execArgs: ExecutionArgs) => TResult
): TResult {
    const wsContext = args.contextValue as { readonly userPayload?: UserPayload } | undefined;
    const session = GetImpersonationSession(wsContext?.userPayload);
    if (!session) {
        return runner(args);
    }
    const rawResult = RunWithImpersonationSession(session, () => runner(args));
    if (isAsyncIterable(rawResult)) {
        return wrapAsyncIterableWithImpersonationSession(rawResult, session) as unknown as TResult;
    }
    if (rawResult instanceof Promise) {
        return rawResult.then((resolved) =>
            isAsyncIterable(resolved)
                ? wrapAsyncIterableWithImpersonationSession(resolved, session)
                : resolved
        ) as unknown as TResult;
    }
    return rawResult;
}

function getActiveImpersonationWsRegistry(): Map<string, Set<() => void>> {
    const store = GetGlobalObjectStore();
    if (store) {
        let map = store[IMPERSONATION_ACTIVE_WS_STORE_KEY] as Map<string, Set<() => void>> | undefined;
        if (!map) {
            map = new Map<string, Set<() => void>>();
            store[IMPERSONATION_ACTIVE_WS_STORE_KEY] = map;
        }
        return map;
    }
    return new Map<string, Set<() => void>>();
}

/**
 * Registers an active GraphQL WebSocket connection authenticated with an impersonation key so
 * `MJEndUserImpersonation` (and single-active-session rotation) can close it immediately.
 * Returns an idempotent disposer for `onClose`.
 */
export function RegisterImpersonationWebSocket(apiKeyId: string, closeFn: () => void): () => void {
    const cleanId = apiKeyId?.trim();
    if (!cleanId) {
        return () => undefined;
    }
    const key = IsValidUUID(cleanId) ? NormalizeUUID(cleanId) : cleanId.toLowerCase();
    const registry = getActiveImpersonationWsRegistry();
    let closers = registry.get(key);
    if (!closers) {
        closers = new Set<() => void>();
        registry.set(key, closers);
    }
    closers.add(closeFn);
    return () => {
        const set = registry.get(key);
        if (!set) {
            return;
        }
        set.delete(closeFn);
        if (set.size === 0) {
            registry.delete(key);
        }
    };
}

/**
 * Closes every active WebSocket connection authenticated with `apiKeyId` and removes them from the registry.
 * Returns the number of socket close callbacks invoked.
 */
export function CloseImpersonationWebSockets(apiKeyId: string): number {
    const cleanId = apiKeyId?.trim();
    if (!cleanId) {
        return 0;
    }
    const key = IsValidUUID(cleanId) ? NormalizeUUID(cleanId) : cleanId.toLowerCase();
    const registry = getActiveImpersonationWsRegistry();
    const closers = registry.get(key);
    if (!closers || closers.size === 0) {
        return 0;
    }
    const snapshot = Array.from(closers);
    registry.delete(key);
    let closed = 0;
    for (const closeFn of snapshot) {
        try {
            closeFn();
            closed++;
        } catch {
            // Non-fatal: socket may already be closed
        }
    }
    return closed;
}

/**
 * Inline guard throwing `AuthorizationError` whenever `subject` (or the current request ALS)
 * belongs to an active user impersonation session. Used by side-effecting `@Query` resolvers
 * and out-of-band execution entrypoints alongside `@RefuseImpersonationSessions()`.
 */
export function AssertNotImpersonationSession(
    subject: UserInfo | UserPayload | null | undefined,
    operationName: string
): void {
    const session = GetImpersonationSession(subject);
    if (session) {
        throw new AuthorizationError(
            `${operationName} is prohibited during user impersonation sessions.`
        );
    }
}

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
    userRecord.ImpersonationContext = Object.freeze({
        ActorUserID: frozen.actorUserId,
        TargetUserID: frozen.targetUserId,
        APIKeyID: frozen.apiKeyId,
        Mode: frozen.mode,
    });
    return frozen;
}

/**
 * Preserves any stamped `ImpersonationSessionInfo` when `CloneUserForSessionContext` clones a `UserInfo`.
 */
export function CopyImpersonationSessionToClone(source: UserInfo, clone: UserInfo): void {
    const existing = impersonationByUser.get(source);
    if (existing) {
        impersonationByUser.set(clone, existing);
        clone.ImpersonationContext = Object.freeze({
            ActorUserID: existing.actorUserId,
            TargetUserID: existing.targetUserId,
            APIKeyID: existing.apiKeyId,
            Mode: existing.mode,
        });
    }
}

function isInternalSystemUserSubject(subject: UserInfo | UserPayload): boolean {
    if ('userRecord' in subject) {
        const payload = subject as UserPayload;
        if (payload.isSystemUser) {
            return true;
        }
        return payload.userRecord ? isInternalSystemUserSubject(payload.userRecord as UserInfo) : false;
    }
    const user = subject as UserInfo;
    const typeLower = (user.Type ?? '').trim().toLowerCase();
    const nameLower = (user.Name ?? '').trim().toLowerCase();
    if (typeLower === 'system' || nameLower === 'system') {
        return true;
    }
    const systemUserId = UserCache.Instance?.GetSystemUser?.()?.ID;
    return Boolean(systemUserId && user.ID && UUIDsEqual(user.ID, systemUserId));
}

/**
 * Resolves the active `ImpersonationSessionInfo` from either a `UserInfo` or a `UserPayload`,
 * falling back to request-scoped `AsyncLocalStorage` whenever a resolver or library re-resolves
 * the target user from `UserCache` (dropping `WeakMap` object identity), while preserving the
 * explicit exemption for internal system-user lookups.
 *
 * Dynamically re-evaluates the server write kill-switch so flipping `MJ_USER_IMPERSONATION_ALLOW_WRITES`
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

    // Fallback to request-scoped AsyncLocalStorage so any code path that re-resolves the target user
    // from UserCache (getting an unstamped UserInfo instance) still enforces every impersonation guard.
    if (!raw && !isInternalSystemUserSubject(subject)) {
        const requestSession = impersonationRequestStorage.getStore();
        if (requestSession) {
            const subjectUserId =
                'userRecord' in subject
                    ? (subject as UserPayload).userRecord?.ID
                    : (subject as UserInfo).ID;
            if (subjectUserId && UUIDsEqual(subjectUserId, requestSession.targetUserId)) {
                raw = requestSession;
            }
        }
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
 * Minimal entity-metadata shape used for dynamic secret-field checks without coupling callers to full `EntityInfo`.
 */
export interface ImpersonationEntityMetadataLike {
    readonly Name?: string | null;
    readonly Fields?: ReadonlyArray<{
        readonly Name?: string | null;
        readonly Encrypt?: boolean | null;
        readonly AllowDecryptInAPI?: boolean | null;
    }> | null;
}

/**
 * Returns `true` when `entityName` is forbidden to an impersonated session (`ViewAs` or `ActAs`),
 * honoring the narrow `CurrentUser` self-bootstrap scope for `MJ: Users` and `MJ: User Roles`.
 *
 * Enforces three layers:
 * 1. Exact membership in {@link IMPERSONATION_FORBIDDEN_ENTITY_NAMES}.
 * 2. Sensitive-entity name pattern matching (covers Open App and future entities).
 * 3. Optional metadata inspection for non-API-decryptable encrypted fields or secret-credential columns.
 */
export function IsEntityForbiddenDuringImpersonation(
    entityName: string | null | undefined,
    contextUser?: UserInfo | null,
    entityInfo?: ImpersonationEntityMetadataLike | null
): boolean {
    if (!entityName) {
        return false;
    }
    const trimmed = entityName.trim();
    const normalized = trimmed.toLowerCase();
    if (
        (normalized === 'mj: users' || normalized === 'mj: user roles') &&
        contextUser?.ID &&
        IsInImpersonationCurrentUserBootstrapFor(contextUser.ID)
    ) {
        return false;
    }
    if (FORBIDDEN_ENTITY_LOWER_SET.has(normalized)) {
        return true;
    }
    if (SENSITIVE_ENTITY_NAME_PATTERN.test(trimmed)) {
        return true;
    }
    const fields = entityInfo?.Fields;
    if (Array.isArray(fields) && fields.length > 0) {
        for (const f of fields) {
            const fname = f?.Name?.trim() ?? '';
            if (f?.Encrypt === true && f?.AllowDecryptInAPI === false) {
                return true;
            }
            if (fname && SECRET_FIELD_NAME_PATTERN.test(fname)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Returns `true` when writing or deleting `entityName` is prohibited during `ActAs` impersonation
 * (either because the entity is fully forbidden or because it queues out-of-band background work
 * that would outlive the impersonation key TTL).
 */
export function IsEntityWriteForbiddenDuringImpersonation(
    entityName: string | null | undefined,
    contextUser?: UserInfo | null,
    entityInfo?: ImpersonationEntityMetadataLike | null
): boolean {
    if (!entityName) {
        return true;
    }
    const normalized = entityName.trim().toLowerCase();
    if (WRITE_FORBIDDEN_ENTITY_LOWER_SET.has(normalized)) {
        return true;
    }
    return IsEntityForbiddenDuringImpersonation(entityName, contextUser, entityInfo);
}

type SqlToken =
    | { readonly kind: 'ident'; readonly value: string; readonly quoted: boolean }
    | { readonly kind: 'dot' }
    | { readonly kind: 'comma' }
    | { readonly kind: 'lparen' }
    | { readonly kind: 'rparen' }
    | { readonly kind: 'semi' }
    | { readonly kind: 'other' };

const SQL_CLAUSE_TERMINATORS: ReadonlySet<string> = new Set([
    'where',
    'select',
    'group',
    'order',
    'having',
    'union',
    'intersect',
    'except',
    'set',
    'values',
    'limit',
    'offset',
    'fetch',
    'on',
    'using',
    'when',
    'then',
    'else',
    'end',
    'inner',
    'left',
    'right',
    'full',
    'cross',
    'outer',
    'natural',
    'lateral',
]);

function isSqlIdentStart(code: number): boolean {
    return (
        (code >= 65 && code <= 90) || // A-Z
        (code >= 97 && code <= 122) || // a-z
        code === 95 || // _
        code === 64 || // @
        code === 35 // #
    );
}

function isSqlIdentContinue(code: number): boolean {
    return (
        isSqlIdentStart(code) ||
        (code >= 48 && code <= 57) || // 0-9
        code === 36 // $
    );
}

/**
 * Strictly linear O(n), regex-free SQL tokenizer extracting quoted/unquoted identifiers and
 * clause punctuation while skipping `--` / `/* *\/` comments and single-quoted string literals.
 */
function tokenizeSqlIdentifiers(sql: string): SqlToken[] {
    const tokens: SqlToken[] = [];
    const len = sql.length;
    let i = 0;

    while (i < len) {
        const ch = sql.charCodeAt(i);

        // Skip ASCII whitespace
        if (ch <= 32) {
            i++;
            continue;
        }

        // Single-line `--` comment
        if (ch === 45 /* '-' */ && i + 1 < len && sql.charCodeAt(i + 1) === 45) {
            i += 2;
            while (i < len && sql.charCodeAt(i) !== 10 /* '\n' */) {
                i++;
            }
            continue;
        }

        // Block `/* ... */` comment
        if (ch === 47 /* '/' */ && i + 1 < len && sql.charCodeAt(i + 1) === 42 /* '*' */) {
            i += 2;
            while (i + 1 < len && !(sql.charCodeAt(i) === 42 && sql.charCodeAt(i + 1) === 47)) {
                i++;
            }
            i = Math.min(len, i + 2);
            continue;
        }

        // Single-quoted SQL string literal (handles '' escapes)
        if (ch === 39 /* "'" */) {
            i++;
            while (i < len) {
                if (sql.charCodeAt(i) === 39) {
                    if (i + 1 < len && sql.charCodeAt(i + 1) === 39) {
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                i++;
            }
            tokens.push({ kind: 'other' });
            continue;
        }

        // Quoted identifiers: `[...]`, `"..."`, `` `...` ``
        if (ch === 91 /* '[' */ || ch === 34 /* '"' */ || ch === 96 /* '`' */) {
            const closeChar = ch === 91 ? 93 /* ']' */ : ch;
            i++;
            const start = i;
            let hasEscapedClose = false;
            while (i < len) {
                if (sql.charCodeAt(i) === closeChar) {
                    if (i + 1 < len && sql.charCodeAt(i + 1) === closeChar) {
                        hasEscapedClose = true;
                        i += 2;
                        continue;
                    }
                    break;
                }
                i++;
            }
            let rawIdent = sql.slice(start, i);
            if (hasEscapedClose) {
                const closeStr = String.fromCharCode(closeChar);
                rawIdent = rawIdent.split(closeStr + closeStr).join(closeStr);
            }
            if (i < len && sql.charCodeAt(i) === closeChar) {
                i++;
            }
            const normalized = rawIdent.trim().toLowerCase();
            if (normalized) {
                tokens.push({ kind: 'ident', value: normalized, quoted: true });
            }
            continue;
        }

        if (ch === 46 /* '.' */) {
            tokens.push({ kind: 'dot' });
            i++;
            continue;
        }
        if (ch === 44 /* ',' */) {
            tokens.push({ kind: 'comma' });
            i++;
            continue;
        }
        if (ch === 40 /* '(' */) {
            tokens.push({ kind: 'lparen' });
            i++;
            continue;
        }
        if (ch === 41 /* ')' */) {
            tokens.push({ kind: 'rparen' });
            i++;
            continue;
        }
        if (ch === 59 /* ';' */) {
            tokens.push({ kind: 'semi' });
            i++;
            continue;
        }

        if (isSqlIdentStart(ch)) {
            const start = i;
            i++;
            while (i < len && isSqlIdentContinue(sql.charCodeAt(i))) {
                i++;
            }
            tokens.push({
                kind: 'ident',
                value: sql.slice(start, i).toLowerCase(),
                quoted: false,
            });
            continue;
        }

        tokens.push({ kind: 'other' });
        i++;
    }

    return tokens;
}

/**
 * Returns `true` when a saved `MJ: Queries` definition touches secret, credential, API-key,
 * encryption, OAuth, magic-link, permission, or audit-log entities that an impersonated session
 * must NEVER read even through a role-permitted saved query.
 *
 * Uses a strictly linear O(n), regex-free SQL identifier tokenizer so:
 * - `BaseView` names match on whole SQL identifier boundaries (`vwRoles`, `[__mj].[vwCredentials]`).
 * - `BaseTable` names match ONLY on schema-qualified references (`__mj.Role`, `[__mj].[Credential]`)
 *   or table-source positions (`FROM Role`, `JOIN "Authorization"`, `FROM a, Role`), eliminating
 *   false positives on words/columns such as `Enrollment`, `RoleName`, or `u.Role`.
 * - SQL exceeding {@link MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH} fails closed (`true`).
 */
export function IsSavedQueryForbiddenDuringImpersonation(
    queryInfo: {
        readonly SQL?: string | null;
        readonly Entities?: ReadonlyArray<{ readonly Entity?: string | null }> | null;
    } | null | undefined,
    allEntities?: ReadonlyArray<{
        readonly Name: string;
        readonly SchemaName?: string | null;
        readonly BaseView?: string | null;
        readonly BaseTable?: string | null;
    }>
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
    const rawSql = queryInfo.SQL ?? '';
    if (!rawSql) {
        return false;
    }
    if (rawSql.length > MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH) {
        return true;
    }

    const forbiddenViews = new Set<string>();
    const forbiddenTables = new Set<string>();
    const forbiddenSchemaTables = new Set<string>();

    for (const ent of allEntities ?? []) {
        const entNameLower = ent.Name.trim().toLowerCase();
        if (!SAVED_QUERY_SECRET_ENTITY_LOWER_SET.has(entNameLower)) {
            continue;
        }
        const baseView = (ent.BaseView ?? '').trim().toLowerCase();
        if (baseView) {
            forbiddenViews.add(baseView);
        }
        const baseTable = (ent.BaseTable ?? '').trim().toLowerCase();
        if (baseTable) {
            forbiddenTables.add(baseTable);
            const explicitSchema = (ent.SchemaName ?? '').trim().toLowerCase();
            if (explicitSchema) {
                forbiddenSchemaTables.add(`${explicitSchema}.${baseTable}`);
            } else if (entNameLower.startsWith('mj:')) {
                forbiddenSchemaTables.add(`__mj.${baseTable}`);
            } else {
                forbiddenSchemaTables.add(`dbo.${baseTable}`);
            }
        }
    }

    if (forbiddenViews.size === 0 && forbiddenTables.size === 0) {
        return false;
    }

    const tokens = tokenizeSqlIdentifiers(rawSql);
    const fromListStack: boolean[] = [];
    let inFromCommaList = false;
    let expectTableSource = false;

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok.kind === 'lparen') {
            fromListStack.push(inFromCommaList);
            inFromCommaList = false;
            expectTableSource = false;
            continue;
        }
        if (tok.kind === 'rparen') {
            inFromCommaList = fromListStack.pop() ?? false;
            expectTableSource = false;
            continue;
        }
        if (tok.kind === 'semi') {
            inFromCommaList = false;
            expectTableSource = false;
            continue;
        }
        if (tok.kind === 'comma') {
            if (inFromCommaList) {
                expectTableSource = true;
            }
            continue;
        }
        if (tok.kind !== 'ident') {
            expectTableSource = false;
            continue;
        }

        // Collapse dotted identifier chains (`schema.table` or `db.schema.table`) in one step.
        const parts: Array<{ readonly value: string; readonly quoted: boolean }> = [tok];
        while (
            i + 2 < tokens.length &&
            tokens[i + 1].kind === 'dot' &&
            tokens[i + 2].kind === 'ident'
        ) {
            const nextIdent = tokens[i + 2];
            if (nextIdent.kind === 'ident') {
                parts.push(nextIdent);
            }
            i += 2;
        }

        const objectPart = parts[parts.length - 1];
        const schemaPart = parts.length >= 2 ? parts[parts.length - 2] : null;
        const objectName = objectPart.value;

        // 1. Whole-identifier BaseView match anywhere in SQL
        if (forbiddenViews.has(objectName)) {
            return true;
        }

        // 2. Schema-qualified BaseTable match (e.g. `__mj.Role`, `[__mj].[Credential]`, `db.__mj.Authorization`)
        if (schemaPart && forbiddenSchemaTables.has(`${schemaPart.value}.${objectName}`)) {
            return true;
        }

        // 3. Table-source position match (`FROM Role`, `JOIN [Credential]`, `FROM a, Role`, `FROM custom.Role`)
        if (expectTableSource) {
            if (parts.length === 1 && !objectPart.quoted && objectName === 'only') {
                // PostgreSQL `FROM ONLY table_name` keeps expecting a table source
                continue;
            }
            if (forbiddenTables.has(objectName)) {
                return true;
            }
            expectTableSource = false;
            continue;
        }

        // Update clause state for unquoted single-identifier SQL keywords
        if (parts.length === 1 && !objectPart.quoted) {
            if (objectName === 'from') {
                inFromCommaList = true;
                expectTableSource = true;
            } else if (
                objectName === 'join' ||
                objectName === 'into' ||
                objectName === 'update' ||
                objectName === 'apply'
            ) {
                inFromCommaList = false;
                expectTableSource = true;
            } else if (SQL_CLAUSE_TERMINATORS.has(objectName)) {
                inFromCommaList = false;
                expectTableSource = false;
            }
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

    if (!operation) {
        return new GraphQLError('Unable to resolve GraphQL operation for impersonation session.', {
            extensions: { code: 'BAD_USER_INPUT' },
        });
    }

    const isSelfRevoke = IsOnlyEndImpersonationMutation(operation);

    if (!IsUserImpersonationEnabled() && !isSelfRevoke) {
        return new GraphQLError(
            'User impersonation is disabled on this server (MJ_ENABLE_USER_IMPERSONATION is off).',
            { extensions: { code: 'FEATURE_DISABLED' } }
        );
    }

    if (session.readOnly && operation.operation === 'mutation' && !isSelfRevoke) {
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
 * Strictly fails closed if the GraphQL document cannot be parsed or its target operation cannot be resolved.
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

    if (!opAst) {
        return [
            new GraphQLError('Unable to resolve GraphQL operation.', {
                extensions: { code: 'BAD_USER_INPUT' },
            }),
        ];
    }

    const opErr = EvaluateGraphQLOperationForImpersonation(opAst, userPayload);
    return opErr ? [opErr] : undefined;
}

/**
 * Normalizes an HTTP request path in strictly linear O(n) time (no regex backtracking)
 * by stripping query parameters, ensuring a leading `/`, trimming trailing `/` characters,
 * and lowercasing.
 */
export function NormalizeImpersonationHttpPath(raw: string | undefined): string {
    const rawStr = raw ?? '/';
    const qIdx = rawStr.indexOf('?');
    const withoutQuery = (qIdx === -1 ? rawStr : rawStr.slice(0, qIdx)).trim() || '/';
    const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
    let end = withLeadingSlash.length;
    while (end > 1 && withLeadingSlash.charCodeAt(end - 1) === 47 /* '/' */) {
        end--;
    }
    const trimmed = end === withLeadingSlash.length ? withLeadingSlash : withLeadingSlash.slice(0, end);
    return (trimmed || '/').toLowerCase();
}

/**
 * Default-deny post-auth Express HTTP guard for `MJ-Impersonation:` API keys.
 *
 * Explicitly allows ONLY:
 * 1. The **exact** configured GraphQL endpoint (`graphqlPathPrefix`, e.g. `/` or `/graphql`, `POST`/`GET`/`OPTIONS`),
 *    which then passes through Apollo's `didResolveOperation` plugin (allowing `MJEndUserImpersonation` self-revoke).
 * 2. REST API routes (`/api/v1/*`) — subject to kill switch, forbidden-entity path checks, and Read-Only
 *    enforcement (`GET`/`HEAD`/`OPTIONS` and read-only `POST /views/*` in `ViewAs`; `POST /queries/run` is refused).
 *
 * Every other post-auth route (post-auth Server Extensions, `/realtime/recording/*`, `/oauth/*`,
 * `/magic-link/*`, `/widget/*`, etc.) is **refused by default** regardless of `GRAPHQL_ROOT_PATH`.
 */
export function CreateImpersonationHttpGuardMiddleware(
    graphqlPathPrefix: string = '/',
    restApiPrefix: string = '/api/v1'
): RequestHandler {
    const normalizedGqlPath = NormalizeImpersonationHttpPath(graphqlPathPrefix);
    const normalizedRestPrefix = NormalizeImpersonationHttpPath(restApiPrefix);

    return (req: Request, res: Response, next: NextFunction): void => {
        const session = GetImpersonationSession(req.userPayload);
        if (!session) {
            next();
            return;
        }

        if (session.expiresAtMs !== undefined && session.expiresAtMs <= Date.now()) {
            res.status(401).json({
                error: 'Impersonation session has expired.',
                code: 'UNAUTHENTICATED',
            });
            return;
        }

        const reqPath = NormalizeImpersonationHttpPath(req.path || req.url);
        const method = req.method.toUpperCase();

        // 1. Exact GraphQL endpoint ONLY (never a prefix match when GRAPHQL_ROOT_PATH='/').
        const isExactGraphqlPath = reqPath === normalizedGqlPath;
        if (isExactGraphqlPath) {
            if (method === 'POST' || method === 'GET' || method === 'OPTIONS') {
                next();
                return;
            }
            res.status(403).json({
                error: `HTTP method ${method} is prohibited on the GraphQL endpoint during user impersonation sessions.`,
                code: 'IMPERSONATION_FORBIDDEN_ROUTE',
            });
            return;
        }

        // Non-GraphQL routes ALWAYS honor the kill switch immediately (even before REST/extension routing).
        if (!IsUserImpersonationEnabled()) {
            res.status(403).json({
                error: 'User impersonation is disabled on this server.',
                code: 'FEATURE_DISABLED',
            });
            return;
        }

        // 2. REST API routes (`/api/v1/*`).
        const isRestApiRoute =
            reqPath === normalizedRestPrefix || reqPath.startsWith(`${normalizedRestPrefix}/`);
        if (isRestApiRoute) {
            const rawPath = (req.path || req.url || '').split('?')[0];
            const restSubpath = rawPath.slice(normalizedRestPrefix.length);
            const entitySegMatch = /^\/(?:entities|views|records|metadata\/entities)\/([^/]+)/i.exec(restSubpath);
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
                    IsEntityForbiddenDuringImpersonation(
                        decodedEntity,
                        req.userPayload?.userRecord as UserInfo | undefined
                    )
                ) {
                    res.status(403).json({
                        error: `Access to '${decodedEntity}' is prohibited during user impersonation sessions.`,
                        code: 'IMPERSONATION_FORBIDDEN_ENTITY',
                    });
                    return;
                }
            }

            if (session.readOnly) {
                const isReadPost = method === 'POST' && /^\/views\//i.test(restSubpath);
                const isSafeMethod =
                    method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || isReadPost;
                if (!isSafeMethod) {
                    res.status(403).json({
                        error: "Write operations are disabled during Read-Only ('View As User') impersonation sessions.",
                        code: 'IMPERSONATION_READ_ONLY',
                    });
                    return;
                }
            }

            next();
            return;
        }

        // 3. Default-deny all other post-auth routes (extensions, /realtime/recording/*, /oauth/*, /magic-link/*, /widget/*).
        res.status(403).json({
            error: `Route '${reqPath}' is prohibited during user impersonation sessions.`,
            code: 'IMPERSONATION_FORBIDDEN_ROUTE',
        });
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
    const viewEntityWithProp = params.ViewEntity as { Entity?: string | null } | undefined;
    if (typeof viewEntityWithProp?.Entity === 'string' && viewEntityWithProp.Entity.trim().length > 0) {
        return viewEntityWithProp.Entity.trim();
    }
    const entityFieldVal = params.ViewEntity?.Fields?.find((f) => f.Name === 'Entity')?.Value;
    if (typeof entityFieldVal === 'string' && entityFieldVal.trim().length > 0) {
        return entityFieldVal.trim();
    }
    return '';
}

function readEntityFieldRawAndDirty(
    entity: BaseEntity,
    fieldName: string
): { readonly value: unknown; readonly oldValue: unknown; readonly dirty: boolean } {
    const field = entity.Fields?.find((f) => f.Name?.toLowerCase() === fieldName.toLowerCase());
    if (field) {
        return {
            value: field.Value,
            oldValue: field.OldValue,
            dirty: Boolean(field.Dirty),
        };
    }
    const hasOwn = Object.prototype.hasOwnProperty.call(entity, fieldName);
    const rawProp = hasOwn ? (entity as unknown as Record<string, unknown>)[fieldName] : undefined;
    return {
        value: rawProp,
        oldValue: null,
        dirty: hasOwn && rawProp !== undefined,
    };
}

function readEntityFieldValueAndDirty(
    entity: BaseEntity,
    fieldName: string
): { readonly value: string | null; readonly oldValue: string | null; readonly dirty: boolean } {
    const raw = readEntityFieldRawAndDirty(entity, fieldName);
    return {
        value: typeof raw.value === 'string' ? raw.value : null,
        oldValue: typeof raw.oldValue === 'string' ? raw.oldValue : null,
        dirty: raw.dirty,
    };
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
    if (!entityName) {
        throw new AuthorizationError(
            'RunView requests without a resolved entity name (e.g. unresolved ViewID) are prohibited during user impersonation sessions.'
        );
    }
    const entityMeta = contextUser?.OwningProvider?.EntityByName?.(entityName);
    if (IsEntityForbiddenDuringImpersonation(entityName, contextUser, entityMeta)) {
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
    const entityName = entity.EntityInfo?.Name ?? '';
    const entityLower = entityName.trim().toLowerCase();

    // ALWAYS protect server-managed `MJ-Impersonation:` API keys on EVERY save path
    // (including non-impersonated admins/callers!) so no caller outside the mint/revoke control
    // plane can forge a key, strip the prefix, reactivate Status, extend ExpiresAt, or swap UserID.
    if (entityLower === 'mj: api keys' && !IsInImpersonationKeyMintScope()) {
        const labelState = readEntityFieldValueAndDirty(entity, 'Label');
        if (!entity.IsSaved) {
            if (HasReservedImpersonationKeyLabelPrefix(labelState.value)) {
                return `API key labels starting with '${USER_IMPERSONATION_KEY_LABEL_PREFIX}' are reserved for server-managed user impersonation sessions.`;
            }
        } else {
            const isReservedKey =
                HasReservedImpersonationKeyLabelPrefix(labelState.value) ||
                HasReservedImpersonationKeyLabelPrefix(labelState.oldValue);
            if (isReservedKey) {
                if (labelState.dirty) {
                    return `Modifying or stripping the reserved '${USER_IMPERSONATION_KEY_LABEL_PREFIX}' prefix on an MJ: API Keys record is prohibited.`;
                }
                const expiresAtState = readEntityFieldRawAndDirty(entity, 'ExpiresAt');
                if (expiresAtState.dirty) {
                    return `Modifying ExpiresAt on a server-managed '${USER_IMPERSONATION_KEY_LABEL_PREFIX}' MJ: API Keys record is prohibited.`;
                }
                const userIdState = readEntityFieldRawAndDirty(entity, 'UserID');
                if (userIdState.dirty) {
                    return `Modifying UserID on a server-managed '${USER_IMPERSONATION_KEY_LABEL_PREFIX}' MJ: API Keys record is prohibited.`;
                }
                const statusState = readEntityFieldRawAndDirty(entity, 'Status');
                if (statusState.dirty) {
                    const nextStatus =
                        typeof statusState.value === 'string' ? statusState.value.trim().toLowerCase() : '';
                    if (!IsInImpersonationKeyRevokeScope() || nextStatus !== 'revoked') {
                        return `Modifying Status on a server-managed '${USER_IMPERSONATION_KEY_LABEL_PREFIX}' MJ: API Keys record is prohibited outside the impersonation revoke path.`;
                    }
                }
            }
        }
    }

    const session = GetImpersonationSession(contextUser);
    if (!session) {
        return true;
    }
    if (!IsUserImpersonationEnabled()) {
        return 'User impersonation is disabled on this server (MJ_ENABLE_USER_IMPERSONATION is off).';
    }

    if (session.readOnly) {
        // Allow server-initiated record-access audit log writes outside ClientCrudBoundary so
        // reading an entity with `AuditRecordAccess = true` continues to record its access audit row.
        const isInternalReadAuditWrite =
            !ServerOperationScopeManager.Instance.IsInDirectClientCrud() &&
            entityLower === 'mj: audit logs' &&
            !entity.IsSaved;
        if (!isInternalReadAuditWrite) {
            return "Write operations are disabled during Read-Only ('View As User') impersonation sessions.";
        }
        return true;
    }

    if (IsEntityWriteForbiddenDuringImpersonation(entityName, contextUser, entity.EntityInfo)) {
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
    if (IsEntityWriteForbiddenDuringImpersonation(entityName, contextUser, entity.EntityInfo)) {
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
