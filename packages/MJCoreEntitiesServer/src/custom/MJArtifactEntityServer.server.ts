import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityDeleteOptions,
    EntitySaveOptions,
    GetDataHooks,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    Metadata,
    PostRunViewHook,
    PreRunViewHook,
    RegisterDataHook,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactDelegateContext,
    ArtifactPermissionEngine,
    BaseArtifactPermissionDelegate,
    DelegatePermissionDecision,
    IArtifactPermissionDelegate,
    MJArtifactEntity,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GetGlobalObjectStore, MJGlobal, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

const GLOBAL_KEY_INTERNAL_ARTIFACT_PARAMS = '__MJ_INTERNAL_ARTIFACT_SECURITY_QUERY_PARAMS__';
const GLOBAL_KEY_ORIGINAL_ARTIFACT_FIELDS = '__MJ_ORIGINAL_ARTIFACT_FIELDS_BY_PARAMS__';

function getInternalArtifactQueryParamsSet(): WeakSet<object> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_INTERNAL_ARTIFACT_PARAMS];
        if (existing instanceof WeakSet) {
            return existing;
        }
        const created = new WeakSet<object>();
        store[GLOBAL_KEY_INTERNAL_ARTIFACT_PARAMS] = created;
        return created;
    }
    return new WeakSet<object>();
}

function getOriginalArtifactFieldsMap(): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_ORIGINAL_ARTIFACT_FIELDS];
        if (existing instanceof WeakMap) {
            return existing;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[GLOBAL_KEY_ORIGINAL_ARTIFACT_FIELDS] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

interface ArtifactRowProjection {
    ID?: string | null;
    [key: string]: string | number | boolean | Date | null | undefined;
}

type ArtifactViewRow = BaseEntity | ArtifactRowProjection;

function isServerSystemUser(user: UserInfo | undefined | null): boolean {
    if (!user) {
        return false;
    }
    const systemUserId = UserCache.Instance.GetSystemUser()?.ID;
    return Boolean(
        (systemUserId && UUIDsEqual(user.ID, systemUserId)) ||
            WellKnownUserSource.Instance.IsSystemUser(user)
    );
}

function isMetadataProvider(
    provider: IEntityDataProvider | IMetadataProvider | null | undefined
): provider is IMetadataProvider {
    return Boolean(provider && ('Entities' in provider || 'EntityByID' in provider || 'ProviderType' in provider));
}

function resolveMetadataProvider(
    entityProvider: IEntityDataProvider | IMetadataProvider | null | undefined,
    actor: UserInfo | undefined | null
): IMetadataProvider | null {
    if (isMetadataProvider(entityProvider)) {
        return entityProvider;
    }
    return (
        actor?.OwningProvider ??
        Metadata.Provider ?? // global-provider-ok: fallback when provider is not attached to entity
        null
    );
}

function resolveTargetEntityName(params: RunViewParams): string {
    if (typeof params.EntityName === 'string' && params.EntityName.trim().length > 0) {
        return params.EntityName.trim();
    }
    const viewEntity = params.ViewEntity as MJUserViewEntity | undefined;
    const viewEntityName = viewEntity?.Entity;
    if (typeof viewEntityName === 'string' && viewEntityName.trim().length > 0) {
        return viewEntityName.trim();
    }
    return '';
}

function hasFieldIgnoreCase(fields: readonly string[], targetField: string): boolean {
    const lower = targetField.toLowerCase();
    return fields.some((f) => typeof f === 'string' && f.trim().toLowerCase() === lower);
}

function readArtifactRowId(row: ArtifactViewRow | null | undefined): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactEntity) {
        return row.ID ? row.ID.trim() : null;
    }
    const candidate = (row as ArtifactRowProjection).ID;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function stripSyntheticArtifactId(row: ArtifactViewRow): ArtifactViewRow {
    if (!row || typeof row !== 'object' || row instanceof BaseEntity) {
        return row;
    }
    if (!Object.prototype.hasOwnProperty.call(row, 'ID')) {
        return row;
    }
    const copy: ArtifactRowProjection = { ...(row as ArtifactRowProjection) };
    delete copy.ID;
    return copy;
}

function readDelegateRegistryMap(): Map<string, IArtifactPermissionDelegate> | undefined {
    for (const [key, value] of Object.entries(ArtifactPermissionEngine.Instance)) {
        if (key === '_delegatesByEntityKey' && value instanceof Map) {
            return value as Map<string, IArtifactPermissionDelegate>;
        }
    }
    return undefined;
}

/**
 * Server-side `PreRunView` hook ensuring `ID` is projected when a non-system caller queries
 * `MJ: Artifacts` with a narrow `Fields` list so `ArtifactPostRunViewHook` can check `CanRead`.
 */
export const ArtifactPreRunViewHook: PreRunViewHook = (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): RunViewParams => {
    const provider = resolveMetadataProvider(hookProvider, contextUser);
    const internalParams = getInternalArtifactQueryParamsSet();
    if (
        !params ||
        internalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifacts' ||
        isServerSystemUser(contextUser) ||
        (!contextUser && provider !== null && provider.ProviderType !== 'Database')
    ) {
        return params;
    }
    if (
        Array.isArray(params.Fields) &&
        params.Fields.length > 0 &&
        !hasFieldIgnoreCase(params.Fields, 'ID')
    ) {
        getOriginalArtifactFieldsMap().set(params, [...params.Fields]);
        params.Fields = [...params.Fields, 'ID'];
    }
    return params;
};

/**
 * Server-side `PostRunView` data hook enforcing `ArtifactPermissionEngine` `CanRead`
 * authorization on `MJ: Artifacts` across `RunView` and `RunMJArtifactDynamicView`.
 */
export const ArtifactPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewResult> => {
    const internalParams = getInternalArtifactQueryParamsSet();
    if (
        !results?.Success ||
        internalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifacts'
    ) {
        return results;
    }

    const originalFieldsMap = getOriginalArtifactFieldsMap();
    const shouldStripSyntheticId = originalFieldsMap.has(params);

    if (isServerSystemUser(contextUser)) {
        return results;
    }

    const provider = resolveMetadataProvider(hookProvider, contextUser);

    if (!contextUser) {
        if (provider !== null && provider.ProviderType !== 'Database') {
            if (shouldStripSyntheticId && Array.isArray(results.Results)) {
                return {
                    ...results,
                    Results: (results.Results as ArtifactViewRow[]).map(stripSyntheticArtifactId)
                };
            }
            return results;
        }
        return {
            ...results,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0
        };
    }

    if (!provider) {
        return {
            ...results,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0
        };
    }

    if (provider.ProviderType !== 'Database') {
        if (shouldStripSyntheticId && Array.isArray(results.Results)) {
            return {
                ...results,
                Results: (results.Results as ArtifactViewRow[]).map(stripSyntheticArtifactId)
            };
        }
        return results;
    }

    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        if (params.ResultType === 'count_only' && (results.TotalRowCount ?? 0) > 0) {
            return {
                ...results,
                RowCount: 0,
                TotalRowCount: 0
            };
        }
        return results;
    }

    const rawRows = results.Results as ArtifactViewRow[];
    const readAllowedByArtifact = new Map<string, boolean>();
    const keptRows: ArtifactViewRow[] = [];

    for (const row of rawRows) {
        const artifactId = readArtifactRowId(row);
        if (!artifactId) {
            continue;
        }
        const normId = NormalizeUUID(artifactId);
        let allowed = readAllowedByArtifact.get(normId);
        if (allowed === undefined) {
            try {
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    artifactId,
                    contextUser
                );
                allowed = perms.CanRead;
            } catch (error) {
                LogError(
                    `ArtifactPostRunViewHook failed resolving CanRead for artifact ${artifactId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                allowed = false;
            }
            readAllowedByArtifact.set(normId, allowed);
        }
        if (allowed) {
            keptRows.push(shouldStripSyntheticId ? stripSyntheticArtifactId(row) : row);
        }
    }

    const removedCount = rawRows.length - keptRows.length;
    const isPaged = (results.TotalRowCount ?? rawRows.length) > rawRows.length;
    if (removedCount === 0 && !shouldStripSyntheticId && !isPaged) {
        return results;
    }

    return {
        ...results,
        Results: keptRows,
        RowCount: keptRows.length,
        TotalRowCount: isPaged
            ? keptRows.length
            : Math.max(0, (results.TotalRowCount ?? rawRows.length) - removedCount)
    };
};

export function EnsureArtifactReadHookRegistered(): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(ArtifactPreRunViewHook)) {
        RegisterDataHook('PreRunView', ArtifactPreRunViewHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(ArtifactPostRunViewHook)) {
        RegisterDataHook('PostRunView', ArtifactPostRunViewHook);
    }
}

EnsureArtifactReadHookRegistered();

/**
 * Server-side entity subclass for `MJ: Artifacts`.
 *
 * Enforces:
 * 1. `CanRead` on `Load` / `InnerLoad` and `PreRunView` / `PostRunView` via `ArtifactPermissionEngine`.
 * 2. Owner identity on create (`UserID === actor.ID` for non-system callers).
 * 3. `CanEdit` on all saved updates (`Name`, `Description`, `Visibility`, `TypeID`, `EnvironmentID`, `Comments`, etc.),
 *    plus owner-only `UserID` and delegation changes.
 * 4. `CanDelete` on `Delete()` for non-system callers.
 * 5. Atomic pairing of `DelegateEntityID` and `DelegateRecordID` and anti-self-delegation checks.
 * 6. `ArtifactPermissionEngine.NotifyPermissionsChanged` on ownership/delegation/delete events.
 */
@RegisterClass(BaseEntity, 'MJ: Artifacts')
export class MJArtifactEntityServer extends MJArtifactEntity {
    public override async Load(
        ID: string,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const key = CompositeKey.FromID(ID); // first-pk-ok: 'MJ: Artifacts' has the single key ID
        return this.InnerLoad(key, EntityRelationshipsToLoad);
    }

    public override async InnerLoad(
        compositeKey: CompositeKey,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const loaded = await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }

        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            const provider = resolveMetadataProvider(this.ProviderToUse, actor);
            if (!actor || !provider || !this.ID) {
                this.NewRecord();
                return false;
            }
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                this.ID,
                actor
            );
            if (!perms.CanRead) {
                this.NewRecord();
                return false;
            }
        }

        return true;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const wasSaved = this.IsSaved;
        const oldUserId = this.getOldStringValue('UserID');
        const oldDelegateEntityId = this.getOldStringValue('DelegateEntityID');
        const oldDelegateRecordId = this.getOldStringValue('DelegateRecordID');

        const newUserId = this.normalizeNullableString(this.UserID);
        const newDelegateEntityId = this.normalizeNullableString(this.DelegateEntityID);
        const newDelegateRecordId = this.normalizeNullableString(this.DelegateRecordID);

        const saveType: 'create' | 'update' = wasSaved ? 'update' : 'create';

        // 1. Reject partial delegation unconditionally (both columns must be set together or cleared together).
        if (Boolean(newDelegateEntityId) !== Boolean(newDelegateRecordId)) {
            return this.failResult(
                saveType,
                'DelegateEntityID and DelegateRecordID must either both be populated or both be null.'
            );
        }

        const actor = this.ContextCurrentUser;
        const isSystemUser = isServerSystemUser(actor);

        const userIdChanged = !this.uuidsOrNullEqual(oldUserId, newUserId);
        const delegateEntityChanged = !this.uuidsOrNullEqual(oldDelegateEntityId, newDelegateEntityId);
        const delegateRecordChanged = (oldDelegateRecordId ?? null) !== (newDelegateRecordId ?? null);

        const provider = resolveMetadataProvider(this.ProviderToUse, actor);
        if (provider?.ProviderType === 'Network') {
            return super.Save(options);
        }
        const delegateEntityInfo = newDelegateEntityId
            ? provider?.EntityByID?.(newDelegateEntityId)
            : undefined;
        const isArtifactTarget = Boolean(
            (delegateEntityInfo &&
                delegateEntityInfo.Name.trim().toLowerCase() === 'mj: artifacts') ||
                (this.DelegateEntity ?? '').trim().toLowerCase() === 'mj: artifacts'
        );

        // Unconditionally reject structural self-delegation (even for systemUser / background workers).
        if (isArtifactTarget && this.ID && newDelegateRecordId && UUIDsEqual(newDelegateRecordId, this.ID)) {
            return this.failResult(saveType, 'An artifact cannot delegate permissions to itself.');
        }

        if (!isSystemUser) {
            if (!actor) {
                return this.failResult(
                    saveType,
                    'Authenticated user context is required to save an artifact.'
                );
            }

            // 2a. On create, non-system callers may only create artifacts owned by themselves.
            if (!wasSaved) {
                if (!newUserId || !UUIDsEqual(newUserId, actor.ID)) {
                    return this.failResult(
                        'create',
                        'Permission denied: UserID must match the authenticated actor when creating an artifact.'
                    );
                }
            }

            // 2b. On update, enforce CanEdit across all mutations and owner-only ownership/delegation transfer.
            if (wasSaved) {
                if (!provider || !this.ID) {
                    return this.failResult(
                        'update',
                        'Permission denied: provider context and target ArtifactID are required to update an artifact.'
                    );
                }
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    this.ID,
                    actor
                );
                if (!perms.CanEdit) {
                    return this.failResult(
                        'update',
                        `Permission denied: user '${actor.Email || actor.ID}' does not hold Edit permission on artifact '${this.ID}'.`
                    );
                }

                const isExistingOwner = Boolean(oldUserId && UUIDsEqual(oldUserId, actor.ID));
                if (userIdChanged && !isExistingOwner) {
                    return this.failResult(
                        'update',
                        'Only the existing artifact owner may transfer artifact ownership.'
                    );
                }
                if ((delegateEntityChanged || delegateRecordChanged) && !isExistingOwner) {
                    return this.failResult(
                        'update',
                        'Only the existing artifact owner may set or modify DelegateEntityID and DelegateRecordID.'
                    );
                }
            }

            // 3. On both create and update, whenever delegation is active, verify target entity + actor CanEdit.
            if (newDelegateEntityId && newDelegateRecordId) {
                if (!provider || !delegateEntityInfo) {
                    return this.failResult(
                        saveType,
                        `Delegating entity '${newDelegateEntityId}' was not found in metadata.`
                    );
                }

                const canEditTarget = await this.verifyActorCanEditDelegateTarget(
                    provider,
                    delegateEntityInfo.ID,
                    delegateEntityInfo.Name,
                    newDelegateRecordId,
                    newUserId ?? actor.ID,
                    actor,
                    isArtifactTarget
                );
                if (!canEditTarget) {
                    return this.failResult(
                        saveType,
                        `Actor does not hold Edit permission on the target delegating record (${delegateEntityInfo.Name}: ${newDelegateRecordId}).`
                    );
                }
            }
        }

        const ok = await super.Save(options);
        if (ok && wasSaved && (userIdChanged || delegateEntityChanged || delegateRecordChanged)) {
            await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                ArtifactID: this.ID,
                ChangedByUserID: actor?.ID
            });
        }
        return ok;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            const provider = resolveMetadataProvider(this.ProviderToUse, actor);
            if (provider?.ProviderType === 'Network') {
                return super.Delete(options);
            }
            if (!actor || !provider || !this.ID) {
                return this.failResult(
                    'delete',
                    'Permission denied: authenticated user context and target ArtifactID are required to delete an artifact.'
                );
            }
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                this.ID,
                actor
            );
            if (!perms.CanDelete) {
                return this.failResult(
                    'delete',
                    `Permission denied: user '${actor.Email || actor.ID}' does not hold Delete permission on artifact '${this.ID}'.`
                );
            }
        }

        const id = this.ID;
        const ok = await super.Delete(options);
        if (ok && id) {
            await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                ArtifactID: id,
                ChangedByUserID: this.ContextCurrentUser?.ID
            });
        }
        return ok;
    }

    private async verifyActorCanEditDelegateTarget(
        provider: IMetadataProvider,
        delegateEntityId: string,
        delegateEntityName: string,
        delegateRecordId: string,
        artifactOwnerUserId: string,
        actor: UserInfo,
        isArtifactTarget: boolean
    ): Promise<boolean> {
        const visited = this.ID ? new Set<string>([this.ID.trim().toLowerCase()]) : undefined;
        if (isArtifactTarget) {
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                delegateRecordId,
                actor,
                0,
                visited
            );
            return perms.CanEdit === true;
        }

        const delegate = this.resolveRegisteredDelegate(delegateEntityId, delegateEntityName);
        if (!delegate) {
            return false;
        }

        const ctx: ArtifactDelegateContext = {
            ArtifactID: this.ID || '',
            ArtifactOwnerUserID: artifactOwnerUserId,
            DelegateEntityID: delegateEntityId,
            DelegateEntityName: delegateEntityName,
            DelegateRecordID: delegateRecordId,
            Provider: provider,
            Depth: 0,
            VisitedArtifactIDs: visited
        };
        const decision: DelegatePermissionDecision = await delegate.CanEdit(ctx, actor);
        return decision === true || decision === 'Allow';
    }

    private resolveRegisteredDelegate(
        entityId: string,
        entityName: string
    ): IArtifactPermissionDelegate | null {
        const programmaticMap = readDelegateRegistryMap();

        const byId = programmaticMap?.get(entityId.trim().toLowerCase());
        if (byId) {
            return byId;
        }
        const byName = programmaticMap?.get(entityName.trim().toLowerCase());
        if (byName) {
            return byName;
        }

        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseArtifactPermissionDelegate,
            entityName
        );
        if (!reg) {
            return null;
        }
        const registered = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactPermissionDelegate>(
            BaseArtifactPermissionDelegate,
            entityName
        );
        if (registered && registered.constructor !== BaseArtifactPermissionDelegate) {
            return registered;
        }
        return null;
    }

    private getOldStringValue(fieldName: string): string | null {
        const field =
            (Array.isArray(this.Fields) ? this.Fields.find((f) => f.Name === fieldName) : undefined) ??
            this.GetFieldByName(fieldName);
        const raw = field?.OldValue;
        if (raw === null || raw === undefined) {
            return null;
        }
        const str = String(raw).trim();
        return str.length > 0 ? str : null;
    }

    private normalizeNullableString(value: string | null | undefined): string | null {
        if (value === null || value === undefined) {
            return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    private uuidsOrNullEqual(a: string | null, b: string | null): boolean {
        if (!a && !b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        return UUIDsEqual(a, b);
    }

    private failResult(type: 'create' | 'update' | 'delete', message: string): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        if (typeof this.RegisterResultHistoryEntry === 'function') {
            this.RegisterResultHistoryEntry(result);
        } else if (Array.isArray(this.ResultHistory)) {
            this.ResultHistory.push(result);
        }
        return false;
    }
}
