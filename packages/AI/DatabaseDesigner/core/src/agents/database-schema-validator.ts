/**
 * @module database-schema-validator
 * @description Code-based sub-agent that deterministically validates all
 * TableDefinitions in SchemaDesign.Tables[] before they are handed to the
 * Schema Builder.
 *
 * No LLM is invoked — all checks are pure TypeScript so that errors are
 * consistent, fast, and audit-able.
 *
 * Security layers enforced here (in order):
 *  1. MJ Authorization check (contextUser must hold the required auth for EACH table)
 *  2. Database Designer schema blocklist (dbo, sys, __mj, INFORMATION_SCHEMA)
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
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { BaseDatabaseDesignerCodeAgent } from './base-database-designer-code-agent.js';
import { AuthorizationEvaluator, LogError, Metadata, RunView } from '@memberjunction/core';

import {
    type DatabaseDesignerPayload,
    type EntityValidationResult,
    type SchemaDesignEntry,
    AUTHORIZATIONS,
    UDT_SCHEMA_NAME,
    UDT_SETTINGS,
    escapeSqlLiteral,
} from '../interfaces.js';

import { DatabaseSchemaValidationService } from '../database-schema-validation.service.js';

// ─── Driver registration ─────────────────────────────────────────────────────

@RegisterClass(BaseAgent, 'DatabaseDesignerSchemaValidator')
export class DatabaseDesignerSchemaValidator extends BaseDatabaseDesignerCodeAgent {

    // ─── LLM bypass ────────────────────────────────────────────────────────

    /**
     * Override the Loop-agent execution loop entirely.  All logic is
     * deterministic TypeScript — no prompt, no model invocation.
     */
    protected override async executeAgentInternal<P = DatabaseDesignerPayload>(
        params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const payload = params.payload as DatabaseDesignerPayload ?? {};

        const tables = payload.SchemaDesign?.Tables;
        if (!tables?.length) {
            return this.buildCodeFailure(
                'Schema Validator received no Tables in payload.SchemaDesign. ' +
                'The Schema Designer sub-agent must populate SchemaDesign.Tables[] before validation can proceed.'
            );
        }

        // Guard: assert all expected authorization records exist at runtime.
        this.assertAuthorizationsExist();

        for (const entry of tables) {
            const authError = await this.checkAuthorizationForEntry(entry, payload, params);
            if (authError) {
                return this.buildCodeFailure(authError);
            }
        }

        const validationResult = await this.runBatchValidationChecks(tables, params);

        const newPayload: DatabaseDesignerPayload = {
            ...payload,
            ValidationResult: validationResult,
        };

        if (!validationResult.Valid) {
            // Return Success so the orchestrator can report errors back to the
            // user (via the ValidationResult), rather than terminating the run.
            return this.buildCodeSuccess(newPayload as P, 'Validation failed — errors written to ValidationResult');
        }

        return this.buildCodeSuccess(newPayload as P, 'Validation passed');
    }

    // ─── Authorization ────────────────────────────────────────────────────

    /**
     * Assert that all expected authorization records exist in Metadata at runtime.
     * Logs an error (but does not throw) when a record is missing — a missing record
     * means the schema-management metadata was not pushed.
     */
    private assertAuthorizationsExist(): void {
        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment
        for (const authName of Object.values(AUTHORIZATIONS)) {
            if (!md.Authorizations.find(a => a.Name === authName)) {
                LogError(
                    `DatabaseDesignerSchemaValidator: authorization '${authName}' is not found in ` +
                    `Metadata.Authorizations. Push metadata/authorizations/.schema-management.json ` +
                    `via mj sync push to seed the required records.`
                );
            }
        }
    }

    /**
     * Determine which authorization is required for the requested operation on a
     * single entry and check whether `contextUser` holds it.
     *
     * Returns a non-empty error string on failure, null on success.
     */
    private async checkAuthorizationForEntry(
        entry: SchemaDesignEntry,
        payload: DatabaseDesignerPayload,
        params: ExecuteAgentParams
    ): Promise<string | null> {
        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment

        const authName = await this.resolveRequiredAuthorizationForEntry(entry, payload, params);
        if (!authName) {
            return null;
        }

        const auth = md.Authorizations.find(a => a.Name === authName);
        if (!auth) {
            return (
                `Authorization '${authName}' is not configured in this system. ` +
                `An administrator must push the schema-management authorization metadata.`
            );
        }

        const evaluator = new AuthorizationEvaluator();
        const canExecute = evaluator.UserCanExecuteWithAncestors(auth, params.contextUser, md.Authorizations);
        if (!canExecute) {
            return `User does not have the '${authName}' authorization required for this operation.`;
        }

        return null;
    }

    /**
     * Map the requested operation for a single entry to the finest-grained
     * authorization that covers it.
     *
     * For alter operations, reads the `MJ:UDT:Owner` EntitySettings record to
     * determine whether the user is the entity's owner:
     * - Owner match → require `MODIFY_OWN_ENTITIES`
     * - Owner mismatch or no owner record → require `MODIFY_ANY_UDT_ENTITIES`
     * - No `MJ:UDT:Source` record → entity was not created via Database Designer;
     *   fall back to `MODIFY_ANY_UDT_ENTITIES` (admin-only modification).
     */
    private async resolveRequiredAuthorizationForEntry(
        entry: SchemaDesignEntry,
        _payload: DatabaseDesignerPayload,
        params: ExecuteAgentParams
    ): Promise<string | null> {
        const modificationType = entry.ModificationType ?? 'create';

        if (modificationType === 'create') {
            return entry.TableDefinition.SchemaName.toLowerCase() === UDT_SCHEMA_NAME.toLowerCase()
                ? AUTHORIZATIONS.CREATE_IN_UDT_SCHEMA
                : AUTHORIZATIONS.CREATE_IN_CUSTOM_SCHEMA;
        }

        return this.resolveModifyAuthorization(entry, params);
    }

    /**
     * Resolve the required authorization for an alter (modify) operation by
     * loading the entity's provenance from MJ: Entity Settings.
     *
     * Falls back to the most restrictive permission (`MODIFY_ANY_UDT_ENTITIES`)
     * whenever ownership cannot be confirmed, ensuring a safe default.
     */
    private async resolveModifyAuthorization(
        entry: SchemaDesignEntry,
        params: ExecuteAgentParams
    ): Promise<string> {
        const existingEntityID = entry.ExistingEntityID;
        if (!existingEntityID) {
            // No entity ID — can't check ownership; require elevated permission
            return AUTHORIZATIONS.MODIFY_ANY_UDT_ENTITIES;
        }

        const rv = new RunView();
        const result = await rv.RunView<{ Name: string; Value: string }>({
            EntityName: 'MJ: Entity Settings',
            ExtraFilter: (
                `EntityID = '${escapeSqlLiteral(existingEntityID)}' ` +
                `AND Name IN ('${UDT_SETTINGS.OWNER_KEY}', '${UDT_SETTINGS.SOURCE_KEY}')`
            ),
            Fields: ['Name', 'Value'],
            ResultType: 'simple',
        }, params.contextUser);

        if (!result.Success) {
            return AUTHORIZATIONS.MODIFY_ANY_UDT_ENTITIES;
        }

        const settings = new Map(result.Results.map(r => [r.Name, r.Value]));

        // Entity not created via Database Designer — no provenance record means we
        // cannot safely allow lower-privileged modification
        if (!settings.has(UDT_SETTINGS.SOURCE_KEY)) {
            return AUTHORIZATIONS.MODIFY_ANY_UDT_ENTITIES;
        }

        const ownerID = settings.get(UDT_SETTINGS.OWNER_KEY);
        const isOwner = ownerID != null && UUIDsEqual(ownerID, params.contextUser?.ID ?? '');
        return isOwner ? AUTHORIZATIONS.MODIFY_OWN_ENTITIES : AUTHORIZATIONS.MODIFY_ANY_UDT_ENTITIES;
    }

    // ─── Validation pipeline ─────────────────────────────────────────────

    /**
     * Delegate all deterministic validation checks to `DatabaseSchemaValidationService`.
     * Uses the batch validation path so cross-table checks (duplicate EntityName,
     * duplicate TableName within schema) are also enforced.
     *
     * The service is the single source of truth for validation logic so that the
     * agent path and the action path (`ValidateEntitySchemaAction`) stay in sync.
     */
    private async runBatchValidationChecks(
        tables: SchemaDesignEntry[],
        params: ExecuteAgentParams
    ): Promise<EntityValidationResult> {
        const service = new DatabaseSchemaValidationService();
        return service.validateBatch(tables, params.contextUser);
    }

}
