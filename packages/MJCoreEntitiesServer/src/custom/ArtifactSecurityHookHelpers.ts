import {
    BaseEntity,
    BaseEntityResult,
    GetDataHooks,
    IEntityDataProvider,
    IMetadataProvider,
    Metadata,
    PlatformSQL,
    PostRunViewHook,
    PreRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { ArtifactPermissionEngine, type MJUserViewEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    GetGlobalObjectStore,
    IsValidUUID,
    UUIDsEqual
} from '@memberjunction/global';

/**
 * Shared security helpers for server-side artifact & collection entity subclasses
 * and their `PreRunView` / `PostRunView` hooks.
 */

/**
 * Canonical list of the 9 artifact & collection entities whose reads depend on
 * `PostRunView` row-level ACL hooks and must therefore be blocked from unscoped
 * generic SQL / aggregate / differential bypasses.
 */
export const ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES: readonly string[] = [
    'MJ: Artifacts',
    'MJ: Artifact Versions',
    'MJ: Artifact Version Attributes',
    'MJ: Artifact Permissions',
    'MJ: Collection Artifacts',
    'MJ: Collection Permissions',
    'MJ: Collections',
    'MJ: Artifact Working States',
    'MJ: Artifact Guest Share Links'
];

/**
 * Registers all 9 artifact/collection entities in MJCore's global `PostRunView`
 * protected entity registry. Safe to call multiple times (idempotent).
 */
export function RegisterArtifactPostRunViewProtectedEntityRegistry(): void {
    for (const entityName of ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES) {
        RegisterPostRunViewProtectedEntity(entityName);
    }
}

export function GetGlobalWeakSet(globalKey: string): WeakSet<object> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[globalKey];
        if (existing instanceof WeakSet) {
            return existing;
        }
        const created = new WeakSet<object>();
        store[globalKey] = created;
        return created;
    }
    return new WeakSet<object>();
}

export function GetGlobalOriginalFieldsMap(globalKey: string): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[globalKey];
        if (existing instanceof WeakMap) {
            return existing as WeakMap<RunViewParams, string[]>;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[globalKey] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

export function IsServerSystemUser(user: UserInfo | undefined | null): boolean {
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

export function ResolveMetadataProvider(
    entityProvider: IEntityDataProvider | IMetadataProvider | null | undefined,
    actor: UserInfo | null | undefined
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

export function ResolveTargetEntityName(
    params: RunViewParams,
    provider?: IMetadataProvider | null
): string | null {
    if (typeof params.EntityName === 'string' && params.EntityName.trim().length > 0) {
        return params.EntityName.trim();
    }
    const viewEntity = params.ViewEntity as MJUserViewEntity | undefined;
    const viewEntityName = viewEntity?.Entity;
    if (typeof viewEntityName === 'string' && viewEntityName.trim().length > 0) {
        return viewEntityName.trim();
    }
    const md = provider ?? ResolveMetadataProvider(null, null);
    if (params.ViewName && md) {
        const entity = md.EntityByName(params.ViewName);
        if (entity) {
            return entity.Name;
        }
    }
    return null;
}

export function ExtractSingleUuidFieldFromFilter(
    extraFilter: string | PlatformSQL | undefined,
    columnName: string
): string | null {
    if (typeof extraFilter !== 'string' || !extraFilter.trim()) {
        return null;
    }
    const trimmed = extraFilter.trim().replace(/^\((.*)\)$/, '$1').trim();
    const escapedCol = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `^(?:\\[?${escapedCol}\\]?)\\s*=\\s*'([^']+)'$`,
        'i'
    );
    const match = trimmed.match(pattern);
    if (!match || !match[1]) {
        return null;
    }
    const candidate = match[1].trim();
    return IsValidUUID(candidate) ? candidate : null;
}

export function ChunkUuidList(values: readonly string[], size: number): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < values.length; i += size) {
        out.push(values.slice(i, i + size));
    }
    return out;
}

export function PrepareRequiredFieldsPreRunView(
    params: RunViewParams,
    targetEntityName: string,
    requiredFields: readonly string[],
    internalParams: WeakSet<object>,
    originalFieldsMap: WeakMap<RunViewParams, string[]>,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): RunViewParams {
    const resolvedProvider = ResolveMetadataProvider(provider, contextUser);
    if (
        !params ||
        internalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        ResolveTargetEntityName(params, resolvedProvider) !== targetEntityName ||
        IsServerSystemUser(contextUser) ||
        (!contextUser && resolvedProvider !== null && resolvedProvider.ProviderType !== 'Database')
    ) {
        return params;
    }

    if (Array.isArray(params.Fields) && params.Fields.length > 0) {
        const lowerSet = new Set(params.Fields.map((f) => f.trim().toLowerCase()));
        const missing = requiredFields.filter((req) => !lowerSet.has(req.toLowerCase()));
        if (missing.length > 0) {
            const priorOriginalFields = originalFieldsMap.get(params) ?? [...params.Fields];
            const updatedParams: RunViewParams = {
                ...params,
                Fields: [...params.Fields, ...missing]
            };
            originalFieldsMap.set(updatedParams, priorOriginalFields);
            return updatedParams;
        }
    }

    return params;
}

export function ShouldBypassPostRunView(
    params: RunViewParams,
    targetEntityName: string,
    internalParams: WeakSet<object>,
    originalFieldsMap: WeakMap<RunViewParams, string[]>,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | null
): { bypass: boolean; originalFields: string[] | undefined } {
    const originalFields = params ? originalFieldsMap.get(params) : undefined;
    if (params && originalFields) {
        originalFieldsMap.delete(params);
    }
    if (
        !params ||
        internalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        ResolveTargetEntityName(params, provider) !== targetEntityName ||
        IsServerSystemUser(contextUser) ||
        (!contextUser && provider !== null && provider.ProviderType !== 'Database')
    ) {
        return { bypass: true, originalFields };
    }
    return { bypass: false, originalFields };
}

export function EnsureHooksRegistered(
    preHook: PreRunViewHook,
    postHook: PostRunViewHook
): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(preHook)) {
        RegisterDataHook('PreRunView', preHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(postHook)) {
        RegisterDataHook('PostRunView', postHook);
    }
}

export function GetOldStringFieldValue(entity: BaseEntity, fieldName: string): string | null {
    const field =
        (Array.isArray(entity.Fields) ? entity.Fields.find((f) => f.Name === fieldName) : undefined) ??
        entity.GetFieldByName(fieldName);
    const raw = field?.OldValue;
    if (raw === null || raw === undefined) {
        return null;
    }
    const str = String(raw).trim();
    return str.length > 0 ? str : null;
}

export function NormalizeNullableGuidOrString(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function UuidsOrNullEqual(a: string | null, b: string | null): boolean {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return UUIDsEqual(a, b);
}

export function FailEntityOperation(
    entity: BaseEntity,
    type: 'create' | 'update' | 'delete',
    message: string
): boolean {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = type;
    result.Message = message;
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    if (typeof entity.RegisterResultHistoryEntry === 'function') {
        entity.RegisterResultHistoryEntry(result);
    } else if (Array.isArray(entity.ResultHistory)) {
        entity.ResultHistory.push(result);
    }
    return false;
}

export function EmptyPostRunViewResult(results: RunViewResult): RunViewResult {
    return {
        ...results,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0
    };
}

export function StripSyntheticFieldsFromRow<T extends object>(
    row: T,
    originalFields: readonly string[] | undefined
): T {
    if (!originalFields || row instanceof BaseEntity) {
        return row;
    }
    const keepLower = new Set(originalFields.map((f) => f.trim().toLowerCase()));
    const copy = { ...row };
    for (const key of Object.keys(copy) as Array<keyof T>) {
        if (!keepLower.has(String(key).toLowerCase())) {
            delete copy[key];
        }
    }
    return copy;
}
