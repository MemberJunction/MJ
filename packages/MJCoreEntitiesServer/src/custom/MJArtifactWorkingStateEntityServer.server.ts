import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    GetDataHooks,
    IMetadataProvider,
    Metadata,
    PostRunViewHook,
    RegisterDataHook,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    MJArtifactWorkingStateEntity,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

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

function resolveProviderForUser(contextUser: UserInfo): IMetadataProvider | null {
    return (
        contextUser.OwningProvider ??
        Metadata.Provider ?? // global-provider-ok: fallback when UserInfo was constructed without an OwningProvider
        null
    );
}

function readWorkingStateArtifactId(row: unknown): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactWorkingStateEntity) {
        return row.ArtifactID || null;
    }
    const candidate = (row as Record<string, unknown>)['ArtifactID'];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

/**
 * Server-side `PostRunView` data hook enforcing `ArtifactPermissionEngine` read authorization
 * on `MJ: Artifact Working States` (`B1`).
 *
 * Ordinary `UI` users already hold zero `EntityPermission` on `MJ: Artifact Working States`.
 * This hook adds defense-in-depth for elevated non-system callers (e.g., `Developer` / `Integration`
 * users) so no `RunView` or GraphQL view query can return `YjsState` rows for artifacts the caller
 * is not authorized to read via `ArtifactPermissionEngine`.
 */
export const ArtifactWorkingStatePostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined
): Promise<RunViewResult> => {
    if (!results?.Success || resolveTargetEntityName(params) !== 'MJ: Artifact Working States') {
        return results;
    }

    if (isServerSystemUser(contextUser)) {
        return results;
    }

    if (!contextUser) {
        return {
            ...results,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0
        };
    }

    const provider = resolveProviderForUser(contextUser);
    if (!provider || provider.ProviderType !== 'Database') {
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

    const readAllowedByArtifact = new Map<string, boolean>();
    const keptRows: unknown[] = [];

    for (const row of results.Results) {
        const artifactId = readWorkingStateArtifactId(row);
        if (!artifactId) {
            continue;
        }
        const normId = NormalizeUUID(artifactId);
        let allowed = readAllowedByArtifact.get(normId);
        if (allowed === undefined) {
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
                contextUser
            );
            allowed = perms.CanRead;
            readAllowedByArtifact.set(normId, allowed);
        }
        if (allowed) {
            keptRows.push(row);
        }
    }

    if (keptRows.length === results.Results.length) {
        return results;
    }

    const removedCount = results.Results.length - keptRows.length;
    return {
        ...results,
        Results: keptRows,
        RowCount: keptRows.length,
        TotalRowCount: Math.max(0, (results.TotalRowCount ?? results.Results.length) - removedCount)
    };
};

/**
 * Ensures {@link ArtifactWorkingStatePostRunViewHook} is registered once in the global `PostRunView`
 * data hooks store.
 */
export function EnsureArtifactWorkingStateReadHookRegistered(): void {
    const existing = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existing.includes(ArtifactWorkingStatePostRunViewHook)) {
        RegisterDataHook('PostRunView', ArtifactWorkingStatePostRunViewHook);
    }
}

EnsureArtifactWorkingStateReadHookRegistered();

/**
 * Server-side entity subclass for `MJ: Artifact Working States` (`B1`).
 *
 * Enforces:
 * 1. **System-user-only writes/deletes**: `Save()` and `Delete()` reject any non-system-user caller
 *    so `MJ: Artifact Working States` checkpoints can only be written or compacted by
 *    `ArtifactCollaborationServer` under the server system user.
 * 2. **Artifact-permission-gated `Load()`**: Non-system-user callers attempting to `Load()` a
 *    working state row must hold `CanRead === true` on its parent `ArtifactID` via
 *    `ArtifactPermissionEngine`.
 */
@RegisterClass(BaseEntity, 'MJ: Artifact Working States')
export class MJArtifactWorkingStateEntityServer extends MJArtifactWorkingStateEntity {
    public override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const loaded = await super.Load(ID, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }
        const actor = this.ContextCurrentUser;
        if (isServerSystemUser(actor)) {
            return true;
        }
        const provider = this.ProviderToUse as unknown as IMetadataProvider | undefined;
        if (!actor || !provider || !this.ArtifactID) {
            this.NewRecord();
            return false;
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            this.ArtifactID,
            actor
        );
        if (!perms.CanRead) {
            this.NewRecord();
            return false;
        }
        return true;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            const res = new BaseEntityResult();
            res.Success = false;
            res.Type = this.IsSaved ? 'update' : 'create';
            res.StartedAt = new Date();
            res.EndedAt = new Date();
            res.Message =
                'MJ: Artifact Working States is server-managed and can only be written by ArtifactCollaborationServer under the system user.';
            this.ResultHistory.push(res);
            return false;
        }
        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            const res = new BaseEntityResult();
            res.Success = false;
            res.Type = 'delete';
            res.StartedAt = new Date();
            res.EndedAt = new Date();
            res.Message =
                'MJ: Artifact Working States is server-managed and can only be deleted by ArtifactCollaborationServer under the system user.';
            this.ResultHistory.push(res);
            return false;
        }
        return super.Delete(options);
    }
}
