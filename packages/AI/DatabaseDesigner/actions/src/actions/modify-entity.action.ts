/**
 * @module modify-entity.action
 * @description Action that applies ALTER TABLE changes to an existing MJ entity
 * based on a new `TableDefinition` (desired state).
 *
 * Execution path:
 *  1. Extract and validate params
 *  2. Authorization check
 *  3. Load existing table info via DatabaseDesignerPipelineExecutor.LoadExistingTableInfo
 *  4. Delegate to DatabaseDesignerPipelineExecutor.ModifyEntity
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

import {
    DatabaseDesignerPipelineExecutor,
    UDT_SETTINGS,
} from '@memberjunction/database-designer-core';

import { BaseDatabaseDesignerAction } from './base-database-designer.action.js';

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Applies ALTER TABLE changes to an existing MemberJunction entity.
 *
 * Input params:
 *  - `TableDefinition` (required) — desired table state as a JSON object.
 *  - `SkipGitCommit`   (optional, default false)
 *  - `SkipRestart`     (optional, default false)
 *
 * Output params written on success:
 *  - `EntityID`, `EntityName`, `SchemaName`, `TableName`, `PipelineSteps`
 */
@RegisterClass(BaseAction, 'Modify Entity')
export class ModifyEntityAction extends BaseDatabaseDesignerAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const { td, error: tdError } = this.getTableDefinitionParam(params);
            if (tdError) return tdError;

            const authError = await this.checkAuthorization(td!, 'alter', params.ContextUser);
            if (authError) {
                return { Success: false, ResultCode: 'UNAUTHORIZED', Message: authError };
            }

            const existingInfo = await DatabaseDesignerPipelineExecutor.LoadExistingTableInfo(
                td!.SchemaName,
                td!.TableName,
                params.ContextUser
            );
            if (!existingInfo) {
                return {
                    Success: false,
                    ResultCode: 'ENTITY_NOT_FOUND',
                    Message: `Table '${td!.SchemaName}.${td!.TableName}' was not found in the database.`,
                };
            }

            const options = this.buildPipelineOptions(params, UDT_SETTINGS.SOURCE_DATABASE_DESIGNER);
            const execResult = await DatabaseDesignerPipelineExecutor.ModifyEntity(
                td!,
                existingInfo,
                params.ContextUser,
                options
            );

            return this.buildPipelineResult(execResult, params);
        } catch (err) {
            return this.handleUnexpected(err, 'Modify Entity');
        }
    }
}
