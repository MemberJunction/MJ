import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    IMetadataProvider,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactDelegateContext,
    ArtifactPermissionEngine,
    BaseArtifactPermissionDelegate,
    DelegatePermissionDecision,
    IArtifactPermissionDelegate,
    MJArtifactEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';

/**
 * Server-side entity subclass for `MJ: Artifacts`.
 *
 * Enforces:
 * 1. Atomic pairing of `DelegateEntityID` and `DelegateRecordID` (rejects partial delegation).
 * 2. Owner-only delegation changes on existing artifacts (`B2` — prevents shared editors from
 *    rebinding `DelegateEntityID` / `DelegateRecordID` to lock out the artifact owner or hijack permissions).
 * 3. Pre-save verification on both create and update that the acting user already holds `CanEdit`
 *    on the target `(DelegateEntityID, DelegateRecordID)` via `ArtifactPermissionEngine` or the
 *    registered `BaseArtifactPermissionDelegate` (`B2`), and blocks self-delegation / cyclic delegation.
 * 4. Immediate `ArtifactPermissionEngine.NotifyPermissionsChanged` emission when ownership,
 *    delegation bindings, or record existence changes (`C2`) so active Yjs collaboration rooms
 *    re-evaluate permissions in real time.
 */
@RegisterClass(BaseEntity, 'MJ: Artifacts')
export class MJArtifactEntityServer extends MJArtifactEntity {
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
            return this.failSave(
                saveType,
                'DelegateEntityID and DelegateRecordID must either both be populated or both be null.'
            );
        }

        const actor = this.ContextCurrentUser;
        const systemUserId = UserCache.Instance.GetSystemUser()?.ID;
        const isSystemUser = Boolean(
            actor &&
                ((systemUserId && UUIDsEqual(actor.ID, systemUserId)) ||
                    WellKnownUserSource.Instance.IsSystemUser(actor))
        );

        const userIdChanged = !this.uuidsOrNullEqual(oldUserId, newUserId);
        const delegateEntityChanged = !this.uuidsOrNullEqual(oldDelegateEntityId, newDelegateEntityId);
        const delegateRecordChanged = (oldDelegateRecordId ?? null) !== (newDelegateRecordId ?? null);

        const provider = this.ProviderToUse as unknown as IMetadataProvider | undefined;
        const delegateEntityInfo = newDelegateEntityId
            ? provider?.Entities?.find((e) => UUIDsEqual(e.ID, newDelegateEntityId))
            : undefined;
        const isArtifactTarget = Boolean(
            delegateEntityInfo &&
                (delegateEntityInfo.Name.trim().toLowerCase() === 'mj: artifacts' ||
                    (this.DelegateEntity ?? '').trim().toLowerCase() === 'mj: artifacts')
        );

        // Unconditionally reject structural self-delegation (even for systemUser / background workers).
        if (isArtifactTarget && this.ID && newDelegateRecordId && UUIDsEqual(newDelegateRecordId, this.ID)) {
            return this.failSave(saveType, 'An artifact cannot delegate permissions to itself.');
        }

        if (!isSystemUser) {
            // 2. On update, only the stored artifact owner may change UserID or DelegateEntityID / DelegateRecordID.
            if (wasSaved) {
                const isExistingOwner = Boolean(actor && oldUserId && UUIDsEqual(oldUserId, actor.ID));
                if (userIdChanged && !isExistingOwner) {
                    return this.failSave(
                        'update',
                        'Only the existing artifact owner may transfer artifact ownership.'
                    );
                }
                if ((delegateEntityChanged || delegateRecordChanged) && !isExistingOwner) {
                    return this.failSave(
                        'update',
                        'Only the existing artifact owner may set or modify DelegateEntityID and DelegateRecordID.'
                    );
                }
            }

            // 3. On both create and update, whenever delegation is active, verify target entity + actor CanEdit.
            if (newDelegateEntityId && newDelegateRecordId) {
                if (!actor) {
                    return this.failSave(
                        saveType,
                        'Authenticated user context is required when setting artifact permission delegation.'
                    );
                }

                if (!provider || !delegateEntityInfo) {
                    return this.failSave(
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
                    return this.failSave(
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
        const programmaticMap = (
            ArtifactPermissionEngine.Instance as unknown as {
                _delegatesByEntityKey?: Map<string, IArtifactPermissionDelegate>;
            }
        )._delegatesByEntityKey;

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

    private failSave(type: 'create' | 'update', message: string): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }
}
