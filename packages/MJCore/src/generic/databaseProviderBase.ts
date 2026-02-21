import { ProviderBase } from "./providerBase";
import { UserInfo } from "./securityInfo";
import { EntityDependency, EntityFieldTSType, EntityInfo, RecordChange, RecordDependency } from "./entityInfo";
import { BaseEntity } from "./baseEntity";
import { CompositeKey } from "./compositeKey";
import { LogError } from "./logging";

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
            const sSQL = `SELECT * FROM ${this.QuoteSchemaAndView(schema, 'vwRecordChanges')} WHERE Entity='${safeEntityName}' AND RecordID='${safeRecordID}' ORDER BY ChangedAt DESC`;
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
            const sSQL = `SELECT ID FROM ${this.QuoteSchemaAndView(schema, 'vwUserFavorites')} WHERE UserID='${safeUserId}' AND Entity='${safeEntityName}' AND RecordID='${safeRecordID}'`;
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
