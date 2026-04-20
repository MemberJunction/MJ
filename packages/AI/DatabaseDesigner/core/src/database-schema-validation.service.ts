/**
 * @module database-schema-validation.service
 * @description Pure TypeScript service that runs all deterministic Database Designer
 * validation checks.  No agent, no LLM, no auth — validation logic only.
 *
 * Shared by both execution paths so there is exactly one place to update when
 * rules change:
 *  - Agent path: `DatabaseDesignerSchemaValidator` delegates here via `runValidationChecks()`
 *  - Action path: `ValidateEntitySchemaAction` calls `validate()` directly, enabling
 *    the Angular visual wizard to pre-validate before submitting to the pipeline
 *
 * Security layers enforced (in order):
 *  1. Schema blocklist — delegates to `RuntimeSchemaManager.GetAllProtectedSchemas()`
 *     so Database Designer and the DDL pipeline share a single source of truth
 *  2. SchemaEngine structural validation — identifier safety, non-empty column list
 *  3. Reserved column names — no ID / __mj_CreatedAt / __mj_UpdatedAt
 *  4. Naming conflict check — no duplicate BaseTable or EntityName in MJ entities
 *
 * Authorization is intentionally **NOT** checked here.  Callers are responsible
 * for verifying that the requesting user holds the required authorization before
 * calling `validate()`.  This keeps the service cohesive and testable without
 * needing a user context for the first three checks.
 */

import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { RuntimeSchemaManager, SchemaValidator } from '@memberjunction/schema-engine';
import type { TableDefinition } from '@memberjunction/schema-engine';

import {
    CODEGEN_RESERVED_COLUMNS,
    UDT_SCHEMA_NAME,
    escapeSqlLiteral,
    type EntityValidationResult,
} from './interfaces.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs all deterministic pre-creation / pre-modification validation checks
 * for a `TableDefinition`.  Returns an `EntityValidationResult` with every
 * error and warning found in a single pass.
 *
 * Instantiate a new instance per call — the service is stateless and has no
 * caching, so there is no benefit to reuse.
 */
export class DatabaseSchemaValidationService {

    /**
     * Run the full validation pipeline against `tableDefinition`.
     *
     * @param tableDefinition - The fully-formed table definition to validate.
     * @param contextUser - The requesting user, forwarded to RunView for DB checks.
     *   May be undefined in tests; RunView handles it.
     * @param modificationType - 'create' (default) or 'alter'.  Controls which
     *   naming-existence check is applied: create requires the entity NOT to exist,
     *   alter requires it to exist.
     * @returns Aggregated validation result with all errors and warnings.
     */
    public async validate(
        tableDefinition: TableDefinition,
        contextUser: UserInfo | undefined,
        modificationType: 'create' | 'alter' = 'create'
    ): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check 1: schema blocklist (fast, synchronous — short-circuit on failure
        // since subsequent checks would produce misleading errors for a blocked schema)
        this.checkBlockedSchema(tableDefinition.SchemaName, errors);
        if (errors.length > 0) {
            return { Valid: false, Errors: errors, Warnings: [] };
        }

        // Checks 2–4 run in parallel where possible via independent accumulation
        this.checkSchemaEngineValidation(tableDefinition, errors, warnings);
        this.checkReservedColumnNames(tableDefinition, errors);

        // For create: confirm no entity with this name/table exists yet.
        // For alter: confirm the target entity already exists in MJ metadata.
        if (modificationType === 'alter') {
            await this.checkEntityMustExist(tableDefinition, contextUser, errors);
        } else {
            await this.checkNamingConflicts(tableDefinition, contextUser, errors);
        }

        return { Valid: errors.length === 0, Errors: errors, Warnings: warnings };
    }

    // ─── Validation checks ────────────────────────────────────────────────────

    /**
     * Reject schemas that `RuntimeSchemaManager` protects.
     * `__mj` is always blocked; additional schemas can be added via the
     * `RSU_PROTECTED_SCHEMAS` environment variable.
     */
    private checkBlockedSchema(schemaName: string, errors: string[]): void {
        const blocked = RuntimeSchemaManager.Instance.GetAllProtectedSchemas();
        if (blocked.has(schemaName.toLowerCase())) {
            errors.push(
                `Schema '${schemaName}' is protected and cannot be used with the Database Designer. ` +
                `Use '${UDT_SCHEMA_NAME}' for user-defined tables, or request access to a custom schema.`
            );
        }
    }

    /**
     * Delegate structural validation to SchemaEngine.
     * Catches invalid SQL identifiers, empty column lists, and other
     * structural issues that would cause the migration to fail.
     */
    private checkSchemaEngineValidation(
        tableDefinition: TableDefinition,
        errors: string[],
        warnings: string[]
    ): void {
        const result = SchemaValidator.Validate(tableDefinition);
        errors.push(...result.Errors);
        warnings.push(...result.Warnings);
    }

    /**
     * Ensure no user-defined column collides with MJ's auto-injected system
     * columns (ID, __mj_CreatedAt, __mj_UpdatedAt).  CodeGen adds these
     * automatically — including them manually causes DDL conflicts.
     */
    private checkReservedColumnNames(tableDefinition: TableDefinition, errors: string[]): void {
        for (const col of tableDefinition.Columns) {
            if (CODEGEN_RESERVED_COLUMNS.has(col.Name.toLowerCase())) {
                errors.push(
                    `Column '${col.Name}' is automatically managed by MemberJunction's CodeGen ` +
                    `and must not be defined manually. Remove it from the column list.`
                );
            }
        }
    }

    /**
     * Query MJ metadata for an existing entity that shares the same table
     * name or entity name in the same schema — either would cause a CodeGen
     * conflict at migration time.
     */
    private async checkNamingConflicts(
        tableDefinition: TableDefinition,
        contextUser: UserInfo | undefined,
        errors: string[]
    ): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Entities',
            ExtraFilter:
                `(Name = '${escapeSqlLiteral(tableDefinition.EntityName)}' ` +
                `OR BaseTable = '${escapeSqlLiteral(tableDefinition.TableName)}') ` +
                `AND SchemaName = '${escapeSqlLiteral(tableDefinition.SchemaName)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);

        if (result.Success && result.Results.length > 0) {
            errors.push(
                `An entity with the name '${tableDefinition.EntityName}' or table ` +
                `'${tableDefinition.TableName}' already exists in schema ` +
                `'${tableDefinition.SchemaName}'. Choose a different name.`
            );
        }
    }

    /**
     * For alter operations: verify the target table is already registered as a
     * MemberJunction entity.  Prevents the pipeline from attempting to ALTER a
     * table that has no entity record — which would succeed at the DDL level but
     * leave MJ metadata out of sync.
     */
    private async checkEntityMustExist(
        tableDefinition: TableDefinition,
        contextUser: UserInfo | undefined,
        errors: string[]
    ): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Entities',
            ExtraFilter:
                `BaseTable = '${escapeSqlLiteral(tableDefinition.TableName)}' ` +
                `AND SchemaName = '${escapeSqlLiteral(tableDefinition.SchemaName)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) {
            errors.push(
                `No entity found for table '${tableDefinition.SchemaName}.${tableDefinition.TableName}'. ` +
                `Cannot modify an entity that does not exist in MemberJunction.`
            );
        }
    }
}
