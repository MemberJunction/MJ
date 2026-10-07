import { ActionResultSimple, ActionRunScopeIsBounded, RunActionParams } from "@memberjunction/actions-base";

/** The result code a workflow action returns, without running anything, inside a tenant-scoped agent run. */
export const WORKFLOW_RUN_SCOPE_UNSUPPORTED = 'RUN_SCOPE_UNSUPPORTED';

/**
 * The workflow actions (Loop, Parallel Execute, Conditional, Retry) run model-written action configurations through
 * `ActionEngineServer.RunAction`, and those configurations do not carry the calling run's scope. A nested Scoped Search
 * would then treat the call as coming from outside any run and use the model's tenant. So inside a tenant-scoped agent
 * run (`ActionRunScopeIsBounded(params.RunScope)`) a workflow action refuses without running anything, as the Search
 * action does. Under an audience the engine already refuses them (they do not declare `SupportsAudience`).
 *
 * @returns The refusal, or `null` when the workflow action may run.
 */
export function RefuseWorkflowInScopedRun(params: RunActionParams, actionName: string): ActionResultSimple | null {
    if (!ActionRunScopeIsBounded(params.RunScope)) {
        return null;
    }
    return {
        Success: false,
        ResultCode: WORKFLOW_RUN_SCOPE_UNSUPPORTED,
        Message: `${actionName} is not available in this agent run: the run is scoped to a tenant, and the actions ` +
            `${actionName} would run cannot carry that scope. Call those actions directly instead.`,
    };
}
