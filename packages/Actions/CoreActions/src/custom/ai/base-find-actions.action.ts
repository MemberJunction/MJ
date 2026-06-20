import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { NormalizeUUID } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AIEngine } from "@memberjunction/aiengine";
import { RunView } from "@memberjunction/core";
import { MJActionEntity, MJActionParamEntity } from "@memberjunction/core-entities";
import { runSemanticEntitySearch, getActionParamValue, getActionBooleanParam } from "./semantic-entity-search.helper";

/**
 * Shared base for the "Find Best Action" / "Find Candidate Actions" wrappers.
 *
 * Both rank actions for a task description via the unified
 * {@link IRunViewProvider.SearchEntity} pipeline (semantic mode, backed by the
 * daily-synced "Actions Search" EntityDocument) and then hydrate action metadata
 * + parameters from AIEngine's cache to preserve the legacy
 * `MatchedActions` / `MatchCount` output shape.
 *
 * This base intentionally carries **no** `@RegisterClass` decorator so importing
 * it from a concrete subclass does not register an extra action.
 */
export abstract class BaseFindActionsAction extends BaseAction {
    /** Entity searched by this action. */
    protected get entityName(): string { return 'MJ: Actions'; }
    /** Verb used in error messages (e.g. "find best action"). */
    protected abstract get actionLabel(): string;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const taskDescription = getActionParamValue(params, 'taskdescription') as string | undefined;
            const maxResults = parseInt(String(getActionParamValue(params, 'maxresults') ?? '10'));
            const minimumSimilarityScore = parseFloat(String(getActionParamValue(params, 'minimumsimilarityscore') ?? '0.5'));
            const excludeAgentManagement = getActionBooleanParam(params, 'excludeagentmanagement', true);

            if (!taskDescription || taskDescription.trim().length === 0) {
                return { Success: false, ResultCode: 'INVALID_INPUT', Message: 'TaskDescription parameter is required and cannot be empty' };
            }
            if (maxResults < 1 || maxResults > 50) {
                return { Success: false, ResultCode: 'INVALID_INPUT', Message: 'MaxResults must be between 1 and 50' };
            }
            if (minimumSimilarityScore < 0 || minimumSimilarityScore > 1) {
                return { Success: false, ResultCode: 'INVALID_INPUT', Message: 'MinimumSimilarityScore must be between 0 and 1' };
            }
            if (!params.ContextUser) {
                return { Success: false, ResultCode: 'MISSING_USER_CONTEXT', Message: 'User context required' };
            }

            // Rank via the unified SearchEntity pipeline (over-fetch to allow post-filtering)
            const search = await runSemanticEntitySearch(params, this.entityName, taskDescription, maxResults * 2, minimumSimilarityScore);
            if (!search.ok) {
                return { Success: false, ResultCode: search.resultCode ?? 'SEARCH_FAILED', Message: search.message ?? 'Semantic search failed' };
            }

            // Hydrate action metadata from AIEngine's cached actions (no DB round trip)
            await AIEngine.Instance.Config(false, params.ContextUser);
            const actionsById = new Map<string, MJActionEntity>();
            for (const a of AIEngine.Instance.SystemActions) {
                actionsById.set(NormalizeUUID(a.ID), a);
            }

            let matched = search.results
                .map(r => ({ action: actionsById.get(NormalizeUUID(r.recordId)), score: r.score }))
                .filter((m): m is { action: MJActionEntity; score: number } => m.action != null);

            if (excludeAgentManagement) {
                matched = matched.filter(m => m.action.Category !== 'Agent Management');
            }
            matched = matched.slice(0, maxResults);

            if (matched.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_ACTIONS_FOUND',
                    Message: `No actions found matching the criteria (minimum similarity: ${minimumSimilarityScore}).`
                };
            }

            // Load action parameters for all matched actions
            const actionIds = matched.map(m => m.action.ID);
            const rv = new RunView();
            const paramsResult = await rv.RunView<MJActionParamEntity>({
                EntityName: 'MJ: Action Params',
                ExtraFilter: `ActionID IN ('${actionIds.join("','")}')`,
                OrderBy: 'ActionID, Name',
                ResultType: 'entity_object'
            }, params.ContextUser);

            const paramsByActionId = new Map<string, MJActionParamEntity[]>();
            if (paramsResult.Success && paramsResult.Results) {
                for (const param of paramsResult.Results) {
                    const list = paramsByActionId.get(param.ActionID) ?? [];
                    list.push(param);
                    paramsByActionId.set(param.ActionID, list);
                }
            }

            const actionsWithParams = matched.map(m => ({
                actionId: m.action.ID,
                actionName: m.action.Name,
                similarityScore: Math.round(m.score * 100) / 100,
                description: m.action.Description,
                categoryName: m.action.Category,
                status: m.action.Status,
                driverClass: m.action.DriverClass,
                parameters: (paramsByActionId.get(m.action.ID) || []).map(p => ({
                    name: p.Name,
                    type: p.Type,
                    valueType: p.ValueType,
                    isArray: p.IsArray,
                    description: p.Description,
                    isRequired: p.IsRequired,
                    defaultValue: p.DefaultValue
                }))
            }));

            params.Params.push({ Name: 'MatchedActions', Type: 'Output', Value: actionsWithParams });
            params.Params.push({ Name: 'MatchCount', Type: 'Output', Value: actionsWithParams.length });

            const responseData = {
                message: `Found ${actionsWithParams.length} relevant action(s)`,
                taskDescription,
                matchCount: actionsWithParams.length,
                allMatches: actionsWithParams
            };

            return { Success: true, ResultCode: 'SUCCESS', Message: JSON.stringify(responseData, null, 2) };
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Failed to ${this.actionLabel}: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
