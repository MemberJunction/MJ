/**
 * @module database-schema-builder
 * @description Code-based sub-agent that executes the RSU pipeline to
 * materialise all validated TableDefinitions in SchemaDesign.Tables[] as live
 * MemberJunction entities.
 *
 * Execution sequence:
 *  1. Guard: ValidationResult must exist and be Valid (fail fast with distinct messages)
 *  2. Guard: SchemaDesign.Tables[] must be present and non-empty, each with a TableDefinition
 *  3. Delegate to DatabaseDesignerPipelineExecutor.CreateEntitiesBatch()
 *  4. Write DatabaseDesignerResult to payload
 *
 * No LLM is invoked — this is pure orchestration of the SchemaEngine and
 * RuntimeSchemaManager infrastructure that already exists in the monorepo.
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';

import { BaseDatabaseDesignerCodeAgent } from './base-database-designer-code-agent.js';

import { DatabaseDesignerPipelineExecutor, type BatchTableInput, type PipelineExecutionOptions } from '../pipeline-executor.js';
import type {
    DatabaseDesignerPayload,
    DatabaseDesignerResult,
    SchemaDesignEntry,
} from '../interfaces.js';
import { UDT_SETTINGS } from '../interfaces.js';

// ─── Driver registration ─────────────────────────────────────────────────────

@RegisterClass(BaseAgent, 'DatabaseDesignerSchemaBuilder')
export class DatabaseDesignerSchemaBuilder extends BaseDatabaseDesignerCodeAgent {

    // ─── LLM bypass ────────────────────────────────────────────────────────

    /**
     * Override the Loop-agent execution loop entirely.
     * Drives the RSU pipeline for all tables and writes the batch outcome to
     * `DatabaseDesignerResult`.
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

        // validatePreconditions guarantees tables is non-empty and each entry has TableDefinition
        const tables = payload.SchemaDesign!.Tables!;
        const pipelineOptions = this.buildPipelineOptions(payload);

        const batchInputs: BatchTableInput[] = this.buildBatchInputs(tables);

        const batchResult = await DatabaseDesignerPipelineExecutor.CreateEntitiesBatch(
            batchInputs,
            params.contextUser,
            pipelineOptions
        );

        const designerResult: DatabaseDesignerResult = {
            Success: batchResult.Success,
            Results: batchResult.Results.map(r => ({
                Success: r.Success,
                EntityName: r.EntityName,
                EntityID: r.EntityID,
                SchemaName: r.SchemaName,
                TableName: r.TableName,
                PipelineSteps: r.PipelineSteps,
                ErrorMessage: r.ErrorMessage,
            })),
            Warnings: batchResult.Warnings,
        };

        const newPayload: DatabaseDesignerPayload = {
            ...payload,
            DatabaseDesignerResult: designerResult,
        };

        if (!batchResult.Success) {
            const failedErrors = batchResult.Results
                .filter(r => !r.Success)
                .map(r => r.ErrorMessage ?? 'Pipeline failed without error message')
                .join('; ');
            return this.buildCodeFailure(failedErrors, newPayload as P);
        }

        const successCount = batchResult.Results.filter(r => r.Success).length;
        return this.buildCodeSuccess(
            newPayload as P,
            `${successCount}/${tables.length} entity/entities created/modified successfully`
        );
    }

    // ─── Pre-condition guard ─────────────────────────────────────────────

    /**
     * Verify all pre-conditions for pipeline execution are satisfied.
     * Returns an error string when a condition is violated, null otherwise.
     *
     * Distinguishes between three separate failure modes:
     *  - ValidationResult absent → Schema Validator never ran
     *  - ValidationResult.Valid = false → Validator ran but found errors
     *  - SchemaDesign.Tables[] missing/empty → Schema Designer never ran
     */
    private validatePreconditions(payload: DatabaseDesignerPayload): string | null {
        if (!payload.ValidationResult) {
            return 'Schema Builder cannot proceed: ValidationResult is missing — Schema Validator must run before Builder.';
        }
        if (!payload.ValidationResult.Valid) {
            const errors = payload.ValidationResult.Errors.join('; ');
            return `Schema Builder cannot proceed: validation failed. Errors: ${errors}`;
        }
        const tables = payload.SchemaDesign?.Tables;
        if (!tables?.length) {
            return 'Schema Builder cannot proceed: SchemaDesign.Tables[] is missing or empty.';
        }
        if (tables.some(t => !t.TableDefinition)) {
            return 'Schema Builder cannot proceed: one or more SchemaDesignEntry items have a missing TableDefinition.';
        }
        return null;
    }

    // ─── Batch input builder ─────────────────────────────────────────────

    /**
     * Map SchemaDesign.Tables[] to BatchTableInput[] for the pipeline executor.
     * Called only after validatePreconditions() passes, so TableDefinition is guaranteed.
     */
    private buildBatchInputs(tables: SchemaDesignEntry[]): BatchTableInput[] {
        return tables.map(entry => ({
            tableDefinition: entry.TableDefinition!,
            modificationType: entry.ModificationType ?? 'create',
            existingEntityID: entry.ExistingEntityID,
        }));
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
            (payload.SchemaDesign?.Tables?.length ?? 0) > 0 &&
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
