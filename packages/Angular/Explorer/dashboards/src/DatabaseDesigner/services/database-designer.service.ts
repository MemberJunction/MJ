/**
 * @module database-designer.service
 * @description Angular service that wraps `GraphQLActionClient.RunAction()` for all
 * five Database Designer server-side actions.
 *
 * ### Responsibilities
 * - Lazy-resolve action UUIDs by name on first use and cache them
 * - Build strongly-typed `ActionParam[]` arrays from typed Angular inputs
 * - Parse output params and map them to typed Angular response objects
 * - Surface error messages in a consistent format
 *
 * ### Why @Injectable({ providedIn: 'root' })?
 * The action ID cache (`_actionIdCache`) must outlive individual component
 * lifecycles.  A root-level singleton ensures the first action lookup per
 * action name is shared across the entire session.
 *
 * ### Action ID caching
 * Action IDs are cached as `Promise<string>` (not `string`) so that concurrent
 * callers waiting on the same lookup share a single in-flight request rather
 * than triggering N parallel `MJ: Actions` queries.
 *
 * @see DatabaseDesignerEngine — for read-only data access (no action invocations)
 */

import { Injectable } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';

import type {
    EntityTableSpec,
    ClientValidationResult,
    EntityPipelineResult,
    EntityDescribeResult,
    PipelineStepSummary,
} from '../database-designer.types.js';

// ─── Action name constants ────────────────────────────────────────────────────
// Must stay in sync with @RegisterClass registrations in database-designer-actions package.

const ACTION_NAMES = {
    CREATE_ENTITY: 'Create Entity',
    MODIFY_ENTITY: 'Modify Entity',
    VALIDATE_ENTITY_SCHEMA: 'Validate Entity Schema',
    DESCRIBE_ENTITY: 'Describe Entity',
    LIST_MY_ENTITIES: 'List My Entities',
} as const;

// ─── Options ──────────────────────────────────────────────────────────────────

export interface CreateEntityOptions {
    skipGitCommit?: boolean;
    skipRestart?: boolean;
}

export interface ModifyEntityOptions extends CreateEntityOptions {
    /** ID of the existing entity being modified. */
    existingEntityId: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DatabaseDesignerService {

    // ─── Action client ────────────────────────────────────────────────────

    /**
     * Lazily-created action client.  Re-uses `GraphQLDataProvider.Instance` so the
     * singleton provider (and its auth headers) are shared across all invocations.
     */
    private _actionClient: GraphQLActionClient | null = null;

    private getActionClient(): GraphQLActionClient {
        if (!this._actionClient) {
            this._actionClient = new GraphQLActionClient(GraphQLDataProvider.Instance);
        }
        return this._actionClient;
    }

    // ─── Action ID resolution ─────────────────────────────────────────────

    /**
     * Cache maps action name → Promise<ID>.  Storing a Promise (not a resolved ID)
     * prevents duplicate in-flight lookups when two callers await the same name
     * before the first resolves.
     */
    private readonly _actionIdCache = new Map<string, Promise<string>>();

    private resolveActionId(actionName: string): Promise<string> {
        let pending = this._actionIdCache.get(actionName);
        if (!pending) {
            pending = this.fetchActionId(actionName);
            this._actionIdCache.set(actionName, pending);
        }
        return pending;
    }

    private async fetchActionId(actionName: string): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Actions',
            ExtraFilter: `Name = '${actionName.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        });

        if (!result.Success || result.Results.length === 0) {
            throw new Error(
                `Database Designer action '${actionName}' not found in MJ. ` +
                `Ensure database-designer-actions metadata has been pushed via mj sync push.`
            );
        }
        return result.Results[0].ID;
    }

    // ─── Public action methods ────────────────────────────────────────────

    /**
     * Create a new MemberJunction entity from a `EntityTableSpec`.
     * Calls the `Create Entity` action on the server which runs the full RSU pipeline.
     */
    public async createEntity(
        tableSpec: EntityTableSpec,
        options: CreateEntityOptions = {}
    ): Promise<EntityPipelineResult> {
        try {
            const actionId = await this.resolveActionId(ACTION_NAMES.CREATE_ENTITY);
            const params = this.buildPipelineParams(tableSpec, options);
            const result = await this.getActionClient().RunAction(actionId, params);
            return this.extractPipelineResult(result);
        } catch (err) {
            return { Success: false, ErrorMessage: this.errorMessage(err) };
        }
    }

    /**
     * Modify an existing MemberJunction entity.
     * Calls the `Modify Entity` action on the server.
     */
    public async modifyEntity(
        tableSpec: EntityTableSpec,
        options: ModifyEntityOptions
    ): Promise<EntityPipelineResult> {
        try {
            const actionId = await this.resolveActionId(ACTION_NAMES.MODIFY_ENTITY);
            const params: ActionParam[] = [
                ...this.buildPipelineParams(tableSpec, options),
                { Name: 'ExistingEntityID', Type: 'Input', Value: options.existingEntityId },
            ];
            const result = await this.getActionClient().RunAction(actionId, params);
            return this.extractPipelineResult(result);
        } catch (err) {
            return { Success: false, ErrorMessage: this.errorMessage(err) };
        }
    }

    /**
     * Validate a `EntityTableSpec` without executing the pipeline.
     * Used by Step 4 (Review) of the wizard to surface errors before the user submits.
     *
     * Note: `ActionResult.Success` is `true` even when `ValidationResult.Valid` is `false`
     * because the action itself succeeded — validation failure is a business outcome, not
     * an infrastructure error.
     */
    public async validateEntitySchema(
        tableSpec: EntityTableSpec,
        modificationType: 'create' | 'alter' = 'create'
    ): Promise<ClientValidationResult> {
        try {
            const actionId = await this.resolveActionId(ACTION_NAMES.VALIDATE_ENTITY_SCHEMA);
            const params: ActionParam[] = [
                { Name: 'TableDefinition', Type: 'Input', Value: tableSpec },
                { Name: 'ModificationType', Type: 'Input', Value: modificationType },
            ];
            const result = await this.getActionClient().RunAction(actionId, params);
            const outputParams = this.extractOutputParams(result);
            const outputParam = outputParams.find(p => p.Name === 'ValidationResult');
            if (outputParam?.Value) {
                const raw = typeof outputParam.Value === 'string'
                    ? JSON.parse(outputParam.Value)
                    : outputParam.Value;
                return { Valid: !!raw.Valid, Errors: raw.Errors ?? [], Warnings: raw.Warnings ?? [] };
            }
            // Fallback: treat action-level failure as a validation failure
            return { Valid: false, Errors: [result.Message ?? 'Validation failed'], Warnings: [] };
        } catch (err) {
            return { Valid: false, Errors: [this.errorMessage(err)], Warnings: [] };
        }
    }

    /**
     * Load detailed metadata for an existing entity.
     * Used by the entity list slide panel and the modify wizard entry point.
     */
    public async describeEntity(entityId: string): Promise<EntityDescribeResult> {
        try {
            const actionId = await this.resolveActionId(ACTION_NAMES.DESCRIBE_ENTITY);
            const params: ActionParam[] = [
                { Name: 'EntityID', Type: 'Input', Value: entityId },
            ];
            const result = await this.getActionClient().RunAction(actionId, params);
            if (!result.Success) {
                return { Success: false, ErrorMessage: result.Message };
            }

            const outputParams = this.extractOutputParams(result);
            const outputParam = outputParams.find(p => p.Name === 'EntityDetails');
            const raw = outputParam?.Value
                ? (typeof outputParam.Value === 'string' ? JSON.parse(outputParam.Value) : outputParam.Value)
                : {};

            return {
                Success: true,
                EntityName: raw.EntityName,
                SchemaName: raw.SchemaName,
                TableName: raw.TableName,
                Description: raw.Description,
                Fields: raw.Fields ?? [],
            };
        } catch (err) {
            return { Success: false, ErrorMessage: this.errorMessage(err) };
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private buildPipelineParams(tableSpec: EntityTableSpec, options: CreateEntityOptions): ActionParam[] {
        const params: ActionParam[] = [
            { Name: 'TableDefinition', Type: 'Input', Value: tableSpec },
        ];
        if (options.skipGitCommit) {
            params.push({ Name: 'SkipGitCommit', Type: 'Input', Value: 'true' });
        }
        if (options.skipRestart) {
            params.push({ Name: 'SkipRestart', Type: 'Input', Value: 'true' });
        }
        return params;
    }

    /**
     * Extract server output params from a `RunAction` result.
     *
     * ### Why `result.Result`, not `result.Params`?
     * `ActionResolver.createActionResult` on the server serializes all Output/Both typed
     * params into a JSON string stored in `ResultData`.  `GraphQLActionClient` parses that
     * JSON and stores the resulting array in `result.Result`.  The `result.Params` field
     * contains only the *input* params passed by the caller — the server's output params
     * are never included there.
     *
     * This helper centralizes the cast so no caller ever needs to understand this transport
     * contract directly.
     */
    private extractOutputParams(result: ActionResult): ActionParam[] {
        // result.Result is typed as MJActionResultCodeEntity | undefined in the ActionResult
        // class, but GraphQLActionClient repurposes it to carry the parsed ResultData payload
        // (an ActionParam[]).  We cast through unknown to acknowledge this intentional mismatch.
        const raw: unknown = result.Result;
        if (Array.isArray(raw)) return raw as ActionParam[];

        // CopyScalarsAndArrays (used server-side to serialize ResultData) converts arrays to
        // numeric-keyed plain objects — e.g. [p0, p1] → {"0": p0, "1": p1}.
        // Detect and restore that pattern so callers can find their output params.
        if (raw && typeof raw === 'object') {
            const keys = Object.keys(raw as object);
            if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
                const obj = raw as Record<string, ActionParam>;
                return keys.sort((a, b) => +a - +b).map(k => obj[k]);
            }
        }
        return [];
    }

    /**
     * Map a completed `ActionResult` to an `EntityPipelineResult`.
     *
     * Two failure modes are distinguished:
     *  - `result.Success === false`: infrastructure failure (auth, pipeline exception) → hard error
     *  - `result.Success === true` but `EntityID` missing: pipeline ran but ID unconfirmed →
     *    soft warning so the UI can surface guidance without blocking the user
     */
    private extractPipelineResult(result: ActionResult): EntityPipelineResult {
        const outputParams = this.extractOutputParams(result);
        const find = (name: string) => outputParams.find(p => p.Name === name)?.Value;

        const stepsRaw = find('PipelineSteps');
        const steps: PipelineStepSummary[] = stepsRaw
            ? (typeof stepsRaw === 'string' ? JSON.parse(stepsRaw) : stepsRaw)
            : [];

        if (!result.Success) {
            return {
                Success: false,
                PipelineSteps: steps,
                ErrorMessage: result.Message ?? 'Action execution failed.',
            };
        }

        const entityId = find('EntityID');
        const warnings: string[] = [];

        if (entityId == null) {
            // Pipeline ran but EntityID was not echoed back — this can happen when the server
            // completes the RSU pipeline but the metadata refresh hasn't propagated the new
            // entity ID yet.  Treat as a soft warning, not a hard failure.
            warnings.push(
                'Entity was saved successfully but the EntityID could not be confirmed. ' +
                'Refresh the list to verify.'
            );
        }

        return {
            Success: true,
            EntityID: entityId != null ? String(entityId) : undefined,
            EntityName: String(find('EntityName') ?? ''),
            SchemaName: String(find('SchemaName') ?? ''),
            TableName: String(find('TableName') ?? ''),
            PipelineSteps: steps,
            Warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    private errorMessage(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
