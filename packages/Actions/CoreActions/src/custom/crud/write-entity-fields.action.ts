import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseEntity, EntityInfo, IMetadataProvider, Metadata, LogError, CompositeKey } from "@memberjunction/core";
import { BaseAction } from "@memberjunction/actions";

/**
 * The shape of the dynamic field-name -> value map this action accepts.
 *
 * The value type here is the ONE legitimately-dynamic case in the codebase: a
 * caller (a Flow Agent, a Feature Pipeline terminal step, a workflow designer)
 * supplies an arbitrary map of entity field names to values at runtime. The set
 * of fields is not known at compile time (the target entity is itself a runtime
 * parameter), so there is no generated entity type to lean on here. We use
 * `unknown` for the value — NOT `any` — so every value still has to be narrowed
 * before use, and we hand each value to the entity layer via `Set()`, which is
 * the only field-write path available when the field set is dynamic.
 */
type FieldMap = Record<string, unknown>;

/**
 * Generic action that writes one or more fields onto a single entity record —
 * either an existing record (identified by its primary key) or a brand-new one
 * (when `CreateIfMissing` is true and no primary key is supplied).
 *
 * Designed to be reused both by Flow Agents (as a discoverable tool) and as the
 * terminal "write the result back" step of a Feature Pipeline. It mirrors the
 * existing Create/Update Record actions but collapses the create-or-update
 * decision into a single declarative call: give it the target, an optional key,
 * and a field map, and it does the right thing.
 *
 * Strong typing note: where a generated entity subclass exposes typed setters we
 * would prefer them, but the field set here is supplied dynamically at runtime
 * (the entity itself is a parameter), so there is no compile-time type to bind
 * to. `BaseEntity.Set()` is the correct — and intended — write path for this one
 * legitimately-dynamic case. We still validate each field exists on the entity
 * before writing, so typos surface as explicit errors rather than silent no-ops.
 *
 * @example
 * ```typescript
 * // Update two fields on an existing record
 * await runAction({
 *   ActionName: 'Write Entity Field(s)',
 *   Params: [
 *     { Name: 'EntityName', Value: 'MJ: AI Agents' },
 *     { Name: 'PrimaryKey', Value: { ID: '123e4567-e89b-12d3-a456-426614174000' } },
 *     { Name: 'Fields', Value: { Status: 'Active', Description: 'Updated by pipeline' } }
 *   ]
 * });
 *
 * // Create a new record when none exists
 * await runAction({
 *   ActionName: 'Write Entity Field(s)',
 *   Params: [
 *     { Name: 'EntityName', Value: 'MJ: AI Agents' },
 *     { Name: 'CreateIfMissing', Value: true },
 *     { Name: 'Fields', Value: { Name: 'My Agent', Status: 'Active' } }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "WriteEntityFieldsAction")
export class WriteEntityFieldsAction extends BaseAction {
    /**
     * Writes the supplied fields onto a target entity record, creating the
     * record first when requested and no primary key is supplied.
     *
     * @returns ActionResultSimple with:
     *   - Success: true when the record was saved
     *   - ResultCode: SUCCESS, VALIDATION_ERROR, ENTITY_NOT_FOUND, RECORD_NOT_FOUND,
     *                 PERMISSION_DENIED, SAVE_FAILED, FAILED
     *   - Message: details about the operation (includes LatestResult.CompleteMessage on failure)
     *   - Params: output params `AffectedPrimaryKey` (the affected record's PK object) and `Saved` (boolean)
     */
    public async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = this.getStringParam(params, 'entityname');
            if (!entityName) {
                return this.fail('VALIDATION_ERROR', 'EntityName parameter is required');
            }

            const fields = this.getFieldsParam(params);
            if (!fields) {
                return this.fail('VALIDATION_ERROR', 'Fields parameter is required and must be an object mapping field names to values');
            }

            const primaryKey = this.getPrimaryKeyParam(params);
            const createIfMissing = this.getBooleanParam(params, 'createifmissing', false);

            const resolved = this.resolveEntity(entityName, params.Provider);
            if ('error' in resolved) {
                return resolved.error;
            }
            const { entityInfo } = resolved;

            // Reject unknown field names BEFORE any mutation — a typo'd field that
            // is silently skipped while the action still reports SUCCESS is a
            // correctness trap (the caller believes the write landed). Fail with the
            // offending names so the mistake is visible and actionable.
            const unknownFields = this.findUnknownFields(entityInfo, fields);
            if (unknownFields.length > 0) {
                return this.fail(
                    'VALIDATION_ERROR',
                    `The following field(s) do not exist on entity '${entityName}': ${unknownFields.join(', ')}`
                );
            }

            const md = params.Provider ?? new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>(entityName, params.ContextUser);
            if (!entity) {
                return this.fail('FAILED', `Failed to create entity object for '${entityName}'`);
            }

            // Decide create vs. update based on whether a primary key was supplied.
            const isCreate = primaryKey === undefined;
            if (isCreate) {
                if (!createIfMissing) {
                    return this.fail(
                        'VALIDATION_ERROR',
                        'No PrimaryKey supplied and CreateIfMissing is false — nothing to write. Provide a PrimaryKey to update an existing record, or set CreateIfMissing=true to create one.'
                    );
                }
                entity.NewRecord();
            } else {
                const loadError = await this.loadExistingRecord(entity, entityInfo, primaryKey, entityName);
                if (loadError) {
                    return loadError;
                }
            }

            this.applyFieldMap(entity, entityInfo, fields);

            const saved = await entity.Save();
            if (!saved) {
                return this.analyzeSaveFailure(entity, isCreate ? 'create' : 'update', entityName);
            }

            const pk = this.extractPrimaryKey(entity, entityInfo);
            this.addOutputParam(params, 'AffectedPrimaryKey', pk);
            this.addOutputParam(params, 'Saved', true);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully ${isCreate ? 'created' : 'updated'} ${entityName} record`,
                Params: params.Params
            };
        } catch (e) {
            LogError(e);
            return this.fail('FAILED', `Error writing entity field(s): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Resolve the EntityInfo for the named entity. Uses EntityByName for
     * case-insensitive, whitespace-tolerant lookup per MJ convention.
     */
    private resolveEntity(
        entityName: string,
        provider?: IMetadataProvider
    ): { entityInfo: EntityInfo } | { error: ActionResultSimple } {
        const md = provider ?? new Metadata();
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo) {
            return { error: this.fail('ENTITY_NOT_FOUND', `Entity '${entityName}' not found in metadata`) };
        }
        return { entityInfo };
    }

    /**
     * Load an existing record by primary key. Returns an error result on
     * failure, or undefined on success.
     */
    private async loadExistingRecord(
        entity: BaseEntity,
        entityInfo: EntityInfo,
        primaryKey: FieldMap,
        entityName: string
    ): Promise<ActionResultSimple | undefined> {
        const keyData: FieldMap = {};
        for (const pk of entityInfo.PrimaryKeys) {
            if (!(pk.Name in primaryKey)) {
                return this.fail('VALIDATION_ERROR', `Primary key field '${pk.Name}' not provided in PrimaryKey`);
            }
            keyData[pk.Name] = primaryKey[pk.Name];
        }

        const loaded = await entity.InnerLoad(CompositeKey.FromObject(keyData));
        if (!loaded) {
            const completeMessage = entity.LatestResult?.CompleteMessage?.toLowerCase() ?? '';
            if (completeMessage.includes('permission') || completeMessage.includes('denied')) {
                return this.fail('PERMISSION_DENIED', `Permission denied accessing ${entityName} record`);
            }
            return this.fail('RECORD_NOT_FOUND', `${entityName} record not found for the supplied PrimaryKey`);
        }
        return undefined;
    }

    /**
     * Return the supplied field names that do NOT exist on the target entity
     * (case-insensitive, whitespace-tolerant match against `entityInfo.Fields`).
     * Used to reject the whole write up-front rather than silently skipping typos.
     */
    private findUnknownFields(entityInfo: EntityInfo, fields: FieldMap): string[] {
        const unknown: string[] = [];
        for (const fieldName of Object.keys(fields)) {
            const field = entityInfo.Fields.find(f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
            if (!field) {
                unknown.push(fieldName);
            }
        }
        return unknown;
    }

    /**
     * Apply each entry of the dynamic field map to the entity.
     *
     * This is the one legitimately-dynamic write path: the field set is supplied
     * by the caller at runtime against an entity that is itself a parameter, so
     * there is no generated typed setter to bind to. Every field has already been
     * validated to exist by {@link findUnknownFields} (unknown names reject the
     * write before this runs), so here we just write each via `Set()`.
     */
    private applyFieldMap(entity: BaseEntity, entityInfo: EntityInfo, fields: FieldMap): void {
        for (const [fieldName, fieldValue] of Object.entries(fields)) {
            const field = entityInfo.Fields.find(f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
            if (field) {
                entity.Set(field.Name, fieldValue);
            }
        }
    }

    /**
     * Build the primary-key object for the affected record from its key fields.
     */
    private extractPrimaryKey(entity: BaseEntity, entityInfo: EntityInfo): FieldMap {
        const pk: FieldMap = {};
        for (const keyField of entityInfo.PrimaryKeys) {
            pk[keyField.Name] = entity.Get(keyField.Name);
        }
        return pk;
    }

    /**
     * Map a failed Save() into an ActionResultSimple, surfacing the entity's
     * consolidated LatestResult.CompleteMessage so callers see why it failed.
     */
    private analyzeSaveFailure(entity: BaseEntity, operation: 'create' | 'update', entityName: string): ActionResultSimple {
        const completeMessage = entity.LatestResult?.CompleteMessage ?? 'unknown error';
        const lower = completeMessage.toLowerCase();

        let resultCode = 'SAVE_FAILED';
        if (lower.includes('permission') || lower.includes('denied')) {
            resultCode = 'PERMISSION_DENIED';
        } else if (lower.includes('validation') || lower.includes('required')) {
            resultCode = 'VALIDATION_ERROR';
        }

        return this.fail(resultCode, `Failed to ${operation} ${entityName} record: ${completeMessage}`);
    }

    // ----- parameter helpers -------------------------------------------------

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name);
        if (!param || param.Value === undefined || param.Value === null) {
            return undefined;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name);
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        if (typeof param.Value === 'boolean') {
            return param.Value;
        }
        const value = String(param.Value).trim().toLowerCase();
        if (value === 'true' || value === '1' || value === 'yes') return true;
        if (value === 'false' || value === '0' || value === 'no') return false;
        return defaultValue;
    }

    /**
     * Read the Fields param. Accepts either an object or a JSON string that
     * parses to an object. Returns undefined if missing/empty/not an object.
     */
    private getFieldsParam(params: RunActionParams): FieldMap | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === 'fields');
        if (!param || param.Value === undefined || param.Value === null) {
            return undefined;
        }
        const parsed = this.coerceToObject(param.Value);
        if (!parsed || Object.keys(parsed).length === 0) {
            return undefined;
        }
        return parsed;
    }

    /**
     * Read the optional PrimaryKey param. Accepts either an object or a JSON
     * string that parses to an object. Returns undefined when absent (the
     * signal to take the create path when CreateIfMissing is true).
     */
    private getPrimaryKeyParam(params: RunActionParams): FieldMap | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === 'primarykey');
        if (!param || param.Value === undefined || param.Value === null) {
            return undefined;
        }
        const parsed = this.coerceToObject(param.Value);
        if (!parsed || Object.keys(parsed).length === 0) {
            return undefined;
        }
        return parsed;
    }

    /**
     * Coerce a param value (object or JSON string) into a plain object map.
     * Returns undefined when the value cannot be interpreted as an object.
     */
    private coerceToObject(value: unknown): FieldMap | undefined {
        if (typeof value === 'string') {
            try {
                const parsed: unknown = JSON.parse(value);
                return this.isPlainObject(parsed) ? parsed : undefined;
            } catch {
                return undefined;
            }
        }
        return this.isPlainObject(value) ? value : undefined;
    }

    private isPlainObject(value: unknown): value is FieldMap {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /**
     * Set an output param, overwriting an existing same-named param in place rather
     * than pushing a duplicate (mirrors the Predictive Studio base helper). An
     * existing Input param is promoted to Both so its inbound value is preserved.
     */
    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const target = name.trim().toLowerCase();
        const existing = params.Params.find(p => p.Name.trim().toLowerCase() === target);
        if (existing) {
            existing.Value = value;
            existing.Type = existing.Type === 'Input' ? 'Both' : 'Output';
            return;
        }
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }

    private fail(resultCode: string, message: string): ActionResultSimple {
        return { Success: false, ResultCode: resultCode, Message: message };
    }
}
