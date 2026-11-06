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
import { ActionParam, type ActionRunAudience, type ActionRunScope, type MJActionEntityExtended } from '@memberjunction/actions-base';
import { ApplyTaskSecurityEnvelopeToParams, BuildActionOutputObject, type TaskRunScope, type TaskSecurityEnvelope } from '@memberjunction/ai-core-plus';
import { LogError, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { IndexByUUID, UUIDsEqual } from '@memberjunction/global';
import type { TaskActionRunner, TaskActionRunParams, TaskActionRunResult } from '@memberjunction/task-graph';

/** The result code a tainted node's refused action reports. */
export const TAINTED_EGRESS_BLOCKED = 'TAINTED_EGRESS_BLOCKED';

/**
 * Runs a task-graph action node under the node's security envelope, as `BaseAgent` runs an action
 * inside a turn: the run's scope as `RunScope` (so a Scoped Search node searches the run's tenant
 * and host-assigned search scopes, not every tenant), the audience, the bound parameters, the taint
 * gate, and the action's output trust level reported back as taint.
 */
export class TaskGraphActionRunner implements TaskActionRunner {
    public readonly EnforcesSecurityEnvelope = true;

    public async RunActionForTask(params: TaskActionRunParams): Promise<TaskActionRunResult> {
        try {
            await ActionEngineServer.Instance.Config(false, params.ContextUser);
            const action = ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, params.ActionID));
            if (!action) {
                return { Success: false, ErrorMessage: `Action ${params.ActionID} is not in the engine's metadata.` };
            }

            const envelope = params.SecurityEnvelope;
            const taintRefusal = this.taintGateRefusal(action, envelope);
            if (taintRefusal) {
                LogError(`[TaskGraphActionRunner] Task ${params.TaskID}: ${taintRefusal}`);
                return { Success: false, ErrorMessage: taintRefusal, ResultCode: TAINTED_EGRESS_BLOCKED, IsOutputTainted: true };
            }

            const readerIds = envelope?.Audience?.ReaderUserIDs;
            const audience: ActionRunAudience | undefined =
                readerIds && readerIds.length > 0
                    ? { Readers: this.resolveAudienceReaders(readerIds) }
                    : undefined;

            const result = await ActionEngineServer.Instance.RunAction({
                Action: action,
                ContextUser: params.ContextUser,
                Params: this.buildParams(params),
                // No Filters. A durable node is work that a filter ALREADY let through — the entity
                // action's gate ran at dispatch time, on the change context that no longer exists by
                // the time the dispatcher picks the task up. Re-evaluating here would ask a
                // transition question with nothing to answer it, and fail closed on every retry.
                Filters: [],
                ...(audience ? { Audience: audience } : {}),
                ...(envelope?.RunScope ? { RunScope: ToActionRunScope(envelope.RunScope) } : {}),
            });
            const isOutputTainted = this.outputIsUntrusted(action);

            const output = this.buildOutput(result.Params, result.Message);
            const unstorable = this.findUnstorableOutput(output);
            if (unstorable) {
                const message =
                    `Action "${action.Name}" returned output param "${unstorable.Name}", which cannot be stored ` +
                    `as the step's result: ${unstorable.Reason}. Output params of a durable step must be plain data.`;
                LogError(`[TaskGraphActionRunner] Task ${params.TaskID}: ${message}`);
                return { Success: false, ErrorMessage: message, ActionLogID: result.LogEntry?.ID, ResultCode: result.ResultCode, IsOutputTainted: isOutputTainted };
            }

            return {
                Success: result.Success,
                Output: output,
                ErrorMessage: result.Success ? undefined : result.Message,
                // The engine already wrote the log; this is the only place its id is in hand. Without
                // carrying it out, a workflow's action step has no path back to its own execution
                // record — the one thing anyone wants when an action misbehaves.
                ActionLogID: result.LogEntry?.ID,
                ResultCode: result.ResultCode,
                IsOutputTainted: isOutputTainted,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[TaskGraphActionRunner] Task ${params.TaskID} failed: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * The first output param that cannot be written to the Task row as JSON, or null.
     *
     * Checked here because this is the last place that knows the action's and the param's NAMES: the
     * dispatcher serializes the whole Output later and, for a live object (an entity, an observable),
     * fails with a bare "Converting circular structure to JSON" that names neither.
     */
    private findUnstorableOutput(output: Record<string, unknown>): { Name: string; Reason: string } | null {
        for (const [Name, value] of Object.entries(output)) {
            try {
                JSON.stringify(value);
            } catch (e) {
                return { Name, Reason: e instanceof Error ? e.message.split('\n')[0] : String(e) };
            }
        }
        return null;
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
     * Only `Output` and `Both` params are included (plus any structured JSON object returned in
     * `resultMessage`, such as `Create Document`'s `{ handle, documentType, fileName }`). Echoing
     * `Input`-only params back would let a step's own parameters masquerade as its results, so an
     * output mapping could "succeed" by reading the value the step was given rather than the one it
     * produced.
     */
    private buildOutput(actionParams: ActionParam[], resultMessage?: string | null): Record<string, unknown> {
        return BuildActionOutputObject(actionParams, resultMessage);
    }

    /**
     * Rebuilds the action's parameters from the task's input, one parameter per key.
     *
     * For a **durable entity-action** graph the input was written by `RedactParamsToRecord`
     * (`@memberjunction/actions-base`) at deferral time, so its values have been through redaction:
     * a parameter the binding marked as not-logged arrives absent rather than secret — the action
     * sees a missing value, which is the honest consequence of choosing not to persist it, and the
     * reason durable dispatch is opt-in per binding rather than the default. Every other graph's
     * input is whatever its spec authored. This method re-applies no redaction rule in either case.
     *
     * `InputPayload` already carries the dependency outputs: the dispatcher merges them underneath
     * the task's own input (`mergedPayload`) before calling this runner, so a node's explicit
     * parameters win and a step with an input mapping gets exactly the parameters it declared.
     * `DependencyOutputs` is keyed by upstream task ID, not by parameter name, so it is deliberately
     * not read here — spreading it would hand the action one extra parameter per dependency, named
     * by a GUID and holding that task's whole output.
     */
    private buildParams(params: TaskActionRunParams): ActionParam[] {
        const base = params.InputPayload && typeof params.InputPayload === 'object' && !Array.isArray(params.InputPayload)
            ? (params.InputPayload as Record<string, unknown>)
            : {};
        const enforced = ApplyTaskSecurityEnvelopeToParams(base, params.SecurityEnvelope, params.ActionID).Params;
        return Object.entries(enforced).map(([Name, Value]) => ({ Name, Value, Type: 'Input' }));
    }

    /**
     * Why a tainted node may not run this action, or null when it may. A node is tainted when its input
     * derives from untrusted content no completed Human step has reviewed (the dispatcher works that out
     * and sets `IsRunTainted`); an action that sends data out or cannot be undone says so with
     * `disallowWhenTainted`, and is refused.
     */
    private taintGateRefusal(action: MJActionEntityExtended, envelope: TaskSecurityEnvelope | undefined): string | null {
        if (envelope?.IsRunTainted !== true || action.Config_Object?.disallowWhenTainted !== true) {
            return null;
        }
        return `Action "${action.Name}" was not run (${TAINTED_EGRESS_BLOCKED}): the step's input came from untrusted content ` +
            'that no completed Human step has approved, and this action sends data out or cannot be undone.';
    }

    /** True when the action's output is not trusted — the same metadata setting `BaseAgent` reads. */
    private outputIsUntrusted(action: MJActionEntityExtended): boolean {
        const level = action.Config_Object?.outputTrustLevel;
        return level === 'SemiTrusted' || level === 'Untrusted';
    }

    private resolveAudienceReaders(readerIds: ReadonlyArray<string>): UserInfo[] {
        let cachedUsers: UserInfo[] = [];
        try {
            cachedUsers = UserCache.Instance?.Users ?? UserCache.Users ?? [];
        } catch {
            cachedUsers = [];
        }
        const byId = IndexByUUID(cachedUsers, (u) => u.ID);
        return readerIds.map((id) => {
            const matched = byId.Get(id);
            if (matched) {
                return matched;
            }
            const placeholder = new UserInfo();
            placeholder.ID = id;
            return placeholder;
        });
    }
}

/** The envelope's run scope as the action engine takes it (`RunActionParams.RunScope`), copied. */
export function ToActionRunScope(scope: TaskRunScope): ActionRunScope {
    return {
        PrimaryScopeEntityName: scope.PrimaryScopeEntityName,
        PrimaryScopeRecordID: scope.PrimaryScopeRecordID,
        SecondaryScopes: scope.SecondaryScopes
            ? Object.fromEntries(Object.entries(scope.SecondaryScopes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]))
            : null,
        ...(scope.SearchScopeIDs ? { SearchScopeIDs: [...scope.SearchScopeIDs] } : {}),
    };
}
