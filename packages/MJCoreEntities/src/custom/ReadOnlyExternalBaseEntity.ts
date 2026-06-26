import { BaseEntity, BaseEntityResult, EntitySaveOptions, EntityDeleteOptions } from "@memberjunction/core";

/**
 * Base class for MJ entities whose data lives in an **external data source**
 * (Snowflake, Oracle, MongoDB, external SQL Server / PostgreSQL / MySQL, ...)
 * and is therefore **read-only** within MemberJunction.
 *
 * External entities are proxied live at read time through a
 * `BaseExternalDataSourceDriver` (see `@memberjunction/external-data-sources`);
 * MJ never owns their write path because transactions, Record Changes, and
 * row-level security cannot be guaranteed across heterogeneous remote systems.
 * Write support is an explicit non-goal of the External Data Sources design.
 *
 * `Save()` and `Delete()` are overridden to **short-circuit**: they never touch
 * the remote system, they populate `LatestResult` with a clear message, and
 * they return `false` — per MJ's boolean-return convention for these methods
 * (see CLAUDE.md → "BaseEntity Save/Delete Error Handling"). No exception is
 * thrown, so existing callers that check the boolean behave correctly.
 *
 * CodeGen emits generated external-entity subclasses extending this class
 * instead of `BaseEntity` when `Entity.ExternalDataSourceID` is set.
 *
 * @typeParam T - the entity's field-shape type, identical to the parameter
 *                a normal generated entity passes to `BaseEntity<T>`.
 */
export abstract class ReadOnlyExternalBaseEntity<T = unknown> extends BaseEntity<T> {
    /**
     * Human-readable reason returned when a caller attempts to mutate an
     * external (read-only) entity. Subclasses (or a CodeGen template) may
     * override to name the specific data source; the default uses the entity
     * name from metadata.
     */
    protected getReadOnlyMessage(operation: 'save' | 'delete'): string {
        const entityName = this.EntityInfo?.Name ?? 'This entity';
        return `'${entityName}' is sourced from an external data source and is read-only — ${operation} is not supported.`;
    }

    /**
     * Records a failed-mutation result on the entity's result history (so
     * `LatestResult.CompleteMessage` carries the read-only explanation) and returns
     * false without contacting the remote system.
     */
    private rejectMutation(type: 'update' | 'delete', operation: 'save' | 'delete'): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = this.getReadOnlyMessage(operation);
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }

    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return this.rejectMutation('update', 'save');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return this.rejectMutation('delete', 'delete');
    }
}
