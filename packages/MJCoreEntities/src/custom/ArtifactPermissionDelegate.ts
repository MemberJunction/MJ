import { IMetadataProvider, LogError, Metadata, RunView, RunViewParams, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, GetGlobalObjectStore, IsValidUUID, MJGlobal, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

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

const MAX_DELEGATE_DEPTH = 8;
const MAX_COLLECTION_ANCESTRY_DEPTH = 16;
const IN_CLAUSE_CHUNK_SIZE = 200;

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
     */
    public async ResolvePermissions(
        provider: IMetadataProvider | null | undefined,
        artifactId: string | null | undefined,
        user: UserInfo | null | undefined,
        depth: number = 0,
        visitedArtifactIds?: ReadonlySet<string>,
        memo?: Map<string, Promise<ResolvedArtifactPermissions>>
    ): Promise<ResolvedArtifactPermissions> {
        const normalizedArtifactId = (artifactId ?? '').trim();
        if (!normalizedArtifactId || !user) {
            return this.buildDenied(normalizedArtifactId, 'Artifact ID and authenticated user context are required.');
        }
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            return this.buildDenied(normalizedArtifactId, 'Scope-limited or anonymous magic-link principals cannot access governed artifact permissions.');
        }
        if (!IsValidUUID(normalizedArtifactId) || !IsValidUUID(user.ID)) {
            return this.buildDenied(normalizedArtifactId, 'Artifact ID and user ID must be valid UUIDs.');
        }

        if (depth > MAX_DELEGATE_DEPTH) {
            return this.buildDenied(normalizedArtifactId, 'Maximum artifact permission delegation depth exceeded.');
        }

        const visited = new Set<string>(visitedArtifactIds ?? []);
        const normArtifactId = NormalizeUUID(normalizedArtifactId);
        if (visited.has(normArtifactId)) {
            return this.buildDenied(normalizedArtifactId, 'Circular artifact permission delegation detected.');
        }
        visited.add(normArtifactId);

        const activeProvider = provider ?? Metadata.Provider;
        if (!activeProvider) {
            return this.buildDenied(normalizedArtifactId, 'Metadata provider is not available.');
        }

        const normUserId = NormalizeUUID(user.ID ?? '');
        const activeMemo = memo ?? new Map<string, Promise<ResolvedArtifactPermissions>>();
        const memoKey = `${normArtifactId}::${normUserId}`;
        const cachedPromise = activeMemo.get(memoKey);
        if (cachedPromise) {
            return cachedPromise;
        }

        const resolutionPromise = this.resolvePermissionsInternal(
            activeProvider,
            normalizedArtifactId,
            user,
            depth,
            visited,
            activeMemo
        );
        activeMemo.set(memoKey, resolutionPromise);
        return resolutionPromise;
    }

    private async resolvePermissionsInternal(
        activeProvider: IMetadataProvider,
        normalizedArtifactId: string,
        user: UserInfo,
        depth: number,
        visited: ReadonlySet<string>,
        memo: Map<string, Promise<ResolvedArtifactPermissions>>
    ): Promise<ResolvedArtifactPermissions> {
        const artifact = await this.loadArtifactRow(activeProvider, normalizedArtifactId, user);
        if (!artifact) {
            return this.buildDenied(normalizedArtifactId, `Artifact '${normalizedArtifactId}' was not found.`);
        }

        // 1. Artifact owner always has full permissions unless an explicit host delegate denies access.
        const isOwner = Boolean(artifact.UserID && UUIDsEqual(artifact.UserID, user.ID));

        // 2. Evaluate DelegateEntityID + DelegateRecordID when bound.
        if (artifact.DelegateEntityID && artifact.DelegateRecordID) {
            const delegateResult = await this.evaluateDelegate(
                activeProvider,
                artifact,
                user,
                depth,
                visited,
                memo
            );
            if (delegateResult) {
                return delegateResult;
            }
        }

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

        // 3 & 4. Union direct MJ: Artifact Permissions rows AND cascaded MJ: Collection Permissions
        // rows so a direct read-only share never masks higher grants inherited from a collection.
        const [directRows, collectionPerms] = await Promise.all([
            this.loadDirectPermissionRows(activeProvider, artifact.ID, user),
            this.loadCollectionPermissionRows(activeProvider, artifact.ID, user),
        ]);
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

    private async evaluateDelegate(
        provider: IMetadataProvider,
        artifact: ArtifactRowProjection,
        user: UserInfo,
        depth: number,
        visited: ReadonlySet<string>,
        memo: Map<string, Promise<ResolvedArtifactPermissions>>
    ): Promise<ResolvedArtifactPermissions | null> {
        const delegateEntityId = artifact.DelegateEntityID!;
        const delegateRecordId = artifact.DelegateRecordID!;
        const entityInfo = provider.EntityByID(delegateEntityId);
        const delegateEntityName = entityInfo?.Name ?? '';

        const delegate = this.resolveDelegateInstance(delegateEntityId, delegateEntityName);
        if (!delegate) {
            const entityLabel = delegateEntityName || delegateEntityId;
            LogError(
                `No permission delegate is registered for delegating entity '${entityLabel}' (${delegateRecordId}) on artifact '${artifact.ID}'.`
            );
            return this.buildDenied(
                artifact.ID,
                `No permission delegate is registered for delegating entity '${entityLabel}' (${delegateRecordId}).`
            );
        }

        // Fast O(depth) path for parent-artifact delegation ('MJ: Artifacts'): resolve the parent once per hop
        // instead of invoking 4 independent recursive calls across CanRead/CanEdit/CanDelete/CanShare.
        if (delegate instanceof ParentArtifactPermissionDelegate) {
            const parentPerms = await this.ResolvePermissions(
                provider,
                delegateRecordId,
                user,
                depth + 1,
                visited,
                memo
            );
            if (!parentPerms.CanRead) {
                return this.buildDenied(
                    artifact.ID,
                    `Access denied by delegate entity '${delegateEntityName || delegateEntityId}' (${delegateRecordId}).`
                );
            }
            return {
                ArtifactID: artifact.ID,
                CanRead: parentPerms.CanRead,
                CanEdit: parentPerms.CanEdit,
                CanDelete: parentPerms.CanDelete,
                CanShare: parentPerms.CanShare,
                Source: 'Delegate',
                Reason: `Permissions resolved via delegate '${delegateEntityName || delegateEntityId}' (${delegateRecordId}).`
            };
        }

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

        // If every action deferred, fall through to owner / MJ: Artifact Permissions.
        if (normRead === 'Defer' && normEdit === 'Defer' && normDelete === 'Defer' && normShare === 'Defer') {
            return null;
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
            const [directRows, collectionRows] = await Promise.all([
                this.loadDirectPermissionRows(provider, artifact.ID, user),
                this.loadCollectionPermissionRows(provider, artifact.ID, user)
            ]);
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

    private async loadArtifactRow(
        provider: IMetadataProvider,
        artifactId: string,
        user: UserInfo
    ): Promise<ArtifactRowProjection | null> {
        if (!IsValidUUID(artifactId)) {
            return null;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const safeId = EscapeSQLString(artifactId);
            const artifactParams: RunViewParams = {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID='${safeId}'`,
                Fields: ['ID', 'UserID', 'DelegateEntityID', 'DelegateRecordID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(artifactParams);
            const result = await rv.RunView<ArtifactRowProjection>(artifactParams, user);
            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }
            return result.Results[0];
        } catch (err) {
            LogError(`ArtifactPermissionEngine.loadArtifactRow error: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    private async loadDirectPermissionRows(
        provider: IMetadataProvider,
        artifactId: string,
        user: UserInfo
    ): Promise<ArtifactPermissionRowProjection[]> {
        if (!IsValidUUID(artifactId) || !IsValidUUID(user.ID)) {
            return [];
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const safeArtifactId = EscapeSQLString(artifactId);
            const safeUserId = EscapeSQLString(user.ID);
            const directParams: RunViewParams = {
                EntityName: 'MJ: Artifact Permissions',
                ExtraFilter: `ArtifactID='${safeArtifactId}' AND UserID='${safeUserId}'`,
                Fields: ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
                SkipTotalRowCount: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(directParams);
            const result = await rv.RunView<ArtifactPermissionRowProjection>(directParams, user);
            return result.Success ? result.Results ?? [] : [];
        } catch (err) {
            LogError(
                `ArtifactPermissionEngine.loadDirectPermissionRows error: ${err instanceof Error ? err.message : String(err)}`
            );
            return [];
        }
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

    private async collectReadableCollectionIds(
        rv: RunView,
        queryActor: UserInfo,
        userId: string
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
        const ownedColsRes = await rv.RunView<CollectionRowProjection>(ownedColsParams, queryActor);
        if (ownedColsRes.Success && ownedColsRes.Results) {
            for (const row of ownedColsRes.Results) {
                addCollectionSeed(row.ID);
            }
        }

        const sharedColsParams: RunViewParams = {
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `UserID='${safeUserId}' AND (CanRead=1 OR CanEdit=1 OR CanDelete=1 OR CanShare=1)`,
            Fields: ['CollectionID'],
            IgnoreMaxRows: true,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(sharedColsParams);
        const sharedColsRes = await rv.RunView<CollectionPermissionRowProjection>(sharedColsParams, queryActor);
        if (sharedColsRes.Success && sharedColsRes.Results) {
            for (const row of sharedColsRes.Results) {
                addCollectionSeed(row.CollectionID);
            }
        }

        let frontier = [...seedCollectionIds];
        for (let depth = 0; depth < MAX_COLLECTION_ANCESTRY_DEPTH && frontier.length > 0; depth++) {
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
                return readable;
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
            if (directRes.Success && directRes.Results) {
                for (const row of directRes.Results) {
                    addCandidate(row.ArtifactID);
                }
            }

            // 3. Owned collections + shared collections + descendant collections (depth 16, cycle-guarded)
            const seedCollectionIds = await this.collectReadableCollectionIds(rv, queryActor, user.ID);

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

            // 3c. Include artifacts delegated to non-'MJ: Artifacts' parent entities (e.g. custom entity delegates or Conversations)
            // so custom BaseArtifactPermissionDelegate grants remain visible in SQL-scoped RunView queries (`B2`).
            const delegFilter =
                artifactsEntityId && IsValidUUID(artifactsEntityId)
                    ? `DelegateEntityID IS NOT NULL AND DelegateEntityID <> '${EscapeSQLString(artifactsEntityId)}'`
                    : 'DelegateEntityID IS NOT NULL';
            const customDelegParams: RunViewParams = {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: delegFilter,
                Fields: ['ID'],
                IgnoreMaxRows: true,
                SkipTotalRowCount: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(customDelegParams);
            const customDelegRes = await rv.RunView<ArtifactOwnerRowProjection>(customDelegParams, queryActor);
            if (customDelegRes.Success && customDelegRes.Results) {
                for (const row of customDelegRes.Results) {
                    addCandidate(row.ID);
                }
            }

            // 4. Verify each candidate through ResolvePermissions (with shared memo) so delegate 'Deny' overrides are honored
            const resolveMemo = new Map<string, Promise<ResolvedArtifactPermissions>>();
            const candidateValues = Array.from(candidates.entries());
            for (const batch of chunkArray(candidateValues, 20)) {
                const resolvedBatch = await Promise.all(
                    batch.map(async ([normId, rawId]) => ({
                        normId,
                        perms: await this.ResolvePermissions(provider, rawId, user, 0, undefined, resolveMemo)
                    }))
                );
                for (const entry of resolvedBatch) {
                    const matches = predicate ? predicate(entry.perms) : entry.perms.CanRead;
                    if (entry.perms.CanRead && matches) {
                        readable.add(entry.normId);
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
            return readable;
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

    private async loadCollectionPermissionRows(
        provider: IMetadataProvider,
        artifactId: string,
        user: UserInfo
    ): Promise<CollectionPermissionRowProjection[]> {
        try {
            // On Database providers, run the version/collection membership lookup strictly as the system
            // user so `ArtifactVersionPostRunViewHook` does not recurse back into `ResolvePermissions`
            // while resolving collection-shared grants for `user` (`B3`, `R7-2`). If `GetSystemUser()`
            // is unavailable on a Database provider, fail closed on this inner collection lookup rather
            // than falling back to `user` (which would recurse) or using a process-wide set (which denies
            // concurrent parallel resolutions for the same artifact/user).
            const queryActor = await this.resolvePermissionQueryActor(provider, user, `artifact '${artifactId}'`);
            if (!queryActor) {
                return [];
            }

            const rv = RunView.FromMetadataProvider(provider);
            const safeArtifactId = EscapeSQLString(artifactId);
            const safeUserId = EscapeSQLString(user.ID);
            const versionsParams: RunViewParams = {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${safeArtifactId}'`,
                Fields: ['ID'],
                SkipTotalRowCount: true,
                ResultType: 'simple'
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(versionsParams);
            const versionsResult = await rv.RunView<{ ID: string }>(versionsParams, queryActor);
            const versionIds = Array.from(
                new Set((versionsResult.Success ? versionsResult.Results ?? [] : []).map((v) => v.ID).filter(Boolean))
            );
            if (versionIds.length === 0) {
                return [];
            }

            const directCollectionIds: string[] = [];
            const seenCollectionIds = new Set<string>();
            for (const verChunk of chunkArray(versionIds, IN_CLAUSE_CHUNK_SIZE)) {
                const colParams: RunViewParams = {
                    EntityName: 'MJ: Collection Artifacts',
                    ExtraFilter: `ArtifactVersionID IN (${buildQuotedInList(verChunk)})`,
                    Fields: ['CollectionID'],
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                };
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colParams);
                const colResult = await rv.RunView<CollectionArtifactRowProjection>(colParams, queryActor);
                for (const row of colResult.Success ? colResult.Results ?? [] : []) {
                    if (row.CollectionID) {
                        const norm = NormalizeUUID(row.CollectionID);
                        if (!seenCollectionIds.has(norm)) {
                            seenCollectionIds.add(norm);
                            directCollectionIds.push(row.CollectionID);
                        }
                    }
                }
            }
            if (directCollectionIds.length === 0) {
                return [];
            }

            // Walk ParentID ancestry up to depth 16 (cycle-guarded) and include collection OwnerID grants
            const allCollectionIds = [...directCollectionIds];
            const rows: CollectionPermissionRowProjection[] = [];
            let frontier = [...directCollectionIds];

            for (let depth = 0; depth < MAX_COLLECTION_ANCESTRY_DEPTH && frontier.length > 0; depth++) {
                const nextFrontier: string[] = [];
                for (const colChunk of chunkArray(frontier, IN_CLAUSE_CHUNK_SIZE)) {
                    const colMetaParams: RunViewParams = {
                        EntityName: 'MJ: Collections',
                        ExtraFilter: `ID IN (${buildQuotedInList(colChunk)})`,
                        Fields: ['ID', 'OwnerID', 'ParentID'],
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    };
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colMetaParams);
                    const colMetaRes = await rv.RunView<CollectionRowProjection>(colMetaParams, queryActor);
                    if (colMetaRes.Success && colMetaRes.Results) {
                        for (const col of colMetaRes.Results) {
                            if (col.OwnerID && UUIDsEqual(col.OwnerID, user.ID)) {
                                rows.push({
                                    CollectionID: col.ID,
                                    CanRead: true,
                                    CanEdit: true,
                                    CanDelete: true,
                                    CanShare: true
                                });
                            }
                            const parentId = col.ParentID?.trim();
                            if (parentId) {
                                const normParent = NormalizeUUID(parentId);
                                if (!seenCollectionIds.has(normParent)) {
                                    seenCollectionIds.add(normParent);
                                    allCollectionIds.push(parentId);
                                    nextFrontier.push(parentId);
                                }
                            }
                        }
                    }
                }
                frontier = nextFrontier;
            }

            for (const colChunk of chunkArray(allCollectionIds, IN_CLAUSE_CHUNK_SIZE)) {
                const permParams: RunViewParams = {
                    EntityName: 'MJ: Collection Permissions',
                    ExtraFilter: `CollectionID IN (${buildQuotedInList(colChunk)}) AND UserID='${safeUserId}'`,
                    Fields: ['CollectionID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                };
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(permParams);
                const permResult = await rv.RunView<CollectionPermissionRowProjection>(permParams, queryActor);
                if (permResult.Success && permResult.Results) {
                    rows.push(...permResult.Results);
                }
            }
            return rows;
        } catch (err) {
            LogError(
                `ArtifactPermissionEngine.loadCollectionPermissionRows error for artifact '${artifactId}' (user '${user.ID}'): ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return [];
        }
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
