import { EntityInfo, EntityFieldInfo, EntityPermissionInfo, CodeNameFromString } from '@memberjunction/core';
import {
    CodeGenDatabaseProvider,
    CRUDType,
    BaseViewGenerationContext,
    CascadeDeleteContext,
    FullTextSearchResult,
} from '../../codeGenDatabaseProvider';
import { SQLServerDialect, DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import { logIf, sortBySequenceAndCreatedAt } from '../../../Misc/util';
import { configInfo } from '../../../Config/config';
import { sqlConfig } from '../../../Config/db-connection';
import { logError, logMessage, logWarning } from '../../../Misc/status_logging';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';

const ssDialect = new SQLServerDialect();

/**
 * SQL Server implementation of the CodeGen database provider.
 * Generates SQL Server-native DDL for views, stored procedures, triggers, indexes,
 * full-text search, permissions, and other database objects.
 *
 * This provider extracts the SQL Server-specific generation logic that was previously
 * hardcoded in SQLCodeGenBase, enabling the orchestrator to be database-agnostic.
 */
export class SQLServerCodeGenProvider extends CodeGenDatabaseProvider {
    /** @inheritdoc */
    get Dialect(): SQLDialect {
        return ssDialect;
    }

    /** @inheritdoc */
    get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
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
                preInsertCode = `DECLARE @InsertedRow TABLE ([${firstKey.Name}] UNIQUEIDENTIFIER)
    
    IF @${firstKey.Name} IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${entity.SchemaName}].[${entity.BaseTable}]
            (
                [${firstKey.Name}],
                ${this.generateInsertFieldString(entity, entity.Fields, '', true)}
            )
        OUTPUT INSERTED.[${firstKey.Name}] INTO @InsertedRow
        VALUES
            (
                @${firstKey.Name},
                ${this.generateInsertFieldString(entity, entity.Fields, '@', true)}
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${entity.SchemaName}].[${entity.BaseTable}]
            (
                ${this.generateInsertFieldString(entity, entity.Fields, '', true)}
            )
        OUTPUT INSERTED.[${firstKey.Name}] INTO @InsertedRow
        VALUES
            (
                ${this.generateInsertFieldString(entity, entity.Fields, '@', true)}
            )
    END`;

                additionalFieldList = '';
                additionalValueList = '';
                outputCode = '';
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${firstKey.Name}] = (SELECT [${firstKey.Name}] FROM @InsertedRow)`;
            } else {
                preInsertCode = `DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@${firstKey.Name}, NEWID())`;
                additionalFieldList = ',\n                [' + firstKey.Name + ']';
                additionalValueList = ',\n                @ActualID';
                outputCode = '';
                selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE [${firstKey.Name}] = @ActualID`;
            }
        } else {
            selectInsertedRecord = `SELECT * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE `;
            let isFirst = true;
            for (const k of entity.PrimaryKeys) {
                if (!isFirst) selectInsertedRecord += ' AND ';
                selectInsertedRecord += `[${k.Name}] = @${k.CodeName}`;
                isFirst = false;
            }
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
    ${preInsertCode}${preInsertCode.includes('INSERT INTO') ? '' : `
    INSERT INTO
    [${entity.SchemaName}].[${entity.BaseTable}]
        (
            ${this.generateInsertFieldString(entity, entity.Fields, '')}${additionalFieldList}
        )
    ${outputCode}VALUES
        (
            ${this.generateInsertFieldString(entity, entity.Fields, '@')}${additionalValueList}
        )`}
    -- return the new record from the base view, which might have some calculated fields
    ${selectInsertedRecord}
END
GO
${permissions}
GO
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
        const selectUpdatedRecord = `SELECT
                                        *
                                    FROM
                                        [${entity.SchemaName}].[${entity.BaseView}]
                                    WHERE
                                        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}
                                    `;

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
    UPDATE
        [${entity.SchemaName}].[${entity.BaseTable}]
    SET
        ${this.generateUpdateFieldString(entity.Fields)}
    WHERE
        ${entity.PrimaryKeys.map(k => `[${k.Name}] = @${k.CodeName}`).join(' AND ')}

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact
        SELECT TOP 0 * FROM [${entity.SchemaName}].[${entity.BaseView}] WHERE 1=0
    ELSE
        -- Return the updated record
        ${selectUpdatedRecord}
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
${deleteCode}        AND ${EntityInfo.DeletedAtFieldName} IS NULL -- don't update if already soft-deleted`;
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
        SELECT ${sNullSelect} -- Return NULL for all PKs to indicate no record was deleted
    ELSE
        SELECT ${sSelect} -- Return the PK values to indicate successful deletion
END
GO
${permissions}
GO
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
            : 'MJ_FullTextCatalog';

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
        const rootFieldName = field.Name.endsWith('ID')
            ? field.Name.substring(0, field.Name.length - 2) + 'RootID'
            : field.Name + 'RootID';
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
        return sOutput;
    }

    /** @inheritdoc */
    generateFullTextSearchPermissions(entity: EntityInfo, functionName: string): string {
        let sOutput = '';
        for (const ep of entity.Permissions) {
            if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                sOutput += (sOutput === '' ? `GRANT SELECT ON [${entity.SchemaName}].[${functionName}] TO ` : ', ') + `[${ep.RoleSQLName}]`;
            }
        }
        return sOutput;
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
        const pkComponents = this.buildPrimaryKeyComponents(relatedEntity);
        const variablePrefix = `${relatedEntity.CodeName}_${fkField.CodeName}`;
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
        const cursorName = `cascade_${relatedEntity.CodeName}_${fkField.CodeName}_cursor`;

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
    private buildUpdateCursorParameters(entity: EntityInfo, _fkField: EntityFieldInfo, prefix: string = ''): {
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
                // Use named parameters: @ParamName = @VariableValue
                allParams += `@${ef.CodeName} = @${varPrefix}_${ef.CodeName}`;
            }
        }

        return { declarations, selectFields, fetchInto, allParams };
    }

    // ─── TIMESTAMP COLUMNS ───────────────────────────────────────────────

    /** @inheritdoc */
    generateTimestampColumns(schema: string, tableName: string): string {
        return `ALTER TABLE [${schema}].[${tableName}] ADD
    [${EntityInfo.CreatedAtFieldName}] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [${EntityInfo.UpdatedAtFieldName}] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE();`;
    }

    // ─── PARAMETER / FIELD HELPERS ───────────────────────────────────────

    /**
     * Builds the SQL Server parameter declaration list for a CRUD stored procedure.
     * Produces `@ParamName TYPE` entries separated by commas. Filters fields based on
     * update/create context: includes primary keys only on updates (or non-auto-increment
     * creates), excludes virtual and special date fields, and adds `= NULL` default values
     * for optional primary keys on create and for non-nullable fields with database defaults.
     */
    generateCRUDParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        let sOutput = '';
        let isFirst = true;
        for (const ef of entityFields) {
            const autoGeneratedPrimaryKey = ef.AutoIncrement;
            if (
                (ef.AllowUpdateAPI || (ef.IsPrimaryKey && isUpdate) || (ef.IsPrimaryKey && !autoGeneratedPrimaryKey && !isUpdate)) &&
                !ef.IsVirtual &&
                (!ef.IsPrimaryKey || !autoGeneratedPrimaryKey || isUpdate) &&
                !ef.IsSpecialDateField
            ) {
                if (!isFirst) sOutput += ',\n    ';
                else isFirst = false;

                let defaultParamValue = '';
                if (!isUpdate && ef.IsPrimaryKey && !ef.AutoIncrement) {
                    defaultParamValue = ' = NULL';
                } else if (!isUpdate && ef.HasDefaultValue && !ef.AllowsNull) {
                    defaultParamValue = ' = NULL';
                }
                sOutput += `@${ef.CodeName} ${ef.SQLFullType}${defaultParamValue}`;
            }
        }
        return sOutput;
    }

    /**
     * Generates either the column-name list or the value-expression list for an INSERT
     * statement, depending on the `prefix` parameter:
     *
     * - **Empty prefix** (`''`): Produces bracketed column names (e.g., `[Name], [Email]`).
     * - **`'@'` prefix**: Produces parameter references with smart default handling:
     *   - Special date fields emit `GETUTCDATE()` for created/updated-at, `NULL` for deleted-at.
     *   - UNIQUEIDENTIFIER fields with defaults use a `CASE` expression that detects the
     *     empty GUID sentinel (`00000000-...`) and falls back to the database default.
     *   - Other non-nullable fields with defaults are wrapped in `ISNULL(@Param, default)`.
     *
     * Skips auto-increment, virtual, and non-updatable fields. Optionally excludes the
     * primary key column (used by the two-branch GUID insert pattern in `generateCRUDCreate`).
     */
    generateInsertFieldString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string, excludePrimaryKey: boolean = false): string {
        const autoGeneratedPrimaryKey = entity.FirstPrimaryKey.AutoIncrement;
        let sOutput = '';
        let isFirst = true;
        for (const ef of entityFields) {
            if (
                (excludePrimaryKey && ef.IsPrimaryKey) ||
                (ef.IsPrimaryKey && autoGeneratedPrimaryKey) ||
                ef.IsVirtual ||
                !ef.AllowUpdateAPI ||
                ef.AutoIncrement
            ) {
                continue;
            }

            if (!isFirst) sOutput += ',\n                ';
            else isFirst = false;

            if (prefix !== '' && ef.IsSpecialDateField) {
                if (ef.IsCreatedAtField || ef.IsUpdatedAtField)
                    sOutput += `GETUTCDATE()`;
                else
                    sOutput += `NULL`;
            } else if (prefix && prefix !== '' && !ef.IsPrimaryKey && ef.IsUniqueIdentifier && ef.HasDefaultValue && !ef.AllowsNull) {
                const formattedDefault = this.formatDefaultValue(ef.DefaultValue, ef.NeedsQuotes);
                sOutput += `CASE @${ef.CodeName} WHEN '00000000-0000-0000-0000-000000000000' THEN ${formattedDefault} ELSE ISNULL(@${ef.CodeName}, ${formattedDefault}) END`;
            } else {
                let sVal = '';
                if (!prefix || prefix.length === 0) {
                    sVal = '[' + ef.Name + ']';
                } else {
                    sVal = prefix + ef.CodeName;
                    if (ef.HasDefaultValue && !ef.AllowsNull) {
                        const formattedDefault = this.formatDefaultValue(ef.DefaultValue, ef.NeedsQuotes);
                        if (ef.IsUniqueIdentifier) {
                            sVal = `CASE ${sVal} WHEN '00000000-0000-0000-0000-000000000000' THEN ${formattedDefault} ELSE ISNULL(${sVal}, ${formattedDefault}) END`;
                        } else {
                            sVal = `ISNULL(${sVal}, ${formattedDefault})`;
                        }
                    }
                }
                sOutput += sVal;
            }
        }
        return sOutput;
    }

    /** @inheritdoc */
    generateUpdateFieldString(entityFields: EntityFieldInfo[]): string {
        let sOutput = '';
        let isFirst = true;
        for (const ef of entityFields) {
            if (
                !ef.IsPrimaryKey &&
                !ef.IsVirtual &&
                ef.AllowUpdateAPI &&
                !ef.AutoIncrement &&
                !ef.IsSpecialDateField
            ) {
                if (!isFirst) sOutput += ',\n        ';
                else isFirst = false;
                sOutput += `[${ef.Name}] = @${ef.CodeName}`;
            }
        }
        return sOutput;
    }

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
        return `ALTER TABLE [${schema}].[${tableName}] ADD ${columnName} ${dataType} ${nullClause}${defaultClause}`;
    }

    /** @inheritdoc */
    alterColumnTypeAndNullabilitySQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean): string {
        const nullClause = nullable ? 'NULL' : 'NOT NULL';
        return `ALTER TABLE [${schema}].[${tableName}] ALTER COLUMN ${columnName} ${dataType} ${nullClause}`;
    }

    /** @inheritdoc */
    addDefaultConstraintSQL(schema: string, tableName: string, columnName: string, defaultExpression: string): string {
        const constraintName = `DF_${schema}_${CodeNameFromString(tableName)}_${columnName}`;
        return `ALTER TABLE [${schema}].[${tableName}] ADD CONSTRAINT ${constraintName} DEFAULT ${defaultExpression} FOR [${columnName}]`;
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
    getPendingEntityFieldsSQL(mjCoreSchema: string): string {
        return this.buildPendingFieldsTempTables(mjCoreSchema) +
            this.buildPendingFieldsMainQuery(mjCoreSchema) +
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
    private buildPendingFieldsMainQuery(schema: string): string {
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
            this.validateSqlConfig();
            const serverSpec = this.buildServerSpec();
            const absoluteFilePath = this.resolveAndShortPathConvert(filePath);
            const args = this.buildSqlcmdArgs(serverSpec, absoluteFilePath);
            return await this.spawnSqlcmd(args, filePath);
        } catch (e) {
            this.logSqlcmdError(e);
            return false;
        }
    }

    /**
     * Validates that required SQL Server connection configuration is present.
     */
    private validateSqlConfig(): void {
        if (sqlConfig.user === undefined || sqlConfig.password === undefined || sqlConfig.database === undefined) {
            throw new Error('SQL Server user, password, and database must be provided in the configuration');
        }
    }

    /**
     * Builds the server specification string for sqlcmd (server[,port][\instance]).
     */
    private buildServerSpec(): string {
        let serverSpec = sqlConfig.server;
        if (sqlConfig.port) {
            serverSpec += `,${sqlConfig.port}`;
        }
        if (sqlConfig.options?.instanceName) {
            serverSpec += `\\${sqlConfig.options.instanceName}`;
        }
        return serverSpec;
    }

    /**
     * Resolves the file path to absolute and converts to 8.3 short path on Windows if needed.
     */
    private resolveAndShortPathConvert(filePath: string): string {
        const cwd = path.resolve(process.cwd());
        let absoluteFilePath = path.resolve(cwd, filePath);

        const isWindows = process.platform === 'win32';
        if (isWindows && absoluteFilePath.includes(' ')) {
            absoluteFilePath = this.tryConvertToShortPath(absoluteFilePath);
        }
        return absoluteFilePath;
    }

    /**
     * Attempts to convert a Windows path to 8.3 short format to avoid quoting issues.
     */
    private tryConvertToShortPath(absoluteFilePath: string): string {
        try {
            const result = execSync(`for %I in ("${absoluteFilePath}") do @echo %~sI`, {
                encoding: 'utf8',
                shell: 'cmd.exe'
            }).trim();
            if (result && !result.includes('ERROR') && !result.includes('%~sI')) {
                logIf(configInfo.verboseOutput, `Converted path to short format: ${result}`);
                return result;
            }
        } catch (e) {
            logIf(configInfo.verboseOutput, `Could not convert to short path, using original: ${e}`);
        }
        return absoluteFilePath;
    }

    /**
     * Builds the argument array for the sqlcmd CLI tool.
     */
    private buildSqlcmdArgs(serverSpec: string, absoluteFilePath: string): string[] {
        const args = [
            '-S', serverSpec,
            '-U', sqlConfig.user!,
            '-P', sqlConfig.password!,
            '-d', sqlConfig.database!,
            '-I',       // Enable QUOTED_IDENTIFIER
            '-V', '17', // Only fail on severity >= 17
            '-i', absoluteFilePath
        ];
        if (sqlConfig.options?.trustServerCertificate) {
            args.push('-C');
        }
        return args;
    }

    /**
     * Spawns the sqlcmd process and waits for completion.
     */
    private async spawnSqlcmd(args: string[], filePath: string): Promise<boolean> {
        logIf(
            configInfo.verboseOutput,
            `Executing SQL file: ${filePath} as ${sqlConfig.user}@${sqlConfig.server}:${sqlConfig.port}/${sqlConfig.database}`
        );
        const isWindows = process.platform === 'win32';
        const sqlcmdCommand = isWindows ? 'sqlcmd.exe' : 'sqlcmd';

        const spawnOptions: Record<string, unknown> = { shell: false };
        if (isWindows) {
            spawnOptions['windowsVerbatimArguments'] = true;
        }

        const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            const child = spawn(sqlcmdCommand, args, spawnOptions as Parameters<typeof spawn>[2]);
            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
            child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
            child.on('error', (error: Error) => { reject(error); });
            child.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    const error = new Error(`sqlcmd exited with code ${code}`);
                    Object.assign(error, { stdout, stderr, code });
                    reject(error);
                }
            });
        });

        if (result.stdout && result.stdout.trim().length > 0) {
            logWarning(`SQL Server message: ${result.stdout.trim()}`);
        }
        if (result.stderr && result.stderr.trim().length > 0) {
            logWarning(`SQL Server stderr: ${result.stderr.trim()}`);
        }
        return true;
    }

    /**
     * Logs a sqlcmd execution error, masking the password in the output.
     */
    private logSqlcmdError(e: unknown): void {
        const errRecord = e as Record<string, unknown>;
        let message = (e instanceof Error) ? e.message : String(e);

        if (errRecord['stdout']) {
            message += `\n SQL Server message: ${errRecord['stdout']}`;
        }
        if (errRecord['stderr']) {
            message += `\n SQL Server error: ${errRecord['stderr']}`;
        }

        const errorMessage = sqlConfig.password
            ? message.replace(sqlConfig.password, 'XXXXX')
            : message;
        logError('Error executing batch SQL file: ' + errorMessage);
    }
}
