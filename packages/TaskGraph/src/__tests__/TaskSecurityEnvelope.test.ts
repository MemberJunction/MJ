/**
 * The dispatcher's enforcement of `MJ: Tasks.SecurityEnvelope`: where the envelope is read from, what
 * a node is refused for, who it runs as, and how taint flows from node to node.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, ServerOperationScopeManager, type IMetadataProvider, type TenantContext, type UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import {
    SerializeTaskSecurityEnvelope,
    TAINTED_EGRESS_BLOCKED,
    TASK_GRAPH_RUNTIME_SECURITY_OPERATION,
    TASK_SECURITY_ENVELOPE_VERSION,
    TaskNode,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import { TaskGraphDispatcher, type ClaimedTaskCandidate } from '../TaskGraphDispatcher';
import { BuildStepConfiguration, BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata } from '../TaskGraphService';
import type {
    ProviderFactory,
    TaskActionRunParams,
    TaskActionRunResult,
    TaskActionRunner,
    TaskAgentRunner,
    TaskContinuationDeliverer,
    TaskContinuationParams,
    TaskDecisionRunner,
    TaskPromptRunner,
} from '../types';

const TEST_USER = { ID: '00000000-0000-4000-8000-000000000001', Name: 'Tester', IsActive: true } as UserInfo;
const ACTION_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_ID = '44444444-4444-4444-8444-444444444444';
const TENANT: TenantContext = { TenantID: 'org-A', Source: 'header' };
/** A Human step's assignee, who is not the user the graph runs as (TEST_USER). */
const REVIEWER = '00000000-0000-4000-8000-0000000000e7';

/** A completed Human step assigned to `assignee`, recorded as completed by `completedBy`. */
function reviewedBy(completedBy: string, assignee: string = REVIEWER, id = 'approve'): MJTaskEntity {
    return makeTask({
        ID: id, Status: 'Complete', StepType: 'Human', ActionID: null, UserID: assignee,
        Configuration: JSON.stringify({ runtime: { completedByUserID: completedBy } }),
    });
}

function envelope(parts: Partial<TaskSecurityEnvelope> = {}): TaskSecurityEnvelope {
    return { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false, ...parts };
}

function makeTask(fields: {
    ID: string;
    Name?: string;
    Status?: MJTaskEntity['Status'];
    StepType?: MJTaskEntity['StepType'];
    ActionID?: string | null;
    PromptID?: string | null;
    UserID?: string | null;
    InputPayload?: string;
    Configuration?: string | null;
    SecurityEnvelope?: string | null;
}): MJTaskEntity {
    const row = {
        ID: fields.ID,
        ParentID: PARENT_ID,
        Name: fields.Name ?? fields.ID,
        Status: fields.Status ?? 'Pending',
        StepType: fields.StepType ?? 'Action',
        ActionID: fields.ActionID === undefined ? ACTION_ID : fields.ActionID,
        AgentID: null,
        PromptID: fields.PromptID ?? null,
        UserID: fields.UserID ?? null,
        CompensatesTaskID: null,
        InputPayload: fields.InputPayload ?? JSON.stringify({}),
        OutputPayload: null,
        Configuration: fields.Configuration ?? null,
        SecurityEnvelope: fields.SecurityEnvelope ?? null,
        get ConfigurationObject(): Record<string, unknown> | null {
            return row.Configuration ? (JSON.parse(row.Configuration) as Record<string, unknown>) : null;
        },
        Save: vi.fn().mockResolvedValue(true),
        Load: vi.fn().mockResolvedValue(true),
    };
    return row as unknown as MJTaskEntity;
}

function makeParent(env?: TaskSecurityEnvelope): MJTaskEntity {
    const row = {
        ID: PARENT_ID,
        ParentID: null,
        Name: 'Workflow',
        UserID: TEST_USER.ID,
        AgentRunID: null,
        InputPayload: JSON.stringify(BuildTaskGraphParentInputPayload({
            continuation: 'none',
            reinvokeDepth: 0,
            failureSemantics: 'block',
            submittedByAgentRunID: null,
            submittedByUserID: TEST_USER.ID,
        })),
        SecurityEnvelope: SerializeTaskSecurityEnvelope(env),
    };
    return row as unknown as MJTaskEntity;
}

type Recorded = { Status: string; ErrorMessage?: string; Configuration?: string; OutputPayload?: string | null };

type Harness = {
    run: (task: MJTaskEntity, extra?: Partial<ClaimedTaskCandidate>) => Promise<Recorded>;
    actionCalls: TaskActionRunParams[];
};

function harness(opts: {
    actionResult?: Partial<TaskActionRunResult> | ((p: TaskActionRunParams) => Partial<TaskActionRunResult>);
    enforces?: boolean;
    providerFactory?: ProviderFactory;
    agentRunner?: TaskAgentRunner;
    promptRunner?: TaskPromptRunner;
    decisionRunner?: TaskDecisionRunner;
    parent?: MJTaskEntity;
}): Harness {
    const actionCalls: TaskActionRunParams[] = [];
    const actionRunner: TaskActionRunner = {
        EnforcesSecurityEnvelope: opts.enforces ?? true,
        RunActionForTask: vi.fn(async (p: TaskActionRunParams) => {
            actionCalls.push(p);
            const extra = typeof opts.actionResult === 'function' ? opts.actionResult(p) : opts.actionResult;
            return { Success: true, Output: { ok: true }, ...extra };
        }),
    };
    const dispatcher = new TaskGraphDispatcher(
        opts.providerFactory ?? { CreateProvider: vi.fn().mockResolvedValue({} as IMetadataProvider) },
        opts.agentRunner ?? { RunAgentForTask: vi.fn() },
        TEST_USER,
        { InstanceID: 'inst-sec' },
        undefined,
        undefined,
        actionRunner,
        opts.promptRunner,
        opts.decisionRunner,
    );
    const completeClaimed = vi.fn().mockResolvedValue(true);
    (dispatcher as unknown as { claims: { CompleteClaimed: typeof completeClaimed } }).claims.CompleteClaimed = completeClaimed;
    const parent = opts.parent ?? makeParent();
    const execClaimed = (dispatcher as unknown as {
        executeClaimed: (c: ClaimedTaskCandidate) => Promise<void>;
    }).executeClaimed.bind(dispatcher);
    return {
        actionCalls,
        run: async (task, extra = {}) => {
            completeClaimed.mockClear();
            await execClaimed({
                ID: task.ID,
                ParentID: PARENT_ID,
                taskEntity: task,
                parentTask: parent,
                parentMetadata: ParseTaskGraphParentMetadata(parent.InputPayload),
                dependencyOutputs: new Map(),
                upstreamTasks: [],
                ...extra,
            });
            return completeClaimed.mock.calls[0][2] as Recorded;
        },
    };
}

function recordedTaint(outcome: Recorded): boolean | undefined {
    const config = outcome.Configuration ? (JSON.parse(outcome.Configuration) as { runtime?: { isOutputTainted?: boolean } }) : undefined;
    return config?.runtime?.isOutputTainted;
}

describe('TaskGraphDispatcher security envelope (WS-4.1)', () => {
    describe('where the envelope comes from (S9)', () => {
        it('restores a bound parameter the node input or an upstream output tried to replace', async () => {
            const env = envelope({ BoundActionParams: { [ACTION_ID]: { OrganizationID: 'org-A' } } });
            const h = harness({ parent: makeParent(env) });
            const task = makeTask({ ID: 'bound-1', InputPayload: JSON.stringify({ organizationid: 'org-B', Note: 'x' }), SecurityEnvelope: SerializeTaskSecurityEnvelope(env) });
            await h.run(task, { dependencyOutputs: new Map([['dep', { OrganizationID: 'org-C', Metric: 1 }]]) });
            expect(h.actionCalls[0].InputPayload).toEqual({ OrganizationID: 'org-A', Note: 'x', Metric: 1 });
        });

        it('refuses a node whose stored envelope has an unknown version instead of running it unconstrained', async () => {
            const h = harness({});
            const task = makeTask({ ID: 'v2', SecurityEnvelope: JSON.stringify({ Version: 2, IsRunTainted: false }) });
            const outcome = await h.run(task);
            expect(h.actionCalls).toHaveLength(0);
            expect(outcome.Status).toBe('Failed');
            expect(outcome.ErrorMessage).toContain('Version');
        });

        it('refuses a node whose stored envelope is not JSON', async () => {
            const h = harness({});
            const outcome = await h.run(makeTask({ ID: 'garbled', SecurityEnvelope: '{"Version":1,' }));
            expect(h.actionCalls).toHaveLength(0);
            expect(outcome.Status).toBe('Failed');
        });

        it('refuses every node of a workflow whose stored envelope is unreadable', async () => {
            const parent = makeParent();
            (parent as unknown as { SecurityEnvelope: string }).SecurityEnvelope = '{"Version":"1"}';
            const h = harness({ parent });
            const outcome = await h.run(makeTask({ ID: 'child' }));
            expect(h.actionCalls).toHaveLength(0);
            expect(outcome.Status).toBe('Failed');
        });

        it("refuses a node whose own envelope names a different tenant than the workflow's", async () => {
            const scope = (record: string) => envelope({ RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: record, SecondaryScopes: null } });
            const h = harness({ parent: makeParent(scope('org-A')) });
            const outcome = await h.run(makeTask({ ID: 'tenant-swap', SecurityEnvelope: SerializeTaskSecurityEnvelope(scope('org-B')) }));
            expect(h.actionCalls).toHaveLength(0);
            expect(outcome.ErrorMessage).toContain('different tenants');
        });

        it("applies the workflow's envelope even when the node's own column is empty", async () => {
            const env = envelope({ RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'org-A', SecondaryScopes: null, SearchScopeIDs: ['55555555-5555-4555-8555-555555555555'] } });
            const h = harness({ parent: makeParent(env) });
            await h.run(makeTask({ ID: 'no-own-column' }));
            expect(h.actionCalls[0].SecurityEnvelope?.RunScope).toEqual(env.RunScope);
        });
    });

    describe('runners (S1)', () => {
        it('refuses a constrained node on a runner that does not enforce envelopes', async () => {
            const env = envelope({ Audience: { ReaderUserIDs: ['00000000-0000-4000-8000-000000000002'] } });
            const h = harness({ enforces: false, parent: makeParent(env) });
            const outcome = await h.run(makeTask({ ID: 'aud', SecurityEnvelope: SerializeTaskSecurityEnvelope(env) }));
            expect(h.actionCalls).toHaveLength(0);
            expect(outcome.Status).toBe('Failed');
        });

        it('runs an unconstrained node on such a runner', async () => {
            const h = harness({ enforces: false });
            await h.run(makeTask({ ID: 'plain' }));
            expect(h.actionCalls).toHaveLength(1);
            expect(h.actionCalls[0].SecurityEnvelope).toBeUndefined();
        });
    });

    describe('who a node runs as (S2)', () => {
        it("runs a tenant node as a per-task clone and never stamps the dispatcher's own user", async () => {
            // A factory that stamps whatever user it is handed, as the old MJServer factory did: the
            // dispatcher must hand it none, so nothing it does can pin the shared user to a tenant.
            const stampingFactory: ProviderFactory = {
                CreateProvider: vi.fn(async (...args: unknown[]) => {
                    const opts = args[0] as { ContextUser?: UserInfo } | undefined;
                    if (opts?.ContextUser) opts.ContextUser.TenantContext = { TenantID: 'stamped', Source: 'custom' };
                    return {} as IMetadataProvider;
                }),
            };
            const env = envelope({ CallerTenantContext: TENANT, RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-A', SecondaryScopes: null } });
            const h = harness({ providerFactory: stampingFactory, parent: makeParent(env) });

            await h.run(makeTask({ ID: 'scoped', SecurityEnvelope: SerializeTaskSecurityEnvelope(env) }));
            const ranAs = h.actionCalls[0].ContextUser;
            expect(ranAs).not.toBe(TEST_USER);
            expect(ranAs.ID).toBe(TEST_USER.ID);
            expect(ranAs.TenantContext).toEqual(TENANT);
            expect(TEST_USER.TenantContext).toBeUndefined();

            // The next, unscoped graph's node runs with no tenant at all.
            const h2 = harness({ providerFactory: stampingFactory });
            await h2.run(makeTask({ ID: 'unscoped' }));
            expect(h2.actionCalls[0].ContextUser.TenantContext).toBeUndefined();
        });
    });

    describe('taint (S7, S8)', () => {
        const tainted = envelope({ IsRunTainted: true });

        it('hands a root node of a tainted run a tainted envelope and records its output tainted', async () => {
            const h = harness({ parent: makeParent(tainted) });
            const outcome = await h.run(makeTask({ ID: 'root', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }));
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
            expect(recordedTaint(outcome)).toBe(true);
        });

        it("records a clean node's output as untainted, explicitly", async () => {
            const h = harness({});
            expect(recordedTaint(await h.run(makeTask({ ID: 'clean' })))).toBe(false);
        });

        it("records an action node tainted when its runner reports the action's output untrusted", async () => {
            const h = harness({ actionResult: { IsOutputTainted: true } });
            expect(recordedTaint(await h.run(makeTask({ ID: 'fetch' })))).toBe(true);
        });

        it('taints a node whose upstream output was tainted', async () => {
            const h = harness({});
            const upstream = makeTask({ ID: 'up', Status: 'Complete', Configuration: JSON.stringify({ runtime: { isOutputTainted: true } }) });
            await h.run(makeTask({ ID: 'down' }), { upstreamTasks: [upstream] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
        });

        it('clears taint behind a Human step its assignee completed', async () => {
            const h = harness({ parent: makeParent(tainted) });
            await h.run(makeTask({ ID: 'after-review', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }), { upstreamTasks: [reviewedBy(REVIEWER)] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(false);
        });

        it('keeps taint behind a Human step someone other than its assignee completed', async () => {
            const h = harness({ parent: makeParent(tainted) });
            await h.run(makeTask({ ID: 'after-review', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }), { upstreamTasks: [reviewedBy(TEST_USER.ID)] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
        });

        it("keeps taint behind a Human step completed as the graph's own run user, its assignee", async () => {
            const h = harness({ parent: makeParent(tainted) });
            const selfApproved = reviewedBy(TEST_USER.ID, TEST_USER.ID);
            await h.run(makeTask({ ID: 'after-review', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }), { upstreamTasks: [selfApproved] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
        });

        it('keeps taint behind a Human step edited to Complete with no recorded completer', async () => {
            const h = harness({ parent: makeParent(tainted) });
            const edited = makeTask({ ID: 'approve', Status: 'Complete', StepType: 'Human', ActionID: null, UserID: REVIEWER });
            await h.run(makeTask({ ID: 'after-review', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }), { upstreamTasks: [edited] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
        });

        it('keeps taint when a tainted branch bypasses the Human step', async () => {
            const h = harness({ parent: makeParent(tainted) });
            const human = reviewedBy(REVIEWER);
            const unreviewed = makeTask({ ID: 'side', Status: 'Complete', Configuration: JSON.stringify({ runtime: { isOutputTainted: true } }) });
            await h.run(makeTask({ ID: 'join', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }), { upstreamTasks: [human, unreviewed] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
        });

        it('does not let a skipped upstream launder the run taint', async () => {
            const h = harness({ parent: makeParent(tainted) });
            const skipped = makeTask({ ID: 'skipped', Status: 'Skipped' });
            await h.run(makeTask({ ID: 'after-skip', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }), { upstreamTasks: [skipped] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
        });

        it('taints a prompt node fed tainted input', async () => {
            const promptRunner: TaskPromptRunner = { RunPromptForTask: vi.fn().mockResolvedValue({ Success: true, Output: {} }) };
            const h = harness({ promptRunner, parent: makeParent(tainted) });
            const outcome = await h.run(makeTask({
                ID: 'prompt', StepType: 'Prompt', ActionID: null, PromptID: '66666666-6666-4666-8666-666666666666',
                SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted),
            }));
            expect(recordedTaint(outcome)).toBe(true);
        });
    });

    describe('a Decision between an untrusted fetch and an egress action (B2)', () => {
        const FETCH_ACTION = '77777777-7777-4777-8777-777777777777';
        const SEND_EMAIL = '88888888-8888-4888-8888-888888888888';
        const DECISION_PROMPT = '99999999-9999-4999-8999-999999999999';
        const DECISION_CONFIGURATION = JSON.stringify(BuildStepConfiguration(TaskNode.Decision(
            { tempId: 'route', name: 'Route', description: '', dependsOn: [] },
            { state: 'payload.page', questions: { urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' } } },
        )));
        const decisionRunner: TaskDecisionRunner = {
            RunDecisionForTask: async () => ({ Success: true, Answers: { urgent: { probability: 0.9 } } }),
        };

        /** The action runner contract: `Send Email` is `disallowWhenTainted`, so a tainted node is refused before it runs. */
        function runnerResult(p: TaskActionRunParams): Partial<TaskActionRunResult> {
            if (p.ActionID === FETCH_ACTION) return { Output: { page: 'untrusted text' }, IsOutputTainted: true };
            if (p.SecurityEnvelope?.IsRunTainted) return { Success: false, ResultCode: TAINTED_EGRESS_BLOCKED, ErrorMessage: 'refused' };
            return { Output: { sent: true } };
        }

        /** A row that ran, as the dispatcher recorded it. */
        function ranRow(id: string, fields: Parameters<typeof makeTask>[0], recorded: Recorded): MJTaskEntity {
            return makeTask({ ...fields, ID: id, Status: 'Complete', Configuration: recorded.Configuration ?? null });
        }

        const decisionFields = { ID: 'decide', StepType: 'Decision' as const, ActionID: null, PromptID: DECISION_PROMPT, Configuration: DECISION_CONFIGURATION };

        it('refuses Send Email behind a Decision that read the fetched page, and records the Decision tainted', async () => {
            const h = harness({ actionResult: runnerResult, decisionRunner });
            const fetch = ranRow('fetch', { ID: 'fetch', ActionID: FETCH_ACTION }, await h.run(makeTask({ ID: 'fetch', ActionID: FETCH_ACTION })));
            const decided = await h.run(makeTask(decisionFields), {
                upstreamTasks: [fetch], dependencyOutputs: new Map([['fetch', { page: 'untrusted text' }]]),
            });
            expect(decided.Status).toBe('Complete');
            expect(recordedTaint(decided)).toBe(true);

            const decision = ranRow('decide', decisionFields, decided);
            const lookup = (id: string) => ({ fetch: [], decide: [fetch] } as Record<string, MJTaskEntity[]>)[id];
            const send = await h.run(makeTask({ ID: 'send', ActionID: SEND_EMAIL }), { upstreamTasks: [decision], upstreamOf: lookup });

            const sendCall = h.actionCalls.find((c) => c.ActionID === SEND_EMAIL);
            expect(sendCall?.SecurityEnvelope?.IsRunTainted).toBe(true);
            expect(send.Status).toBe('Failed');
        });

        it('still refuses Send Email behind a Decision that recorded no taint (written before it did)', async () => {
            const h = harness({ actionResult: runnerResult });
            const fetch = makeTask({ ID: 'fetch', Status: 'Complete', ActionID: FETCH_ACTION, Configuration: JSON.stringify({ runtime: { isOutputTainted: true } }) });
            const silentDecision = makeTask({ ...decisionFields, Status: 'Complete' });
            const lookup = (id: string) => ({ fetch: [], decide: [fetch] } as Record<string, MJTaskEntity[]>)[id];
            const send = await h.run(makeTask({ ID: 'send', ActionID: SEND_EMAIL }), { upstreamTasks: [silentDecision], upstreamOf: lookup });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(true);
            expect(send.Status).toBe('Failed');
        });

        it("runs Send Email when the review step's assignee reviewed the fetch before the Decision", async () => {
            const h = harness({ actionResult: runnerResult, decisionRunner });
            const fetch = makeTask({ ID: 'fetch', Status: 'Complete', ActionID: FETCH_ACTION, Configuration: JSON.stringify({ runtime: { isOutputTainted: true } }) });
            const review = reviewedBy(REVIEWER, REVIEWER, 'review');
            const lookup = (id: string) => ({ fetch: [], review: [fetch] } as Record<string, MJTaskEntity[]>)[id];
            const decided = await h.run(makeTask(decisionFields), { upstreamTasks: [review], upstreamOf: lookup });
            expect(recordedTaint(decided)).toBe(false);

            const decision = ranRow('decide', decisionFields, decided);
            const send = await h.run(makeTask({ ID: 'send', ActionID: SEND_EMAIL }), {
                upstreamTasks: [decision], upstreamOf: (id) => ({ ...{ fetch: [], review: [fetch], decide: [review] } } as Record<string, MJTaskEntity[]>)[id],
            });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBeFalsy();
            expect(send.Status).toBe('Complete');
        });
    });

    describe('a reinvoke continuation turn (B1)', () => {
        afterEach(() => vi.restoreAllMocks());

        const scoped = envelope({
            RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-A', SecondaryScopes: null },
            Audience: { ReaderUserIDs: ['00000000-0000-4000-8000-000000000002'] },
            CallerTenantContext: TENANT,
        });

        /** A settled graph that asked to reinvoke, with its stored envelope column and its steps. */
        function settled(column: string | null, steps: MJTaskEntity[]) {
            const parent = makeParent();
            const row = parent as unknown as { InputPayload: string; SecurityEnvelope: string | null; CompletedAt: Date; Status: string; ConversationDetailID: string | null };
            row.InputPayload = JSON.stringify(BuildTaskGraphParentInputPayload({
                continuation: 'reinvoke', reinvokeDepth: 0, failureSemantics: 'block', submittedByAgentRunID: 'run-1', submittedByUserID: TEST_USER.ID,
            }));
            row.SecurityEnvelope = column;
            row.CompletedAt = new Date();
            row.Status = 'Complete';
            row.ConversationDetailID = 'detail-1';
            const graph = {
                parentTaskID: PARENT_ID, parent, parentMetadata: ParseTaskGraphParentMetadata(row.InputPayload), rawDependencies: [],
                nodes: steps.map((t) => ({ id: t.ID, status: t.Status })), edges: [], entityById: new Map(steps.map((t) => [t.ID, t])),
                unreachableTaskIDs: new Set(), cascadeSkipTaskIDs: new Set(), skipSeedTaskIDs: new Set(), holdTaskIDs: new Set(), handledFailureIDs: new Set(),
            };
            return { parent, graph };
        }

        async function deliver(deliverer: TaskContinuationDeliverer, column: string | null, steps: MJTaskEntity[]) {
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn(async () => ({ Success: true, Results: [{ ID: 'workflow-type' }] })),
            } as unknown as RunView);
            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: vi.fn() }, { RunAgentForTask: vi.fn() }, TEST_USER, { InstanceID: 'inst-cont' }, deliverer,
            );
            const internals = dispatcher as unknown as {
                claims: { TryClaimContinuation: unknown };
                deliverContinuation: (p: IMetadataProvider, parent: MJTaskEntity, graph: object, cancelled: boolean) => Promise<boolean>;
            };
            internals.claims.TryClaimContinuation = vi.fn(async () => true);
            const { parent, graph } = settled(column, steps);
            await internals.deliverContinuation({} as IMetadataProvider, parent, graph, false);
        }

        function recordingDeliverer(enforces: boolean) {
            const reinvoked: TaskContinuationParams[] = [];
            const posted: TaskContinuationParams[] = [];
            const deliverer: TaskContinuationDeliverer = {
                ...(enforces ? { EnforcesSecurityEnvelope: true } : {}),
                PostMessage: async (p) => { posted.push(p); },
                Reinvoke: async (p) => { reinvoked.push(p); },
            };
            return { deliverer, reinvoked, posted };
        }

        const fetched = () => makeTask({ ID: 'fetch', Status: 'Complete', Configuration: JSON.stringify({ runtime: { isOutputTainted: true } }) });
        const clean = () => makeTask({ ID: 'tidy', Status: 'Complete', Configuration: JSON.stringify({ runtime: { isOutputTainted: false } }) });

        it("starts the turn under the graph's envelope, tainted when a step's output is", async () => {
            const d = recordingDeliverer(true);
            await deliver(d.deliverer, SerializeTaskSecurityEnvelope(scoped), [clean(), fetched()]);
            expect(d.posted).toHaveLength(0);
            expect(d.reinvoked[0].SecurityEnvelope).toEqual({ ...scoped, IsRunTainted: true });
        });

        it('keeps the envelope untainted when no step output is tainted', async () => {
            const d = recordingDeliverer(true);
            await deliver(d.deliverer, SerializeTaskSecurityEnvelope(scoped), [clean()]);
            expect(d.reinvoked[0].SecurityEnvelope).toEqual(scoped);
        });

        it('gives a turn of an unconstrained graph a taint-only envelope when a step read untrusted content', async () => {
            const d = recordingDeliverer(true);
            await deliver(d.deliverer, null, [fetched()]);
            expect(d.reinvoked[0].SecurityEnvelope).toEqual({ Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true });
        });

        it('posts the outcome instead of reinvoking on a host whose deliverer does not enforce envelopes', async () => {
            const d = recordingDeliverer(false);
            await deliver(d.deliverer, SerializeTaskSecurityEnvelope(scoped), [clean()]);
            expect(d.reinvoked).toHaveLength(0);
            expect(d.posted).toHaveLength(1);
        });

        it('posts the outcome instead of reinvoking when the stored envelope cannot be read', async () => {
            const d = recordingDeliverer(true);
            await deliver(d.deliverer, '{"Version":2,"IsRunTainted":false}', [clean()]);
            expect(d.reinvoked).toHaveLength(0);
            expect(d.posted).toHaveLength(1);
        });

        it('still reinvokes an unconstrained, clean graph on any host', async () => {
            const d = recordingDeliverer(false);
            await deliver(d.deliverer, null, [clean()]);
            expect(d.reinvoked).toHaveLength(1);
            expect(d.reinvoked[0].SecurityEnvelope).toBeUndefined();
        });
    });

    describe('settling a Human step from its answered request', () => {
        afterEach(() => vi.restoreAllMocks());

        async function settle(request: Record<string, unknown>): Promise<{ human: MJTaskEntity; savedInScope: boolean | undefined }> {
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn(async (p: { EntityName: string; ExtraFilter?: string }) =>
                    p.EntityName === 'MJ: AI Agent Requests' && p.ExtraFilter?.includes('Status IN')
                        ? { Success: true, Results: [request] }
                        : { Success: true, Results: [] }),
            } as unknown as RunView);
            const human = makeTask({ ID: 'approve', StepType: 'Human', ActionID: null, UserID: REVIEWER, Configuration: JSON.stringify({ human: { instructions: 'x' } }) });
            let savedInScope: boolean | undefined;
            (human as unknown as { Save: () => Promise<boolean> }).Save = vi.fn(async () => {
                savedInScope = ServerOperationScopeManager.Instance.IsOperationActive([TASK_GRAPH_RUNTIME_SECURITY_OPERATION], 'MJ: Tasks', TEST_USER);
                return true;
            });
            const dispatcher = new TaskGraphDispatcher({ CreateProvider: vi.fn() }, { RunAgentForTask: vi.fn() }, TEST_USER, { InstanceID: 'inst-settle' });
            await (dispatcher as unknown as {
                settleAnsweredHumanTasks: (p: IMetadataProvider, id: string, tasks: MJTaskEntity[]) => Promise<number>;
            }).settleAnsweredHumanTasks({} as IMetadataProvider, PARENT_ID, [human]);
            return { human, savedInScope };
        }

        it("records who answered as the step's completer, saving inside the dispatcher's runtime-security scope", async () => {
            const { human, savedInScope } = await settle({ ID: 'req-1', Status: 'Approved', ResponseData: null, ResponseByUserID: REVIEWER });
            expect(human.Status).toBe('Complete');
            const configuration = JSON.parse(human.Configuration!);
            expect(configuration.runtime.completedByUserID).toBe(REVIEWER);
            expect(configuration.human).toEqual({ instructions: 'x' });
            expect(savedInScope).toBe(true);
        });

        it('records no completer when the request names no responder, so the step clears nothing', async () => {
            const { human } = await settle({ ID: 'req-2', Status: 'Approved', ResponseData: null, ResponseByUserID: null });
            expect(human.Status).toBe('Complete');
            expect(JSON.parse(human.Configuration!).runtime.completedByUserID).toBeUndefined();
        });
    });
});
