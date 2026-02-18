import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';
import {
    CodeGenDatabaseProvider,
    CRUDType,
    BaseViewGenerationContext,
    CascadeDeleteContext,
    FullTextSearchResult,
} from '@memberjunction/codegen-lib';
import { PostgreSQLDialect, DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

const pgDialect = new PostgreSQLDialect();

/**
 * PostgreSQL implementation of the CodeGen database provider.
 * Generates PostgreSQL-native DDL for views, CRUD functions, triggers, indexes,
 * full-text search, permissions, and other database objects.
 */
export class PostgreSQLCodeGenProvider extends CodeGenDatabaseProvider {
    get Dialect(): SQLDialect {
        return pgDialect;
    }

    get PlatformKey(): DatabasePlatform {
        return 'postgresql';
    }

    // ─── DROP GUARDS ─────────────────────────────────────────────────────

    generateDropGuard(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER', schema: string, name: string): string {
        // PostgreSQL uses CREATE OR REPLACE for views and functions, so we mostly
        // just need DROP IF EXISTS for procedures and triggers
        switch (objectType) {
            case 'VIEW':
                return `DROP VIEW IF EXISTS ${pgDialect.QuoteSchema(schema, name)} CASCADE;`;
            case 'FUNCTION':
                return `DROP FUNCTION IF EXISTS ${pgDialect.QuoteSchema(schema, name)} CASCADE;`;
            case 'PROCEDURE':
                return `DROP PROCEDURE IF EXISTS ${pgDialect.QuoteSchema(schema, name)} CASCADE;`;
            case 'TRIGGER':
                // Triggers need table context, but for the guard alone we use the name
                return `-- Trigger ${name} will be dropped via CREATE OR REPLACE on the function`;
            default:
                return `-- Unknown object type: ${objectType}`;
        }
    }

    // ─── BASE VIEWS ──────────────────────────────────────────────────────

    generateBaseView(context: BaseViewGenerationContext): string {
        const { entity } = context;
        const viewName = this.getBaseViewName(entity);
        const alias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const whereClause = this.buildSoftDeleteWhereClause(entity, alias);
        const permissions = this.generateViewPermissions(entity);

        const selectParts = this.buildBaseViewSelectParts(context, alias);
        const fromParts = this.buildBaseViewFromParts(context, entity, alias);

        return `
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      ${entity.Name}
-----               SCHEMA:      ${entity.SchemaName}
-----               BASE TABLE:  ${entity.BaseTable}
-----               PRIMARY KEY: ${entity.PrimaryKeys.map((pk: EntityFieldInfo) => pk.Name).join(', ')}
------------------------------------------------------------
CREATE OR REPLACE VIEW ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
AS
SELECT
    ${selectParts}
FROM
    ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} AS ${alias}${fromParts}
${whereClause};
${permissions}
`;
    }

    // ─── CRUD CREATE ─────────────────────────────────────────────────────

    generateCRUDCreate(entity: EntityInfo): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Create);
        const viewName = this.getBaseViewName(entity);
        const paramString = this.generateCRUDParamString(entity.Fields, false);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Create);

        const insertColumns = this.generateInsertFieldString(entity, entity.Fields, '', false);
        const insertValues = this.generateInsertFieldString(entity, entity.Fields, 'p_', false);
        const firstKey = entity.FirstPrimaryKey;

        const { preInsert, returningClause, selectClause } = this.buildCreateInsertStrategy(
            entity, firstKey, insertColumns, insertValues
        );

        return `
------------------------------------------------------------
----- CREATE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramString}
) RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} AS $$
DECLARE
    v_new_id ${firstKey.SQLFullType};
BEGIN
    ${preInsert}INSERT INTO ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        (
            ${insertColumns}
        )
    VALUES
        (
            ${insertValues}
        )
    ${returningClause};

    RETURN QUERY
    ${selectClause};
END;
$$ LANGUAGE plpgsql;
${permissions}
`;
    }

    // ─── CRUD UPDATE ─────────────────────────────────────────────────────

    generateCRUDUpdate(entity: EntityInfo): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Update);
        const viewName = this.getBaseViewName(entity);
        const paramString = this.generateCRUDParamString(entity.Fields, true);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Update);
        const updateFields = this.generateUpdateFieldString(entity.Fields);
        const whereClause = this.buildPrimaryKeyWhereClause(entity, 'p_');
        const selectWhereClause = this.buildPrimaryKeyWhereClause(entity, 'p_');

        const trigger = this.generateTimestampTrigger(entity);

        return `
------------------------------------------------------------
----- UPDATE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramString}
) RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
    SET
        ${updateFields}
    WHERE
        ${whereClause};

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}
    WHERE ${selectWhereClause};
END;
$$ LANGUAGE plpgsql;
${permissions}

${trigger}
`;
    }

    // ─── CRUD DELETE ─────────────────────────────────────────────────────

    generateCRUDDelete(entity: EntityInfo, cascadeSQL: string): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Delete);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Delete);

        const { paramDecl, deleteBody, returnType, returnStatement } = this.buildDeleteStrategy(entity, cascadeSQL);

        return `
------------------------------------------------------------
----- DELETE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramDecl}
) RETURNS ${returnType} AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN
${cascadeSQL}
${deleteBody}

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

${returnStatement}
END;
$$ LANGUAGE plpgsql;
${permissions}
`;
    }

    // ─── TIMESTAMP TRIGGER ───────────────────────────────────────────────

    generateTimestampTrigger(entity: EntityInfo): string {
        const updatedAtField = entity.Fields.find(
            (f: EntityFieldInfo) => f.Name.toLowerCase().trim() === EntityInfo.UpdatedAtFieldName.toLowerCase().trim()
        );
        if (!updatedAtField) return '';

        const trigFnName = `fn_trg_update_${this.toSnakeCase(entity.BaseTableCodeName)}`;
        const trigName = `trg_update_${this.toSnakeCase(entity.BaseTableCodeName)}`;

        return `
------------------------------------------------------------
----- TRIGGER FOR ${EntityInfo.UpdatedAtFieldName} field for the ${entity.BaseTable} table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, trigFnName)}()
RETURNS TRIGGER AS $$
BEGIN
    NEW.${EntityInfo.UpdatedAtFieldName} := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ${pgDialect.QuoteIdentifier(trigName)} ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)};

CREATE TRIGGER ${pgDialect.QuoteIdentifier(trigName)}
BEFORE UPDATE ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
FOR EACH ROW
EXECUTE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, trigFnName)}();
`;
    }

    // ─── INDEXES ─────────────────────────────────────────────────────────

    generateForeignKeyIndexes(entity: EntityInfo): string[] {
        const indexes: string[] = [];
        for (const field of entity.Fields) {
            if (field.RelatedEntityID && !field.IsPrimaryKey && !field.IsVirtual) {
                const indexName = `idx_auto_mj_fkey_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}`;
                // Truncate to 63 chars (PG max identifier length)
                const truncatedName = indexName.length > 63 ? indexName.substring(0, 63) : indexName;
                indexes.push(
                    `CREATE INDEX IF NOT EXISTS ${pgDialect.QuoteIdentifier(truncatedName)}\n` +
                    `    ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} (${pgDialect.QuoteIdentifier(field.Name)});`
                );
            }
        }
        return indexes;
    }

    // ─── FULL-TEXT SEARCH ────────────────────────────────────────────────

    generateFullTextSearch(entity: EntityInfo, searchFields: EntityFieldInfo[], _primaryKeyIndexName: string): FullTextSearchResult {
        const ftsColName = '__mj_fts_vector';
        const trigName = `trg_fts_${this.toSnakeCase(entity.BaseTable)}`;
        const indexName = `idx_fts_${this.toSnakeCase(entity.BaseTable)}`;
        const fnName = `fn_search_${this.toSnakeCase(entity.BaseTable)}`;
        const viewName = this.getBaseViewName(entity);

        const fieldNames = searchFields.map((f: EntityFieldInfo) => pgDialect.QuoteIdentifier(f.Name));
        const fieldList = fieldNames.join(', ');

        const sql = `
------------------------------------------------------------
----- FULL-TEXT SEARCH FOR ${entity.BaseTable}
------------------------------------------------------------
-- Add tsvector column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${entity.SchemaName}'
        AND table_name = '${entity.BaseTable}'
        AND column_name = '${ftsColName}'
    ) THEN
        ALTER TABLE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        ADD COLUMN ${ftsColName} TSVECTOR;
    END IF;
END $$;

-- Create trigger to keep tsvector updated
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, `fn_${trigName}`)}()
RETURNS TRIGGER AS $$
BEGIN
    NEW.${ftsColName} := to_tsvector('english', ${fieldNames.map((n: string) => `COALESCE(NEW.${n}::TEXT, '')`).join(" || ' ' || ")});
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ${pgDialect.QuoteIdentifier(trigName)} ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)};

CREATE TRIGGER ${pgDialect.QuoteIdentifier(trigName)}
BEFORE INSERT OR UPDATE OF ${fieldList}
ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
FOR EACH ROW
EXECUTE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, `fn_${trigName}`)}();

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS ${pgDialect.QuoteIdentifier(indexName)}
    ON ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} USING GIN(${ftsColName});

-- Create search function
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    p_search_term TEXT
) RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} AS $$
    SELECT v.*
    FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} v
    JOIN ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} t
        ON ${entity.PrimaryKeys.map((pk: EntityFieldInfo) => `v.${pgDialect.QuoteIdentifier(pk.Name)} = t.${pgDialect.QuoteIdentifier(pk.Name)}`).join(' AND ')}
    WHERE t.${ftsColName} @@ plainto_tsquery('english', p_search_term);
$$ LANGUAGE sql STABLE;

-- Backfill existing rows
UPDATE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
SET ${ftsColName} = to_tsvector('english', ${fieldNames.map((n: string) => `COALESCE(${n}::TEXT, '')`).join(" || ' ' || ")})
WHERE ${ftsColName} IS NULL;
`;

        return { sql, functionName: fnName };
    }

    // ─── RECURSIVE ROOT ID FUNCTIONS ─────────────────────────────────────

    generateRootIDFunction(entity: EntityInfo, field: EntityFieldInfo): string {
        const primaryKey = entity.FirstPrimaryKey.Name;
        const primaryKeyType = this.mapSQLType(entity.FirstPrimaryKey.SQLFullType);
        const fieldName = field.Name;
        const fnName = `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(fieldName)}_get_root_id`;

        return `
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ${entity.BaseTable}.${fieldName}
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    p_record_id ${primaryKeyType},
    p_parent_id ${primaryKeyType}
) RETURNS ${primaryKeyType} AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            ${pgDialect.QuoteIdentifier(primaryKey)},
            ${pgDialect.QuoteIdentifier(fieldName)},
            ${pgDialect.QuoteIdentifier(primaryKey)} AS root_parent_id,
            0 AS depth
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        WHERE
            ${pgDialect.QuoteIdentifier(primaryKey)} = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c.${pgDialect.QuoteIdentifier(primaryKey)},
            c.${pgDialect.QuoteIdentifier(fieldName)},
            c.${pgDialect.QuoteIdentifier(primaryKey)} AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} c
        INNER JOIN
            cte_root_parent p ON c.${pgDialect.QuoteIdentifier(primaryKey)} = p.${pgDialect.QuoteIdentifier(fieldName)}
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE ${pgDialect.QuoteIdentifier(fieldName)} IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;
`;
    }

    generateRootFieldSelect(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        return `${alias}.root_id AS ${pgDialect.QuoteIdentifier(`${field.Name}Root${entity.FirstPrimaryKey.Name}`)}`;
    }

    generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const fnName = `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}_get_root_id`;
        const tableAlias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        return `LEFT JOIN LATERAL (
    SELECT ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(${tableAlias}.${pgDialect.QuoteIdentifier(entity.FirstPrimaryKey.Name)}, ${tableAlias}.${pgDialect.QuoteIdentifier(field.Name)}) AS root_id
) AS ${alias} ON true`;
    }

    // ─── PERMISSIONS ─────────────────────────────────────────────────────

    generateViewPermissions(entity: EntityInfo): string {
        const viewName = this.getBaseViewName(entity);
        const roles = this.collectPermissionRoles(entity.Permissions);
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT SELECT ON ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    generateCRUDPermissions(entity: EntityInfo, routineName: string, type: CRUDType): string {
        const roles: string[] = [];
        for (const ep of entity.Permissions) {
            if (!ep.RoleSQLName || ep.RoleSQLName.length === 0) continue;
            if (
                (type === CRUDType.Create && ep.CanCreate) ||
                (type === CRUDType.Update && ep.CanUpdate) ||
                (type === CRUDType.Delete && ep.CanDelete)
            ) {
                roles.push(ep.RoleSQLName);
            }
        }
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT EXECUTE ON FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, routineName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    generateFullTextSearchPermissions(entity: EntityInfo, functionName: string): string {
        const roles = this.collectPermissionRoles(entity.Permissions);
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT EXECUTE ON FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, functionName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    // ─── CASCADE DELETES ─────────────────────────────────────────────────

    generateSingleCascadeOperation(context: CascadeDeleteContext): string {
        const { parentEntity, relatedEntity, fkField } = context;

        // If FK allows NULL, set it to NULL (update). Otherwise, delete related records.
        if (fkField.AllowsNull) {
            return this.generateCascadeUpdateToNull(parentEntity, relatedEntity, fkField);
        }
        return this.generateCascadeCursorDelete(parentEntity, relatedEntity, fkField);
    }

    // ─── TIMESTAMP COLUMNS ───────────────────────────────────────────────

    generateTimestampColumns(schema: string, tableName: string): string {
        return `
-- Add timestamp columns to ${tableName}
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${tableName}' AND column_name = '__mj_CreatedAt') THEN
        ALTER TABLE ${pgDialect.QuoteSchema(schema, tableName)}
        ADD COLUMN __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${tableName}' AND column_name = '__mj_UpdatedAt') THEN
        ALTER TABLE ${pgDialect.QuoteSchema(schema, tableName)}
        ADD COLUMN __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC');
    END IF;
END $$;
`;
    }

    // ─── PARAMETER / FIELD HELPERS ───────────────────────────────────────

    generateCRUDParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        const parts: string[] = [];
        for (const ef of entityFields) {
            if (!this.shouldIncludeFieldInParams(ef, isUpdate)) continue;

            const paramName = `p_${this.toSnakeCase(ef.CodeName)}`;
            const sqlType = this.mapSQLType(ef.SQLFullType);
            let defaultVal = '';

            if (!isUpdate && ef.IsPrimaryKey && !ef.AutoIncrement) {
                defaultVal = ' DEFAULT NULL';
            } else if (!isUpdate && ef.HasDefaultValue && !ef.AllowsNull) {
                defaultVal = ' DEFAULT NULL';
            }

            parts.push(`${paramName} ${sqlType}${defaultVal}`);
        }
        return parts.join(',\n    ');
    }

    generateInsertFieldString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string, excludePrimaryKey: boolean = false): string {
        const autoGeneratedPrimaryKey = entity.FirstPrimaryKey.AutoIncrement;
        const parts: string[] = [];

        for (const ef of entityFields) {
            if (this.shouldSkipFieldForInsert(ef, autoGeneratedPrimaryKey, excludePrimaryKey)) continue;

            if (prefix !== '' && ef.IsSpecialDateField) {
                parts.push(this.getSpecialDateInsertValue(ef));
            } else if (prefix === '') {
                // Column name side
                parts.push(pgDialect.QuoteIdentifier(ef.Name));
            } else {
                // Parameter value side
                parts.push(this.getParameterInsertValue(ef, prefix));
            }
        }
        return parts.join(',\n            ');
    }

    generateUpdateFieldString(entityFields: EntityFieldInfo[]): string {
        const parts: string[] = [];
        for (const ef of entityFields) {
            if (ef.IsPrimaryKey || ef.IsVirtual || !ef.AllowUpdateAPI || ef.AutoIncrement || ef.IsSpecialDateField) continue;
            parts.push(`${pgDialect.QuoteIdentifier(ef.Name)} = p_${this.toSnakeCase(ef.CodeName)}`);
        }
        return parts.join(',\n        ');
    }

    // ─── ROUTINE NAMING ──────────────────────────────────────────────────

    getCRUDRoutineName(entity: EntityInfo, type: CRUDType): string {
        const snakeTable = this.toSnakeCase(entity.BaseTableCodeName);
        switch (type) {
            case CRUDType.Create:
                return entity.spCreate || `fn_create_${snakeTable}`;
            case CRUDType.Update:
                return entity.spUpdate || `fn_update_${snakeTable}`;
            case CRUDType.Delete:
                return entity.spDelete || `fn_delete_${snakeTable}`;
        }
    }

    // ─── SQL HEADERS ─────────────────────────────────────────────────────

    generateSQLFileHeader(entity: EntityInfo, itemName: string): string {
        return `-- ============================================================
-- PostgreSQL Generated SQL for Entity: ${entity.Name}
-- Item: ${itemName}
-- Generated at: ${new Date().toISOString()}
-- ============================================================
`;
    }

    generateAllEntitiesSQLFileHeader(): string {
        return `-- ============================================================
-- PostgreSQL Generated SQL for All Entities
-- Generated at: ${new Date().toISOString()}
-- ============================================================
`;
    }

    // ─── UTILITY ─────────────────────────────────────────────────────────

    formatDefaultValue(defaultValue: string, needsQuotes: boolean): string {
        if (!defaultValue || defaultValue.trim().length === 0) return 'NULL';

        let trimmedValue = defaultValue.trim();
        const lowerValue = trimmedValue.toLowerCase();

        // Map SQL Server functions to PostgreSQL equivalents
        const functionMap: Record<string, string> = {
            'newid()': 'gen_random_uuid()',
            'newsequentialid()': 'gen_random_uuid()',
            'getdate()': "NOW() AT TIME ZONE 'UTC'",
            'getutcdate()': "NOW() AT TIME ZONE 'UTC'",
            'sysdatetime()': "NOW() AT TIME ZONE 'UTC'",
            'sysdatetimeoffset()': "NOW() AT TIME ZONE 'UTC'",
            'current_timestamp': 'CURRENT_TIMESTAMP',
            'user_name()': 'CURRENT_USER',
            'suser_name()': 'SESSION_USER',
            'system_user': 'CURRENT_USER',
        };

        for (const [sqlFunc, pgFunc] of Object.entries(functionMap)) {
            if (lowerValue.includes(sqlFunc)) {
                return pgFunc;
            }
        }

        // Remove outer parentheses if present
        if (trimmedValue.startsWith('(') && trimmedValue.endsWith(')')) {
            trimmedValue = trimmedValue.substring(1, trimmedValue.length - 1);
        }

        // Remove surrounding quotes for clean value
        let cleanValue = trimmedValue;
        if (cleanValue.startsWith("'") && cleanValue.endsWith("'")) {
            cleanValue = cleanValue.substring(1, cleanValue.length - 1);
        }

        if (needsQuotes) return `'${cleanValue}'`;
        return cleanValue;
    }

    buildPrimaryKeyComponents(entity: EntityInfo, prefix?: string): {
        varDeclarations: string;
        selectFields: string;
        fetchInto: string;
        routineParams: string;
    } {
        const varPrefix = prefix || 'v_related_';
        const varDecls: string[] = [];
        const selectFlds: string[] = [];
        const fetchVars: string[] = [];
        const routineParamParts: string[] = [];

        for (const pk of entity.PrimaryKeys) {
            const varName = `${varPrefix}${this.toSnakeCase(pk.CodeName)}`;
            const sqlType = this.mapSQLType(pk.SQLFullType);

            varDecls.push(`${varName} ${sqlType}`);
            selectFlds.push(pgDialect.QuoteIdentifier(pk.Name));
            fetchVars.push(varName);
            routineParamParts.push(`p_${this.toSnakeCase(pk.CodeName)} := ${varName}`);
        }

        return {
            varDeclarations: varDecls.join(', '),
            selectFields: selectFlds.join(', '),
            fetchInto: fetchVars.join(', '),
            routineParams: routineParamParts.join(', '),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Converts a PascalCase or camelCase string to snake_case.
     * Handles consecutive uppercase letters (e.g., "ID" → "id", "HTMLParser" → "html_parser").
     */
    private toSnakeCase(name: string): string {
        return name
            // Insert underscore between a lowercase letter and an uppercase letter
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            // Insert underscore between consecutive uppercase letters followed by a lowercase letter
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
            .toLowerCase()
            .replace(/__+/g, '_');
    }

    /**
     * Maps a SQL Server type string to its PostgreSQL equivalent.
     */
    private mapSQLType(sqlType: string): string {
        const lower = sqlType.toLowerCase().trim();
        if (lower.startsWith('uniqueidentifier')) return 'UUID';
        if (lower.startsWith('nvarchar(max)') || lower.startsWith('varchar(max)')) return 'TEXT';
        if (lower.startsWith('nvarchar') || lower.startsWith('nchar')) return sqlType.replace(/^n/i, '');
        if (lower === 'bit') return 'BOOLEAN';
        if (lower === 'datetime' || lower === 'datetime2') return 'TIMESTAMP';
        if (lower === 'datetimeoffset') return 'TIMESTAMPTZ';
        if (lower === 'money' || lower === 'smallmoney') return 'NUMERIC(19,4)';
        if (lower === 'tinyint') return 'SMALLINT';
        if (lower.startsWith('image') || lower.startsWith('varbinary')) return 'BYTEA';
        if (lower === 'xml') return 'XML';
        if (lower === 'sql_variant') return 'TEXT';
        return sqlType; // Pass through INT, BIGINT, etc.
    }

    /** Gets the base view name for an entity */
    private getBaseViewName(entity: EntityInfo): string {
        return entity.BaseView || `vw_${this.toSnakeCase(entity.CodeName)}`;
    }

    /** Builds the WHERE clause for soft-delete filtering */
    private buildSoftDeleteWhereClause(entity: EntityInfo, alias: string): string {
        if (entity.DeleteType === 'Soft') {
            return `WHERE\n    ${alias}.${pgDialect.QuoteIdentifier(EntityInfo.DeletedAtFieldName)} IS NULL\n`;
        }
        return '';
    }

    /** Assembles the SELECT parts for a base view */
    private buildBaseViewSelectParts(context: BaseViewGenerationContext, alias: string): string {
        const parts: string[] = [`${alias}.*`];
        if (context.parentFieldsSelect) parts.push(context.parentFieldsSelect);
        if (context.relatedFieldsSelect) parts.push(context.relatedFieldsSelect);
        if (context.rootFieldsSelect) parts.push(context.rootFieldsSelect);
        return parts.join(',\n    ');
    }

    /** Assembles the FROM/JOIN parts for a base view */
    private buildBaseViewFromParts(context: BaseViewGenerationContext, entity: EntityInfo, _alias: string): string {
        const joins: string[] = [];
        if (context.parentJoins) joins.push(context.parentJoins);
        if (context.relatedFieldsJoins) joins.push(context.relatedFieldsJoins);
        if (context.rootJoins) joins.push(context.rootJoins);
        return joins.length > 0 ? '\n' + joins.join('\n') : '';
    }

    /** Determines whether a field should be included in CRUD parameters */
    private shouldIncludeFieldInParams(ef: EntityFieldInfo, isUpdate: boolean): boolean {
        const autoGeneratedPrimaryKey = ef.AutoIncrement;
        return (
            (ef.AllowUpdateAPI || (ef.IsPrimaryKey && isUpdate) || (ef.IsPrimaryKey && !autoGeneratedPrimaryKey && !isUpdate)) &&
            !ef.IsVirtual &&
            (!ef.IsPrimaryKey || !autoGeneratedPrimaryKey || isUpdate) &&
            !ef.IsSpecialDateField
        );
    }

    /** Determines whether a field should be skipped for INSERT */
    private shouldSkipFieldForInsert(ef: EntityFieldInfo, autoGeneratedPrimaryKey: boolean, excludePrimaryKey: boolean): boolean {
        return (
            (excludePrimaryKey && ef.IsPrimaryKey) ||
            (ef.IsPrimaryKey && autoGeneratedPrimaryKey) ||
            ef.IsVirtual ||
            !ef.AllowUpdateAPI ||
            ef.AutoIncrement
        );
    }

    /** Gets the INSERT value for a special date field */
    private getSpecialDateInsertValue(ef: EntityFieldInfo): string {
        if (ef.IsCreatedAtField || ef.IsUpdatedAtField) return "NOW() AT TIME ZONE 'UTC'";
        return 'NULL'; // DeletedAt
    }

    /** Gets the parameter insert value, handling defaults */
    private getParameterInsertValue(ef: EntityFieldInfo, prefix: string): string {
        const paramName = `${prefix}${this.toSnakeCase(ef.CodeName)}`;

        if (ef.HasDefaultValue && !ef.AllowsNull) {
            const formattedDefault = this.formatDefaultValue(ef.DefaultValue, ef.NeedsQuotes);
            if (ef.IsUniqueIdentifier) {
                return `CASE WHEN ${paramName} = '00000000-0000-0000-0000-000000000000'::UUID THEN ${formattedDefault} ELSE COALESCE(${paramName}, ${formattedDefault}) END`;
            }
            return `COALESCE(${paramName}, ${formattedDefault})`;
        }
        return paramName;
    }

    /** Builds a WHERE clause using primary key fields with a parameter prefix */
    private buildPrimaryKeyWhereClause(entity: EntityInfo, prefix: string): string {
        return entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} = ${prefix}${this.toSnakeCase(k.CodeName)}`
        ).join(' AND ');
    }

    /** Builds the INSERT strategy for CREATE function based on PK type */
    private buildCreateInsertStrategy(
        entity: EntityInfo,
        firstKey: EntityFieldInfo,
        _insertColumns: string,
        _insertValues: string
    ): { preInsert: string; returningClause: string; selectClause: string } {
        const viewName = this.getBaseViewName(entity);

        if (firstKey.AutoIncrement) {
            return {
                preInsert: '',
                returningClause: `RETURNING ${pgDialect.QuoteIdentifier(firstKey.Name)} INTO v_new_id`,
                selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${pgDialect.QuoteIdentifier(firstKey.Name)} = v_new_id`,
            };
        }

        if (firstKey.Type.toLowerCase().trim() === 'uniqueidentifier' && entity.PrimaryKeys.length === 1) {
            const paramName = `p_${this.toSnakeCase(firstKey.CodeName)}`;
            return {
                preInsert: `v_new_id := COALESCE(${paramName}, gen_random_uuid());\n    `,
                returningClause: `RETURNING ${pgDialect.QuoteIdentifier(firstKey.Name)} INTO v_new_id`,
                selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${pgDialect.QuoteIdentifier(firstKey.Name)} = v_new_id`,
            };
        }

        // Composite keys or non-auto, non-UUID PKs
        const selectWhere = entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} = p_${this.toSnakeCase(k.CodeName)}`
        ).join(' AND ');

        return {
            preInsert: '',
            returningClause: '',
            selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${selectWhere}`,
        };
    }

    /** Builds the DELETE body and return type based on entity delete type */
    private buildDeleteStrategy(entity: EntityInfo, cascadeSQL: string): {
        paramDecl: string;
        deleteBody: string;
        returnType: string;
        returnStatement: string;
    } {
        const paramParts: string[] = [];
        const selectParts: string[] = [];
        const nullParts: string[] = [];

        for (const k of entity.PrimaryKeys) {
            const paramName = `p_${this.toSnakeCase(k.CodeName)}`;
            paramParts.push(`${paramName} ${this.mapSQLType(k.SQLFullType)}`);
            selectParts.push(`${paramName} AS ${pgDialect.QuoteIdentifier(k.Name)}`);
            nullParts.push(`NULL::${this.mapSQLType(k.SQLFullType)} AS ${pgDialect.QuoteIdentifier(k.Name)}`);
        }

        const whereClause = entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} = p_${this.toSnakeCase(k.CodeName)}`
        ).join(' AND ');

        let deleteBody: string;
        if (entity.DeleteType === 'Hard') {
            deleteBody = `    DELETE FROM ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}\n    WHERE ${whereClause};`;
        } else {
            deleteBody = `    UPDATE ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
    SET ${pgDialect.QuoteIdentifier(EntityInfo.DeletedAtFieldName)} = NOW() AT TIME ZONE 'UTC'
    WHERE ${whereClause}
        AND ${pgDialect.QuoteIdentifier(EntityInfo.DeletedAtFieldName)} IS NULL;`;
        }

        // Return type is a TABLE with PK columns
        const returnCols = entity.PrimaryKeys.map((k: EntityFieldInfo) =>
            `${pgDialect.QuoteIdentifier(k.Name)} ${this.mapSQLType(k.SQLFullType)}`
        ).join(', ');

        const returnStatement = `    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT ${nullParts.join(', ')};
    ELSE
        RETURN QUERY SELECT ${selectParts.join(', ')};
    END IF;`;

        return {
            paramDecl: paramParts.join(',\n    '),
            deleteBody,
            returnType: `TABLE(${returnCols})`,
            returnStatement,
        };
    }

    /** Generates cascade update-to-NULL SQL for nullable FK */
    private generateCascadeUpdateToNull(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo): string {
        if (!relatedEntity.AllowUpdateAPI) {
            return `    -- WARNING: Cannot cascade update ${relatedEntity.Name}.${fkField.Name} to NULL - entity does not allow updates`;
        }

        const updateFnName = this.getCRUDRoutineName(relatedEntity, CRUDType.Update);
        const whereClause = `${pgDialect.QuoteIdentifier(fkField.Name)} = p_${this.toSnakeCase(parentEntity.FirstPrimaryKey.CodeName)}`;

        return `    -- Cascade: Set ${relatedEntity.Name}.${fkField.Name} to NULL
    FOR v_rec IN
        SELECT ${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => pgDialect.QuoteIdentifier(pk.Name)).join(', ')}
        FROM ${pgDialect.QuoteSchema(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        WHERE ${whereClause}
    LOOP
        -- Update related record to set FK to NULL
        UPDATE ${pgDialect.QuoteSchema(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        SET ${pgDialect.QuoteIdentifier(fkField.Name)} = NULL
        WHERE ${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => `${pgDialect.QuoteIdentifier(pk.Name)} = v_rec.${pgDialect.QuoteIdentifier(pk.Name)}`).join(' AND ')};
    END LOOP;
`;
    }

    /** Generates cascade cursor-based DELETE SQL for non-nullable FK */
    private generateCascadeCursorDelete(parentEntity: EntityInfo, relatedEntity: EntityInfo, fkField: EntityFieldInfo): string {
        if (!relatedEntity.AllowDeleteAPI) {
            return `    -- WARNING: Cannot cascade delete ${relatedEntity.Name} records - entity does not allow deletes`;
        }

        const deleteFnName = this.getCRUDRoutineName(relatedEntity, CRUDType.Delete);
        const whereClause = `${pgDialect.QuoteIdentifier(fkField.Name)} = p_${this.toSnakeCase(parentEntity.FirstPrimaryKey.CodeName)}`;

        return `    -- Cascade: Delete ${relatedEntity.Name} records via ${fkField.Name}
    FOR v_rec IN
        SELECT ${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => pgDialect.QuoteIdentifier(pk.Name)).join(', ')}
        FROM ${pgDialect.QuoteSchema(relatedEntity.SchemaName, relatedEntity.BaseTable)}
        WHERE ${whereClause}
    LOOP
        PERFORM ${pgDialect.QuoteSchema(relatedEntity.SchemaName, deleteFnName)}(${relatedEntity.PrimaryKeys.map((pk: EntityFieldInfo) => `v_rec.${pgDialect.QuoteIdentifier(pk.Name)}`).join(', ')});
    END LOOP;
`;
    }

    /** Collects unique role SQL names from permissions that have a role name */
    private collectPermissionRoles(permissions: EntityPermissionInfo[]): string[] {
        const roles: string[] = [];
        for (const ep of permissions) {
            if (ep.RoleSQLName && ep.RoleSQLName.length > 0 && !roles.includes(ep.RoleSQLName)) {
                roles.push(ep.RoleSQLName);
            }
        }
        return roles;
    }
}
