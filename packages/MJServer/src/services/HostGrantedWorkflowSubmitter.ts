import {
    ActionEngineBase,
    HostGrantedWorkflowSubmitterRegistry,
    type HostGrantedWorkflowSubmissionPayload,
    type HostGrantedWorkflowSubmissionResult,
    type HostGrantedWorkflowSubmitter,
    type ServerBoundScopeBindings,
} from '@memberjunction/actions-base';
import {
    BuildTaskSecurityEnvelope,
    type BoundActionParams,
    type TaskGraphSpec,
    type TaskRunScope,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import { LogError, Metadata, type IMetadataProvider } from '@memberjunction/core';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { RegisterDefaultNamedPersonAgentRequestHandler } from '@memberjunction/core-entities-server';
import { BaseSingleton } from '@memberjunction/global';
import { TaskGraphService } from '@memberjunction/task-graph';

/**
 * Host-approved workflow definition registered for a `WorkflowKey`.
 * Untrusted callers can only trigger workflows registered here — never arbitrary `TaskGraphSpec`s.
 */
export interface HostGrantedWorkflowDefinition {
    WorkflowKey: string;
    BuildSpec: (payload: HostGrantedWorkflowSubmissionPayload) => TaskGraphSpec;
    /** Optional action IDs that must receive `payload.ServerBoundScope` inside `SecurityEnvelope.BoundActionParams`. */
    BoundActionIDs?: ReadonlyArray<string>;
    DefaultEnvironmentID?: string;
}

/**
 * Registry of host-approved workflow definitions callable through {@link MJServerHostGrantedWorkflowSubmitter}.
 */
export class HostGrantedWorkflowCatalog extends BaseSingleton<HostGrantedWorkflowCatalog> {
    private readonly definitions = new Map<string, HostGrantedWorkflowDefinition>();

    protected constructor() {
        super();
    }

    public static get Instance(): HostGrantedWorkflowCatalog {
        return super.getInstance<HostGrantedWorkflowCatalog>('HostGrantedWorkflowCatalog');
    }

    /** Registers (or replaces) a host-granted workflow definition by `WorkflowKey`. */
    public Register(definition: HostGrantedWorkflowDefinition): void {
        const key = definition.WorkflowKey.trim().toLowerCase();
        if (!key) {
            throw new Error('HostGrantedWorkflowCatalog.Register requires a non-empty WorkflowKey.');
        }
        this.definitions.set(key, definition);
    }

    /** Looks up a registered host-granted workflow definition by `WorkflowKey`. */
    public GetWorkflow(workflowKey: string): HostGrantedWorkflowDefinition | undefined {
        return this.definitions.get(workflowKey.trim().toLowerCase());
    }

    /** Clears all definitions (for unit test isolation). */
    public Clear(): void {
        this.definitions.clear();
    }
}

/**
 * Server-side {@link HostGrantedWorkflowSubmitter} wired over `TaskGraphService.Submit` and
 * `TaskSecurityEnvelope`, enforcing server-bound scope and audience constraints on every submitted node.
 */
export class MJServerHostGrantedWorkflowSubmitter implements HostGrantedWorkflowSubmitter {
    public async SubmitHostGrantedWorkflow(
        payload: HostGrantedWorkflowSubmissionPayload
    ): Promise<HostGrantedWorkflowSubmissionResult> {
        const workflowKey = payload.WorkflowKey?.trim() ?? '';
        if (!workflowKey || !payload.ContextUser?.ID) {
            return {
                Success: false,
                WorkflowKey: workflowKey,
                Status: 'Rejected',
                ReceiptMessage: 'WorkflowKey and authenticated ContextUser are required.',
                ErrorMessage: 'Invalid HostGrantedWorkflowSubmissionPayload.',
            };
        }

        const definition = HostGrantedWorkflowCatalog.Instance.GetWorkflow(workflowKey);
        if (!definition) {
            return {
                Success: false,
                WorkflowKey: workflowKey,
                Status: 'Rejected',
                ReceiptMessage: `Workflow '${workflowKey}' is not host-granted for submission.`,
                ErrorMessage: `No host-granted workflow definition registered for '${workflowKey}'.`,
            };
        }

        try {
            const spec = definition.BuildSpec(payload);
            const provider: IMetadataProvider = payload.Provider ?? Metadata.Provider; // global-provider-ok: fallback when submission omits provider
            const environmentID =
                payload.EnvironmentID?.trim() ||
                definition.DefaultEnvironmentID?.trim() ||
                MJEnvironmentEntityExtended.DefaultEnvironmentID;

            const envelope = this.buildSecurityEnvelope(payload, spec, definition);
            const result = await new TaskGraphService().Submit(spec, {
                EnvironmentID: environmentID,
                ConversationDetailID: payload.ConversationDetailID ?? null,
                AgentRunID: payload.SubmittedByAgentRunID ?? null,
                ContextUser: payload.ContextUser,
                Provider: provider,
                ...(envelope ? { SecurityEnvelope: envelope } : {}),
            });

            if (!result.Success) {
                return {
                    Success: false,
                    WorkflowKey: workflowKey,
                    Status: 'Rejected',
                    ReceiptMessage: `Workflow '${workflowKey}' submission was rejected.`,
                    ErrorMessage: result.ErrorMessage ?? 'TaskGraphService.Submit failed.',
                };
            }

            return {
                Success: true,
                ParentTaskID: result.ParentTaskID,
                WorkflowKey: workflowKey,
                Status: 'Submitted',
                ReceiptMessage: `Workflow '${payload.WorkflowName?.trim() || spec.workflowName || workflowKey}' submitted.`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[MJServerHostGrantedWorkflowSubmitter] Failed to submit '${workflowKey}': ${msg}`);
            return {
                Success: false,
                WorkflowKey: workflowKey,
                Status: 'Rejected',
                ReceiptMessage: `Workflow '${workflowKey}' could not be submitted.`,
                ErrorMessage: msg,
            };
        }
    }

    private buildSecurityEnvelope(
        payload: HostGrantedWorkflowSubmissionPayload,
        spec: TaskGraphSpec,
        definition: HostGrantedWorkflowDefinition
    ): TaskSecurityEnvelope | undefined {
        const boundActionParams = this.buildBoundActionParams(
            payload.ServerBoundScope,
            spec,
            definition.BoundActionIDs
        );
        const runScope: TaskRunScope | undefined = payload.RunScope
            ? {
                  PrimaryScopeEntityName: payload.RunScope.PrimaryScopeEntityName ?? null,
                  PrimaryScopeRecordID: payload.RunScope.PrimaryScopeRecordID ?? null,
                  SecondaryScopes: payload.RunScope.SecondaryScopes ?? null,
                  ...(payload.RunScope.SearchScopeIDs && payload.RunScope.SearchScopeIDs.length > 0
                      ? { SearchScopeIDs: [...payload.RunScope.SearchScopeIDs] }
                      : {}),
              }
            : undefined;

        const audienceMode = payload.Audience?.Mode;
        const readerUserIDs =
            audienceMode === 'Intersection'
                ? payload.Audience?.ReaderUserIDs ??
                  payload.Audience?.Readers?.map((reader) => reader.ID)
                : undefined;

        return BuildTaskSecurityEnvelope({
            BoundActionParams: boundActionParams,
            AudienceMode: audienceMode,
            AudienceReaderUserIDs: readerUserIDs,
            RunScope: runScope ?? null,
            CallerTenantContext: payload.ContextUser.TenantContext,
        });
    }

    private buildBoundActionParams(
        serverBoundScope: ServerBoundScopeBindings,
        spec: TaskGraphSpec,
        explicitActionIds: ReadonlyArray<string> | undefined
    ): BoundActionParams | undefined {
        const scopeEntries = Object.entries(serverBoundScope).filter(
            (entry): entry is [string, NonNullable<ServerBoundScopeBindings[string]>] =>
                entry[1] !== undefined
        );
        if (scopeEntries.length === 0) {
            return undefined;
        }

        const targetActionIds = new Set<string>(explicitActionIds ?? []);
        for (const task of spec.tasks ?? []) {
            if (task.kind !== 'Action' || !ActionEngineBase.Instance.Loaded || !task.configuration) {
                continue;
            }
            const actionName =
                'actionName' in task.configuration && typeof task.configuration.actionName === 'string'
                    ? task.configuration.actionName
                    : undefined;
            if (!actionName) {
                continue;
            }
            const action = ActionEngineBase.Instance.GetActionByName(actionName);
            if (action?.ID) {
                targetActionIds.add(action.ID);
            }
        }

        if (targetActionIds.size === 0) {
            return undefined;
        }

        const boundParams: BoundActionParams = {};
        const scopeRecord: Record<string, string | number | boolean | string[] | null> =
            Object.fromEntries(scopeEntries);
        for (const actionId of targetActionIds) {
            boundParams[actionId] = { ...scopeRecord };
        }
        return boundParams;
    }
}

/**
 * Registers host bindings for `SupportsAudience` actions in `@memberjunction/server`:
 * 1. {@link MJServerHostGrantedWorkflowSubmitter} in {@link HostGrantedWorkflowSubmitterRegistry}
 * 2. Default {@link AudienceNamedPersonAgentRequestService} in {@link NamedPersonAgentRequestRegistry}
 */
export function RegisterAudienceActionHostBindings(): void {
    HostGrantedWorkflowSubmitterRegistry.Instance.Register(new MJServerHostGrantedWorkflowSubmitter());
    RegisterDefaultNamedPersonAgentRequestHandler();
}
