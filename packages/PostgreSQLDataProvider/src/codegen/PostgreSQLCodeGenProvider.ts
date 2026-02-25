import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    CodeGenDatabaseProvider,
    CRUDType,
    BaseViewGenerationContext,
    CascadeDeleteContext,
    FullTextSearchResult,
    configInfo,
    logError,
    logWarning,
    logIf,
} from '@memberjunction/codegen-lib';
import { PostgreSQLDialect, DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import { spawn } from 'child_process';
import path from 'path';

const pgDialect = new PostgreSQLDialect();

/**
 * PostgreSQL implementation of the CodeGen database provider.
 * Generates PostgreSQL-native DDL for views, CRUD functions, triggers, indexes,
 * full-text search, permissions, and other database objects.
 */
@RegisterClass(CodeGenDatabaseProvider, 'PostgreSQLCodeGenProvider')
export class PostgreSQLCodeGenProvider extends CodeGenDatabaseProvider {
    /** @inheritdoc */
    get Dialect(): SQLDialect {
        return pgDialect;
    }

    /** @inheritdoc */
    get PlatformKey(): DatabasePlatform {
        return 'postgresql';
    }

    // ─── DROP GUARDS ─────────────────────────────────────────────────────

    /**
     * Generates a PostgreSQL `DROP ... IF EXISTS ... CASCADE` statement as a guard before
     * creating or replacing a database object. For triggers, PostgreSQL relies on
     * `CREATE OR REPLACE` on the trigger function, so a comment is emitted instead.
     */
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

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE VIEW` statement for an entity's base view.
     * Includes all base table columns, parent/related field joins, and root field lateral
     * joins. Applies a soft-delete `WHERE` filter when the entity uses soft deletes.
     */
    generateBaseView(context: BaseViewGenerationContext): string {
        const { entity } = context;
        const viewName = this.getBaseViewName(entity);
        const alias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const whereClause = this.buildSoftDeleteWhereClause(entity, alias);

        const selectParts = this.buildBaseViewSelectParts(context, alias);
        const fromParts = this.buildBaseViewFromParts(context, entity, alias);

        // Permissions are handled separately by sql_codegen.ts via generateViewPermissions()
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
`;
    }

    // ─── CRUD CREATE ─────────────────────────────────────────────────────

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE FUNCTION` for inserting a new record.
     * The function accepts typed parameters for each writable field, performs an `INSERT`
     * into the base table, and returns the newly created row from the base view via
     * `RETURN QUERY SELECT`. Handles auto-increment PKs (using `RETURNING ... INTO`),
     * UUID PKs (with `COALESCE` to gen_random_uuid()), and composite PKs. Also emits
     * `GRANT EXECUTE` permissions for authorized roles.
     */
    generateCRUDCreate(entity: EntityInfo): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Create);
        const viewName = this.getBaseViewName(entity);
        const paramString = this.generateCRUDParamString(entity.Fields, false);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Create);

        const insertColumns = this.generateInsertFieldString(entity, entity.Fields, '', false);
        const insertValues = this.generateInsertFieldString(entity, entity.Fields, 'p_', false);
        const firstKey = entity.FirstPrimaryKey;

        const strategy = this.buildCreateInsertStrategy(
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
    ${strategy.preInsert}INSERT INTO ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)}
        (
            ${strategy.finalColumns}
        )
    VALUES
        (
            ${strategy.finalValues}
        )
    ${strategy.returningClause};

    RETURN QUERY
    ${strategy.selectClause};
END;
$$ LANGUAGE plpgsql;
${permissions}
`;
    }

    // ─── CRUD UPDATE ─────────────────────────────────────────────────────

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE FUNCTION` for updating an existing record.
     * The function accepts typed parameters for all updatable fields plus primary key(s),
     * performs an `UPDATE ... SET ... WHERE PK = param`, checks `ROW_COUNT` to detect
     * missing rows, and returns the updated record from the base view via `RETURN QUERY
     * SELECT`. Also generates the `__mj_UpdatedAt` timestamp trigger for the entity
     * and emits `GRANT EXECUTE` permissions.
     */
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

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE FUNCTION` for deleting a record.
     * Supports both hard deletes (`DELETE FROM`) and soft deletes (`UPDATE ... SET
     * __mj_DeletedAt`). Prepends any cascade SQL for dependent records, uses
     * `#variable_conflict use_column` to avoid PL/pgSQL naming conflicts, and returns
     * the affected primary key(s) or NULLs if no row was found. Emits `GRANT EXECUTE`
     * permissions for authorized roles.
     */
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

    /**
     * Generates a PL/pgSQL trigger function and a `BEFORE UPDATE` trigger that
     * automatically sets the `__mj_UpdatedAt` column to the current UTC time on every
     * row update. Uses `CREATE OR REPLACE FUNCTION` for the trigger function and
     * `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` for idempotent trigger creation.
     * Returns an empty string if the entity has no `__mj_UpdatedAt` field.
     */
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

    /**
     * Generates `CREATE INDEX IF NOT EXISTS` statements for each foreign key column
     * on the entity's base table. Index names follow the `idx_auto_mj_fkey_<table>_<column>`
     * convention and are truncated to 63 characters (PostgreSQL's maximum identifier length).
     * Skips primary key columns and virtual fields.
     */
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

    /**
     * Generates a complete PostgreSQL full-text search infrastructure for an entity.
     * This includes:
     * 1. A `tsvector` column (`__mj_fts_vector`) added via conditional `ALTER TABLE`
     * 2. A PL/pgSQL trigger function that concatenates search fields into a `tsvector`
     * 3. A `BEFORE INSERT OR UPDATE` trigger to keep the vector column in sync
     * 4. A GIN index on the `tsvector` column for fast lookups
     * 5. A SQL `STABLE` search function that joins the base view with a `plainto_tsquery` match
     * 6. A backfill `UPDATE` to populate existing rows where the vector is NULL
     *
     * @returns A {@link FullTextSearchResult} with the generated SQL and the search function name.
     */
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

    /**
     * Generates a PostgreSQL SQL `STABLE` function that walks a self-referencing hierarchy
     * (e.g., ParentCategoryID) using a recursive CTE to find the root ancestor record.
     * The CTE starts from `COALESCE(p_parent_id, p_record_id)` as the anchor and follows
     * the parent FK upward, capped at 100 levels to prevent infinite loops. Returns the
     * root record's primary key value.
     */
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

    /** @inheritdoc */
    generateRootFieldSelect(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        // Strip trailing "ID" from the field name before appending "Root" + PK name
        // e.g., ParentCategoryID → ParentCategoryRootID (not ParentCategoryIDRootID)
        // This matches the SQL Server behavior in SQLServerCodeGenProvider
        const rootFieldName = field.Name.endsWith('ID')
            ? field.Name.substring(0, field.Name.length - 2) + 'Root' + entity.FirstPrimaryKey.Name
            : field.Name + 'Root' + entity.FirstPrimaryKey.Name;
        return `${alias}.root_id AS ${pgDialect.QuoteIdentifier(rootFieldName)}`;
    }

    /**
     * Generates a `LEFT JOIN LATERAL` clause that invokes the root ID function for a
     * self-referencing field. PostgreSQL uses `LATERAL` joins (rather than SQL Server's
     * `OUTER APPLY`) to call scalar functions inline within a view definition.
     */
    generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const fnName = `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}_get_root_id`;
        const tableAlias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        return `LEFT JOIN LATERAL (
    SELECT ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(${tableAlias}.${pgDialect.QuoteIdentifier(entity.FirstPrimaryKey.Name)}, ${tableAlias}.${pgDialect.QuoteIdentifier(field.Name)}) AS root_id
) AS ${alias} ON true`;
    }

    // ─── PERMISSIONS ─────────────────────────────────────────────────────

    /** @inheritdoc */
    generateViewPermissions(entity: EntityInfo): string {
        const viewName = this.getBaseViewName(entity);
        const roles = this.collectPermissionRoles(entity.Permissions);
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT SELECT ON ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    /**
     * Generates `GRANT EXECUTE ON FUNCTION` statements for the given CRUD function,
     * granting access to each role that has the corresponding permission (Create, Update,
     * or Delete) on the entity.
     */
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

    /** @inheritdoc */
    generateFullTextSearchPermissions(entity: EntityInfo, functionName: string): string {
        const roles = this.collectPermissionRoles(entity.Permissions);
        if (roles.length === 0) return '';
        return roles.map((role: string) =>
            `GRANT EXECUTE ON FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, functionName)} TO ${pgDialect.QuoteIdentifier(role)};`
        ).join('\n');
    }

    // ─── CASCADE DELETES ─────────────────────────────────────────────────

    /** @inheritdoc */
    generateSingleCascadeOperation(context: CascadeDeleteContext): string {
        const { parentEntity, relatedEntity, fkField, operation } = context;

        // Use the operation type from the orchestrator's decision
        if (operation === 'update') {
            return this.generateCascadeUpdateToNull(parentEntity, relatedEntity, fkField);
        }
        return this.generateCascadeCursorDelete(parentEntity, relatedEntity, fkField);
    }

    // ─── TIMESTAMP COLUMNS ───────────────────────────────────────────────

    /**
     * Generates a PL/pgSQL `DO $$` block that conditionally adds `__mj_CreatedAt` and
     * `__mj_UpdatedAt` columns to a table using `TIMESTAMPTZ` type with a UTC default.
     * Uses `information_schema` checks to skip columns that already exist.
     */
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

    /**
     * Builds the parameter declaration list for a PostgreSQL CRUD function signature.
     * Each parameter is prefixed with `p_` and uses the PostgreSQL-mapped type. For
     * CREATE functions, parameters with default values or primary keys get `DEFAULT NULL`
     * to allow optional arguments, and PostgreSQL's requirement that all subsequent
     * parameters also have defaults once the first default appears is respected.
     */
    generateCRUDParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        const parts: string[] = [];
        let foundDefault = false;
        for (const ef of entityFields) {
            if (!this.shouldIncludeFieldInParams(ef, isUpdate)) continue;

            const paramName = `p_${this.toSnakeCase(ef.CodeName)}`;
            const sqlType = this.mapSQLType(ef.SQLFullType);
            let defaultVal = '';

            if (!isUpdate && ef.IsPrimaryKey && !ef.AutoIncrement) {
                defaultVal = ' DEFAULT NULL';
                foundDefault = true;
            } else if (!isUpdate && ef.HasDefaultValue && !ef.AllowsNull) {
                defaultVal = ' DEFAULT NULL';
                foundDefault = true;
            } else if (!isUpdate && foundDefault) {
                // PG requires all params after the first DEFAULT to also have DEFAULTs
                defaultVal = ' DEFAULT NULL';
            }

            parts.push(`${paramName} ${sqlType}${defaultVal}`);
        }
        return parts.join(',\n    ');
    }

    /**
     * Builds either the column name list or the value expression list for an INSERT
     * statement, depending on whether {@link prefix} is empty (column names) or set
     * (parameter values with `p_` prefix). Handles special date fields
     * (`__mj_CreatedAt`, `__mj_UpdatedAt`) by substituting `NOW() AT TIME ZONE 'UTC'`
     * and applies default-value COALESCE wrappers for fields with non-null defaults.
     */
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

    /** @inheritdoc */
    generateUpdateFieldString(entityFields: EntityFieldInfo[]): string {
        const parts: string[] = [];
        for (const ef of entityFields) {
            if (ef.IsPrimaryKey || ef.IsVirtual || !ef.AllowUpdateAPI || ef.AutoIncrement || ef.IsSpecialDateField) continue;
            parts.push(`${pgDialect.QuoteIdentifier(ef.Name)} = p_${this.toSnakeCase(ef.CodeName)}`);
        }
        return parts.join(',\n        ');
    }

    // ─── ROUTINE NAMING ──────────────────────────────────────────────────

    /** @inheritdoc */
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

    /** @inheritdoc */
    generateSQLFileHeader(entity: EntityInfo, itemName: string): string {
        return `-- ============================================================
-- PostgreSQL Generated SQL for Entity: ${entity.Name}
-- Item: ${itemName}
-- Generated at: ${new Date().toISOString()}
-- ============================================================
`;
    }

    /** @inheritdoc */
    generateAllEntitiesSQLFileHeader(): string {
        return `-- ============================================================
-- PostgreSQL Generated SQL for All Entities
-- Generated at: ${new Date().toISOString()}
-- ============================================================
`;
    }

    // ─── UTILITY ─────────────────────────────────────────────────────────

    /**
     * Maps a SQL default value expression to its PostgreSQL equivalent. Translates
     * SQL Server built-in functions (e.g., `NEWID()` to `gen_random_uuid()`,
     * `GETUTCDATE()` to `NOW() AT TIME ZONE 'UTC'`), strips outer parentheses and
     * surrounding single quotes, and re-applies quoting based on the {@link needsQuotes}
     * flag. Returns `'NULL'` for empty or whitespace-only input.
     */
    formatDefaultValue(defaultValue: string, needsQuotes: boolean): string {
        if (!defaultValue || defaultValue.trim().length === 0) return 'NULL';

        let trimmedValue = defaultValue.trim();
        const lowerValue = trimmedValue.toLowerCase();

        // Map SQL Server and PostgreSQL functions to canonical PostgreSQL equivalents
        const functionMap: Record<string, string> = {
            'newid()': 'gen_random_uuid()',
            'newsequentialid()': 'gen_random_uuid()',
            'gen_random_uuid()': 'gen_random_uuid()',
            'getdate()': "NOW() AT TIME ZONE 'UTC'",
            'getutcdate()': "NOW() AT TIME ZONE 'UTC'",
            'sysdatetime()': "NOW() AT TIME ZONE 'UTC'",
            'sysdatetimeoffset()': "NOW() AT TIME ZONE 'UTC'",
            'now()': 'NOW()',
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

    /**
     * Builds a set of PL/pgSQL components for working with an entity's primary key(s)
     * in cascade operations: variable declarations, SELECT field list, FETCH INTO
     * variable list, and named routine parameter assignments. Used by cascade delete
     * and update-to-NULL generators to construct cursor-based loops.
     */
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

    // ─── METADATA MANAGEMENT: STORED PROCEDURE CALLS ─────────────────

    /** @inheritdoc */
    callRoutineSQL(schema: string, routineName: string, params: string[], _paramNames?: string[]): string {
        const qualifiedName = pgDialect.QuoteSchema(schema, routineName);
        const paramList = params.join(', ');
        return `SELECT * FROM ${qualifiedName}(${paramList})`;
    }

    // ─── METADATA MANAGEMENT: CONDITIONAL INSERT ─────────────────────

    /** @inheritdoc */
    conditionalInsertSQL(checkQuery: string, insertSQL: string): string {
        return `DO $$ BEGIN\n   IF NOT EXISTS (${checkQuery}) THEN\n      ${insertSQL};\n   END IF;\nEND $$`;
    }

    /** @inheritdoc */
    wrapInsertWithConflictGuard(_conflictCheckSQL: string): { prefix: string; suffix: string } {
        return { prefix: '', suffix: 'ON CONFLICT DO NOTHING' };
    }

    // ─── METADATA MANAGEMENT: DDL OPERATIONS ─────────────────────────

    /** @inheritdoc */
    addColumnSQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean, defaultExpression?: string): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        const nullClause = nullable ? 'NULL' : 'NOT NULL';
        const defaultClause = defaultExpression ? ` DEFAULT ${defaultExpression}` : '';
        return `ALTER TABLE ${table} ADD COLUMN ${col} ${dataType} ${nullClause}${defaultClause}`;
    }

    /** @inheritdoc */
    alterColumnTypeAndNullabilitySQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        const nullAction = nullable ? 'DROP NOT NULL' : 'SET NOT NULL';
        return `ALTER TABLE ${table} ALTER COLUMN ${col} TYPE ${dataType}, ALTER COLUMN ${col} ${nullAction}`;
    }

    /** @inheritdoc */
    addDefaultConstraintSQL(schema: string, tableName: string, columnName: string, defaultExpression: string): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        return `ALTER TABLE ${table} ALTER COLUMN ${col} SET DEFAULT ${defaultExpression}`;
    }

    /**
     * Generates a PL/pgSQL `DO $$` block that drops both a named CHECK constraint (if one
     * exists on the column, found via `pg_catalog.pg_constraint`) and the column's default
     * value. Uses dynamic SQL (`EXECUTE format(...)`) to drop the constraint by name,
     * then unconditionally runs `ALTER COLUMN ... DROP DEFAULT`.
     */
    dropDefaultConstraintSQL(schema: string, tableName: string, columnName: string): string {
        const table = pgDialect.QuoteSchema(schema, tableName);
        const col = pgDialect.QuoteIdentifier(columnName);
        return `
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${schema}'
     AND rel.relname = '${tableName}'
     AND att.attname = '${columnName}'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${schema}', '${tableName}', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT;
END $$`;
    }

    /** @inheritdoc */
    dropObjectSQL(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION', schema: string, name: string): string {
        // PostgreSQL uses FUNCTION for both procedures and functions in DROP statements
        const typeStr = objectType === 'PROCEDURE' ? 'FUNCTION' : objectType;
        const qualifiedName = pgDialect.QuoteSchema(schema, name);
        const cascade = (objectType === 'PROCEDURE' || objectType === 'FUNCTION') ? ' CASCADE' : '';
        return `DROP ${typeStr} IF EXISTS ${qualifiedName}${cascade}`;
    }

    // ─── METADATA MANAGEMENT: VIEW INTROSPECTION ─────────────────────

    /** @inheritdoc */
    getViewExistsSQL(): string {
        return `SELECT 1 FROM information_schema.views WHERE table_name = @ViewName AND table_schema = @SchemaName`;
    }

    /** @inheritdoc */
    getViewColumnsSQL(schema: string, viewName: string): string {
        return `SELECT
    column_name AS "FieldName",
    data_type AS "Type",
    COALESCE(character_maximum_length, 0) AS "Length",
    COALESCE(numeric_precision, 0) AS "Precision",
    COALESCE(numeric_scale, 0) AS "Scale",
    CASE WHEN is_nullable = 'YES' THEN 1 ELSE 0 END AS "AllowsNull"
FROM information_schema.columns
WHERE table_schema = '${schema}'
  AND table_name = '${viewName}'
ORDER BY ordinal_position`;
    }

    // ─── METADATA MANAGEMENT: TYPE SYSTEM ────────────────────────────

    /** @inheritdoc */
    get TimestampType(): string {
        return 'TIMESTAMPTZ';
    }

    /**
     * Compares two PostgreSQL data type strings for equivalence, accounting for common
     * aliases. For example, `'timestamptz'` and `'timestamp with time zone'` are
     * considered equal. Returns `true` if the types match directly or via alias lookup.
     */
    compareDataTypes(reported: string, expected: string): boolean {
        if (reported === expected) return true;
        const aliases: Record<string, string> = {
            'timestamptz': 'timestamp with time zone',
            'timestamp with time zone': 'timestamptz',
        };
        return aliases[reported] === expected;
    }

    // ─── METADATA MANAGEMENT: PLATFORM CONFIGURATION ─────────────────

    /** @inheritdoc */
    getSystemSchemasToExclude(): string[] {
        return ['information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1'];
    }

    /**
     * PostgreSQL does not require view refresh after creation. Unlike SQL Server's
     * `sp_refreshview`, PostgreSQL views automatically reflect column changes, so
     * this always returns `false`.
     */
    get NeedsViewRefresh(): boolean {
        return false;
    }

    /** @inheritdoc */
    generateViewRefreshSQL(_schema: string, _viewName: string): string {
        return '';
    }

    /** @inheritdoc */
    generateViewTestQuerySQL(schema: string, viewName: string): string {
        return `SELECT * FROM ${pgDialect.QuoteSchema(schema, viewName)} LIMIT 1`;
    }

    /**
     * PostgreSQL requires a nullability fix for virtual (computed) fields in views.
     * View columns derived from expressions may report incorrect nullability in
     * `information_schema.columns`, so CodeGen must correct these after view creation.
     */
    get NeedsVirtualFieldNullabilityFix(): boolean {
        return true;
    }

    // ─── METADATA MANAGEMENT: SQL QUOTING ────────────────────────────

    /**
     * SQL keywords that should NOT be quoted even when they match PascalCase patterns.
     */
    private static readonly _SQL_KEYWORDS = new Set([
        // DML/DDL keywords
        'SELECT', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
        'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'ON', 'AS', 'SET',
        'VALUES', 'NULL', 'LIKE', 'IN', 'EXISTS', 'BETWEEN', 'CASE', 'WHEN', 'THEN',
        'ELSE', 'END', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION',
        'ALL', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW', 'EXEC', 'DECLARE',
        'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'TRUE', 'FALSE', 'IS', 'ASC', 'DESC',
        'DISTINCT', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT',
        'IF', 'OBJECT', 'TOP', 'WITH', 'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK',
        'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'ROWS', 'RANGE',
        'PRECEDING', 'FOLLOWING', 'UNBOUNDED', 'CURRENT', 'ROW', 'FETCH', 'NEXT', 'ONLY',
        'SCHEMA', 'CASCADE', 'RESTRICT', 'NO', 'ACTION', 'TRIGGER', 'FUNCTION', 'PROCEDURE',
        'RETURNS', 'RETURN', 'EXECUTE', 'CALL', 'RAISE', 'NOTICE', 'EXCEPTION', 'PERFORM',
        'GRANT', 'REVOKE', 'TO', 'USAGE', 'PRIVILEGES', 'OWNER',
        // DDL sub-keywords
        'ADD', 'COLUMN', 'DO', 'RENAME', 'COMMENT', 'UNIQUE', 'CHECK',
        'CONFLICT', 'NOTHING', 'EXCLUDED', 'ZONE', 'AT', 'FOR', 'EACH', 'OF',
        'BEFORE', 'AFTER', 'INSTEAD', 'USING', 'ANY', 'SOME',
        'ENABLE', 'DISABLE', 'GENERATED', 'ALWAYS', 'IDENTITY',
        'SECURITY', 'DEFINER', 'INVOKER', 'FORCE', 'COPY',
        'TEMPORARY', 'TEMP', 'RECURSIVE', 'MATERIALIZED', 'CONCURRENTLY',
        // PL/pgSQL control flow
        'NEW', 'OLD', 'FOUND', 'LOOP', 'WHILE', 'EXIT', 'CONTINUE',
        'ELSIF', 'ELSEIF', 'STRICT',
        // SQL Server types
        'NVARCHAR', 'VARCHAR', 'UNIQUEIDENTIFIER', 'DATETIMEOFFSET', 'DATETIME', 'DATETIME2',
        'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'REAL', 'DECIMAL', 'NUMERIC', 'MONEY',
        'BIT', 'INT', 'TEXT', 'NTEXT', 'IMAGE', 'BINARY', 'VARBINARY', 'CHAR', 'NCHAR',
        'XML', 'GEOGRAPHY', 'GEOMETRY', 'HIERARCHYID', 'SQL_VARIANT', 'SYSNAME',
        'NEWSEQUENTIALID', 'NEWID', 'GETUTCDATE', 'GETDATE', 'SYSDATETIMEOFFSET',
        'OBJECT_ID', 'SCOPE_IDENTITY',
        // Aggregate / scalar functions
        'COUNT', 'MAX', 'MIN', 'SUM', 'AVG', 'COALESCE', 'CAST', 'CONVERT', 'ISNULL',
        'LEN', 'DATALENGTH', 'LOWER', 'UPPER', 'LTRIM', 'RTRIM', 'TRIM', 'REPLACE',
        'SUBSTRING', 'CHARINDEX', 'PATINDEX', 'STUFF', 'CONCAT', 'FORMAT',
        'DATEADD', 'DATEDIFF', 'DATEPART', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE',
        'SECOND', 'NOW', 'CURRENT_TIMESTAMP',
        // PostgreSQL specific
        'BOOLEAN', 'SERIAL', 'BIGSERIAL', 'UUID', 'JSONB', 'JSON', 'ARRAY', 'TIMESTAMPTZ',
        'TIMESTAMP', 'DATE', 'TIME', 'INTERVAL', 'CITEXT', 'INET', 'MACADDR',
        'GEN_RANDOM_UUID', 'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP', 'TO_NUMBER',
        'STRING_AGG', 'ARRAY_AGG', 'UNNEST', 'LATERAL', 'ILIKE',
        'LANGUAGE', 'PLPGSQL', 'VOLATILE', 'STABLE', 'IMMUTABLE', 'SETOF', 'RECORD',
        'INOUT', 'OUT', 'VARIADIC', 'PARALLEL', 'SAFE', 'UNSAFE',
        // information_schema column names
        'TABLE_SCHEMA', 'TABLE_NAME', 'TABLE_CATALOG', 'COLUMN_NAME', 'DATA_TYPE',
        'IS_NULLABLE', 'COLUMN_DEFAULT', 'CHARACTER_MAXIMUM_LENGTH', 'NUMERIC_PRECISION',
        'NUMERIC_SCALE', 'ORDINAL_POSITION', 'COLUMN_COMMENT',
        // MJ SQL constructs
        'INFORMATION_SCHEMA', 'COLUMNS', 'TABLES', 'ROUTINES',
    ]);

    /**
     * Quotes mixed-case identifiers in a SQL string for PostgreSQL compatibility.
     * Uses a tokenizer approach to skip string literals, already-quoted identifiers,
     * dollar-quoted blocks, and SQL keywords. Any remaining PascalCase word gets
     * double-quoted to preserve case.
     */
    quoteSQLForExecution(sql: string): string {
        const result: string[] = [];
        let i = 0;
        const len = sql.length;

        while (i < len) {
            const ch = sql[i];

            if (ch === "'") {
                i = this.skipSingleQuotedString(sql, i, len, result);
                continue;
            }
            if (ch === '$') {
                i = this.skipDollarQuotedBlock(sql, i, len, result);
                continue;
            }
            if (ch === '"') {
                i = this.skipDoubleQuotedIdentifier(sql, i, len, result);
                continue;
            }
            if (ch === '[') {
                i = this.skipBracketedIdentifier(sql, i, len, result);
                continue;
            }
            if (ch === '@') {
                i = this.skipAtParameter(sql, i, len, result);
                continue;
            }
            if (/[a-zA-Z_]/.test(ch)) {
                i = this.processWord(sql, i, len, result);
                continue;
            }

            result.push(ch);
            i++;
        }

        return result.join('');
    }

    // ─── METADATA MANAGEMENT: DEFAULT VALUE PARSING ──────────────────

    /**
     * Parses a PostgreSQL column default value by stripping PG-specific type cast syntax
     * (e.g., `'2024-01-01'::timestamp` becomes `'2024-01-01'`). Returns `null` for
     * auto-increment sequences (`nextval(...)`) and for null/undefined input, indicating
     * no meaningful default.
     */
    parseColumnDefaultValue(sqlDefaultValue: string): string | null {
        if (sqlDefaultValue === null || sqlDefaultValue === undefined) {
            return null;
        }

        let sResult = sqlDefaultValue;

        // Strip type casts like '2024-01-01'::timestamp, 'value'::character varying
        const castMatch = sResult.match(/^'(.*)'::.*$/);
        if (castMatch) {
            sResult = castMatch[1];
        }

        // Strip nextval('...') for auto-increment sequences - treated as no default
        if (sResult.match(/^nextval\(/i)) {
            return null;
        }

        return sResult;
    }

    // ─── METADATA MANAGEMENT: COMPLEX SQL GENERATION ─────────────────

    /** @inheritdoc */
    getPendingEntityFieldsSQL(mjCoreSchema: string): string {
        const qs = pgDialect.QuoteSchema.bind(pgDialect);
        return this.buildPendingEntityFieldsQuery(mjCoreSchema, qs);
    }

    /** @inheritdoc */
    getCheckConstraintsSchemaFilter(_excludeSchemas: string[]): string {
        // PostgreSQL view already handles schema filtering
        return '';
    }

    /** @inheritdoc */
    getEntitiesWithMissingBaseTablesFilter(): string {
        // PostgreSQL query doesn't need this filter
        return '';
    }

    /** @inheritdoc */
    getFixVirtualFieldNullabilitySQL(mjCoreSchema: string): string {
        const qs = pgDialect.QuoteSchema.bind(pgDialect);
        return this.buildFixVirtualFieldNullabilityUpdateSQL(mjCoreSchema, qs);
    }

    // ─── METADATA MANAGEMENT: SQL FILE EXECUTION ─────────────────────

    /**
     * Executes a SQL file against the PostgreSQL database using the `psql` CLI tool.
     * Reads connection parameters from environment variables (`PG_HOST`, `PG_PORT`,
     * `PG_DATABASE`, `PG_USERNAME`, `PG_PASSWORD`) with fallback to `configInfo` values.
     * Resolves the file path to an absolute path before passing it to psql.
     */
    async executeSQLFileViaShell(filePath: string): Promise<boolean> {
        const pgHost = process.env.PG_HOST ?? configInfo.dbHost;
        const pgPort = process.env.PG_PORT ?? String(configInfo.dbPort ?? 5432);
        const pgDatabase = process.env.PG_DATABASE ?? configInfo.dbDatabase;
        const pgUser = process.env.PG_USERNAME ?? configInfo.codeGenLogin;
        const pgPassword = process.env.PG_PASSWORD ?? configInfo.codeGenPassword;

        if (!pgUser || !pgPassword || !pgDatabase) {
            throw new Error('PostgreSQL user, password, and database must be provided in the configuration or environment variables');
        }

        const absoluteFilePath = path.resolve(process.cwd(), filePath);
        return this.executePsqlCommand(absoluteFilePath, pgHost, pgPort, pgUser, pgDatabase, pgPassword);
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
        // parentFieldsSelect and rootFieldsSelect have leading commas (e.g. ",\n    Field AS Alias").
        // relatedFieldsSelect does NOT have a leading comma for the first field (starts with "\n    Field...").
        let select = `${alias}.*`;
        if (context.parentFieldsSelect) select += context.parentFieldsSelect;
        if (context.relatedFieldsSelect) select += `,${context.relatedFieldsSelect}`;
        if (context.rootFieldsSelect) select += context.rootFieldsSelect;
        return select;
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
        insertColumns: string,
        insertValues: string
    ): { preInsert: string; returningClause: string; selectClause: string; finalColumns: string; finalValues: string } {
        const viewName = this.getBaseViewName(entity);
        const pkCol = pgDialect.QuoteIdentifier(firstKey.Name);

        if (firstKey.AutoIncrement) {
            return {
                preInsert: '',
                returningClause: `RETURNING ${pkCol} INTO v_new_id`,
                selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${pkCol} = v_new_id`,
                finalColumns: insertColumns,
                finalValues: insertValues,
            };
        }

        if ((firstKey.Type.toLowerCase().trim() === 'uniqueidentifier' || firstKey.Type.toLowerCase().trim() === 'uuid') && entity.PrimaryKeys.length === 1) {
            const paramName = `p_${this.toSnakeCase(firstKey.CodeName)}`;
            return {
                preInsert: `v_new_id := COALESCE(${paramName}, gen_random_uuid());\n    `,
                returningClause: '',
                selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${pkCol} = v_new_id`,
                // Include the PK column in the INSERT so caller-provided IDs are respected
                finalColumns: `${pkCol},\n            ${insertColumns}`,
                finalValues: `v_new_id,\n            ${insertValues}`,
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
            finalColumns: insertColumns,
            finalValues: insertValues,
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

    // ─── DATABASE INTROSPECTION ──────────────────────────────────────────

    /** @inheritdoc */
    getViewDefinitionSQL(schema: string, viewName: string): string {
        return `SELECT pg_get_viewdef('"${schema}"."${viewName}"'::regclass, true) AS "ViewDefinition"`;
    }

    /**
     * Generates a query against `pg_index`, `pg_class`, and `pg_namespace` to retrieve
     * the index name for a table's primary key constraint. Used by CodeGen to reference
     * the PK index in full-text search and other operations.
     */
    getPrimaryKeyIndexNameSQL(schema: string, tableName: string): string {
        return `SELECT
        i.relname AS "IndexName"
    FROM
        pg_index ix
    INNER JOIN
        pg_class t ON t.oid = ix.indrelid
    INNER JOIN
        pg_class i ON i.oid = ix.indexrelid
    INNER JOIN
        pg_namespace n ON n.oid = t.relnamespace
    WHERE
        ix.indisprimary = true
        AND t.relname = '${tableName}'
        AND n.nspname = '${schema}'`;
    }

    /**
     * Generates a query against `pg_index`, `pg_class`, `pg_namespace`, and `pg_attribute`
     * to check whether a column participates in a multi-column unique constraint. Returns
     * rows only when the unique index contains more than one column and includes the
     * specified column.
     */
    getCompositeUniqueConstraintCheckSQL(schema: string, tableName: string, columnName: string): string {
        return `SELECT ix.indexrelid AS index_id
    FROM pg_index ix
    INNER JOIN pg_class t ON t.oid = ix.indrelid
    INNER JOIN pg_namespace n ON n.oid = t.relnamespace
    INNER JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE ix.indisunique = true
      AND ix.indisprimary = false
      AND n.nspname = '${schema}'
      AND t.relname = '${tableName}'
      AND EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = t.oid
            AND a.attnum = ANY(ix.indkey)
            AND a.attname = '${columnName}'
      )
      AND array_length(ix.indkey, 1) > 1`;
    }

    /** @inheritdoc */
    getForeignKeyIndexExistsSQL(schema: string, tableName: string, indexName: string): string {
        return `SELECT 1
    FROM pg_indexes
    WHERE schemaname = '${schema}'
      AND tablename = '${tableName}'
      AND indexname = '${indexName}'`;
    }

    // ─── TOKENIZER HELPERS (for quoteSQLForExecution) ────────────────

    /** Skips a single-quoted string literal, handling escaped quotes ('') */
    private skipSingleQuotedString(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len) {
            if (sql[j] === "'" && j + 1 < len && sql[j + 1] === "'") {
                j += 2;
            } else if (sql[j] === "'") {
                j++;
                break;
            } else {
                j++;
            }
        }
        result.push(sql.substring(start, j));
        return j;
    }

    /** Skips a dollar-quoted block ($$ ... $$ or $tag$ ... $tag$) */
    private skipDollarQuotedBlock(sql: string, start: number, len: number, result: string[]): number {
        let tagEnd = start + 1;
        if (tagEnd < len && sql[tagEnd] === '$') {
            // Simple $$ tag
            tagEnd = start + 2;
        } else {
            // Look for $identifier$ pattern
            while (tagEnd < len && /[a-zA-Z0-9_]/.test(sql[tagEnd])) tagEnd++;
            if (tagEnd < len && sql[tagEnd] === '$') {
                tagEnd++;
            } else {
                // Not a dollar-quote, just a $ character
                result.push(sql[start]);
                return start + 1;
            }
        }
        const tag = sql.substring(start, tagEnd);
        const closePos = sql.indexOf(tag, tagEnd);
        if (closePos !== -1) {
            const blockEnd = closePos + tag.length;
            result.push(sql.substring(start, blockEnd));
            return blockEnd;
        }
        // No closing tag found, pass through rest of string
        result.push(sql.substring(start));
        return len;
    }

    /** Skips an already double-quoted identifier */
    private skipDoubleQuotedIdentifier(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && sql[j] !== '"') j++;
        if (j < len) j++;
        result.push(sql.substring(start, j));
        return j;
    }

    /** Skips a square-bracketed identifier (SQL Server style) */
    private skipBracketedIdentifier(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && sql[j] !== ']') j++;
        if (j < len) j++;
        result.push(sql.substring(start, j));
        return j;
    }

    /** Skips an @-prefixed parameter */
    private skipAtParameter(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && /[a-zA-Z0-9_]/.test(sql[j])) j++;
        result.push(sql.substring(start, j));
        return j;
    }

    /** Processes a word token - quotes it if it's a PascalCase identifier, not a keyword */
    private processWord(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && /[a-zA-Z0-9_]/.test(sql[j])) j++;
        const word = sql.substring(start, j);

        const isKeyword = PostgreSQLCodeGenProvider._SQL_KEYWORDS.has(word.toUpperCase());
        const startsUpper = /^[A-Z]/.test(word);
        const isAllLower = word === word.toLowerCase();
        const isMJInternal = word.startsWith('__mj_');

        if (!isKeyword && !isAllLower && !isMJInternal && startsUpper) {
            result.push(pgDialect.QuoteIdentifier(word));
        } else {
            result.push(word);
        }
        return j;
    }

    // ─── COMPLEX SQL GENERATION HELPERS ──────────────────────────────

    /**
     * Builds the full pending entity fields query for PostgreSQL.
     * Uses CTEs for FK, PK, and UK caches, then joins against entity metadata
     * to find fields that exist in the database but not in MJ metadata.
     */
    private buildPendingEntityFieldsQuery(
        schema: string,
        qs: (schema: string, name: string) => string
    ): string {
        return `
WITH fk_cache AS (
   SELECT "column", "table", "schema_name", "referenced_table", "referenced_column", "referenced_schema"
   FROM ${qs(schema, 'vwForeignKeys')}
),
pk_cache AS (
   SELECT "TableName", "ColumnName", "SchemaName"
   FROM ${qs(schema, 'vwTablePrimaryKeys')}
),
uk_cache AS (
   SELECT "TableName", "ColumnName", "SchemaName"
   FROM ${qs(schema, 'vwTableUniqueKeys')}
),
max_sequences AS (
   SELECT
      "EntityID",
      COALESCE(MAX("Sequence"), 0) AS "MaxSequence"
   FROM
      ${qs(schema, 'EntityField')}
   GROUP BY
      "EntityID"
),
numbered_rows AS (
   SELECT
      sf."EntityID",
      COALESCE(ms."MaxSequence", 0) + 100000 + sf."Sequence" AS "Sequence",
      sf."FieldName",
      sf."Description",
      sf."Type",
      sf."Length",
      sf."Precision",
      sf."Scale",
      sf."AllowsNull",
      sf."DefaultValue",
      sf."AutoIncrement",
      ${this.buildAllowUpdateAPICase()},
      sf."IsVirtual",
      e."RelationshipDefaultDisplayType",
      e."Name" AS "EntityName",
      re."ID" AS "RelatedEntityID",
      fk."referenced_column" AS "RelatedEntityFieldName",
      CASE WHEN sf."FieldName" = 'Name' THEN 1 ELSE 0 END AS "IsNameField",
      CASE WHEN pk."ColumnName" IS NOT NULL THEN 1 ELSE 0 END AS "IsPrimaryKey",
      CASE
            WHEN pk."ColumnName" IS NOT NULL THEN 1
            WHEN uk."ColumnName" IS NOT NULL THEN 1
            ELSE 0
      END AS "IsUnique",
      ROW_NUMBER() OVER (PARTITION BY sf."EntityID", sf."FieldName" ORDER BY (SELECT NULL)) AS rn
   FROM
      ${qs(schema, 'vwSQLColumnsAndEntityFields')} sf
   LEFT OUTER JOIN
      max_sequences ms ON sf."EntityID" = ms."EntityID"
   LEFT OUTER JOIN
      ${qs(schema, 'Entity')} e ON sf."EntityID" = e."ID"
   LEFT OUTER JOIN
      fk_cache fk ON sf."FieldName" = fk."column" AND e."BaseTable" = fk."table" AND e."SchemaName" = fk."schema_name"
   LEFT OUTER JOIN
      ${qs(schema, 'Entity')} re ON re."BaseTable" = fk."referenced_table" AND re."SchemaName" = fk."referenced_schema"
   LEFT OUTER JOIN
      pk_cache pk ON e."BaseTable" = pk."TableName" AND sf."FieldName" = pk."ColumnName" AND e."SchemaName" = pk."SchemaName"
   LEFT OUTER JOIN
      uk_cache uk ON e."BaseTable" = uk."TableName" AND sf."FieldName" = uk."ColumnName" AND e."SchemaName" = uk."SchemaName"
   WHERE
      "EntityFieldID" IS NULL
)
SELECT *
FROM numbered_rows
WHERE rn = 1
ORDER BY "EntityID", "Sequence";
`;
    }

    /**
     * Builds the CASE expression for AllowUpdateAPI in the pending entity fields query.
     */
    private buildAllowUpdateAPICase(): string {
        return `CASE WHEN sf."IsVirtual" = true THEN 0
           WHEN sf."FieldName" = '${EntityInfo.CreatedAtFieldName}' THEN 0
           WHEN sf."FieldName" = '${EntityInfo.UpdatedAtFieldName}' THEN 0
           WHEN sf."FieldName" = '${EntityInfo.DeletedAtFieldName}' THEN 0
           WHEN pk."ColumnName" IS NOT NULL THEN 0
           ELSE 1
      END AS "AllowUpdateAPI"`;
    }

    /**
     * Builds the UPDATE SQL to fix virtual field nullability.
     * Updates AllowsNull for virtual fields based on the FK column's nullability.
     */
    private buildFixVirtualFieldNullabilityUpdateSQL(
        mjCoreSchema: string,
        qs: (schema: string, name: string) => string
    ): string {
        return `
UPDATE ${qs(mjCoreSchema, 'EntityField')} vf
SET "AllowsNull" = fk."AllowsNull"
FROM ${qs(mjCoreSchema, 'EntityField')} fk
WHERE vf."IsVirtual" = true
  AND fk."IsVirtual" = false
  AND vf."EntityID" = fk."EntityID"
  AND fk."RelatedEntityID" IS NOT NULL
  AND (
     (LENGTH(fk."Name") > 2
      AND LOWER(vf."Name") = LOWER(LEFT(fk."Name", LENGTH(fk."Name") - 2)))
     OR
     (LENGTH(fk."Name") > 2
      AND LOWER(vf."Name") = LOWER(LEFT(fk."Name", LENGTH(fk."Name") - 2) || '_Virtual'))
     OR
     (fk."RelatedEntityNameFieldMap" IS NOT NULL
      AND fk."RelatedEntityNameFieldMap" != ''
      AND LOWER(vf."Name") = LOWER(fk."RelatedEntityNameFieldMap"))
  )
  AND vf."AllowsNull" != fk."AllowsNull"`;
    }

    // ─── SHELL EXECUTION HELPERS ─────────────────────────────────────

    /**
     * Executes a SQL file using the psql CLI.
     */
    private async executePsqlCommand(
        absoluteFilePath: string,
        pgHost: string,
        pgPort: string,
        pgUser: string,
        pgDatabase: string,
        pgPassword: string
    ): Promise<boolean> {
        const args = [
            '-h', pgHost,
            '-p', pgPort,
            '-U', pgUser,
            '-d', pgDatabase,
            '-v', 'ON_ERROR_STOP=1',
            '-f', absoluteFilePath,
        ];

        logIf(configInfo.verboseOutput, `Executing SQL file (psql): ${absoluteFilePath} as ${pgUser}@${pgHost}:${pgPort}/${pgDatabase}`);

        try {
            const result = await this.spawnPsql(args, pgPassword);
            this.logPsqlOutput(result.stdout, result.stderr);
            return true;
        } catch (e: unknown) {
            this.logPsqlError(e, pgPassword);
            return false;
        }
    }

    /**
     * Spawns a psql child process and returns its output.
     */
    private spawnPsql(args: string[], pgPassword: string): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const child = spawn('psql', args, {
                shell: false,
                env: { ...process.env, PGPASSWORD: pgPassword },
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });
            child.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });
            child.on('error', (error: Error) => {
                reject(error);
            });
            child.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    const error = new Error(`psql exited with code ${code}`);
                    Object.assign(error, { stdout, stderr, code });
                    reject(error);
                }
            });
        });
    }

    /**
     * Logs psql stdout/stderr output, filtering out informational NOTICE messages.
     */
    private logPsqlOutput(stdout: string, stderr: string): void {
        if (stdout && stdout.trim().length > 0) {
            logIf(configInfo.verboseOutput, `PostgreSQL output: ${stdout.trim()}`);
        }
        if (stderr && stderr.trim().length > 0) {
            const nonNoticeLines = stderr.split('\n').filter(
                (l: string) => !l.trim().startsWith('NOTICE:') && !l.trim().startsWith('psql:') && l.trim().length > 0
            );
            if (nonNoticeLines.length > 0) {
                logWarning(`PostgreSQL stderr: ${nonNoticeLines.join('\n')}`);
            }
        }
    }

    /**
     * Logs psql execution errors with password masking.
     */
    private logPsqlError(e: unknown, pgPassword: string): void {
        let message = (e instanceof Error) ? e.message : String(e);

        const errRecord = e as Record<string, unknown>;
        if (errRecord.stdout) {
            message += `\n PostgreSQL output: ${errRecord.stdout}`;
        }
        if (errRecord.stderr) {
            message += `\n PostgreSQL error: ${errRecord.stderr}`;
        }

        const errorMessage = pgPassword ? message.replace(pgPassword, 'XXXXX') : message;
        logError('Error executing PostgreSQL SQL file: ' + errorMessage);
    }
}
