/**
 * @fileoverview Exposes a MemberJunction Action as a pipeline capability. Execution is supplied as a
 * `runner` closure by the agent (which owns the action engine + resolved action entity), so this
 * file never imports base-agent. Emits the action's result as a STRUCTURED value.
 *
 * @module @memberjunction/ai-agents
 */
import { ActionResult } from '@memberjunction/actions-base';
import { PipeValue, PipelineInvocable, PipelineStepResult } from '../pipeline.types';
import { structureActionResult } from './serialize';

/** Runs one already-resolved Action with the given params and returns its full result. */
export type PipelineActionRunner = (params: Record<string, unknown>) => Promise<ActionResult>;

export class ActionInvocable implements PipelineInvocable {
    public readonly providerKind = 'Action' as const;
    /** Actions ignore the raw upstream `input` (the executor injects `pipeInto`/templates into params). */
    public readonly isSource = true;

    constructor(
        public readonly toolName: string,
        private readonly runner: PipelineActionRunner,
    ) {}

    public async invoke(_input: PipeValue, params: Record<string, unknown>): Promise<PipelineStepResult> {
        try {
            const result = await this.runner(params);
            const logRef = { providerKind: 'Action' as const, actionExecutionLogId: result.LogEntry?.ID };
            if (!result.Success) {
                return { output: null, success: false, error: result.Message ?? `Action "${this.toolName}" failed.`, logRef };
            }
            return { output: structureActionResult(result), success: true, logRef };
        } catch (e) {
            return { output: null, success: false, error: (e as Error).message, logRef: { providerKind: 'Action' } };
        }
    }
}
