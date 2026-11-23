import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { ActionResultSimple, RunActionParams } from '../ActionEngine-Base';
import {
    AssertAllowsHostGrantedWorkflowSubmission,
    AssertAllowsNamedPersonAgentRequests,
    CreateContractGovernedNamedPersonRequest,
    EnforceServerBoundHiddenScopeParams,
    HasServerBoundHiddenScopeParams,
    HostGrantedWorkflowSubmitterRegistry,
    IsHostGrantedWorkflowSubmissionPayload,
    IsNamedPersonAgentRequestPayload,
    IsSupportsAudienceContract,
    NamedPersonAgentRequestRegistry,
    NormalizeAudienceDescriptor,
    RequiresReceiptOnlyChatReturn,
    ResolveServerBoundScopeValue,
    SERVER_BOUND_SCOPE_MISSING_RESULT_CODE,
    SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE,
    ShapeActionReturnForChat,
    SubmitContractGovernedWorkflow,
    type HostGrantedWorkflowSubmissionPayload,
    type HostGrantedWorkflowSubmitter,
    type NamedPersonAgentRequestHandler,
    type NamedPersonAgentRequestPayload,
    type ReceiptOnlyReturnShapingPolicy,
    type ServerBoundHiddenScopeParamDeclaration,
    type SupportsAudienceContract,
} from '../SupportsAudienceContract';

function makeUser(id: string, name = 'Test User'): UserInfo {
    return { ID: id, Name: name, Email: `${id}@example.com`, UserRoles: [] } as UserInfo;
}

describe('SupportsAudienceContract (packages/Actions/Base)', () => {
    beforeEach(() => {
        HostGrantedWorkflowSubmitterRegistry.Instance.Clear();
        NamedPersonAgentRequestRegistry.Instance.Clear();
    });

    describe('Type guards & contract helpers', () => {
        it('validates SupportsAudienceContract via IsSupportsAudienceContract', () => {
            const valid: SupportsAudienceContract = {
                SupportsAudience: true,
                SupportedModes: ['Intersection', 'ScopeCommonReach'],
                HiddenScopeParams: [
                    { ParamName: 'OrganizationID', Source: 'RunScope.PrimaryScopeRecordID', Required: true },
                ],
                ReturnShaping: { Enabled: true, AllowedReceiptParamNames: ['ReceiptID'] },
                AllowsHostGrantedWorkflowSubmission: true,
                AllowsNamedPersonAgentRequests: true,
            };

            expect(IsSupportsAudienceContract(valid)).toBe(true);
            expect(HasServerBoundHiddenScopeParams(valid)).toBe(true);
            expect(IsSupportsAudienceContract(null)).toBe(false);
            expect(IsSupportsAudienceContract({})).toBe(false);
            expect(IsSupportsAudienceContract({ SupportsAudience: 'yes' })).toBe(false);
            expect(
                IsSupportsAudienceContract({
                    SupportsAudience: true,
                    HiddenScopeParams: [{ ParamName: '', Source: 'ContextUser.ID' }],
                })
            ).toBe(false);
            expect(
                IsSupportsAudienceContract({
                    SupportsAudience: true,
                    AllowsHostGrantedWorkflowSubmission: 'true',
                })
            ).toBe(false);
            expect(
                IsSupportsAudienceContract({
                    SupportsAudience: true,
                    AllowsNamedPersonAgentRequests: 1,
                })
            ).toBe(false);
            expect(
                IsSupportsAudienceContract({
                    SupportsAudience: true,
                    SupportedModes: ['InvalidMode'],
                })
            ).toBe(false);
        });

        it('validates HostGrantedWorkflowSubmissionPayload and NamedPersonAgentRequestPayload', () => {
            const caller = makeUser('user-1');
            const wfPayload: HostGrantedWorkflowSubmissionPayload = {
                WorkflowKey: 'expense-approval',
                Inputs: { Amount: 1200, Currency: 'USD' },
                ServerBoundScope: { OrganizationID: 'org-1' },
                ContextUser: caller,
            };
            const reqPayload: NamedPersonAgentRequestPayload = {
                TargetUserID: 'user-2',
                Subject: 'Approve Q4 budget',
                Message: 'Please approve the Q4 budget proposal.',
                ContextUser: caller,
            };

            expect(IsHostGrantedWorkflowSubmissionPayload(wfPayload)).toBe(true);
            expect(IsHostGrantedWorkflowSubmissionPayload({ WorkflowKey: '', Inputs: {}, ServerBoundScope: {}, ContextUser: caller })).toBe(false);
            expect(IsNamedPersonAgentRequestPayload(reqPayload)).toBe(true);
            expect(IsNamedPersonAgentRequestPayload({ TargetUserID: 'user-2', Subject: '', Message: 'hi', ContextUser: caller })).toBe(false);
        });

        it('normalizes audience descriptors for Caller, Intersection, and ScopeCommonReach modes', () => {
            const caller = makeUser('caller-1');
            const readerA = makeUser('reader-a');
            const readerB = makeUser('reader-b');

            expect(NormalizeAudienceDescriptor({ ContextUser: caller }).Mode).toBe('Caller');
            const intersection = NormalizeAudienceDescriptor({
                ContextUser: caller,
                Audience: { Readers: [caller, readerA, readerB, readerA] },
                RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-1', SecondaryScopes: null },
            });
            expect(intersection.Mode).toBe('Intersection');
            expect(intersection.ReaderUserIDs).toEqual(['reader-a', 'reader-b']);

            const structural = NormalizeAudienceDescriptor({
                ContextUser: caller,
                IsStructuralAudience: true,
                RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-1', SecondaryScopes: null },
            });
            expect(structural.Mode).toBe('ScopeCommonReach');
            expect(structural.IsStructuralAudience).toBe(true);
        });
    });

    describe('ResolveServerBoundScopeValue & EnforceServerBoundHiddenScopeParams', () => {
        const declarations: ServerBoundHiddenScopeParamDeclaration[] = [
            { ParamName: 'OrganizationID', Source: 'RunScope.PrimaryScopeRecordID', Required: true },
            { ParamName: 'Department', Source: 'RunScope.SecondaryScope', SecondaryScopeKey: 'Dept', OverridePolicy: 'StripAndInject' },
            { ParamName: 'CallerUserID', Source: 'ContextUser.ID' },
        ];

        it('resolves authoritative values from RunScope, ContextUser, and ServerBoundScopeParams', () => {
            const params: Pick<RunActionParams, 'RunScope' | 'ContextUser' | 'ServerBoundScopeParams'> = {
                ContextUser: makeUser('user-99'),
                RunScope: {
                    PrimaryScopeEntityName: 'Organizations',
                    PrimaryScopeRecordID: 'org-abc',
                    SecondaryScopes: { Dept: 'Finance' },
                    SearchScopeIDs: ['scope-1'],
                },
                ServerBoundScopeParams: { CustomScope: 'val-1' },
            };

            expect(ResolveServerBoundScopeValue(declarations[0], params)).toEqual({ Found: true, Value: 'org-abc' });
            expect(ResolveServerBoundScopeValue(declarations[1], params)).toEqual({ Found: true, Value: 'Finance' });
            expect(ResolveServerBoundScopeValue(declarations[2], params)).toEqual({ Found: true, Value: 'user-99' });
            expect(
                ResolveServerBoundScopeValue({ ParamName: 'customscope', Source: 'ExplicitServerBinding' }, params)
            ).toEqual({ Found: true, Value: 'val-1' });
        });

        it('rejects untrusted client/LLM attempts to spoof a Reject-policy hidden scope parameter (case-insensitive)', () => {
            const result = EnforceServerBoundHiddenScopeParams(
                {
                    ContextUser: makeUser('user-1'),
                    RunScope: {
                        PrimaryScopeEntityName: 'Organizations',
                        PrimaryScopeRecordID: 'org-real',
                        SecondaryScopes: null,
                    },
                    Params: [
                        { Name: 'Query', Type: 'Input', Value: 'budgets' },
                        { Name: 'organizationid', Type: 'Input', Value: 'org-spoofed' },
                    ],
                },
                declarations
            );

            expect(result.Allowed).toBe(false);
            expect(result.ResultCode).toBe(SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE);
            expect(result.StrippedParamNames).toContain('organizationid');
            expect(result.Violations).toHaveLength(1);
            expect(result.Violations[0]?.ParamName).toBe('OrganizationID');
            expect(result.EnforcedParams.some((p) => p.Name.toLowerCase() === 'organizationid')).toBe(false);
        });

        it('strips client override under StripAndInject and injects authoritative server-bound value with Bound=true', () => {
            const result = EnforceServerBoundHiddenScopeParams(
                {
                    ContextUser: makeUser('user-1'),
                    RunScope: {
                        PrimaryScopeEntityName: 'Organizations',
                        PrimaryScopeRecordID: 'org-real',
                        SecondaryScopes: { Dept: 'Engineering' },
                    },
                    Params: [
                        { Name: 'Query', Type: 'Input', Value: 'roadmap' },
                        { Name: 'department', Type: 'Input', Value: 'HR-Spoofed' },
                    ],
                },
                declarations
            );

            expect(result.Allowed).toBe(true);
            expect(result.StrippedParamNames).toEqual(['department']);
            expect(result.InjectedParamNames).toEqual(['OrganizationID', 'Department', 'CallerUserID']);

            const deptParam = result.EnforcedParams.find((p) => p.Name === 'Department');
            expect(deptParam).toEqual({ Name: 'Department', Type: 'Input', Value: 'Engineering', Bound: true });
            const orgParam = result.EnforcedParams.find((p) => p.Name === 'OrganizationID');
            expect(orgParam).toEqual({ Name: 'OrganizationID', Type: 'Input', Value: 'org-real', Bound: true });
        });

        it('fails closed with SERVER_BOUND_SCOPE_MISSING when a required server-bound scope is absent', () => {
            const result = EnforceServerBoundHiddenScopeParams(
                {
                    ContextUser: makeUser('user-1'),
                    Params: [{ Name: 'Query', Type: 'Input', Value: 'test' }],
                },
                declarations
            );

            expect(result.Allowed).toBe(false);
            expect(result.ResultCode).toBe(SERVER_BOUND_SCOPE_MISSING_RESULT_CODE);
            expect(result.Violations[0]?.Reason).toBe('MissingRequiredServerScope');
        });
    });

    describe('ShapeActionReturnForChat & RequiresReceiptOnlyChatReturn', () => {
        it('strips sensitive output params, raw Message, and AIDirectives while emitting ActionChatReceipt', () => {
            const policy: ReceiptOnlyReturnShapingPolicy = {
                Enabled: true,
                AllowedReceiptParamNames: ['WorkflowTaskID'],
                ReferenceIDParamName: 'WorkflowTaskID',
                ReceiptType: 'WorkflowSubmission',
                ReceiptMessage: 'Workflow submitted for review.',
            };
            const raw: ActionResultSimple = {
                Success: true,
                ResultCode: 'SUBMITTED',
                Message: '{"secret":"salary=250000","internalEmail":"alice@corp.local"}',
                AIDirectives: [{ Message: 'Internal secret directive', Type: 'context', Priority: 'high' }],
                Params: [
                    { Name: 'Topic', Type: 'Input', Value: 'Q4 Plan' },
                    { Name: 'WorkflowTaskID', Type: 'Output', Value: 'task-42' },
                    { Name: 'RawPayload', Type: 'Output', Value: { salary: 250000 } },
                    { Name: 'OrganizationID', Type: 'Both', Value: 'org-secret', Bound: true },
                ],
            };

            const shaped = ShapeActionReturnForChat('Submit Approval Workflow', 'action-1', raw, policy, ['OrganizationID']);

            expect(shaped.Result.Message).toBe('Workflow submitted for review.');
            expect(shaped.Result.AIDirectives).toBeUndefined();
            expect(shaped.Result.Params?.map((p) => p.Name)).toEqual(['Topic', 'WorkflowTaskID']);
            expect(shaped.Receipt).toMatchObject({
                ReceiptOnly: true,
                ActionName: 'Submit Approval Workflow',
                ActionID: 'action-1',
                Success: true,
                ResultCode: 'SUBMITTED',
                Summary: 'Workflow submitted for review.',
                ReceiptType: 'WorkflowSubmission',
                ReferenceID: 'task-42',
                RedactedOutputParamNames: ['RawPayload', 'OrganizationID'],
                RetainedOutputParamNames: ['WorkflowTaskID'],
            });
            expect(shaped.Result.ChatReceipt).toEqual(shaped.Receipt);
        });

        it('strips injected hidden Input/Bound scope params from shapedResult.Params', () => {
            const policy: ReceiptOnlyReturnShapingPolicy = {
                Enabled: true,
                AllowedReceiptParamNames: ['WorkflowTaskID'],
                ReferenceIDParamName: 'WorkflowTaskID',
            };
            const raw: ActionResultSimple = {
                Success: true,
                ResultCode: 'SUCCESS',
                Params: [
                    { Name: 'Topic', Type: 'Input', Value: 'Public topic' },
                    { Name: 'OrganizationID', Type: 'Input', Value: 'org-secret', Bound: true },
                    { Name: 'InternalTenantTag', Type: 'Input', Value: 'tenant-secret' },
                    { Name: 'ArbitraryBound', Type: 'Input', Value: 'bound-secret', Bound: true },
                    { Name: 'WorkflowTaskID', Type: 'Output', Value: 'task-99' },
                ],
            };

            const shaped = ShapeActionReturnForChat('Test Action', 'act-9', raw, policy, ['OrganizationID', 'InternalTenantTag']);
            expect(shaped.Result.Params?.map((p) => p.Name)).toEqual(['Topic', 'WorkflowTaskID']);
            expect(shaped.Result.Params?.some((p) => p.Bound === true)).toBe(false);
            expect(shaped.Receipt.RedactedOutputParamNames).toEqual([
                'OrganizationID',
                'InternalTenantTag',
                'ArbitraryBound',
            ]);
        });

        it('honours ApplyOnlyWhenAudienceScoped flag', () => {
            const contract: SupportsAudienceContract = {
                SupportsAudience: true,
                ReturnShaping: { Enabled: true, ApplyOnlyWhenAudienceScoped: true },
            };
            expect(RequiresReceiptOnlyChatReturn(contract, undefined, false)).toBe(false);
            expect(RequiresReceiptOnlyChatReturn(contract, undefined, true)).toBe(true);
        });
    });

    describe('HostGrantedWorkflowSubmitterRegistry & NamedPersonAgentRequestRegistry', () => {
        it('fails closed when unregistered and delegates cleanly when registered', async () => {
            const caller = makeUser('user-1');
            const wfPayload: HostGrantedWorkflowSubmissionPayload = {
                WorkflowKey: 'notify-owner',
                Inputs: { Reason: 'Renewal' },
                ServerBoundScope: { OrganizationID: 'org-1' },
                ContextUser: caller,
            };
            const unregisteredWf = await HostGrantedWorkflowSubmitterRegistry.Instance.Submit(wfPayload);
            expect(unregisteredWf.Success).toBe(false);
            expect(unregisteredWf.Status).toBe('Unavailable');

            const submitter: HostGrantedWorkflowSubmitter = {
                SubmitHostGrantedWorkflow: async (p) => ({
                    Success: true,
                    ParentTaskID: 'task-900',
                    WorkflowKey: p.WorkflowKey,
                    Status: 'Submitted',
                    ReceiptMessage: `Submitted ${p.WorkflowKey}`,
                }),
            };
            HostGrantedWorkflowSubmitterRegistry.Instance.Register(submitter);
            const registeredWf = await HostGrantedWorkflowSubmitterRegistry.Instance.Submit(wfPayload);
            expect(registeredWf).toEqual({
                Success: true,
                ParentTaskID: 'task-900',
                WorkflowKey: 'notify-owner',
                Status: 'Submitted',
                ReceiptMessage: 'Submitted notify-owner',
            });

            const reqPayload: NamedPersonAgentRequestPayload = {
                TargetUserID: 'user-2',
                Subject: 'Need signoff',
                Message: 'Please sign off.',
                ContextUser: caller,
            };
            const unregisteredReq = await NamedPersonAgentRequestRegistry.Instance.CreateRequest(reqPayload);
            expect(unregisteredReq.Success).toBe(false);

            const handler: NamedPersonAgentRequestHandler = {
                CreateNamedPersonRequest: async (p) => ({
                    Success: true,
                    AgentRequestID: 'req-77',
                    TargetUserID: p.TargetUserID,
                    Status: 'Requested',
                    ReceiptMessage: `Request queued for ${p.TargetUserID}`,
                }),
            };
            NamedPersonAgentRequestRegistry.Instance.Register(handler);
            const registeredReq = await NamedPersonAgentRequestRegistry.Instance.CreateRequest(reqPayload);
            expect(registeredReq.Success).toBe(true);
            expect(registeredReq.AgentRequestID).toBe('req-77');
        });

        it('fails closed when contract capability flags are false or omitted', async () => {
            const caller = makeUser('user-1');
            const submitSpy = vi.fn().mockResolvedValue({
                Success: true,
                WorkflowKey: 'notify-owner',
                Status: 'Submitted',
                ReceiptMessage: 'ok',
            });
            HostGrantedWorkflowSubmitterRegistry.Instance.Register({ SubmitHostGrantedWorkflow: submitSpy });

            const reqSpy = vi.fn().mockResolvedValue({
                Success: true,
                TargetUserID: 'user-2',
                ReceiptMessage: 'ok',
            });
            NamedPersonAgentRequestRegistry.Instance.Register({ CreateNamedPersonRequest: reqSpy });

            const deniedContract: SupportsAudienceContract = {
                SupportsAudience: true,
                AllowsHostGrantedWorkflowSubmission: false,
                AllowsNamedPersonAgentRequests: false,
            };

            expect(AssertAllowsHostGrantedWorkflowSubmission(deniedContract).Allowed).toBe(false);
            expect(AssertAllowsNamedPersonAgentRequests(deniedContract).Allowed).toBe(false);

            const wfDenied = await SubmitContractGovernedWorkflow(deniedContract, {
                WorkflowKey: 'notify-owner',
                Inputs: {},
                ServerBoundScope: { OrganizationID: 'org-1' },
                ContextUser: caller,
            });
            expect(wfDenied.Success).toBe(false);
            expect(wfDenied.Status).toBe('Rejected');
            expect(submitSpy).not.toHaveBeenCalled();

            const reqDenied = await CreateContractGovernedNamedPersonRequest(deniedContract, {
                TargetUserID: 'user-2',
                TargetAgentID: 'agent-1',
                Subject: 'Hi',
                Message: 'Body',
                ContextUser: caller,
            });
            expect(reqDenied.Success).toBe(false);
            expect(reqSpy).not.toHaveBeenCalled();

            // Registry itself also enforces contract capability flags when AudienceContract is provided
            const regWfDenied = await HostGrantedWorkflowSubmitterRegistry.Instance.Submit({
                WorkflowKey: 'notify-owner',
                Inputs: {},
                ServerBoundScope: { OrganizationID: 'org-1' },
                AudienceContract: { SupportsAudience: true },
                ContextUser: caller,
            });
            expect(regWfDenied.Success).toBe(false);
            expect(regWfDenied.Status).toBe('Rejected');
            expect(submitSpy).not.toHaveBeenCalled();
        });
    });
});
