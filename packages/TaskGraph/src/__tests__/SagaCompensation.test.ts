import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentRequestEntity,
    MJTaskDependencyEntity,
    MJTaskEntity,
} from '@memberjunction/core-entities';
import {
    BuildCompensationEscalationSummary,
    BuildCompensationInputPayload,
    IsCompensationTask,
    MergeActionCompensationSpecs,
    ReadActionCompensationMetadata,
    ReadTaskCompensationMetadata,
    SelectTasksToCompensate,
} from '../saga-compensation';
import { TaskGraphDispatcher, type ClaimedTaskCandidate } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata } from '../TaskGraphService';
import type { TaskActionRunner } from '../types';

const TEST_USER = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Saga Tester', IsActive: true } as UserInfo;
const COMP_ACTION_1_ID = '11111111-1111-4111-8111-111111111111';
const COMP_ACTION_2_ID = '22222222-2222-4222-8222-222222222222';
const FORWARD_ACTION_1_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FORWARD_ACTION_2_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FORWARD_ACTION_3_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WORKFLOW_TYPE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OWNING_AGENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function createMockTask(fields: {
    ID: string;
    ParentID: string | null;
    Name: string;
    Status?: MJTaskEntity['Status'];
    StepType?: MJTaskEntity['StepType'];
    ActionID?: string | null;
    AgentID?: string | null;
    UserID?: string | null;
    InputPayload?: string | null;
    OutputPayload?: string | null;
    Configuration?: string | null;
    ErrorMessage?: string | null;
    CompletedAt?: Date | null;
}): MJTaskEntity {
    const task: Record<string, unknown> = {
        ID: fields.ID,
        ParentID: fields.ParentID,
        TypeID: WORKFLOW_TYPE_ID,
        Name: fields.Name,
        Description: '',
        Status: fields.Status ?? 'Pending',
        StepType: fields.StepType ?? 'Action',
        ActionID: fields.ActionID ?? null,
        AgentID: fields.AgentID ?? null,
        PromptID: null,
        UserID: fields.UserID ?? null,
        AgentRunID: 'run-saga-1',
        ClaimedBy: null,
        ClaimExpiresAt: null,
        StartedAt: fields.Status === 'Complete' || fields.Status === 'Failed' ? new Date('2026-11-02T10:00:00Z') : null,
        CompletedAt: fields.CompletedAt ?? (fields.Status === 'Complete' || fields.Status === 'Failed' ? new Date('2026-11-02T10:01:00Z') : null),
        PercentComplete: fields.Status === 'Complete' ? 100 : 0,
        ErrorMessage: fields.ErrorMessage ?? null,
        InputPayload: fields.InputPayload ?? JSON.stringify({}),
        OutputPayload: fields.OutputPayload ?? null,
        Configuration: fields.Configuration ?? null,
        get ConfigurationObject(): Record<string, unknown> | null {
            if (!task.Configuration || typeof task.Configuration !== 'string') return null;
            try {
                return JSON.parse(task.Configuration) as Record<string, unknown>;
            } catch {
                return null;
            }
        },
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        Load: vi.fn().mockResolvedValue(true),
    };
    return task as unknown as MJTaskEntity;
}

describe('Saga Compensation & Idempotent Action Metadata (WS-4.3)', () => {
    describe('ReadActionCompensationMetadata & MergeActionCompensationSpecs', () => {
        it('should read compensation metadata from direct fields and MJ: Actions Config JSON', () => {
            const fromDirect = ReadActionCompensationMetadata({
                CompensationActionID: COMP_ACTION_1_ID,
                CompensationInputMapping: { ChargeID: 'output.chargeId' },
                IsIdempotent: true,
            });
            expect(fromDirect).toEqual({
                compensationActionId: COMP_ACTION_1_ID,
                inputMapping: { ChargeID: 'output.chargeId' },
                compensationInputMapping: { ChargeID: 'output.chargeId' },
                isIdempotent: true,
            });

            const fromConfigJson = ReadActionCompensationMetadata({
                Config_: JSON.stringify({
                    compensation: {
                        compensationActionId: COMP_ACTION_2_ID,
                        compensationActionName: 'Refund Payment',
                        compensationInputMapping: { PaymentID: 'output.paymentId', Reason: 'input.reason' },
                        isIdempotent: true,
                        onCompensationFailure: 'EscalateToHumanTask',
                        retryCount: 2,
                    },
                }),
            });
            expect(fromConfigJson).toEqual({
                compensationActionId: COMP_ACTION_2_ID,
                compensationActionName: 'Refund Payment',
                inputMapping: { PaymentID: 'output.paymentId', Reason: 'input.reason' },
                compensationInputMapping: { PaymentID: 'output.paymentId', Reason: 'input.reason' },
                isIdempotent: true,
                onCompensationFailure: 'EscalateToHumanTask',
                retryCount: 2,
            });

            const merged = MergeActionCompensationSpecs(fromDirect, {
                onCompensationFailure: 'ContinueCompensation',
                retryCount: 3,
            });
            expect(merged).toEqual({
                compensationActionId: COMP_ACTION_1_ID,
                inputMapping: { ChargeID: 'output.chargeId' },
                compensationInputMapping: { ChargeID: 'output.chargeId' },
                isIdempotent: true,
                onCompensationFailure: 'ContinueCompensation',
                retryCount: 3,
            });
        });
    });

    describe('SelectTasksToCompensate & BuildCompensationInputPayload', () => {
        it('should order completed compensatable forward tasks in reverse topological order', () => {
            const step1 = createMockTask({
                ID: '00000000-0000-4000-8000-000000000011',
                ParentID: 'parent-1',
                Name: 'Step 1: Reserve Inventory',
                Status: 'Complete',
                ActionID: FORWARD_ACTION_1_ID,
                CompletedAt: new Date('2026-11-02T10:01:00Z'),
                Configuration: JSON.stringify({
                    compensation: { compensationActionId: COMP_ACTION_1_ID },
                }),
            });
            const step2 = createMockTask({
                ID: '00000000-0000-4000-8000-000000000022',
                ParentID: 'parent-1',
                Name: 'Step 2: Capture Payment',
                Status: 'Complete',
                ActionID: FORWARD_ACTION_2_ID,
                CompletedAt: new Date('2026-11-02T10:02:00Z'),
                Configuration: JSON.stringify({
                    compensation: { compensationActionId: COMP_ACTION_2_ID },
                }),
            });
            const step3Failed = createMockTask({
                ID: '00000000-0000-4000-8000-000000000033',
                ParentID: 'parent-1',
                Name: 'Step 3: Provision Shipment',
                Status: 'Failed',
                ActionID: FORWARD_ACTION_3_ID,
                Configuration: JSON.stringify({
                    compensation: { compensationActionId: COMP_ACTION_1_ID },
                }),
            });

            const ordered = SelectTasksToCompensate(
                [step1, step2, step3Failed],
                [
                    { TaskID: step2.ID, DependsOnTaskID: step1.ID },
                    { TaskID: step3Failed.ID, DependsOnTaskID: step2.ID },
                ],
            );

            // Step 2 depends on Step 1, so reverse topological order must compensate Step 2 before Step 1
            expect(ordered.map((entry) => entry.task.ID)).toEqual([step2.ID, step1.ID]);
        });

        it('should map forward input, output, actionLogId, and recordChanges into compensation input payload', () => {
            const mapped = BuildCompensationInputPayload({
                ForwardInput: { OrderID: 'ORD-100', Amount: 250 },
                ForwardOutput: { TransactionID: 'TX-999', ReceiptURL: 'https://example.com/r/999' },
                ActionLogID: 'log-abc',
                RecordChanges: [{ ID: 'rc-1', EntityID: 'ent-1', RecordID: 'rec-1', Type: 'Create' }],
                InputMapping: {
                    RefundTransactionID: 'output.TransactionID',
                    OriginalOrderID: 'input.OrderID',
                    AuditLogID: 'actionLogId',
                    CreatedRecordID: 'recordChanges.0.RecordID',
                },
            });

            expect(mapped).toEqual({
                RefundTransactionID: 'TX-999',
                OriginalOrderID: 'ORD-100',
                AuditLogID: 'log-abc',
                CreatedRecordID: 'rec-1',
            });
        });

        it('should build a structured HITL escalation summary when compensation fails', () => {
            const summary = BuildCompensationEscalationSummary({
                WorkflowName: 'Order Fulfillment Saga',
                ForwardTask: {
                    ID: 'task-2',
                    Name: 'Capture Payment',
                    InputPayload: JSON.stringify({ Amount: 250 }),
                    OutputPayload: JSON.stringify({ TransactionID: 'TX-999' }),
                },
                CompensationTask: {
                    ID: 'comp-task-2',
                    Name: 'Compensate: Capture Payment',
                    InputPayload: JSON.stringify({ TransactionID: 'TX-999' }),
                    ErrorMessage: 'Payment gateway refund endpoint timed out',
                },
            });

            expect(summary.RequestText).toContain('Order Fulfillment Saga');
            expect(summary.RequestText).toContain('Capture Payment');
            expect(summary.RequestText).toContain('Payment gateway refund endpoint timed out');
            expect(summary.ContextData).toMatchObject({
                workflowName: 'Order Fulfillment Saga',
                forwardTaskID: 'task-2',
                compensationTaskID: 'comp-task-2',
                compensationError: 'Payment gateway refund endpoint timed out',
            });
        });
    });

    describe('TaskGraphDispatcher idempotent action retry and saga execution', () => {
        it('should automatically retry transient action failures when compensation.isIdempotent is true', async () => {
            const parentMeta = ParseTaskGraphParentMetadata(
                JSON.stringify(
                    BuildTaskGraphParentInputPayload({
                        continuation: 'none',
                        reinvokeDepth: 0,
                        failureSemantics: 'block',
                        submittedByAgentRunID: 'run-idem-1',
                        submittedByUserID: TEST_USER.ID,
                    }),
                ),
            );

            const runActionMock = vi
                .fn()
                .mockResolvedValueOnce({
                    Success: false,
                    ErrorMessage: 'Transient 502 Bad Gateway',
                    ActionLogID: 'log-attempt-1',
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Output: { ReservedID: 'RES-777' },
                    ActionLogID: 'log-attempt-2',
                });

            const actionRunner: TaskActionRunner = {
                SupportsAudience: true,
                RunActionForTask: runActionMock,
            };
            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: vi.fn().mockResolvedValue({} as IMetadataProvider) },
                { RunAgentForTask: vi.fn() },
                TEST_USER,
                { InstanceID: 'inst-idem-1' },
                undefined,
                undefined,
                actionRunner,
            );

            const completeClaimedMock = vi.fn().mockResolvedValue(true);
            (dispatcher as unknown as { claims: { CompleteClaimed: ReturnType<typeof vi.fn> } }).claims.CompleteClaimed =
                completeClaimedMock;

            const idempotentTask = createMockTask({
                ID: 'task-idem-1',
                ParentID: 'parent-idem-1',
                Name: 'Reserve Inventory Idempotent',
                StepType: 'Action',
                ActionID: FORWARD_ACTION_1_ID,
                InputPayload: JSON.stringify({ SKU: 'ITEM-1', Quantity: 2 }),
                Configuration: JSON.stringify({
                    compensation: {
                        isIdempotent: true,
                        retryCount: 2,
                    },
                }),
            });

            const execClaimed = (dispatcher as unknown as {
                executeClaimed: (c: ClaimedTaskCandidate) => Promise<void>;
            }).executeClaimed.bind(dispatcher);

            await execClaimed({
                ID: idempotentTask.ID,
                ParentID: 'parent-idem-1',
                taskEntity: idempotentTask,
                parentMetadata: parentMeta,
                dependencyOutputs: new Map(),
            });

            expect(runActionMock).toHaveBeenCalledTimes(2);
            expect(completeClaimedMock).toHaveBeenCalledTimes(1);
            const outcome = completeClaimedMock.mock.calls[0][2] as { Status: string; OutputPayload: string };
            expect(outcome.Status).toBe('Complete');
            expect(JSON.parse(outcome.OutputPayload)).toEqual({
                SKU: 'ITEM-1',
                Quantity: 2,
                ReservedID: 'RES-777',
            });
        });

        it('should materialize reverse-topological compensation tasks when Node 3 fails after Nodes 1 and 2 complete, and escalate on compensation failure', async () => {
            const parentInput = BuildTaskGraphParentInputPayload({
                continuation: 'none',
                reinvokeDepth: 0,
                failureSemantics: 'block',
                failurePolicy: 'CompensateCompleted',
                submittedByAgentRunID: 'run-saga-main',
                submittedByUserID: TEST_USER.ID,
            });
            const parentTask = createMockTask({
                ID: '00000000-0000-4000-8000-000000000100',
                ParentID: null,
                Name: 'Order Checkout Saga',
                Status: 'In Progress',
                AgentID: OWNING_AGENT_ID,
                InputPayload: JSON.stringify(parentInput),
            });

            const node1 = createMockTask({
                ID: '00000000-0000-4000-8000-000000000101',
                ParentID: parentTask.ID,
                Name: 'Step 1: Reserve Inventory',
                Status: 'Complete',
                StepType: 'Action',
                ActionID: FORWARD_ACTION_1_ID,
                InputPayload: JSON.stringify({ SKU: 'LAPTOP-1' }),
                OutputPayload: JSON.stringify({ ReservationID: 'RES-101' }),
                CompletedAt: new Date('2026-11-02T10:01:00Z'),
                Configuration: JSON.stringify({
                    runtime: { actionLogID: 'act-log-101' },
                    compensation: {
                        compensationActionId: COMP_ACTION_1_ID,
                        compensationInputMapping: {
                            ReservationID: 'output.ReservationID',
                            OriginalSKU: 'input.SKU',
                        },
                        onCompensationFailure: 'EscalateToHumanTask',
                    },
                }),
            });

            const node2 = createMockTask({
                ID: '00000000-0000-4000-8000-000000000102',
                ParentID: parentTask.ID,
                Name: 'Step 2: Charge Card',
                Status: 'Complete',
                StepType: 'Action',
                ActionID: FORWARD_ACTION_2_ID,
                InputPayload: JSON.stringify({ Amount: 1999 }),
                OutputPayload: JSON.stringify({ ChargeID: 'CHG-202' }),
                CompletedAt: new Date('2026-11-02T10:02:00Z'),
                Configuration: JSON.stringify({
                    runtime: { actionLogID: 'act-log-202' },
                    compensation: {
                        compensationActionId: COMP_ACTION_2_ID,
                        compensationInputMapping: {
                            ChargeID: 'output.ChargeID',
                            RefundAmount: 'input.Amount',
                        },
                        onCompensationFailure: 'ContinueCompensation',
                    },
                }),
            });

            const node3 = createMockTask({
                ID: '00000000-0000-4000-8000-000000000103',
                ParentID: parentTask.ID,
                Name: 'Step 3: Create Shipment',
                Status: 'Failed',
                StepType: 'Action',
                ActionID: FORWARD_ACTION_3_ID,
                ErrorMessage: 'Warehouse API unavailable',
                CompletedAt: new Date('2026-11-02T10:03:00Z'),
            });

            const tasksInDB: MJTaskEntity[] = [node1, node2, node3];
            const depsInDB: MJTaskDependencyEntity[] = [
                {
                    ID: 'dep-1-2',
                    TaskID: node2.ID,
                    DependsOnTaskID: node1.ID,
                    DependencyType: 'Prerequisite',
                    Condition: null,
                    ExclusiveGroup: null,
                } as unknown as MJTaskDependencyEntity,
                {
                    ID: 'dep-2-3',
                    TaskID: node3.ID,
                    DependsOnTaskID: node2.ID,
                    DependencyType: 'Prerequisite',
                    Condition: null,
                    ExclusiveGroup: null,
                } as unknown as MJTaskDependencyEntity,
            ];
            const createdRequests: MJAIAgentRequestEntity[] = [];

            let compTaskSeq = 1;
            let depSeq = 1;
            const provider = {
                RunView: vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
                    if (params.EntityName === 'MJ: Task Types') {
                        return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
                    }
                    if (params.EntityName === 'MJ: Tasks') {
                        return { Success: true, Results: [...tasksInDB] };
                    }
                    if (params.EntityName === 'MJ: Task Dependencies') {
                        return { Success: true, Results: [...depsInDB] };
                    }
                    return { Success: true, Results: [] };
                }),
                GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                    if (entityName === 'MJ: Tasks') {
                        const newId = `00000000-0000-4000-8000-00000000020${compTaskSeq++}`;
                        const draft = createMockTask({
                            ID: newId,
                            ParentID: parentTask.ID,
                            Name: '',
                            Status: 'Pending',
                        });
                        draft.Load = vi.fn().mockImplementation(async (id: string) => {
                            if (id === parentTask.ID) {
                                Object.assign(draft, parentTask);
                                return true;
                            }
                            return false;
                        });
                        draft.Save = vi.fn().mockImplementation(async () => {
                            if (!tasksInDB.some((t) => t.ID === draft.ID) && draft.ParentID === parentTask.ID) {
                                tasksInDB.push(draft);
                            }
                            return true;
                        });
                        return draft;
                    }
                    if (entityName === 'MJ: Task Dependencies') {
                        const depDraft = {
                            ID: `dep-comp-${depSeq++}`,
                            TaskID: '',
                            DependsOnTaskID: '',
                            DependencyType: 'Prerequisite',
                            Condition: null,
                            ExclusiveGroup: null,
                            NewRecord: vi.fn(),
                            Save: vi.fn().mockImplementation(async () => {
                                depsInDB.push(depDraft as unknown as MJTaskDependencyEntity);
                                return true;
                            }),
                        };
                        return depDraft;
                    }
                    if (entityName === 'MJ: AI Agent Requests') {
                        const reqDraft = {
                            ID: `req-esc-${createdRequests.length + 1}`,
                            OriginatingTaskID: null,
                            AgentID: null,
                            RequestForUserID: null,
                            RequestedAt: null,
                            Status: 'Requested',
                            Request: '',
                            OriginatingAgentRunID: null,
                            NewRecord: vi.fn(),
                            Save: vi.fn().mockImplementation(async () => {
                                createdRequests.push(reqDraft as unknown as MJAIAgentRequestEntity);
                                return true;
                            }),
                        };
                        return reqDraft;
                    }
                    throw new Error(`Unexpected entity: ${entityName}`);
                }),
            } as unknown as IMetadataProvider;

            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: vi.fn().mockResolvedValue(provider) },
                { RunAgentForTask: vi.fn() },
                TEST_USER,
                { InstanceID: 'inst-saga-1' },
            );

            // Stub claim store methods used during propagateAndRollup
            const claims = (dispatcher as unknown as {
                claims: {
                    TryStampParentStart: ReturnType<typeof vi.fn>;
                    TryUpdateParentProgress: ReturnType<typeof vi.fn>;
                    TrySettleParent: ReturnType<typeof vi.fn>;
                };
            }).claims;
            claims.TryStampParentStart = vi.fn().mockResolvedValue(true);
            claims.TryUpdateParentProgress = vi.fn().mockResolvedValue(true);
            claims.TrySettleParent = vi.fn().mockResolvedValue(true);

            const loadGraphState = (dispatcher as unknown as {
                loadGraphState: (
                    p: IMetadataProvider,
                    parentID: string,
                    debug?: undefined,
                    preloadedParent?: MJTaskEntity,
                ) => Promise<unknown>;
            }).loadGraphState.bind(dispatcher);
            const coordinateSaga = (dispatcher as unknown as {
                coordinateSagaCompensation: (
                    p: IMetadataProvider,
                    parentID: string,
                    g: unknown,
                ) => Promise<{
                    nodes: Array<{ id: string; status: string }>;
                    edges: Array<{ taskId: string; dependsOnTaskId: string }>;
                    handledFailureIDs: Set<string>;
                    parentMetadata: { sagaState?: string };
                }>;
            }).coordinateSagaCompensation.bind(dispatcher);

            // Pass 1: Node 3 failed, Nodes 1 and 2 completed -> materializes Comp 2 and Comp 1 in reverse order
            const initialGraph = await loadGraphState(provider, parentTask.ID, undefined, parentTask);
            const afterMaterialize = await coordinateSaga(provider, parentTask.ID, initialGraph);

            const compTasks = tasksInDB.filter((t) => IsCompensationTask(t));
            expect(compTasks).toHaveLength(2);
            expect(compTasks[0].Name).toBe('Compensate: Step 2: Charge Card');
            expect(compTasks[0].ActionID).toBe(COMP_ACTION_2_ID);
            expect(JSON.parse(compTasks[0].InputPayload!)).toEqual({
                ChargeID: 'CHG-202',
                RefundAmount: 1999,
            });
            expect(compTasks[1].Name).toBe('Compensate: Step 1: Reserve Inventory');
            expect(compTasks[1].ActionID).toBe(COMP_ACTION_1_ID);
            expect(JSON.parse(compTasks[1].InputPayload!)).toEqual({
                ReservationID: 'RES-101',
                OriginalSKU: 'LAPTOP-1',
            });

            // Verify sequential dependency chaining: Comp 1 depends on Comp 2 (so Comp 2 runs first)
            expect(afterMaterialize.edges).toContainEqual({
                taskId: compTasks[1].ID,
                dependsOnTaskId: compTasks[0].ID,
                dependencyType: 'Prerequisite',
            });
            expect(afterMaterialize.parentMetadata.sagaState).toBe('Compensating');

            // Verify forward tasks record `compensatedByTaskID`
            expect(ReadTaskCompensationMetadata(node2.Configuration)?.compensatedByTaskID).toBe(compTasks[0].ID);
            expect(ReadTaskCompensationMetadata(node1.Configuration)?.compensatedByTaskID).toBe(compTasks[1].ID);

            // Pass 2: Simulate Comp 2 failing with `onCompensationFailure: 'ContinueCompensation'`
            // and Comp 1 failing with `onCompensationFailure: 'EscalateToHumanTask'`
            compTasks[0].Status = 'Failed';
            compTasks[0].ErrorMessage = 'Gateway temporary error (continue allowed)';
            const graphAfterComp2Fail = (await loadGraphState(provider, parentTask.ID, undefined, parentTask)) as {
                handledFailureIDs: Set<string>;
            };
            // Because Comp 2 has `ContinueCompensation`, it is marked in `handledFailureIDs` so Comp 1 is released
            expect(graphAfterComp2Fail.handledFailureIDs.has(compTasks[0].ID)).toBe(true);

            compTasks[1].Status = 'Failed';
            compTasks[1].ErrorMessage = 'Inventory lock held by warehouse override';
            const graphAfterComp1Fail = await loadGraphState(provider, parentTask.ID, undefined, parentTask);
            const finalGraph = await coordinateSaga(provider, parentTask.ID, graphAfterComp1Fail);

            // Verify HITL escalation created an `MJ: AI Agent Requests` record for Comp 1
            expect(createdRequests).toHaveLength(1);
            expect(createdRequests[0].OriginatingTaskID).toBe(compTasks[1].ID);
            expect(createdRequests[0].AgentID).toBe(OWNING_AGENT_ID);
            expect(createdRequests[0].Request).toContain('Order Checkout Saga');
            expect(createdRequests[0].Request).toContain('Inventory lock held by warehouse override');
            expect(ReadTaskCompensationMetadata(compTasks[1].Configuration)?.escalatedRequestID).toBe(
                createdRequests[0].ID,
            );
            expect(finalGraph.parentMetadata.sagaState).toBe('CompensationEscalated');
        });
    });
});
