import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';
import {
    CodeGenDatabaseProvider,
    CRUDType,
    BaseViewGenerationContext,
    CascadeDeleteContext,
    FullTextSearchResult,
} from './codeGenDatabaseProvider';
import { SQLServerDialect, DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import { sortBySequenceAndCreatedAt } from '../Misc/util';

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
    get Dialect(): SQLDialect {
        return ssDialect;
    }

    get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    // ─── DROP GUARDS ─────────────────────────────────────────────────────

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

    generateRootFieldSelect(_entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const rootFieldName = field.Name.endsWith('ID')
            ? field.Name.substring(0, field.Name.length - 2) + 'RootID'
            : field.Name + 'RootID';
        return `${alias}.RootID AS [${rootFieldName}]`;
    }

    generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const classNameFirstChar = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const schemaName = entity.SchemaName;
        const functionName = `fn${entity.BaseTable}${field.Name}_GetRootID`;
        const primaryKey = entity.FirstPrimaryKey.Name;
        return `OUTER APPLY\n    [${schemaName}].[${functionName}]([${classNameFirstChar}].[${primaryKey}], [${classNameFirstChar}].[${field.Name}]) AS ${alias}`;
    }

    // ─── PERMISSIONS ─────────────────────────────────────────────────────

    generateViewPermissions(entity: EntityInfo): string {
        let sOutput = '';
        for (const ep of entity.Permissions) {
            if (ep.RoleSQLName && ep.RoleSQLName.length > 0) {
                sOutput += (sOutput === '' ? `GRANT SELECT ON [${entity.SchemaName}].[${entity.BaseView}] TO ` : ', ') + `[${ep.RoleSQLName}]`;
            }
        }
        return (sOutput === '' ? '' : '\n') + sOutput;
    }

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

    generateTimestampColumns(schema: string, tableName: string): string {
        return `ALTER TABLE [${schema}].[${tableName}] ADD
    [${EntityInfo.CreatedAtFieldName}] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [${EntityInfo.UpdatedAtFieldName}] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE();`;
    }

    // ─── PARAMETER / FIELD HELPERS ───────────────────────────────────────

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

    getViewDefinitionSQL(schema: string, viewName: string): string {
        return `SELECT OBJECT_DEFINITION(OBJECT_ID('[${schema}].[${viewName}]')) AS ViewDefinition`;
    }

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

    getForeignKeyIndexExistsSQL(schema: string, tableName: string, indexName: string): string {
        return `SELECT 1
    FROM sys.indexes
    WHERE name = '${indexName}' 
    AND object_id = OBJECT_ID('[${schema}].[${tableName}]')`;
    }
}
