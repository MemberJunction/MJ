import { CompositeKey, EntityInfo, IMetadataProvider, LogError, Metadata, RunView, RunViewParams, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, GetGlobalObjectStore, IndexByUUID, IsValidUUID, MJGlobal, NormalizeUUID, RegisterClass, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';

/**
 * Discrete permission actions supported on an `MJ: Artifacts` record.
 */
export type ArtifactPermissionAction = 'Read' | 'Edit' | 'Delete' | 'Share';

/**
 * Tri-state decision returned by an {@link IArtifactPermissionDelegate} method:
 * - `true` or `'Allow'`: Explicitly grants the action.
 * - `false` or `'Deny'`: Explicitly denies the action.
 * - `'Defer'`: Defers evaluation to `MJ: Artifact Permissions` and artifact ownership.
 */
export type DelegatePermissionDecision = boolean | 'Allow' | 'Deny' | 'Defer';

/**
 * Context passed to {@link IArtifactPermissionDelegate} when evaluating access to an artifact
 * that has `DelegateEntityID` and `DelegateRecordID` populated.
 */
export interface ArtifactDelegateContext {
    /** Primary key of the artifact being accessed. */
    ArtifactID: string;
    /** Owner `UserID` on the `MJ: Artifacts` record. */
    ArtifactOwnerUserID: string;
    /** Foreign key `Entity.ID` of the delegating host entity. */
    DelegateEntityID: string;
    /** Canonical MJ entity name (e.g., `'MJ: Artifacts'`, `'MJ: Projects'`) of the delegating entity. */
    DelegateEntityName: string;
    /** Record primary key (or URL segment composite key) of the delegating host record. */
    DelegateRecordID: string;
    /** Metadata and RunView provider scoped to the current execution context. */
    Provider: IMetadataProvider;
    /** Internal recursion depth counter used to prevent circular delegate chains. */
    Depth?: number;
    /** Visited artifact IDs in the current resolution chain for cycle detection. */
    VisitedArtifactIDs?: ReadonlySet<string>;
    /** Per-resolution memoization map preventing repeated parent-hop evaluations. */
    Memo?: Map<string, Promise<ResolvedArtifactPermissions>>;
}

/**
 * Full resolved permission set for a `(artifactId, user)` pair.
 */
export interface ResolvedArtifactPermissions {
    /** Primary key of the evaluated artifact. */
    ArtifactID: string;
    /** Whether the user may view/read the artifact content, working state, and anchored comments. */
    CanRead: boolean;
    /** Whether the user may edit/mutate the artifact content or push Yjs updates. */
    CanEdit: boolean;
    /** Whether the user may delete the artifact. */
    CanDelete: boolean;
    /** Whether the user may share the artifact with other users. */
    CanShare: boolean;
    /** Authoritative source that produced this permission decision. */
    Source: 'Owner' | 'Delegate' | 'ArtifactPermission' | 'CollectionPermission' | 'Denied';
    /** Human-readable explanation of how the permission was resolved. */
    Reason: string;
}

/**
 * Full resolved permission set for a `(collectionId, user)` pair including ancestor collection inheritance.
 */
export interface ResolvedCollectionPermissions {
    /** Primary key of the evaluated collection. */
    CollectionID: string;
    /** Whether the user may view/read the collection and its artifacts. */
    CanRead: boolean;
    /** Whether the user may edit items in the collection. */
    CanEdit: boolean;
    /** Whether the user may delete items in the collection. */
    CanDelete: boolean;
    /** Whether the user may share the collection or artifacts within it. */
    CanShare: boolean;
    /** Authoritative source that produced this permission decision. */
    Source: 'Owner' | 'CollectionPermission' | 'AncestorCollection' | 'Denied';
    /** Human-readable explanation of how the permission was resolved. */
    Reason: string;
}

/**
 * Listener invoked when permissions change for an artifact (e.g., a share is revoked or downgraded),
 * allowing real-time collaboration rooms to immediately disconnect or downgrade active sessions.
 */
export type ArtifactPermissionChangeListener = (event: {
    ArtifactID: string;
    TargetUserID?: string;
    ChangedByUserID?: string;
}) => void | Promise<void>;

/**
 * Options controlling batched candidate permission filtering via
 * {@link ArtifactPermissionEngine.FilterArtifactsByPermissionBatch} and
 * {@link ArtifactPermissionEngine.FilterReadableArtifactIDsBatch}.
 */
export interface ArtifactBatchFilterOptions {
    /**
     * Required permission action each candidate must satisfy.
     * Defaults to `'Read'`.
     */
    RequiredAction?: ArtifactPermissionAction;
    /**
     * When `true`, duplicate candidate artifact IDs (matched case-insensitively via UUID
     * normalization) are collapsed to their first occurrence while preserving input order.
     * Defaults to `false` for object-level filtering and `true` for ID-list filtering.
     */
    Deduplicate?: boolean;
}

/**
 * Per-candidate outcome entry returned by {@link ArtifactPermissionEngine.FilterArtifactsByPermissionBatch}.
 */
export interface ArtifactBatchFilterOutcome<TCandidate> {
    /** Original candidate item (never mutated). */
    Candidate: TCandidate;
    /** Trimmed artifact ID extracted from the candidate. */
    ArtifactID: string;
    /** Whether the candidate satisfied the required permission action. */
    Allowed: boolean;
    /** Full resolved permission record explaining the allow or deny decision. */
    Permissions: ResolvedArtifactPermissions;
}

/**
 * Structured result returned by {@link ArtifactPermissionEngine.FilterArtifactsByPermissionBatch}.
 */
export interface ArtifactBatchFilterResult<TCandidate> {
    /** Authorized candidates in deterministic original input order (input array is never mutated). */
    Allowed: TCandidate[];
    /** Denied candidates in deterministic original input order. */
    Denied: TCandidate[];
    /** Per-candidate permission outcomes in original input order. */
    Outcomes: ArtifactBatchFilterOutcome<TCandidate>[];
    /** Map of resolved permissions keyed by each extracted candidate artifact ID. */
    PermissionsByArtifactID: Map<string, ResolvedArtifactPermissions>;
    /** Total candidates evaluated (after optional deduplication). */
    TotalCount: number;
    /** Count of authorized candidates. */
    AllowedCount: number;
    /** Count of denied candidates. */
    DeniedCount: number;
}

/**
 * Structured result returned by {@link ArtifactPermissionEngine.FilterReadableArtifactIDsBatch}.
 */
export interface FilterReadableArtifactIDsResult {
    /** Authorized artifact IDs in deterministic original input order. */
    AllowedIDs: string[];
    /** Denied artifact IDs in deterministic original input order. */
    DeniedIDs: string[];
    /** Per-ID resolved permissions keyed by each evaluated candidate artifact ID. */
    PermissionsByArtifactID: Map<string, ResolvedArtifactPermissions>;
}

/**
 * Contract implemented by host entities that govern permissions for attached or embedded
 * `MJ: Artifacts` via `DelegateEntityID` and `DelegateRecordID`.
 *
 * Implementations may either:
 * 1. Extend {@link BaseArtifactPermissionDelegate} and decorate with
 *    `@RegisterClass(BaseArtifactPermissionDelegate, '<EntityName>')`, or
 * 2. Register an instance directly via {@link ArtifactPermissionEngine.RegisterDelegate}.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseArtifactPermissionDelegate, 'MJ: Projects')
 * export class ProjectArtifactPermissionDelegate extends BaseArtifactPermissionDelegate {
 *     public override async CanRead(ctx: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
 *         return await checkProjectMemberAccess(ctx.Provider, ctx.DelegateRecordID, user.ID);
 *     }
 *     public override async CanEdit(ctx: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
 *         return await checkProjectEditorAccess(ctx.Provider, ctx.DelegateRecordID, user.ID);
 *     }
 * }
 * ```
 */
export interface IArtifactPermissionDelegate {
    /** Evaluates whether `user` can read the delegated artifact. */
    CanRead(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision>;
    /** Evaluates whether `user` can edit the delegated artifact. */
    CanEdit(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision>;
    /** Evaluates whether `user` can delete the delegated artifact. Defaults to `'Defer'` if omitted. */
    CanDelete?(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision>;
    /** Evaluates whether `user` can share the delegated artifact. Defaults to `'Defer'` if omitted. */
    CanShare?(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision>;
}

/**
 * Base class for `@RegisterClass(BaseArtifactPermissionDelegate, '<EntityName>')` registrations.
 * Subclasses override {@link CanRead}, {@link CanEdit}, {@link CanDelete}, and/or {@link CanShare}.
 */
export abstract class BaseArtifactPermissionDelegate implements IArtifactPermissionDelegate {
    public abstract CanRead(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision>;
    public abstract CanEdit(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision>;

    public async CanDelete(_context: ArtifactDelegateContext, _user: UserInfo): Promise<DelegatePermissionDecision> {
        return 'Defer';
    }

    public async CanShare(_context: ArtifactDelegateContext, _user: UserInfo): Promise<DelegatePermissionDecision> {
        return 'Defer';
    }
}

interface ArtifactRowProjection {
    ID: string;
    UserID: string;
    DelegateEntityID?: string | null;
    DelegateRecordID?: string | null;
}

interface ArtifactPermissionRowProjection {
    ID: string;
    ArtifactID: string;
    UserID: string;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

interface CollectionArtifactRowProjection {
    CollectionID: string;
}

interface CollectionPermissionRowProjection {
    CollectionID?: string;
    UserID?: string;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

interface CollectionRowProjection {
    ID: string;
    OwnerID?: string | null;
    ParentID?: string | null;
}

interface ArtifactOwnerRowProjection {
    ID: string;
    UserID?: string | null;
}

interface ArtifactVersionArtifactProjection {
    ID: string;
    ArtifactID: string;
}

interface CollectionVersionRowProjection {
    ArtifactVersionID?: string;
    CollectionID?: string;
}

interface PendingDefaultEntityFallbackItem {
    normId: string;
    id: string;
    Artifact: ArtifactRowProjection;
    EntityInfo: EntityInfo;
    DelegateEntityId: string;
    DelegateRecordId: string;
    CanUpdate: boolean;
    CanDelete: boolean;
    IsOwner: boolean;
}

interface ParsedFallbackRecordKey {
    Item: PendingDefaultEntityFallbackItem;
    Key: CompositeKey;
    CanonicalKey: string;
}

type FallbackRecordRow = Record<string, string | number | boolean | Date | null | undefined>;

const MAX_DELEGATE_DEPTH = 8;
const MAX_COLLECTION_ANCESTRY_DEPTH = 16;
const IN_CLAUSE_CHUNK_SIZE = 200;

/**
 * Maximum number of candidate IDs included in a single SQL `IN (...)` query chunk during
 * batched artifact permission resolution and vector/search retrieval filtering.
 */
export const ARTIFACT_PERMISSION_IN_CLAUSE_CHUNK_SIZE = IN_CLAUSE_CHUNK_SIZE;

function chunkArray<T>(items: T[], size: number): T[][] {
    if (items.length <= size) {
        return items.length === 0 ? [] : [items];
    }
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function buildQuotedInList(ids: string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
}

function buildEqOrInFilter(column: string, ids: string[]): string {
    return ids.length === 1
        ? `${column}='${EscapeSQLString(ids[0])}'`
        : `${column} IN (${buildQuotedInList(ids)})`;
}

function canUseRunViews(provider: IMetadataProvider, rv: RunView): boolean {
    if (typeof rv.RunViews !== 'function') {
        return false;
    }
    const providerHasRunViews = typeof (provider as { RunViews?: unknown }).RunViews === 'function';
    const rvHasOwnRunViews = Object.prototype.hasOwnProperty.call(rv, 'RunViews');
    return providerHasRunViews || rvHasOwnRunViews;
}
const INTERNAL_PERMISSION_QUERY_PARAMS_STORE_KEY = '___MJ_INTERNAL_ARTIFACT_PERMISSION_QUERY_PARAMS___';
const INTERNAL_PERMISSION_QUERY_SYMBOL_STORE_KEY = '___MJ_INTERNAL_ARTIFACT_PERMISSION_QUERY_SYMBOL___';
const FALLBACK_INTERNAL_PERMISSION_QUERY_WEAK_SET = new WeakSet<object>();
const FALLBACK_INTERNAL_PERMISSION_QUERY_SYMBOL = Symbol('MJInternalArtifactPermissionQuery');
function getInternalPermissionQueryWeakSet(): WeakSet<object> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[INTERNAL_PERMISSION_QUERY_PARAMS_STORE_KEY];
        if (existing instanceof WeakSet) {
            return existing;
        }
        const created = new WeakSet<object>();
        store[INTERNAL_PERMISSION_QUERY_PARAMS_STORE_KEY] = created;
        return created;
    }
    return FALLBACK_INTERNAL_PERMISSION_QUERY_WEAK_SET;
}

function getInternalPermissionQueryMarkerSymbol(): symbol {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[INTERNAL_PERMISSION_QUERY_SYMBOL_STORE_KEY];
        if (typeof existing === 'symbol') {
            return existing;
        }
        const created = Symbol('MJInternalArtifactPermissionQuery');
        store[INTERNAL_PERMISSION_QUERY_SYMBOL_STORE_KEY] = created;
        return created;
    }
    return FALLBACK_INTERNAL_PERMISSION_QUERY_SYMBOL;
}

function normalizeDecision(decision: DelegatePermissionDecision): 'Allow' | 'Deny' | 'Defer' {
    if (decision === true || decision === 'Allow') {
        return 'Allow';
    }
    if (decision === false || decision === 'Deny') {
        return 'Deny';
    }
    return 'Defer';
}

/**
 * Built-in permission delegate for child artifacts whose `DelegateEntityID` points to
 * `'MJ: Artifacts'` (for example, an inline OLE Whiteboard or embedded Artifact block
 * created inside a host Document, Slide Deck, or Spreadsheet).
 *
 * Recursively resolves `CanRead`, `CanEdit`, `CanDelete`, and `CanShare` against the parent
 * host artifact while guarding against cyclic delegation chains.
 */
@RegisterClass(BaseArtifactPermissionDelegate, 'MJ: Artifacts')
export class ParentArtifactPermissionDelegate extends BaseArtifactPermissionDelegate {
    public override async CanRead(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
        const parentPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            context.Provider,
            context.DelegateRecordID,
            user,
            (context.Depth ?? 0) + 1,
            context.VisitedArtifactIDs,
            context.Memo
        );
        return parentPerms.CanRead ? 'Allow' : 'Deny';
    }

    public override async CanEdit(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
        const parentPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            context.Provider,
            context.DelegateRecordID,
            user,
            (context.Depth ?? 0) + 1,
            context.VisitedArtifactIDs,
            context.Memo
        );
        return parentPerms.CanEdit ? 'Allow' : 'Deny';
    }

    public override async CanDelete(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
        const parentPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            context.Provider,
            context.DelegateRecordID,
            user,
            (context.Depth ?? 0) + 1,
            context.VisitedArtifactIDs,
            context.Memo
        );
        return parentPerms.CanDelete ? 'Allow' : 'Deny';
    }

    public override async CanShare(context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
        const parentPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            context.Provider,
            context.DelegateRecordID,
            user,
            (context.Depth ?? 0) + 1,
            context.VisitedArtifactIDs,
            context.Memo
        );
        return parentPerms.CanShare ? 'Allow' : 'Deny';
    }
}

/**
 * Central engine that resolves viewer-scoped permissions (`CanRead`, `CanEdit`, `CanDelete`, `CanShare`)
 * for `MJ: Artifacts` across:
 * 1. Direct ownership (`Artifact.UserID === user.ID`),
 * 2. Delegated host-entity permissions (`DelegateEntityID` + `DelegateRecordID` via {@link IArtifactPermissionDelegate}),
 * 3. Direct user grants in `MJ: Artifact Permissions`, and
 * 4. Cascaded collection grants in `MJ: Collection Artifacts` + `MJ: Collection Permissions`.
 *
 * Also dispatches real-time permission change notifications so active Yjs WebSocket rooms
 * immediately disconnect or downgrade sockets when access is revoked mid-session.
 */
export class ArtifactPermissionEngine extends BaseSingleton<ArtifactPermissionEngine> {
    private readonly _delegatesByEntityKey = new Map<string, IArtifactPermissionDelegate>();
    private readonly _changeListeners = new Set<ArtifactPermissionChangeListener>();

    protected constructor() {
        super();
    }

    /** Returns the process-wide singleton instance of {@link ArtifactPermissionEngine}. */
    public static get Instance(): ArtifactPermissionEngine {
        return super.getInstance<ArtifactPermissionEngine>();
    }

    /**
     * @internal
     * Framework-internal recursion guard for trusted in-process permission `RunView` lookups.
     * Must never be called on untrusted caller `RunViewParams`.
     *
     * Marks a {@link RunViewParams} object as an internal permission-resolution lookup so
     * server-side `MJ: Artifact Versions` / `MJ: Artifact Working States` `RunView` hooks skip
     * recursive permission evaluation even when `ProviderBase.RunView` shallow-clones `params`
     * (`{ ...params }`) or a custom `WellKnownUserSource` returns a user not matched by
     * `isServerSystemUser`.
     */
    public static MarkPermissionResolutionRecursionGuard(params: RunViewParams): void {
        if (!params || typeof params !== 'object') {
            return;
        }
        const weakSet = getInternalPermissionQueryWeakSet();
        weakSet.add(params);
        const token = Object.freeze({});
        weakSet.add(token);
        Object.defineProperty(params, getInternalPermissionQueryMarkerSymbol(), {
            value: token,
            enumerable: true,
            configurable: true,
            writable: false
        });
    }

    /**
     * @internal
     * Framework-internal recursion guard for trusted in-process permission `RunView` lookups.
     * Must never be called on untrusted caller `RunViewParams`.
     *
     * Returns `true` when `params` (or a shallow `{ ...params }` clone produced by `ProviderBase.RunView`)
     * was marked by {@link MarkPermissionResolutionRecursionGuard}.
     */
    public static IsPermissionResolutionRecursionGuard(params: object | null | undefined): boolean {
        if (!params || typeof params !== 'object') {
            return false;
        }
        const weakSet = getInternalPermissionQueryWeakSet();
        if (weakSet.has(params)) {
            return true;
        }
        const descriptor = Object.getOwnPropertyDescriptor(params, getInternalPermissionQueryMarkerSymbol());
        return Boolean(
            descriptor &&
                typeof descriptor.value === 'object' &&
                descriptor.value !== null &&
                weakSet.has(descriptor.value)
        );
    }

    /**
     * Programmatically registers an {@link IArtifactPermissionDelegate} for an entity name or entity ID.
     *
     * @param entityNameOrId - Canonical entity name (e.g., `'MJ: Projects'`) or `Entity.ID` UUID.
     * @param delegate - Delegate implementation to invoke for artifacts bound to that entity.
     */
    public RegisterDelegate(entityNameOrId: string, delegate: IArtifactPermissionDelegate): void {
        const key = (entityNameOrId ?? '').trim().toLowerCase();
        if (!key) {
            return;
        }
        this._delegatesByEntityKey.set(key, delegate);
    }

    /**
     * Removes a previously registered programmatic delegate for `entityNameOrId`.
     */
    public UnregisterDelegate(entityNameOrId: string): void {
        const key = (entityNameOrId ?? '').trim().toLowerCase();
        if (!key) {
            return;
        }
        this._delegatesByEntityKey.delete(key);
    }

    /**
     * Returns all programmatically registered delegate entity keys (lowercased entity names or IDs).
     */
    public GetRegisteredDelegateEntityKeys(): string[] {
        return Array.from(this._delegatesByEntityKey.keys());
    }

    /**
     * Whether any real-time permission change listeners are currently subscribed.
     */
    public get HasChangeListeners(): boolean {
        return this._changeListeners.size > 0;
    }

    /**
     * Subscribes to artifact permission change events (e.g., share revocation or edit downgrade).
     *
     * @returns An unsubscribe function that removes the listener.
     */
    public OnPermissionsChanged(listener: ArtifactPermissionChangeListener): () => void {
        this._changeListeners.add(listener);
        return () => {
            this._changeListeners.delete(listener);
        };
    }

    /**
     * Broadcasts a permission change event to all registered listeners (such as `ArtifactCollaborationServer`).
     */
    public async NotifyPermissionsChanged(event: {
        ArtifactID: string;
        TargetUserID?: string;
        ChangedByUserID?: string;
    }): Promise<void> {
        for (const listener of this._changeListeners) {
            try {
                await listener(event);
            } catch (err) {
                LogError(
                    `ArtifactPermissionEngine.NotifyPermissionsChanged listener error: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }
    }

    /**
     * Convenience helper that checks a single {@link ArtifactPermissionAction} (`'Read' | 'Edit' | 'Delete' | 'Share'`)
     * for `(artifactId, user)`.
     */
    public async CheckPermission(
        provider: IMetadataProvider | null | undefined,
        artifactId: string | null | undefined,
        user: UserInfo | null | undefined,
        action: ArtifactPermissionAction
    ): Promise<boolean> {
        const resolved = await this.ResolvePermissions(provider, artifactId, user);
        switch (action) {
            case 'Read':
                return resolved.CanRead;
            case 'Edit':
                return resolved.CanEdit;
            case 'Delete':
                return resolved.CanDelete;
            case 'Share':
                return resolved.CanShare;
            default:
                return false;
        }
    }

    /**
     * Resolves the full permission set (`CanRead`, `CanEdit`, `CanDelete`, `CanShare`) for `(artifactId, user)`.
     * Delegates to {@link ResolvePermissionsBatch} so single-artifact and batched resolution share
     * one implementation and cannot drift apart.
     */
    public async ResolvePermissions(
        provider: IMetadataProvider | null | undefined,
        artifactId: string | null | undefined,
        user: UserInfo | null | undefined,
        depth: number = 0,
        visitedArtifactIds?: ReadonlySet<string>,
        memo?: Map<string, Promise<ResolvedArtifactPermissions>>,
        strictThrowOnQueryError: boolean = false
    ): Promise<ResolvedArtifactPermissions> {
        const normalizedArtifactId = (artifactId ?? '').trim();
        const batch = await this.ResolvePermissionsBatch(
            provider,
            [normalizedArtifactId],
            user,
            depth,
            visitedArtifactIds,
            memo,
            strictThrowOnQueryError
        );
        return (
            batch.get(normalizedArtifactId) ??
            this.buildDenied(normalizedArtifactId, 'Artifact permission resolution failed.')
        );
    }

    /**
     * Resolves permissions for many artifacts in a staged batched pass instead of per-artifact queries:
     * - Loads only `MJ: Artifacts` headers first (`ID IN (...)`, `BypassCache: true`) so owned, missing,
     *   unregistered-delegate, and parent-delegated artifacts settle without extra permission/version queries.
     * - Loads `MJ: Artifact Permissions` (`ArtifactID IN (...)`) and `MJ: Artifact Versions` (`ArtifactID IN (...)`)
     *   only for non-owned artifacts that still require fallback evaluation (in 1 `RunViews` call on Network
     *   providers, or `user` + `systemUser` in parallel on Database providers).
     * - Walks `MJ: Collection Artifacts` -> `MJ: Collections` ancestry level-by-level (one batched query per
     *   depth level across all artifacts) and loads `MJ: Collection Permissions` once.
     * - Evaluates custom delegates (deferring fallback loading to a single batch only for non-owner defers)
     *   and `ParentArtifactPermissionDelegate` chains with exact accumulated `Depth` and `VisitedArtifactIDs`.
     *
     * Returns a `Map` keyed by each input ID in `artifactIds`.
     */
    public async ResolvePermissionsBatch(
        provider: IMetadataProvider | null | undefined,
        artifactIds: ReadonlyArray<string>,
        user: UserInfo | null | undefined,
        depth: number = 0,
        visitedArtifactIds?: ReadonlySet<string>,
        memo?: Map<string, Promise<ResolvedArtifactPermissions>>,
        strictThrowOnQueryError: boolean = false
    ): Promise<Map<string, ResolvedArtifactPermissions>> {
        const results = new Map<string, ResolvedArtifactPermissions>();
        if (!artifactIds || artifactIds.length === 0) {
            return results;
        }

        const fillAllDenied = (reason: string): Map<string, ResolvedArtifactPermissions> => {
            for (const rawId of artifactIds) {
                results.set(rawId, this.buildDenied((rawId ?? '').trim(), reason));
            }
            return results;
        };

        if (!user) {
            return fillAllDenied('Artifact ID and authenticated user context are required.');
        }
        if (user.IsActive === false) {
            return fillAllDenied('Inactive user principals cannot access governed artifact permissions.');
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return fillAllDenied(
                'Scope-limited or anonymous magic-link principals cannot access governed artifact permissions.'
            );
        }
        if (!IsValidUUID(user.ID)) {
            return fillAllDenied('Artifact ID and user ID must be valid UUIDs.');
        }
        if (depth > MAX_DELEGATE_DEPTH) {
            return fillAllDenied('Maximum artifact permission delegation depth exceeded.');
        }

        const activeProvider = provider ?? Metadata.Provider;
        if (!activeProvider) {
            return fillAllDenied('Metadata provider is not available.');
        }

        const visited = new Set<string>(visitedArtifactIds ?? []);
        const normUserId = NormalizeUUID(user.ID ?? '');
        const activeMemo = memo ?? new Map<string, Promise<ResolvedArtifactPermissions>>();

        const memoHits: Array<{ rawId: string; promise: Promise<ResolvedArtifactPermissions> }> = [];
        const toFetchByNorm = new Map<string, { normId: string; id: string; rawKeys: string[] }>();

        for (const rawId of artifactIds) {
            const trimmed = (rawId ?? '').trim();
            if (!trimmed) {
                results.set(rawId, this.buildDenied(trimmed, 'Artifact ID and authenticated user context are required.'));
                continue;
            }
            if (!IsValidUUID(trimmed)) {
                results.set(rawId, this.buildDenied(trimmed, 'Artifact ID and user ID must be valid UUIDs.'));
                continue;
            }
            const normId = NormalizeUUID(trimmed);
            if (visited.has(normId)) {
                results.set(rawId, this.buildDenied(trimmed, 'Circular artifact permission delegation detected.'));
                continue;
            }
            const memoKey = `${normId}::${normUserId}`;
            if (!strictThrowOnQueryError) {
                const cachedPromise = activeMemo.get(memoKey);
                if (cachedPromise) {
                    memoHits.push({ rawId, promise: cachedPromise });
                    continue;
                }
            }
            let entry = toFetchByNorm.get(normId);
            if (!entry) {
                entry = { normId, id: trimmed, rawKeys: [] };
                toFetchByNorm.set(normId, entry);
            }
            entry.rawKeys.push(rawId);
        }

        const toFetch = Array.from(toFetchByNorm.values());
        if (toFetch.length > 0) {
            const resolvedByNorm = await this.resolveBatchInternal(
                activeProvider,
                toFetch,
                user,
                depth,
                visited,
                activeMemo,
                strictThrowOnQueryError
            );
            for (const item of toFetch) {
                const resolved =
                    resolvedByNorm.get(item.normId) ??
                    this.buildDenied(item.id, `Artifact '${item.id}' was not found.`);
                for (const rawKey of item.rawKeys) {
                    results.set(rawKey, resolved);
                }
                if (!strictThrowOnQueryError) {
                    activeMemo.set(`${item.normId}::${normUserId}`, Promise.resolve(resolved));
                }
            }
        }

        if (memoHits.length > 0) {
            const settled = await Promise.all(memoHits.map((h) => h.promise));
            for (let i = 0; i < memoHits.length; i++) {
                results.set(memoHits[i].rawId, settled[i]);
            }
        }

        return results;
    }

    /**
     * Filters arbitrary vector/search retrieval candidates against governed artifact permissions
     * in bounded, batched queries (`<= 200` IDs per SQL `IN`-clause chunk; zero N+1 `GetEntityObject` loops).
     *
     * Supports mixed candidate batches spanning:
     * 1. Custom registered {@link IArtifactPermissionDelegate} (and built-in `ParentArtifactPermissionDelegate`),
     * 2. Default entity-level Read/Update fallback grouped by `DelegateEntityID`, and
     * 3. Non-delegated artifacts governed by ownership, direct shares, and collection ancestry.
     *
     * Fails closed (denying access with zero database queries) when `contextUser` is null/missing,
     * inactive, magic-link-scoped, or carries an invalid UUID, and fails closed per artifact when
     * `DelegateEntityID` references an unknown entity or the delegated host record is missing/hidden by RLS.
     * Preserves deterministic original input ordering without mutating `candidates`.
     */
    public async FilterArtifactsByPermissionBatch<TCandidate>(
        provider: IMetadataProvider | null | undefined,
        candidates: ReadonlyArray<TCandidate>,
        getArtifactId: (candidate: TCandidate) => string | null | undefined,
        contextUser: UserInfo | null | undefined,
        options?: ArtifactBatchFilterOptions
    ): Promise<ArtifactBatchFilterResult<TCandidate>> {
        if (!candidates || candidates.length === 0) {
            return {
                Allowed: [],
                Denied: [],
                Outcomes: [],
                PermissionsByArtifactID: new Map<string, ResolvedArtifactPermissions>(),
                TotalCount: 0,
                AllowedCount: 0,
                DeniedCount: 0
            };
        }

        const requiredAction: ArtifactPermissionAction = options?.RequiredAction ?? 'Read';
        const deduplicate = options?.Deduplicate === true;
        const entries = this.extractBatchFilterEntries(candidates, getArtifactId, deduplicate);

        const contextCheck = this.validateBatchFilterContext(provider, contextUser);
        if (!contextCheck.ActiveProvider || contextCheck.ErrorReason !== null) {
            return this.buildAllDeniedBatchFilterResult(entries, contextCheck.ErrorReason ?? 'Access denied.');
        }

        const uniqueValidIds = this.collectUniqueValidArtifactIds(entries);
        const permissionsByUuid = new UUIDMap<ResolvedArtifactPermissions>();
        if (uniqueValidIds.length > 0) {
            const memo = new Map<string, Promise<ResolvedArtifactPermissions>>();
            const resolved = await this.ResolvePermissionsBatch(
                contextCheck.ActiveProvider,
                uniqueValidIds,
                contextUser,
                0,
                undefined,
                memo,
                false
            );
            for (const [id, perms] of resolved.entries()) {
                permissionsByUuid.Set(id, perms);
            }
        }

        return this.assembleBatchFilterResult(entries, permissionsByUuid, requiredAction);
    }

    /**
     * Convenience wrapper over {@link FilterArtifactsByPermissionBatch} for filtering raw
     * candidate `ArtifactID` lists returned by vector/search retrieval pipelines.
     *
     * Deduplicates candidate UUIDs case-insensitively by default (`Deduplicate: true`) while
     * preserving first-appearance ordering and exposing per-artifact permission outcomes.
     */
    public async FilterReadableArtifactIDsBatch(
        provider: IMetadataProvider | null | undefined,
        candidateArtifactIds: ReadonlyArray<string>,
        contextUser: UserInfo | null | undefined,
        options?: ArtifactBatchFilterOptions
    ): Promise<FilterReadableArtifactIDsResult> {
        const result = await this.FilterArtifactsByPermissionBatch(
            provider,
            candidateArtifactIds,
            (id) => id,
            contextUser,
            {
                RequiredAction: options?.RequiredAction ?? 'Read',
                Deduplicate: options?.Deduplicate ?? true
            }
        );
        return {
            AllowedIDs: result.Allowed,
            DeniedIDs: result.Denied,
            PermissionsByArtifactID: result.PermissionsByArtifactID
        };
    }

    private extractBatchFilterEntries<TCandidate>(
        candidates: ReadonlyArray<TCandidate>,
        getArtifactId: (candidate: TCandidate) => string | null | undefined,
        deduplicate: boolean
    ): Array<{ Candidate: TCandidate; ArtifactID: string }> {
        const entries: Array<{ Candidate: TCandidate; ArtifactID: string }> = [];
        const seenValidIds = new UUIDSet();
        const seenInvalidKeys = new Set<string>();

        for (const candidate of candidates) {
            const artifactId = (getArtifactId(candidate) ?? '').trim();
            if (deduplicate) {
                if (IsValidUUID(artifactId)) {
                    if (seenValidIds.Has(artifactId)) {
                        continue;
                    }
                    seenValidIds.Add(artifactId);
                } else {
                    const invalidKey = artifactId.toLowerCase();
                    if (seenInvalidKeys.has(invalidKey)) {
                        continue;
                    }
                    seenInvalidKeys.add(invalidKey);
                }
            }
            entries.push({ Candidate: candidate, ArtifactID: artifactId });
        }
        return entries;
    }

    private collectUniqueValidArtifactIds<TCandidate>(
        entries: ReadonlyArray<{ Candidate: TCandidate; ArtifactID: string }>
    ): string[] {
        const seen = new UUIDSet();
        const unique: string[] = [];
        for (const entry of entries) {
            if (entry.ArtifactID && IsValidUUID(entry.ArtifactID) && !seen.Has(entry.ArtifactID)) {
                seen.Add(entry.ArtifactID);
                unique.push(entry.ArtifactID);
            }
        }
        return unique;
    }

    private validateBatchFilterContext(
        provider: IMetadataProvider | null | undefined,
        contextUser: UserInfo | null | undefined
    ): { ActiveProvider: IMetadataProvider; ErrorReason: null } | { ActiveProvider: null; ErrorReason: string } {
        if (!contextUser) {
            return {
                ActiveProvider: null,
                ErrorReason: 'Explicit authenticated contextUser is required for batched artifact permission filtering.'
            };
        }
        if (contextUser.IsActive === false) {
            return {
                ActiveProvider: null,
                ErrorReason: 'Inactive user principals cannot access governed artifact permissions.'
            };
        }
        if (contextUser.IsMagicLinkAnonymous || contextUser.MagicLinkScope) {
            return {
                ActiveProvider: null,
                ErrorReason: 'Scope-limited or anonymous magic-link principals cannot access governed artifact permissions.'
            };
        }
        if (!IsValidUUID(contextUser.ID)) {
            return {
                ActiveProvider: null,
                ErrorReason: 'Authenticated contextUser must have a valid UUID.'
            };
        }
        const activeProvider = provider ?? Metadata.Provider;
        if (!activeProvider) {
            return {
                ActiveProvider: null,
                ErrorReason: 'Metadata provider is not available.'
            };
        }
        return { ActiveProvider: activeProvider, ErrorReason: null };
    }

    private buildAllDeniedBatchFilterResult<TCandidate>(
        entries: ReadonlyArray<{ Candidate: TCandidate; ArtifactID: string }>,
        reason: string
    ): ArtifactBatchFilterResult<TCandidate> {
        const denied: TCandidate[] = [];
        const outcomes: ArtifactBatchFilterOutcome<TCandidate>[] = [];
        const permsById = new Map<string, ResolvedArtifactPermissions>();

        for (const entry of entries) {
            const perms = this.buildDenied(entry.ArtifactID, reason);
            denied.push(entry.Candidate);
            outcomes.push({
                Candidate: entry.Candidate,
                ArtifactID: entry.ArtifactID,
                Allowed: false,
                Permissions: perms
            });
            if (!permsById.has(entry.ArtifactID)) {
                permsById.set(entry.ArtifactID, perms);
            }
        }

        return {
            Allowed: [],
            Denied: denied,
            Outcomes: outcomes,
            PermissionsByArtifactID: permsById,
            TotalCount: entries.length,
            AllowedCount: 0,
            DeniedCount: denied.length
        };
    }

    private assembleBatchFilterResult<TCandidate>(
        entries: ReadonlyArray<{ Candidate: TCandidate; ArtifactID: string }>,
        permissionsByUuid: UUIDMap<ResolvedArtifactPermissions>,
        requiredAction: ArtifactPermissionAction
    ): ArtifactBatchFilterResult<TCandidate> {
        const allowed: TCandidate[] = [];
        const denied: TCandidate[] = [];
        const outcomes: ArtifactBatchFilterOutcome<TCandidate>[] = [];
        const permsById = new Map<string, ResolvedArtifactPermissions>();

        for (const entry of entries) {
            const perms = this.resolveEntryPermission(entry.ArtifactID, permissionsByUuid);
            const isAllowed = this.hasRequiredPermissionAction(perms, requiredAction);
            if (isAllowed) {
                allowed.push(entry.Candidate);
            } else {
                denied.push(entry.Candidate);
            }
            outcomes.push({
                Candidate: entry.Candidate,
                ArtifactID: entry.ArtifactID,
                Allowed: isAllowed,
                Permissions: perms
            });
            if (!permsById.has(entry.ArtifactID)) {
                permsById.set(entry.ArtifactID, perms);
            }
        }

        return {
            Allowed: allowed,
            Denied: denied,
            Outcomes: outcomes,
            PermissionsByArtifactID: permsById,
            TotalCount: entries.length,
            AllowedCount: allowed.length,
            DeniedCount: denied.length
        };
    }

    private resolveEntryPermission(
        artifactId: string,
        permissionsByUuid: UUIDMap<ResolvedArtifactPermissions>
    ): ResolvedArtifactPermissions {
        if (!artifactId) {
            return this.buildDenied('', 'Artifact ID is required.');
        }
        if (!IsValidUUID(artifactId)) {
            return this.buildDenied(artifactId, 'Artifact ID must be a valid UUID.');
        }
        return (
            permissionsByUuid.Get(artifactId) ??
            this.buildDenied(artifactId, `Artifact '${artifactId}' was not found.`)
        );
    }

    private hasRequiredPermissionAction(
        perms: ResolvedArtifactPermissions,
        action: ArtifactPermissionAction
    ): boolean {
        switch (action) {
            case 'Read':
                return perms.CanRead;
            case 'Edit':
                return perms.CanRead && perms.CanEdit;
            case 'Delete':
                return perms.CanRead && perms.CanDelete;
            case 'Share':
                return perms.CanRead && perms.CanShare;
            default:
                return false;
        }
    }

    /**
     * Evaluates default entity-level Read/Update/Delete permission fallback for an artifact
     * whose `DelegateEntityID` has no custom {@link IArtifactPermissionDelegate} registered.
     *
     * Fails closed whenever `provider`, `contextUser`, `delegateEntityId`, or `delegateRecordId`
     * is missing/invalid, when `delegateEntityId` is unknown in metadata, when `contextUser`
     * lacks entity-level `CanRead` permission, or when the target host record is inaccessible
     * under `contextUser`'s row-level security scope.
     */
    public async EvaluateDefaultEntityFallback(
        provider: IMetadataProvider | null | undefined,
        delegateEntityId: string | null | undefined,
        delegateRecordId: string | null | undefined,
        contextUser: UserInfo | null | undefined,
        artifactId: string = '',
        isOwner: boolean = false
    ): Promise<ResolvedArtifactPermissions> {
        const trimmedArtifactId = (artifactId ?? '').trim();
        const trimmedEntityId = (delegateEntityId ?? '').trim();
        const trimmedRecordId = (delegateRecordId ?? '').trim();
        if (!contextUser || !IsValidUUID(contextUser.ID)) {
            return this.buildDenied(trimmedArtifactId, 'Authenticated user context with a valid UUID is required.');
        }
        if (contextUser.IsActive === false) {
            return this.buildDenied(trimmedArtifactId, 'Inactive user principals cannot access governed artifact permissions.');
        }
        if (contextUser.IsMagicLinkAnonymous || contextUser.MagicLinkScope) {
            return this.buildDenied(
                trimmedArtifactId,
                'Scope-limited or anonymous magic-link principals cannot access governed artifact permissions.'
            );
        }
        const activeProvider = provider ?? Metadata.Provider;
        if (!activeProvider || !trimmedEntityId || !trimmedRecordId) {
            return this.buildDenied(trimmedArtifactId, 'Provider, DelegateEntityID, and DelegateRecordID are required.');
        }
        const entitiesById: UUIDMap<EntityInfo> | null =
            typeof activeProvider.EntityByID !== 'function' && Array.isArray(activeProvider.Entities)
                ? IndexByUUID(activeProvider.Entities, (e) => e.ID)
                : null;
        const entityInfo = this.lookupEntityInfo(activeProvider, trimmedEntityId, entitiesById);
        const artifactStub: ArtifactRowProjection = {
            ID: trimmedArtifactId,
            UserID: isOwner ? contextUser.ID : '',
            DelegateEntityID: trimmedEntityId,
            DelegateRecordID: trimmedRecordId
        };
        const precheck = this.precheckDefaultEntityFallback(
            artifactStub,
            entityInfo,
            trimmedEntityId,
            trimmedRecordId,
            contextUser,
            isOwner
        );
        if (precheck.Kind === 'denied') {
            return precheck.Result;
        }
        const resolvedByNorm = new Map<string, ResolvedArtifactPermissions>();
        const key = trimmedArtifactId ? NormalizeUUID(trimmedArtifactId) : 'default-fallback-single';
        await this.resolveDefaultEntityFallbackBatch(
            activeProvider,
            [
                {
                    normId: key,
                    id: trimmedArtifactId,
                    Artifact: artifactStub,
                    EntityInfo: precheck.EntityInfo,
                    DelegateEntityId: trimmedEntityId,
                    DelegateRecordId: trimmedRecordId,
                    CanUpdate: precheck.CanUpdate,
                    CanDelete: precheck.CanDelete,
                    IsOwner: isOwner
                }
            ],
            contextUser,
            resolvedByNorm,
            false
        );
        return (
            resolvedByNorm.get(key) ??
            this.buildDenied(trimmedArtifactId, `Host record '${trimmedRecordId}' is inaccessible.`)
        );
    }

    private precheckDefaultEntityFallback(
        artifact: ArtifactRowProjection,
        entityInfo: EntityInfo | undefined,
        delegateEntityId: string,
        delegateRecordId: string,
        user: UserInfo,
        isOwner: boolean
    ):
        | { Kind: 'denied'; Result: ResolvedArtifactPermissions; LogMessage: string }
        | { Kind: 'check-record'; EntityInfo: EntityInfo; CanUpdate: boolean; CanDelete: boolean; IsOwner: boolean } {
        if (!entityInfo) {
            const reason = `No permission delegate is registered and delegating entity '${delegateEntityId}' was not found in metadata.`;
            return {
                Kind: 'denied',
                Result: this.buildDenied(artifact.ID, reason),
                LogMessage: `${reason} (artifact '${artifact.ID}', record '${delegateRecordId}').`
            };
        }
        const entityLabel = entityInfo.Name || delegateEntityId;
        if (typeof entityInfo.GetUserPermisions !== 'function') {
            const reason = `No permission delegate is registered for delegating entity '${entityLabel}' (${delegateRecordId}) and entity permission metadata is unavailable.`;
            return {
                Kind: 'denied',
                Result: this.buildDenied(artifact.ID, reason),
                LogMessage: `${reason} (artifact '${artifact.ID}').`
            };
        }
        const entityPerms = entityInfo.GetUserPermisions(user);
        if (!entityPerms?.CanRead) {
            const reason = `No permission delegate is registered for delegating entity '${entityLabel}' (${delegateRecordId}) and user lacks entity-level Read permission.`;
            return {
                Kind: 'denied',
                Result: this.buildDenied(artifact.ID, reason),
                LogMessage: `${reason} (artifact '${artifact.ID}', user '${user.ID}').`
            };
        }
        const primaryKeys = Array.isArray(entityInfo.PrimaryKeys) ? entityInfo.PrimaryKeys : [];
        if (primaryKeys.length === 0) {
            const reason = `No permission delegate is registered for delegating entity '${entityLabel}' (${delegateRecordId}) and entity primary key metadata is unavailable.`;
            return {
                Kind: 'denied',
                Result: this.buildDenied(artifact.ID, reason),
                LogMessage: `${reason} (artifact '${artifact.ID}').`
            };
        }
        return {
            Kind: 'check-record',
            EntityInfo: entityInfo,
            CanUpdate: Boolean(entityPerms.CanUpdate),
            CanDelete: Boolean(entityPerms.CanDelete),
            IsOwner: isOwner
        };
    }

    private async resolveDefaultEntityFallbackBatch(
        provider: IMetadataProvider,
        items: ReadonlyArray<PendingDefaultEntityFallbackItem>,
        user: UserInfo,
        resolvedByNorm: Map<string, ResolvedArtifactPermissions>,
        strictThrowOnQueryError: boolean
    ): Promise<void> {
        const grouped = new Map<string, { EntityInfo: EntityInfo; Items: PendingDefaultEntityFallbackItem[] }>();
        for (const item of items) {
            const normEntId = NormalizeUUID(item.DelegateEntityId);
            let group = grouped.get(normEntId);
            if (!group) {
                group = { EntityInfo: item.EntityInfo, Items: [] };
                grouped.set(normEntId, group);
            }
            group.Items.push(item);
        }
        await Promise.all(
            Array.from(grouped.values()).map((group) =>
                this.resolveFallbackEntityGroup(
                    provider,
                    group.EntityInfo,
                    group.Items,
                    user,
                    resolvedByNorm,
                    strictThrowOnQueryError
                )
            )
        );
    }

    private async resolveFallbackEntityGroup(
        provider: IMetadataProvider,
        entityInfo: EntityInfo,
        items: ReadonlyArray<PendingDefaultEntityFallbackItem>,
        user: UserInfo,
        resolvedByNorm: Map<string, ResolvedArtifactPermissions>,
        strictThrowOnQueryError: boolean
    ): Promise<void> {
        const parsedItems: ParsedFallbackRecordKey[] = [];
        for (const item of items) {
            const parsed = this.parseDelegateRecordKey(entityInfo, item);
            if (!parsed) {
                resolvedByNorm.set(
                    item.normId,
                    this.buildDenied(
                        item.Artifact.ID,
                        `Invalid DelegateRecordID '${item.DelegateRecordId}' for delegating entity '${entityInfo.Name}'.`
                    )
                );
                continue;
            }
            parsedItems.push(parsed);
        }
        if (parsedItems.length === 0) {
            return;
        }

        const queries = this.buildFallbackRecordQueries(entityInfo, parsedItems);
        const accessibleKeys = await this.executeFallbackRecordQueries(
            provider,
            entityInfo,
            queries,
            user,
            strictThrowOnQueryError
        );
        if (accessibleKeys === null) {
            for (const entry of parsedItems) {
                resolvedByNorm.set(
                    entry.Item.normId,
                    this.buildDenied(
                        entry.Item.Artifact.ID,
                        `Failed verifying host record '${entry.Item.DelegateRecordId}' on delegating entity '${entityInfo.Name}'.`
                    )
                );
            }
            return;
        }

        for (const entry of parsedItems) {
            const { Item: item, CanonicalKey: canonicalKey } = entry;
            if (!accessibleKeys.has(canonicalKey)) {
                resolvedByNorm.set(
                    item.normId,
                    this.buildDenied(
                        item.Artifact.ID,
                        `No permission delegate is registered for delegating entity '${entityInfo.Name}' (${item.DelegateRecordId}) and host record is inaccessible.`
                    )
                );
                continue;
            }
            resolvedByNorm.set(item.normId, {
                ArtifactID: item.Artifact.ID,
                CanRead: true,
                CanEdit: item.CanUpdate,
                CanDelete: item.CanDelete,
                CanShare: item.CanUpdate || item.IsOwner,
                Source: 'Delegate',
                Reason: `Permissions resolved via default entity-level fallback on '${entityInfo.Name}' (${item.DelegateRecordId}).`
            });
        }
    }

    private parseDelegateRecordKey(
        entityInfo: EntityInfo,
        item: PendingDefaultEntityFallbackItem
    ): ParsedFallbackRecordKey | null {
        try {
            const key = CompositeKey.FromRecordID(entityInfo, item.DelegateRecordId);
            if (!key.KeyValuePairs || key.KeyValuePairs.length !== entityInfo.PrimaryKeys.length) {
                return null;
            }
            const canonicalKey = this.canonicalizeCompositeKey(entityInfo, key);
            if (!canonicalKey) {
                return null;
            }
            return { Item: item, Key: key, CanonicalKey: canonicalKey };
        } catch {
            return null;
        }
    }

    private canonicalizeCompositeKey(entityInfo: EntityInfo, key: CompositeKey): string | null {
        const parts: string[] = [];
        for (const pk of entityInfo.PrimaryKeys) {
            const pair = key.KeyValuePairs.find(
                (kvp) => (kvp.FieldName ?? '').trim().toLowerCase() === pk.Name.trim().toLowerCase()
            );
            if (!pair || pair.Value === null || pair.Value === undefined) {
                return null;
            }
            const rawStr = String(pair.Value).trim();
            if (!rawStr) {
                return null;
            }
            const normVal = IsValidUUID(rawStr) ? NormalizeUUID(rawStr) : rawStr.toLowerCase();
            parts.push(`${pk.Name.trim().toLowerCase()}=${normVal}`);
        }
        return parts.join('|');
    }

    private buildFallbackRecordQueries(
        entityInfo: EntityInfo,
        parsedItems: ReadonlyArray<ParsedFallbackRecordKey>
    ): RunViewParams[] {
        const pkFields = entityInfo.PrimaryKeys.map((pk) => pk.Name);
        const dedupedByCanonical = new Map<string, ParsedFallbackRecordKey>();
        for (const entry of parsedItems) {
            if (!dedupedByCanonical.has(entry.CanonicalKey)) {
                dedupedByCanonical.set(entry.CanonicalKey, entry);
            }
        }
        const uniqueEntries = Array.from(dedupedByCanonical.values());
        const chunks = chunkArray(uniqueEntries, IN_CLAUSE_CHUNK_SIZE);

        return chunks.map((chunk) => {
            let extraFilter: string;
            if (entityInfo.PrimaryKeys.length === 1) {
                const pkColName = entityInfo.FirstPrimaryKey.Name; // first-pk-ok: guarded by PrimaryKeys.length === 1
                const rawVals = chunk.map((entry) => String(entry.Key.KeyValuePairs[0].Value));
                extraFilter = buildEqOrInFilter(pkColName, rawVals);
            } else {
                extraFilter = chunk.map((entry) => `(${entry.Key.ToWhereClause()})`).join(' OR ');
            }
            const params: RunViewParams = {
                EntityName: entityInfo.Name,
                ExtraFilter: extraFilter,
                Fields: pkFields,
                IgnoreMaxRows: true,
                SkipTotalRowCount: true,
                BypassCache: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(params);
            return params;
        });
    }

    private async executeFallbackRecordQueries(
        provider: IMetadataProvider,
        entityInfo: EntityInfo,
        queries: ReadonlyArray<RunViewParams>,
        user: UserInfo,
        strictThrowOnQueryError: boolean
    ): Promise<Set<string> | null> {
        const accessible = new Set<string>();
        const rv = RunView.FromMetadataProvider(provider);
        try {
            const responses =
                queries.length === 1
                    ? [await rv.RunView<FallbackRecordRow>(queries[0], user)]
                    : canUseRunViews(provider, rv)
                        ? await rv.RunViews(Array.from(queries), user)
                        : await Promise.all(queries.map((q) => rv.RunView<FallbackRecordRow>(q, user)));

            for (const res of responses) {
                if (!res?.Success) {
                    const errMsg = res?.ErrorMessage || `Failed verifying host records on '${entityInfo.Name}'.`;
                    LogError(`ArtifactPermissionEngine.executeFallbackRecordQueries error: ${errMsg}`);
                    if (strictThrowOnQueryError) {
                        throw new Error(errMsg);
                    }
                    return null;
                }
                const rows: ReadonlyArray<FallbackRecordRow> = Array.isArray(res.Results) ? res.Results : [];
                for (const row of rows) {
                    if (!row || typeof row !== 'object') {
                        continue;
                    }
                    const rowKey = CompositeKey.FromEntityRecord(entityInfo, row);
                    const canonical = this.canonicalizeCompositeKey(entityInfo, rowKey);
                    if (canonical) {
                        accessible.add(canonical);
                    }
                }
            }
            return accessible;
        } catch (err) {
            LogError(
                `ArtifactPermissionEngine.executeFallbackRecordQueries error for '${entityInfo.Name}' (user '${user.ID}'): ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            if (strictThrowOnQueryError) {
                throw err;
            }
            return null;
        }
    }

    private lookupEntityInfo(
        provider: IMetadataProvider,
        entityId: string,
        entitiesById: UUIDMap<EntityInfo> | null
    ): EntityInfo | undefined {
        if (typeof provider.EntityByID === 'function') {
            return provider.EntityByID(entityId);
        }
        return entitiesById?.Get(entityId);
    }

    private async resolveBatchInternal(
        provider: IMetadataProvider,
        initialItems: ReadonlyArray<{ normId: string; id: string; rawKeys: string[] }>,
        user: UserInfo,
        depth: number,
        visited: ReadonlySet<string>,
        memo: Map<string, Promise<ResolvedArtifactPermissions>>,
        strictThrowOnQueryError: boolean
    ): Promise<Map<string, ResolvedArtifactPermissions>> {
        const entitiesById: UUIDMap<EntityInfo> | null =
            typeof provider.EntityByID !== 'function' && Array.isArray(provider.Entities)
                ? IndexByUUID(provider.Entities, (e) => e.ID)
                : null;

        const normUserId = NormalizeUUID(user.ID ?? '');
        const resolvedByNorm = new Map<string, ResolvedArtifactPermissions>();
        const loadedNormIds = new Set<string>();
        const parentDelegateMetaByNormId = new Map<
            string,
            { Artifact: ArtifactRowProjection; DelegateEntityName: string; DelegateEntityId: string; DelegateRecordId: string }
        >();
        const customDelegatedByNormId = new Map<
            string,
            {
                normId: string;
                id: string;
                Artifact: ArtifactRowProjection;
                Delegate: IArtifactPermissionDelegate;
                DelegateEntityName: string;
                DelegateEntityId: string;
                DelegateRecordId: string;
            }
        >();

        // Iterative wave loading: each wave loads ONLY MJ: Artifacts first so owned, missing, unregistered-delegate,
        // and parent-delegated artifacts settle without querying MJ: Artifact Permissions or MJ: Artifact Versions.
        let waveItems: Array<{ normId: string; id: string }> = initialItems.map((i) => ({ normId: i.normId, id: i.id }));
        const maxExtraWaves = Math.max(0, MAX_DELEGATE_DEPTH - depth);

        for (let wave = 0; wave <= maxExtraWaves && waveItems.length > 0; wave++) {
            for (const w of waveItems) {
                loadedNormIds.add(w.normId);
            }

            const artifactsInWave = await this.loadArtifactRowsBatch(provider, waveItems, user, strictThrowOnQueryError);
            const nonDelegatedNonOwners: Array<{ normId: string; id: string; Artifact: ArtifactRowProjection }> = [];
            const defaultFallbackItems: PendingDefaultEntityFallbackItem[] = [];
            const nextWaveParentsByNorm = new Map<string, { normId: string; id: string }>();

            for (const w of waveItems) {
                const artifact = artifactsInWave.get(w.normId);
                if (!artifact) {
                    resolvedByNorm.set(w.normId, this.buildDenied(w.id, `Artifact '${w.id}' was not found.`));
                    continue;
                }

                const isOwner = Boolean(artifact.UserID && UUIDsEqual(artifact.UserID, user.ID));
                if (artifact.DelegateEntityID) {
                    const delegateRecordId = (artifact.DelegateRecordID ?? '').trim();
                    if (!delegateRecordId) {
                        resolvedByNorm.set(
                            w.normId,
                            this.buildDenied(
                                artifact.ID,
                                `Artifact '${artifact.ID}' specifies DelegateEntityID '${artifact.DelegateEntityID}' without a DelegateRecordID.`
                            )
                        );
                        continue;
                    }
                    const entityInfo = this.lookupEntityInfo(provider, artifact.DelegateEntityID, entitiesById);
                    const delegateEntityName = entityInfo?.Name ?? '';
                    const delegate = this.resolveDelegateInstance(artifact.DelegateEntityID, delegateEntityName);
                    if (!delegate) {
                        const precheck = this.precheckDefaultEntityFallback(
                            artifact,
                            entityInfo,
                            artifact.DelegateEntityID,
                            delegateRecordId,
                            user,
                            isOwner
                        );
                        if (precheck.Kind === 'denied') {
                            LogError(precheck.LogMessage);
                            resolvedByNorm.set(w.normId, precheck.Result);
                        } else {
                            defaultFallbackItems.push({
                                normId: w.normId,
                                id: w.id,
                                Artifact: artifact,
                                EntityInfo: precheck.EntityInfo,
                                DelegateEntityId: artifact.DelegateEntityID,
                                DelegateRecordId: delegateRecordId,
                                CanUpdate: precheck.CanUpdate,
                                CanDelete: precheck.CanDelete,
                                IsOwner: isOwner
                            });
                        }
                        continue;
                    }
                    if (delegate instanceof ParentArtifactPermissionDelegate) {
                        parentDelegateMetaByNormId.set(w.normId, {
                            Artifact: artifact,
                            DelegateEntityName: delegateEntityName,
                            DelegateEntityId: artifact.DelegateEntityID,
                            DelegateRecordId: delegateRecordId
                        });
                        if (wave < maxExtraWaves && IsValidUUID(delegateRecordId)) {
                            const parentNorm = NormalizeUUID(delegateRecordId);
                            const parentMemoKey = `${parentNorm}::${normUserId}`;
                            const hasMemoHit = !strictThrowOnQueryError && memo.has(parentMemoKey);
                            if (!loadedNormIds.has(parentNorm) && !visited.has(parentNorm) && !hasMemoHit) {
                                nextWaveParentsByNorm.set(parentNorm, { normId: parentNorm, id: delegateRecordId });
                            }
                        }
                    } else {
                        customDelegatedByNormId.set(w.normId, {
                            normId: w.normId,
                            id: w.id,
                            Artifact: artifact,
                            Delegate: delegate,
                            DelegateEntityName: delegateEntityName,
                            DelegateEntityId: artifact.DelegateEntityID,
                            DelegateRecordId: delegateRecordId
                        });
                    }
                } else if (isOwner) {
                    resolvedByNorm.set(w.normId, this.evaluateNonDelegatedArtifact(artifact, user, [], []));
                } else {
                    nonDelegatedNonOwners.push({ normId: w.normId, id: w.id, Artifact: artifact });
                }
            }

            if (defaultFallbackItems.length > 0) {
                await this.resolveDefaultEntityFallbackBatch(
                    provider,
                    defaultFallbackItems,
                    user,
                    resolvedByNorm,
                    strictThrowOnQueryError
                );
            }

            if (nonDelegatedNonOwners.length > 0) {
                const { DirectPermsByNormArtifactId, CollectionPermsByNormArtifactId } =
                    await this.loadDirectAndCollectionBatch(provider, nonDelegatedNonOwners, user, strictThrowOnQueryError);
                for (const item of nonDelegatedNonOwners) {
                    resolvedByNorm.set(
                        item.normId,
                        this.evaluateNonDelegatedArtifact(
                            item.Artifact,
                            user,
                            DirectPermsByNormArtifactId.get(item.normId) ?? [],
                            CollectionPermsByNormArtifactId.get(item.normId) ?? []
                        )
                    );
                }
            }

            waveItems = Array.from(nextWaveParentsByNorm.values());
        }

        // Seed a child memo with already-settled entries (never unresolved promises) so custom delegates cannot deadlock
        const settledMemo = new Map<string, Promise<ResolvedArtifactPermissions>>(memo);
        if (!strictThrowOnQueryError) {
            for (const [normId, resolved] of resolvedByNorm.entries()) {
                settledMemo.set(`${normId}::${normUserId}`, Promise.resolve(resolved));
            }
        }

        interface ParentDelegateMeta {
            Artifact: ArtifactRowProjection;
            DelegateEntityName: string;
            DelegateEntityId: string;
            DelegateRecordId: string;
        }
        interface PendingCustomInvocation {
            Kind: 'direct' | 'parent-chain';
            StartNormId: string;
            StartMeta?: ParentDelegateMeta;
            TargetNormId: string;
            Depth: number;
            Visited: ReadonlySet<string>;
        }

        const parentResolvedByNorm = new Map<string, ResolvedArtifactPermissions>();
        const pendingCustomInvocations: PendingCustomInvocation[] = [];
        const pendingMemoParentChains: Array<{
            StartNormId: string;
            StartMeta: ParentDelegateMeta;
            Promise: Promise<ResolvedArtifactPermissions>;
        }> = [];

        // Walk parent-delegate chains for initialItems, capturing exact accumulated Depth & VisitedArtifactIDs
        // whenever a chain terminates at a custom-delegated artifact.
        for (const item of initialItems) {
            if (customDelegatedByNormId.has(item.normId)) {
                const directVisited = new Set<string>(visited);
                directVisited.add(item.normId);
                pendingCustomInvocations.push({
                    Kind: 'direct',
                    StartNormId: item.normId,
                    TargetNormId: item.normId,
                    Depth: depth,
                    Visited: directVisited
                });
                continue;
            }
            const startMeta = parentDelegateMetaByNormId.get(item.normId);
            if (!startMeta) {
                continue;
            }
            const walk = this.walkParentDelegateChain(
                item.normId,
                startMeta,
                depth,
                visited,
                normUserId,
                strictThrowOnQueryError,
                parentDelegateMetaByNormId,
                customDelegatedByNormId,
                resolvedByNorm,
                memo
            );
            if (walk.Kind === 'resolved') {
                parentResolvedByNorm.set(item.normId, walk.Result);
            } else if (walk.Kind === 'memo') {
                pendingMemoParentChains.push({
                    StartNormId: item.normId,
                    StartMeta: startMeta,
                    Promise: walk.Promise
                });
            } else {
                pendingCustomInvocations.push({
                    Kind: 'parent-chain',
                    StartNormId: item.normId,
                    StartMeta: startMeta,
                    TargetNormId: walk.CustomNormId,
                    Depth: walk.Depth,
                    Visited: walk.Visited
                });
            }
        }

        if (pendingMemoParentChains.length > 0) {
            const memoParents = await Promise.all(pendingMemoParentChains.map((p) => p.Promise));
            for (let i = 0; i < pendingMemoParentChains.length; i++) {
                const entry = pendingMemoParentChains[i];
                parentResolvedByNorm.set(entry.StartNormId, this.formatParentDelegateResult(entry.StartMeta, memoParents[i]));
            }
        }

        // Evaluate custom delegates in parallel with exact accumulated Depth & VisitedArtifactIDs;
        // batch-load direct + collection fallback rows ONCE only for non-owner invocations that returned 'Defer'.
        if (pendingCustomInvocations.length > 0) {
            const evaluated = await Promise.all(
                pendingCustomInvocations.map(async (inv) => {
                    const target = customDelegatedByNormId.get(inv.TargetNormId)!;
                    const decisions = await this.evaluateCustomDelegateDecisions(
                        provider,
                        target.Delegate,
                        target.Artifact,
                        target.DelegateEntityId,
                        target.DelegateEntityName,
                        target.DelegateRecordId,
                        user,
                        inv.Depth,
                        inv.Visited,
                        settledMemo
                    );
                    return { inv, target, decisions };
                })
            );

            const customNeedingFallback = new Map<string, { normId: string; id: string }>();
            for (const { target, decisions } of evaluated) {
                const isOwner = Boolean(target.Artifact.UserID && UUIDsEqual(target.Artifact.UserID, user.ID));
                if (decisions.NeedsFallback && !isOwner) {
                    customNeedingFallback.set(target.normId, { normId: target.normId, id: target.id });
                }
            }

            let fallbackDirect = new Map<string, ArtifactPermissionRowProjection[]>();
            let fallbackCollections = new Map<string, CollectionPermissionRowProjection[]>();
            if (customNeedingFallback.size > 0) {
                const loadedFallback = await this.loadDirectAndCollectionBatch(
                    provider,
                    Array.from(customNeedingFallback.values()),
                    user,
                    strictThrowOnQueryError
                );
                fallbackDirect = loadedFallback.DirectPermsByNormArtifactId;
                fallbackCollections = loadedFallback.CollectionPermsByNormArtifactId;
            }

            for (const { inv, target, decisions } of evaluated) {
                const finalized = this.finalizeCustomDelegateDecisions(
                    target.Artifact,
                    target.DelegateEntityId,
                    target.DelegateEntityName,
                    target.DelegateRecordId,
                    decisions,
                    user,
                    fallbackDirect.get(target.normId) ?? [],
                    fallbackCollections.get(target.normId) ?? []
                );
                if (inv.Kind === 'direct') {
                    resolvedByNorm.set(inv.StartNormId, finalized);
                } else {
                    parentResolvedByNorm.set(inv.StartNormId, this.formatParentDelegateResult(inv.StartMeta!, finalized));
                }
            }
        }

        for (const [normId, result] of parentResolvedByNorm.entries()) {
            resolvedByNorm.set(normId, result);
        }

        return resolvedByNorm;
    }

    private formatParentDelegateResult(
        startMeta: { Artifact: ArtifactRowProjection; DelegateEntityName: string; DelegateEntityId: string; DelegateRecordId: string },
        parentPerms: ResolvedArtifactPermissions
    ): ResolvedArtifactPermissions {
        if (!parentPerms.CanRead) {
            return this.buildDenied(
                startMeta.Artifact.ID,
                `Access denied by delegate entity '${startMeta.DelegateEntityName || startMeta.DelegateEntityId}' (${startMeta.DelegateRecordId}).`
            );
        }
        return {
            ArtifactID: startMeta.Artifact.ID,
            CanRead: parentPerms.CanRead,
            CanEdit: parentPerms.CanEdit,
            CanDelete: parentPerms.CanDelete,
            CanShare: parentPerms.CanShare,
            Source: 'Delegate',
            Reason: `Permissions resolved via delegate '${startMeta.DelegateEntityName || startMeta.DelegateEntityId}' (${startMeta.DelegateRecordId}).`
        };
    }

    private walkParentDelegateChain(
        startNormId: string,
        startMeta: { Artifact: ArtifactRowProjection; DelegateEntityName: string; DelegateEntityId: string; DelegateRecordId: string },
        baseDepth: number,
        baseVisited: ReadonlySet<string>,
        normUserId: string,
        strictThrowOnQueryError: boolean,
        parentDelegateMetaByNormId: ReadonlyMap<
            string,
            { Artifact: ArtifactRowProjection; DelegateEntityName: string; DelegateEntityId: string; DelegateRecordId: string }
        >,
        customDelegatedByNormId: ReadonlyMap<string, unknown>,
        resolvedByNorm: ReadonlyMap<string, ResolvedArtifactPermissions>,
        memo: ReadonlyMap<string, Promise<ResolvedArtifactPermissions>>
    ):
        | { Kind: 'resolved'; Result: ResolvedArtifactPermissions }
        | { Kind: 'memo'; Promise: Promise<ResolvedArtifactPermissions> }
        | { Kind: 'custom'; CustomNormId: string; Depth: number; Visited: ReadonlySet<string> } {
        const localVisited = new Set<string>(baseVisited);
        localVisited.add(startNormId);
        let currentMeta = startMeta;
        let currentDepth = baseDepth;

        while (true) {
            const nextDepth = currentDepth + 1;
            const parentTrimmed = currentMeta.DelegateRecordId.trim();
            if (!parentTrimmed || !IsValidUUID(parentTrimmed)) {
                return {
                    Kind: 'resolved',
                    Result: this.formatParentDelegateResult(
                        startMeta,
                        this.buildDenied(parentTrimmed, 'Artifact ID and user ID must be valid UUIDs.')
                    )
                };
            }
            if (nextDepth > MAX_DELEGATE_DEPTH) {
                return {
                    Kind: 'resolved',
                    Result: this.formatParentDelegateResult(
                        startMeta,
                        this.buildDenied(parentTrimmed, 'Maximum artifact permission delegation depth exceeded.')
                    )
                };
            }
            const parentNorm = NormalizeUUID(parentTrimmed);
            if (localVisited.has(parentNorm)) {
                return {
                    Kind: 'resolved',
                    Result: this.formatParentDelegateResult(
                        startMeta,
                        this.buildDenied(parentTrimmed, 'Circular artifact permission delegation detected.')
                    )
                };
            }

            const settledParent = resolvedByNorm.get(parentNorm);
            if (settledParent) {
                return { Kind: 'resolved', Result: this.formatParentDelegateResult(startMeta, settledParent) };
            }

            if (customDelegatedByNormId.has(parentNorm)) {
                localVisited.add(parentNorm);
                return { Kind: 'custom', CustomNormId: parentNorm, Depth: nextDepth, Visited: localVisited };
            }

            const nextParentMeta = parentDelegateMetaByNormId.get(parentNorm);
            if (nextParentMeta) {
                localVisited.add(parentNorm);
                currentMeta = nextParentMeta;
                currentDepth = nextDepth;
                continue;
            }

            if (!strictThrowOnQueryError) {
                const memoPromise = memo.get(`${parentNorm}::${normUserId}`);
                if (memoPromise) {
                    return { Kind: 'memo', Promise: memoPromise };
                }
            }

            return {
                Kind: 'resolved',
                Result: this.formatParentDelegateResult(
                    startMeta,
                    this.buildDenied(parentTrimmed, `Artifact '${parentTrimmed}' was not found.`)
                )
            };
        }
    }

    private evaluateNonDelegatedArtifact(
        artifact: ArtifactRowProjection,
        user: UserInfo,
        directRows: ReadonlyArray<ArtifactPermissionRowProjection>,
        collectionPerms: ReadonlyArray<CollectionPermissionRowProjection>
    ): ResolvedArtifactPermissions {
        const isOwner = Boolean(artifact.UserID && UUIDsEqual(artifact.UserID, user.ID));
        if (isOwner) {
            return {
                ArtifactID: artifact.ID,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                Source: 'Owner',
                Reason: 'User is the owner of the artifact.'
            };
        }

        const directCanEdit = directRows.some((r) => Boolean(r.CanEdit));
        const directCanDelete = directRows.some((r) => Boolean(r.CanDelete));
        const directCanShare = directRows.some((r) => Boolean(r.CanShare));
        const directCanRead = directRows.some((r) => Boolean(r.CanRead)) || directCanEdit || directCanDelete || directCanShare;

        const colCanEdit = collectionPerms.some((r) => Boolean(r.CanEdit));
        const colCanDelete = collectionPerms.some((r) => Boolean(r.CanDelete));
        const colCanShare = collectionPerms.some((r) => Boolean(r.CanShare));
        const colCanRead = collectionPerms.some((r) => Boolean(r.CanRead)) || colCanEdit || colCanDelete || colCanShare;

        const canEdit = directCanEdit || colCanEdit;
        const canDelete = directCanDelete || colCanDelete;
        const canShare = directCanShare || colCanShare;
        const canRead = directCanRead || colCanRead || canEdit || canDelete || canShare;

        if (canRead) {
            const collectionElevated =
                (colCanRead && !directCanRead) ||
                (colCanEdit && !directCanEdit) ||
                (colCanDelete && !directCanDelete) ||
                (colCanShare && !directCanShare);
            return {
                ArtifactID: artifact.ID,
                CanRead: canRead,
                CanEdit: canEdit,
                CanDelete: canDelete,
                CanShare: canShare,
                Source: !directCanRead || collectionElevated ? 'CollectionPermission' : 'ArtifactPermission',
                Reason:
                    directCanRead && colCanRead
                        ? 'Permissions resolved from MJ: Artifact Permissions and parent Collection membership.'
                        : directCanRead
                            ? 'Permissions granted via MJ: Artifact Permissions.'
                            : 'Permissions granted via parent Collection membership.'
            };
        }

        return this.buildDenied(artifact.ID, `User '${user.ID}' has no permission grant on artifact '${artifact.ID}'.`);
    }

    private async loadArtifactRowsBatch(
        provider: IMetadataProvider,
        items: ReadonlyArray<{ normId: string; id: string }>,
        user: UserInfo,
        strictThrowOnQueryError: boolean
    ): Promise<Map<string, ArtifactRowProjection>> {
        const artifactsByNormId = new Map<string, ArtifactRowProjection>();
        if (items.length === 0) {
            return artifactsByNormId;
        }

        const ids = items.map((i) => i.id);
        const contextLabel = ids.length === 1 ? `artifact '${ids[0]}'` : `batch of ${ids.length} artifacts`;
        const rv = RunView.FromMetadataProvider(provider);
        const artifactQueries: RunViewParams[] = chunkArray(ids, IN_CLAUSE_CHUNK_SIZE).map((chunk) => {
            const artParams: RunViewParams = {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: buildEqOrInFilter('ID', chunk),
                Fields: ['ID', 'UserID', 'DelegateEntityID', 'DelegateRecordID'],
                ...(chunk.length === 1 ? { MaxRows: 1 } : { IgnoreMaxRows: true }),
                SkipTotalRowCount: true,
                BypassCache: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(artParams);
            return artParams;
        });

        const ingest = (res: { Success?: boolean; ErrorMessage?: string; Results?: unknown[] }): void => {
            if (!res?.Success) {
                if (strictThrowOnQueryError) {
                    throw new Error(res?.ErrorMessage || `Failed loading artifact rows for ${contextLabel}.`);
                }
                return;
            }
            for (const row of (res.Results ?? []) as ArtifactRowProjection[]) {
                if (row?.ID) {
                    artifactsByNormId.set(NormalizeUUID(row.ID), row);
                }
            }
        };

        try {
            const results = canUseRunViews(provider, rv)
                ? await rv.RunViews(artifactQueries, user)
                : await Promise.all(artifactQueries.map((q) => rv.RunView<ArtifactRowProjection>(q, user)));
            for (const res of results) {
                ingest(res);
            }
        } catch (err: unknown) {
            LogError(
                `ArtifactPermissionEngine.loadArtifactRowsBatch error for ${contextLabel} (user '${user.ID}'): ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            if (strictThrowOnQueryError) {
                throw err;
            }
        }

        return artifactsByNormId;
    }

    private async loadDirectAndCollectionBatch(
        provider: IMetadataProvider,
        items: ReadonlyArray<{ normId: string; id: string }>,
        user: UserInfo,
        strictThrowOnQueryError: boolean
    ): Promise<{
        DirectPermsByNormArtifactId: Map<string, ArtifactPermissionRowProjection[]>;
        CollectionPermsByNormArtifactId: Map<string, CollectionPermissionRowProjection[]>;
    }> {
        const directPermsByNormArtifactId = new Map<string, ArtifactPermissionRowProjection[]>();
        const versionIdsByNormArtifactId = new Map<string, string[]>();
        if (items.length === 0) {
            return {
                DirectPermsByNormArtifactId: directPermsByNormArtifactId,
                CollectionPermsByNormArtifactId: new Map<string, CollectionPermissionRowProjection[]>()
            };
        }

        let directQueryError: Error | null = null;
        let versionQueryError: Error | null = null;

        const ids = items.map((i) => i.id);
        const contextLabel = ids.length === 1 ? `artifact '${ids[0]}'` : `batch of ${ids.length} artifacts`;
        const queryActor = await this.resolvePermissionQueryActor(provider, user, contextLabel);
        const rv = RunView.FromMetadataProvider(provider);
        const safeUserId = EscapeSQLString(user.ID);
        const chunks = chunkArray(ids, IN_CLAUSE_CHUNK_SIZE);

        const directQueries: RunViewParams[] = [];
        const versionQueries: RunViewParams[] = [];

        for (const chunk of chunks) {
            const directParams: RunViewParams = {
                EntityName: 'MJ: Artifact Permissions',
                ExtraFilter: `${buildEqOrInFilter('ArtifactID', chunk)} AND UserID='${safeUserId}'`,
                Fields: ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
                IgnoreMaxRows: true,
                SkipTotalRowCount: true,
                BypassCache: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(directParams);
            directQueries.push(directParams);

            if (queryActor) {
                const verParams: RunViewParams = {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: buildEqOrInFilter('ArtifactID', chunk),
                    Fields: ['ID', 'ArtifactID'],
                    IgnoreMaxRows: true,
                    SkipTotalRowCount: true,
                    BypassCache: true,
                    ResultType: 'simple'
                };
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(verParams);
                versionQueries.push(verParams);
            }
        }

        const singleNormFallback = items.length === 1 ? items[0].normId : null;
        const ingestDirectResult = (res: { Success?: boolean; ErrorMessage?: string; Results?: unknown[] }): void => {
            if (!res?.Success) {
                if (!directQueryError) {
                    directQueryError = new Error(res?.ErrorMessage || `Failed loading direct permissions for ${contextLabel}.`);
                }
                return;
            }
            for (const row of (res.Results ?? []) as ArtifactPermissionRowProjection[]) {
                const artId = row?.ArtifactID;
                const normArtId = artId ? NormalizeUUID(artId) : singleNormFallback;
                if (!normArtId) {
                    continue;
                }
                let list = directPermsByNormArtifactId.get(normArtId);
                if (!list) {
                    list = [];
                    directPermsByNormArtifactId.set(normArtId, list);
                }
                list.push(row);
            }
        };
        const ingestVersionResult = (res: { Success?: boolean; ErrorMessage?: string; Results?: unknown[] }): void => {
            if (!res?.Success) {
                if (!versionQueryError) {
                    versionQueryError = new Error(res?.ErrorMessage || `Failed loading versions for ${contextLabel}.`);
                }
                return;
            }
            for (const row of (res.Results ?? []) as Array<{ ID?: string; ArtifactID?: string }>) {
                if (!row?.ID) {
                    continue;
                }
                const normArtId = row.ArtifactID ? NormalizeUUID(row.ArtifactID) : singleNormFallback;
                if (!normArtId) {
                    continue;
                }
                let list = versionIdsByNormArtifactId.get(normArtId);
                if (!list) {
                    list = [];
                    versionIdsByNormArtifactId.set(normArtId, list);
                }
                list.push(row.ID);
            }
        };

        if (canUseRunViews(provider, rv)) {
            if (provider.ProviderType !== 'Database') {
                // On Network/GraphQL providers, queryActor === user: send Direct Perms + Versions in ONE RunViews call.
                const combined = [...directQueries, ...versionQueries];
                try {
                    const batchRes = await rv.RunViews(combined, user);
                    const directCount = directQueries.length;
                    for (let i = 0; i < directCount; i++) {
                        ingestDirectResult(batchRes[i]);
                    }
                    for (let i = 0; i < versionQueries.length; i++) {
                        ingestVersionResult(batchRes[directCount + i]);
                    }
                } catch (err: unknown) {
                    LogError(
                        `ArtifactPermissionEngine.loadDirectAndCollectionBatch error for ${contextLabel} (user '${user.ID}'): ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    );
                    if (strictThrowOnQueryError) {
                        throw err;
                    }
                }
            } else {
                // On Database providers, run MJ: Artifact Permissions as `user` (preserving entity CanRead and RLS)
                // and MJ: Artifact Versions as `queryActor` (systemUser, avoiding ArtifactVersionPostRunViewHook recursion) in parallel.
                const runDirectBatch = async (): Promise<void> => {
                    try {
                        const resList =
                            directQueries.length === 1
                                ? [await rv.RunView<ArtifactPermissionRowProjection>(directQueries[0], user)]
                                : await rv.RunViews(directQueries, user);
                        for (const res of resList) {
                            ingestDirectResult(res);
                        }
                    } catch (err: unknown) {
                        LogError(
                            `ArtifactPermissionEngine.loadDirectPermissionRows error for ${contextLabel} (user '${user.ID}'): ${
                                err instanceof Error ? err.message : String(err)
                            }`
                        );
                        if (!directQueryError) {
                            directQueryError = err instanceof Error ? err : new Error(String(err));
                        }
                    }
                };
                const runVersionBatch = async (): Promise<void> => {
                    if (versionQueries.length === 0 || !queryActor) {
                        return;
                    }
                    try {
                        const verRes =
                            versionQueries.length === 1
                                ? [await rv.RunView<ArtifactVersionArtifactProjection>(versionQueries[0], queryActor)]
                                : await rv.RunViews(versionQueries, queryActor);
                        for (const res of verRes) {
                            ingestVersionResult(res);
                        }
                    } catch (err: unknown) {
                        LogError(
                            `ArtifactPermissionEngine.loadCollectionPermissionRows error for ${contextLabel} (user '${user.ID}'): ${
                                err instanceof Error ? err.message : String(err)
                            }`
                        );
                        if (!versionQueryError) {
                            versionQueryError = err instanceof Error ? err : new Error(String(err));
                        }
                    }
                };
                await Promise.all([runDirectBatch(), runVersionBatch()]);
            }
        } else {
            // Fallback for test doubles that stub only RunView without RunViews
            await Promise.all([
                ...directQueries.map(async (q) => {
                    try {
                        ingestDirectResult(await rv.RunView<ArtifactPermissionRowProjection>(q, user));
                    } catch (err: unknown) {
                        LogError(
                            `ArtifactPermissionEngine.loadDirectPermissionRows error: ${err instanceof Error ? err.message : String(err)}`
                        );
                        if (!directQueryError) {
                            directQueryError = err instanceof Error ? err : new Error(String(err));
                        }
                    }
                }),
                ...versionQueries.map(async (q) => {
                    try {
                        ingestVersionResult(await rv.RunView<ArtifactVersionArtifactProjection>(q, queryActor!));
                    } catch (err: unknown) {
                        LogError(
                            `ArtifactPermissionEngine.loadCollectionPermissionRows error for ${contextLabel} (user '${user.ID}'): ${
                                err instanceof Error ? err.message : String(err)
                            }`
                        );
                        if (!versionQueryError) {
                            versionQueryError = err instanceof Error ? err : new Error(String(err));
                        }
                    }
                })
            ]);
        }

        if (strictThrowOnQueryError) {
            if (directQueryError) {
                throw directQueryError;
            }
            if (versionQueryError) {
                throw versionQueryError;
            }
        }

        const artifactsNeedingCollections = new Set<string>(items.map((i) => i.normId));
        const collectionPermsByNormArtifactId = await this.loadBatchedCollectionPermissions(
            provider,
            items,
            artifactsNeedingCollections,
            versionIdsByNormArtifactId,
            queryActor,
            user,
            strictThrowOnQueryError
        );

        return {
            DirectPermsByNormArtifactId: directPermsByNormArtifactId,
            CollectionPermsByNormArtifactId: collectionPermsByNormArtifactId
        };
    }

    private async loadBatchedCollectionPermissions(
        provider: IMetadataProvider,
        items: ReadonlyArray<{ normId: string; id: string }>,
        artifactsNeedingCollections: ReadonlySet<string>,
        versionIdsByNormArtifactId: ReadonlyMap<string, string[]>,
        queryActor: UserInfo | null,
        user: UserInfo,
        strictThrowOnQueryError: boolean
    ): Promise<Map<string, CollectionPermissionRowProjection[]>> {
        const resultByNormArtifactId = new Map<string, CollectionPermissionRowProjection[]>();
        if (artifactsNeedingCollections.size === 0) {
            return resultByNormArtifactId;
        }
        const contextLabel = items.length === 1 ? `artifact '${items[0].id}'` : `batch of ${items.length} artifacts`;
        if (!queryActor) {
            if (strictThrowOnQueryError) {
                throw new Error(`System user is unavailable for collection lookup on ${contextLabel}.`);
            }
            return resultByNormArtifactId;
        }

        // Collect all unique version IDs across artifacts needing collection resolution
        const versionNormToArtifactNorms = new Map<string, Set<string>>();
        const uniqueVersionIds: string[] = [];
        for (const normArtId of artifactsNeedingCollections) {
            const verIds = versionIdsByNormArtifactId.get(normArtId) ?? [];
            for (const verId of verIds) {
                const normVerId = NormalizeUUID(verId);
                let owners = versionNormToArtifactNorms.get(normVerId);
                if (!owners) {
                    owners = new Set<string>();
                    versionNormToArtifactNorms.set(normVerId, owners);
                    uniqueVersionIds.push(verId);
                }
                owners.add(normArtId);
            }
        }
        if (uniqueVersionIds.length === 0) {
            return resultByNormArtifactId;
        }

        try {
            const rv = RunView.FromMetadataProvider(provider);
            const runBatch = async (paramsList: RunViewParams[]): Promise<Array<{ Success?: boolean; ErrorMessage?: string; Results?: unknown[] }>> => {
                for (const p of paramsList) {
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(p);
                }
                if (paramsList.length === 0) {
                    return [];
                }
                if (paramsList.length === 1) {
                    return [await rv.RunView(paramsList[0], queryActor)];
                }
                if (canUseRunViews(provider, rv)) {
                    return await rv.RunViews(paramsList, queryActor);
                }
                return await Promise.all(paramsList.map((p) => rv.RunView(p, queryActor)));
            };

            // 1. Batched MJ: Collection Artifacts lookup
            const colArtQueries: RunViewParams[] = chunkArray(uniqueVersionIds, IN_CLAUSE_CHUNK_SIZE).map((verChunk) => ({
                EntityName: 'MJ: Collection Artifacts',
                ExtraFilter: `ArtifactVersionID IN (${buildQuotedInList(verChunk)})`,
                Fields: ['ArtifactVersionID', 'CollectionID'],
                IgnoreMaxRows: true,
                SkipTotalRowCount: true,
                BypassCache: true,
                ResultType: 'simple'
            }));
            const colArtResults = await runBatch(colArtQueries);

            const directColsByNormArtifactId = new Map<string, Set<string>>();
            const seenColNormIds = new Set<string>();
            const directCollectionIds: string[] = [];
            const singleFallbackArtNorm = artifactsNeedingCollections.size === 1 ? Array.from(artifactsNeedingCollections)[0] : null;

            for (const res of colArtResults) {
                if (!res?.Success) {
                    if (strictThrowOnQueryError) {
                        throw new Error(res?.ErrorMessage || `Failed loading collection links for ${contextLabel}.`);
                    }
                    continue;
                }
                for (const row of (res.Results ?? []) as CollectionVersionRowProjection[]) {
                    if (!row?.CollectionID) {
                        continue;
                    }
                    const normColId = NormalizeUUID(row.CollectionID);
                    const targetArts = row.ArtifactVersionID
                        ? versionNormToArtifactNorms.get(NormalizeUUID(row.ArtifactVersionID))
                        : singleFallbackArtNorm
                            ? new Set<string>([singleFallbackArtNorm])
                            : undefined;
                    if (!targetArts) {
                        continue;
                    }
                    if (!seenColNormIds.has(normColId)) {
                        seenColNormIds.add(normColId);
                        directCollectionIds.push(row.CollectionID);
                    }
                    for (const normArtId of targetArts) {
                        let colSet = directColsByNormArtifactId.get(normArtId);
                        if (!colSet) {
                            colSet = new Set<string>();
                            directColsByNormArtifactId.set(normArtId, colSet);
                        }
                        colSet.add(normColId);
                    }
                }
            }

            if (directCollectionIds.length === 0) {
                return resultByNormArtifactId;
            }

            // 2. Walk collection ancestry level-by-level across ALL collections (1 batched query per depth level)
            const collectionMetaByNormId = new Map<string, CollectionRowProjection>();
            const allCollectionIds = [...directCollectionIds];
            let frontier = [...directCollectionIds];

            for (let level = 0; level < MAX_COLLECTION_ANCESTRY_DEPTH && frontier.length > 0; level++) {
                const colMetaQueries: RunViewParams[] = chunkArray(frontier, IN_CLAUSE_CHUNK_SIZE).map((colChunk) => ({
                    EntityName: 'MJ: Collections',
                    ExtraFilter: `ID IN (${buildQuotedInList(colChunk)})`,
                    Fields: ['ID', 'OwnerID', 'ParentID'],
                    IgnoreMaxRows: true,
                    SkipTotalRowCount: true,
                    BypassCache: true,
                    ResultType: 'simple'
                }));
                const colMetaResults = await runBatch(colMetaQueries);
                const nextFrontier: string[] = [];

                for (const res of colMetaResults) {
                    if (!res?.Success && strictThrowOnQueryError) {
                        throw new Error(res?.ErrorMessage || `Failed loading collections for ${contextLabel}.`);
                    }
                    if (!res?.Success || !res.Results) {
                        continue;
                    }
                    for (const col of res.Results as CollectionRowProjection[]) {
                        if (!col?.ID) {
                            continue;
                        }
                        collectionMetaByNormId.set(NormalizeUUID(col.ID), col);
                        if (level + 1 >= MAX_COLLECTION_ANCESTRY_DEPTH) {
                            continue;
                        }
                        const parentId = col.ParentID?.trim();
                        if (parentId && IsValidUUID(parentId)) {
                            const normParent = NormalizeUUID(parentId);
                            if (!seenColNormIds.has(normParent)) {
                                seenColNormIds.add(normParent);
                                allCollectionIds.push(parentId);
                                nextFrontier.push(parentId);
                            }
                        }
                    }
                }
                frontier = nextFrontier;
            }

            // 3. Load MJ: Collection Permissions once for ALL discovered collections across the batch
            const safeUserId = EscapeSQLString(user.ID);
            const permQueries: RunViewParams[] = chunkArray(allCollectionIds, IN_CLAUSE_CHUNK_SIZE).map((colChunk) => ({
                EntityName: 'MJ: Collection Permissions',
                ExtraFilter: `CollectionID IN (${buildQuotedInList(colChunk)}) AND UserID='${safeUserId}'`,
                Fields: ['CollectionID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
                IgnoreMaxRows: true,
                SkipTotalRowCount: true,
                BypassCache: true,
                ResultType: 'simple'
            }));
            const permResults = await runBatch(permQueries);

            const permsByNormColId = new Map<string, CollectionPermissionRowProjection[]>();
            const unkeyedPermRows: CollectionPermissionRowProjection[] = [];
            for (const res of permResults) {
                if (!res?.Success && strictThrowOnQueryError) {
                    throw new Error(res?.ErrorMessage || `Failed loading collection permissions for ${contextLabel}.`);
                }
                if (!res?.Success || !res.Results) {
                    continue;
                }
                for (const row of res.Results as CollectionPermissionRowProjection[]) {
                    if (row.CollectionID) {
                        const normColId = NormalizeUUID(row.CollectionID);
                        let list = permsByNormColId.get(normColId);
                        if (!list) {
                            list = [];
                            permsByNormColId.set(normColId, list);
                        }
                        list.push(row);
                    } else if (artifactsNeedingCollections.size === 1) {
                        unkeyedPermRows.push(row);
                    }
                }
            }

            // 4. Assemble each artifact's effective collection permission rows in memory (cycle-guarded, depth-bounded)
            for (const [normArtId, directColNorms] of directColsByNormArtifactId.entries()) {
                const artRows: CollectionPermissionRowProjection[] = [...unkeyedPermRows];
                const visitedForArt = new Set<string>();
                let artFrontier = Array.from(directColNorms);

                for (let level = 0; level < MAX_COLLECTION_ANCESTRY_DEPTH && artFrontier.length > 0; level++) {
                    const nextArtFrontier: string[] = [];
                    for (const normColId of artFrontier) {
                        if (visitedForArt.has(normColId)) {
                            continue;
                        }
                        visitedForArt.add(normColId);

                        const col = collectionMetaByNormId.get(normColId);
                        if (col?.OwnerID && UUIDsEqual(col.OwnerID, user.ID)) {
                            artRows.push({
                                CollectionID: col.ID,
                                CanRead: true,
                                CanEdit: true,
                                CanDelete: true,
                                CanShare: true
                            });
                        }
                        const colPermRows = permsByNormColId.get(normColId);
                        if (colPermRows) {
                            artRows.push(...colPermRows);
                        }
                        if (level + 1 < MAX_COLLECTION_ANCESTRY_DEPTH && col?.ParentID?.trim()) {
                            const normParent = NormalizeUUID(col.ParentID.trim());
                            if (!visitedForArt.has(normParent)) {
                                nextArtFrontier.push(normParent);
                            }
                        }
                    }
                    artFrontier = nextArtFrontier;
                }

                resultByNormArtifactId.set(normArtId, artRows);
            }

            return resultByNormArtifactId;
        } catch (err: unknown) {
            LogError(
                `ArtifactPermissionEngine.loadCollectionPermissionRows error for ${contextLabel} (user '${user.ID}'): ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            if (strictThrowOnQueryError) {
                throw err;
            }
            return resultByNormArtifactId;
        }
    }

    private async evaluateCustomDelegateDecisions(
        provider: IMetadataProvider,
        delegate: IArtifactPermissionDelegate,
        artifact: ArtifactRowProjection,
        delegateEntityId: string,
        delegateEntityName: string,
        delegateRecordId: string,
        user: UserInfo,
        depth: number,
        visited: ReadonlySet<string>,
        memo: Map<string, Promise<ResolvedArtifactPermissions>>
    ): Promise<{
        NormRead: DelegatePermissionDecision;
        NormEdit: DelegatePermissionDecision;
        NormDelete: DelegatePermissionDecision;
        NormShare: DelegatePermissionDecision;
        NeedsFallback: boolean;
    }> {
        const context: ArtifactDelegateContext = {
            ArtifactID: artifact.ID,
            ArtifactOwnerUserID: artifact.UserID,
            DelegateEntityID: delegateEntityId,
            DelegateEntityName: delegateEntityName,
            DelegateRecordID: delegateRecordId,
            Provider: provider,
            Depth: depth,
            VisitedArtifactIDs: visited,
            Memo: memo
        };

        const [readDec, editDec, deleteDec, shareDec] = await Promise.all([
            delegate.CanRead(context, user),
            delegate.CanEdit(context, user),
            delegate.CanDelete ? delegate.CanDelete(context, user) : Promise.resolve<DelegatePermissionDecision>('Defer'),
            delegate.CanShare ? delegate.CanShare(context, user) : Promise.resolve<DelegatePermissionDecision>('Defer')
        ]);

        const normRead = normalizeDecision(readDec);
        const normEdit = normalizeDecision(editDec);
        const normDelete = normalizeDecision(deleteDec);
        const normShare = normalizeDecision(shareDec);
        const needsFallback =
            normRead !== 'Deny' &&
            (normRead === 'Defer' || normEdit === 'Defer' || normDelete === 'Defer' || normShare === 'Defer');

        return {
            NormRead: normRead,
            NormEdit: normEdit,
            NormDelete: normDelete,
            NormShare: normShare,
            NeedsFallback: needsFallback
        };
    }

    private finalizeCustomDelegateDecisions(
        artifact: ArtifactRowProjection,
        delegateEntityId: string,
        delegateEntityName: string,
        delegateRecordId: string,
        decisions: {
            NormRead: DelegatePermissionDecision;
            NormEdit: DelegatePermissionDecision;
            NormDelete: DelegatePermissionDecision;
            NormShare: DelegatePermissionDecision;
        },
        user: UserInfo,
        directRows: ReadonlyArray<ArtifactPermissionRowProjection>,
        collectionRows: ReadonlyArray<CollectionPermissionRowProjection>
    ): ResolvedArtifactPermissions {
        const { NormRead: normRead, NormEdit: normEdit, NormDelete: normDelete, NormShare: normShare } = decisions;

        // If every action deferred, fall through to owner / MJ: Artifact Permissions / Collection Permissions.
        if (normRead === 'Defer' && normEdit === 'Defer' && normDelete === 'Defer' && normShare === 'Defer') {
            return this.evaluateNonDelegatedArtifact(artifact, user, directRows, collectionRows);
        }

        // If the delegate explicitly denied Read, deny all actions immediately.
        if (normRead === 'Deny') {
            return this.buildDenied(
                artifact.ID,
                `Access denied by delegate entity '${delegateEntityName || delegateEntityId}' (${delegateRecordId}).`
            );
        }

        // For any individual action that returned 'Defer', combine with fallback (owner + direct + collection grants).
        const isOwner = Boolean(artifact.UserID && UUIDsEqual(artifact.UserID, user.ID));
        let fallbackEdit = isOwner;
        let fallbackDelete = isOwner;
        let fallbackShare = isOwner;
        let fallbackRead = isOwner;

        if (!isOwner && (normRead === 'Defer' || normEdit === 'Defer' || normDelete === 'Defer' || normShare === 'Defer')) {
            const fallbackRows: CollectionPermissionRowProjection[] = [...directRows, ...collectionRows];
            fallbackEdit = fallbackRows.some((r) => Boolean(r.CanEdit));
            fallbackDelete = fallbackRows.some((r) => Boolean(r.CanDelete));
            fallbackShare = fallbackRows.some((r) => Boolean(r.CanShare));
            fallbackRead = fallbackRows.some((r) => Boolean(r.CanRead)) || fallbackEdit || fallbackDelete || fallbackShare;
        }

        const canEdit = normEdit === 'Allow' ? true : normEdit === 'Deny' ? false : fallbackEdit;
        const canDelete = normDelete === 'Allow' ? true : normDelete === 'Deny' ? false : fallbackDelete;
        const canShare = normShare === 'Allow' ? true : normShare === 'Deny' ? false : fallbackShare;
        const canRead = normRead === 'Allow' ? true : fallbackRead || canEdit || canDelete || canShare;

        return {
            ArtifactID: artifact.ID,
            CanRead: canRead,
            CanEdit: canEdit,
            CanDelete: canDelete,
            CanShare: canShare,
            Source: canRead ? 'Delegate' : 'Denied',
            Reason: canRead
                ? `Permissions resolved via delegate '${delegateEntityName || delegateEntityId}' (${delegateRecordId}).`
                : `Access denied by delegate '${delegateEntityName || delegateEntityId}' (${delegateRecordId}).`
        };
    }

    private resolveDelegateInstance(entityId: string, entityName: string): IArtifactPermissionDelegate | null {
        const byId = this._delegatesByEntityKey.get(entityId.trim().toLowerCase());
        if (byId) {
            return byId;
        }
        if (entityName) {
            const byName = this._delegatesByEntityKey.get(entityName.trim().toLowerCase());
            if (byName) {
                return byName;
            }
            if (entityName.trim().toLowerCase() === 'mj: artifacts') {
                return new ParentArtifactPermissionDelegate();
            }
            const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
                BaseArtifactPermissionDelegate,
                entityName
            );
            if (!registration) {
                return null;
            }
            const registered = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactPermissionDelegate>(
                BaseArtifactPermissionDelegate,
                entityName
            );
            if (registered && registered.constructor !== BaseArtifactPermissionDelegate) {
                return registered;
            }
        }
        return null;
    }

    /**
     * Resolves effective collection permissions for `(collectionId, user)` by walking `ParentID`
     * ancestry up to depth 16 (cycle-guarded) and unioning `OwnerID` ownership with direct and
     * ancestor `MJ: Collection Permissions` rows.
     */
    public async ResolveCollectionAncestryPermissions(
        provider: IMetadataProvider | null | undefined,
        collectionId: string | null | undefined,
        user: UserInfo | null | undefined
    ): Promise<ResolvedCollectionPermissions> {
        const targetId = (collectionId ?? '').trim();
        if (!provider || !targetId || !user?.ID) {
            return this.buildDeniedCollection(targetId, 'Missing provider, collectionId, or user context.');
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return this.buildDeniedCollection(targetId, 'Scope-limited or anonymous magic-link principals cannot access governed collection permissions.');
        }
        if (!IsValidUUID(targetId) || !IsValidUUID(user.ID)) {
            return this.buildDeniedCollection(targetId, 'Collection ID and user ID must be valid UUIDs.');
        }

        try {
            const queryActor = await this.resolvePermissionQueryActor(provider, user, `collection '${targetId}'`);
            if (!queryActor) {
                return this.buildDeniedCollection(targetId, 'System user is unavailable for collection permission resolution.');
            }

            const rv = RunView.FromMetadataProvider(provider);
            const visited = new Set<string>();
            const chainIds: string[] = [targetId];
            const directNormalized = NormalizeUUID(targetId);
            visited.add(directNormalized);

            let ownerMatchedDepth: number | null = null;
            let rootMissing = false;
            let currentId: string | null = targetId;

            for (let depth = 0; depth < MAX_COLLECTION_ANCESTRY_DEPTH && currentId; depth++) {
                if (!IsValidUUID(currentId)) {
                    break;
                }
                const colParams: RunViewParams = {
                    EntityName: 'MJ: Collections',
                    ExtraFilter: `ID='${EscapeSQLString(currentId)}'`,
                    Fields: ['ID', 'OwnerID', 'ParentID'],
                    IgnoreMaxRows: true,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                };
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colParams);
                const colRes = await rv.RunView<CollectionRowProjection>(colParams, queryActor);
                const row = colRes.Success && colRes.Results && colRes.Results.length > 0 ? colRes.Results[0] : null;
                if (!row) {
                    if (depth === 0) {
                        rootMissing = true;
                    }
                    break;
                }

                if (row.OwnerID && UUIDsEqual(row.OwnerID, user.ID)) {
                    ownerMatchedDepth = depth;
                    break;
                }

                if (depth + 1 >= MAX_COLLECTION_ANCESTRY_DEPTH) {
                    break;
                }

                const nextParent = row.ParentID?.trim() || null;
                if (!nextParent || !IsValidUUID(nextParent)) {
                    break;
                }
                const normParent = NormalizeUUID(nextParent);
                if (visited.has(normParent)) {
                    break;
                }
                visited.add(normParent);
                chainIds.push(nextParent);
                currentId = nextParent;
            }

            if (rootMissing) {
                return this.buildDeniedCollection(targetId, `Collection '${targetId}' was not found.`);
            }

            if (ownerMatchedDepth !== null) {
                return {
                    CollectionID: targetId,
                    CanRead: true,
                    CanEdit: true,
                    CanDelete: true,
                    CanShare: true,
                    Source: ownerMatchedDepth === 0 ? 'Owner' : 'AncestorCollection',
                    Reason:
                        ownerMatchedDepth === 0
                            ? 'User is the owner of the collection.'
                            : 'User is the owner of an ancestor collection.'
                };
            }

            const safeUserId = EscapeSQLString(user.ID);
            const matchingRows: CollectionPermissionRowProjection[] = [];
            for (const idChunk of chunkArray(chainIds, IN_CLAUSE_CHUNK_SIZE)) {
                const permParams: RunViewParams = {
                    EntityName: 'MJ: Collection Permissions',
                    ExtraFilter: `CollectionID IN (${buildQuotedInList(idChunk)}) AND UserID='${safeUserId}'`,
                    Fields: ['CollectionID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
                    IgnoreMaxRows: true,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                };
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(permParams);
                const permResult = await rv.RunView<CollectionPermissionRowProjection>(permParams, queryActor);
                if (permResult.Success && permResult.Results) {
                    matchingRows.push(...permResult.Results);
                }
            }

            const canEdit = matchingRows.some((r) => Boolean(r.CanEdit));
            const canDelete = matchingRows.some((r) => Boolean(r.CanDelete));
            const canShare = matchingRows.some((r) => Boolean(r.CanShare));
            const canRead = matchingRows.some((r) => Boolean(r.CanRead)) || canEdit || canDelete || canShare;

            if (!canRead) {
                return this.buildDeniedCollection(targetId, `User '${user.ID}' has no permission grant on collection '${targetId}'.`);
            }

            const hasDirectGrant = matchingRows.some(
                (r) =>
                    (!r.CollectionID || NormalizeUUID(r.CollectionID) === directNormalized) &&
                    (Boolean(r.CanRead) || Boolean(r.CanEdit) || Boolean(r.CanDelete) || Boolean(r.CanShare))
            );
            return {
                CollectionID: targetId,
                CanRead: canRead,
                CanEdit: canEdit,
                CanDelete: canDelete,
                CanShare: canShare,
                Source: hasDirectGrant ? 'CollectionPermission' : 'AncestorCollection',
                Reason: hasDirectGrant
                    ? 'Permissions granted via MJ: Collection Permissions.'
                    : 'Permissions inherited from ancestor MJ: Collection Permissions.'
            };
        } catch (err) {
            LogError(
                `ArtifactPermissionEngine.ResolveCollectionAncestryPermissions error for collection '${targetId}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return this.buildDeniedCollection(targetId, 'Collection permission resolution failed.');
        }
    }

    /**
     * Builds the normalized (`NormalizeUUID`) set of all `CollectionID`s readable by `user`,
     * combining collection ownership, direct shares, and descendant collections (depth 16, cycle-guarded).
     */
    public async BuildReadableCollectionIdSet(
        provider: IMetadataProvider | null | undefined,
        user: UserInfo | null | undefined
    ): Promise<Set<string>> {
        const readable = new Set<string>();
        if (!provider || !user?.ID || !IsValidUUID(user.ID)) {
            return readable;
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return readable;
        }
        try {
            const queryActor = await this.resolvePermissionQueryActor(provider, user, 'BuildReadableCollectionIdSet');
            if (!queryActor) {
                return readable;
            }
            const rv = RunView.FromMetadataProvider(provider);
            const collectionIds = await this.collectReadableCollectionIds(rv, queryActor, user.ID);
            for (const cid of collectionIds) {
                const norm = NormalizeUUID(cid);
                if (norm) {
                    readable.add(norm);
                }
            }
            return readable;
        } catch (err) {
            LogError(
                `ArtifactPermissionEngine.BuildReadableCollectionIdSet error for user '${user.ID}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return readable;
        }
    }

    /**
     * Same as {@link BuildReadableCollectionIdSet}, except returns `null` when underlying metadata/database
     * queries fail (`!res.Success` or missing actor) so SQL pre-filtering can fall back cleanly rather than
     * treating an unmocked failure as zero readable collections. Supports `requireShareOrDelete` (`B5`).
     */
    public async TryBuildReadableCollectionIdSet(
        provider: IMetadataProvider | null | undefined,
        user: UserInfo | null | undefined,
        options?: { requireShareOrDelete?: boolean }
    ): Promise<Set<string> | null> {
        const readable = new Set<string>();
        if (!provider || !user?.ID || !IsValidUUID(user.ID)) {
            return readable;
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return readable;
        }
        try {
            const queryActor = await this.resolvePermissionQueryActor(provider, user, 'TryBuildReadableCollectionIdSet');
            if (!queryActor) {
                return null;
            }
            const rv = RunView.FromMetadataProvider(provider);
            const collectionIds = await this.collectReadableCollectionIds(
                rv,
                queryActor,
                user.ID,
                true,
                options?.requireShareOrDelete === true
            );
            for (const cid of collectionIds) {
                const norm = NormalizeUUID(cid);
                if (norm) {
                    readable.add(norm);
                }
            }
            return readable;
        } catch {
            return null;
        }
    }

    private async collectReadableCollectionIds(
        rv: RunView,
        queryActor: UserInfo,
        userId: string,
        throwOnQueryFailure = false,
        requireShareOrDelete = false
    ): Promise<string[]> {
        const safeUserId = EscapeSQLString(userId);
        const seedCollectionIds: string[] = [];
        const seenCollections = new Set<string>();
        const addCollectionSeed = (id: string | null | undefined): void => {
            if (!id || !IsValidUUID(id)) return;
            const norm = NormalizeUUID(id);
            if (norm && !seenCollections.has(norm)) {
                seenCollections.add(norm);
                seedCollectionIds.push(id);
            }
        };

        const ownedColsParams: RunViewParams = {
            EntityName: 'MJ: Collections',
            ExtraFilter: `OwnerID='${safeUserId}'`,
            Fields: ['ID'],
            IgnoreMaxRows: true,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(ownedColsParams);

        const sharedColsParams: RunViewParams = {
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: requireShareOrDelete
                ? `UserID='${safeUserId}' AND (CanShare=1 OR CanDelete=1)`
                : `UserID='${safeUserId}' AND (CanRead=1 OR CanEdit=1 OR CanDelete=1 OR CanShare=1)`,
            Fields: ['CollectionID'],
            IgnoreMaxRows: true,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(sharedColsParams);

        const [ownedColsRes, sharedColsRes] = await Promise.all([
            rv.RunView<CollectionRowProjection>(ownedColsParams, queryActor),
            rv.RunView<CollectionPermissionRowProjection>(sharedColsParams, queryActor)
        ]);
        if (!ownedColsRes.Success && throwOnQueryFailure) {
            throw new Error(ownedColsRes.ErrorMessage || 'Failed querying owned collections.');
        }
        if (ownedColsRes.Success && ownedColsRes.Results) {
            for (const row of ownedColsRes.Results) {
                addCollectionSeed(row.ID);
            }
        }
        if (!sharedColsRes.Success && throwOnQueryFailure) {
            throw new Error(sharedColsRes.ErrorMessage || 'Failed querying collection permissions.');
        }
        if (sharedColsRes.Success && sharedColsRes.Results) {
            for (const row of sharedColsRes.Results) {
                addCollectionSeed(row.CollectionID);
            }
        }

        let frontier = [...seedCollectionIds];
        // Depth 0 is the seed collection; traverse at most MAX_COLLECTION_ANCESTRY_DEPTH - 1 child hops (16 levels 0..15, L1).
        for (let depth = 0; depth < MAX_COLLECTION_ANCESTRY_DEPTH - 1 && frontier.length > 0; depth++) {
            const nextFrontier: string[] = [];
            for (const chunk of chunkArray(frontier, IN_CLAUSE_CHUNK_SIZE)) {
                const childParams: RunViewParams = {
                    EntityName: 'MJ: Collections',
                    ExtraFilter: `ParentID IN (${buildQuotedInList(chunk)})`,
                    Fields: ['ID'],
                    IgnoreMaxRows: true,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                };
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(childParams);
                const childRes = await rv.RunView<CollectionRowProjection>(childParams, queryActor);
                if (!childRes.Success && throwOnQueryFailure) {
                    throw new Error(childRes.ErrorMessage || 'Failed querying child collections.');
                }
                if (childRes.Success && childRes.Results) {
                    for (const child of childRes.Results) {
                        if (!child.ID || !IsValidUUID(child.ID)) continue;
                        const norm = NormalizeUUID(child.ID);
                        if (norm && !seenCollections.has(norm)) {
                            seenCollections.add(norm);
                            seedCollectionIds.push(child.ID);
                            nextFrontier.push(child.ID);
                        }
                    }
                }
            }
            frontier = nextFrontier;
        }

        return seedCollectionIds;
    }

    /**
     * Builds the normalized (`NormalizeUUID`) set of all `ArtifactID`s readable by `user`,
     * combining artifact ownership, direct shares, and collection hierarchy grants (with full
     * delegate `'Deny'` enforcement via {@link ResolvePermissions}).
     */
    public async BuildReadableArtifactIdSet(
        provider: IMetadataProvider | null | undefined,
        user: UserInfo | null | undefined,
        predicate?: (perms: ResolvedArtifactPermissions) => boolean
    ): Promise<Set<string>> {
        const result = await this.buildReadableArtifactIdSetInternal(provider, user, predicate, false);
        return result ?? new Set<string>();
    }

    /**
     * Same as {@link BuildReadableArtifactIdSet}, except returns `null` if ANY underlying query or
     * permission resolution fails so fail-closed SQL callers throw instead of treating partial errors
     * as an empty/truncated workspace (`R7-4`).
     */
    public async TryBuildReadableArtifactIdSet(
        provider: IMetadataProvider | null | undefined,
        user: UserInfo | null | undefined,
        predicate?: (perms: ResolvedArtifactPermissions) => boolean
    ): Promise<Set<string> | null> {
        return this.buildReadableArtifactIdSetInternal(provider, user, predicate, true);
    }

    private async buildReadableArtifactIdSetInternal(
        provider: IMetadataProvider | null | undefined,
        user: UserInfo | null | undefined,
        predicate: ((perms: ResolvedArtifactPermissions) => boolean) | undefined,
        throwOnQueryFailure: boolean
    ): Promise<Set<string> | null> {
        const readable = new Set<string>();
        if (!provider || !user?.ID || !IsValidUUID(user.ID)) {
            return readable;
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return readable;
        }

        try {
            const queryActor = await this.resolvePermissionQueryActor(provider, user, 'BuildReadableArtifactIdSet');
            if (!queryActor) {
                return throwOnQueryFailure ? null : readable;
            }

            const rv = RunView.FromMetadataProvider(provider);
            const safeUserId = EscapeSQLString(user.ID);
            const candidates = new Map<string, string>();

            const addCandidate = (id: string | null | undefined): void => {
                if (!id || !IsValidUUID(id)) return;
                const norm = NormalizeUUID(id);
                if (norm && !candidates.has(norm)) {
                    candidates.set(norm, id);
                }
            };

            // 1. Owned artifacts
            const ownedParams: RunViewParams = {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `UserID='${safeUserId}'`,
                Fields: ['ID'],
                IgnoreMaxRows: true,
                SkipTotalRowCount: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(ownedParams);
            const ownedRes = await rv.RunView<ArtifactOwnerRowProjection>(ownedParams, queryActor);
            if (!ownedRes.Success && throwOnQueryFailure) {
                throw new Error(ownedRes.ErrorMessage || 'Failed querying owned artifacts.');
            }
            if (ownedRes.Success && ownedRes.Results) {
                for (const row of ownedRes.Results) {
                    addCandidate(row.ID);
                }
            }

            // 2. Directly shared artifacts
            const directParams: RunViewParams = {
                EntityName: 'MJ: Artifact Permissions',
                ExtraFilter: `UserID='${safeUserId}' AND (CanRead=1 OR CanEdit=1 OR CanDelete=1 OR CanShare=1)`,
                Fields: ['ArtifactID'],
                IgnoreMaxRows: true,
                SkipTotalRowCount: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(directParams);
            const directRes = await rv.RunView<ArtifactPermissionRowProjection>(directParams, queryActor);
            if (!directRes.Success && throwOnQueryFailure) {
                throw new Error(directRes.ErrorMessage || 'Failed querying direct artifact permissions.');
            }
            if (directRes.Success && directRes.Results) {
                for (const row of directRes.Results) {
                    addCandidate(row.ArtifactID);
                }
            }

            // 3. Owned collections + shared collections + descendant collections (depth 16, cycle-guarded)
            const seedCollectionIds = await this.collectReadableCollectionIds(
                rv,
                queryActor,
                user.ID,
                throwOnQueryFailure
            );

            if (seedCollectionIds.length > 0) {
                const versionIdSet = new Set<string>();
                const versionIds: string[] = [];
                for (const colChunk of chunkArray(seedCollectionIds, IN_CLAUSE_CHUNK_SIZE)) {
                    const colArtParams: RunViewParams = {
                        EntityName: 'MJ: Collection Artifacts',
                        ExtraFilter: `CollectionID IN (${buildQuotedInList(colChunk)})`,
                        Fields: ['ArtifactVersionID'],
                        IgnoreMaxRows: true,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    };
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colArtParams);
                    const colArtRes = await rv.RunView<CollectionVersionRowProjection>(colArtParams, queryActor);
                    if (!colArtRes.Success && throwOnQueryFailure) {
                        throw new Error(colArtRes.ErrorMessage || 'Failed querying collection artifact memberships.');
                    }
                    if (colArtRes.Success && colArtRes.Results) {
                        for (const row of colArtRes.Results) {
                            const vid = row.ArtifactVersionID;
                            if (vid) {
                                const norm = NormalizeUUID(vid);
                                if (!versionIdSet.has(norm)) {
                                    versionIdSet.add(norm);
                                    versionIds.push(vid);
                                }
                            }
                        }
                    }
                }

                for (const verChunk of chunkArray(versionIds, IN_CLAUSE_CHUNK_SIZE)) {
                    const verParams: RunViewParams = {
                        EntityName: 'MJ: Artifact Versions',
                        ExtraFilter: `ID IN (${buildQuotedInList(verChunk)})`,
                        Fields: ['ID', 'ArtifactID'],
                        IgnoreMaxRows: true,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    };
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(verParams);
                    const verRes = await rv.RunView<ArtifactVersionArtifactProjection>(verParams, queryActor);
                    if (!verRes.Success && throwOnQueryFailure) {
                        throw new Error(verRes.ErrorMessage || 'Failed querying collection artifact versions.');
                    }
                    if (verRes.Success && verRes.Results) {
                        for (const row of verRes.Results) {
                            addCandidate(row.ArtifactID);
                        }
                    }
                }
            }

            // 3b. Expand child artifacts delegated to any candidate artifact via DelegateEntityID -> 'MJ: Artifacts'
            const artifactsEntityId = provider.EntityByName?.('MJ: Artifacts')?.ID;
            if (artifactsEntityId && IsValidUUID(artifactsEntityId) && candidates.size > 0) {
                const safeArtifactsEntityId = EscapeSQLString(artifactsEntityId);
                let delegateFrontier = Array.from(candidates.values());
                for (let hop = 0; hop < MAX_DELEGATE_DEPTH && delegateFrontier.length > 0; hop++) {
                    const nextDelegateFrontier: string[] = [];
                    for (const parentChunk of chunkArray(delegateFrontier, IN_CLAUSE_CHUNK_SIZE)) {
                        const childArtParams: RunViewParams = {
                            EntityName: 'MJ: Artifacts',
                            ExtraFilter: `DelegateEntityID='${safeArtifactsEntityId}' AND DelegateRecordID IN (${buildQuotedInList(parentChunk)})`,
                            Fields: ['ID'],
                            IgnoreMaxRows: true,
                            SkipTotalRowCount: true,
                            ResultType: 'simple'
                        };
                        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(childArtParams);
                        const childArtRes = await rv.RunView<ArtifactOwnerRowProjection>(childArtParams, queryActor);
                        if (!childArtRes.Success && throwOnQueryFailure) {
                            throw new Error(childArtRes.ErrorMessage || 'Failed querying parent-delegated artifacts.');
                        }
                        if (childArtRes.Success && childArtRes.Results) {
                            for (const row of childArtRes.Results) {
                                if (row.ID && IsValidUUID(row.ID)) {
                                    const norm = NormalizeUUID(row.ID);
                                    if (!candidates.has(norm)) {
                                        candidates.set(norm, row.ID);
                                        nextDelegateFrontier.push(row.ID);
                                    }
                                }
                            }
                        }
                    }
                    delegateFrontier = nextDelegateFrontier;
                }
            }

            // 3c. Only scan non-'MJ: Artifacts' delegated artifacts for entities that actually have a custom delegate registered (`S-g`).
            const customDelegateKeys = Array.from(this._delegatesByEntityKey.keys()).filter((k) => k !== 'mj: artifacts');
            if (customDelegateKeys.length > 0) {
                const customEntityIds: string[] = [];
                for (const key of customDelegateKeys) {
                    if (IsValidUUID(key)) {
                        customEntityIds.push(key);
                    } else {
                        const entInfo =
                            provider.EntityByName?.(key) ??
                            provider.Entities?.find((e) => e.Name.trim().toLowerCase() === key);
                        if (entInfo?.ID && IsValidUUID(entInfo.ID)) {
                            customEntityIds.push(entInfo.ID);
                        }
                    }
                }
                for (const idChunk of chunkArray(customEntityIds, IN_CLAUSE_CHUNK_SIZE)) {
                    const customDelegParams: RunViewParams = {
                        EntityName: 'MJ: Artifacts',
                        ExtraFilter: `DelegateEntityID IN (${buildQuotedInList(idChunk)})`,
                        Fields: ['ID'],
                        IgnoreMaxRows: true,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    };
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(customDelegParams);
                    const customDelegRes = await rv.RunView<ArtifactOwnerRowProjection>(customDelegParams, queryActor);
                    if (!customDelegRes.Success && throwOnQueryFailure) {
                        throw new Error(customDelegRes.ErrorMessage || 'Failed querying custom-delegated artifacts.');
                    }
                    if (customDelegRes.Success && customDelegRes.Results) {
                        for (const row of customDelegRes.Results) {
                            addCandidate(row.ID);
                        }
                    }
                }
            }

            // 4. Verify all candidates in one batched ResolvePermissionsBatch call (chunked internally at
            // IN_CLAUSE_CHUNK_SIZE) so delegate 'Deny' overrides are honored in O(1) round trips.
            const candidateValues = Array.from(candidates.entries());
            if (candidateValues.length > 0) {
                const resolveMemo = new Map<string, Promise<ResolvedArtifactPermissions>>();
                const resolvedBatch = await this.ResolvePermissionsBatch(
                    provider,
                    candidateValues.map(([, rawId]) => rawId),
                    user,
                    0,
                    undefined,
                    resolveMemo,
                    throwOnQueryFailure
                );
                for (const [normId, rawId] of candidateValues) {
                    const perms = resolvedBatch.get(rawId);
                    if (perms && perms.CanRead) {
                        const matches = predicate ? predicate(perms) : perms.CanRead;
                        if (matches) {
                            readable.add(normId);
                        }
                    }
                }
            }

            return readable;
        } catch (err) {
            LogError(
                `ArtifactPermissionEngine.BuildReadableArtifactIdSet error for user '${user.ID}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return throwOnQueryFailure ? null : readable;
        }
    }

    private async resolvePermissionQueryActor(
        provider: IMetadataProvider,
        user: UserInfo,
        contextLabel: string
    ): Promise<UserInfo | null> {
        if (provider.ProviderType === 'Database') {
            const systemUser = await WellKnownUserSource.Instance.GetSystemUser(provider);
            if (!systemUser) {
                LogError(
                    `ArtifactPermissionEngine skipped lookup for ${contextLabel}: system user is unavailable on Database provider.`
                );
                return null;
            }
            return systemUser;
        }
        return user;
    }

    private buildDeniedCollection(collectionId: string, reason: string): ResolvedCollectionPermissions {
        return {
            CollectionID: collectionId,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Denied',
            Reason: reason
        };
    }

    private buildDenied(artifactId: string, reason: string): ResolvedArtifactPermissions {
        return {
            ArtifactID: artifactId,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Denied',
            Reason: reason
        };
    }
}

/** Tree-shaking prevention loader for {@link ParentArtifactPermissionDelegate}. */
export function LoadArtifactPermissionDelegates(): void {
    // Intentionally empty — ensures @RegisterClass decorators in this module execute.
}
