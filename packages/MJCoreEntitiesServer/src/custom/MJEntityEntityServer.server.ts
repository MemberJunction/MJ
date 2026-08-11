import { BaseEntity, EntitySaveOptions, IMetadataProvider, LogDebug, RunInEntityTransaction } from '@memberjunction/core';
import { MJEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { ReconcileFieldPermissions } from './fieldPermissionReconciler';

/**
 * Server-side `MJ: Entities` entity — the runtime half of field-security lifecycle management.
 *
 * Turning `EnableFieldLevelSecurity` ON has to snapshot the entity's existing entity-level
 * permissions into per-field rows, or the entity comes up with every field denied: on an
 * enabled entity a field with no rows is denied, not open. The flag and its rows therefore have
 * to land together — a committed flag with no rows locks every user out of every field until
 * someone notices.
 *
 * Turning it OFF writes nothing. Rows are retained and simply stop being consulted, so
 * re-enabling does not lose an administrator's configuration. Re-enabling runs the same
 * reconciliation, which adds whatever the schema gained in the meantime and leaves existing
 * rows alone.
 */
@RegisterClass(BaseEntity, 'MJ: Entities')
export class MJEntityEntityServer extends MJEntityEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.isTurningFieldSecurityOn()) {
            return super.Save(options);
        }

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        return RunInEntityTransaction(this.ProviderToUse, async () => {
            // The flag has to persist BEFORE reconciliation: the rows it writes are only
            // meaningful once the flag says they apply.
            if (!(await super.Save(options))) {
                return false;
            }
            await this.snapshotFieldPermissions(provider);
            return true;
        });
    }

    /**
     * True when this save switches field security from off to on.
     *
     * A new record with the flag already set counts — there is no prior state, so the rows
     * still have to be created. On an existing record the field must be dirty, or every
     * unrelated edit to an entity enabled months ago would re-run reconciliation.
     */
    private isTurningFieldSecurityOn(): boolean {
        if (!this.EnableFieldLevelSecurity) {
            return false;
        }
        return !this.IsSaved || this.GetFieldByName('EnableFieldLevelSecurity').Dirty;
    }

    /**
     * Writes the snapshot rows for this entity, inside the caller's transaction.
     *
     * Resolves the `EntityInfo` from the provider rather than trusting a captured reference:
     * the delta is computed from the entity's fields and entity-level permissions, and those
     * live on metadata rather than on this record.
     */
    private async snapshotFieldPermissions(provider: IMetadataProvider): Promise<void> {
        const entityInfo = provider.Entities?.find(e => UUIDsEqual(e.ID, this.ID));
        if (!entityInfo) {
            // Metadata has not caught up with a brand-new entity yet. CodeGen's manage-metadata
            // pass reconciles it on its next run, which is the same path a schema change takes.
            LogDebug(`[FieldSecurity] '${this.Name}' enabled before its metadata was available; deferring snapshot`);
            return;
        }
        const result = await ReconcileFieldPermissions(entityInfo, provider, this.ContextCurrentUser);
        LogDebug(`[FieldSecurity] '${this.Name}' enabled; snapshot wrote ${result.Inserted} row(s)`);
    }
}
