import { EntityInfo, EntityFieldInfo, CodeNameFromString } from '@memberjunction/core';
import {
    CodeGenDatabaseProvider,
    CRUDType,
    BaseViewGenerationContext,
    CascadeDeleteContext,
    FullTextSearchResult,
    DataSourceResult,
} from '../../codeGenDatabaseProvider';
import { SQLServerDialect, DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import { RegisterClass } from '@memberjunction/global';
import { sortBySequenceAndCreatedAt } from '../../../Misc/util';
import { dbDatabase, mj_core_schema } from '../../../Config/config';
import { MSSQLConnection, getSqlConfig } from '../../../Config/db-connection';
import { logError, logWarning, startSpinner, succeedSpinner } from '../../../Misc/status_logging';
import {
    SQLServerDataProvider,
    SQLServerProviderConfigData,
    UserCache,
    setupSQLServerClient,
} from '@memberjunction/sqlserver-dataprovider';
import { SQLServerCodeGenConnection } from './SQLServerCodeGenConnection';
import * as fs from 'fs';
import * as path from 'path';

const ssDialect = new SQLServerDialect();

/**
 * SQL Server implementation of the CodeGen database provider.
 * Generates SQL Server-native DDL for views, stored procedures, triggers, indexes,
 * full-text search, permissions, and other database objects.
 *
 * Registered with `MJGlobal.ClassFactory` against the canonical `'sqlserver'`
 * platform key — `SQLCodeGenBase` resolves this provider via
 * `ClassFactory.CreateInstance(CodeGenDatabaseProvider, configInfo.dbPlatform)`.
 * Downstream packages can subclass and re-register with higher priority to
 * override codegen behavior — same extension hook every other MJ class uses.
 */
@RegisterClass(CodeGenDatabaseProvider, 'sqlserver')
export class SQLServerCodeGenProvider extends CodeGenDatabaseProvider {
    /** @inheritdoc */
    get Dialect(): SQLDialect {
        return ssDialect;
    }

    /** @inheritdoc */
    get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    /**
     * SQL Server implementation of {@link CodeGenDatabaseProvider.SetupDataSource}.
     *
     * Opens (or reuses) the module-cached mssql pool via `MSSQLConnection()`,
     * wires up the SQL Server metadata provider, builds the dialect-aware
     * connection, and resolves the audit user via `UserCache.Refresh()` —
     * the canonical pattern that has lived in `runCodeGen.setupSQLServerDataSource()`
     * since the multi-provider work started. It now sits behind the
     * `CodeGenDatabaseProvider` factory so adding a third platform doesn't
     * mean touching the orchestrator.
     */
    async SetupDataSource(): Promise<DataSourceResult> {
        startSpinner('Initializing database connection...');
        const pool = await MSSQLConnection();
        const config = new SQLServerProviderConfigData(pool, mj_core_schema());
        const provider: SQLServerDataProvider = await setupSQLServerClient(config);
        const conn = new SQLServerCodeGenConnection(pool);

        // `getSqlConfig()` returns the config that was built lazily by
        // MSSQLConnection() above. The non-null assertion is safe because the
        // call to MSSQLConnection on the line above is what guarantees the
        // accessor has a value to return.
        const cfg = getSqlConfig()!;
        let connectionInfo = cfg.server;
        if (cfg.port) connectionInfo += ':' + cfg.port;
        if (cfg.options?.instanceName) connectionInfo += '\\' + cfg.options.instanceName;
        connectionInfo += '/' + cfg.database;

        await UserCache.Instance.Refresh(pool);
        const userMatch = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner');
        const currentUser = userMatch ?? UserCache.Users[0];

        succeedSpinner('SQL Server connection initialized: ' + connectionInfo);
        return { provider, connection: conn, currentUser, connectionInfo };
    }

    // ─── DROP GUARDS ─────────────────────────────────────────────────────

    /**
     * Generates SQL Server-style conditional DROP guards using the `IF OBJECT_ID(...) IS NOT NULL`
     * pattern. Maps each object type to its SQL Server type code: `'V'` for views, `'P'` for
     * procedures, `'IF'` for inline table-valued functions, and `'TR'` for triggers.
     * Each guard is terminated with a `GO` batch separator.
     */
    generateDropGuard(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER', schema: string, name: string): string {
        switch (objectType) {
            case 'VIEW':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'V') IS NOT NULL\n    DROP VIEW [${schema}].[${name}];\nGO`;
            case 'PROCEDURE':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'P') IS NOT NULL\n    DROP PROCEDURE [${schema}].[${name}];\nGO`;
            case 'FUNCTION':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'IF') IS NOT NULL\n    DROP FUNCTION [${schema}].[${name}];\nGO`;
            case 'TRIGGER':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'TR') IS NOT NULL\n    DROP TRIGGER [${schema}].[${name}];\nGO`;
            default:
                return `-- Unknown object type: ${objectType}`;
        }
    }

    // ─── BASE VIEWS ──────────────────────────────────────────────────────

    /**
     * Generates a SQL Server `CREATE VIEW` statement for an entity's base view. The view
     * selects all columns from the base table plus any related, parent, and root ID fields
     * supplied by the orchestrator context. For entities with soft-delete enabled, appends
     * a `WHERE ... IS NULL` clause filtering out soft-deleted rows. Includes the conditional
     * DROP guard and a descriptive comment header.
     */
    generateBaseView(context: BaseViewGenerationContext): string {
        const entity = context.entity;
        const viewName = entity.BaseView ? entity.BaseView : `vw${entity.CodeName}`;
        const alias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const whereClause = entity.DeleteType === 'Soft'
            ? `WHERE\n    ${alias}.[${EntityInfo.DeletedAtFieldName}] IS NULL\n`
            : '';

        return `
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      ${entity.Name}
-----               SCHEMA:      ${entity.SchemaName}
-----               BASE TABLE:  ${entity.BaseTable}
-----               PRIMARY KEY: ${entity.PrimaryKeys.map(pk => pk.Name).join(', ')}
------------------------------------------------------------
IF OBJECT_ID('[${entity.SchemaName}].[${viewName}]', 'V') IS NOT NULL
    DROP VIEW [${entity.SchemaName}].[${viewName}];
GO

CREATE VIEW [${entity.SchemaName}].[${viewName}]
AS
SELECT
    ${alias}.*${context.parentFieldsSelect}${context.relatedFieldsSelect.length > 0 ? ',' : ''}${context.relatedFieldsSelect}${context.rootFieldsSelect}
FROM
    [${entity.SchemaName}].[${entity.BaseTable}] AS ${alias}${context.parentJoins ? '\n' + context.parentJoins : ''}${context.relatedFieldsJoins ? '\n' + context.relatedFieldsJoins : ''}${context.rootJoins}
${whereClause}GO`;
    }

    // ─── CRUD ROUTINES ───────────────────────────────────────────────────

    /**
     * Generates the `spCreate` stored procedure for a SQL Server entity. Handles three
     * primary key strategies:
     *
     * 1. **Auto-increment**: Uses `SCOPE_IDENTITY()` to retrieve the generated key.
     * 2. **UNIQUEIDENTIFIER with default** (e.g., `NEWSEQUENTIALID()`): Uses an `OUTPUT`
     *    clause into a table variable with a two-branch `IF @PK IS NOT NULL` pattern so
     *    callers can optionally supply their own GUID or let the database default apply.
     * 3. **UNIQUEIDENTIFIER without default**: Falls back to `ISNULL(@PK, NEWID())`.
     * 4. **Composite / other PKs**: Constructs a multi-column WHERE clause for retrieval.
     *
     * The procedure always returns the newly created record via the entity's base view.
     * Includes GRANT EXECUTE permissions for authorized roles.
     */
    generateCRUDCreate(entity: EntityInfo): string {
        const spName = this.getCRUDRoutineName(entity, 'Create');
        const firstKey = entity.FirstPrimaryKey;
        const efString = this.generateCRUDParamString(entity.Fields, false);
        const permissions = this.generateCRUDPermissions(entity, spName, 'Create');

        let preInsertCode = '';
        let outputCode = '';
        let selectInsertedRecord = '';
        let additionalFieldList = '';
        let additionalValueList = '';

        if (firstKey.AutoIncrement) {
            selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${firstKey.Name}] = SCOPE_IDENTITY()`;
        } else if (firstKey.Type.toLowerCase().trim() === 'uniqueidentifier' && entity.PrimaryKeys.length === 1) {
            const hasDefaultValue = firstKey.DefaultValue && firstKey.DefaultValue.trim().length > 0;

            if (hasDefaultValue) {
                // UUID with DB default (e.g. NEWSEQUENTIALID()): two-branch INSERT —
                // one with caller-supplied PK, one letting the DB fill it in.
                // When there are no non-PK writable columns, omit the comma after the PK.
                const nonPkCols = this.generateInsertFieldString(entity, entity.Fields, '', true);
                const nonPkVals = this.generateInsertFieldString(entity, entity.Fields, '@', true);
                const hasNonPkFields = nonPkCols.trim().length > 0;
                const colSeparator = hasNonPkFields ? ',\n                ' : '';
                const valSeparator = hasNonPkFields ? ',\n                ' : '';

                preInsertCode = `DECLARE @InsertedRow TABLE ([${firstKey.Name}] UNIQUEIDENTIFIER)

    IF @${firstKey.Name} IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${entity.SchemaName}].[${entity.BaseTable}]
            (
                [${firstKey.Name}]${colSeparator}${nonPkCols}
            )
        OUTPUT INSERTED.[${firstKey.Name}] INTO @InsertedRow
        VALUES
            (
                @${firstKey.Name}${valSeparator}${nonPkVals}
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${entity.SchemaName}].[${entity.BaseTable}]
            (
                ${hasNonPkFields ? nonPkCols : `[${firstKey.Name}]`}
            )
        OUTPUT INSERTED.[${firstKey.Name}] INTO @InsertedRow
        VALUES
            (
                ${hasNonPkFields ? nonPkVals : `DEFAULT`}
            )
    END`;

                additionalFieldList = '';
                additionalValueList = '';
                outputCode = '';
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${firstKey.Name}] = (SELECT [${firstKey.Name}] FROM @InsertedRow)`;
            } else {
                // UUID without DB default: generate via ISNULL(@PK, NEWID()).
                // PK is added via additionalFieldList; no leading comma — the
                // insertBlock logic below handles the separator.
                preInsertCode = `DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@${firstKey.Name}, NEWID())`;
                additionalFieldList = '[' + firstKey.Name + ']';
                additionalValueList = '@ActualID';
                outputCode = '';
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${firstKey.Name}] = @ActualID`;
            }
        } else {
            // Composite PKs or single non-UUID PKs (e.g. string `Code` keys): the caller MUST
            // supply the PK on INSERT (no IDENTITY, no UUID-with-default). Add ALL PKs to the
            // additionalFieldList so they appear in the INSERT, and call generateInsertFieldString
            // below with excludePrimaryKey=true so it does NOT also emit them — otherwise the
            // INSERT would list the PK columns twice and SQL Server raises "The column name 'X'
            // is specified more than once". This pairs with the excludePrimaryKey=true argument
            // at the call sites at the bottom of this method.
            const pkColumns: string[] = [];
            const pkValues: string[] = [];
            for (const k of entity.PrimaryKeys) {
                pkColumns.push('[' + k.Name + ']');
                pkValues.push('@' + k.CodeName);
            }
            additionalFieldList = pkColumns.join(',\n                ');
            additionalValueList = pkValues.join(',\n                ');
            selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE `;
            let isFirst = true;
            for (const k of entity.PrimaryKeys) {
                if (!isFirst) selectInsertedRecord += ' AND ';
                selectInsertedRecord += `[${k.Name}] = @${k.CodeName}`;
                isFirst = false;
            }
        }

        // Build the INSERT column and value lists. For the non-hasDefaultValue branches,
        // additionalFieldList holds PK columns (without leading commas) and
        // generateInsertFieldString (with excludePrimaryKey=true) holds non-PK columns.
        // When the non-PK list is empty (PK-only entities), we must not emit a stray comma.
        let insertBlock = '';
        if (!preInsertCode.includes('INSERT INTO')) {
            const nonPkColumns = this.generateInsertFieldString(entity, entity.Fields, '', true);
            const nonPkValues = this.generateInsertFieldString(entity, entity.Fields, '@', true);
            const hasNonPkFields = nonPkColumns.trim().length > 0;
            const hasAdditionalFields = additionalFieldList.trim().length > 0;

            let columnList: string;
            let valueList: string;
            if (hasNonPkFields && hasAdditionalFields) {
                columnList = `${nonPkColumns},\n                ${additionalFieldList}`;
                valueList = `${nonPkValues},\n                ${additionalValueList}`;
            } else if (hasAdditionalFields) {
                columnList = additionalFieldList;
                valueList = additionalValueList;
            } else {
                columnList = nonPkColumns;
                valueList = nonPkValues;
            }

            insertBlock = `
    INSERT INTO
    [${entity.SchemaName}].[${entity.BaseTable}]
        (
            ${columnList}
        )
    ${outputCode}VALUES
        (
            ${valueList}
        )`;
        }

        return `
------------------------------------------------------------
----- CREATE PROCEDURE FOR ${entity.BaseTable}
------------------------------------------------------------
IF OBJECT_ID('[${entity.SchemaName}].[${spName}]', 'P') IS NOT NULL
    DROP PROCEDURE [${entity.SchemaName}].[${spName}];
GO

CREATE PROCEDURE [${entity.SchemaName}].[${spName}]
    ${efString}
AS
BEGIN
    SET NOCOUNT ON;
    ${preInsertCode}${insertBlock}
    -- return the new record from the base view, which might have some calculated fields
    ${selectInsertedRecord}
END
GO${permissions}
    `;
    }

    /**
     * Generates the `spUpdate` stored procedure for a SQL Server entity. Performs a standard
     * `UPDATE ... SET ... WHERE PK = @PK` and uses `@@ROWCOUNT` to detect whether the row
     * was found: if no rows were updated (e.g., stale PK or concurrent delete), returns an
     * empty result set with the base view's column structure (`SELECT TOP 0 ... WHERE 1=0`);
     * otherwise returns the updated record from the base view. Also generates the
     * `__mj_UpdatedAt` timestamp trigger if the entity has that column.
     */
    generateCRUDUpdate(entity: EntityInfo): string {
        const spName = this.getCRUDRoutineName(entity, 'Update');
        const efParamString = this.generateCRUDParamString(entity.Fields, true);
        const permissions = this.generateCRUDPermissions(entity, spName, 'Update');
        const hasUpdatedAtField = entity.Fields.find(f => f.Name.toLowerCase().trim() === EntityInfo.UpdatedAtFieldName.trim().toLowerCase()) !== undefined;
        const updatedAtTrigger = hasUpdatedAtField ? this.generateTimestampTrigger(entity) : '';
        const updateFields = this.generateUpdateFieldString(entity.Fields);
        const selectUpdatedRecord = `SELECT
                                        *
                                    FROM
                                        [${entity.SchemaName}].[${entity.BaseView}]
                                    WHERE
                                        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}
                                    `;

        // PK-only entities (e.g. junction tables with only PK + __mj timestamp columns)
        // have no updatable fields. Generate a no-op SP that just returns the existing row
        // rather than emitting an invalid UPDATE with an empty SET clause.
        const hasUpdatableFields = updateFields.trim().length > 0;

        const spBody = hasUpdatableFields
            ? `    UPDATE
        [${entity.SchemaName}].[${entity.BaseTable}]
    SET
        ${updateFields}
    WHERE
        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        ${selectUpdatedRecord}`
            : `    -- No updatable fields (PK-only entity, e.g. junction table). Return the existing row.
    ${selectUpdatedRecord}`;

        return `
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ${entity.BaseTable}
------------------------------------------------------------
IF OBJECT_ID('[${entity.SchemaName}].[${spName}]', 'P') IS NOT NULL
    DROP PROCEDURE [${entity.SchemaName}].[${spName}];
GO

CREATE PROCEDURE [${entity.SchemaName}].[${spName}]
    ${efParamString}
AS
BEGIN
    SET NOCOUNT ON;
${spBody}
END
GO
${permissions}
GO
${updatedAtTrigger}
        `;
    }

    /**
     * Generates the `spDelete` stored procedure for a SQL Server entity. Supports both
     * hard delete (`DELETE FROM`) and soft delete (`UPDATE ... SET __mj_DeletedAt = GETUTCDATE()`
     * with a guard against re-deleting already soft-deleted rows). Prepends any cascade
     * delete/update SQL for related entities. Uses `@@ROWCOUNT` to determine success:
     * returns the PK values on success or NULL PK values if no row was affected.
     */
    generateCRUDDelete(entity: EntityInfo, cascadeSQL: string): string {
        const spName = this.getCRUDRoutineName(entity, 'Delete');
        const permissions = this.generateCRUDPermissions(entity, spName, 'Delete');
        let sVariables = '';
        let sSelect = '';
        for (const k of entity.PrimaryKeys) {
            if (sVariables !== '') sVariables += ', ';
            sVariables += `@${k.CodeName} ${k.SQLFullType}`;
            if (sSelect !== '') sSelect += ', ';
            sSelect += `@${k.CodeName} AS [${k.Name}]`;
        }

        let deleteCode = `    WHERE
        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}
`;
        if (entity.DeleteType === 'Hard') {
            deleteCode = `    DELETE FROM
        [${entity.SchemaName}].[${entity.BaseTable}]
${deleteCode}`;
        } else {
            deleteCode = `    UPDATE
        [${entity.SchemaName}].[${entity.BaseTable}]
    SET
        ${EntityInfo.DeletedAtFieldName} = GETUTCDATE()
${deleteCode}        AND ${EntityInfo.DeletedAtFieldName} IS NULL -- don't update the record if it's already been deleted via a soft delete`;
        }

        let sNullSelect = '';
        for (const k of entity.PrimaryKeys) {
            if (sNullSelect !== '') sNullSelect += ', ';
            sNullSelect += `NULL AS [${k.Name}]`;
        }

        return `
------------------------------------------------------------
----- DELETE PROCEDURE FOR ${entity.BaseTable}
------------------------------------------------------------
IF OBJECT_ID('[${entity.SchemaName}].[${spName}]', 'P') IS NOT NULL
    DROP PROCEDURE [${entity.SchemaName}].[${spName}];
GO

CREATE PROCEDURE [${entity.SchemaName}].[${spName}]
    ${sVariables}
AS
BEGIN
    SET NOCOUNT ON;${cascadeSQL}

${deleteCode}

    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT ${sNullSelect} -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT ${sSelect} -- Return the primary key values to indicate we successfully deleted the record
END
GO${permissions}
    `;
    }

    // ─── TRIGGERS ────────────────────────────────────────────────────────

    /**
     * Generates a SQL Server `AFTER UPDATE` trigger that automatically sets the
     * `__mj_UpdatedAt` column to `GETUTCDATE()` on every update. The trigger joins
     * the base table to the `INSERTED` pseudo-table on all primary key columns to
     * target only the affected rows. Returns an empty string if the entity does not
     * have an `__mj_UpdatedAt` field.
     */
    generateTimestampTrigger(entity: EntityInfo): string {
        const updatedAtField = entity.Fields.find(f => f.Name.toLowerCase().trim() === EntityInfo.UpdatedAtFieldName.toLowerCase().trim());
        if (!updatedAtField) return '';

        return `
------------------------------------------------------------
----- TRIGGER FOR ${EntityInfo.UpdatedAtFieldName} field for the ${entity.BaseTable} table
------------------------------------------------------------
IF OBJECT_ID('[${entity.SchemaName}].[trgUpdate${entity.BaseTableCodeName}]', 'TR') IS NOT NULL
    DROP TRIGGER [${entity.SchemaName}].[trgUpdate${entity.BaseTableCodeName}];
GO
CREATE TRIGGER [${entity.SchemaName}].trgUpdate${entity.BaseTableCodeName}
ON [${entity.SchemaName}].[${entity.BaseTable}]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${entity.SchemaName}].[${entity.BaseTable}]
    SET
        ${EntityInfo.UpdatedAtFieldName} = GETUTCDATE()
    FROM
        [${entity.SchemaName}].[${entity.BaseTable}] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        ${entity.PrimaryKeys.map(k => `_organicTable.[${k.Name}] = I.[${k.Name}]`).join(' AND ')};
END;
GO`;
    }

    // ─── INDEXES ─────────────────────────────────────────────────────────

    /**
     * Generates conditional `CREATE INDEX` statements for all foreign key columns on an entity.
     * Each index uses the naming convention `IDX_AUTO_MJ_FKEY_{Table}_{Column}`, truncated
     * to 128 characters (SQL Server's identifier length limit). Wraps each statement in an
     * `IF NOT EXISTS` check against `sys.indexes` to avoid duplicate index creation.
     */
    generateForeignKeyIndexes(entity: EntityInfo): string[] {
        const indexes: string[] = [];
        for (const f of entity.Fields) {
            if (f.RelatedEntity && f.RelatedEntity.length > 0) {
                let indexName = `IDX_AUTO_MJ_FKEY_${entity.BaseTableCodeName}_${f.CodeName}`;
                if (indexName.length > 128) indexName = indexName.substring(0, 128);

                indexes.push(`-- Index for foreign key ${f.Name} in table ${entity.BaseTable}
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = '${indexName}' 
    AND object_id = OBJECT_ID('[${entity.SchemaName}].[${entity.BaseTable}]')
)
CREATE INDEX ${indexName} ON [${entity.SchemaName}].[${entity.BaseTable}] ([${f.Name}]);`);
            }
        }
        return indexes;
    }

    // ─── FULL-TEXT SEARCH ────────────────────────────────────────────────

    /**
     * Generates SQL Server full-text search infrastructure for an entity, conditionally
     * producing up to three components based on entity metadata flags:
     *
     * 1. **Full-text catalog** (`FullTextCatalogGenerated`): `CREATE FULLTEXT CATALOG` if
     *    one doesn't already exist, defaulting to `MJ_FullTextCatalog`.
     * 2. **Full-text index** (`FullTextIndexGenerated`): Drops any existing FT index on the
     *    table, then creates a new one covering the specified search fields with English language.
     * 3. **Search function** (`FullTextSearchFunctionGenerated`): An inline table-valued
     *    function that wraps `CONTAINS()` to return matching primary key values.
     *
     * @returns The generated SQL and the resolved function name for permission grants.
     */
    generateFullTextSearch(entity: EntityInfo, searchFields: EntityFieldInfo[], primaryKeyIndexName: string): FullTextSearchResult {
        let sql = '';
        const catalogName = entity.FullTextCatalog && entity.FullTextCatalog.length > 0
            ? entity.FullTextCatalog
            : dbDatabase + '_FullTextCatalog';

        if (entity.FullTextCatalogGenerated) {
            sql += `                -- CREATE THE FULL TEXT CATALOG
                IF NOT EXISTS (
                    SELECT * FROM sys.fulltext_catalogs WHERE name = '${catalogName}'
                )
                    CREATE FULLTEXT CATALOG ${catalogName};
                GO
    `;
        }

        if (entity.FullTextIndexGenerated) {
            const fullTextFields = searchFields.map(f => `${f.Name} LANGUAGE 'English'`).join(', ');
            sql += `                -- DROP AND RECREATE THE FULL TEXT INDEX
                IF EXISTS (
                    SELECT * FROM sys.fulltext_indexes
                    WHERE object_id = OBJECT_ID('${entity.SchemaName}.${entity.BaseTable}')
                )
                BEGIN
                    DROP FULLTEXT INDEX ON [${entity.SchemaName}].[${entity.BaseTable}];
                END
                GO

                IF NOT EXISTS (
                    SELECT * FROM sys.fulltext_indexes
                    WHERE object_id = OBJECT_ID('${entity.SchemaName}.${entity.BaseTable}')
                )
                BEGIN
                    CREATE FULLTEXT INDEX ON [${entity.SchemaName}].[${entity.BaseTable}]
                    (${fullTextFields})
                    KEY INDEX ${primaryKeyIndexName}
                    ON ${catalogName};
                END
                GO
    `;
        }

        const functionName = entity.FullTextSearchFunction && entity.FullTextSearchFunction.length > 0
            ? entity.FullTextSearchFunction
            : `fnSearch${entity.CodeName}`;

        if (entity.FullTextSearchFunctionGenerated) {
            const fullTextFieldsSimple = searchFields.map(f => '[' + f.Name + ']').join(', ');
            const pkeyList = entity.PrimaryKeys.map(pk => '[' + pk.Name + ']').join(', ');
            sql += `                -- DROP AND RECREATE THE FULL TEXT SEARCH FUNCTION
                IF OBJECT_ID('${entity.SchemaName}.${functionName}', 'IF') IS NOT NULL
                    DROP FUNCTION ${entity.SchemaName}.${functionName};
                GO
                CREATE FUNCTION ${entity.SchemaName}.${functionName} (@searchTerm NVARCHAR(255))
                RETURNS TABLE
                AS
                RETURN (
                    SELECT ${pkeyList}
                    FROM [${entity.SchemaName}].[${entity.BaseTable}]
                    WHERE CONTAINS((${fullTextFieldsSimple}), @searchTerm)
                )
                GO
    `;
        }

        return { sql, functionName };
    }

    // ─── RECURSIVE FUNCTIONS (ROOT ID) ───────────────────────────────────

    /**
     * Generates a SQL Server inline table-valued function that resolves the root ancestor ID
     * for a self-referencing foreign key hierarchy. Uses a recursive CTE starting from the
     * given record (or its parent if provided), walking up the parent chain until it finds
     * a record with a NULL parent pointer. Enforces a maximum recursion depth of 100 to
     * prevent infinite loops from circular references. The function is named
     * `fn{BaseTable}{FieldName}_GetRootID` and returns a single-column result (`RootID`),
     * designed to be consumed via `OUTER APPLY` in the entity's base view.
     */
    generateRootIDFunction(entity: EntityInfo, field: EntityFieldInfo): string {
        const primaryKey = entity.FirstPrimaryKey.Name;
        const primaryKeyType = entity.FirstPrimaryKey.SQLFullType;
        const schemaName = entity.SchemaName;
        const tableName = entity.BaseTable;
        const fieldName = field.Name;
        const functionName = `fn${entity.BaseTable}${fieldName}_GetRootID`;

        return `------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [${tableName}].[${fieldName}]
------------------------------------------------------------
IF OBJECT_ID('[${schemaName}].[${functionName}]', 'IF') IS NOT NULL
    DROP FUNCTION [${schemaName}].[${functionName}];
GO

CREATE FUNCTION [${schemaName}].[${functionName}]
(
    @RecordID ${primaryKeyType},
    @ParentID ${primaryKeyType}
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [${primaryKey}],
            [${fieldName}],
            [${primaryKey}] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${schemaName}].[${tableName}]
        WHERE
            [${primaryKey}] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[${primaryKey}],
            c.[${fieldName}],
            c.[${primaryKey}] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${schemaName}].[${tableName}] c
        INNER JOIN
            CTE_RootParent p ON c.[${primaryKey}] = p.[${fieldName}]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [${fieldName}] IS NULL
    ORDER BY
        [RootParentID]
);
GO
`;
    }

    /** @inheritdoc */
    generateRootFieldSelect(_entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const rootFieldName = `Root${field.Name}`;
        return `${alias}.RootID AS [${rootFieldName}]`;
    }

    /**
     * Generates a SQL Server `OUTER APPLY` clause to join the root ID inline table-valued
     * function into the entity's base view. The function is invoked with the record's primary
     * key and the self-referencing FK value as arguments.
     */
    generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const classNameFirstChar = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const schemaName = entity.SchemaName;
        const functionName = `fn${entity.BaseTable}${field.Name}_GetRootID`;
        const primaryKey = entity.FirstPrimaryKey.Name;
        return `OUTER APPLY\n    [${schemaName}].[${functionName}]([${classNameFirstChar}].[${primaryKey}], [${classNameFirstChar}].[${field.Name}]) AS ${alias}`;
    }

    // ─── PERMISSIONS ─────────────────────────────────────────────────────

    /** @inheritdoc */
    generateViewPermissions(entity: EntityInfo): string {
        let sOutput = '';
        for (const ep of entity.Permissions) {
            if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                sOutput += (sOutput === '' ? `GRANT SELECT ON [${entity.SchemaName}].[${entity.BaseView}] TO ` : ', ') + `[${ep.RoleSQLName}]`;
            }
        }
        return (sOutput === '' ? '' : '\n') + sOutput;
    }

    /**
     * Generates `GRANT EXECUTE` SQL for a CRUD stored procedure, granting permission only
     * to roles whose `EntityPermission` record allows the specified CRUD operation type.
     * Produces a single comma-separated `GRANT EXECUTE ON ... TO [role1], [role2]` statement.
     */
    generateCRUDPermissions(entity: EntityInfo, routineName: string, type: CRUDType): string {
        let sOutput = '';
        for (const ep of entity.Permissions) {
            if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                const hasPermission =
                    (type === 'Create' && ep.CanCreate) ||
                    (type === 'Update' && ep.CanUpdate) ||
                    (type === 'Delete' && ep.CanDelete);

                if (hasPermission) {
                    sOutput += (sOutput === '' ? `GRANT EXECUTE ON [${entity.SchemaName}].[${routineName}] TO ` : ', ') + `[${ep.RoleSQLName}]`;
                }
            }
        }
        return (sOutput === '' ? '' : '\n') + sOutput;
    }

    /** @inheritdoc */
    generateFullTextSearchPermissions(entity: EntityInfo, functionName: string): string {
        let sOutput = '';
        for (const ep of entity.Permissions) {
            if (ep.CanRead) {
                if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                    sOutput += (sOutput === '' ? `GRANT SELECT ON [${entity.SchemaName}].[${functionName}] TO ` : ', ') + `[${ep.RoleSQLName}]`;
                }
            }
        }
        return (sOutput === '' ? '' : '\n') + sOutput;
    }

    // ─── CASCADE DELETES ─────────────────────────────────────────────────

    /** @inheritdoc */
    generateSingleCascadeOperation(context: CascadeDeleteContext): string {
        const { parentEntity, relatedEntity, fkField, operation } = context;

        if (operation === 'update') {
            return this.generateCascadeCursorUpdate(parentEntity, relatedEntity, fkField);
        }
        return this.generateCascadeCursorDelete(parentEntity, relatedEntity, fkField);
    }

    /**
     * Generates cursor-based cascade DELETE SQL for SQL Server.
     * Uses a cursor to iterate related records and call the entity's spDelete for each.
     */
    private generateCascadeCursorDelete(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo): string {
        const qi = this.Dialect.QuoteIdentifier.bind(this.Dialect);
        const qs = this.Dialect.QuoteSchema.bind(this.Dialect);
        const whereClause = `${qi(fkField.CodeName)} = @${parentEntity.FirstPrimaryKey.CodeName}`;
        const spName = this.getCRUDRoutineName(relatedEntity, 'Delete');
        const variablePrefix = `${relatedEntity.CodeName}_${fkField.CodeName}`;
        const pkComponents = this.buildPrimaryKeyComponents(relatedEntity, variablePrefix);
        const cursorName = `cascade_delete_${relatedEntity.CodeName}_${fkField.CodeName}_cursor`;

        return `
    -- Cascade delete from ${relatedEntity.BaseTable} using cursor to call ${spName}
    DECLARE ${pkComponents.varDeclarations}
    DECLARE ${cursorName} CURSOR FOR 
        SELECT ${pkComponents.selectFields}
        FROM ${qs(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        WHERE ${whereClause}
    
    OPEN ${cursorName}
    FETCH NEXT FROM ${cursorName} INTO ${pkComponents.fetchInto}
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC ${qs(relatedEntity.SchemaName, spName)} ${pkComponents.routineParams}
        
        FETCH NEXT FROM ${cursorName} INTO ${pkComponents.fetchInto}
    END
    
    CLOSE ${cursorName}
    DEALLOCATE ${cursorName}`;
    }

    /**
     * Generates cursor-based cascade UPDATE SQL for SQL Server.
     * Used for nullable FK fields: iterates related records and calls spUpdate
     * to set the FK to NULL for each.
     */
    private generateCascadeCursorUpdate(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo): string {
        const qi = this.Dialect.QuoteIdentifier.bind(this.Dialect);
        const qs = this.Dialect.QuoteSchema.bind(this.Dialect);
        const whereClause = `${qi(fkField.CodeName)} = @${parentEntity.FirstPrimaryKey.CodeName}`;
        const variablePrefix = `${relatedEntity.CodeName}_${fkField.CodeName}`;
        const spName = this.getCRUDRoutineName(relatedEntity, 'Update');
        const updateParams = this.buildUpdateCursorParameters(relatedEntity, fkField, variablePrefix);
        const cursorName = `cascade_update_${relatedEntity.CodeName}_${fkField.CodeName}_cursor`;

        return `
    -- Cascade update on ${relatedEntity.BaseTable} using cursor to call ${spName}
    ${updateParams.declarations}
    DECLARE ${cursorName} CURSOR FOR
        SELECT ${updateParams.selectFields}
        FROM ${qs(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        WHERE ${whereClause}

    OPEN ${cursorName}
    FETCH NEXT FROM ${cursorName} INTO ${updateParams.fetchInto}

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @${variablePrefix}_${fkField.CodeName} = NULL

        -- Call the update SP for the related entity
        EXEC ${qs(relatedEntity.SchemaName, spName)} ${updateParams.allParams}

        FETCH NEXT FROM ${cursorName} INTO ${updateParams.fetchInto}
    END

    CLOSE ${cursorName}
    DEALLOCATE ${cursorName}`;
    }

    /**
     * Builds all the cursor parameters needed for a cascade UPDATE operation.
     * Includes primary key fields and all updateable fields, with proper
     * DECLARE statements, SELECT fields, FETCH INTO variables, and SP parameters.
     */
    private buildUpdateCursorParameters(entity: EntityInfo, fkField: EntityFieldInfo, prefix: string = ''): {
        declarations: string,
        selectFields: string,
        fetchInto: string,
        allParams: string
    } {
        const qi = this.Dialect.QuoteIdentifier.bind(this.Dialect);
        let declarations = '';
        let selectFields = '';
        let fetchInto = '';
        let allParams = '';

        const varPrefix = prefix || entity.CodeName;

        // First, handle primary keys with the entity-specific prefix
        const pkComponents = this.buildPrimaryKeyComponents(entity, varPrefix);

        // Add primary key declarations to the declarations string
        // Need to add DECLARE keyword since buildPrimaryKeyComponents doesn't include it
        declarations = pkComponents.varDeclarations.split(', ').map((decl: string) => `DECLARE ${decl}`).join('\n    ');

        selectFields = pkComponents.selectFields;
        fetchInto = pkComponents.fetchInto;
        allParams = pkComponents.routineParams;

        // Then, add all updateable fields with the same prefix
        const sortedFields = sortBySequenceAndCreatedAt(entity.Fields);
        for (const ef of sortedFields) {
            if (!ef.IsPrimaryKey && !ef.IsVirtual && ef.AllowUpdateAPI && !ef.AutoIncrement && !ef.IsSpecialDateField) {
                if (declarations !== '')
                    declarations += '\n    ';
                declarations += `DECLARE @${varPrefix}_${ef.CodeName} ${ef.SQLFullType}`;

                if (selectFields !== '')
                    selectFields += ', ';
                selectFields += qi(ef.Name);

                if (fetchInto !== '')
                    fetchInto += ', ';
                fetchInto += `@${varPrefix}_${ef.CodeName}`;

                if (allParams !== '')
                    allParams += ', ';

                // Use the centralized buildExecParamForField() to generate EXEC
                // params. For the FK field being cleared, pass clearValue=true so
                // the tolerant update SP receives @FK_Clear = 1 and actually sets
                // the column to NULL (instead of treating NULL as "leave unchanged").
                const isFkBeingCleared = ef.Name === fkField.Name;
                const paramParts = this.buildExecParamForField(ef, `@${varPrefix}_${ef.CodeName}`, isFkBeingCleared);
                allParams += paramParts.join(', ');
            }
        }

        return { declarations, selectFields, fetchInto, allParams };
    }

    // ─── TIMESTAMP COLUMNS ───────────────────────────────────────────────

    /**
     * @inheritdoc
     * NOTE: Currently unused in production — timestamp columns are added individually via
     * ensureSpecialDateFieldExistsAndHasCorrectDefaultValue() → addColumnSQL(). This method
     * exists to satisfy the abstract contract. Uses the same defensive multi-step pattern as
     * addColumnSQL() to remain safe if ever called on tables with existing rows on SQL Azure.
     */
    generateTimestampColumns(schema: string, tableName: string): string {
        const createdAt = EntityInfo.CreatedAtFieldName;
        const updatedAt = EntityInfo.UpdatedAtFieldName;
        return [
            `ALTER TABLE [${schema}].[${tableName}] ADD [${createdAt}] DATETIMEOFFSET NULL, [${updatedAt}] DATETIMEOFFSET NULL`,
            `UPDATE [${schema}].[${tableName}] SET [${createdAt}] = GETUTCDATE(), [${updatedAt}] = GETUTCDATE() WHERE [${createdAt}] IS NULL`,
            `ALTER TABLE [${schema}].[${tableName}] ALTER COLUMN [${createdAt}] DATETIMEOFFSET NOT NULL`,
            `ALTER TABLE [${schema}].[${tableName}] ALTER COLUMN [${updatedAt}] DATETIMEOFFSET NOT NULL`,
            `ALTER TABLE [${schema}].[${tableName}] ADD CONSTRAINT [DF_${schema}_${CodeNameFromString(tableName)}_${createdAt}] DEFAULT GETUTCDATE() FOR [${createdAt}]`,
            `ALTER TABLE [${schema}].[${tableName}] ADD CONSTRAINT [DF_${schema}_${CodeNameFromString(tableName)}_${updatedAt}] DEFAULT GETUTCDATE() FOR [${updatedAt}]`,
        ].join(';\n');
    }

    // ─── PARAMETER / FIELD HELPERS ───────────────────────────────────────

    // ─── ROUTINE NAMING ──────────────────────────────────────────────────

    /** @inheritdoc */
    getCRUDRoutineName(entity: EntityInfo, type: CRUDType): string {
        switch (type) {
            case 'Create':
                return entity.spCreate && entity.spCreate.length > 0 ? entity.spCreate : 'spCreate' + entity.BaseTableCodeName;
            case 'Update':
                return entity.spUpdate && entity.spUpdate.length > 0 ? entity.spUpdate : 'spUpdate' + entity.BaseTableCodeName;
            case 'Delete':
                return entity.spDelete && entity.spDelete.length > 0 ? entity.spDelete : 'spDelete' + entity.BaseTableCodeName;
        }
    }

    // ─── SQL HEADERS ─────────────────────────────────────────────────────

    /** @inheritdoc */
    generateSQLFileHeader(entity: EntityInfo, itemName: string): string {
        return `-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: ${entity.Name}
-- Item: ${itemName}
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
`;
    }

    /** @inheritdoc */
    generateAllEntitiesSQLFileHeader(): string {
        return `-----------------------------------------------------------------
-- SQL Code Generation for Entities
--
-- This file contains the SQL code for the entities in the database
-- that are included in the API and have generated SQL elements like views and
-- stored procedures.
--
-- It is generated by the MemberJunction CodeGen tool.
-- It is not intended to be edited by hand.
-----------------------------------------------------------------
`;
    }

    // ─── UTILITY ─────────────────────────────────────────────────────────

    /**
     * Formats a raw default value string for embedding in generated SQL. Recognizes common
     * SQL Server functions (`NEWID()`, `NEWSEQUENTIALID()`, `GETDATE()`, `GETUTCDATE()`,
     * `SYSDATETIME()`, `SYSDATETIMEOFFSET()`, `CURRENT_TIMESTAMP`, `USER_NAME()`,
     * `SUSER_NAME()`, `SYSTEM_USER`) and strips wrapping parentheses from them. For literal
     * values, strips surrounding single quotes and re-applies them only if `needsQuotes`
     * is true. Returns `'NULL'` for empty or whitespace-only inputs.
     */
    formatDefaultValue(defaultValue: string, needsQuotes: boolean): string {
        if (!defaultValue || defaultValue.trim().length === 0) {
            return 'NULL';
        }

        let trimmedValue = defaultValue.trim();
        const lowerValue = trimmedValue.toLowerCase();

        const sqlFunctions = [
            'newid()', 'newsequentialid()', 'getdate()', 'getutcdate()',
            'sysdatetime()', 'sysdatetimeoffset()', 'current_timestamp',
            'user_name()', 'suser_name()', 'system_user'
        ];

        for (const func of sqlFunctions) {
            if (lowerValue.includes(func)) {
                if (trimmedValue.startsWith('(') && trimmedValue.endsWith(')')) {
                    trimmedValue = trimmedValue.substring(1, trimmedValue.length - 1);
                }
                return trimmedValue;
            }
        }

        let cleanValue = trimmedValue;
        if (cleanValue.startsWith("'") && cleanValue.endsWith("'")) {
            cleanValue = cleanValue.substring(1, cleanValue.length - 1);
        }

        if (needsQuotes) {
            return `'${cleanValue}'`;
        }

        return cleanValue;
    }

    /**
     * Builds the four SQL fragments needed to work with an entity's primary key columns
     * in cursor-based cascade operations:
     *
     * - `varDeclarations`: `@{prefix}{PK} TYPE` variable declarations for `DECLARE`.
     * - `selectFields`: Bracketed column names for the cursor `SELECT`.
     * - `fetchInto`: `@{prefix}{PK}` variable references for `FETCH INTO`.
     * - `routineParams`: Named parameter assignments (`@PK = @{prefix}{PK}`) for `EXEC`.
     *
     * Supports composite primary keys by iterating all PK fields. The optional `prefix`
     * defaults to `'Related'` to avoid variable name collisions in nested cursor blocks.
     */
    buildPrimaryKeyComponents(entity: EntityInfo, prefix?: string): {
        varDeclarations: string;
        selectFields: string;
        fetchInto: string;
        routineParams: string;
    } {
        let varDeclarations = '';
        let selectFields = '';
        let fetchInto = '';
        let routineParams = '';

        const varPrefix = prefix || 'Related';

        for (const pk of entity.PrimaryKeys) {
            if (varDeclarations !== '') varDeclarations += ', ';
            varDeclarations += `@${varPrefix}${pk.CodeName} ${pk.SQLFullType}`;

            if (selectFields !== '') selectFields += ', ';
            selectFields += `[${pk.Name}]`;

            if (fetchInto !== '') fetchInto += ', ';
            fetchInto += `@${varPrefix}${pk.CodeName}`;

            if (routineParams !== '') routineParams += ', ';
            routineParams += `@${pk.CodeName} = @${varPrefix}${pk.CodeName}`;
        }

        return { varDeclarations, selectFields, fetchInto, routineParams };
    }

    // ─── DATABASE INTROSPECTION ──────────────────────────────────────────

    /** @inheritdoc */
    getViewDefinitionSQL(schema: string, viewName: string): string {
        return `SELECT OBJECT_DEFINITION(OBJECT_ID('[${schema}].[${viewName}]')) AS ViewDefinition`;
    }

    /**
     * Returns a SQL query that retrieves the primary key index name for a table by joining
     * `sys.indexes`, `sys.objects`, and `sys.key_constraints` and filtering on constraint
     * type `'PK'`. The result column is named `IndexName` as expected by the orchestrator.
     */
    getPrimaryKeyIndexNameSQL(schema: string, tableName: string): string {
        return `SELECT
        i.name AS IndexName
    FROM
        sys.indexes i
    INNER JOIN
        sys.objects o ON i.object_id = o.object_id
    INNER JOIN
        sys.key_constraints kc ON i.object_id = kc.parent_object_id AND
        i.index_id = kc.unique_index_id
    WHERE
        o.name = '${tableName}' AND
        o.schema_id = SCHEMA_ID('${schema}') AND
        kc.type = 'PK'`;
    }

    /**
     * Returns a SQL query that checks whether a column participates in a composite (multi-column)
     * unique constraint. Queries `sys.indexes`, `sys.index_columns`, and `sys.columns` to find
     * non-primary-key unique indexes that include the specified column AND have more than one
     * column. Returns rows if the column is part of such a constraint; the orchestrator checks
     * `recordset.length > 0`.
     */
    getCompositeUniqueConstraintCheckSQL(schema: string, tableName: string, columnName: string): string {
        return `SELECT i.index_id
            FROM sys.indexes i
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE i.is_unique = 1
              AND i.is_primary_key = 0
              AND s.name = '${schema}'
              AND t.name = '${tableName}'
              AND EXISTS (
                  SELECT 1
                  FROM sys.index_columns ic
                  INNER JOIN sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
                  WHERE ic.object_id = i.object_id
                    AND ic.index_id = i.index_id
                    AND c.name = '${columnName}'
              )
              AND (SELECT COUNT(*)
                   FROM sys.index_columns ic2
                   WHERE ic2.object_id = i.object_id
                     AND ic2.index_id = i.index_id) > 1`;
    }

    /** @inheritdoc */
    getForeignKeyIndexExistsSQL(schema: string, tableName: string, indexName: string): string {
        return `SELECT 1
    FROM sys.indexes
    WHERE name = '${indexName}'
    AND object_id = OBJECT_ID('[${schema}].[${tableName}]')`;
    }

    // ─── METADATA MANAGEMENT: STORED PROCEDURE CALLS ─────────────────

    /**
     * Builds a SQL Server `EXEC` statement for invoking a stored procedure. When `paramNames`
     * are provided, generates named parameter syntax (`@ParamName=value`); otherwise uses
     * positional parameter values. Returns just `EXEC [schema].[routine]` if no params.
     */
    callRoutineSQL(schema: string, routineName: string, params: string[], paramNames?: string[]): string {
        const qualifiedName = `[${schema}].[${routineName}]`;
        if (!params || params.length === 0) {
            return `EXEC ${qualifiedName}`;
        }
        const paramParts = params.map((val, i) => {
            if (paramNames && paramNames[i]) {
                return `@${paramNames[i]}=${val}`;
            }
            return val;
        });
        return `EXEC ${qualifiedName} ${paramParts.join(', ')}`;
    }

    // ─── METADATA MANAGEMENT: CONDITIONAL INSERT ─────────────────────

    /** @inheritdoc */
    conditionalInsertSQL(checkQuery: string, insertSQL: string): string {
        return `IF NOT EXISTS (\n      ${checkQuery}\n   )\n   BEGIN\n      ${insertSQL}\n   END`;
    }

    /** @inheritdoc */
    wrapInsertWithConflictGuard(conflictCheckSQL: string): { prefix: string; suffix: string } {
        return {
            prefix: `IF NOT EXISTS (${conflictCheckSQL}) BEGIN`,
            suffix: `END`
        };
    }

    // ─── METADATA MANAGEMENT: DDL OPERATIONS ─────────────────────────

    /** @inheritdoc */
    addColumnSQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean, defaultExpression?: string): string {
        const nullClause = nullable ? 'NULL' : 'NOT NULL';
        const defaultClause = defaultExpression ? ` DEFAULT ${defaultExpression}` : '';

        if (!nullable && defaultExpression && dataType.toUpperCase() === 'DATETIMEOFFSET') {
            // SQL Azure evaluates DEFAULT through a sql_variant intermediate when backfilling
            // existing rows during ALTER TABLE ADD ... NOT NULL DEFAULT. Implicit conversion from
            // sql_variant to datetimeoffset is not allowed, causing the operation to fail.
            // The defensive workaround (add NULL → UPDATE → ALTER NOT NULL → ADD CONSTRAINT)
            // works on both Azure and regular SQL Server, so we always use it for DATETIMEOFFSET
            // to ensure CodeGen output is portable across environments.
            const constraintName = `DF_${schema}_${CodeNameFromString(tableName)}_${columnName}`;
            return [
                `ALTER TABLE [${schema}].[${tableName}] ADD [${columnName}] ${dataType} NULL`,
                `UPDATE [${schema}].[${tableName}] SET [${columnName}] = ${defaultExpression} WHERE [${columnName}] IS NULL`,
                `ALTER TABLE [${schema}].[${tableName}] ALTER COLUMN [${columnName}] ${dataType} NOT NULL`,
                `ALTER TABLE [${schema}].[${tableName}] ADD CONSTRAINT [${constraintName}] DEFAULT ${defaultExpression} FOR [${columnName}]`,
            ].join(';\n');
        }

        return `ALTER TABLE [${schema}].[${tableName}] ADD [${columnName}] ${dataType} ${nullClause}${defaultClause}`;
    }

    /** @inheritdoc */
    alterColumnTypeAndNullabilitySQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean): string {
        const nullClause = nullable ? 'NULL' : 'NOT NULL';
        return `ALTER TABLE [${schema}].[${tableName}] ALTER COLUMN [${columnName}] ${dataType} ${nullClause}`;
    }

    /** @inheritdoc */
    addDefaultConstraintSQL(schema: string, tableName: string, columnName: string, defaultExpression: string): string {
        const constraintName = `DF_${schema}_${CodeNameFromString(tableName)}_${columnName}`;
        return `ALTER TABLE [${schema}].[${tableName}] ADD CONSTRAINT [${constraintName}] DEFAULT ${defaultExpression} FOR [${columnName}]`;
    }

    /**
     * Generates SQL to dynamically find and drop the default constraint on a column.
     * Unlike PostgreSQL's simple `ALTER COLUMN DROP DEFAULT`, SQL Server requires looking
     * up the constraint name from `sys.default_constraints` joined through `sys.tables`,
     * `sys.schemas`, and `sys.columns`, then executing a dynamic `ALTER TABLE DROP CONSTRAINT`
     * via `EXEC()`. The generated SQL is safe to run even if no default constraint exists
     * (guarded by `IF @constraintName IS NOT NULL`).
     */
    dropDefaultConstraintSQL(schema: string, tableName: string, columnName: string): string {
        return `DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${schema}'
AND t.name = '${tableName}'
AND c.name = '${columnName}';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${schema}].[${tableName}] DROP CONSTRAINT ' + @constraintName);
END`;
    }

    /** @inheritdoc */
    dropObjectSQL(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION', schema: string, name: string): string {
        const typeCode = objectType === 'PROCEDURE' ? 'P' : objectType === 'VIEW' ? 'V' : 'FN';
        return `IF OBJECT_ID('[${schema}].[${name}]', '${typeCode}') IS NOT NULL\n    DROP ${objectType} [${schema}].[${name}]`;
    }

    // ─── METADATA MANAGEMENT: VIEW INTROSPECTION ─────────────────────

    /** @inheritdoc */
    getViewExistsSQL(): string {
        return `SELECT 1 FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = @ViewName AND TABLE_SCHEMA = @SchemaName`;
    }

    /**
     * Returns a SQL query that retrieves column metadata for a view by joining `sys.columns`,
     * `sys.types`, `sys.views`, and `sys.schemas`. Returns columns named `FieldName`, `Type`,
     * `Length`, `Precision`, `Scale`, and `AllowsNull`, ordered by `column_id` to preserve
     * the original column definition order.
     */
    getViewColumnsSQL(schema: string, viewName: string): string {
        return `SELECT
    c.name AS FieldName,
    t.name AS Type,
    c.max_length AS Length,
    c.precision AS Precision,
    c.scale AS Scale,
    c.is_nullable AS AllowsNull
FROM
    sys.columns c
INNER JOIN
    sys.types t ON c.user_type_id = t.user_type_id
INNER JOIN
    sys.views v ON c.object_id = v.object_id
INNER JOIN
    sys.schemas s ON v.schema_id = s.schema_id
WHERE
    s.name = '${schema}'
    AND v.name = '${viewName}'
ORDER BY
    c.column_id`;
    }

    // ─── METADATA MANAGEMENT: TYPE SYSTEM ────────────────────────────

    /** @inheritdoc */
    get TimestampType(): string {
        return 'DATETIMEOFFSET';
    }

    /** @inheritdoc */
    compareDataTypes(reported: string, expected: string): boolean {
        return reported.trim().toLowerCase() === expected.trim().toLowerCase();
    }

    // ─── METADATA MANAGEMENT: PLATFORM CONFIGURATION ─────────────────

    /** @inheritdoc */
    getSystemSchemasToExclude(): string[] {
        return [];
    }

    /** @inheritdoc */
    get NeedsViewRefresh(): boolean {
        return true;
    }

    /** @inheritdoc */
    generateViewRefreshSQL(schema: string, viewName: string): string {
        return `EXEC sp_refreshview '${schema}.${viewName}';`;
    }

    /** @inheritdoc */
    generateViewTestQuerySQL(schema: string, viewName: string): string {
        return `SELECT TOP 1 * FROM [${schema}].[${viewName}]`;
    }

    /** @inheritdoc */
    get NeedsVirtualFieldNullabilityFix(): boolean {
        return false;
    }

    // ─── METADATA MANAGEMENT: SQL QUOTING ────────────────────────────

    /** @inheritdoc */
    quoteSQLForExecution(sql: string): string {
        return sql;
    }

    // ─── METADATA MANAGEMENT: DEFAULT VALUE PARSING ──────────────────

    /**
     * Parses a raw SQL Server column default value from the system catalog into a clean form.
     * SQL Server wraps defaults in parentheses (e.g., `(getdate())`, `((1))`, `(N'foo')`),
     * so this method applies three successive stripping passes:
     *
     * 1. Strips one layer of wrapping parentheses.
     * 2. Strips the `N'...'` Unicode string prefix.
     * 3. Strips surrounding single quotes from plain string literals.
     *
     * Returns `null` if the input is null or undefined.
     */
    parseColumnDefaultValue(sqlDefaultValue: string): string | null {
        if (sqlDefaultValue === null || sqlDefaultValue === undefined) {
            return null;
        }
        let result = this.stripWrappingParentheses(sqlDefaultValue);
        result = this.stripNPrefixQuotes(result);
        result = this.stripSingleQuotes(result);
        return result;
    }

    /**
     * Strips wrapping parentheses from a SQL Server default value.
     * Example: `(getdate())` becomes `getdate()`, `((1))` becomes `(1)`.
     */
    private stripWrappingParentheses(value: string): string {
        if (value.startsWith('(') && value.endsWith(')')) {
            return value.substring(1, value.length - 1);
        }
        return value;
    }

    /**
     * Strips the N'' prefix from a SQL Server Unicode string literal.
     * Example: `N'SomeValue'` becomes `SomeValue`.
     */
    private stripNPrefixQuotes(value: string): string {
        if (value.toUpperCase().startsWith("N'") && value.endsWith("'")) {
            return value.substring(2, value.length - 1);
        }
        return value;
    }

    /**
     * Strips surrounding single quotes from a value.
     * Example: `'SomeValue'` becomes `SomeValue`.
     */
    private stripSingleQuotes(value: string): string {
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.substring(1, value.length - 1);
        }
        return value;
    }

    // ─── METADATA MANAGEMENT: COMPLEX SQL GENERATION ─────────────────

    /**
     * Generates the full SQL query to retrieve entity fields that exist in the database schema
     * but are not yet registered in MJ metadata. The query is assembled from three parts:
     *
     * 1. **Temp table materialization**: Copies `vwForeignKeys`, `vwTablePrimaryKeys`, and
     *    `vwTableUniqueKeys` into temp tables so SQL Server can build real statistics instead
     *    of expanding nested view-on-view joins with bad cardinality estimates.
     * 2. **Main CTE query**: Uses `MaxSequences` CTE to calculate proper field ordering and
     *    `NumberedRows` CTE to deduplicate results, joining against the temp tables for FK,
     *    PK, and unique key detection.
     * 3. **Cleanup**: Drops the temp tables.
     */
    getPendingEntityFieldsSQL(mjCoreSchema: string, entityIDs?: string[]): string {
        return this.buildPendingFieldsTempTables(mjCoreSchema) +
            this.buildPendingFieldsMainQuery(mjCoreSchema, entityIDs) +
            this.buildPendingFieldsCleanup();
    }

    /**
     * Builds the temp table materialization statements for the pending entity fields query.
     * Materializes system DMV views into temp tables for optimal SQL Server query plan statistics.
     */
    private buildPendingFieldsTempTables(schema: string): string {
        return `
-- Materialize system DMV views into temp tables so SQL Server gets real statistics
-- instead of expanding nested view-on-view joins with bad cardinality estimates
-- Drop first in case a prior run on this connection left them behind
IF OBJECT_ID('tempdb..#__mj__CodeGen__vwForeignKeys') IS NOT NULL DROP TABLE #__mj__CodeGen__vwForeignKeys;
IF OBJECT_ID('tempdb..#__mj__CodeGen__vwTablePrimaryKeys') IS NOT NULL DROP TABLE #__mj__CodeGen__vwTablePrimaryKeys;
IF OBJECT_ID('tempdb..#__mj__CodeGen__vwTableUniqueKeys') IS NOT NULL DROP TABLE #__mj__CodeGen__vwTableUniqueKeys;

SELECT [column], [table], [schema_name], referenced_table, referenced_column, [referenced_schema]
INTO #__mj__CodeGen__vwForeignKeys
FROM [${schema}].[vwForeignKeys];

SELECT TableName, ColumnName, SchemaName
INTO #__mj__CodeGen__vwTablePrimaryKeys
FROM [${schema}].[vwTablePrimaryKeys];

SELECT TableName, ColumnName, SchemaName
INTO #__mj__CodeGen__vwTableUniqueKeys
FROM [${schema}].[vwTableUniqueKeys];
`;
    }

    /**
     * Builds the main CTE query for finding pending entity fields.
     * Uses MaxSequences CTE to calculate proper field ordering and NumberedRows
     * CTE to deduplicate results.
     */
    private buildPendingFieldsMainQuery(schema: string, entityIDs?: string[]): string {
        // When scoped, narrow the scan to specific entities. SQL injection isn't a concern
        // here — entityIDs are MJ-internal UUIDs from the metadata cache, not user input —
        // but we quote each ID anyway for SQL Server's UUID literal syntax.
        const scopeFilter = entityIDs && entityIDs.length > 0
            ? `AND sf.EntityID IN (${entityIDs.map(id => `'${id}'`).join(',')})`
            : '';
        return `WITH MaxSequences AS (
   SELECT
      EntityID,
      ISNULL(MAX(Sequence), 0) AS MaxSequence
   FROM
      [${schema}].[EntityField]
   GROUP BY
      EntityID
),
NumberedRows AS (
   SELECT
      sf.EntityID,
      ISNULL(ms.MaxSequence, 0) + 100000 + sf.Sequence AS Sequence,
      sf.FieldName,
      sf.Description,
      sf.Type,
      sf.Length,
      sf.Precision,
      sf.Scale,
      sf.AllowsNull,
      sf.DefaultValue,
      sf.AutoIncrement,
      IIF(sf.IsVirtual = 1, 0, IIF(sf.FieldName = '${EntityInfo.CreatedAtFieldName}' OR
                                   sf.FieldName = '${EntityInfo.UpdatedAtFieldName}' OR
                                   sf.FieldName = '${EntityInfo.DeletedAtFieldName}' OR
                                   pk.ColumnName IS NOT NULL, 0, 1)) AllowUpdateAPI,
      sf.IsVirtual,
      sf.IsComputed,
      e.RelationshipDefaultDisplayType,
      e.Name EntityName,
      re.ID RelatedEntityID,
      fk.referenced_column RelatedEntityFieldName,
      IIF(sf.FieldName = 'Name', 1, 0) IsNameField,
      IsPrimaryKey = CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END,
      IsUnique = CASE
            WHEN pk.ColumnName IS NOT NULL THEN 1
            WHEN uk.ColumnName IS NOT NULL THEN 1
            ELSE 0
         END,
      ROW_NUMBER() OVER (PARTITION BY sf.EntityID, sf.FieldName ORDER BY (SELECT NULL)) AS rn
   FROM
      [${schema}].[vwSQLColumnsAndEntityFields] sf
   LEFT OUTER JOIN
      MaxSequences ms ON sf.EntityID = ms.EntityID
   LEFT OUTER JOIN
      [${schema}].[Entity] e ON sf.EntityID = e.ID
   LEFT OUTER JOIN
      #__mj__CodeGen__vwForeignKeys fk
      ON sf.FieldName = fk.[column] AND e.BaseTable = fk.[table] AND e.SchemaName = fk.[schema_name]
   LEFT OUTER JOIN
      [${schema}].[Entity] re ON re.BaseTable = fk.referenced_table AND re.SchemaName = fk.[referenced_schema]
   LEFT OUTER JOIN
      #__mj__CodeGen__vwTablePrimaryKeys pk
      ON e.BaseTable = pk.TableName AND sf.FieldName = pk.ColumnName AND e.SchemaName = pk.SchemaName
   LEFT OUTER JOIN
      #__mj__CodeGen__vwTableUniqueKeys uk
      ON e.BaseTable = uk.TableName AND sf.FieldName = uk.ColumnName AND e.SchemaName = uk.SchemaName
   WHERE
      EntityFieldID IS NULL
      ${scopeFilter}
   )
   SELECT *
   FROM NumberedRows
   WHERE rn = 1
   ORDER BY EntityID, Sequence;
`;
    }

    /**
     * Builds the cleanup statements to drop temp tables after the pending fields query.
     */
    private buildPendingFieldsCleanup(): string {
        return `
DROP TABLE #__mj__CodeGen__vwForeignKeys;
DROP TABLE #__mj__CodeGen__vwTablePrimaryKeys;
DROP TABLE #__mj__CodeGen__vwTableUniqueKeys;
`;
    }

    /** @inheritdoc */
    getCheckConstraintsSchemaFilter(excludeSchemas: string[]): string {
        if (!excludeSchemas || excludeSchemas.length === 0) {
            return '';
        }
        const quotedSchemas = excludeSchemas.map(s => `'${s}'`).join(',');
        return ` WHERE SchemaName NOT IN (${quotedSchemas})`;
    }

    /** @inheritdoc */
    getEntitiesWithMissingBaseTablesFilter(): string {
        return ` WHERE VirtualEntity=0`;
    }

    /** @inheritdoc */
    getFixVirtualFieldNullabilitySQL(_mjCoreSchema: string): string {
        return '';
    }

    // ─── METADATA MANAGEMENT: SQL FILE EXECUTION ─────────────────────

    /**
     * Executes a SQL file against SQL Server using the `sqlcmd` command-line utility. Reads
     * connection details (server, port, instance, user, password, database) from the shared
     * `sqlConfig` object. On Windows, converts file paths containing spaces to 8.3 short
     * format to avoid quoting issues with `sqlcmd`. Spawns the process with `QUOTED_IDENTIFIER`
     * enabled (`-I`) and severity threshold 17 (`-V 17`). Optionally adds `-C` for
     * `trustServerCertificate`. Returns `true` on successful execution, `false` on failure.
     */
    async executeSQLFileViaShell(filePath: string): Promise<boolean> {
        try {
            const sql = fs.readFileSync(filePath, 'utf-8');
            if (!sql.trim()) return true;

            const batches = sql
                .split(/^\s*GO\s*$/gim)
                .map(b => b.trim())
                .filter(b => b.length > 0);

            const pool = await MSSQLConnection();

            for (const batch of batches) {
                try {
                    await pool.request().query(batch);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logWarning(`[CodeGen] SQL batch warning in ${path.basename(filePath)}: ${msg.substring(0, 200)}`);
                }
            }

            return true;
        } catch (e) {
            logError(`[CodeGen] Failed to execute SQL file ${filePath}: ${e instanceof Error ? e.message : e}`);
            return false;
        }
    }

}
