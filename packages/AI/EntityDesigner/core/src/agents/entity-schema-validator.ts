/**
 * @module entity-schema-validator
 * @description Code-based sub-agent that deterministically validates a
 * TableDefinition before it is handed to the Schema Builder.
 *
 * No LLM is invoked — all checks are pure TypeScript so that errors are
 * consistent, fast, and audit-able.
 *
 * Security layers enforced here (in order):
 *  1. MJ Authorization check (contextUser must hold the required auth)
 *  2. Entity Designer schema blocklist (dbo, sys, __mj, INFORMATION_SCHEMA)
 *  3. SchemaEngine.Validate() — identifier safety, non-empty column list
 *  4. Naming conflict check — no duplicate BaseTable or EntityName in MJ
 *  5. Reserved column names — no ID / __mj_CreatedAt / __mj_UpdatedAt
 *
 * On success, writes `ValidationResult` to payload and returns step 'Success'.
 * On auth failure, returns step 'Failed' immediately (no validation details
 * are leaked to the caller to avoid oracle attacks).
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { SchemaValidator, type TableDefinition } from '@memberjunction/schema-engine';

import {
    type EntityDesignerPayload,
    type EntityValidationResult,
    ENTITY_DESIGNER_BLOCKED_SCHEMAS,
    CODEGEN_RESERVED_COLUMNS,
    AUTHORIZATIONS,
    UDT_SCHEMA_NAME,
    escapeSqlLiteral,
} from '../interfaces.js';

// ─── Driver registration ─────────────────────────────────────────────────────

@RegisterClass(BaseAgent, 'EntityDesignerSchemaValidator')
export class EntityDesignerSchemaValidator extends BaseAgent {

    // ─── LLM bypass ────────────────────────────────────────────────────────

    /**
     * Override the Loop-agent execution loop entirely.  All logic is
     * deterministic TypeScript — no prompt, no model invocation.
     */
    protected override async executeAgentInternal<P = EntityDesignerPayload>(
        params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const payload = params.payload as EntityDesignerPayload ?? {};

        const tableDefinition = payload.SchemaDesign?.TableDefinition;
        if (!tableDefinition) {
            return this.buildFailure(
                'Schema Validator received no TableDefinition in payload.SchemaDesign. ' +
                'The Schema Designer sub-agent must populate this field before validation can proceed.'
            );
        }

        const authError = await this.checkAuthorization(tableDefinition, payload, params);
        if (authError) {
            return this.buildFailure(authError);
        }

        const validationResult = await this.runValidationChecks(tableDefinition, params);

        const newPayload: EntityDesignerPayload = {
            ...payload,
            ValidationResult: validationResult,
        };

        if (!validationResult.Valid) {
            // Return Success so the orchestrator can report errors back to the
            // user (via the ValidationResult), rather than terminating the run.
            return this.buildSuccess(newPayload as P, 'Validation failed — errors written to ValidationResult');
        }

        return this.buildSuccess(newPayload as P, 'Validation passed');
    }

    // ─── Authorization ────────────────────────────────────────────────────

    /**
     * Determine which authorization is required for the requested operation
     * and check whether `contextUser` holds it.
     *
     * Returns a non-empty error string on failure, null on success.
     */
    private async checkAuthorization(
        tableDefinition: TableDefinition,
        payload: EntityDesignerPayload,
        params: ExecuteAgentParams
    ): Promise<string | null> {
        const authName = this.resolveRequiredAuthorization(tableDefinition, payload);
        if (!authName) {
            return null; // no auth needed (shouldn't happen in normal flow)
        }

        const md = new Metadata();
        const auth = md.Authorizations.find(a => a.Name === authName);
        if (!auth) {
            // Authorization record not seeded — deny to be safe
            return (
                `Authorization '${authName}' is not configured in this system. ` +
                `An administrator must push the schema-management authorization metadata.`
            );
        }

        const canExecute = auth.UserCanExecute(params.contextUser);
        if (!canExecute) {
            return `User does not have the '${authName}' authorization required for this operation.`;
        }

        return null;
    }

    /**
     * Map the requested operation to the finest-grained authorization that
     * covers it.  This determines the minimum required permission.
     *
     * TODO(Phase3 — Ownership Check): For 'alter' operations, load the
     * MJ:UDT:Owner EntitySettings record for the entity and check:
     *   - Owner matches contextUser.ID → require MODIFY_OWN_ENTITIES
     *   - Owner differs (admin modifying someone else's entity) → require
     *     MODIFY_ANY_UDT_ENTITIES
     * Also block modification of non-UDT entities (no MJ:UDT:Source setting).
     * SchemaDesign.ExistingEntityID (set by Schema Designer) is the handle
     * for loading the EntitySettings records.
     */
    private resolveRequiredAuthorization(
        tableDefinition: TableDefinition,
        payload: EntityDesignerPayload
    ): string | null {
        const modificationType = payload.SchemaDesign?.ModificationType ?? 'create';

        if (modificationType === 'create') {
            return tableDefinition.SchemaName.toLowerCase() === UDT_SCHEMA_NAME.toLowerCase()
                ? AUTHORIZATIONS.CREATE_IN_UDT_SCHEMA
                : AUTHORIZATIONS.CREATE_IN_CUSTOM_SCHEMA;
        }

        // For alter: Phase 2 always uses the base modify auth.
        // Phase 3 will refine this based on ownership (see TODO above).
        return AUTHORIZATIONS.MODIFY_OWN_ENTITIES;
    }

    // ─── Validation pipeline ─────────────────────────────────────────────

    /**
     * Run all deterministic validation checks and aggregate results.
     * Returns early if the schema blocklist rejects the request.
     */
    private async runValidationChecks(
        tableDefinition: TableDefinition,
        params: ExecuteAgentParams
    ): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        this.checkBlockedSchema(tableDefinition.SchemaName, errors);
        if (errors.length > 0) {
            // No point running further checks — the schema itself is off-limits.
            return { Valid: false, Errors: errors, Warnings: [] };
        }

        this.checkSchemaEngineValidation(tableDefinition, errors, warnings);
        this.checkReservedColumnNames(tableDefinition, errors);
        await this.checkNamingConflicts(tableDefinition, params, errors);

        return { Valid: errors.length === 0, Errors: errors, Warnings: warnings };
    }

    /** Reject schemas that Entity Designer is not permitted to touch. */
    private checkBlockedSchema(schemaName: string, errors: string[]): void {
        if (ENTITY_DESIGNER_BLOCKED_SCHEMAS.has(schemaName.toLowerCase())) {
            errors.push(
                `Schema '${schemaName}' is reserved and cannot be used with the Entity Designer. ` +
                `Use '${UDT_SCHEMA_NAME}' for user-defined tables.`
            );
        }
    }

    /** Delegate structural validation to SchemaEngine (identifier safety, etc.). */
    private checkSchemaEngineValidation(
        tableDefinition: TableDefinition,
        errors: string[],
        warnings: string[]
    ): void {
        const result = SchemaValidator.Validate(tableDefinition);
        errors.push(...result.Errors);
        warnings.push(...result.Warnings);
    }

    /** Ensure no column collides with MJ's auto-injected system columns. */
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
     * Check for an existing MJ entity that shares the same table name or
     * entity name — either would cause a CodeGen conflict.
     */
    private async checkNamingConflicts(
        tableDefinition: TableDefinition,
        params: ExecuteAgentParams,
        errors: string[]
    ): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'Entities',
            ExtraFilter:
                `(Name = '${escapeSqlLiteral(tableDefinition.EntityName)}' ` +
                `OR BaseTable = '${escapeSqlLiteral(tableDefinition.TableName)}') ` +
                `AND SchemaName = '${escapeSqlLiteral(tableDefinition.SchemaName)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, params.contextUser);

        if (result.Success && result.Results.length > 0) {
            errors.push(
                `An entity with the name '${tableDefinition.EntityName}' or table '${tableDefinition.TableName}' ` +
                `already exists in schema '${tableDefinition.SchemaName}'. Choose a different name.`
            );
        }
    }

    // ─── Result builders ──────────────────────────────────────────────────

    private buildSuccess<P>(newPayload: P, reasoning: string): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
        return {
            finalStep: { terminate: true, step: 'Success', reasoning, newPayload },
            stepCount: 1,
        };
    }

    private buildFailure<P>(reasoning: string): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
        return {
            finalStep: { terminate: true, step: 'Failed', reasoning },
            stepCount: 1,
        };
    }
}
