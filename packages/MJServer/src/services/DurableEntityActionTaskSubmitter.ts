/**
 * @fileoverview MJServer's implementation of the `DurableEntityActionSubmitter` seam.
 *
 * Turns one After* entity-action dispatch into a single-node durable task graph, which is D14's
 * whole answer to "run this durably": not a new queue, the substrate that already has a claim
 * protocol, restart recovery and orphan reclaim.
 *
 * Registered at boot beside the dispatcher, because the two are one capability — a submitter with
 * no dispatcher writes rows nobody picks up, which is worse than staying inline.
 *
 * @module @memberjunction/server
 */
import type {
    DurableEntityActionRequest,
    DurableEntityActionSubmission,
    DurableEntityActionSubmitter,
} from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { TaskGraphService, type ProviderFactory } from '@memberjunction/task-graph';

export class DurableEntityActionTaskSubmitter implements DurableEntityActionSubmitter {
    /**
     * @param environmentID which environment the tasks belong to. Defaults to the platform default
     *   because a save has no environment of its own to inherit — the record's entity is global, and
     *   inventing a per-save environment would put a durable dispatch somewhere nobody looks.
     */
    constructor(
        private readonly providerFactory: ProviderFactory,
        private readonly environmentID: string = MJEnvironmentEntityExtended.DefaultEnvironmentID,
    ) {}

    public async Submit(request: DurableEntityActionRequest): Promise<DurableEntityActionSubmission> {
        try {
            const spec: TaskGraphSpec = {
                workflowName: `${request.ActionName} — ${request.EntityName}`,
                reasoning:
                    `Durable dispatch of entity action binding ${request.EntityActionID} on ` +
                    `${request.EntityName} (${request.RecordID}), fired by ${request.InvocationType}.`,
                tasks: [
                    TaskNode.Action(
                        {
                            tempId: 'action',
                            name: request.ActionName,
                            description: `Run ${request.ActionName} for ${request.EntityName} ${request.RecordID}.`,
                            dependsOn: [],
                            inputPayload: request.RedactedParams,
                        },
                        { actionName: request.ActionName },
                    ),
                ],
                // Nothing to say to anyone: this graph exists because a record was saved, not
                // because a person asked a question. Defaulting to 'message' would post an
                // orphaned result into whichever conversation happened to be nearby.
                continuation: 'none',
                // The point of the exercise. A one-node graph constant-folds to in-run execution by
                // default (D9), which is exactly the fire-and-forget behaviour being escaped.
                durable: true,
            };

            const provider = await this.providerFactory.CreateProvider();
            const result = await new TaskGraphService().Submit(spec, {
                EnvironmentID: this.environmentID,
                ContextUser: request.ContextUser,
                Provider: provider,
            });

            return result.Success
                ? { Success: true, ParentTaskID: result.ParentTaskID }
                : { Success: false, ErrorMessage: result.ErrorMessage };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[DurableEntityActionTaskSubmitter] Submission failed for binding ${request.EntityActionID}: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }
}
