/**
 * @fileoverview MJServer's implementation of the task-graph `TaskActionRunner` seam.
 *
 * The counterpart to {@link TaskGraphAgentRunner}: the dispatcher knows *when* an action-assigned
 * node should run and nothing about how an action executes, so execution is injected. Keeping it
 * here rather than in `@memberjunction/task-graph` is not tidiness — the action engine depends on
 * the entity layer the dispatcher also builds on, and importing it there would make every consumer
 * of durable execution load the action engine as well.
 *
 * @module @memberjunction/server
 */
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { TaskActionRunner, TaskActionRunParams, TaskActionRunResult } from '@memberjunction/task-graph';

export class TaskGraphActionRunner implements TaskActionRunner {
    public async RunActionForTask(params: TaskActionRunParams): Promise<TaskActionRunResult> {
        try {
            await ActionEngineServer.Instance.Config(false, params.ContextUser);
            const action = ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, params.ActionID));
            if (!action) {
                return { Success: false, ErrorMessage: `Action ${params.ActionID} is not in the engine's metadata.` };
            }

            const result = await ActionEngineServer.Instance.RunAction({
                Action: action,
                ContextUser: params.ContextUser,
                Params: this.buildParams(params),
                // No Filters. A durable node is work that a filter ALREADY let through — the entity
                // action's gate ran at dispatch time, on the change context that no longer exists by
                // the time the dispatcher picks the task up. Re-evaluating here would ask a
                // transition question with nothing to answer it, and fail closed on every retry.
                Filters: [],
            });

            return {
                Success: result.Success,
                Output: this.buildOutput(result.Params),
                ErrorMessage: result.Success ? undefined : result.Message,
                // The engine already wrote the log; this is the only place its id is in hand. Without
                // carrying it out, a workflow's action step has no path back to its own execution
                // record — the one thing anyone wants when an action misbehaves.
                ActionLogID: result.LogEntry?.ID,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[TaskGraphActionRunner] Task ${params.TaskID} failed: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * Projects the action's parameters onto the flat result a workflow step is expected to produce.
     *
     * **Why not return `result.Params` as-is.** That is an `ActionParam[]`, and every consumer of a
     * step's output addresses fields BY NAME: an output mapping says `{"CurrentPrice": "stockPrice"}`,
     * and a branch condition then reads `payload.stockPrice`. Handed an array, the mapping finds no
     * `CurrentPrice`, writes nothing, and the condition evaluates against `undefined` — which is
     * falsy rather than erroneous, so the workflow takes the other branch and reports success. That
     * is exactly what the Demo workflow did: step 1 completed with an output payload of `{}` and
     * every downstream branch was skipped, with nothing anywhere reporting a problem.
     *
     * Only `Output` and `Both` params are included. Echoing the inputs back would let a step's own
     * parameters masquerade as its results, so an output mapping could "succeed" by reading the
     * value the step was given rather than the one it produced.
     */
    private buildOutput(actionParams: ActionParam[]): Record<string, unknown> {
        const output: Record<string, unknown> = {};
        for (const p of actionParams ?? []) {
            if (p.Type === 'Output' || p.Type === 'Both') output[p.Name] = p.Value;
        }
        return output;
    }

    /**
     * Rebuilds the action's parameters from the task's stored payload.
     *
     * **The values here have been through redaction**, because `Task.InputPayload` is persistent,
     * user-visible storage and nothing writes a raw `ActionParam[]` there. A parameter the binding
     * marked as not-logged therefore arrives absent rather than secret — the action sees a missing
     * value, which is the honest consequence of choosing not to persist it, and the reason durable
     * dispatch is opt-in per binding rather than the default.
     *
     * Dependency outputs are merged underneath the task's own input so a node's explicit parameters
     * always win over an upstream node that happened to emit the same key.
     */
    private buildParams(params: TaskActionRunParams): ActionParam[] {
        const merged: Record<string, unknown> = {};
        for (const [name, value] of params.DependencyOutputs) {
            merged[name] = value;
        }
        if (params.InputPayload && typeof params.InputPayload === 'object') {
            Object.assign(merged, params.InputPayload as Record<string, unknown>);
        }
        return Object.entries(merged).map(([Name, Value]) => ({ Name, Value, Type: 'Input' }));
    }
}
