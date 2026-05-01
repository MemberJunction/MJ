/**
 * @module validate-entity-schema.action
 * @description Action that validates a `TableDefinition` against all Entity
 * Designer pre-creation checks without executing the RSU pipeline.
 *
 * Intended callers:
 *  - Angular visual wizard (Step 4 — Review) pre-validates before the user
 *    submits to `CreateEntityAction` so errors surface early without a
 *    round-trip through the full pipeline.
 *  - Any workflow that needs a dry-run validation step before creation.
 *
 * This action runs the same `DatabaseSchemaValidationService` that the agent
 * path (`DatabaseDesignerSchemaValidator`) uses, ensuring both paths are
 * governed by identical rules.
 *
 * Input params:
 *  - `TableDefinition` (required) — JSON object conforming to the schema-engine
 *    `TableDefinition` interface.
 *  - `ModificationType` (optional, default 'create') — 'create' | 'alter'.
 *    Determines which authorization is checked before validation.
 *
 * Output params written on both success and validation failure:
 *  - `ValidationResult` — `{ Valid, Errors, Warnings }` — always present on
 *    `Success: true` so callers can inspect details without parsing `Message`.
 *
 * ResultCode values:
 *  - `VALIDATION_PASSED` — definition is valid, safe to proceed to CreateEntity.
 *  - `VALIDATION_FAILED` — definition has errors; inspect `ValidationResult.Errors`.
 *  - `UNAUTHORIZED`      — contextUser lacks the required authorization.
 *  - `MISSING_PARAMETER` — required params were not provided.
 *  - `UNEXPECTED_ERROR`  — unhandled exception (check server logs).
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

import {
    DatabaseSchemaValidationService,
} from '@memberjunction/database-designer-core';

import { BaseDatabaseDesignerAction } from './base-database-designer.action.js';

// ─── Registration ─────────────────────────────────────────────────────────────

@RegisterClass(BaseAction, 'Validate Entity Schema')
export class ValidateEntitySchemaAction extends BaseDatabaseDesignerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const { td, error: tdError } = this.getTableDefinitionParam(params);
            if (tdError) return tdError;

            const modificationType = this.getModificationTypeParam(params);

            // Authorization check: verify the user is allowed to perform this
            // operation type before revealing any validation details.
            const authError = await this.checkAuthorization(td!, modificationType, params.ContextUser);
            if (authError) {
                return { Success: false, ResultCode: 'UNAUTHORIZED', Message: authError };
            }

            // Run all deterministic validation checks via the shared service.
            const service = new DatabaseSchemaValidationService();
            const validationResult = await service.validate(td!, params.ContextUser, modificationType);

            // Always write the structured result as an output param so callers
            // can read Errors/Warnings without parsing the human-readable Message.
            this.addOutputParam(params, 'ValidationResult', validationResult);

            if (validationResult.Valid) {
                return {
                    Success: true,
                    ResultCode: 'VALIDATION_PASSED',
                    Message: 'Validation passed. The entity definition is ready for creation.',
                };
            }

            return {
                Success: true, // Action ran successfully — validation result is the output
                ResultCode: 'VALIDATION_FAILED',
                Message: `Validation failed: ${validationResult.Errors.join('; ')}`,
            };

        } catch (err) {
            return this.handleUnexpected(err, 'Validate Entity Schema');
        }
    }
}
