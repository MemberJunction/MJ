import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";

/** The result code a workflow action returns, without running anything, inside an agent run. */
export const WORKFLOW_RUN_SCOPE_UNSUPPORTED = 'RUN_SCOPE_UNSUPPORTED';

/**
 * The workflow actions (Loop, Parallel Execute, Conditional, Retry) hand model-written action configurations straight
 * to `ActionEngineServer.RunAction`, and those configurations do not carry the calling run's `RunScope` or `Context`.
 * A nested Scoped Search would then treat the call as coming from outside any run: it would accept a model-supplied
 * tenant and skill that the same call made directly from the run is refused. So inside any agent run (`RunScope` is
 * set on every dispatch in a run, scoped or not, and absent outside one) a workflow action refuses without running
 * anything. Under an audience the engine already refuses them (they do not declare `SupportsAudience`).
 *
 * @returns The refusal, or `null` when the workflow action may run.
 */
export function RefuseWorkflowInAgentRun(params: RunActionParams, actionName: string): ActionResultSimple | null {
    if (!params.RunScope) {
        return null;
    }
    return {
        Success: false,
        ResultCode: WORKFLOW_RUN_SCOPE_UNSUPPORTED,
        Message: `${actionName} is not available in an agent run: the actions ${actionName} would run cannot carry ` +
            `the run's scope. Call those actions directly instead.`,
    };
}
