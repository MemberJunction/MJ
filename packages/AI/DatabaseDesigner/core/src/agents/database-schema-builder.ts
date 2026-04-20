/**
 * @module database-schema-builder
 * @description Code-based sub-agent that executes the RSU pipeline to
 * materialise a validated TableDefinition as a live MemberJunction entity.
 *
 * Execution sequence:
 *  1. Guard: ValidationResult must exist and be Valid (fail fast with distinct messages)
 *  2. Guard: SchemaDesign.TableDefinition must be present
 *  3. Delegate to DatabaseDesignerPipelineExecutor.CreateEntity() or ModifyEntity()
 *  4. Write DatabaseDesignerResult to payload
 *
 * No LLM is invoked — this is pure orchestration of the SchemaEngine and
 * RuntimeSchemaManager infrastructure that already exists in the monorepo.
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';

import { BaseDatabaseDesignerCodeAgent } from './base-database-designer-code-agent.js';

import { DatabaseDesignerPipelineExecutor, type PipelineExecutionOptions } from '../pipeline-executor.js';
import type {
    DatabaseDesignerPayload,
    DatabaseDesignerResult,
    PipelineExecutionResult,
} from '../interfaces.js';
import { UDT_SETTINGS } from '../interfaces.js';

// ─── Driver registration ─────────────────────────────────────────────────────

@RegisterClass(BaseAgent, 'DatabaseDesignerSchemaBuilder')
export class DatabaseDesignerSchemaBuilder extends BaseDatabaseDesignerCodeAgent {

    // ─── LLM bypass ────────────────────────────────────────────────────────

    /**
     * Override the Loop-agent execution loop entirely.
     * Drives the RSU pipeline and writes the outcome to `DatabaseDesignerResult`.
     */
    protected override async executeAgentInternal<P = DatabaseDesignerPayload>(
        params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const payload = params.payload as DatabaseDesignerPayload ?? {};

        const guardError = this.validatePreconditions(payload);
        if (guardError) {
            return this.buildCodeFailure(guardError);
        }

        const tableDefinition = payload.SchemaDesign!.TableDefinition!;
        const modificationType = payload.SchemaDesign!.ModificationType ?? 'create';
        const pipelineOptions = this.buildPipelineOptions(payload);

        let execResult: PipelineExecutionResult;
        if (modificationType === 'alter') {
            execResult = await this.runModify(payload, params, pipelineOptions);
        } else {
            execResult = await DatabaseDesignerPipelineExecutor.CreateEntity(
                tableDefinition,
                params.contextUser,
                pipelineOptions
            );
        }

        const designerResult: DatabaseDesignerResult = {
            Success: execResult.Success,
            EntityName: execResult.EntityName,
            EntityID: execResult.EntityID,
            SchemaName: execResult.SchemaName,
            TableName: execResult.TableName,
            PipelineSteps: execResult.PipelineSteps,
            ErrorMessage: execResult.ErrorMessage,
        };

        const newPayload: DatabaseDesignerPayload = {
            ...payload,
            DatabaseDesignerResult: designerResult,
        };

        if (!execResult.Success) {
            return this.buildCodeFailure(
                execResult.ErrorMessage ?? 'Pipeline failed without error message',
                newPayload as P
            );
        }

        return this.buildCodeSuccess(
            newPayload as P,
            `Entity '${execResult.EntityName ?? tableDefinition.EntityName}' created/modified successfully`
        );
    }

    // ─── Pre-condition guard ─────────────────────────────────────────────

    /**
     * Verify all pre-conditions for pipeline execution are satisfied.
     * Returns an error string when a condition is violated, null otherwise.
     *
     * Distinguishes between two separate failure modes:
     *  - ValidationResult absent → Schema Validator never ran
     *  - ValidationResult.Valid = false → Validator ran but found errors
     */
    private validatePreconditions(payload: DatabaseDesignerPayload): string | null {
        if (!payload.ValidationResult) {
            return 'Schema Builder cannot proceed: ValidationResult is missing — Schema Validator must run before Builder.';
        }
        if (!payload.ValidationResult.Valid) {
            const errors = payload.ValidationResult.Errors.join('; ');
            return `Schema Builder cannot proceed: validation failed. Errors: ${errors}`;
        }
        if (!payload.SchemaDesign?.TableDefinition) {
            return 'Schema Builder cannot proceed: SchemaDesign.TableDefinition is missing from payload.';
        }
        return null;
    }

    // ─── Modify path ─────────────────────────────────────────────────────

    /**
     * For ALTER operations, load the existing table structure from the DB
     * so SchemaEvolution can diff it against the desired state.
     *
     * Delegates table-info loading to DatabaseDesignerPipelineExecutor so there
     * is a single, correct implementation shared with the Modify Entity action.
     */
    private async runModify(
        payload: DatabaseDesignerPayload,
        params: ExecuteAgentParams,
        options: PipelineExecutionOptions
    ): Promise<PipelineExecutionResult> {
        const tableDefinition = payload.SchemaDesign!.TableDefinition!;
        const existingTableInfo = await DatabaseDesignerPipelineExecutor.LoadExistingTableInfo(
            tableDefinition.SchemaName,
            tableDefinition.TableName,
            params.contextUser
        );

        if (!existingTableInfo) {
            return {
                Success: false,
                ErrorMessage: `Cannot modify entity: table '${tableDefinition.SchemaName}.${tableDefinition.TableName}' was not found in the database.`,
            };
        }

        return DatabaseDesignerPipelineExecutor.ModifyEntity(
            tableDefinition,
            existingTableInfo,
            params.contextUser,
            options
        );
    }

    // ─── Pipeline options ────────────────────────────────────────────────

    /**
     * Build RSU pipeline options from the payload context.
     * Reads the invocation source from the payload to tag EntitySettings
     * correctly (DatabaseDesigner vs AgentManager).
     *
     * Agent Manager mode is detected by the absence of FunctionalRequirements —
     * in standalone mode the Requirements Analyst always writes it; in
     * sub-agent mode the caller pre-populates only SchemaDesign.
     */
    private buildPipelineOptions(payload: DatabaseDesignerPayload): PipelineExecutionOptions {
        const isAgentManagerMode =
            payload.SchemaDesign?.TableDefinition !== undefined &&
            !payload.FunctionalRequirements;

        return {
            SkipGitCommit: false,
            // SkipRestart: true — the pipeline runs inside a live MJAPI request that is
            // part of an active agent run. A full server restart would kill this process
            // mid-execution, leaving the agent run permanently incomplete/failed.
            //
            // This is safe because:
            // 1. Metadata.Refresh() (called by the pipeline executor after CodeGen) updates
            //    the in-memory entity registry without a restart.
            // 2. UDT tables are loaded dynamically at runtime — they do NOT need a compiled
            //    TypeScript rebuild. A restart is only needed for @memberjunction/core-entities
            //    subclass changes, which only happen for MJ core schema changes.
            SkipRestart: true,
            Source: isAgentManagerMode
                ? UDT_SETTINGS.SOURCE_AGENT_MANAGER
                : UDT_SETTINGS.SOURCE_DATABASE_DESIGNER,
        };
    }

}

