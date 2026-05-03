import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    CodeGenDatabaseProvider,
    CRUDType,
    BaseViewGenerationContext,
    CascadeDeleteContext,
    FullTextSearchResult,
    PhasedExecutionResult,
} from '../../codeGenDatabaseProvider';
import { configInfo } from '../../../Config/config';
import { logError, logWarning } from '../../../Misc/status_logging';
import { PostgreSQLDialect, DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import * as fs from 'fs';
import path from 'path';
import { executeWithFallback } from './viewFallback';

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
     * Generates a PostgreSQL view-regeneration block for an entity's base view.
     *
     * Includes all base table columns, parent/related field joins, and root field lateral
     * joins. Applies a soft-delete `WHERE` filter when the entity uses soft deletes.
     *
     * **Two-path emission (try-then-fallback).** The output wraps `CREATE OR REPLACE VIEW`
     * in a `DO $$ ... EXCEPTION WHEN invalid_table_definition THEN DROP VIEW ... CASCADE;
     * EXECUTE vsql; END $$` block. Why:
     *
     *   - Happy path: `CREATE OR REPLACE VIEW` succeeds (new column list is a prefix of
     *     the existing one plus optional trailing additions). Zero destruction. No
     *     dependent views, functions, triggers, or grants are touched.
     *
     *   - Sad path: PG raises SQLSTATE `42P16 invalid_table_definition` for any column
     *     rename / reorder / type change / removal. The exception handler runs
     *     `DROP VIEW ... CASCADE` and re-executes the CREATE. Dependent codegen-managed
     *     functions (spCreate/spUpdate/spDelete returning `SETOF vwFoo`) and dependent
     *     views are CASCADE-dropped — they are regenerated later in the same codegen
     *     output stream, so by the end of the run all dependents are restored to the new
     *     shape. GRANTs on the view itself are also lost on the CASCADE; codegen always
     *     re-emits permissions immediately after the view, so they come back too.
     *
     * The runtime-apply path also calls this, so the live DB applies the same DO block.
     * `executeWithFallback` (the runtime helper) becomes a no-op for these statements
     * because the DO block handles 42P16 internally — but it still runs as a safety net
     * for any other failure modes.
     *
     * **What this DOES NOT preserve on the sad path:** non-codegen-managed dependent
     * objects (e.g. a hand-written sproc against this view that codegen doesn't know
     * about). Those would be CASCADE-dropped and not restored. MJ codegen-generated
     * sprocs cover all standard CRUD pathways; bespoke sprocs against base views are
     * extremely rare in practice. If a project does have them, they need to be re-applied
     * after a 42P16 fallback fires.
     *
     * This pattern matches the v5.30.x fix migration `V202604282300` — which used the
     * same DO/EXCEPTION construct to recreate `vwEntityPermissions` after the unquoted
     * RoleName alias bug — proving the pattern is production-tested.
     *
     * Permissions are handled separately by sql_codegen.ts via generateViewPermissions().
     */
    generateBaseView(context: BaseViewGenerationContext): string {
        const { entity } = context;
        const viewName = this.getBaseViewName(entity);
        const alias = entity.BaseTableCodeName.charAt(0).toLowerCase();
        const whereClause = this.buildSoftDeleteWhereClause(entity, alias);

        const selectParts = this.buildBaseViewSelectParts(context, alias);
        const fromParts = this.buildBaseViewFromParts(context, entity, alias);
        const quotedView = pgDialect.QuoteSchema(entity.SchemaName, viewName);

        // Inner CREATE OR REPLACE statement (no trailing semicolon — embedded inside
        // the DO block via dollar-quoted literal).
        const createOrReplaceSQL = `CREATE OR REPLACE VIEW ${quotedView}
AS
SELECT
    ${selectParts}
FROM
    ${pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable)} AS ${alias}${fromParts}
${whereClause}`;

        return `
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      ${entity.Name}
-----               SCHEMA:      ${entity.SchemaName}
-----               BASE TABLE:  ${entity.BaseTable}
-----               PRIMARY KEY: ${entity.PrimaryKeys.map((pk: EntityFieldInfo) => pk.Name).join(', ')}
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$${createOrReplaceSQL}$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS ${quotedView} CASCADE;
  EXECUTE vsql;
END $vw_regen$;
`;
    }

    // ─── CRUD CREATE ─────────────────────────────────────────────────────

    /**
     * Emits a `DO` block that drops every existing overload of `<schema>.<fnName>`.
     * Run before each `CREATE OR REPLACE FUNCTION` to prevent PG's "function name is
     * not unique" error when the parameter list grows (e.g. a new column adds a new
     * `DEFAULT NULL` parameter — old + new overloads become call-ambiguous and PG
     * refuses both `CREATE OR REPLACE` and any caller dispatch). Iterating overloads
     * via `pg_proc` is the only way to drop without knowing the exact prior signature.
     */
    private generateDropAllOverloadsBlock(schemaName: string, fnName: string): string {
        // Single quotes inside the DO block need to escape the surrounding quoting.
        // We use dollar-quoted strings to keep the body readable.
        return `DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = '${fnName}'
               AND pronamespace = '${schemaName}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;
`;
    }

    /**
     * Generates a PostgreSQL `CREATE OR REPLACE FUNCTION` for inserting a new record.
     * The function accepts typed parameters for each writable field, performs an `INSERT`
     * into the base table, and returns the newly created row from the base view via
     * `RETURN QUERY SELECT`. Handles auto-increment PKs (using `RETURNING ... INTO`),
     * UUID PKs (with `COALESCE` to gen_random_uuid()), and composite PKs. Also emits
     * `GRANT EXECUTE` permissions for authorized roles.
     *
     * Prepends a DROP-all-overloads block (see `generateDropAllOverloadsBlock`) so
     * adding/removing a column doesn't trigger PG's overload-ambiguity error.
     */
    generateCRUDCreate(entity: EntityInfo): string {
        const fnName = this.getCRUDRoutineName(entity, CRUDType.Create);
        const viewName = this.getBaseViewName(entity);
        const paramString = this.generateCRUDParamString(entity.Fields, false);
        const permissions = this.generateCRUDPermissions(entity, fnName, CRUDType.Create);

        const firstKey = entity.FirstPrimaryKey;
        // For UUID PKs and AutoIncrement PKs, the strategy below adds the PK
        // column manually (with v_new_id or RETURNING). Excluding it from the
        // auto-generated insertColumns/insertValues avoids the column appearing
        // twice in the INSERT statement.
        const pkType = firstKey.Type.toLowerCase().trim();
        const pkHandledByStrategy =
            firstKey.AutoIncrement ||
            ((pkType === 'uniqueidentifier' || pkType === 'uuid') && entity.PrimaryKeys.length === 1);
        const insertColumns = this.generateInsertFieldString(entity, entity.Fields, '', pkHandledByStrategy);
        const insertValues = this.generateInsertFieldString(entity, entity.Fields, 'p_', pkHandledByStrategy);

        const strategy = this.buildCreateInsertStrategy(
            entity, firstKey, insertColumns, insertValues
        );

        return `
------------------------------------------------------------
----- CREATE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramString}
) RETURNS SETOF ${pgDialect.QuoteSchema(entity.SchemaName, viewName)} AS $$
DECLARE
    v_new_id ${this.mapSQLType(firstKey.SQLFullType)};
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
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
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

        const needsRecordVar = cascadeSQL.includes('v_rec');

        return `
------------------------------------------------------------
----- DELETE FUNCTION FOR ${entity.BaseTable}
------------------------------------------------------------
${this.generateDropAllOverloadsBlock(entity.SchemaName, fnName)}
CREATE OR REPLACE FUNCTION ${pgDialect.QuoteSchema(entity.SchemaName, fnName)}(
    ${paramDecl}
) RETURNS ${returnType} AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;${needsRecordVar ? '\n    v_rec RECORD;' : ''}
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
    NEW."${EntityInfo.UpdatedAtFieldName}" := NOW() AT TIME ZONE 'UTC';
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
        const fnName = this.getRootIDFunctionName(entity, field);

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

    /**
     * Produces the canonical name for the recursive root-finder helper function
     * generated for self-referencing fields. The function definition and the
     * view's LATERAL-JOIN reference must agree on this name (caller side calls
     * via `generateRootFieldJoin`, definition via `generateRootIDFunction`).
     *
     * Note: this intentionally does NOT match the baseline-shipped PascalCase
     * `fn{Table}{Field}_GetRootID` form, because the baseline returns
     * `TABLE("RootID" type)` and the view callers expect a scalar — using the
     * baseline name would clash with `cannot change return type of existing
     * function`. The snake_case scalar form is codegen's own naming space and
     * is consistent with how downstream views are emitted.
     */
    private getRootIDFunctionName(entity: EntityInfo, field: EntityFieldInfo): string {
        return `fn_${this.toSnakeCase(entity.BaseTable)}_${this.toSnakeCase(field.Name)}_get_root_id`;
    }

    /** @inheritdoc */
    generateRootFieldSelect(_entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const rootFieldName = `Root${field.Name}`;
        return `${alias}.root_id AS ${pgDialect.QuoteIdentifier(rootFieldName)}`;
    }

    /**
     * Generates a `LEFT JOIN LATERAL` clause that invokes the root ID function for a
     * self-referencing field. PostgreSQL uses `LATERAL` joins (rather than SQL Server's
     * `OUTER APPLY`) to call scalar functions inline within a view definition.
     */
    generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string {
        const fnName = this.getRootIDFunctionName(entity, field);
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
    /**
     * PostgreSQL parameter types are mapped from the entity field's
     * T-SQL `SQLFullType` (the metadata is canonically T-SQL) into the
     * equivalent PostgreSQL type. SQL Server's base-class default would
     * pass the type through unchanged, which would emit invalid PG
     * function signatures.
     */
    protected renderParameterType(ef: EntityFieldInfo): string {
        return this.mapSQLType(ef.SQLFullType);
    }

    /**
     * PostgreSQL override: same tolerant-SP shape as the base class, but
     * with PG's "all params after the first DEFAULT must also have DEFAULTs"
     * rule enforced. Once any parameter becomes optional (or a `_Clear`
     * companion is emitted), every subsequent parameter is forced to
     * `DEFAULT NULL` even if it would otherwise be required, because PG
     * function signatures don't allow gaps between defaulted params.
     *
     * All decision logic and dialect-syntax bits route through the same
     * base-class helpers / dialect methods used by SQL Server — the only
     * thing that differs is the sticky-defaults walk.
     */
    generateCRUDParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        const dialect = this.Dialect;
        const nullDefault = dialect.ParameterDefault(dialect.NullLiteral);
        const parts: string[] = [];
        let foundDefault = false;
        for (const ef of entityFields) {
            if (!this.shouldIncludeFieldInParams(ef, isUpdate)) continue;

            // _Clear companion is emitted immediately before its main parameter
            // for nullable columns whose database default is non-NULL.
            //
            // Type was historically `bit DEFAULT 0` (a copy-paste from the
            // SQL Server emitter). PG has no implicit cast from integer to
            // its `bit` type, and `bit` here was meant to mean a boolean
            // anyway — so the function compiles but every caller that passes
            // `0`/`false` fails type-checking. Emit native PG `boolean DEFAULT FALSE`.
            if (!ef.IsPrimaryKey && this.needsClearCompanion(ef)) {
                parts.push(`${dialect.ParameterRef(ef.CodeName + '_Clear')} ${dialect.BooleanParameterType()}${dialect.ParameterDefault(dialect.BooleanLiteral(false))}`);
                foundDefault = true;
            }

            const isOptional = !this.isParamRequired(ef, isUpdate);
            // Sticky-defaults: once any param has a default, all subsequent params
            // must also be defaulted in PG. We default them to NULL.
            const needsStickyDefault = foundDefault && !isOptional;
            const defaultClause = isOptional || needsStickyDefault ? nullDefault : '';
            if (defaultClause) foundDefault = true;

            parts.push(`${dialect.ParameterRef(ef.CodeName)} ${this.renderParameterType(ef)}${defaultClause}`);
        }
        return parts.join(',\n    ');
    }

    /**
     * PostgreSQL override of the INSERT default-value renderer to handle
     * the BIT→BOOLEAN type-strictness gap. The base implementation passes
     * the SQL Server-style default through unchanged, but PG's strict
     * typing means `COALESCE(boolean_param, 0)` fails with "operator does
     * not exist: boolean = integer". This override remaps `BIT` defaults
     * (`0`/`1`) to `BOOLEAN` literals (`FALSE`/`TRUE`) when the field's
     * underlying type is bit/boolean.
     */
    protected formatInsertDefaultValue(ef: EntityFieldInfo): string {
        return this.formatBooleanCompatibleDefault(ef);
    }

    // ─── ROUTINE NAMING ──────────────────────────────────────────────────

    /** @inheritdoc */
    getCRUDRoutineName(entity: EntityInfo, type: CRUDType): string {
        // Match the baseline-ported `sp{Verb}{TableCodeName}` convention (SQL Server
        // names ported verbatim into PG). The runtime PostgreSQLDataProvider calls
        // these names directly — diverging here (e.g. `fn_create_<snake>`) means new
        // CodeGen runs leave functions the runtime can never find.
        const tableCodeName = entity.BaseTableCodeName;
        switch (type) {
            case CRUDType.Create:
                return entity.spCreate || `spCreate${tableCodeName}`;
            case CRUDType.Update:
                return entity.spUpdate || `spUpdate${tableCodeName}`;
            case CRUDType.Delete:
                return entity.spDelete || `spDelete${tableCodeName}`;
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

        // PG default values can come back as typed literals like
        // `'Pending'::character varying` or `'Active'::text`. The cast
        // suffix means the value is already a fully-formed PG expression —
        // stripping the leading-and-trailing quotes (line 14721 bug:
        // `'Pending'::character varying` → cleanValue = `Pending'::character varying`
        // → re-wrap → `'Pending'::character varying'` which is invalid SQL)
        // is wrong here. Detect this shape and pass through verbatim.
        if (/^'.*'::\w+(\s*\(\s*\d+\s*\))?(\s*\[\s*\])?$/.test(trimmedValue)) {
            return trimmedValue;
        }

        // Remove surrounding quotes for clean value
        let cleanValue = trimmedValue;
        if (cleanValue.startsWith("'") && cleanValue.endsWith("'")) {
            cleanValue = cleanValue.substring(1, cleanValue.length - 1);
        }

        if (needsQuotes) {
            // Single-quote-escape the cleaned value (SQL standard: '' → ').
            // Without this, a default of `O'Brien` would re-emit as `'O'Brien'`
            // which closes the literal at the apostrophe and then fails parsing.
            const escaped = cleanValue.replace(/'/g, "''");
            return `'${escaped}'`;
        }
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
    CASE WHEN is_nullable = 'YES' THEN TRUE ELSE FALSE END AS "AllowsNull"
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
        'LEN', 'LENGTH', 'DATALENGTH', 'LOWER', 'UPPER', 'LTRIM', 'RTRIM', 'TRIM', 'REPLACE',
        'SUBSTRING', 'CHARINDEX', 'PATINDEX', 'STUFF', 'CONCAT', 'FORMAT',
        'LEFT', 'RIGHT', 'POSITION', 'OVERLAY', 'EXTRACT', 'GREATEST', 'LEAST',
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
    getPendingEntityFieldsSQL(mjCoreSchema: string, entityIDs?: string[]): string {
        const qs = pgDialect.QuoteSchema.bind(pgDialect);
        return this.buildPendingEntityFieldsQuery(mjCoreSchema, qs, entityIDs);
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
     * Executes a SQL file against the PostgreSQL database using an in-process `pg` client.
     * Mirrors the SQL Server provider's in-process approach so CodeGen does not depend on
     * the `psql` CLI being installed on the host. Reads connection parameters from
     * environment variables (`PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USERNAME`,
     * `PG_PASSWORD`) with fallback to `configInfo` values.
     */
    async executeSQLFileViaShell(filePath: string): Promise<boolean> {
        const pgHost = process.env.PG_HOST ?? configInfo.dbHost;
        const pgPort = Number(process.env.PG_PORT ?? configInfo.dbPort ?? 5432);
        const pgDatabase = process.env.PG_DATABASE ?? configInfo.dbDatabase;
        const pgUser = process.env.PG_USERNAME ?? configInfo.codeGenLogin;
        const pgPassword = process.env.PG_PASSWORD ?? configInfo.codeGenPassword;

        if (!pgUser || !pgPassword || !pgDatabase) {
            throw new Error('PostgreSQL user, password, and database must be provided in the configuration or environment variables');
        }

        const absoluteFilePath = path.resolve(process.cwd(), filePath);
        let sql: string;
        try {
            sql = fs.readFileSync(absoluteFilePath, 'utf-8');
        } catch (e) {
            logError(`[CodeGen] Failed to read SQL file ${absoluteFilePath}: ${e instanceof Error ? e.message : e}`);
            return false;
        }
        if (!sql.trim()) return true;

        const pgModule = await import('pg');
        const client = new pgModule.default.Client({
            host: pgHost,
            port: pgPort,
            user: pgUser,
            password: pgPassword,
            database: pgDatabase,
        });

        try {
            await client.connect();
            // Postgres executes a multi-statement script in a single query call. A single
            // statement error aborts the rest of the batch server-side (simple query
            // protocol) — so silently converting that to `return true` hid real data loss:
            // CodeGen-generated DROP VIEW CASCADE would succeed, the follow-up CREATE
            // would fail, and the caller would believe everything was fine. Return false
            // on error and log it as an error, not a warning, so the per-entity batching
            // loops can aggregate and (in strict mode) halt the install.
            try {
                await client.query(sql);
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logError(`[CodeGen] SQL execution failed in ${path.basename(absoluteFilePath)}: ${msg.substring(0, 400)}`);
                return false;
            }
        } catch (e) {
            logError(`[CodeGen] Failed to execute SQL file ${absoluteFilePath}: ${e instanceof Error ? e.message : e}`);
            return false;
        } finally {
            try { await client.end(); } catch { /* best-effort cleanup */ }
        }
    }

    /** @inheritdoc */
    getRoutineNamesBySchemaSQL(schemas: string[]): string {
        if (schemas.length === 0) return '';
        // pg_proc holds every function (PL/pgSQL, SQL, C, etc.). prokind filters:
        //   'f' = normal function, 'p' = procedure, 'a' = aggregate, 'w' = window.
        // CodeGen emits 'f' (CRUD functions, root-ID TVFs, FTS functions) and 'p'
        // is unused on PG today but cheap to include in case we add procedures later.
        const inList = schemas.map(s => `'${s.replace(/'/g, "''")}'`).join(', ');
        return `SELECT n.nspname AS schema_name, p.proname AS routine_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind IN ('f', 'p')
  AND n.nspname IN (${inList});`;
    }

    /**
     * PG-specific base-view regeneration with 42P16 recovery.
     *
     * Runs the provided `CREATE OR REPLACE VIEW` SQL through `executeWithFallback`
     * on a dedicated connection: happy path issues the CREATE OR REPLACE directly,
     * and only on SQLSTATE 42P16 does the capture/drop/recreate/restore dance fire
     * inside a transaction that preserves every dependent view, function, grant,
     * comment, and owner. See `viewFallback.ts` for the contract.
     *
     * `willRegenerate` is passed through so dependents CodeGen is about to rebuild
     * in the same run are skipped at restore time (avoids restoring a stale
     * captured definition against a newly-regenerated target).
     */
    override async regenerateBaseView(
        entity: EntityInfo,
        viewSQL: string,
        willRegenerate?: Set<string>
    ): Promise<void> {
        const pgHost = process.env.PG_HOST ?? configInfo.dbHost;
        const pgPort = Number(process.env.PG_PORT ?? configInfo.dbPort ?? 5432);
        const pgDatabase = process.env.PG_DATABASE ?? configInfo.dbDatabase;
        const pgUser = process.env.PG_USERNAME ?? configInfo.codeGenLogin;
        const pgPassword = process.env.PG_PASSWORD ?? configInfo.codeGenPassword;

        if (!pgUser || !pgPassword || !pgDatabase) {
            throw new Error(
                'PostgreSQL user, password, and database must be provided in the configuration or environment variables'
            );
        }

        const pgModule = await import('pg');
        const client = new pgModule.default.Client({
            host: pgHost,
            port: pgPort,
            user: pgUser,
            password: pgPassword,
            database: pgDatabase,
        });

        await client.connect();
        try {
            await executeWithFallback({
                client,
                schema: entity.SchemaName,
                viewName: entity.BaseView,
                createOrReplaceSQL: viewSQL,
                willRegenerate,
                // Pass the base table so viewFallback can materialize a stub
                // first if the view body has a self-reference and the view
                // doesn't yet exist (e.g. vwRecordChanges joins to itself for
                // parent lookup; if it was CASCADE-dropped earlier in the
                // same codegen run, CREATE OR REPLACE can't resolve the
                // self-reference until a placeholder exists).
                baseTableQualified: pgDialect.QuoteSchema(entity.SchemaName, entity.BaseTable),
            });
        } finally {
            try { await client.end(); } catch { /* best-effort cleanup */ }
        }
    }

    /**
     * Phased per-entity execution for PG. Runs view → CRUD functions → view
     * permissions against the target DB, guaranteeing phase 2 is skipped if
     * phase 1 failed (so we never leave `fn_create_*` functions pointing at
     * a missing or stale view's rowtype).
     *
     * Phase 1 routes through `executeWithFallback` so a 42P16 triggers the
     * capture/drop/recreate/restore flow rather than blowing up. Phase 2 runs
     * each CRUD function's CREATE individually — we do NOT concatenate them
     * because node-pg's simple query protocol would then abort the whole
     * batch on the first failure; running them separately gives a per-routine
     * error signal. Phase 3 applies view-level GRANTs.
     */
    override async executeEntityPhased(opts: {
        entity: EntityInfo;
        tvfSQL: string;
        viewSQL: string;
        crudCreateSQL: string;
        crudUpdateSQL: string;
        crudDeleteSQL: string;
        viewPermSQL: string;
        willRegenerate?: Set<string>;
    }): Promise<PhasedExecutionResult> {
        const pgHost = process.env.PG_HOST ?? configInfo.dbHost;
        const pgPort = Number(process.env.PG_PORT ?? configInfo.dbPort ?? 5432);
        const pgDatabase = process.env.PG_DATABASE ?? configInfo.dbDatabase;
        const pgUser = process.env.PG_USERNAME ?? configInfo.codeGenLogin;
        const pgPassword = process.env.PG_PASSWORD ?? configInfo.codeGenPassword;

        if (!pgUser || !pgPassword || !pgDatabase) {
            throw new Error(
                'PostgreSQL user, password, and database must be provided in the configuration or environment variables'
            );
        }

        const pgModule = await import('pg');
        const client = new pgModule.default.Client({
            host: pgHost,
            port: pgPort,
            user: pgUser,
            password: pgPassword,
            database: pgDatabase,
        });

        await client.connect();
        try {
            // ── Phase 0: root-ID TVFs ────────────────────────────────────
            // The base view references these helper functions; PG rejects
            // CREATE VIEW with `function does not exist` if they aren't
            // installed first. Run as a single batch — these are independent
            // CREATE OR REPLACE FUNCTION statements separated by GO.
            if (opts.tvfSQL && opts.tvfSQL.trim()) {
                try {
                    await client.query(opts.tvfSQL);
                } catch (e) {
                    return {
                        success: false,
                        phase: 'tvf',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            // ── Phase 1: base view (fallback-aware for 42P16) ────────────
            if (opts.viewSQL && opts.viewSQL.trim()) {
                try {
                    await executeWithFallback({
                        client,
                        schema: opts.entity.SchemaName,
                        viewName: opts.entity.BaseView,
                        createOrReplaceSQL: opts.viewSQL,
                        willRegenerate: opts.willRegenerate,
                        baseTableQualified: pgDialect.QuoteSchema(opts.entity.SchemaName, opts.entity.BaseTable),
                    });
                } catch (e) {
                    return {
                        success: false,
                        phase: 'view',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            // ── Phase 2: CRUD functions (skipped if phase 1 failed) ──────
            // Run each CREATE FUNCTION separately so per-function errors
            // don't abort the others via simple-query-protocol semantics.
            for (const crudSQL of [opts.crudCreateSQL, opts.crudUpdateSQL, opts.crudDeleteSQL]) {
                if (!crudSQL || !crudSQL.trim()) continue;
                try {
                    await client.query(crudSQL);
                } catch (e) {
                    return {
                        success: false,
                        phase: 'functions',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            // ── Phase 3: view permissions ────────────────────────────────
            if (opts.viewPermSQL && opts.viewPermSQL.trim()) {
                try {
                    await client.query(opts.viewPermSQL);
                } catch (e) {
                    return {
                        success: false,
                        phase: 'permissions',
                        error: e instanceof Error ? e : new Error(String(e)),
                    };
                }
            }

            return { success: true, phase: null };
        } finally {
            try { await client.end(); } catch { /* best-effort cleanup */ }
        }
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

    /**
     * Like formatDefaultValue, but maps SQL Server BIT defaults (0/1) to PG
     * BOOLEAN literals (FALSE/TRUE) when the field type is bit/boolean.
     * COALESCE() in PG is type-strict — passing `COALESCE(boolean_param, 0)`
     * fails with "types boolean and integer cannot be matched".
     */
    private formatBooleanCompatibleDefault(ef: EntityFieldInfo): string {
        const formatted = this.formatDefaultValue(ef.DefaultValue, ef.NeedsQuotes);
        const fieldType = ef.Type.toLowerCase().trim();
        if (fieldType === 'bit' || fieldType === 'boolean' || fieldType === 'bool') {
            const t = formatted.trim().toLowerCase();
            if (t === '0' || t === "'0'") return 'FALSE';
            if (t === '1' || t === "'1'") return 'TRUE';
        }
        return formatted;
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

        // Composite-PK tables: every PK column has AllowUpdateAPI=0, so generateInsertFieldString
        // filters them all out. Prepend them to finalColumns/finalValues so the INSERT is valid.
        // (The single-PK uniqueidentifier case is already handled above via v_new_id.)
        let finalColumns = insertColumns;
        let finalValues = insertValues;
        if (entity.PrimaryKeys.length > 1) {
            const pkColumns = entity.PrimaryKeys
                .map((k: EntityFieldInfo) => pgDialect.QuoteIdentifier(k.Name))
                .join(',\n            ');
            const pkValues = entity.PrimaryKeys
                .map((k: EntityFieldInfo) => `p_${this.toSnakeCase(k.CodeName)}`)
                .join(',\n            ');
            finalColumns = `${pkColumns},\n            ${insertColumns}`;
            finalValues = `${pkValues},\n            ${insertValues}`;
        }

        return {
            preInsert: '',
            returningClause: '',
            selectClause: `SELECT * FROM ${pgDialect.QuoteSchema(entity.SchemaName, viewName)}\n    WHERE ${selectWhere}`,
            finalColumns,
            finalValues,
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
        qs: (schema: string, name: string) => string,
        entityIDs?: string[]
    ): string {
        // PG uses lowercase UUIDs; entity IDs from the metadata cache are already
        // normalized so direct string interpolation is safe (internal IDs, not user input).
        const scopeFilter = entityIDs && entityIDs.length > 0
            ? `AND sf."EntityID" IN (${entityIDs.map(id => `'${id}'`).join(',')})`
            : '';
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
      CASE WHEN sf."FieldName" = 'Name' THEN TRUE ELSE FALSE END AS "IsNameField",
      CASE WHEN pk."ColumnName" IS NOT NULL THEN TRUE ELSE FALSE END AS "IsPrimaryKey",
      CASE
            WHEN pk."ColumnName" IS NOT NULL THEN TRUE
            WHEN uk."ColumnName" IS NOT NULL THEN TRUE
            ELSE FALSE
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
      ${scopeFilter}
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
        return `CASE WHEN sf."IsVirtual" = true THEN FALSE
           WHEN sf."FieldName" = '${EntityInfo.CreatedAtFieldName}' THEN FALSE
           WHEN sf."FieldName" = '${EntityInfo.UpdatedAtFieldName}' THEN FALSE
           WHEN sf."FieldName" = '${EntityInfo.DeletedAtFieldName}' THEN FALSE
           WHEN pk."ColumnName" IS NOT NULL THEN FALSE
           ELSE TRUE
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
  AND vf."AllowsNull" != fk."AllowsNull";
`;
    }

}
