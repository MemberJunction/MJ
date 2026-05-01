/**
 * @module create-entity.action
 * @description Action that creates a new MemberJunction entity from a
 * TableDefinition.  Validates authorization then delegates to the shared RSU
 * pipeline executor.
 *
 * Intended callers:
 *  - Agent Manager's Planning Designer sub-agent
 *  - Any agent with the 'Create in UDT Schema' or 'Create in Custom Schema' auth
 *  - Workflow engines / low-code builders
 *
 * This action does NOT run the full conversational Database Designer flow.
 * Callers must supply a pre-formed TableDefinition.
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

import { DatabaseDesignerPipelineExecutor, UDT_SETTINGS } from '@memberjunction/database-designer-core';

import { BaseDatabaseDesignerAction } from './base-database-designer.action.js';

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Creates a new MemberJunction entity from a fully-formed `TableDefinition`.
 *
 * Input params:
 *  - `TableDefinition` (required) — JSON object conforming to the schema-engine
 *    `TableDefinition` interface.
 *  - `SkipGitCommit` (optional, default false) — skip creating a migration git commit.
 *  - `SkipRestart` (optional, default false) — skip restarting MJAPI after the pipeline.
 *
 * Output params written on success:
 *  - `EntityID`       — MJ entity UUID.
 *  - `EntityName`     — Human-readable entity name.
 *  - `SchemaName`     — Database schema.
 *  - `TableName`      — Physical table name.
 *  - `PipelineSteps`  — Array of step summaries from RuntimeSchemaManager.
 */
@RegisterClass(BaseAction, 'Create Entity')
export class CreateEntityAction extends BaseDatabaseDesignerAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const { td, error: tdError } = this.getTableDefinitionParam(params);
            if (tdError) return tdError;

            const authError = await this.checkAuthorization(td!, 'create', params.ContextUser);
            if (authError) {
                return { Success: false, ResultCode: 'UNAUTHORIZED', Message: authError };
            }

            const options = this.buildPipelineOptions(params, UDT_SETTINGS.SOURCE_DATABASE_DESIGNER);
            const execResult = await DatabaseDesignerPipelineExecutor.CreateEntity(
                td!,
                params.ContextUser,
                options
            );

            return this.buildPipelineResult(execResult, params);
        } catch (err) {
            return this.handleUnexpected(err, 'Create Entity');
        }
    }
}
