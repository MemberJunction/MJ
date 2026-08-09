import {
    EntityInfo,
    IMetadataProvider,
    LogDebug,
    LogError,
    RunInEntityTransaction,
    UserInfo,
} from '@memberjunction/core';
import { MJEntityFieldPermissionEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { ComputeFieldPermissionDelta, IsEmptyFieldPermissionDelta } from './fieldPermissionDelta';

/** What a reconciliation run actually wrote. */
export type FieldPermissionReconcileResult = {
    Inserted: number;
    Deleted: number;
};

/**
 * The roles the MJ system user holds, which must never receive permission rows.
 *
 * `MJEntityFieldPermissionEntityServer` refuses to save a row aimed at one of them. The standard
 * roles (UI, Developer, Integration) hold entity permissions on essentially every entity and the
 * system user holds those roles — so without this exclusion the snapshot fails on its first row
 * and field security cannot be enabled on anything.
 *
 * Returns empty when the cache is cold, which degrades to the previous behaviour rather than
 * silently skipping every role.
 */
function systemUserRoleIDs(): string[] {
    const systemUser = UserCache.Instance?.GetSystemUser?.();
    return (systemUser?.UserRoles ?? []).map(ur => ur.RoleID).filter(Boolean);
}

const NOTHING_DONE: FieldPermissionReconcileResult = { Inserted: 0, Deleted: 0 };

/**
 * Brings an entity's field-permission rows in line with its fields and entity-level
 * permissions, writing the whole delta in one transaction.
 *
 * Every row goes through `BaseEntity.Save()` / `.Delete()` rather than direct SQL, so the
 * save-time target guard, validation and entity actions all run — the delta function and the
 * guard agree instead of one bypassing the other. `AllowDirectSQLInsert` stays off.
 *
 * Returns immediately when there is nothing to do, which is the overwhelmingly common case:
 * reconciliation is triggered from ordinary saves, and a transaction opened to write zero rows
 * is pure cost.
 *
 * @param entity the entity to reconcile — its `Fields` and `Permissions` are the desired state
 * @param provider the provider to transact on and to build entity objects from
 * @param contextUser the user the writes are attributed to
 */
export async function ReconcileFieldPermissions(
    entity: EntityInfo,
    provider: IMetadataProvider,
    contextUser: UserInfo
): Promise<FieldPermissionReconcileResult> {
    if (!entity || !provider) {
        return NOTHING_DONE;
    }
    const delta = ComputeFieldPermissionDelta(entity, { ExcludedRoleIDs: systemUserRoleIDs() });
    if (IsEmptyFieldPermissionDelta(delta)) {
        return NOTHING_DONE;
    }

    LogDebug(
        `[FieldSecurity] Reconciling '${entity.Name}': ` +
        `${delta.ToInsert.length} row(s) to add, ${delta.ToDelete.length} to remove`
    );

    return RunInEntityTransaction(provider as unknown as Parameters<typeof RunInEntityTransaction>[0], async () => {
        const deleted = await deleteRows(delta.ToDelete, provider, contextUser);
        const inserted = await insertRows(delta.ToInsert, provider, contextUser, entity);
        return { Inserted: inserted, Deleted: deleted };
    });
}

/**
 * Deletes happen BEFORE inserts. A row can be an orphan for one (field, role) while the same
 * pair needs a fresh row at snapshot defaults — doing it the other way round would collide on
 * the (EntityFieldID, RoleID) uniqueness constraint.
 */
async function deleteRows(ids: string[], provider: IMetadataProvider, contextUser: UserInfo): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
        const row = await provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', contextUser);
        if (!(await row.Load(id))) {
            // Already gone — another reconciliation, or a cascade from a dropped field.
            continue;
        }
        if (await row.Delete()) {
            deleted++;
        } else {
            throw new Error(
                `Field-permission reconciliation could not remove row '${id}': ` +
                `${row.LatestResult?.CompleteMessage ?? 'no error reported'}`
            );
        }
    }
    return deleted;
}

async function insertRows(
    rows: ReturnType<typeof ComputeFieldPermissionDelta>['ToInsert'],
    provider: IMetadataProvider,
    contextUser: UserInfo,
    entity: EntityInfo
): Promise<number> {
    let inserted = 0;
    for (const spec of rows) {
        const row = await provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', contextUser);
        row.NewRecord();
        row.EntityFieldID = spec.EntityFieldID;
        row.RoleID = spec.RoleID;
        row.ReadAccess = spec.ReadAccess;
        row.UpdateAccess = spec.UpdateAccess;
        row.CreateAccess = spec.CreateAccess;

        if (!(await row.Save())) {
            throw new Error(
                `Field-permission reconciliation could not add a row for '${entity.Name}' ` +
                `(field ${spec.EntityFieldID}, role ${spec.RoleID}): ` +
                `${row.LatestResult?.CompleteMessage ?? 'no error reported'}`
            );
        }
        inserted++;
    }
    return inserted;
}

/**
 * Runs {@link ReconcileFieldPermissions} and swallows failures into a logged error.
 *
 * For the adapters that reconcile as a SIDE EFFECT of some other save — a role being granted
 * entity access, say. The triggering save has already committed by then, so throwing would
 * report a failure for work that succeeded. The rows stay missing until the next reconciliation,
 * which is a visible loss of access rather than a silent loss of protection: a field with no row
 * on an enabled entity is denied.
 */
export async function ReconcileFieldPermissionsQuietly(
    entity: EntityInfo,
    provider: IMetadataProvider,
    contextUser: UserInfo
): Promise<FieldPermissionReconcileResult> {
    try {
        return await ReconcileFieldPermissions(entity, provider, contextUser);
    } catch (e) {
        LogError(`[FieldSecurity] Reconciliation of '${entity?.Name}' failed`, undefined, e);
        return NOTHING_DONE;
    }
}
