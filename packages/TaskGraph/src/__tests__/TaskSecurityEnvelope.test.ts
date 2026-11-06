import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskDependencyEntity, MJTaskEntity } from '@memberjunction/core-entities';
import {
    ApplyTaskSecurityEnvelopeToParams,
    BuildTaskSecurityEnvelopeFromAgentScope,
    MergeTaskSecurityEnvelopes,
    ParseTaskSecurityEnvelope,
    SerializeTaskSecurityEnvelope,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import { TaskGraphDispatcher, type ClaimedTaskCandidate } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata } from '../TaskGraphService';
import type { ProviderFactoryOptions, TaskActionRunner, TaskAgentRunner } from '../types';

const TEST_USER = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Tester', IsActive: true } as UserInfo;
const READER_USER_ID = '00000000-0000-0000-0000-000000000002';
const ACTION_SEND_EMAIL_ID = '22222222-2222-4222-8222-222222222222';
const ACTION_INTERNAL_LOG_ID = '33333333-3333-4333-8333-333333333333';

function makeChildTask(fields: {
    ID: string;
    ParentID: string;
    Name: string;
    Status?: MJTaskEntity['Status'];
    StepType?: MJTaskEntity['StepType'];
    ActionID?: string | null;
    AgentID?: string | null;
    PromptID?: string | null;
    UserID?: string | null;
    InputPayload?: string | null;
    OutputPayload?: string | null;
    Configuration?: string | null;
    ConfigurationObject?: Record<string, unknown> | null;
}): MJTaskEntity {
    return {
        ID: fields.ID,
        ParentID: fields.ParentID,
        Name: fields.Name,
        Status: fields.Status ?? 'Pending',
        StepType: fields.StepType ?? 'Action',
        ActionID: fields.ActionID ?? null,
        AgentID: fields.AgentID ?? null,
        PromptID: fields.PromptID ?? null,
        UserID: fields.UserID ?? null,
        ClaimedBy: null,
        ClaimExpiresAt: null,
        StartedAt: null,
        CompletedAt: null,
        PercentComplete: fields.Status === 'Complete' ? 100 : 0,
        ErrorMessage: null,
        InputPayload: fields.InputPayload ?? JSON.stringify({}),
        OutputPayload: fields.OutputPayload ?? null,
        Configuration: fields.Configuration ?? null,
        ConfigurationObject: fields.ConfigurationObject ?? null,
        Save: vi.fn().mockResolvedValue(true),
        Load: vi.fn().mockResolvedValue(true),
    } as unknown as MJTaskEntity;
}

describe('TaskSecurityEnvelope contract and TaskGraphDispatcher enforcement (WS-4.1)', () => {
    describe('ParseTaskSecurityEnvelope, MergeTaskSecurityEnvelopes & ApplyTaskSecurityEnvelopeToParams', () => {
        it('should round-trip serialize and parse a TaskSecurityEnvelope and enforce BoundActionParams case-insensitively', () => {
            const built = BuildTaskSecurityEnvelopeFromAgentScope({
                BoundActionParams: { OrganizationID: 'org-real', Region: 'us-east' },
                AudienceReaderUserIDs: [READER_USER_ID],
                PrimaryScopeEntityName: 'MJ: Organizations',
                PrimaryScopeRecordID: 'org-real',
                IsRunTainted: true,
                AllowedEgressActionIDs: [ACTION_INTERNAL_LOG_ID],
            });
            expect(built).toBeDefined();
            const serialized = SerializeTaskSecurityEnvelope(built);
            const parsed = ParseTaskSecurityEnvelope(serialized);
            expect(parsed).toEqual(built);

            const stepOverride = ParseTaskSecurityEnvelope({
                BoundActionParams: { ExtraBoundKey: 'locked-val' },
                AllowedEgressActionIDs: [ACTION_SEND_EMAIL_ID],
            });
            const merged = MergeTaskSecurityEnvelopes(parsed, stepOverride);
            expect(merged?.IsRunTainted).toBe(true);
            expect(merged?.BoundActionParams).toEqual({
                OrganizationID: 'org-real',
                Region: 'us-east',
                ExtraBoundKey: 'locked-val',
            });

            // Attempt to override `organizationid` (different casing) in node input:
            const enforcement = ApplyTaskSecurityEnvelopeToParams(
                { organizationid: 'org-spoofed', PromptText: 'Hello' },
                merged,
            );
            expect(enforcement.Params).toEqual({
                OrganizationID: 'org-real',
                Region: 'us-east',
                ExtraBoundKey: 'locked-val',
                PromptText: 'Hello',
            });
            expect(enforcement.OverriddenKeys).toEqual(['OrganizationID']);
        });
    });

    describe('TaskGraphDispatcher.executeClaimed security envelope enforcement', () => {
        it('should restore BoundActionParams when a node InputPayload or dependencyOutputs attempts to override them', async () => {
            const envelope: TaskSecurityEnvelope = {
                BoundActionParams: { OrganizationID: 'org-tenant-A', AccountTier: 'enterprise' },
            };
            const parentBag = BuildTaskGraphParentInputPayload({
                continuation: 'none',
                reinvokeDepth: 0,
                failureSemantics: 'block',
                submittedByAgentRunID: 'run-1',
                submittedByUserID: TEST_USER.ID,
                securityEnvelope: envelope,
            });
            const parentMeta = ParseTaskGraphParentMetadata(JSON.stringify(parentBag));

            const runActionMock = vi.fn().mockResolvedValue({
                Success: true,
                Output: { ok: true },
                ActionLogID: 'log-1',
            });
            const actionRunner: TaskActionRunner = {
                SupportsAudience: true,
                RunActionForTask: runActionMock,
            };
            const agentRunner: TaskAgentRunner = {
                RunAgentForTask: vi.fn(),
            };
            const provider = {} as IMetadataProvider;
            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: vi.fn().mockResolvedValue(provider) },
                agentRunner,
                TEST_USER,
                { InstanceID: 'inst-sec-1' },
                undefined,
                undefined,
                actionRunner,
            );

            // Access claims to stub CompleteClaimed
            const claims = (dispatcher as unknown as { claims: { CompleteClaimed: ReturnType<typeof vi.fn> } }).claims;
            claims.CompleteClaimed = vi.fn().mockResolvedValue(true);

            const task = makeChildTask({
                ID: 'task-bound-1',
                ParentID: 'parent-1',
                Name: 'Update Org Settings',
                StepType: 'Action',
                ActionID: ACTION_INTERNAL_LOG_ID,
                // LLM node input tries to spoof OrganizationID
                InputPayload: JSON.stringify({ organizationid: 'org-spoofed-B', CustomNote: 'Safe note' }),
            });

            const candidate: ClaimedTaskCandidate = {
                ID: task.ID,
                ParentID: 'parent-1',
                taskEntity: task,
                parentMetadata: parentMeta,
                // Upstream dependency output also tries to inject AccountTier
                dependencyOutputs: new Map([['dep-1', { AccountTier: 'free-spoofed', UpstreamMetric: 42 }]]),
            };

            const execClaimed = (dispatcher as unknown as {
                executeClaimed: (c: ClaimedTaskCandidate) => Promise<void>;
            }).executeClaimed.bind(dispatcher);
            await execClaimed(candidate);

            expect(runActionMock).toHaveBeenCalledTimes(1);
            const calledParams = runActionMock.mock.calls[0][0];
            expect(calledParams.InputPayload).toEqual({
                OrganizationID: 'org-tenant-A',
                AccountTier: 'enterprise',
                CustomNote: 'Safe note',
                UpstreamMetric: 42,
            });
        });

        it('should fail closed with AUDIENCE_UNSUPPORTED when Audience has readers and actionRunner does not support audience', async () => {
            const envelope: TaskSecurityEnvelope = {
                Audience: { ReaderUserIDs: [READER_USER_ID] },
            };
            const parentMeta = ParseTaskGraphParentMetadata(
                JSON.stringify(
                    BuildTaskGraphParentInputPayload({
                        continuation: 'none',
                        reinvokeDepth: 0,
                        failureSemantics: 'block',
                        submittedByAgentRunID: 'run-aud-1',
                        submittedByUserID: TEST_USER.ID,
                        securityEnvelope: envelope,
                    }),
                ),
            );

            const runActionMock = vi.fn();
            const legacyActionRunner: TaskActionRunner = {
                SupportsAudience: false,
                RunActionForTask: runActionMock,
            };
            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: vi.fn().mockResolvedValue({} as IMetadataProvider) },
                { RunAgentForTask: vi.fn() },
                TEST_USER,
                { InstanceID: 'inst-aud-1' },
                undefined,
                undefined,
                legacyActionRunner,
            );

            const completeClaimedMock = vi.fn().mockResolvedValue(true);
            (dispatcher as unknown as { claims: { CompleteClaimed: ReturnType<typeof vi.fn> } }).claims.CompleteClaimed =
                completeClaimedMock;

            const task = makeChildTask({
                ID: 'task-aud-1',
                ParentID: 'parent-aud-1',
                Name: 'Read Private Record',
                StepType: 'Action',
                ActionID: ACTION_INTERNAL_LOG_ID,
            });

            const execClaimed = (dispatcher as unknown as {
                executeClaimed: (c: ClaimedTaskCandidate) => Promise<void>;
            }).executeClaimed.bind(dispatcher);
            await execClaimed({
                ID: task.ID,
                ParentID: 'parent-aud-1',
                taskEntity: task,
                parentMetadata: parentMeta,
                dependencyOutputs: new Map(),
            });

            expect(runActionMock).not.toHaveBeenCalled();
            expect(completeClaimedMock).toHaveBeenCalledTimes(1);
            const completionOutcome = completeClaimedMock.mock.calls[0][2] as { Status: string; ErrorMessage: string };
            expect(completionOutcome.Status).toBe('Failed');
            expect(completionOutcome.ErrorMessage).toContain('AUDIENCE_UNSUPPORTED');
        });

        it('should forward TenantContext to ProviderFactory.CreateProvider when executing a tenant-scoped task', async () => {
            const envelope: TaskSecurityEnvelope = {
                TenantContext: {
                    PrimaryScopeEntityName: 'MJ: Organizations',
                    PrimaryScopeRecordID: 'org-999',
                    SecondaryScopes: { workspaceId: 'ws-123' },
                },
            };
            const parentMeta = ParseTaskGraphParentMetadata(
                JSON.stringify(
                    BuildTaskGraphParentInputPayload({
                        continuation: 'none',
                        reinvokeDepth: 0,
                        failureSemantics: 'block',
                        submittedByAgentRunID: 'run-tenant-1',
                        submittedByUserID: TEST_USER.ID,
                        securityEnvelope: envelope,
                    }),
                ),
            );

            const createProviderMock = vi.fn(async (_opts?: ProviderFactoryOptions) => ({} as IMetadataProvider));
            const runActionMock = vi.fn().mockResolvedValue({ Success: true, Output: {} });
            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: createProviderMock },
                { RunAgentForTask: vi.fn() },
                TEST_USER,
                { InstanceID: 'inst-tenant-1' },
                undefined,
                undefined,
                { SupportsAudience: true, RunActionForTask: runActionMock },
            );
            (dispatcher as unknown as { claims: { CompleteClaimed: ReturnType<typeof vi.fn> } }).claims.CompleteClaimed =
                vi.fn().mockResolvedValue(true);

            const task = makeChildTask({
                ID: 'task-tenant-1',
                ParentID: 'parent-tenant-1',
                Name: 'Scoped Action',
                StepType: 'Action',
                ActionID: ACTION_INTERNAL_LOG_ID,
            });

            const execClaimed = (dispatcher as unknown as {
                executeClaimed: (c: ClaimedTaskCandidate) => Promise<void>;
            }).executeClaimed.bind(dispatcher);
            await execClaimed({
                ID: task.ID,
                ParentID: 'parent-tenant-1',
                taskEntity: task,
                parentMetadata: parentMeta,
                dependencyOutputs: new Map(),
            });

            expect(createProviderMock).toHaveBeenCalledTimes(1);
            expect(createProviderMock).toHaveBeenCalledWith({
                TenantContext: envelope.TenantContext,
                ContextUser: TEST_USER,
            });
        });

        it('should monotonically propagate IsRunTainted, block non-allowlisted egress actions with TAINTED_EGRESS_BLOCKED, and sanitize after a completed Human approval step', async () => {
            const envelope: TaskSecurityEnvelope = {
                AllowedEgressActionIDs: [ACTION_INTERNAL_LOG_ID],
            };
            const parentMeta = ParseTaskGraphParentMetadata(
                JSON.stringify(
                    BuildTaskGraphParentInputPayload({
                        continuation: 'none',
                        reinvokeDepth: 0,
                        failureSemantics: 'block',
                        submittedByAgentRunID: 'run-taint-1',
                        submittedByUserID: TEST_USER.ID,
                        securityEnvelope: envelope,
                    }),
                ),
            );

            const runActionMock = vi.fn().mockResolvedValue({ Success: true, Output: { sent: true } });
            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: vi.fn().mockResolvedValue({} as IMetadataProvider) },
                { RunAgentForTask: vi.fn() },
                TEST_USER,
                { InstanceID: 'inst-taint-1' },
                undefined,
                undefined,
                { SupportsAudience: true, RunActionForTask: runActionMock },
            );
            const completeClaimedMock = vi.fn().mockResolvedValue(true);
            (dispatcher as unknown as { claims: { CompleteClaimed: ReturnType<typeof vi.fn> } }).claims.CompleteClaimed =
                completeClaimedMock;

            const egressTask = makeChildTask({
                ID: 'task-egress-1',
                ParentID: 'parent-taint-1',
                Name: 'Send External Email',
                StepType: 'Action',
                ActionID: ACTION_SEND_EMAIL_ID,
            });

            const execClaimed = (dispatcher as unknown as {
                executeClaimed: (c: ClaimedTaskCandidate) => Promise<void>;
            }).executeClaimed.bind(dispatcher);

            // 1. Upstream dependency is tainted -> non-allowlisted ACTION_SEND_EMAIL_ID is blocked with TAINTED_EGRESS_BLOCKED
            await execClaimed({
                ID: egressTask.ID,
                ParentID: 'parent-taint-1',
                taskEntity: egressTask,
                parentMetadata: parentMeta,
                dependencyOutputs: new Map([['task-untrusted-1', { __isTainted: true, text: 'prompt injection' }]]),
                isUpstreamTainted: true,
            });

            expect(runActionMock).not.toHaveBeenCalled();
            expect(completeClaimedMock).toHaveBeenCalledTimes(1);
            const blockedOutcome = completeClaimedMock.mock.calls[0][2] as {
                Status: string;
                ErrorMessage: string;
                Configuration?: string;
            };
            expect(blockedOutcome.Status).toBe('Failed');
            expect(blockedOutcome.ErrorMessage).toContain('TAINTED_EGRESS_BLOCKED');
            expect(JSON.parse(blockedOutcome.Configuration!).runtime.isOutputTainted).toBe(true);

            // 2. Allowlisted ACTION_INTERNAL_LOG_ID is permitted even when tainted
            const allowlistedTask = makeChildTask({
                ID: 'task-allowlisted-1',
                ParentID: 'parent-taint-1',
                Name: 'Internal Audit Log',
                StepType: 'Action',
                ActionID: ACTION_INTERNAL_LOG_ID,
            });
            await execClaimed({
                ID: allowlistedTask.ID,
                ParentID: 'parent-taint-1',
                taskEntity: allowlistedTask,
                parentMetadata: parentMeta,
                dependencyOutputs: new Map(),
                isUpstreamTainted: true,
            });
            expect(runActionMock).toHaveBeenCalledTimes(1);

            // 3a. Unreviewed parallel branch (Human does NOT depend on taintedUpstream) must NOT sanitize taint
            const computeUpstreamTaintInGraph = (dispatcher as unknown as {
                computeUpstreamTaintInGraph: (
                    taskID: string,
                    graph: {
                        rawDependencies: MJTaskDependencyEntity[];
                        entityById: Map<string, MJTaskEntity>;
                    },
                ) => { isUpstreamTainted: boolean; isSanitizedByHuman: boolean };
            }).computeUpstreamTaintInGraph.bind(dispatcher);

            const taintedUpstream = makeChildTask({
                ID: 'task-untrusted-1',
                ParentID: 'parent-taint-1',
                Name: 'Ingest Untrusted Webhook',
                Status: 'Complete',
                Configuration: JSON.stringify({ runtime: { isOutputTainted: true } }),
            });
            const middleStep = makeChildTask({
                ID: 'task-mid-1',
                ParentID: 'parent-taint-1',
                Name: 'Intermediate Transform',
                Status: 'Complete',
            });
            const humanApprovalTask = makeChildTask({
                ID: 'task-human-approve-1',
                ParentID: 'parent-taint-1',
                Name: 'Human Review & Sanitize',
                StepType: 'Human',
                UserID: TEST_USER.ID,
                Status: 'Complete',
            });
            const entityById = new Map<string, MJTaskEntity>([
                [taintedUpstream.ID, taintedUpstream],
                [middleStep.ID, middleStep],
                [humanApprovalTask.ID, humanApprovalTask],
                [egressTask.ID, egressTask],
            ]);

            // Multi-hop transitive taint (taintedUpstream -> middleStep -> egressTask) must propagate
            const multiHopDeps = [
                { ID: 'dep-hop-1', TaskID: middleStep.ID, DependsOnTaskID: taintedUpstream.ID },
                { ID: 'dep-hop-2', TaskID: egressTask.ID, DependsOnTaskID: middleStep.ID },
            ] as unknown as MJTaskDependencyEntity[];
            const multiHopCheck = computeUpstreamTaintInGraph(egressTask.ID, {
                rawDependencies: multiHopDeps,
                entityById,
            });
            expect(multiHopCheck.isUpstreamTainted).toBe(true);
            expect(multiHopCheck.isSanitizedByHuman).toBe(false);

            // Parallel unreviewed branch (taintedUpstream -> egressTask AND humanApprovalTask -> egressTask,
            // where humanApprovalTask did NOT review taintedUpstream) must remain tainted
            const parallelDeps = [
                { ID: 'dep-par-a', TaskID: egressTask.ID, DependsOnTaskID: taintedUpstream.ID },
                { ID: 'dep-par-b', TaskID: egressTask.ID, DependsOnTaskID: humanApprovalTask.ID },
            ] as unknown as MJTaskDependencyEntity[];
            const parallelCheck = computeUpstreamTaintInGraph(egressTask.ID, {
                rawDependencies: parallelDeps,
                entityById,
            });
            expect(parallelCheck.isUpstreamTainted).toBe(true);
            expect(parallelCheck.isSanitizedByHuman).toBe(false);

            // 3b. Sequential Human review (taintedUpstream -> humanApprovalTask -> egressTask) sanitizes taint
            const reviewedDeps = [
                { ID: 'dep-rev-1', TaskID: humanApprovalTask.ID, DependsOnTaskID: taintedUpstream.ID },
                { ID: 'dep-rev-2', TaskID: egressTask.ID, DependsOnTaskID: humanApprovalTask.ID },
                { ID: 'dep-rev-data', TaskID: egressTask.ID, DependsOnTaskID: taintedUpstream.ID },
            ] as unknown as MJTaskDependencyEntity[];
            const taintCheck = computeUpstreamTaintInGraph(egressTask.ID, {
                rawDependencies: reviewedDeps,
                entityById,
            });
            expect(taintCheck.isSanitizedByHuman).toBe(true);
            expect(taintCheck.isUpstreamTainted).toBe(false);

            runActionMock.mockClear();
            await execClaimed({
                ID: egressTask.ID,
                ParentID: 'parent-taint-1',
                taskEntity: egressTask,
                parentMetadata: parentMeta,
                dependencyOutputs: new Map(),
                isUpstreamTainted: taintCheck.isUpstreamTainted,
                isSanitizedByHuman: taintCheck.isSanitizedByHuman,
            });
            expect(runActionMock).toHaveBeenCalledTimes(1);
        });

        it('should isolate per-action BoundActionParams to the matching action without leaking onto other actions', () => {
            const built = BuildTaskSecurityEnvelopeFromAgentScope({
                BoundActionParams: {
                    '*': { OrganizationID: 'org-global' },
                    [ACTION_SEND_EMAIL_ID]: { FromAddress: 'security@example.com' },
                },
            });
            expect(built?.BoundActionParams).toEqual({ OrganizationID: 'org-global' });
            expect(built?.BoundParamsByAction?.[ACTION_SEND_EMAIL_ID]).toEqual({
                FromAddress: 'security@example.com',
            });

            const forEmail = ApplyTaskSecurityEnvelopeToParams(
                { To: 'user@example.com', FromAddress: 'spoofed@evil.com' },
                built,
                ACTION_SEND_EMAIL_ID,
            );
            expect(forEmail.Params).toEqual({
                To: 'user@example.com',
                OrganizationID: 'org-global',
                FromAddress: 'security@example.com',
            });

            const forInternalLog = ApplyTaskSecurityEnvelopeToParams(
                { Message: 'Audit event' },
                built,
                ACTION_INTERNAL_LOG_ID,
            );
            expect(forInternalLog.Params).toEqual({
                Message: 'Audit event',
                OrganizationID: 'org-global',
            });
            expect(forInternalLog.Params).not.toHaveProperty('FromAddress');
        });
    });
});
