/**
 * @fileoverview The durable implementation of the `TaskGraphSubmitter` seam.
 *
 * `@memberjunction/ai-core-plus` declares the capability the agent loop needs — "persist this graph
 * and hand me its handle" — without knowing who fulfils it. This is the fulfilment, and it lives
 * here because this is the package that owns durable execution. Registering rather than importing
 * keeps the dependency running task-graph → ai-core-plus, so an agent run in a context with no
 * dispatcher (a CLI, a browser bundle, a unit test) does not drag the entity layer along with it.
 *
 * The body is deliberately trivial: all real work stays in `TaskGraphService`, which is the same
 * code path the Remote Operation and the messaging/scheduling seams use. One submission path means
 * a graph cannot be validated differently depending on who produced it (D16).
 *
 * @module @memberjunction/task-graph
 */
import { RegisterClass } from '@memberjunction/global';
import {
    TaskGraphSubmitter,
    TASK_GRAPH_SUBMITTER_KEY,
    type TaskGraphSubmitRequest,
    type TaskGraphSubmitOutcome,
} from '@memberjunction/ai-core-plus';
import { TaskGraphService } from './TaskGraphService';

@RegisterClass(TaskGraphSubmitter, TASK_GRAPH_SUBMITTER_KEY)
export class DurableTaskGraphSubmitter extends TaskGraphSubmitter {
    public async Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
        const result = await new TaskGraphService().Submit(request.Spec, {
            EnvironmentID: request.EnvironmentID,
            ConversationDetailID: request.ConversationDetailID ?? null,
            ContextUser: request.ContextUser,
            Provider: request.Provider,
            AgentRunID: request.AgentRunID ?? null,
            // Carried through so MAX_REINVOKE_DEPTH bounds a real chain. Without it every
            // submission was depth 0 and the cap could never trip.
            ReinvokeDepth: request.ReinvokeDepth ?? 0,
            // The flow dialect's `data`/`context` roots. Carried the same way and for the same
            // reason as the depth above: the graph outlives this call, so anything a condition may
            // reference has to travel with it (R3-3).
            Invocation: request.Invocation,
            Debug: request.Debug,
        });
        return {
            Success: result.Success,
            ParentTaskID: result.ParentTaskID,
            ErrorMessage: result.ErrorMessage,
        };
    }
}

/** Prevents tree-shaking of the registered submitter. */
export function LoadTaskGraphSubmitter(): void {
    void DurableTaskGraphSubmitter;
}
