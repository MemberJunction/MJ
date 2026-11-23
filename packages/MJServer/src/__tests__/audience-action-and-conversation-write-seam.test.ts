import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
        Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
        createUnionType: () => class {},
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {}, Int: class {}, ID: class {},
    };
});
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import * as CoreEntities from '@memberjunction/core-entities';
import {
    ActionEngineBase,
    HostGrantedWorkflowSubmitterRegistry,
    MJActionEntityExtended,
    NamedPersonAgentRequestRegistry,
    type HostGrantedWorkflowSubmissionPayload,
} from '@memberjunction/actions-base';
import {
    ConversationDetailWritePermissionProvider,
    ConversationDetailWritePermissionRegistry,
    type ConversationDetailWritePermissionContext,
    type ConversationDetailWritePermissionVerdict,
    type ConversationSummaryForWritePermission,
} from '@memberjunction/core-entities-server';
import { TaskGraphService } from '@memberjunction/task-graph';
import {
    HostGrantedWorkflowCatalog,
    MJServerHostGrantedWorkflowSubmitter,
    RegisterAudienceActionHostBindings,
} from '../services/HostGrantedWorkflowSubmitter.js';
import {
    AuthorizeConversationDetailWrite,
    InitializeConversationDetailWritePermissionProviders,
    ResolveConversationDetailWriteContext,
} from '../services/ConversationDetailWritePermissionWiring.js';
import { TaskGraphAgentRunner } from '../services/TaskGraphAgentRunner.js';
import { ActionResolver } from '../resolvers/ActionResolver.js';
import { ActionEngineServer } from '@memberjunction/actions';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { RunView } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { AppContext } from '../types.js';

function makeUser(id: string, type: 'User' | 'Owner' = 'User'): UserInfo {
    return {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        Type: type,
        UserRoles: [],
        TenantContext: { TenantID: 'tenant-1', Source: 'custom' },
    } as UserInfo;
}

class CustomRulePermissionProvider extends ConversationDetailWritePermissionProvider {
    public EvaluateWritePermission(
        context: ConversationDetailWritePermissionContext
    ): ConversationDetailWritePermissionVerdict {
        if (context.Conversation?.ExternalID === 'community-room') {
            return { Decision: 'Allow', Reason: 'Community member rule' };
        }
        if (context.Conversation?.ExternalID === 'frozen-room') {
            return { Decision: 'Deny', Reason: 'Room is archived' };
        }
        return { Decision: 'Abstain' };
    }
}

describe('MJServer Host-Granted Workflow Submission & ActionResolver Receipt Shaping (MJ-3)', () => {
    beforeEach(() => {
        HostGrantedWorkflowCatalog.Instance.Clear();
        HostGrantedWorkflowSubmitterRegistry.Instance.Clear();
        NamedPersonAgentRequestRegistry.Instance.Clear();
    });

    afterEach(() => {
        HostGrantedWorkflowCatalog.Instance.Clear();
        HostGrantedWorkflowSubmitterRegistry.Instance.Clear();
        NamedPersonAgentRequestRegistry.Instance.Clear();
        vi.restoreAllMocks();
    });

    it('rejects ungranted WorkflowKey submissions (fail-closed)', async () => {
        RegisterAudienceActionHostBindings();
        expect(NamedPersonAgentRequestRegistry.Instance.Handler).not.toBeNull();

        const submitSpy = vi.spyOn(TaskGraphService.prototype, 'Submit');
        const payload: HostGrantedWorkflowSubmissionPayload = {
            WorkflowKey: 'unapproved-arbitrary-graph',
            Inputs: { Note: 'x' },
            ServerBoundScope: { OrganizationID: 'org-1' },
            ContextUser: makeUser('user-1'),
            Provider: { ProviderType: 'Database' } as IMetadataProvider,
        };

        const result = await HostGrantedWorkflowSubmitterRegistry.Instance.Submit(payload);
        expect(result.Success).toBe(false);
        expect(result.Status).toBe('Rejected');
        expect(result.ReceiptMessage).toContain('not host-granted');
        expect(submitSpy).not.toHaveBeenCalled();
    });

    it('submits host-granted workflow with bound ServerBoundScope & Audience in SecurityEnvelope and returns sanitized receipt', async () => {
        RegisterAudienceActionHostBindings();
        const boundActionId = 'act-notify-1111';
        HostGrantedWorkflowCatalog.Instance.Register({
            WorkflowKey: 'send-digest',
            BoundActionIDs: [boundActionId],
            BuildSpec: (payload) => ({
                workflowName: 'Digest Workflow',
                reasoning: 'Host-granted digest run',
                tasks: [
                    {
                        tempId: 'step-1',
                        name: 'Send Digest',
                        description: 'Send digest notification',
                        dependsOn: [],
                        actionName: 'Send Digest Action',
                        inputPayload: { SecretInput: payload.Inputs.SecretInput },
                    },
                ],
                durable: true,
            }),
        });

        const submitSpy = vi.spyOn(TaskGraphService.prototype, 'Submit').mockResolvedValue({
            Success: true,
            ParentTaskID: 'parent-task-777',
            TaskIDMap: new Map(),
        });
        vi.spyOn(ActionEngineBase.Instance, 'Loaded', 'get').mockReturnValue(false);
        vi.spyOn(ActionEngineBase.Instance, 'Config').mockResolvedValue();
        vi.spyOn(ActionEngineBase.Instance, 'GetActionByName').mockReturnValue(undefined);

        const caller = makeUser('user-1');
        const reader = makeUser('user-2');
        const result = await new MJServerHostGrantedWorkflowSubmitter().SubmitHostGrantedWorkflow({
            WorkflowKey: 'send-digest',
            Inputs: { SecretInput: 'confidential-text' },
            ServerBoundScope: { OrganizationID: 'org-real', Department: 'Legal' },
            RunScope: {
                PrimaryScopeEntityName: 'Organizations',
                PrimaryScopeRecordID: 'org-real',
                SecondaryScopes: { Department: 'Legal' },
            },
            Audience: {
                Mode: 'Intersection',
                Readers: [reader],
                ReaderUserIDs: [reader.ID],
            },
            ConversationDetailID: 'detail-55',
            ContextUser: caller,
            Provider: { ProviderType: 'Database' } as IMetadataProvider,
        });

        expect(result).toEqual({
            Success: true,
            ParentTaskID: 'parent-task-777',
            WorkflowKey: 'send-digest',
            Status: 'Submitted',
            ReceiptMessage: "Workflow 'Digest Workflow' submitted.",
        });
        expect(result.ReceiptMessage).not.toContain('confidential-text');

        expect(submitSpy).toHaveBeenCalledOnce();
        const submittedContext = submitSpy.mock.calls[0]?.[1];
        expect(submittedContext?.SecurityEnvelope).toMatchObject({
            BoundActionParams: {
                [boundActionId]: { OrganizationID: 'org-real', Department: 'Legal' },
            },
            Audience: { ReaderUserIDs: ['user-2'] },
            RunScope: {
                PrimaryScopeEntityName: 'Organizations',
                PrimaryScopeRecordID: 'org-real',
                SecondaryScopes: { Department: 'Legal' },
            },
            CallerTenantContext: { TenantID: 'tenant-1', Source: 'custom' },
        });
    });

    it('ActionResolver.RunAction returns receipt-only Message and ResultData when ChatReceipt is produced', async () => {
        const caller = makeUser('user-owner', 'Owner');
        const actionEntity = {
            ID: 'action-receipt-1',
            Name: 'Receipt Action',
            Type: 'Custom',
            Params: [],
        } as Partial<MJActionEntityExtended> as MJActionEntityExtended;

        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue();
        vi.spyOn(ActionEngineServer.Instance, 'Actions', 'get').mockReturnValue([actionEntity]);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(caller);

        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockResolvedValue({
            Success: true,
            ResultCode: 'SUBMITTED',
            Message: 'Workflow submitted cleanly.',
            Params: [
                { Name: 'WorkflowTaskID', Type: 'Output', Value: 'task-501' },
            ],
            ChatReceipt: {
                ReceiptOnly: true,
                ActionName: 'Receipt Action',
                ActionID: 'action-receipt-1',
                Success: true,
                ResultCode: 'SUBMITTED',
                Summary: 'Workflow submitted cleanly.',
                ReceiptType: 'WorkflowSubmission',
                ReferenceID: 'task-501',
                RedactedOutputParamNames: ['InternalSecret'],
                RetainedOutputParamNames: ['WorkflowTaskID'],
                TimestampIso: '2026-11-23T00:00:00.000Z',
            },
            RunParams: {
                Action: actionEntity,
                ContextUser: caller,
                Filters: [],
                Params: [],
            },
        });

        const resolver = new ActionResolver();
        const provider = {
            ProviderType: 'Database',
            Entities: [],
        } as Partial<IMetadataProvider> as IMetadataProvider;
        const ctx = {
            providers: [{ provider, type: 'ReadWrite' }],
            userPayload: { userRecord: caller },
        } as Partial<AppContext> as AppContext;

        const output = await resolver.RunAction({ ActionID: 'action-receipt-1', Params: [] }, ctx);
        expect(output.Success).toBe(true);
        expect(output.Message).toBe('Workflow submitted cleanly.');
        expect(output.ResultCode).toBe('SUBMITTED');
        const parsedData = JSON.parse(output.ResultData ?? '{}') as {
            ChatReceipt?: { ReceiptOnly: boolean; ReferenceID?: string };
            Params?: Array<{ Name: string; Value: string }>;
        };
        expect(parsedData.ChatReceipt?.ReceiptOnly).toBe(true);
        expect(parsedData.ChatReceipt?.ReferenceID).toBe('task-501');
        expect(parsedData.Params).toEqual([{ Name: 'WorkflowTaskID', Type: 'Output', Value: 'task-501' }]);
    });

    it('loads ActionEngineBase when unloaded, binds top-level task.actionName without BoundActionIDs, and fails closed when ServerBoundScope has no resolvable action target', async () => {
        type LegacyActionNode = {
            tempId: string;
            name: string;
            description: string;
            dependsOn: string[];
            actionName: string;
        };
        const legacyTask: LegacyActionNode = {
            tempId: 'step-top',
            name: 'Top Level Step',
            description: 'Uses top-level actionName',
            dependsOn: [],
            actionName: 'Send Digest Action',
        };
        HostGrantedWorkflowCatalog.Instance.Register({
            WorkflowKey: 'top-level-action-wf',
            BuildSpec: () =>
                ({
                    workflowName: 'Top-Level Action Workflow',
                    tasks: [legacyTask],
                    durable: true,
                }) as Partial<import('@memberjunction/ai-core-plus').TaskGraphSpec> as import('@memberjunction/ai-core-plus').TaskGraphSpec,
        });

        const submitSpy = vi.spyOn(TaskGraphService.prototype, 'Submit').mockResolvedValue({
            Success: true,
            ParentTaskID: 'parent-top-1',
            TaskIDMap: new Map(),
        });
        vi.spyOn(ActionEngineBase.Instance, 'Loaded', 'get').mockReturnValue(false);
        const configSpy = vi.spyOn(ActionEngineBase.Instance, 'Config').mockResolvedValue();
        vi.spyOn(ActionEngineBase.Instance, 'GetActionByName').mockImplementation((name: string) =>
            name === 'Send Digest Action' ? ({ ID: 'act-top-level-id' } as MJActionEntityExtended) : undefined
        );

        const caller = makeUser('user-1');
        const provider = { ProviderType: 'Database' } as IMetadataProvider;
        const submitter = new MJServerHostGrantedWorkflowSubmitter();
        const boundRes = await submitter.SubmitHostGrantedWorkflow({
            WorkflowKey: 'top-level-action-wf',
            Inputs: {},
            ServerBoundScope: { OrganizationID: 'org-real' },
            ContextUser: caller,
            Provider: provider,
        });

        expect(boundRes.Success).toBe(true);
        expect(configSpy).toHaveBeenCalledWith(false, caller, provider);
        expect(submitSpy.mock.calls[0]?.[1]?.SecurityEnvelope?.BoundActionParams).toEqual({
            'act-top-level-id': { OrganizationID: 'org-real' },
        });

        // Fail closed when ServerBoundScope is non-empty and no action IDs resolve
        vi.spyOn(ActionEngineBase.Instance, 'GetActionByName').mockReturnValue(undefined);
        const rejectedRes = await submitter.SubmitHostGrantedWorkflow({
            WorkflowKey: 'top-level-action-wf',
            Inputs: {},
            ServerBoundScope: { OrganizationID: 'org-real' },
            ContextUser: caller,
            Provider: provider,
        });
        expect(rejectedRes.Success).toBe(false);
        expect(rejectedRes.Status).toBe('Rejected');
        expect(rejectedRes.ErrorMessage).toContain('ServerBoundScope');
        expect(submitSpy).toHaveBeenCalledTimes(1);

        // Fail closed when AudienceContract has AllowsHostGrantedWorkflowSubmission: false
        const disallowedRes = await submitter.SubmitHostGrantedWorkflow({
            WorkflowKey: 'top-level-action-wf',
            Inputs: {},
            ServerBoundScope: { OrganizationID: 'org-real' },
            AudienceContract: { SupportsAudience: true, AllowsHostGrantedWorkflowSubmission: false },
            ContextUser: caller,
            Provider: provider,
        });
        expect(disallowedRes.Success).toBe(false);
        expect(disallowedRes.Status).toBe('Rejected');
    });
});

describe('MJServer Pluggable Conversation-Detail Write Permission Wiring (MJ-4)', () => {
    beforeEach(() => {
        ConversationDetailWritePermissionRegistry.Instance.Clear();
    });

    afterEach(() => {
        ConversationDetailWritePermissionRegistry.Instance.Clear();
        vi.restoreAllMocks();
    });

    it('authorizes via registered custom provider and falls back to UserMayWriteConversation on Abstain', async () => {
        ConversationDetailWritePermissionRegistry.Instance.Register('community', new CustomRulePermissionProvider());
        expect(InitializeConversationDetailWritePermissionProviders()).toBeGreaterThanOrEqual(1);

        const defaultUserMayWriteSpy = vi
            .spyOn(CoreEntities, 'UserMayWriteConversation')
            .mockResolvedValue({ Allowed: false, Reason: 'No ResourcePermission grant', IsOwner: false, Loaded: true });

        const provider = { ProviderType: 'Database' } as IMetadataProvider;
        const user = makeUser('user-1');
        const detail = { ConversationID: 'conv-1', Role: 'User' } as MJConversationDetailEntity;

        const roomSummary: ConversationSummaryForWritePermission = {
            ID: 'conv-1',
            UserID: 'other-owner',
            TypeID: null,
            ProjectID: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorType: null,
            ExternalID: 'community-room',
            AdditionalData: null,
        };

        // 1. Custom Allow short-circuits without ResourcePermission fallback
        const allowDecision = await AuthorizeConversationDetailWrite({
            Provider: provider,
            ContextUser: user,
            Operation: 'create',
            ConversationDetail: detail,
            Conversation: roomSummary,
        });
        expect(allowDecision.Allowed).toBe(true);
        expect(allowDecision.DecisionSource).toBe('CustomProvider');
        expect(defaultUserMayWriteSpy).not.toHaveBeenCalled();

        // 2. Custom Deny blocks write immediately
        const denyDecision = await AuthorizeConversationDetailWrite({
            Provider: provider,
            ContextUser: user,
            Operation: 'create',
            ConversationDetail: detail,
            Conversation: { ...roomSummary, ExternalID: 'frozen-room' },
        });
        expect(denyDecision.Allowed).toBe(false);
        expect(denyDecision.Reason).toBe('Room is archived');
        expect(denyDecision.DecisionSource).toBe('CustomProvider');
        expect(defaultUserMayWriteSpy).not.toHaveBeenCalled();

        // 3. Abstain falls back to default UserMayWriteConversation
        const fallbackDecision = await AuthorizeConversationDetailWrite({
            Provider: provider,
            ContextUser: user,
            Operation: 'create',
            ConversationDetail: detail,
            Conversation: { ...roomSummary, ExternalID: 'standard-chat' },
        });
        expect(fallbackDecision.Allowed).toBe(false);
        expect(fallbackDecision.DecisionSource).toBe('Default');
        expect(fallbackDecision.Reason).toBe('No ResourcePermission grant');
        expect(defaultUserMayWriteSpy).toHaveBeenCalledOnce();
    });

    it('ResolveConversationDetailWriteContext returns null for non-database provider and AuthorizeConversationDetailWrite fails closed on DB lookup error', async () => {
        const gqlProvider = { ProviderType: 'GraphQL' } as IMetadataProvider;
        const res = await ResolveConversationDetailWriteContext(gqlProvider, makeUser('user-1'), 'conv-1');
        expect(res).toBeNull();

        ConversationDetailWritePermissionRegistry.Instance.Register('community', new CustomRulePermissionProvider());
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockRejectedValue(new Error('DB connection lost')),
        } as Pick<RunView, 'RunView'> as RunView);

        const dbProvider = { ProviderType: 'Database' } as IMetadataProvider;
        const detail = { ConversationID: 'conv-err', Role: 'User' } as MJConversationDetailEntity;
        const failClosed = await AuthorizeConversationDetailWrite({
            Provider: dbProvider,
            ContextUser: makeUser('user-1'),
            Operation: 'create',
            ConversationDetail: detail,
        });
        expect(failClosed.Allowed).toBe(false);
        expect(failClosed.Reason).toBe('Unable to verify conversation write permissions.');
    });
});

describe('TaskGraphAgentRunner whole-workflow cumulative budget seeding (CR-5)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('seeds child treeBudget with WorkflowMaxCostUsd and prior CumulativeCostUsd so multi-node breaches report whole-workflow Limit and PriorCost + ChildCost', async () => {
        const fakeAgent = { ID: 'agent-1', Name: 'Step Agent' } as MJAIAgentEntityExtended;
        const fakeProvider = {
            ProviderType: 'Database',
            GetEntityObject: vi.fn().mockResolvedValue({
                Load: vi.fn().mockResolvedValue(true),
                ID: fakeAgent.ID,
                Name: fakeAgent.Name,
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const runAgentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementation(async (runParams) => {
            const budget = runParams.treeBudget!;
            // Prior spend ($0.18) + child spend ($0.10) = $0.28 >= $0.25 workflow cap
            const childSpend = 0.10;
            const totalCumulative = (budget.cumulativeCostUsd ?? 0) + childSpend;
            return {
                success: false,
                payload: null,
                agentRun: { ID: 'run-2', TotalCost: childSpend, ErrorMessage: 'Workflow USD cost budget exceeded' } as MJAIAgentRunEntityExtended,
                limitExceeded: {
                    Code: 'WORKFLOW_COST_LIMIT_EXCEEDED',
                    Dimension: 'CostUsd',
                    Limit: budget.workflowMaxCostUsd ?? 0,
                    CumulativeCostUsd: totalCumulative,
                    ElapsedWallClockMs: 500,
                    WorkflowStartedAtMs: budget.workflowStartedAtMs ?? Date.now(),
                    BreachedAtMs: Date.now(),
                    CurrentValue: totalCumulative,
                    SourceScope: 'Workflow',
                    Reason: `Workflow USD cost budget exceeded ($${totalCumulative.toFixed(4)}/$${(budget.workflowMaxCostUsd ?? 0).toFixed(4)})`,
                },
            };
        });

        const runner = new TaskGraphAgentRunner();
        const result = await runner.RunAgentForTask({
            TaskID: 'task-node-2',
            AgentID: 'agent-1',
            InputPayload: {},
            DependencyOutputs: new Map(),
            Provider: fakeProvider,
            ContextUser: makeUser('user-1'),
            WorkflowBudget: {
                ParentTaskID: 'parent-wf-1',
                WorkflowMaxCostUsd: 0.25,
                WorkflowMaxDurationMs: 60_000,
                WorkflowStartedAtMs: Date.now() - 1_000,
                CumulativeCostUsd: 0.18,
                RemainingCostUsd: 0.07,
                RemainingWallClockMs: 59_000,
            },
        });

        expect(runAgentSpy).toHaveBeenCalledOnce();
        const passedParams = runAgentSpy.mock.calls[0]?.[0];
        expect(passedParams?.workflowMaxCostUsd).toBe(0.25);
        expect(passedParams?.treeBudget?.workflowMaxCostUsd).toBe(0.25);
        expect(passedParams?.treeBudget?.cumulativeCostUsd).toBeCloseTo(0.18, 6);
        expect(result.LimitExceeded?.Limit).toBe(0.25);
        expect(result.LimitExceeded?.CumulativeCostUsd).toBeCloseTo(0.28, 6);
    });
});
