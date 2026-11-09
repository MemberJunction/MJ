/**
 * @fileoverview IT165 — task-graph security envelopes, saga compensation claims, the A2A store's row
 * boundary, and live dispatcher taint gating with compensation, against a live database (deterministic,
 * mutating, server transport).
 *
 * - TGS1: a submitted graph's parent and every child carry the submitting run's envelope in
 *   `Task.SecurityEnvelope`, and an edit to it on an existing row is refused (`MJTaskEntityServer`).
 * - TGS2: two compensation rows for one forward step cannot both exist — `CompensatesTaskID`'s unique
 *   index lets exactly one of two concurrent inserts land, which is what makes materializing a saga
 *   compensation a claim across dispatchers.
 * - TGS3: the durable A2A task store reads a task-graph step's ID as "not found" and will not write over
 *   or cancel it, while an A2A task saves under the `A2A Task` type and reads back.
 * - TGS4: runs a small graph through the real dispatcher on the test DB, asserting that taint from an
 *   untrusted action propagates through a Decision step to gate a downstream action, failing the graph
 *   and triggering saga compensation of completed compensatable steps. The gate itself is the check's
 *   stub action runner, not MJServer's `TaskGraphActionRunner` (see {@link checkDispatcherTaintGateAndCompensation}).
 * - TGS5: the real gate. A tainted one-step graph whose step is `Send Single Message` (shipped with
 *   `Config.disallowWhenTainted`) runs through the real dispatcher configured with MJServer's real
 *   `TaskGraphActionRunner`, which refuses the step before the action runs (see {@link checkRealRunnerRefusesTaintedEgress}).
 * - TGS6: a person's review clears taint in a real graph, where every Human step is assigned to the submitter
 *   the graph runs as, and server code completing the same kind of step clears nothing (see {@link checkPersonsReviewClearsTaint}).
 *
 * Fixtures: one start-paused Human-only graph (so no dispatcher picks it up) and the rows the checks
 * create, all removed in teardown, rows that reference another first.
 *
 * @module @memberjunction/integration-test-suite
 */
import { randomUUID } from 'crypto';
import { RunView, ServerOperationScopeManager, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { MJEnvironmentEntityExtended, MJTaskDependencyEntity, MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import {
    ParseTaskSecurityEnvelope,
    TAINTED_EGRESS_BLOCKED,
    TASK_SECURITY_ENVELOPE_VERSION,
    type TaskGraphSpec,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import {
    TaskGraphDispatcher,
    TaskGraphService,
    type ProviderFactory,
    type TaskActionRunner,
    type TaskActionRunParams,
    type TaskActionRunResult,
    type TaskAgentRunner,
    type TaskAgentRunResult,
    type TaskDecisionRunner,
} from '@memberjunction/task-graph';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
// The store's own entry: the package root also starts the A2A server's config load on import.
import { A2A_TASK_TYPE_NAME, DurableEntityA2ATaskStore, type Task } from '@memberjunction/a2aserver/task-store';
// The runner's own entry, for the same reason: the server package root loads the server's config on import.
import { TaskGraphActionRunner } from '@memberjunction/server/task-graph-action-runner';
import { UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck, settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';

const BUNDLE = 'task-graph-security';

/** The envelope the fixture graph is submitted with. */
const ENVELOPE: TaskSecurityEnvelope = {
    Version: TASK_SECURITY_ENVELOPE_VERSION,
    IsRunTainted: true,
    RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'it164-tenant', SecondaryScopes: { Region: 'it164' } },
};

interface SecurityFixture {
    ParentID: string;
    ChildIDs: string[];
    /** Rows the checks created, deleted before the graph. */
    ExtraTaskIDs: string[];
    /** Set when this run created the 'A2A Task' type, so teardown removes it too. */
    CreatedA2ATypeID: string | null;
}

let fixture: SecurityFixture | undefined;
let skipReason: string | undefined;

function fx(): SecurityFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

async function loadTask(ctx: IntegrationCheckContext, id: string): Promise<MJTaskEntity> {
    const task = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
    Assert(await task.Load(id), `could not load task ${id}`);
    return task;
}

async function a2aTypeIDs(ctx: IntegrationCheckContext): Promise<string[]> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Task Types', ExtraFilter: `Name='${A2A_TASK_TYPE_NAME}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        ctx.User,
    );
    return (result.Results ?? []).map((r) => r.ID);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        const spec: TaskGraphSpec = {
            workflowName: `it164-security-${Date.now()} (mj-integration-test — safe to delete)`,
            continuation: 'none',
            tasks: [
                { tempId: 'approve', name: 'it164 approve', description: 'fixture', kind: 'Human', configuration: { instructions: 'fixture' }, dependsOn: [] },
                { tempId: 'confirm', name: 'it164 confirm', description: 'fixture', kind: 'Human', configuration: { instructions: 'fixture' }, dependsOn: ['approve'] },
            ],
        };
        const submitted = await new TaskGraphService().Submit(spec, {
            EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
            Provider: ctx.Provider,
            ContextUser: ctx.User,
            SecurityEnvelope: ENVELOPE,
            // Start-paused: no dispatcher claims or notifies the fixture.
            Debug: { paused: true },
        });
        Assert(submitted.Success && !!submitted.ParentTaskID, `fixture graph submit failed: ${submitted.ErrorMessage ?? ''}`);
        const children = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${submitted.ParentTaskID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
            ctx.User,
        );
        fixture = {
            ParentID: submitted.ParentTaskID!,
            ChildIDs: (children.Results ?? []).map((c) => c.ID),
            ExtraTaskIDs: [],
            CreatedA2ATypeID: null,
        };
        AssertEqual(fixture.ChildIDs.length, 2, 'fixture child count');
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) return;
        const remove = async (id: string): Promise<void> => {
            const task = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
            if (await task.Load(id).catch(() => false)) await task.Delete().catch(() => false);
        };
        for (const id of f.ExtraTaskIDs) await remove(id);
        const deps = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskDependencyEntity>(
            { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${f.ChildIDs.map((id) => `'${id}'`).join(',')})`, ResultType: 'entity_object' },
            ctx.User,
        );
        for (const dep of deps.Results ?? []) await dep.Delete().catch(() => false);
        for (const id of f.ChildIDs) await remove(id);
        await remove(f.ParentID);
        if (f.CreatedA2ATypeID) {
            const type = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
            if (await type.Load(f.CreatedA2ATypeID).catch(() => false)) await type.Delete().catch(() => false);
        }
    },
});

/** TGS1 — the envelope is on every row, and it cannot be changed afterwards. */
async function checkEnvelopeOnEveryRowAndImmutable(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    for (const id of [f.ParentID, ...f.ChildIDs]) {
        const task = await loadTask(ctx, id);
        const parsed = ParseTaskSecurityEnvelope(task.SecurityEnvelope);
        Assert(parsed.Status === 'Valid', `TGS1: task ${id} has no readable envelope (${parsed.Status})`);
        if (parsed.Status === 'Valid') {
            AssertEqual(parsed.Envelope.RunScope?.PrimaryScopeRecordID, 'it164-tenant', `TGS1: task ${id} envelope tenant`);
            AssertEqual(parsed.Envelope.IsRunTainted, true, `TGS1: task ${id} envelope taint`);
        }
        Assert(!(task.InputPayload ?? '').includes('IsRunTainted'), `TGS1: task ${id} still carries the envelope in InputPayload`);
    }

    const child = await loadTask(ctx, f.ChildIDs[0]);
    const original = child.SecurityEnvelope;
    child.SecurityEnvelope = JSON.stringify({ Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false });
    Assert(!(await child.Save()), 'TGS1: an edit to an existing task\'s SecurityEnvelope was saved');
    AssertEqual((await loadTask(ctx, f.ChildIDs[0])).SecurityEnvelope, original, 'TGS1: the stored envelope after the refused edit');

    const other = await loadTask(ctx, f.ChildIDs[0]);
    other.Description = 'it164 edited description';
    Assert(await other.Save(), `TGS1: an ordinary edit was refused: ${other.LatestResult?.CompleteMessage ?? ''}`);
}

/** TGS2 — of two concurrent compensation rows for one forward step, exactly one lands. */
async function checkOneCompensationPerForwardStep(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const forwardID = f.ChildIDs[0];
    const forward = await loadTask(ctx, forwardID);
    const compensation = async (): Promise<MJTaskEntity> => {
        const row = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
        row.NewRecord();
        row.ParentID = f.ParentID;
        row.TypeID = forward.TypeID;
        row.Name = 'it164 compensate';
        row.StepType = 'Human';
        row.UserID = ctx.User.ID;
        row.Status = 'Pending';
        row.PercentComplete = 0;
        row.CompensatesTaskID = forwardID;
        row.SecurityEnvelope = forward.SecurityEnvelope;
        return row;
    };
    const rows = [await compensation(), await compensation()];
    const saved = await Promise.all(rows.map((r) => r.Save()));
    rows.forEach((r, i) => { if (saved[i]) f.ExtraTaskIDs.push(r.ID); });
    AssertEqual(saved.filter(Boolean).length, 1, 'TGS2: saves that landed');

    const stored = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `CompensatesTaskID='${forwardID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        ctx.User,
    );
    AssertEqual(stored.Results?.length ?? 0, 1, 'TGS2: compensation rows for the forward step');
}

/** TGS3 — the A2A store sees only A2A Task rows. */
async function checkA2AStoreSeesOnlyA2ARows(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const typesBefore = await a2aTypeIDs(ctx);
    const store = new DurableEntityA2ATaskStore();
    const stepID = f.ChildIDs[0];
    const before = await loadTask(ctx, stepID);

    Assert((await store.LoadTaskForUser(stepID, ctx.User, ctx.Provider)) === undefined, 'TGS3: the store read a task-graph step');
    const hostile: Task = { id: stepID, status: 'completed', messages: [], artifacts: [], created: new Date(), updated: new Date() };
    Assert(!(await store.SaveTask(hostile, ctx.User, ctx.Provider)), 'TGS3: the store wrote over a task-graph step');
    Assert(!(await store.CancelTaskForUser(stepID, ctx.User, 'it164', ctx.Provider)), 'TGS3: the store cancelled a task-graph step');
    const after = await loadTask(ctx, stepID);
    AssertEqual(after.Status, before.Status, 'TGS3: the step status');
    AssertEqual(after.InputPayload, before.InputPayload, 'TGS3: the step input');

    const a2aID = randomUUID();
    const a2aTask: Task = { id: a2aID, status: 'pending', messages: [], artifacts: [], created: new Date(), updated: new Date() };
    const saved = await store.SaveTask(a2aTask, ctx.User, ctx.Provider);
    if (saved) f.ExtraTaskIDs.push(a2aID);
    Assert(saved, 'TGS3: an A2A task could not be saved');
    const typesAfter = await a2aTypeIDs(ctx);
    if (typesBefore.length === 0 && typesAfter.length > 0) f.CreatedA2ATypeID = typesAfter[0];
    const row = await loadTask(ctx, a2aID);
    Assert(typesAfter.some((id) => UUIDsEqual(id, row.TypeID)), "TGS3: the A2A task is not filed under the 'A2A Task' type");
    const loadedA2A = await new DurableEntityA2ATaskStore().LoadTaskForUser(a2aID, ctx.User, ctx.Provider);
    Assert(UUIDsEqual(loadedA2A?.id, a2aID), 'TGS3: the A2A task read back');
}

function providerFactory(ctx: IntegrationCheckContext): ProviderFactory {
    const pool = ctx.Pool;
    if (!pool) return { CreateProvider: async () => ctx.Provider };
    return {
        CreateProvider: async (): Promise<IMetadataProvider> => {
            const config = new SQLServerProviderConfigData(pool, ctx.Schema ?? '__mj', 0, undefined, undefined, false);
            const provider = new SQLServerDataProvider();
            await provider.Config(config);
            return provider;
        },
    };
}

/**
 * Deletes a submitted graph: its dependency rows, its children, then the workflow task. Returns what could
 * not be deleted, so the check fails instead of leaking rows. A child that another child undoes
 * (`CompensatesTaskID`) is deleted after the row undoing it — an escalation before its compensation, a
 * compensation before its forward step — because the foreign key refuses the other order.
 */
export async function DeleteTaskGraph(provider: IMetadataProvider, user: UserInfo, parentID: string): Promise<string[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const deleted = (row: { Delete(): Promise<boolean> }): Promise<boolean> => row.Delete().catch(() => false);
    const children = await rv.RunView<MJTaskEntity>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
        user,
    );
    if (!children.Success) return [`could not list the workflow's tasks: ${children.ErrorMessage ?? ''}`];
    const failures: string[] = [];
    let remaining = children.Results ?? [];
    if (remaining.length > 0) {
        const deps = await rv.RunView<MJTaskDependencyEntity>(
            { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${remaining.map((t) => `'${t.ID}'`).join(',')})`, ResultType: 'entity_object', BypassCache: true },
            user,
        );
        if (!deps.Success) failures.push(`could not list the workflow's dependencies: ${deps.ErrorMessage ?? ''}`);
        for (const dep of deps.Results ?? []) {
            if (!(await deleted(dep))) failures.push(`dependency ${dep.ID}: ${dep.LatestResult?.CompleteMessage ?? 'not deleted'}`);
        }
    }
    while (remaining.length > 0) {
        const undone = new UUIDSet(remaining.map((t) => t.CompensatesTaskID));
        const ready = remaining.filter((t) => !undone.Has(t.ID));
        if (ready.length === 0) {
            failures.push(`tasks that undo one another were left: ${remaining.map((t) => t.ID).join(', ')}`);
            break;
        }
        for (const task of ready) {
            if (!(await deleted(task))) failures.push(`task ${task.ID}: ${task.LatestResult?.CompleteMessage ?? 'not deleted'}`);
        }
        remaining = remaining.filter((t) => undone.Has(t.ID));
    }
    const parent = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', user);
    if ((await parent.Load(parentID).catch(() => false)) && !(await deleted(parent))) {
        failures.push(`workflow ${parentID}: ${parent.LatestResult?.CompleteMessage ?? 'not deleted'}`);
    }
    return failures;
}

class NoopAgentRunner implements TaskAgentRunner {
    public readonly EnforcesSecurityEnvelope = true;
    public async RunAgentForTask(): Promise<TaskAgentRunResult> {
        return { Success: true };
    }
}

/**
 * TGS4 — a tainted graph through the real dispatcher is gated on taint at a Decision-downstream action, failing
 * the graph and triggering saga compensation.
 *
 * The taint gate is this check's stub `TaskActionRunner`, which refuses the send step whenever its envelope is
 * tainted: the real runner would execute whichever `MJ: Actions` rows the check picks. So TGS4 proves the
 * dispatcher's half: the send step receives a tainted envelope through the Decision, a `TAINTED_EGRESS_BLOCKED`
 * result is not retried and fails the graph, and the saga compensates the completed step. The real runner's own
 * gate (refusing a `disallowWhenTainted` action under a tainted envelope) is TGS5
 * ({@link checkRealRunnerRefusesTaintedEgress}).
 */
async function checkDispatcherTaintGateAndCompensation(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }

    const actionsResult = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; Name: string }>(
        { EntityName: 'MJ: Actions', Fields: ['ID', 'Name'], MaxRows: 3, ResultType: 'simple' },
        ctx.User,
    );
    Assert(actionsResult.Success && (actionsResult.Results?.length ?? 0) >= 1, 'TGS4: failed to query actions from MJ: Actions');
    const actionPrimary = actionsResult.Results![0];
    const actionComp = actionsResult.Results!.length > 1 ? actionsResult.Results![1] : actionPrimary;

    const promptResult = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; Name: string }>(
        { EntityName: 'MJ: AI Prompts', Fields: ['ID', 'Name'], MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    const decisionPromptName = promptResult.Success && (promptResult.Results?.length ?? 0) > 0
        ? promptResult.Results![0].Name
        : undefined;

    const spec: TaskGraphSpec = {
        workflowName: `it165-taint-saga-${Date.now()} (mj-integration-test — safe to delete)`,
        continuation: 'none',
        failurePolicy: 'CompensateCompleted',
        tasks: [
            {
                tempId: 'forward',
                name: 'it165 forward step',
                description: 'fixture forward step with compensation',
                kind: 'Action',
                configuration: {
                    actionName: actionPrimary.Name,
                    compensation: {
                        compensationActionId: actionComp.ID,
                    },
                },
                dependsOn: [],
            },
            {
                tempId: 'fetch',
                name: 'it165 fetch step',
                description: 'fixture fetch step returning untrusted output',
                kind: 'Action',
                configuration: {
                    actionName: actionPrimary.Name,
                },
                dependsOn: ['forward'],
            },
            {
                tempId: 'decide',
                name: 'it165 decide step',
                description: 'fixture decision step downstream of tainted fetch',
                kind: 'Decision',
                configuration: {
                    ...(decisionPromptName ? { promptName: decisionPromptName } : {}),
                    questions: {
                        route: {
                            kind: 'Choice',
                            instructions: 'Route decision',
                            options: [
                                { value: 'send', description: 'Send' },
                                { value: 'skip', description: 'Skip' },
                            ],
                            minConfidence: 0.5,
                        },
                    },
                },
                dependsOn: ['fetch'],
            },
            {
                tempId: 'send',
                name: 'it165 send step',
                description: 'fixture send step downstream of decision',
                kind: 'Action',
                configuration: {
                    actionName: actionPrimary.Name,
                },
                dependsOn: ['decide'],
            },
        ],
    };

    const submitted = await new TaskGraphService().Submit(spec, {
        EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
        Provider: ctx.Provider,
        ContextUser: ctx.User,
        SecurityEnvelope: {
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            IsRunTainted: false,
        },
        Debug: { paused: false },
    });
    Assert(submitted.Success && !!submitted.ParentTaskID, `TGS4: failed to submit graph: ${submitted.ErrorMessage ?? ''}`);
    const parentID = submitted.ParentTaskID!;

    if (fixture) {
        fixture.ExtraTaskIDs.push(parentID);
    }

    let sendSawTaintedEnvelope = false;
    let forwardRan = false;
    let fetchRan = false;
    let compensationRan = false;

    const actionRunner: TaskActionRunner = {
        EnforcesSecurityEnvelope: true,
        RunActionForTask: async (params: TaskActionRunParams): Promise<TaskActionRunResult> => {
            const task = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', params.ContextUser);
            await task.Load(params.TaskID);

            if (task.CompensatesTaskID != null || task.Name.startsWith('Compensate:')) {
                compensationRan = true;
                return { Success: true, Output: { compensated: true } };
            }
            if (task.Name === 'it165 forward step') {
                forwardRan = true;
                return { Success: true, Output: { forwardResult: 'ok' } };
            }
            if (task.Name === 'it165 fetch step') {
                fetchRan = true;
                return { Success: true, Output: { page: 'untrusted-data' }, IsOutputTainted: true };
            }
            if (task.Name === 'it165 send step') {
                if (params.SecurityEnvelope?.IsRunTainted === true) {
                    sendSawTaintedEnvelope = true;
                    return {
                        Success: false,
                        ResultCode: TAINTED_EGRESS_BLOCKED,
                        ErrorMessage: 'Refused: action cannot run with tainted input',
                    };
                }
                return { Success: true, Output: { sent: true } };
            }
            return { Success: true, Output: {} };
        },
    };

    let decideRan = false;
    const decisionRunner: TaskDecisionRunner = {
        RunDecisionForTask: async () => {
            decideRan = true;
            return {
                Success: true,
                Answers: {
                    route: {
                        kind: 'Choice',
                        value: 'send',
                        confidence: 0.9,
                    },
                },
            };
        },
    };

    const dispatcher = new TaskGraphDispatcher(
        providerFactory(ctx),
        new NoopAgentRunner(),
        ctx.User as UserInfo,
        {
            InstanceID: `it165-disp-${randomUUID().slice(0, 8)}`,
            PollIntervalSeconds: 0.1,
            ClaimTTLSeconds: 300,
            ReconciliationIntervalSeconds: 3600,
            MaxConcurrentTasks: 4,
        },
        undefined,
        undefined,
        actionRunner,
        undefined,
        decisionRunner,
    );

    let cleanupFailures: string[] = [];
    try {
        await dispatcher.Start();
        const deadline = Date.now() + 30_000;
        let settledParent: MJTaskEntity | null = null;
        while (Date.now() < deadline) {
            await settle(200);
            const p = await loadTask(ctx, parentID);
            if (p.Status === 'Complete' || p.Status === 'Failed' || p.Status === 'Cancelled' || p.Status === 'Blocked') {
                settledParent = p;
                break;
            }
        }
        Assert(settledParent != null, `TGS4: graph ${parentID} did not settle within 30s`);
        AssertEqual(settledParent!.Status, 'Failed', 'TGS4: parent graph status after taint failure');

        Assert(forwardRan, 'TGS4: forward step did not run');
        Assert(fetchRan, 'TGS4: fetch step did not run');
        Assert(decideRan, 'TGS4: decision step did not run');
        Assert(sendSawTaintedEnvelope, 'TGS4: send step did not see tainted SecurityEnvelope');
        Assert(compensationRan, 'TGS4: compensation action did not run');

        const childrenRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        const children = childrenRes.Results ?? [];
        const forwardTask = children.find((c) => c.CompensatesTaskID == null && c.Name === 'it165 forward step');
        const sendTask = children.find((c) => c.CompensatesTaskID == null && c.Name === 'it165 send step');
        const compTask = children.find((c) => c.CompensatesTaskID != null && forwardTask != null && UUIDsEqual(c.CompensatesTaskID, forwardTask.ID));

        Assert(forwardTask != null, 'TGS4: forward task row not found');
        AssertEqual(forwardTask!.Status, 'Complete', 'TGS4: forward task status');

        Assert(sendTask != null, 'TGS4: send task row not found');
        AssertEqual(sendTask!.Status, 'Failed', 'TGS4: send task status');

        Assert(compTask != null, 'TGS4: compensation task row not found');
        AssertEqual(compTask!.Status, 'Complete', 'TGS4: compensation task status');
    } finally {
        await dispatcher.Stop();
        cleanupFailures = await DeleteTaskGraph(ctx.Provider, ctx.User, parentID).catch((e: unknown) => [String(e)]);
    }
    Assert(cleanupFailures.length === 0, `TGS4: cleanup left rows behind: ${cleanupFailures.join('; ')}`);
}

/** The shipped action TGS5's graph runs: an egress action the metadata marks `disallowWhenTainted`. */
const TGS5_EGRESS_ACTION = 'Send Single Message';

/**
 * TGS5 — MJServer's real `TaskGraphActionRunner` refuses a `disallowWhenTainted` action on a tainted node.
 *
 * TGS4 proves the dispatcher hands the tainted envelope down, but its stub runner is what refuses. Here the
 * dispatcher runs with the real runner (imported through `@memberjunction/server/task-graph-action-runner`), and
 * the graph is one step of {@link TGS5_EGRESS_ACTION}, submitted tainted. The step must fail with the runner's
 * `TAINTED_EGRESS_BLOCKED` refusal, which it returns before the action engine runs anything, so nothing is sent.
 * The check first asserts the shipped action row carries `Config.disallowWhenTainted`, so a database without
 * that metadata fails here rather than passing on a refusal from somewhere else.
 */
async function checkRealRunnerRefusesTaintedEgress(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }

    const actionResult = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; Config: string | null }>(
        { EntityName: 'MJ: Actions', ExtraFilter: `Name='${TGS5_EGRESS_ACTION}'`, Fields: ['ID', 'Config'], ResultType: 'simple', BypassCache: true },
        ctx.User,
    );
    const action = actionResult.Success ? actionResult.Results?.[0] : undefined;
    Assert(action != null, `TGS5: action "${TGS5_EGRESS_ACTION}" not found`);
    const config = action!.Config ? (JSON.parse(action!.Config) as { disallowWhenTainted?: boolean }) : {};
    Assert(config.disallowWhenTainted === true, `TGS5: "${TGS5_EGRESS_ACTION}" does not set Config.disallowWhenTainted (metadata not pushed?)`);

    const submitted = await new TaskGraphService().Submit(
        {
            workflowName: `it165-real-taint-gate-${Date.now()} (mj-integration-test — safe to delete)`,
            continuation: 'none',
            tasks: [{
                tempId: 'send',
                name: 'it165 real-gate send',
                description: 'fixture egress step on a tainted graph; the runner must refuse it',
                kind: 'Action',
                configuration: { actionName: TGS5_EGRESS_ACTION },
                dependsOn: [],
            }],
        },
        {
            EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
            Provider: ctx.Provider,
            ContextUser: ctx.User,
            SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true },
            Debug: { paused: false },
        },
    );
    Assert(submitted.Success && !!submitted.ParentTaskID, `TGS5: failed to submit graph: ${submitted.ErrorMessage ?? ''}`);
    const parentID = submitted.ParentTaskID!;

    const dispatcher = new TaskGraphDispatcher(
        providerFactory(ctx),
        new NoopAgentRunner(),
        ctx.User as UserInfo,
        {
            InstanceID: `it165-gate-${randomUUID().slice(0, 8)}`,
            PollIntervalSeconds: 0.1,
            ClaimTTLSeconds: 300,
            ReconciliationIntervalSeconds: 3600,
            MaxConcurrentTasks: 1,
        },
        undefined,
        undefined,
        new TaskGraphActionRunner(),
    );

    let cleanupFailures: string[] = [];
    try {
        await dispatcher.Start();
        const deadline = Date.now() + 30_000;
        let settledParent: MJTaskEntity | null = null;
        while (Date.now() < deadline && !settledParent) {
            await settle(200);
            const p = await loadTask(ctx, parentID);
            if (p.Status === 'Complete' || p.Status === 'Failed' || p.Status === 'Cancelled' || p.Status === 'Blocked') {
                settledParent = p;
            }
        }
        Assert(settledParent != null, `TGS5: graph ${parentID} did not settle within 30s`);
        AssertEqual(settledParent!.Status, 'Failed', 'TGS5: parent graph status after the refused step');

        const children = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Status: string; ErrorMessage: string | null }>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, Fields: ['Status', 'ErrorMessage'], ResultType: 'simple', BypassCache: true },
            ctx.User,
        );
        const send = children.Results?.[0];
        Assert(children.Success && children.Results?.length === 1 && send != null, 'TGS5: expected exactly one step row');
        AssertEqual(send!.Status, 'Failed', 'TGS5: egress step status');
        Assert(
            (send!.ErrorMessage ?? '').includes(TAINTED_EGRESS_BLOCKED) && (send!.ErrorMessage ?? '').includes(TGS5_EGRESS_ACTION),
            `TGS5: the step did not fail with the runner's ${TAINTED_EGRESS_BLOCKED} refusal: ${send!.ErrorMessage ?? '(no error message)'}`,
        );
    } finally {
        await dispatcher.Stop();
        cleanupFailures = await DeleteTaskGraph(ctx.Provider, ctx.User, parentID).catch((e: unknown) => [String(e)]);
    }
    Assert(cleanupFailures.length === 0, `TGS5: cleanup left rows behind: ${cleanupFailures.join('; ')}`);
}

/**
 * TGS6 — a person's review clears taint in a real graph; server code completing the step does not.
 *
 * A real graph assigns every Human step to its submitter, who is also the user its agents and actions run as,
 * so who completed a step cannot tell a person from code: where the completion came from does. A tainted fetch
 * fans out to two Human steps, both assigned to the submitter (`ctx.User`, also this dispatcher's user). One is
 * completed as the Tasks UI completes it, a save inside a client CRUD boundary (as `ResolverBase` wraps it); the
 * other by a plain server-side save as the same user, as an agent or action run would. Each feeds an action step
 * whose stub runner records the envelope it was handed: the step behind the person's review must run clean, and
 * the one behind server code tainted. TGS5 proves the real runner refuses a gated action given a tainted
 * envelope, so the clean envelope is what lets a gated action run after a review.
 */
async function checkPersonsReviewClearsTaint(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }

    const actionsResult = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
        { EntityName: 'MJ: Actions', Fields: ['Name'], MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    Assert(actionsResult.Success && (actionsResult.Results?.length ?? 0) === 1, 'TGS6: failed to query an action from MJ: Actions');
    const actionName = actionsResult.Results![0].Name;
    const FETCH = 'it165 review fetch';
    const BY_PERSON = 'it165 reviewed by a person';
    const BY_SERVER = 'it165 completed by server code';
    const AFTER_PERSON = 'it165 send after the person';
    const AFTER_SERVER = 'it165 send after server code';
    const step = (tempId: string, name: string, kind: 'Action' | 'Human', dependsOn: string[]) => ({
        tempId, name, description: 'fixture', kind, dependsOn,
        configuration: kind === 'Action' ? { actionName } : { instructions: 'fixture' },
    });

    const submitted = await new TaskGraphService().Submit(
        {
            workflowName: `it165-review-clears-taint-${Date.now()} (mj-integration-test — safe to delete)`,
            continuation: 'none',
            tasks: [
                step('fetch', FETCH, 'Action', []),
                step('byPerson', BY_PERSON, 'Human', ['fetch']),
                step('byServer', BY_SERVER, 'Human', ['fetch']),
                step('afterPerson', AFTER_PERSON, 'Action', ['byPerson']),
                step('afterServer', AFTER_SERVER, 'Action', ['byServer']),
            ],
        } as TaskGraphSpec,
        {
            EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
            Provider: ctx.Provider,
            ContextUser: ctx.User,
            SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false },
            Debug: { paused: false },
        },
    );
    Assert(submitted.Success && !!submitted.ParentTaskID, `TGS6: failed to submit graph: ${submitted.ErrorMessage ?? ''}`);
    const parentID = submitted.ParentTaskID!;

    const ranTainted = new Map<string, boolean>();
    const actionRunner: TaskActionRunner = {
        EnforcesSecurityEnvelope: true,
        RunActionForTask: async (params: TaskActionRunParams): Promise<TaskActionRunResult> => {
            const task = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', params.ContextUser);
            await task.Load(params.TaskID);
            if (task.Name === FETCH) {
                return { Success: true, Output: { page: 'untrusted-data' }, IsOutputTainted: true };
            }
            ranTainted.set(task.Name, params.SecurityEnvelope?.IsRunTainted === true);
            return { Success: true, Output: {} };
        },
    };
    const dispatcher = new TaskGraphDispatcher(
        providerFactory(ctx),
        new NoopAgentRunner(),
        ctx.User as UserInfo,
        {
            InstanceID: `it165-review-${randomUUID().slice(0, 8)}`,
            PollIntervalSeconds: 0.1,
            ClaimTTLSeconds: 300,
            ReconciliationIntervalSeconds: 3600,
            MaxConcurrentTasks: 4,
        },
        undefined,
        undefined,
        actionRunner,
    );

    const childByName = async (): Promise<Map<string, MJTaskEntity>> => {
        const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        return new Map((rows.Results ?? []).map((t) => [t.Name, t]));
    };

    let cleanupFailures: string[] = [];
    try {
        await dispatcher.Start();
        let fetchDone = false;
        for (const deadline = Date.now() + 30_000; Date.now() < deadline && !fetchDone;) {
            await settle(200);
            fetchDone = (await childByName()).get(FETCH)?.Status === 'Complete';
        }
        Assert(fetchDone, `TGS6: the fetch step of graph ${parentID} did not complete within 30s`);

        const children = await childByName();
        const byPerson = children.get(BY_PERSON);
        const byServer = children.get(BY_SERVER);
        Assert(byPerson != null && byServer != null, 'TGS6: the Human step rows were not found');
        Assert(UUIDsEqual(byPerson!.UserID, ctx.User.ID) && UUIDsEqual(byServer!.UserID, ctx.User.ID), 'TGS6: the Human steps are not assigned to the submitter');

        byPerson!.Status = 'Complete';
        const savedByPerson = await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => byPerson!.Save());
        Assert(savedByPerson, `TGS6: the person's completion was refused: ${byPerson!.LatestResult?.CompleteMessage ?? ''}`);
        byServer!.Status = 'Complete';
        Assert(await byServer!.Save(), `TGS6: the server-code completion was refused: ${byServer!.LatestResult?.CompleteMessage ?? ''}`);

        let settledParent: MJTaskEntity | null = null;
        for (const deadline = Date.now() + 30_000; Date.now() < deadline && !settledParent;) {
            await settle(200);
            const p = await loadTask(ctx, parentID);
            if (p.Status === 'Complete' || p.Status === 'Failed' || p.Status === 'Cancelled' || p.Status === 'Blocked') {
                settledParent = p;
            }
        }
        Assert(settledParent != null, `TGS6: graph ${parentID} did not settle within 30s`);
        AssertEqual(settledParent!.Status, 'Complete', 'TGS6: parent graph status');

        const completer = (t: MJTaskEntity | undefined): unknown =>
            (JSON.parse(t?.Configuration ?? '{}') as { runtime?: { completedByUserID?: string } }).runtime?.completedByUserID;
        const settled = await childByName();
        Assert(UUIDsEqual(completer(settled.get(BY_PERSON)) as string, ctx.User.ID), "TGS6: the person's completion was not recorded as theirs");
        AssertEqual(completer(settled.get(BY_SERVER)), undefined, 'TGS6: a completer was recorded for the server-code completion');
        AssertEqual(ranTainted.get(AFTER_PERSON), false, "TGS6: the step after the person's review ran tainted");
        AssertEqual(ranTainted.get(AFTER_SERVER), true, 'TGS6: the step after the server-code completion ran clean');
    } finally {
        await dispatcher.Stop();
        cleanupFailures = await DeleteTaskGraph(ctx.Provider, ctx.User, parentID).catch((e: unknown) => [String(e)]);
    }
    Assert(cleanupFailures.length === 0, `TGS6: cleanup left rows behind: ${cleanupFailures.join('; ')}`);
}

export const TaskGraphSecurityChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.TGS1`, Name: 'TGS1: every row of a submitted graph carries its envelope, and the envelope cannot be edited', Fn: checkEnvelopeOnEveryRowAndImmutable, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS2`, Name: 'TGS2: of two concurrent compensation rows for one forward step, exactly one lands', Fn: checkOneCompensationPerForwardStep, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS3`, Name: 'TGS3: the A2A task store refuses task-graph steps and files A2A tasks under their own type', Fn: checkA2AStoreSeesOnlyA2ARows, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS4`, Name: 'TGS4: a tainted graph through the real dispatcher is gated on taint at a Decision-downstream action, failing the graph and triggering saga compensation', Fn: checkDispatcherTaintGateAndCompensation, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS5`, Name: "TGS5: MJServer's real TaskGraphActionRunner refuses a disallowWhenTainted action on a tainted graph before it runs", Fn: checkRealRunnerRefusesTaintedEgress, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS6`, Name: "TGS6: the submitter's own review of a Human step clears taint, and server code completing one clears nothing", Fn: checkPersonsReviewClearsTaint, RequiresMutation: true },
];

for (const check of TaskGraphSecurityChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
