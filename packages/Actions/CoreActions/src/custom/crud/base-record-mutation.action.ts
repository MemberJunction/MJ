import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { BaseEntity, EntityFieldInfo, EntityInfo, IMetadataProvider, Metadata, LogError, CompositeKey, UserInfo } from "@memberjunction/core";

/** Result of extracting one parameter: exactly one of `value` / `error` is set. */
interface ParamResult<T> {
    value?: T;
    error?: ActionResultSimple;
}

/** The serialized shape `CompositeKey` produces (`{ KeyValuePairs: [{ FieldName, Value }] }`). */
interface KeyValuePairsShape {
    KeyValuePairs: Array<{ FieldName: string; Value: unknown }>;
}

/**
 * Abstract base class for record mutation actions (Create, Update, Delete).
 * This class provides common functionality for validating parameters,
 * loading entities, handling errors, and processing results.
 *
 * Not registered as an action itself - only its subclasses are registered.
 */
export abstract class BaseRecordMutationAction extends BaseAction {
    /**
     * Extract and validate the EntityName parameter
     */
    protected getEntityNameParam(params: RunActionParams): ParamResult<string> {
        const entityNameParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'entityname');

        if (!entityNameParam || !entityNameParam.Value) {
            return { error: this.validationError('EntityName parameter is required') };
        }

        return { value: String(entityNameParam.Value) };
    }

    /**
     * Extract and normalize the PrimaryKey parameter into a `{ keyColumn: value }` map.
     *
     * Accepted shapes, so an agent or workflow can hand over whatever it has in hand:
     * - a plain object keyed by the entity's primary key column name(s) — `{ ID: '...' }`, `{ UserID, RoleID }`
     * - the `CompositeKey` serialization — `{ KeyValuePairs: [{ FieldName, Value }, ...] }`
     * - a JSON string of either of the above
     * - for a single-column key only, the bare key value (`'8F1C...'`, `42`), which is mapped onto the
     *   entity's one key column whatever it is called
     *
     * A bare value for a composite-key entity is rejected with a message listing the required columns.
     * Requires `entityInfo`, so call {@link getEntityObject} first.
     */
    protected getPrimaryKeyParam(params: RunActionParams, entityInfo: EntityInfo): ParamResult<Record<string, unknown>> {
        const primaryKeyParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'primarykey');

        if (!primaryKeyParam || primaryKeyParam.Value === null || primaryKeyParam.Value === undefined) {
            return { error: this.validationError('PrimaryKey parameter is required') };
        }

        const value = this.parseJsonIfString(primaryKeyParam.Value);
        if (this.isKeyValuePairsShape(value)) {
            return { value: this.keyValuePairsToMap(value) };
        }
        if (this.isPlainObject(value)) {
            return { value };
        }
        if (Array.isArray(value)) {
            return { error: this.validationError('PrimaryKey parameter must be an object keyed by primary key column, not an array') };
        }
        return this.scalarPrimaryKey(value, entityInfo);
    }

    /**
     * Maps a bare key value onto the entity's single key column, or rejects it when the entity has a
     * composite key (a scalar cannot address more than one column).
     */
    private scalarPrimaryKey(value: unknown, entityInfo: EntityInfo): ParamResult<Record<string, unknown>> {
        const keyColumns = entityInfo.PrimaryKeys.map(pk => pk.Name);
        if (keyColumns.length === 1) {
            const keyName = entityInfo.FirstPrimaryKey.Name; // first-pk-ok: guarded by PrimaryKeys.length === 1
            return { value: { [keyName]: typeof value === 'string' ? value.trim() : value } };
        }
        return {
            error: this.validationError(
                `PrimaryKey for entity '${entityInfo.Name}' must be an object with the key columns ${keyColumns.join(', ')}; a single value cannot address a composite key`
            ),
        };
    }

    private isKeyValuePairsShape(value: unknown): value is KeyValuePairsShape {
        return this.isPlainObject(value) && Array.isArray((value as Partial<KeyValuePairsShape>).KeyValuePairs);
    }

    private keyValuePairsToMap(shape: KeyValuePairsShape): Record<string, unknown> {
        const map: Record<string, unknown> = {};
        for (const kvp of shape.KeyValuePairs) {
            if (kvp && typeof kvp.FieldName === 'string') {
                map[kvp.FieldName] = kvp.Value;
            }
        }
        return map;
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /**
     * Parses a string parameter as JSON when it is JSON; a string that does not parse (a bare UUID,
     * a name) is returned unchanged so the caller can treat it as a scalar.
     */
    private parseJsonIfString(value: unknown): unknown {
        if (typeof value !== 'string') {
            return value;
        }
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    /**
     * Extract and validate the Fields parameter (an object, or a JSON string of one).
     */
    protected getFieldsParam(params: RunActionParams): ParamResult<Record<string, unknown>> {
        const fieldsParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'fields');

        if (!fieldsParam || fieldsParam.Value === null || fieldsParam.Value === undefined) {
            return { error: this.validationError('Fields parameter is required') };
        }

        const value = this.parseJsonIfString(fieldsParam.Value);
        if (!this.isPlainObject(value)) {
            return { error: this.validationError('Fields parameter must be an object of field names to values') };
        }

        return { value };
    }

    /**
     * Get entity metadata and create entity object
     */
    protected async getEntityObject(entityName: string, contextUser: UserInfo | null | undefined, provider?: IMetadataProvider): Promise<{
        entity?: BaseEntity;
        entityInfo?: EntityInfo;
        error?: ActionResultSimple
    }> {
        const md = provider ?? new Metadata();
        const entityInfo = md.EntityByName(entityName);

        if (!entityInfo) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'ENTITY_NOT_FOUND',
                    Message: `Entity '${entityName}' not found in metadata`
                }
            };
        }

        const entity = await md.GetEntityObject<BaseEntity>(entityName, contextUser);
        if (!entity) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to create entity object for '${entityName}'`
                }
            };
        }

        return { entity, entityInfo };
    }

    /**
     * Load an existing record using primary key
     */
    protected async loadRecord(
        entity: BaseEntity,
        entityInfo: EntityInfo,
        primaryKey: Record<string, unknown>,
        entityName: string
    ): Promise<{ success: boolean; error?: ActionResultSimple }> {
        const missingError = this.missingKeyColumnsError(entityInfo, primaryKey, entityName);
        if (missingError) {
            return { success: false, error: missingError };
        }

        const keyData: Record<string, unknown> = {};
        for (const pk of entityInfo.PrimaryKeys) {
            keyData[pk.Name] = primaryKey[pk.Name];
        }

        // Load the record using LoadFromData which works for both single and composite keys
        const pkey = CompositeKey.FromObject(keyData);
        const loadResult = await entity.InnerLoad(pkey);

        if (!loadResult) {
            return { success: false, error: this.loadFailureError(entity, entityName) };
        }

        return { success: true };
    }

    /** Every key column the caller left out, reported in one message, or null when the key is complete. */
    private missingKeyColumnsError(entityInfo: EntityInfo, primaryKey: Record<string, unknown>, entityName: string): ActionResultSimple | null {
        const missing = entityInfo.PrimaryKeys.filter(pk => !(pk.Name in primaryKey)).map(pk => `'${pk.Name}'`);
        if (missing.length === 0) {
            return null;
        }
        const required = entityInfo.PrimaryKeys.map(pk => pk.Name).join(', ');
        const noun = missing.length === 1 ? 'field' : 'fields';
        return this.validationError(
            `Primary key ${noun} ${missing.join(', ')} not provided. Required key columns for '${entityName}': ${required}`
        );
    }

    /** Distinguishes a permission denial from a plain miss using the entity's consolidated result message. */
    private loadFailureError(entity: BaseEntity, entityName: string): ActionResultSimple {
        const completeMessage = entity.LatestResult?.CompleteMessage?.toLowerCase() || '';
        if (completeMessage.includes('permission') || completeMessage.includes('denied')) {
            return {
                Success: false,
                ResultCode: 'PERMISSION_DENIED',
                Message: `Permission denied accessing ${entityName} record`
            };
        }
        return {
            Success: false,
            ResultCode: 'RECORD_NOT_FOUND',
            Message: `${entityName} record not found`
        };
    }

    /**
     * Resolve a field name against entity metadata (`EntityInfo.Fields` / `BaseEntity.GetFieldByName`)
     * or prototype properties (`fieldName in entity`), matching case-insensitively and returning the
     * canonical field name.
     *
     * Dynamic and OpenApp entities that do not have a generated TypeScript subclass registered in
     * `ClassFactory` are instantiated as generic `BaseEntity` instances. On a generic `BaseEntity`,
     * fields live in `entity.Fields` / `entityInfo.Fields` rather than as JS getter/setter properties
     * on the prototype (`fieldName in entity === false`), which is why metadata is consulted first.
     */
    protected resolveEntityFieldName(
        entity: BaseEntity,
        fieldName: string,
        entityInfo?: Pick<EntityInfo, 'Fields'>
    ): string | null {
        const normalized = fieldName.trim().toLowerCase();
        const infoFields = entityInfo?.Fields ?? entity.EntityInfo?.Fields;
        if (Array.isArray(infoFields)) {
            const matched = infoFields.find(f => f.Name.trim().toLowerCase() === normalized);
            if (matched) {
                return matched.Name;
            }
        }
        if (typeof entity.GetFieldByName === 'function') {
            const field = entity.GetFieldByName(fieldName);
            if (field) {
                return field.Name;
            }
        }
        if (fieldName in entity) {
            return fieldName;
        }
        return null;
    }

    /**
     * Rejects a `Fields` payload that names a field the entity does not have, so a typo fails fast
     * with the valid choices instead of being dropped on the floor and reported as success.
     * Returns null when every field resolves.
     */
    protected validateFieldNames(
        entity: BaseEntity,
        entityInfo: EntityInfo,
        fields: Record<string, unknown>
    ): ActionResultSimple | null {
        const unknown = Object.keys(fields).filter(name => this.resolveEntityFieldName(entity, name, entityInfo) === null);
        if (unknown.length === 0) {
            return null;
        }
        return {
            Success: false,
            ResultCode: 'INVALID_FIELD_NAMES',
            Message:
                `Unknown field(s) for entity '${entityInfo.Name}': ${unknown.join(', ')}. ` +
                `Valid updatable fields: ${this.updatableFieldNames(entityInfo).join(', ')}`
        };
    }

    /** Field names a caller may set: not read-only, not virtual, not part of the primary key. */
    private updatableFieldNames(entityInfo: Pick<EntityInfo, 'Fields'>): string[] {
        return entityInfo.Fields
            .filter((f: EntityFieldInfo) => !f.ReadOnly && !f.IsVirtual && !f.IsPrimaryKey)
            .map(f => f.Name);
    }

    /**
     * Set field values on an entity, resolving each supplied name to its canonical field name.
     * Call {@link validateFieldNames} first; a name that still fails to resolve is logged and skipped.
     */
    protected setFieldValues(entity: BaseEntity, fields: Record<string, unknown>, entityName: string, entityInfo?: Pick<EntityInfo, 'Fields'>): void {
        for (const [fieldName, fieldValue] of Object.entries(fields)) {
            const resolvedName = this.resolveEntityFieldName(entity, fieldName, entityInfo);
            if (resolvedName) {
                entity.Set(resolvedName, fieldValue);
            } else {
                LogError(`Field '${fieldName}' does not exist on entity '${entityName}'`);
            }
        }
    }

    /**
     * Analyze error from entity save/delete operation and return appropriate result
     */
    protected analyzeEntityError(
        entity: BaseEntity,
        operation: 'create' | 'update' | 'delete',
        entityName: string
    ): ActionResultSimple {
        const latestResult = entity.LatestResult;
        let resultCode = 'FAILED';
        let message = `Failed to ${operation} ${entityName} record`;

        if (latestResult) {
            const completeMessage = latestResult.CompleteMessage;
            if (completeMessage) {
                message += `: ${completeMessage}`;
            }

            // Check for specific error types using the complete consolidated message
            const lowerMessage = completeMessage?.toLowerCase() || '';
            if (lowerMessage.includes('permission') || lowerMessage.includes('denied')) {
                resultCode = 'PERMISSION_DENIED';
            } else if (lowerMessage.includes('validation') || lowerMessage.includes('required')) {
                resultCode = 'VALIDATION_ERROR';
            } else if (operation === 'update' &&
                      (lowerMessage.includes('concurrent') || lowerMessage.includes('modified'))) {
                resultCode = 'CONCURRENT_UPDATE';
            } else if (operation === 'delete') {
                if (lowerMessage.includes('reference') ||
                    lowerMessage.includes('constraint') ||
                    lowerMessage.includes('foreign key')) {
                    resultCode = 'REFERENCE_CONSTRAINT';
                    message = `Cannot delete ${entityName} record: It is referenced by other records`;
                } else if (lowerMessage.includes('cascade')) {
                    resultCode = 'CASCADE_CONSTRAINT';
                    message = `Cannot delete ${entityName} record: Cascade delete is not allowed`;
                }
            }
        }

        return {
            Success: false,
            ResultCode: resultCode,
            Message: message
        };
    }

    /**
     * Handle generic errors with consistent formatting
     */
    protected handleError(e: unknown, operation: string): ActionResultSimple {
        LogError(e);

        const err = e instanceof Error ? e : new Error(String(e));
        let errorMessage = `Error ${operation} record: ${err.message}`;

        // If this is an entity error, include more details
        const entityResult = (e as Partial<Pick<BaseEntity, 'LatestResult'>>)?.LatestResult;
        if (entityResult) {
            errorMessage += ` (Entity Error: ${entityResult.CompleteMessage || 'Unknown entity error'})`;
        }

        // Include stack trace in verbose mode for debugging
        const errorDetails = {
            originalError: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
        };

        LogError(`Detailed error information: ${JSON.stringify(errorDetails)}`);

        return {
            Success: false,
            ResultCode: 'FAILED',
            Message: errorMessage
        };
    }

    private validationError(message: string): ActionResultSimple {
        return { Success: false, ResultCode: 'VALIDATION_ERROR', Message: message };
    }
}
