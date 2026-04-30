/**
 * @module base-database-designer.action
 * @description Abstract base for all Database Designer actions.
 *
 * Provides common parameter extraction, authorization checking, and result
 * building so that each concrete action stays thin and focused.  All the
 * shared logic lives here; concrete actions only implement `InternalRunAction`.
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { AuthorizationEvaluator, Metadata, UserInfo, LogError } from '@memberjunction/core';
import type { TableDefinition } from '@memberjunction/schema-engine';

import {
    DatabaseDesignerPipelineExecutor,
    type PipelineExecutionOptions,
    AUTHORIZATIONS,
    UDT_SCHEMA_NAME,
    type PipelineExecutionResult,
} from '@memberjunction/database-designer-core';

// ─── Public API ───────────────────────────────────────────────────────────────

export abstract class BaseDatabaseDesignerAction extends BaseAction {

    // ─── Param extraction ────────────────────────────────────────────────

    /**
     * Extract and parse the `TableDefinition` param (JSON object or string).
     * Returns `{ error }` on missing/malformed input, `{ td }` on success.
     */
    protected getTableDefinitionParam(
        params: RunActionParams
    ): { td?: TableDefinition; error?: ActionResultSimple } {
        const param = this.findParam(params, 'TableDefinition');
        if (!param?.Value) {
            return {
                error: this.missing('TableDefinition', 'A complete TableDefinition object is required.'),
            };
        }

        const raw = param.Value;
        const td = typeof raw === 'string' ? this.tryParse(raw) : raw as TableDefinition;
        if (!td || typeof td !== 'object') {
            return {
                error: {
                    Success: false,
                    ResultCode: 'INVALID_TABLE_DEFINITION',
                    Message: 'TableDefinition must be a valid JSON object.',
                },
            };
        }

        return { td: td as TableDefinition };
    }

    /** Extract the `ModificationType` param ('create' | 'alter'). Defaults to 'create'. */
    protected getModificationTypeParam(params: RunActionParams): 'create' | 'alter' {
        const v = this.findParam(params, 'ModificationType')?.Value;
        return v === 'alter' ? 'alter' : 'create';
    }

    /** Extract a boolean param by name with a fallback default. */
    protected getBoolParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const v = this.findParam(params, name)?.Value;
        if (v === undefined || v === null) return defaultValue;
        const s = String(v).trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return defaultValue;
    }

    /** Extract a string param by name, returning undefined when absent. */
    protected getStringParam(params: RunActionParams, name: string): string | undefined {
        const v = this.findParam(params, name)?.Value;
        if (v === undefined || v === null) return undefined;
        const s = String(v).trim();
        return s.length > 0 ? s : undefined;
    }

    /** Append an output param to the params array so callers can read results. */
    protected addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }

    // ─── Authorization ────────────────────────────────────────────────────

    /**
     * Check that the contextUser holds the authorization required for the
     * requested operation type.  Returns an error string on failure, null on success.
     */
    protected async checkAuthorization(
        tableDefinition: TableDefinition,
        modificationType: 'create' | 'alter',
        contextUser: UserInfo
    ): Promise<string | null> {
        const authName = this.resolveAuthorizationName(tableDefinition, modificationType);
        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment
        const auth = md.Authorizations.find(a => a.Name === authName);

        if (!auth) {
            return `Authorization '${authName}' is not configured in this system.`;
        }

        const evaluator = new AuthorizationEvaluator();
        if (!evaluator.UserCanExecuteWithAncestors(auth, contextUser, md.Authorizations)) {
            return `User does not have the '${authName}' authorization required for this operation.`;
        }

        return null;
    }

    /** Map operation to its minimum required authorization name. */
    private resolveAuthorizationName(
        tableDefinition: TableDefinition,
        modificationType: 'create' | 'alter'
    ): string {
        if (modificationType === 'alter') {
            return AUTHORIZATIONS.MODIFY_OWN_ENTITIES;
        }
        return tableDefinition.SchemaName.toLowerCase() === UDT_SCHEMA_NAME.toLowerCase()
            ? AUTHORIZATIONS.CREATE_IN_UDT_SCHEMA
            : AUTHORIZATIONS.CREATE_IN_CUSTOM_SCHEMA;
    }

    // ─── Pipeline options ─────────────────────────────────────────────────

    /** Build PipelineExecutionOptions from action params. */
    protected buildPipelineOptions(
        params: RunActionParams,
        source: string
    ): PipelineExecutionOptions {
        return {
            SkipGitCommit: this.getBoolParam(params, 'SkipGitCommit', false),
            SkipRestart: this.getBoolParam(params, 'SkipRestart', false),
            Source: source,
        };
    }

    // ─── Result building ─────────────────────────────────────────────────

    /**
     * Map a PipelineExecutionResult to ActionResultSimple and populate output
     * params so workflow engines can read EntityID, EntityName, etc.
     */
    protected buildPipelineResult(
        execResult: PipelineExecutionResult,
        params: RunActionParams
    ): ActionResultSimple {
        if (execResult.Success) {
            this.addOutputParam(params, 'EntityID', execResult.EntityID ?? null);
            this.addOutputParam(params, 'EntityName', execResult.EntityName ?? null);
            this.addOutputParam(params, 'SchemaName', execResult.SchemaName ?? null);
            this.addOutputParam(params, 'TableName', execResult.TableName ?? null);
            this.addOutputParam(params, 'PipelineSteps', execResult.PipelineSteps ?? []);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Entity '${execResult.EntityName ?? execResult.TableName}' created/modified successfully.`,
            };
        }

        this.addOutputParam(params, 'PipelineSteps', execResult.PipelineSteps ?? []);
        return {
            Success: false,
            ResultCode: 'PIPELINE_FAILED',
            Message: execResult.ErrorMessage ?? 'Pipeline execution failed without an error message.',
        };
    }

    /** Common error handler for unexpected exceptions. */
    protected handleUnexpected(error: unknown, operation: string): ActionResultSimple {
        const msg = error instanceof Error ? error.message : String(error);
        LogError(`DatabaseDesigner action '${operation}' threw: ${msg}`);
        return {
            Success: false,
            ResultCode: 'UNEXPECTED_ERROR',
            Message: `Unexpected error during ${operation}: ${msg}`,
        };
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private findParam(params: RunActionParams, name: string) {
        return params.Params.find(
            p => p.Name.trim().toLowerCase() === name.toLowerCase()
        );
    }

    private tryParse(raw: string): unknown | null {
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    private missing(paramName: string, hint: string): ActionResultSimple {
        return {
            Success: false,
            ResultCode: 'MISSING_PARAMETER',
            Message: `Parameter '${paramName}' is required. ${hint}`,
        };
    }
}

// Re-export the shared executor so callers that import from this module can
// access it without an extra import — actions are the primary consumers.
export { DatabaseDesignerPipelineExecutor };
