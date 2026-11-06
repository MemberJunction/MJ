/**
 * The dispatcher's enforcement of `MJ: Tasks.SecurityEnvelope`: where the envelope is read from, what
 * a node is refused for, who it runs as, and how taint flows from node to node.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, TenantContext, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import {
    SerializeTaskSecurityEnvelope,
    TASK_SECURITY_ENVELOPE_VERSION,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import { TaskGraphDispatcher, type ClaimedTaskCandidate } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata } from '../TaskGraphService';
import type {
    ProviderFactory,
    TaskActionRunParams,
    TaskActionRunResult,
    TaskActionRunner,
    TaskAgentRunner,
    TaskPromptRunner,
} from '../types';

const TEST_USER = { ID: '00000000-0000-4000-8000-000000000001', Name: 'Tester', IsActive: true } as UserInfo;
const ACTION_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_ID = '44444444-4444-4444-8444-444444444444';
const TENANT: TenantContext = { TenantID: 'org-A', Source: 'header' };

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

type Recorded = { Status: string; ErrorMessage?: string; Configuration?: string };

type Harness = {
    run: (task: MJTaskEntity, extra?: Partial<ClaimedTaskCandidate>) => Promise<Recorded>;
    actionCalls: TaskActionRunParams[];
};

function harness(opts: {
    actionResult?: Partial<TaskActionRunResult>;
    enforces?: boolean;
    providerFactory?: ProviderFactory;
    agentRunner?: TaskAgentRunner;
    promptRunner?: TaskPromptRunner;
    parent?: MJTaskEntity;
}): Harness {
    const actionCalls: TaskActionRunParams[] = [];
    const actionRunner: TaskActionRunner = {
        EnforcesSecurityEnvelope: opts.enforces ?? true,
        RunActionForTask: vi.fn(async (p: TaskActionRunParams) => {
            actionCalls.push(p);
            return { Success: true, Output: { ok: true }, ...opts.actionResult };
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

        it('clears taint behind a completed Human step', async () => {
            const h = harness({ parent: makeParent(tainted) });
            const human = makeTask({ ID: 'approve', Status: 'Complete', StepType: 'Human', ActionID: null, UserID: TEST_USER.ID });
            await h.run(makeTask({ ID: 'after-review', SecurityEnvelope: SerializeTaskSecurityEnvelope(tainted) }), { upstreamTasks: [human] });
            expect(h.actionCalls[0].SecurityEnvelope?.IsRunTainted).toBe(false);
        });

        it('keeps taint when a tainted branch bypasses the Human step', async () => {
            const h = harness({ parent: makeParent(tainted) });
            const human = makeTask({ ID: 'approve', Status: 'Complete', StepType: 'Human', ActionID: null, UserID: TEST_USER.ID });
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
});
