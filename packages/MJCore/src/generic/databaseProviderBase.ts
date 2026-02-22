import { ProviderBase } from "./providerBase";
import { UserInfo } from "./securityInfo";
import { EntityDependency, EntityFieldTSType, EntityInfo, RecordChange, RecordDependency, RecordMergeRequest, RecordMergeResult, RecordMergeDetailResult } from "./entityInfo";
import { BaseEntity, BaseEntityResult } from "./baseEntity";
import { EntitySaveOptions, EntityDeleteOptions, EntityMergeOptions, PotentialDuplicateRequest, PotentialDuplicateResponse } from "./interfaces";
import { TransactionItem } from "./transactionGroup";
import { CompositeKey } from "./compositeKey";
import { LogError } from "./logging";
import { AggregateResult, EntityRecordNameInput, EntityRecordNameResult, RunReportResult } from "./interfaces";
import { RunReportParams } from "./runReport";
import { SQLExpressionValidator } from "@memberjunction/global";

// Re-export PlatformSQL types from their canonical location for backward compatibility
export { DatabasePlatform, PlatformSQL, IsPlatformSQL } from "./platformSQL";
import { DatabasePlatform } from "./platformSQL";

/**
 * Represents a single field change in the DiffObjects comparison result
 */
export type FieldChange = {
    field: string;
    oldValue: unknown;
    newValue: unknown;
};

/**
 * Result of save SQL generation. Subclasses populate this from their dialect-specific
 * SQL generators (stored procedure calls, function calls, etc.).
 */
export interface SaveSQLResult {
    /** The complete SQL to execute (may include record-change tracking, temp tables, etc.) */
    fullSQL: string;
    /** Simpler SQL without record-change wrapping, used for logging/migration replay */
    simpleSQL?: string;
    /** Parameterized query values (e.g. [$1,$2] for PG). Null/undefined for inline SQL. */
    parameters?: unknown[] | null;
    /** Provider-specific extra data (e.g. overlapping-change data for ISA propagation) */
    extraData?: Record<string, unknown>;
}

/**
 * Result of delete SQL generation.
 */
export interface DeleteSQLResult {
    fullSQL: string;
    simpleSQL?: string;
    parameters?: unknown[] | null;
}

/**
 * This class is a generic server-side provider class to abstract database operations
 * on any database system and therefore be usable by server-side components that need to
 * do database operations but do not want close coupling with a specific database provider
 * like @see @memberjunction/sqlserver-dataprovider
 *
 * It contains DB-agnostic business logic (record change tracking, favorites, ISA hierarchy,
 * record dependencies, diffing, etc.) that is shared across all database providers.
 * Subclasses implement abstract methods for DB-specific SQL dialect generation.
 */
export abstract class DatabaseProviderBase extends ProviderBase {
    /**
     * Executes a SQL query with optional parameters and options.
     * @param query
     * @param parameters
     * @param options
     * @param contextUser
     * @param T - The type of the result set
     * @returns A promise that resolves to an array of results of type T
     */
    abstract ExecuteSQL<T>(query: string, parameters?: unknown[], options?: ExecuteSQLOptions, contextUser?: UserInfo): Promise<Array<T>>

    /**
     * Begins a transaction for the current database connection.
     */
    abstract BeginTransaction(): Promise<void>;

    /**
     * Commits the current transaction.
     */
    abstract CommitTransaction(): Promise<void>;

    /**
     * Rolls back the current transaction.
     */
    abstract RollbackTransaction(): Promise<void>;

    /**
     * Returns the database platform key for this provider.
     * Override in subclasses. Defaults to 'sqlserver' for backward compatibility.
     * Inherited from ProviderBase; redeclared here for DatabaseProviderBase consumers.
     */
    override get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    /**
     * Gets the MemberJunction core schema name (e.g. '__mj').
     * Subclasses should override if they have a different way to resolve this.
     * Defaults to the value from ConfigData.
     */
    public get MJCoreSchemaName(): string {
        return this.ConfigData?.MJCoreSchemaName ?? '__mj';
    }

    /**************************************************************************/
    // START ---- SQL Dialect Abstractions
    /**************************************************************************/

    /**
     * Quotes a database identifier (table, column, view name) using the provider's
     * dialect convention. SQL Server uses [brackets], PostgreSQL uses "double quotes".
     * @param name The identifier to quote
     */
    protected abstract QuoteIdentifier(name: string): string;

    /**
     * Quotes a schema-qualified object name (e.g. schema.viewName) using the provider's
     * dialect convention. SQL Server uses [schema].[view], PostgreSQL uses "schema"."view".
     * @param schemaName The schema name
     * @param objectName The object name (table, view, etc.)
     */
    protected abstract QuoteSchemaAndView(schemaName: string, objectName: string): string;

    /**
     * Builds a UNION ALL query that checks each child entity's base table for a record
     * with the given primary key. Used by FindISAChildEntity/FindISAChildEntities.
     * @param childEntities The child entities to search
     * @param recordPKValue The primary key value to find
     */
    protected abstract BuildChildDiscoverySQL(childEntities: EntityInfo[], recordPKValue: string): string;

    /**
     * Builds SQL for hard-link (foreign key) dependency queries.
     * Returns a UNION ALL query across all dependent entities.
     * @param entityDependencies The entity-level dependency metadata
     * @param compositeKey The primary key of the record being checked
     */
    protected abstract BuildHardLinkDependencySQL(entityDependencies: EntityDependency[], compositeKey: CompositeKey): string;

    /**
     * Builds SQL for soft-link dependency queries (entities using EntityIDFieldName pattern).
     * Returns a UNION ALL query across all soft-linked entities.
     * @param entityName The entity name being checked for dependencies
     * @param compositeKey The primary key of the record
     */
    protected abstract BuildSoftLinkDependencySQL(entityName: string, compositeKey: CompositeKey): string;

    /**
     * Generates the SQL (and optional parameters) for a Save (Create or Update) operation.
     * Each provider produces its own dialect: SQL Server generates T-SQL EXEC statements,
     * PostgreSQL generates SELECT FROM function(...) calls, etc.
     *
     * @param entity The entity being saved
     * @param isNew  True for INSERT / Create, false for UPDATE
     * @param user   The acting user (needed for encryption, audit columns, etc.)
     */
    protected abstract GenerateSaveSQL(entity: BaseEntity, isNew: boolean, user: UserInfo): Promise<SaveSQLResult>;

    /**
     * Generates the SQL (and optional parameters) for a Delete operation.
     */
    protected abstract GenerateDeleteSQL(entity: BaseEntity, user: UserInfo): DeleteSQLResult;

    /**************************************************************************/
    // END ---- SQL Dialect Abstractions
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Pure Business Logic (no SQL, no external deps)
    /**************************************************************************/

    /**
     * Creates a changes object by comparing two JavaScript objects, identifying fields that have different values.
     * Each property in the returned object represents a changed field, with the field name as the key.
     *
     * @param oldData - The original data object to compare from
     * @param newData - The new data object to compare to
     * @param entityInfo - Entity metadata used to validate fields and determine comparison logic
     * @param quoteToEscape - The quote character to escape in string values (typically "'")
     * @returns A Record mapping field names to FieldChange objects, or null if either input is null/undefined.
     *          Only includes fields that have actually changed and are not read-only.
     */
    public DiffObjects(
        oldData: Record<string, unknown>,
        newData: Record<string, unknown>,
        entityInfo: EntityInfo,
        quoteToEscape: string
    ): Record<string, FieldChange> | null {
        if (!oldData || !newData) return null;

        const changes: Record<string, FieldChange> = {};
        for (const key in newData) {
            const f = entityInfo.Fields.find((f) => f.Name.toLowerCase() === key.toLowerCase());
            if (!f) continue; // skip if field not found in entity info

            const bDiff = this.isFieldDifferent(f, oldData[key], newData[key]);
            if (bDiff) {
                const o = this.escapeValueForDiff(oldData[key], quoteToEscape);
                const n = this.escapeValueForDiff(newData[key], quoteToEscape);
                changes[key] = { field: key, oldValue: o, newValue: n };
            }
        }
        return changes;
    }

    /**
     * Determines whether a specific field value has changed between old and new data.
     */
    private isFieldDifferent(f: { ReadOnly: boolean; TSType: string }, oldVal: unknown, newVal: unknown): boolean {
        if (f.ReadOnly) return false;
        if ((oldVal == undefined || oldVal == null) && (newVal == undefined || newVal == null)) return false;

        switch (f.TSType) {
            case EntityFieldTSType.String:
                return oldVal !== newVal;
            case EntityFieldTSType.Date:
                return new Date(oldVal as string).getTime() !== new Date(newVal as string).getTime();
            case EntityFieldTSType.Number:
            case EntityFieldTSType.Boolean:
                return oldVal !== newVal;
            default:
                return oldVal !== newVal;
        }
    }

    /**
     * Escapes a value for use in diff output, handling strings and nested objects.
     */
    private escapeValueForDiff(value: unknown, quoteToEscape: string): unknown {
        if (typeof value === 'string') {
            const r = new RegExp(quoteToEscape, 'g');
            return value.replace(r, quoteToEscape + quoteToEscape);
        } else if (typeof value === 'object' && value !== null) {
            return this.EscapeQuotesInProperties(value, quoteToEscape);
        }
        return value;
    }

    /**
     * Converts a diff/changes object into a human-readable description of what changed.
     * @param changesObject The output of DiffObjects()
     * @param maxValueLength Maximum length for displayed values before truncation
     * @param cutOffText Text to append when values are truncated
     */
    public CreateUserDescriptionOfChanges(
        changesObject: Record<string, FieldChange>,
        maxValueLength: number = 200,
        cutOffText: string = '...'
    ): string {
        let sRet = '';
        const keys = Object.keys(changesObject);
        for (let i = 0; i < keys.length; i++) {
            const change = changesObject[keys[i]];
            if (sRet.length > 0) sRet += '\n';
            if (change.oldValue && change.newValue)
                sRet += `${change.field} changed from ${this.TrimString(change.oldValue, maxValueLength, cutOffText)} to ${this.TrimString(change.newValue, maxValueLength, cutOffText)}`;
            else if (change.newValue)
                sRet += `${change.field} set to ${this.TrimString(change.newValue, maxValueLength, cutOffText)}`;
            else if (change.oldValue)
                sRet += `${change.field} cleared from ${this.TrimString(change.oldValue, maxValueLength, cutOffText)}`;
        }
        return sRet.replace(/'/g, "''");
    }

    /**
     * Truncates a string value to a maximum length, appending trailing characters if truncated.
     */
    protected TrimString(value: unknown, maxLength: number, trailingChars: string): unknown {
        if (value && typeof value === 'string' && value.length > maxLength) {
            return value.substring(0, maxLength) + trailingChars;
        }
        return value;
    }

    /**
     * Recursively escapes the specified quote character in all string properties of an object or array.
     * Essential for preparing data to be embedded in SQL strings.
     *
     * @param obj - The object, array, or primitive value to process
     * @param quoteToEscape - The quote character to escape (typically single quote "'")
     * @returns A new object/array with all string values having quotes properly escaped
     */
    protected EscapeQuotesInProperties(obj: unknown, quoteToEscape: string): unknown {
        if (obj === null || obj === undefined) return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => this.EscapeQuotesInProperties(item, quoteToEscape));
        }

        if (obj instanceof Date) return obj.toISOString();

        if (typeof obj === 'object') {
            const sRet: Record<string, unknown> = {};
            for (const key in obj as Record<string, unknown>) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const element = (obj as Record<string, unknown>)[key];
                    if (typeof element === 'string') {
                        const reg = new RegExp(quoteToEscape, 'g');
                        sRet[key] = element.replace(reg, quoteToEscape + quoteToEscape);
                    } else if (typeof element === 'object') {
                        sRet[key] = this.EscapeQuotesInProperties(element, quoteToEscape);
                    } else {
                        sRet[key] = element;
                    }
                }
            }
            return sRet;
        }

        return obj;
    }

    /**
     * Transforms a transaction result row into a list of field/value pairs.
     */
    protected MapTransactionResultToNewValues(transactionResult: Record<string, unknown>): { FieldName: string; Value: unknown }[] {
        return Object.keys(transactionResult).map((k) => ({
            FieldName: k,
            Value: transactionResult[k],
        }));
    }

    /**************************************************************************/
    // END ---- Pure Business Logic
    /**************************************************************************/

    /**************************************************************************/
    // START ---- IS-A Hierarchy Support
    /**************************************************************************/

    /**
     * Discovers which IS-A child entity, if any, has a record with the given primary key.
     * Executes a single UNION ALL query across all child entity tables for maximum efficiency.
     *
     * @param entityInfo The parent entity whose children to search
     * @param recordPKValue The primary key value to find in child tables
     * @param contextUser Optional context user for audit/permission purposes
     * @returns The child entity name if found, or null if no child record exists
     */
    public async FindISAChildEntity(
        entityInfo: EntityInfo,
        recordPKValue: string,
        contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string } | null> {
        const childEntities = entityInfo.ChildEntities;
        if (childEntities.length === 0) return null;

        const unionSQL = this.BuildChildDiscoverySQL(childEntities, recordPKValue);
        if (!unionSQL) return null;

        const results = await this.ExecuteSQL<Record<string, string>>(unionSQL, undefined, undefined, contextUser);
        if (results && results.length > 0 && results[0].EntityName) {
            return { ChildEntityName: results[0].EntityName };
        }
        return null;
    }

    /**
     * Discovers ALL IS-A child entities that have records with the given primary key.
     * Used for overlapping subtype parents (AllowMultipleSubtypes = true) where multiple
     * children can coexist.
     *
     * @param entityInfo The parent entity whose children to search
     * @param recordPKValue The primary key value to find in child tables
     * @param contextUser Optional context user for audit/permission purposes
     * @returns Array of child entity names found (empty if none)
     */
    public async FindISAChildEntities(
        entityInfo: EntityInfo,
        recordPKValue: string,
        contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string }[]> {
        const childEntities = entityInfo.ChildEntities;
        if (childEntities.length === 0) return [];

        const unionSQL = this.BuildChildDiscoverySQL(childEntities, recordPKValue);
        if (!unionSQL) return [];

        const results = await this.ExecuteSQL<Record<string, string>>(unionSQL, undefined, undefined, contextUser);
        if (results && results.length > 0) {
            return results
                .filter((r) => r.EntityName)
                .map((r) => ({ ChildEntityName: r.EntityName }));
        }
        return [];
    }

    /**
     * Checks whether a given entity matches the target name, or is an ancestor
     * of the target (i.e., the target is somewhere in its descendant sub-tree).
     * Used to identify and skip the active branch during sibling propagation.
     */
    protected IsEntityOrAncestorOf(entityInfo: EntityInfo, targetName: string): boolean {
        if (entityInfo.Name === targetName) return true;
        for (const child of entityInfo.ChildEntities) {
            if (this.IsEntityOrAncestorOf(child, targetName)) return true;
        }
        return false;
    }

    /**
     * Recursively enumerates an entity's entire sub-tree from metadata.
     * No DB queries — uses EntityInfo.ChildEntities which is populated from metadata.
     */
    protected GetFullSubTree(entityInfo: EntityInfo): EntityInfo[] {
        const result: EntityInfo[] = [entityInfo];
        for (const child of entityInfo.ChildEntities) {
            result.push(...this.GetFullSubTree(child));
        }
        return result;
    }

    /**************************************************************************/
    // END ---- IS-A Hierarchy Support
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Record Changes
    /**************************************************************************/

    /**
     * Retrieves the change history for a specific record.
     * Uses the vwRecordChanges view which exists in both SQL Server and PostgreSQL.
     *
     * @param entityName The entity name
     * @param compositeKey The record's composite primary key
     * @param contextUser Optional context user
     */
    public async GetRecordChanges(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<RecordChange[]> {
        try {
            const safeEntityName = entityName.replace(/'/g, "''");
            const safeRecordID = compositeKey.ToConcatenatedString().replace(/'/g, "''");
            const schema = this.MJCoreSchemaName;
            const sSQL = `SELECT * FROM ${this.QuoteSchemaAndView(schema, 'vwRecordChanges')} WHERE ${this.QuoteIdentifier('Entity')}='${safeEntityName}' AND ${this.QuoteIdentifier('RecordID')}='${safeRecordID}' ORDER BY ${this.QuoteIdentifier('ChangedAt')} DESC`;
            return this.ExecuteSQL<RecordChange>(sSQL, undefined, undefined, contextUser);
        } catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**************************************************************************/
    // END ---- Record Changes
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Record Favorites
    /**************************************************************************/

    /**
     * Checks if a record is marked as a favorite for a given user.
     */
    public async GetRecordFavoriteStatus(userId: string, entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<boolean> {
        const id = await this.GetRecordFavoriteID(userId, entityName, compositeKey, contextUser);
        return id !== null;
    }

    /**
     * Gets the favorite record ID if the record is a favorite for the given user, null otherwise.
     */
    public async GetRecordFavoriteID(userId: string, entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<string | null> {
        try {
            const schema = this.MJCoreSchemaName;
            const safeUserId = userId.replace(/'/g, "''");
            const safeEntityName = entityName.replace(/'/g, "''");
            const safeRecordID = compositeKey.Values().replace(/'/g, "''");
            const sSQL = `SELECT ${this.QuoteIdentifier('ID')} FROM ${this.QuoteSchemaAndView(schema, 'vwUserFavorites')} WHERE ${this.QuoteIdentifier('UserID')}='${safeUserId}' AND ${this.QuoteIdentifier('Entity')}='${safeEntityName}' AND ${this.QuoteIdentifier('RecordID')}='${safeRecordID}'`;
            const result = await this.ExecuteSQL<Record<string, unknown>>(sSQL, undefined, undefined, contextUser);
            if (result && result.length > 0) return result[0].ID as string;
            return null;
        } catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Creates or deletes a user favorite record for the specified entity record.
     * Uses GetEntityObject and BaseEntity CRUD methods (no entity-specific type imports needed).
     */
    public async SetRecordFavoriteStatus(
        userId: string,
        entityName: string,
        compositeKey: CompositeKey,
        isFavorite: boolean,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const currentFavoriteId = await this.GetRecordFavoriteID(userId, entityName, compositeKey);
            if ((currentFavoriteId === null && !isFavorite) || (currentFavoriteId !== null && isFavorite)) return;

            const e = this.Entities.find((e) => e.Name === entityName);
            const ufEntity: BaseEntity = await this.GetEntityObject('MJ: User Favorites', contextUser || this.CurrentUser);
            if (currentFavoriteId !== null) {
                // delete the record since we are setting isFavorite to FALSE
                await ufEntity.InnerLoad(CompositeKey.FromKeyValuePair('ID', currentFavoriteId));
                if (await ufEntity.Delete()) return;
                else throw new Error(`Error deleting user favorite`);
            } else {
                // create the record since we are setting isFavorite to TRUE
                ufEntity.NewRecord();
                ufEntity.Set('EntityID', e.ID);
                ufEntity.Set('RecordID', compositeKey.Values());
                ufEntity.Set('UserID', userId);
                if (await ufEntity.Save()) return;
                else throw new Error(`Error saving user favorite`);
            }
        } catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**************************************************************************/
    // END ---- Record Favorites
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Record Dependencies
    /**************************************************************************/

    /**
     * Returns a list of record-level dependencies — records in other entities linked to
     * the specified entity/record via foreign keys (hard links) or EntityIDFieldName
     * soft links. Uses abstract SQL builders for dialect-specific query generation.
     *
     * @param entityName The entity name to check
     * @param compositeKey The primary key(s) of the record
     * @param contextUser Optional context user
     */
    public async GetRecordDependencies(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<RecordDependency[]> {
        try {
            const recordDependencies: RecordDependency[] = [];

            const entityDependencies: EntityDependency[] = await this.GetEntityDependencies(entityName);
            if (entityDependencies.length === 0) return recordDependencies;

            const hardSQL = this.BuildHardLinkDependencySQL(entityDependencies, compositeKey);
            const softSQL = this.BuildSoftLinkDependencySQL(entityName, compositeKey);
            const sSQL = [hardSQL, softSQL].filter(s => s.length > 0).join(' UNION ALL ');

            if (!sSQL) return recordDependencies;

            const result = await this.ExecuteSQL<Record<string, unknown>>(sSQL, undefined, undefined, contextUser);
            if (!result || result.length === 0) return recordDependencies;

            return this.parseRecordDependencyResults(result);
        } catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Parses raw SQL results from dependency queries into RecordDependency objects.
     */
    private parseRecordDependencyResults(result: Record<string, unknown>[]): RecordDependency[] {
        const recordDependencies: RecordDependency[] = [];
        for (const r of result) {
            const entityInfo: EntityInfo | undefined = this.Entities.find(
                (e) => e.Name.trim().toLowerCase() === (r.EntityName as string)?.trim().toLowerCase()
            );
            if (!entityInfo) {
                throw new Error(`Entity ${r.EntityName} not found in metadata`);
            }

            const depCompositeKey: CompositeKey = new CompositeKey();
            const pkeys: Record<string, unknown> = {};
            const keyValues = (r.PrimaryKeyValue as string).split(CompositeKey.DefaultFieldDelimiter);
            keyValues.forEach((kv) => {
                const parts = kv.split(CompositeKey.DefaultValueDelimiter);
                pkeys[parts[0]] = parts[1];
            });
            depCompositeKey.LoadFromEntityInfoAndRecord(entityInfo, pkeys);

            recordDependencies.push({
                EntityName: r.EntityName as string,
                RelatedEntityName: r.RelatedEntityName as string,
                FieldName: r.FieldName as string,
                PrimaryKey: depCompositeKey,
            });
        }
        return recordDependencies;
    }

    /**************************************************************************/
    // END ---- Record Dependencies
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Save/Delete Virtual Hooks
    // Subclasses override these to inject provider-specific behavior
    // (entity actions, AI actions, encryption, ISA propagation, etc.)
    // Default implementations are no-ops so lightweight providers work out of the box.
    /**************************************************************************/

    /**
     * Called during Save before any SQL is executed to run validation-type entity actions.
     * Return a non-empty string to abort the save with that message; return null to proceed.
     * SQL Server overrides this to delegate to HandleEntityActions('validate', ...).
     */
    protected async OnValidateBeforeSave(_entity: BaseEntity, _user: UserInfo): Promise<string | null> {
        return null;
    }

    /**
     * Called before the save SQL is executed.
     * SQL Server overrides this to fire before-save entity actions and AI actions.
     */
    protected async OnBeforeSaveExecute(_entity: BaseEntity, _user: UserInfo, _options: EntitySaveOptions): Promise<void> {
        /* no-op by default */
    }

    /**
     * Called after a successful save (both direct and transaction-callback paths).
     * Intentionally synchronous (fire-and-forget) — SQL Server overrides to dispatch
     * after-save entity actions and AI actions without awaiting.
     */
    protected OnAfterSaveExecute(_entity: BaseEntity, _user: UserInfo, _options: EntitySaveOptions): void {
        /* no-op by default */
    }

    /**
     * Called before the delete SQL is executed.
     * SQL Server overrides to fire before-delete entity actions and AI actions.
     */
    protected async OnBeforeDeleteExecute(_entity: BaseEntity, _user: UserInfo, _options: EntityDeleteOptions): Promise<void> {
        /* no-op by default */
    }

    /**
     * Called after a successful delete.
     * Intentionally synchronous — see OnAfterSaveExecute.
     */
    protected OnAfterDeleteExecute(_entity: BaseEntity, _user: UserInfo, _options: EntityDeleteOptions): void {
        /* no-op by default */
    }

    /**
     * Post-processes rows returned by a save/load SQL operation.
     * SQL Server overrides to handle datetimeoffset conversion and field decryption.
     * Default: returns rows unchanged.
     */
    protected async PostProcessRows(rows: Record<string, unknown>[], _entityInfo: EntityInfo, _user: UserInfo): Promise<Record<string, unknown>[]> {
        return rows;
    }

    /**
     * Called after a direct (non-transaction) save succeeds, before returning.
     * SQL Server overrides to propagate record-change entries to IS-A sibling branches.
     */
    protected async OnSaveCompleted(_entity: BaseEntity, _saveSQLResult: SaveSQLResult, _user: UserInfo, _options: EntitySaveOptions): Promise<void> {
        /* no-op by default */
    }

    /**
     * Called before starting a save/delete SQL operation to pause background metadata refresh.
     * SQL Server overrides to set _bAllowRefresh = false.
     */
    protected OnSuspendRefresh(): void { /* no-op */ }

    /**
     * Called after a save/delete SQL operation completes (success or failure) to resume refresh.
     */
    protected OnResumeRefresh(): void { /* no-op */ }

    /**
     * Returns provider-specific extra data to attach to a TransactionItem.
     * SQL Server overrides to include { dataSource: this._pool }.
     */
    protected GetTransactionExtraData(_entity: BaseEntity): Record<string, unknown> {
        return {};
    }

    /**
     * Builds the ExecuteSQLOptions for a Save operation.
     * SQL Server overrides to add connectionSource for IS-A shared transactions.
     */
    protected BuildSaveExecuteOptions(entity: BaseEntity, sqlDetails: SaveSQLResult): ExecuteSQLOptions {
        const opts: ExecuteSQLOptions = {
            isMutation: true,
            description: `Save ${entity.EntityInfo.Name}`,
        };
        if (entity.EntityInfo.TrackRecordChanges && sqlDetails.simpleSQL) {
            opts.simpleSQLFallback = sqlDetails.simpleSQL;
        }
        return opts;
    }

    /**
     * Builds the ExecuteSQLOptions for a Delete operation.
     */
    protected BuildDeleteExecuteOptions(entity: BaseEntity, sqlDetails: DeleteSQLResult): ExecuteSQLOptions {
        const opts: ExecuteSQLOptions = {
            isMutation: true,
            description: `Delete ${entity.EntityInfo.Name}`,
        };
        if (entity.EntityInfo.TrackRecordChanges && sqlDetails.simpleSQL) {
            opts.simpleSQLFallback = sqlDetails.simpleSQL;
        }
        return opts;
    }

    /**
     * Validates the result of a delete SQL execution by checking that the returned
     * primary keys match the entity being deleted.
     * SQL Server overrides to handle the multi-result-set case (CASCADE deletes).
     */
    protected ValidateDeleteResult(entity: BaseEntity, rawResult: Record<string, unknown>[], entityResult: BaseEntityResult): boolean {
        if (!rawResult || rawResult.length === 0) return false;
        const deletedRecord = rawResult[0];
        for (const key of entity.PrimaryKeys) {
            if (key.Value !== deletedRecord[key.Name]) {
                entityResult.Message = `Delete failed: record with primary key ${key.Name}=${key.Value} not found`;
                return false;
            }
        }
        return true;
    }

    /**************************************************************************/
    // END ---- Save/Delete Virtual Hooks
    /**************************************************************************/

    /**************************************************************************/
    // START ---- RunView/RunQuery Shared Helpers (Phase 4)
    /**************************************************************************/

    /**
     * Validates a user-provided SQL clause (WHERE, ORDER BY, etc.) to prevent SQL injection.
     * Checks for forbidden keywords (INSERT, UPDATE, DELETE, EXEC, DROP, UNION, CAST, etc.)
     * and dangerous patterns (comments, semicolons, xp_ prefix).
     * String literals are stripped before validation to avoid false positives.
     *
     * @param clause The SQL clause to validate
     * @returns true if the clause is safe, false if it contains forbidden patterns
     */
    protected ValidateUserProvidedSQLClause(clause: string): boolean {
        // Remove string literals to avoid false positives
        const stringLiteralPattern = /(['"]) (?:(?=(\\?))\2[\s\S])*?\1/g;
        const clauseWithoutStrings = clause.replace(stringLiteralPattern, '');
        const lowerClause = clauseWithoutStrings.toLowerCase();

        const forbiddenPatterns: RegExp[] = [
            /\binsert\b/, /\bupdate\b/, /\bdelete\b/,
            /\bexec\b/, /\bexecute\b/, /\bdrop\b/,
            /--/, /\/\*/, /\*\//, /\bunion\b/, /\bcast\b/, /\bxp_/, /;/,
        ];

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(lowerClause)) return false;
        }
        return true;
    }

    /**
     * Checks that the given user has read permissions on the specified entity.
     * Throws if the user lacks CanRead permission.
     *
     * @param entityName The entity to check permissions for
     * @param contextUser The user whose permissions to check
     * @throws Error if contextUser is null, entity is not found, or user lacks read permission
     */
    protected CheckUserReadPermissions(entityName: string, contextUser: UserInfo): void {
        const entityInfo = this.Entities.find((e) => e.Name === entityName);
        if (!contextUser) throw new Error('contextUser is null');
        if (entityInfo) {
            const userPermissions = entityInfo.GetUserPermisions(contextUser);
            if (!userPermissions.CanRead)
                throw new Error(
                    'User ' + contextUser.Email + ' does not have read permissions on ' + entityInfo.Name,
                );
        } else {
            throw new Error('Entity not found in metadata');
        }
    }

    /**
     * Builds and validates an aggregate SQL query from the provided aggregate expressions.
     * Uses SQLExpressionValidator from @memberjunction/global for injection prevention.
     * Uses QuoteIdentifier/QuoteSchemaAndView for dialect-neutral SQL generation.
     *
     * @param aggregates Array of aggregate expressions to validate and build
     * @param entityInfo Entity metadata for field reference validation
     * @param schemaName Schema name for the entity
     * @param baseView Base view name for the entity
     * @param whereSQL WHERE clause to apply (without the WHERE keyword)
     * @returns Object with aggregateSQL string and any validation errors
     */
    protected BuildAggregateSQL(
        aggregates: { expression: string; alias?: string }[],
        entityInfo: EntityInfo,
        schemaName: string,
        baseView: string,
        whereSQL: string,
    ): { aggregateSQL: string | null; validationErrors: AggregateResult[] } {
        if (!aggregates || aggregates.length === 0) {
            return { aggregateSQL: null, validationErrors: [] };
        }

        const validator = SQLExpressionValidator.Instance;
        const validationErrors: AggregateResult[] = [];
        const validExpressions: string[] = [];
        const fieldNames = entityInfo.Fields.map((f) => f.Name);

        for (let i = 0; i < aggregates.length; i++) {
            const agg = aggregates[i];
            const alias = agg.alias || agg.expression;
            const result = validator.validate(agg.expression, {
                context: 'aggregate',
                entityFields: fieldNames,
            });

            if (!result.valid) {
                validationErrors.push({
                    expression: agg.expression,
                    alias: alias,
                    value: null,
                    error: result.error || 'Validation failed',
                });
            } else {
                validExpressions.push(agg.expression + ' AS ' + this.QuoteIdentifier('Agg_' + i));
            }
        }

        if (validExpressions.length === 0) {
            return { aggregateSQL: null, validationErrors };
        }

        let aggregateSQL = 'SELECT ' + validExpressions.join(', ') + ' FROM ' + this.QuoteSchemaAndView(schemaName, baseView);
        if (whereSQL && whereSQL.length > 0) {
            aggregateSQL += ' WHERE ' + whereSQL;
        }
        return { aggregateSQL, validationErrors };
    }

    /**
     * Executes an aggregate query and maps results back to the original expressions.
     *
     * @param aggregateSQL The SQL query to execute (from BuildAggregateSQL)
     * @param aggregates Original aggregate expression definitions
     * @param validationErrors Any validation errors from BuildAggregateSQL
     * @param contextUser User context for query execution
     * @returns Array of AggregateResult objects with execution time
     */
    protected async ExecuteAggregateQuery(
        aggregateSQL: string | null,
        aggregates: { expression: string; alias?: string }[],
        validationErrors: AggregateResult[],
        contextUser?: UserInfo,
    ): Promise<{ results: AggregateResult[]; executionTime: number }> {
        const startTime = Date.now();

        if (!aggregateSQL) {
            return { results: validationErrors, executionTime: 0 };
        }

        try {
            const queryResult = await this.ExecuteSQL<Record<string, unknown>>(aggregateSQL, undefined, undefined, contextUser);
            const executionTime = Date.now() - startTime;

            if (!queryResult || queryResult.length === 0) {
                const nullResults = aggregates
                    .filter((_, i) => !validationErrors.some((e) => e.expression === aggregates[i].expression))
                    .map((agg) => ({
                        expression: agg.expression,
                        alias: agg.alias || agg.expression,
                        value: null,
                        error: undefined,
                    }));
                return { results: [...validationErrors, ...nullResults], executionTime };
            }

            const row = queryResult[0];
            const results: AggregateResult[] = [];
            let validExprIndex = 0;

            for (let i = 0; i < aggregates.length; i++) {
                const agg = aggregates[i];
                const alias = agg.alias || agg.expression;
                const validationError = validationErrors.find((e) => e.expression === agg.expression);
                if (validationError) {
                    results.push(validationError);
                } else {
                    const value = row['Agg_' + validExprIndex];
                    results.push({
                        expression: agg.expression,
                        alias: alias,
                        value: (value ?? null) as number | string | Date | boolean | null,
                        error: undefined,
                    });
                    validExprIndex++;
                }
            }
            return { results, executionTime };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorResults = aggregates.map((agg) => ({
                expression: agg.expression,
                alias: agg.alias || agg.expression,
                value: null,
                error: errorMessage,
            }));
            return { results: errorResults, executionTime };
        }
    }

    /**
     * Builds the SQL to retrieve the "name" field value for a specific entity record.
     * Uses QuoteIdentifier/QuoteSchemaAndView for dialect-neutral SQL generation.
     *
     * @param entityName The entity name
     * @param compositeKey The record's primary key
     * @returns The SQL query string, or null if the entity has no name field
     */
    protected BuildEntityRecordNameSQL(entityName: string, compositeKey: CompositeKey): string | null {
        const e = this.Entities.find((e) => e.Name === entityName);
        if (!e) throw new Error('Entity ' + entityName + ' not found');

        const f = e.NameField;
        if (!f) {
            LogError('Entity ' + entityName + ' does not have a NameField, returning null');
            return null;
        }

        let where = '';
        for (const pkv of compositeKey.KeyValuePairs) {
            const pk = e.PrimaryKeys.find((pk) => pk.Name === pkv.FieldName);
            const quotes = pk && pk.NeedsQuotes ? "'" : '';
            if (where.length > 0) where += ' AND ';
            where += this.QuoteIdentifier(pkv.FieldName) + '=' + quotes + pkv.Value + quotes;
        }
        return 'SELECT ' + this.QuoteIdentifier(f.Name) + ' FROM ' + this.QuoteSchemaAndView(e.SchemaName, e.BaseView) + ' WHERE ' + where;
    }

    /**
     * Retrieves the display name for a single entity record.
     * Uses BuildEntityRecordNameSQL for dialect-neutral SQL generation.
     */
    protected async InternalGetEntityRecordName(
        entityName: string,
        compositeKey: CompositeKey,
        contextUser?: UserInfo,
    ): Promise<string> {
        try {
            const sql = this.BuildEntityRecordNameSQL(entityName, compositeKey);
            if (sql) {
                const data = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, contextUser);
                if (data && data.length === 1) {
                    const fields = Object.keys(data[0]);
                    return String(data[0][fields[0]] ?? '');
                } else {
                    LogError('Entity ' + entityName + ' record ' + compositeKey.ToString() + ' not found');
                    return '';
                }
            }
            return '';
        } catch (e) {
            LogError(e);
            return '';
        }
    }

    /**
     * Retrieves display names for multiple entity records.
     */
    protected async InternalGetEntityRecordNames(
        info: EntityRecordNameInput[],
        contextUser?: UserInfo,
    ): Promise<EntityRecordNameResult[]> {
        const results: EntityRecordNameResult[] = [];
        for (const item of info) {
            const name = await this.InternalGetEntityRecordName(item.EntityName, item.CompositeKey, contextUser);
            results.push({
                EntityName: item.EntityName,
                CompositeKey: item.CompositeKey,
                RecordName: name,
                Success: name ? true : false,
                Status: name ? 'Success' : 'Error',
            });
        }
        return results;
    }

    /**************************************************************************/
    // END ---- RunView/RunQuery Shared Helpers (Phase 4)
    /**************************************************************************/

        /**************************************************************************/
    // START ---- Save/Delete Orchestration
    // DB-agnostic orchestration that calls abstract SQL generation + virtual hooks.
    // Both SQL Server and PostgreSQL inherit this; they only override hooks/SQL gen.
    /**************************************************************************/

    /**
     * Saves an entity record — the full orchestration flow shared by all DB providers.
     *
     * 1. Permission & dirty-state checks
     * 2. Validation via OnValidateBeforeSave hook
     * 3. Before-save actions via OnBeforeSaveExecute hook
     * 4. SQL generation via GenerateSaveSQL (abstract, provider-specific)
     * 5. Execute via TransactionGroup or directly
     * 6. After-save actions via OnAfterSaveExecute hook
     * 7. Post-save cleanup via OnSaveCompleted hook (ISA propagation, etc.)
     */
    public async Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions): Promise<{}> {
        const entityResult = new BaseEntityResult();
        try {
            entity.RegisterTransactionPreprocessing();

            const bNewRecord = !entity.IsSaved;
            if (!options) options = new EntitySaveOptions();
            const bReplay = !!options.ReplayOnly;

            if (!bReplay && !bNewRecord && !entity.EntityInfo.AllowUpdateAPI)
                throw new Error(`UPDATE not allowed for entity ${entity.EntityInfo.Name}`);
            if (!bReplay && bNewRecord && !entity.EntityInfo.AllowCreateAPI)
                throw new Error(`CREATE not allowed for entity ${entity.EntityInfo.Name}`);

            if (entity.Dirty || options.IgnoreDirtyState || options.ReplayOnly) {
                entityResult.StartedAt = new Date();
                entityResult.Type = bNewRecord ? 'create' : 'update';

                entityResult.OriginalValues = entity.Fields.map((f) => {
                    const tempStatus = f.ActiveStatusAssertions;
                    f.ActiveStatusAssertions = false;
                    const ret = { FieldName: f.Name, Value: f.Value };
                    f.ActiveStatusAssertions = tempStatus;
                    return ret;
                });
                entity.ResultHistory.push(entityResult);

                // Step 2: Validation hook
                if (!bReplay) {
                    const validationMessage = await this.OnValidateBeforeSave(entity, user);
                    if (validationMessage) {
                        entityResult.Success = false;
                        entityResult.EndedAt = new Date();
                        entityResult.Message = validationMessage;
                        return false;
                    }
                }

                // Step 3: Before-save hook (entity actions, AI actions)
                if (!bReplay) {
                    await this.OnBeforeSaveExecute(entity, user, options);
                }

                // Step 4: Generate provider-specific SQL
                const sqlDetails = await this.GenerateSaveSQL(entity, bNewRecord, user);

                if (entity.TransactionGroup && !bReplay) {
                    // ---- Transaction Group path ----
                    entity.RaiseReadyForTransaction();
                    this.OnSuspendRefresh();

                    const extraData = this.GetTransactionExtraData(entity);
                    if (entity.EntityInfo.TrackRecordChanges && sqlDetails.simpleSQL) {
                        extraData.simpleSQLFallback = sqlDetails.simpleSQL;
                    }
                    extraData.entityName = entity.EntityInfo.Name;

                    entity.TransactionGroup.AddTransaction(
                        new TransactionItem(
                            entity,
                            entityResult.Type === 'create' ? 'Create' : 'Update',
                            sqlDetails.fullSQL,
                            sqlDetails.parameters ?? null,
                            extraData,
                            (transactionResult: Record<string, unknown>, success: boolean) => {
                                this.OnResumeRefresh();
                                entityResult.EndedAt = new Date();
                                if (success && transactionResult) {
                                    this.OnAfterSaveExecute(entity, user, options);
                                    entityResult.Success = true;
                                    entityResult.NewValues = this.MapTransactionResultToNewValues(transactionResult);
                                } else {
                                    entityResult.Success = false;
                                    entityResult.Message = 'Transaction Failed';
                                }
                            },
                        ),
                    );
                    return true;
                } else {
                    // ---- Direct execution path ----
                    this.OnSuspendRefresh();

                    let result: Record<string, unknown>[];
                    if (bReplay) {
                        result = [entity.GetAll()];
                    } else {
                        const execOptions = this.BuildSaveExecuteOptions(entity, sqlDetails);
                        const rawResult = await this.ExecuteSQL<Record<string, unknown>>(
                            sqlDetails.fullSQL,
                            sqlDetails.parameters ?? undefined,
                            execOptions,
                            user,
                        );
                        result = await this.PostProcessRows(rawResult, entity.EntityInfo, user);
                    }

                    this.OnResumeRefresh();
                    entityResult.EndedAt = new Date();

                    if (result && result.length > 0) {
                        this.OnAfterSaveExecute(entity, user, options);
                        entityResult.Success = true;
                        await this.OnSaveCompleted(entity, sqlDetails, user, options);
                        return result[0];
                    } else {
                        if (bNewRecord)
                            throw new Error(`SQL Error: Error creating new record, no rows returned from SQL: ${sqlDetails.fullSQL}`);
                        else
                            throw new Error(`SQL Error: Error updating record, no MATCHING rows found within the database: ${sqlDetails.fullSQL}`);
                    }
                }
            } else {
                return entity; // nothing to save
            }
        } catch (e) {
            this.OnResumeRefresh();
            entityResult.EndedAt = new Date();
            entityResult.Message = (e as Error).message;
            LogError(e);
            throw e;
        }
    }

    /**
     * Deletes an entity record — the full orchestration flow shared by all DB providers.
     *
     * 1. Permission checks & replay handling
     * 2. SQL generation via GenerateDeleteSQL (abstract, provider-specific)
     * 3. Before-delete actions via OnBeforeDeleteExecute hook
     * 4. Execute via TransactionGroup or directly
     * 5. Validate delete result (PK match check)
     * 6. After-delete actions via OnAfterDeleteExecute hook
     */
    public async Delete(entity: BaseEntity, options: EntityDeleteOptions, user: UserInfo): Promise<boolean> {
        const entityResult = new BaseEntityResult();
        try {
            entity.RegisterTransactionPreprocessing();
            if (!options) options = new EntityDeleteOptions();
            const bReplay = options.ReplayOnly;

            if (!entity.IsSaved && !bReplay)
                throw new Error(`Delete() isn't callable for records that haven't yet been saved - ${entity.EntityInfo.Name}`);
            if (!entity.EntityInfo.AllowDeleteAPI && !bReplay)
                throw new Error(`Delete() isn't callable for ${entity.EntityInfo.Name} as AllowDeleteAPI is false`);

            entityResult.StartedAt = new Date();
            entityResult.Type = 'delete';
            entityResult.OriginalValues = entity.Fields.map((f) => ({
                FieldName: f.Name,
                Value: f.Value,
            }));
            entity.ResultHistory.push(entityResult);

            // Generate provider-specific delete SQL
            const sqlDetails = this.GenerateDeleteSQL(entity, user);

            // Before-delete hooks
            await this.OnBeforeDeleteExecute(entity, user, options);

            if (entity.TransactionGroup && !bReplay) {
                // ---- Transaction Group path ----
                entity.RaiseReadyForTransaction();

                const extraData = this.GetTransactionExtraData(entity);
                if (entity.EntityInfo.TrackRecordChanges && sqlDetails.simpleSQL) {
                    extraData.simpleSQLFallback = sqlDetails.simpleSQL;
                }
                extraData.entityName = entity.EntityInfo.Name;

                entity.TransactionGroup.AddTransaction(
                    new TransactionItem(
                        entity,
                        'Delete',
                        sqlDetails.fullSQL,
                        sqlDetails.parameters ?? null,
                        extraData,
                        (transactionResult: Record<string, unknown>, success: boolean) => {
                            entityResult.EndedAt = new Date();
                            if (success && transactionResult) {
                                this.OnAfterDeleteExecute(entity, user, options);
                                for (const key of entity.PrimaryKeys) {
                                    if (key.Value !== transactionResult[key.Name]) {
                                        entityResult.Success = false;
                                        entityResult.Message = 'Transaction failed to commit';
                                    }
                                }
                                entityResult.NewValues = this.MapTransactionResultToNewValues(transactionResult);
                                entityResult.Success = true;
                            } else {
                                entityResult.Success = false;
                                entityResult.Message = 'Transaction failed to commit';
                            }
                        },
                    ),
                );
                return true;
            } else {
                // ---- Direct execution path ----
                let d: Record<string, unknown>[];
                if (bReplay) {
                    d = [entity.GetAll()];
                } else {
                    const execOptions = this.BuildDeleteExecuteOptions(entity, sqlDetails);
                    d = await this.ExecuteSQL<Record<string, unknown>>(
                        sqlDetails.fullSQL,
                        sqlDetails.parameters ?? undefined,
                        execOptions,
                        user,
                    );
                }

                if (d && d.length > 0) {
                    if (!this.ValidateDeleteResult(entity, d, entityResult)) {
                        entityResult.EndedAt = new Date();
                        entityResult.Success = false;
                        return false;
                    }

                    this.OnAfterDeleteExecute(entity, user, options);
                    entityResult.EndedAt = new Date();
                    return true;
                } else {
                    entityResult.Message = 'No result returned from SQL';
                    entityResult.EndedAt = new Date();
                    return false;
                }
            }
        } catch (e) {
            LogError(e);
            entityResult.Message = (e as Error).message;
            entityResult.Success = false;
            entityResult.EndedAt = new Date();
            return false;
        }
    }

    /**************************************************************************/
    // END ---- Save/Delete Orchestration
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Audit Logging
    /**************************************************************************/

    /**
     * Creates an audit log record in the MJ: Audit Logs entity.
     * Uses BaseEntity with .Set() calls (no typed entity subclass imports needed).
     * Callers typically fire-and-forget.
     *
     * @param user The user performing the action
     * @param authorizationName Optional authorization name to look up
     * @param auditLogTypeName The audit log type name (must exist in metadata)
     * @param status 'Success' or 'Failed'
     * @param details Optional details (JSON string, description, etc.)
     * @param entityId The entity ID being audited
     * @param recordId Optional record ID being audited
     * @param auditLogDescription Optional description for the audit log
     * @param saveOptions Save options to pass to the entity Save() call
     * @returns The saved audit log BaseEntity, or null on error
     */
    public async CreateAuditLogRecord(
        user: UserInfo,
        authorizationName: string | null,
        auditLogTypeName: string,
        status: string,
        details: string | null,
        entityId: string,
        recordId: string | null,
        auditLogDescription: string | null,
        saveOptions: EntitySaveOptions | null
    ): Promise<BaseEntity | null> {
        try {
            const authorization = authorizationName
                ? this.Authorizations.find((a) => a?.Name?.trim().toLowerCase() === authorizationName.trim().toLowerCase())
                : null;
            const auditLogType = auditLogTypeName
                ? this.AuditLogTypes.find((a) => a?.Name?.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase())
                : null;

            if (!user) throw new Error('User is a required parameter');
            if (!auditLogType) throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);

            const auditLog: BaseEntity = await this.GetEntityObject('MJ: Audit Logs', user);
            auditLog.NewRecord();
            auditLog.Set('UserID', user.ID);
            auditLog.Set('AuditLogTypeID', auditLogType.ID);
            auditLog.Set('Status', status?.trim().toLowerCase() === 'success' ? 'Success' : 'Failed');
            auditLog.Set('EntityID', entityId);
            if (recordId != null) auditLog.Set('RecordID', recordId);
            if (authorization) auditLog.Set('AuthorizationID', authorization.ID);
            if (details) auditLog.Set('Details', details);
            if (auditLogDescription) auditLog.Set('Description', auditLogDescription);

            if (await auditLog.Save(saveOptions ?? undefined)) {
                return auditLog;
            } else {
                throw new Error('Error saving audit log record');
            }
        } catch (err) {
            LogError(err);
            return null;
        }
    }

    /**************************************************************************/
    // END ---- Audit Logging
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Entity Actions & AI Actions (Virtual Hooks)
    // Subclasses that have access to @memberjunction/actions and
    // @memberjunction/aiengine override these. Lightweight providers
    // (PostgreSQL during initial development) inherit the no-ops.
    /**************************************************************************/

    /**
     * Handles entity actions (non-AI) for save, delete, or validate operations.
     * Override in subclasses that have access to EntityActionEngineServer.
     * Default: no-op, returns empty array.
     *
     * @param entity The entity being saved/deleted/validated
     * @param baseType The operation type
     * @param before True for before-hooks, false for after-hooks
     * @param user The acting user
     * @returns Array of action results (empty by default)
     */
    protected async HandleEntityActions(
        _entity: BaseEntity,
        _baseType: 'save' | 'delete' | 'validate',
        _before: boolean,
        _user: UserInfo
    ): Promise<{ Success: boolean; Message?: string }[]> {
        return [];
    }

    /**
     * Handles AI-specific entity actions for save or delete operations.
     * Override in subclasses that have access to AIEngine.
     * Default: no-op.
     */
    protected async HandleEntityAIActions(
        _entity: BaseEntity,
        _baseType: 'save' | 'delete',
        _before: boolean,
        _user: UserInfo
    ): Promise<void> {
        /* no-op by default */
    }

    /**
     * Returns AI actions configured for the given entity and timing.
     * Override in subclasses that have access to AIEngine.
     * Default: returns empty array.
     */
    protected GetEntityAIActions(
        _entityInfo: EntityInfo,
        _before: boolean
    ): { ID: string; EntityID: string; TriggerEvent: string; AIActionID: string; AIModelID: string }[] {
        return [];
    }

    /**************************************************************************/
    // END ---- Entity Actions & AI Actions (Virtual Hooks)
    /**************************************************************************/

    /**************************************************************************/
    // START ---- CRUD SP/Function Name Resolution
    /**************************************************************************/

    /**
     * Returns the stored procedure / function name for a Create or Update operation.
     * Pure metadata lookup — no SQL execution needed.
     * SQL Server uses spCreate/spUpdate naming, PostgreSQL uses the same pattern.
     *
     * @param entity The entity being saved
     * @param bNewRecord True for Create, false for Update
     * @returns The SP/function name
     */
    public GetCreateUpdateSPName(entity: BaseEntity, bNewRecord: boolean): string {
        const spName = bNewRecord
            ? entity.EntityInfo.spCreate?.length > 0
                ? entity.EntityInfo.spCreate
                : 'spCreate' + entity.EntityInfo.BaseTableCodeName
            : entity.EntityInfo.spUpdate?.length > 0
                ? entity.EntityInfo.spUpdate
                : 'spUpdate' + entity.EntityInfo.BaseTableCodeName;
        return spName;
    }

    /**************************************************************************/
    // END ---- CRUD SP/Function Name Resolution
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Record Change Logging (Phase 4)
    /**************************************************************************/

    /**
     * Logs a record change entry by diffing old/new data and executing
     * provider-specific SQL to insert the record change.
     * Concrete orchestration; SQL generation is delegated to BuildRecordChangeSQL.
     *
     * @param newData The new record data (null for deletes)
     * @param oldData The old record data (null for creates)
     * @param entityName The entity name
     * @param recordID The record ID (CompositeKey string)
     * @param entityInfo The entity metadata
     * @param type The change type
     * @param user The acting user
     */
    protected async LogRecordChange(
        newData: Record<string, unknown> | null,
        oldData: Record<string, unknown> | null,
        entityName: string,
        recordID: string,
        entityInfo: EntityInfo,
        type: 'Create' | 'Update' | 'Delete',
        user: UserInfo,
    ): Promise<unknown[] | undefined> {
        const sqlResult = this.BuildRecordChangeSQL(newData, oldData, entityName, recordID, entityInfo, type, user);
        if (sqlResult) {
            return await this.ExecuteSQL(sqlResult.sql, sqlResult.parameters ?? undefined, undefined, user);
        }
        return undefined;
    }

    /**
     * Builds the SQL (and optional parameters) for inserting a record change entry.
     * Each provider generates its own dialect: SQL Server uses EXEC spCreateRecordChange_Internal,
     * PostgreSQL uses INSERT INTO "RecordChange" with parameterized values.
     *
     * Returns null if there are no changes to log.
     */
    protected abstract BuildRecordChangeSQL(
        newData: Record<string, unknown> | null,
        oldData: Record<string, unknown> | null,
        entityName: string,
        recordID: string,
        entityInfo: EntityInfo,
        type: 'Create' | 'Update' | 'Delete',
        user: UserInfo,
    ): { sql: string; parameters?: unknown[] } | null;

    /**
     * Propagates record change entries to sibling branches of an IS-A hierarchy.
     * Called after saving an entity with AllowMultipleSubtypes (overlapping subtypes).
     * Collects SQL from BuildSiblingRecordChangeSQL for each sibling and executes as a batch.
     *
     * @param parentInfo The parent entity info
     * @param changeData The changes JSON and description
     * @param pkValue The primary key value
     * @param userId The acting user ID
     * @param activeChildEntityName The child entity that initiated the save (to skip)
     * @param extraExecOptions Optional provider-specific execution options (e.g. connectionSource for SQL Server transactions)
     */
    protected async PropagateRecordChangesToSiblings(
        parentInfo: EntityInfo,
        changeData: { changesJSON: string; changesDescription: string },
        pkValue: string,
        userId: string,
        activeChildEntityName: string | undefined,
        extraExecOptions?: Record<string, unknown>,
    ): Promise<void> {
        const sqlParts: string[] = [];

        const safePKValue = pkValue.replace(/'/g, "''");
        const safeUserId = userId.replace(/'/g, "''");
        const safeChangesJSON = changeData.changesJSON.replace(/'/g, "''");
        const safeChangesDesc = changeData.changesDescription.replace(/'/g, "''");

        let varIndex = 0;

        for (const childInfo of parentInfo.ChildEntities) {
            // Skip the active branch (the child that initiated the parent save).
            // When activeChildEntityName is undefined (direct save on parent), propagate to ALL children.
            if (activeChildEntityName && this.IsEntityOrAncestorOf(childInfo, activeChildEntityName)) continue;

            // Recursively enumerate this child's entire sub-tree from metadata
            const subTree = this.GetFullSubTree(childInfo);

            for (const entityInTree of subTree) {
                if (!entityInTree.TrackRecordChanges) continue;

                const varName = `@_rc_prop_${varIndex++}`;
                sqlParts.push(this.BuildSiblingRecordChangeSQL(
                    varName,
                    entityInTree,
                    safeChangesJSON,
                    safeChangesDesc,
                    safePKValue,
                    safeUserId,
                ));
            }
        }

        // Execute as single batch
        if (sqlParts.length > 0) {
            const batch = sqlParts.join('\n');
            const execOptions = {
                description: 'IS-A overlapping subtype Record Change propagation',
                isMutation: true,
                ...(extraExecOptions ?? {}),
            } as ExecuteSQLOptions;
            await this.ExecuteSQL(batch, undefined, execOptions);
        }
    }

    /**
     * Builds the SQL for a single sibling entity's record change entry in the propagation batch.
     * SQL Server uses FOR JSON PATH + spCreateRecordChange_Internal.
     * PostgreSQL uses json_build_object + INSERT INTO "RecordChange".
     */
    protected abstract BuildSiblingRecordChangeSQL(
        varName: string,
        entityInfo: EntityInfo,
        safeChangesJSON: string,
        safeChangesDesc: string,
        safePKValue: string,
        safeUserId: string,
    ): string;

    /**************************************************************************/
    // END ---- Record Change Logging (Phase 4)
    /**************************************************************************/

    /**************************************************************************/
    // START ---- Record Duplicates & Merge (Phase 5)
    /**************************************************************************/

    /**
     * Initiates duplicate detection for a list of records.
     * Uses BaseEntity to create a Duplicate Run record.
     * Subclasses may override to provide additional functionality.
     *
     * @param params The duplicate detection request parameters
     * @param contextUser The acting user
     * @returns A response indicating the duplicate detection status
     */
    public async GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {
        if (!contextUser) {
            throw new Error('User context is required to get record duplicates.');
        }

        const listEntity: BaseEntity = await this.GetEntityObject('MJ: Lists', contextUser);
        await listEntity.InnerLoad(CompositeKey.FromKeyValuePair('ID', params.ListID));

        const duplicateRun: BaseEntity = await this.GetEntityObject('MJ: Duplicate Runs', contextUser);
        duplicateRun.NewRecord();
        duplicateRun.Set('EntityID', params.EntityID);
        duplicateRun.Set('StartedByUserID', contextUser.ID);
        duplicateRun.Set('StartedAt', new Date());
        duplicateRun.Set('ProcessingStatus', 'In Progress');
        duplicateRun.Set('ApprovalStatus', 'Pending');
        duplicateRun.Set('SourceListID', listEntity.Get('ID'));

        const saveResult = await duplicateRun.Save();
        if (!saveResult) {
            throw new Error('Failed to save Duplicate Run Entity');
        }

        const response: PotentialDuplicateResponse = {
            Status: 'Inprogress',
            PotentialDuplicateResult: [],
        };
        return response;
    }

    /**
     * Merges multiple records into a single surviving record.
     * Full orchestration: transaction, field map update, dependency re-pointing,
     * deletion, and merge logging.
     *
     * @param request The merge request with surviving record and records to merge
     * @param contextUser The acting user
     * @param _options Optional merge options
     * @returns The merge result
     */
    public async MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, _options?: EntityMergeOptions): Promise<RecordMergeResult> {
        const e = this.Entities.find((e) => e.Name.trim().toLowerCase() === request.EntityName.trim().toLowerCase());
        if (!e || !e.AllowRecordMerge)
            throw new Error(`Entity ${request.EntityName} does not allow record merging, check the AllowRecordMerge property in the entity metadata`);

        const result: RecordMergeResult = {
            Success: false,
            RecordMergeLogID: null,
            RecordStatus: [],
            Request: request,
            OverallStatus: null,
        };
        const mergeRecordLog: BaseEntity = await this.StartMergeLogging(request, result, contextUser);
        try {
            // Step 1 - begin transaction
            await this.BeginTransaction();

            // Step 2 - update the surviving record if field map provided
            if (request.FieldMap && request.FieldMap.length > 0) {
                const survivor: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser);
                await survivor.InnerLoad(request.SurvivingRecordCompositeKey);
                for (const fieldMap of request.FieldMap) {
                    survivor.Set(fieldMap.FieldName, fieldMap.Value);
                }
                if (!(await survivor.Save())) {
                    result.OverallStatus = 'Error saving survivor record with values from provided field map.';
                    throw new Error(result.OverallStatus);
                }
            }

            // Step 3 - update dependencies and delete each merged record
            for (const pksToDelete of request.RecordsToMerge) {
                const newRecStatus: RecordMergeDetailResult = {
                    CompositeKey: pksToDelete,
                    Success: false,
                    RecordMergeDeletionLogID: null,
                    Message: null,
                };
                result.RecordStatus.push(newRecStatus);
                const dependencies = await this.GetRecordDependencies(request.EntityName, pksToDelete);
                for (const dependency of dependencies) {
                    const relatedEntity: BaseEntity = await this.GetEntityObject(dependency.RelatedEntityName, contextUser);
                    await relatedEntity.InnerLoad(dependency.PrimaryKey);
                    relatedEntity.Set(dependency.FieldName, request.SurvivingRecordCompositeKey.GetValueByIndex(0));
                    if (!(await relatedEntity.Save())) {
                        newRecStatus.Success = false;
                        newRecStatus.Message = `Error updating dependency record ${dependency.PrimaryKey.ToString()} for entity ${dependency.RelatedEntityName} to point to surviving record ${request.SurvivingRecordCompositeKey.ToString()}`;
                        throw new Error(newRecStatus.Message);
                    }
                }
                const recordToDelete: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser);
                await recordToDelete.InnerLoad(pksToDelete);
                if (!(await recordToDelete.Delete())) {
                    newRecStatus.Message = `Error deleting record ${pksToDelete.ToString()} for entity ${request.EntityName}`;
                    throw new Error(newRecStatus.Message);
                } else {
                    newRecStatus.Success = true;
                }
            }

            result.Success = true;
            await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);

            // Step 5 - commit transaction
            await this.CommitTransaction();

            result.Success = true;
            return result;
        } catch (err) {
            LogError(err);
            await this.RollbackTransaction();
            await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);
            throw err;
        }
    }

    /**
     * Creates the initial merge log record at the start of a merge operation.
     * Uses BaseEntity with .Set() calls (no typed entity subclass imports).
     */
    protected async StartMergeLogging(request: RecordMergeRequest, result: RecordMergeResult, contextUser?: UserInfo): Promise<BaseEntity> {
        try {
            const recordMergeLog: BaseEntity = await this.GetEntityObject('MJ: Record Merge Logs', contextUser);
            const entity = this.Entities.find((e) => e.Name === request.EntityName);
            if (!entity) throw new Error(`Entity ${request.EntityName} not found in metadata`);
            if (!contextUser && !this.CurrentUser) throw new Error('contextUser is null and no CurrentUser is set');

            recordMergeLog.NewRecord();
            recordMergeLog.Set('EntityID', entity.ID);
            recordMergeLog.Set('SurvivingRecordID', request.SurvivingRecordCompositeKey.Values());
            recordMergeLog.Set('InitiatedByUserID', contextUser ? contextUser.ID : this.CurrentUser?.ID);
            recordMergeLog.Set('ApprovalStatus', 'Approved');
            recordMergeLog.Set('ApprovedByUserID', contextUser ? contextUser.ID : this.CurrentUser?.ID);
            recordMergeLog.Set('ProcessingStatus', 'Started');
            recordMergeLog.Set('ProcessingStartedAt', new Date());
            if (await recordMergeLog.Save()) {
                result.RecordMergeLogID = recordMergeLog.Get('ID') as string;
                return recordMergeLog;
            } else {
                throw new Error('Error saving record merge log');
            }
        } catch (err) {
            LogError(err);
            throw err;
        }
    }

    /**
     * Finalizes merge logging by updating the log record with completion status
     * and creating deletion detail records.
     * Uses BaseEntity with .Set() calls (no typed entity subclass imports).
     */
    protected async CompleteMergeLogging(recordMergeLog: BaseEntity, result: RecordMergeResult, contextUser?: UserInfo): Promise<void> {
        try {
            if (!contextUser && !this.CurrentUser) throw new Error('contextUser is null and no CurrentUser is set');

            recordMergeLog.Set('ProcessingStatus', result.Success ? 'Complete' : 'Error');
            recordMergeLog.Set('ProcessingEndedAt', new Date());
            if (!result.Success) {
                recordMergeLog.Set('ProcessingLog', result.OverallStatus);
            }
            if (await recordMergeLog.Save()) {
                for (const d of result.RecordStatus) {
                    const deletionLog: BaseEntity = await this.GetEntityObject('MJ: Record Merge Deletion Logs', contextUser);
                    deletionLog.NewRecord();
                    deletionLog.Set('RecordMergeLogID', recordMergeLog.Get('ID'));
                    deletionLog.Set('DeletedRecordID', d.CompositeKey.Values());
                    deletionLog.Set('Status', d.Success ? 'Complete' : 'Error');
                    if (!d.Success) deletionLog.Set('ProcessingLog', d.Message);
                    if (!(await deletionLog.Save())) throw new Error('Error saving record merge deletion log');
                }
            } else {
                throw new Error('Error saving record merge log');
            }
        } catch (err) {
            // do nothing here because we often will get here since some conditions lead to no DB updates possible
            LogError(err);
        }
    }

    /**************************************************************************/
    // END ---- Record Duplicates & Merge (Phase 5)
    /**************************************************************************/

    /**************************************************************************/
    // START ---- RunReport (Phase 5)
    /**************************************************************************/

    /**
     * Runs a report by looking up its SQL definition from vwReports and executing it.
     * Both SQL Server and PostgreSQL share this logic — the only dialect difference
     * is identifier quoting, handled by QuoteIdentifier/QuoteSchemaAndView.
     *
     * @param params Report parameters including ReportID
     * @param contextUser Optional context user for permission/audit purposes
     */
    public async RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult> {
        const reportID = params.ReportID;
        const safeReportID = reportID.replace(/'/g, "''");
        const sqlReport = `SELECT ${this.QuoteIdentifier('ReportSQL')} FROM ${this.QuoteSchemaAndView(this.MJCoreSchemaName, 'vwReports')} WHERE ${this.QuoteIdentifier('ID')} = '${safeReportID}'`;
        const reportInfo = await this.ExecuteSQL<Record<string, unknown>>(sqlReport, undefined, undefined, contextUser);
        if (reportInfo && reportInfo.length > 0) {
            const start = Date.now();
            const sql = String(reportInfo[0].ReportSQL);
            const result = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, contextUser);
            const end = Date.now();
            if (result)
                return {
                    Success: true,
                    ReportID: reportID,
                    Results: result,
                    RowCount: result.length,
                    ExecutionTime: end - start,
                    ErrorMessage: '',
                };
            else
                return {
                    Success: false,
                    ReportID: reportID,
                    Results: [],
                    RowCount: 0,
                    ExecutionTime: end - start,
                    ErrorMessage: 'Error running report SQL',
                };
        }
        return { Success: false, ReportID: reportID, Results: [], RowCount: 0, ExecutionTime: 0, ErrorMessage: 'Report not found' };
    }

    /**************************************************************************/
    // END ---- RunReport (Phase 5)
    /**************************************************************************/
}

/**
 * Configuration options for SQL execution with logging support
 */
export interface ExecuteSQLOptions {
  /** Optional description for this SQL operation, used by logging, if logging is supported by the underlying provider */
  description?: string;
  /** If true, this statement will not be logged to any logging session */
  ignoreLogging?: boolean;
  /** Whether this is a data mutation operation (INSERT/UPDATE/DELETE or SP call that results in any data change) */
  isMutation?: boolean;
  /** Simple SQL fallback for loggers to emit logging of a simpler SQL statement that doesn't have extra functionality that isn't important for migrations or other logging purposes. */
  simpleSQLFallback?: string;
}
