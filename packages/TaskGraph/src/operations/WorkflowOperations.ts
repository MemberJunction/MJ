/**
 * @fileoverview Remote Operations for authoring workflows.
 *
 * **This is the hole the program set out to close.** Agents could already *navigate* to a workflow;
 * they could not *set one up*. Today `Create Scheduled Job` cannot even set `Configuration`, so an
 * agent asked to "run this every Monday" had nothing to call. These two operations make authoring a
 * workflow — steps and triggers together — a single typed call reachable from MCP (external agents),
 * an Action wrapper (internal agents), and the editor.
 *
 * **Two operations, not one, because drafting and committing are different acts.** `Validate` lets an
 * agent iterate on a draft without writing anything — the draft-then-confirm shape dry-run and Plan
 * Mode already established. `Save` commits. Both run the identical validator, so a workflow that
 * validates cannot then be rejected on save for a different reason.
 *
 * @module @memberjunction/task-graph
 */
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    WorkflowSaveOperation,
    WorkflowValidateOperation,
    type WorkflowSaveInput,
    type WorkflowSaveOutput,
    type WorkflowValidateOutput,
} from '@memberjunction/core-entities';
import {
    FormatWorkflowValidationErrors,
    ValidateWorkflowSpec,
    type WorkflowSpec,
} from '@memberjunction/ai-core-plus';
import { WorkflowSpecSync, type WorkflowAgentWriter } from '../WorkflowSpecSync';

/**
 * Resolves the host's agent writer, or null.
 *
 * Looked up through the ClassFactory rather than imported so this package does not depend on the
 * agent-manager. Null is a legitimate configuration (a worker, a test) and produces an honest
 * failure rather than a half-saved workflow.
 */
function resolveAgentWriter(): WorkflowAgentWriter | null {
    return MJGlobal.Instance.ClassFactory.CreateInstance<WorkflowAgentWriter>(
        // The base class is declared in the agent-manager; resolving by key alone keeps this package
        // free of that import while still finding whatever the host registered.
        Object as unknown as new () => WorkflowAgentWriter,
        'WorkflowAgentWriter',
    );
}

/** `Workflow.Save` — validate a workflow and reconcile every substrate it owns. */
@RegisterClass(BaseRemotableOperation, 'Workflow.Save')
export class WorkflowSaveServerOperation extends WorkflowSaveOperation {
    protected async InternalExecute(
        input: WorkflowSaveInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<WorkflowSaveOutput> {
        if (!input?.spec) throw new Error('spec is required');

        const spec: WorkflowSpec = input.spec;
        const result = await new WorkflowSpecSync(resolveAgentWriter()).Persist(spec, {
            ContextUser: user,
            Provider: provider,
        });

        return {
            success: result.Success,
            agentID: result.AgentID,
            scheduledJobIDs: result.ScheduledJobIDs,
            // Surfaced, not swallowed: a user who asked for "run this when an invoice changes" and
            // got a workflow that never fires has no way to discover why from the UI alone.
            unreconciled: result.Unreconciled.length ? result.Unreconciled : undefined,
            errorMessage: result.ErrorMessage,
        };
    }
}

/**
 * `Workflow.Validate` — check a workflow without saving it.
 *
 * Writes nothing, which is the point: an agent drafting a workflow can iterate until it is right
 * before anything reaches the scheduler. Reports every failure at once rather than the first, so a
 * fix takes one round-trip rather than several.
 */
@RegisterClass(BaseRemotableOperation, 'Workflow.Validate')
export class WorkflowValidateServerOperation extends WorkflowValidateOperation {
    protected async InternalExecute(
        input: WorkflowSaveInput,
        _provider: IMetadataProvider,
        _user: UserInfo,
    ): Promise<WorkflowValidateOutput> {
        if (!input?.spec) throw new Error('spec is required');

        const validation = ValidateWorkflowSpec(input.spec as WorkflowSpec);
        return {
            valid: validation.Valid,
            errors: validation.Errors.length
                ? validation.Errors.map((e) => ({ code: e.Code, message: e.Message, triggerIndex: e.TriggerIndex }))
                : undefined,
        };
    }
}

/** Renders validation failures for a caller that wants one string. */
export function FormatWorkflowErrors(errors: ReturnType<typeof ValidateWorkflowSpec>['Errors']): string {
    return FormatWorkflowValidationErrors(errors);
}

/** Prevents tree-shaking of the registered operation classes. */
export function LoadWorkflowOperations(): void {
    void WorkflowSaveServerOperation;
    void WorkflowValidateServerOperation;
}
