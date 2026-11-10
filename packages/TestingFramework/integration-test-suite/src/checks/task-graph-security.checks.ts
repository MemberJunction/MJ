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
 *   the graph runs as, and server code acting as the submitter can neither complete a Human step nor rewrite what
 *   the graph trusts (see {@link checkPersonsReviewClearsTaint}).
 * - TGS7: the same through the step's request: only the dispatcher raises one, the submitter's own answer clears
 *   taint, and server code's answer settles the step but clears nothing (see {@link checkServerAnsweredRequestClearsNothing}).
 * - TGS8: a step completed outside the dispatcher before the fetch feeding it has finished leaves its next step
 *   tainted (see {@link checkEarlySettleClearsNothing}).
 * - TGS9: only the task-graph service creates a workflow, adds a step to one, or changes its edges; ordinary tasks are
 *   unaffected (see {@link checkOnlyTheServiceMakesWorkflows}).
 * - TGS10: the REST entity handler, which validates before it saves, renames an ordinary subtask and still cannot rename
 *   a workflow step or create a workflow (see {@link checkRestEditsOrdinaryTasks}).
 *
 * Fixtures: one start-paused Human-only graph (so no dispatcher picks it up) and the rows the checks
 * create, all removed in teardown, rows that reference another first.
 *
 * @module @memberjunction/integration-test-suite
 */
import { randomUUID } from 'crypto';
import { RunView, ServerOperationScopeManager, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { MJAIAgentRequestEntity, MJAIAgentRunEntity, MJEnvironmentEntityExtended, MJTaskDependencyEntity, MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import {
    ParseTaskSecurityEnvelope,
    TAINTED_EGRESS_BLOCKED,
    TASK_GRAPH_RUNTIME_SECURITY_OPERATION,
    TASK_GRAPH_WORKFLOW_TYPE_NAME,
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
// MJAPI's REST entity handler, by its own entry for the same reason.
import { EntityCRUDHandler } from '@memberjunction/server/rest-entity-crud';
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
        // A workflow's edges are the task-graph service's (`MJTaskDependencyEntityServer`): removed as it would.
        for (const dep of deps.Results ?? []) await AsTaskGraphService(ctx.User, 'MJ: Task Dependencies', () => dep.Delete()).catch(() => false);
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

    // An ordinary edit: a due date, not what the step is or carries (those are the dispatcher's, TGS6).
    const other = await loadTask(ctx, f.ChildIDs[0]);
    other.DueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
    // Staged as the dispatcher's saga stages them: only the task-graph service and dispatcher add a step to a workflow.
    const saved = await Promise.all(rows.map((r) => AsTaskGraphService(ctx.User, 'MJ: Tasks', () => r.Save())));
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
 * Deletes a submitted graph: its dependency rows and the requests on its steps, its children, then the workflow task. Returns what could
 * not be deleted, so the check fails instead of leaking rows. A child that another child undoes
 * (`CompensatesTaskID`) is deleted after the row undoing it — an escalation before its compensation, a
 * compensation before its forward step — because the foreign key refuses the other order.
 */
/**
 * Runs `write` in the task-graph runtime-security scope for `entityName`, bound to `user`: how a fixture stages or
 * removes what only the task-graph service and dispatcher write (a workflow's steps and edges).
 */
export function AsTaskGraphService<T>(user: UserInfo, entityName: 'MJ: Tasks' | 'MJ: Task Dependencies', write: () => Promise<T>): Promise<T> {
    return ServerOperationScopeManager.Instance.RunWithAuthority(
        { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: [entityName], userId: user.ID },
        write,
    );
}

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
            // A workflow's edges are the task-graph service's: removed as it would remove them.
            if (!(await AsTaskGraphService(user, 'MJ: Task Dependencies', () => deleted(dep)))) failures.push(`dependency ${dep.ID}: ${dep.LatestResult?.CompleteMessage ?? 'not deleted'}`);
        }
        // Requests raised for (or answering) a step reference it, so they go before it.
        const requests = await rv.RunView<MJAIAgentRequestEntity>(
            { EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingTaskID IN (${remaining.map((t) => `'${t.ID}'`).join(',')})`, ResultType: 'entity_object', BypassCache: true },
            user,
        );
        if (!requests.Success) failures.push(`could not list the workflow's requests: ${requests.ErrorMessage ?? ''}`);
        for (const request of requests.Results ?? []) {
            if (!(await deleted(request))) failures.push(`request ${request.ID}: ${request.LatestResult?.CompleteMessage ?? 'not deleted'}`);
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

/** The steps of TGS6's and TGS7's graph, by name. */
const REVIEW = {
    Fetch: 'it165 review fetch',
    ByPerson: 'it165 reviewed by a person',
    ByServer: 'it165 completed by server code',
    AfterPerson: 'it165 send after the person',
    AfterServer: 'it165 send after server code',
} as const;

/** What a review graph left behind: its steps by name, and whether each later action step ran tainted. */
interface ReviewGraphRun {
    ParentStatus: string;
    Steps: Map<string, MJTaskEntity>;
    RanTainted: Map<string, boolean>;
}

/**
 * Runs TGS6's and TGS7's graph through the real dispatcher. A real graph assigns every Human step to its submitter,
 * who is also the user its agents and actions run as, so who completed a step cannot tell a person from code; where
 * the completion came from must. A tainted fetch fans out to two Human steps, both assigned to the submitter
 * (`ctx.User`, also this dispatcher's user), each feeding an action step whose stub runner records the envelope it
 * was handed. Once the fetch completes, `complete` settles {@link REVIEW.ByPerson} the way a person does and tries
 * {@link REVIEW.ByServer} the way server code would. With `AgentRunID` the graph has a submitting run, so the
 * dispatcher raises a request for each Human step. The run then waits for the graph to settle (with `PersonOnly`, for
 * the step after the person's) and returns what it left behind, removing the graph (and any request rows on its steps)
 * before it returns.
 */
async function runReviewGraph(
    ctx: IntegrationCheckContext,
    check: string,
    complete: (byPerson: MJTaskEntity, byServer: MJTaskEntity) => Promise<void>,
    options: { AgentRunID?: string; PersonOnly?: boolean } = {},
): Promise<ReviewGraphRun> {
    const actionsResult = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
        { EntityName: 'MJ: Actions', Fields: ['Name'], MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    Assert(actionsResult.Success && (actionsResult.Results?.length ?? 0) === 1, `${check}: failed to query an action from MJ: Actions`);
    const actionName = actionsResult.Results![0].Name;
    const step = (tempId: string, name: string, kind: 'Action' | 'Human', dependsOn: string[]) => ({
        tempId, name, description: 'fixture', kind, dependsOn,
        configuration: kind === 'Action' ? { actionName } : { instructions: 'fixture' },
    });

    const submitted = await new TaskGraphService().Submit(
        {
            workflowName: `it165-${check}-review-${Date.now()} (mj-integration-test — safe to delete)`,
            continuation: 'none',
            tasks: [
                step('fetch', REVIEW.Fetch, 'Action', []),
                step('byPerson', REVIEW.ByPerson, 'Human', ['fetch']),
                step('byServer', REVIEW.ByServer, 'Human', ['fetch']),
                step('afterPerson', REVIEW.AfterPerson, 'Action', ['byPerson']),
                step('afterServer', REVIEW.AfterServer, 'Action', ['byServer']),
            ],
        } as TaskGraphSpec,
        {
            EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
            Provider: ctx.Provider,
            ContextUser: ctx.User,
            SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false },
            AgentRunID: options.AgentRunID ?? null,
            Debug: { paused: false },
        },
    );
    Assert(submitted.Success && !!submitted.ParentTaskID, `${check}: failed to submit graph: ${submitted.ErrorMessage ?? ''}`);
    const parentID = submitted.ParentTaskID!;

    const ranTainted = new Map<string, boolean>();
    const actionRunner: TaskActionRunner = {
        EnforcesSecurityEnvelope: true,
        RunActionForTask: async (params: TaskActionRunParams): Promise<TaskActionRunResult> => {
            const task = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', params.ContextUser);
            await task.Load(params.TaskID);
            if (task.Name === REVIEW.Fetch) {
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
            InstanceID: `it165-${check}-${randomUUID().slice(0, 8)}`,
            PollIntervalSeconds: 0.1,
            ClaimTTLSeconds: 300,
            ReconciliationIntervalSeconds: 3600,
            MaxConcurrentTasks: 4,
        },
        undefined,
        undefined,
        actionRunner,
    );

    const stepsByName = async (): Promise<Map<string, MJTaskEntity>> => {
        const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        return new Map((rows.Results ?? []).map((t) => [t.Name, t]));
    };

    let run: ReviewGraphRun | undefined;
    let cleanupFailures: string[] = [];
    try {
        await dispatcher.Start();
        let fetchDone = false;
        for (const deadline = Date.now() + 30_000; Date.now() < deadline && !fetchDone;) {
            await settle(200);
            fetchDone = (await stepsByName()).get(REVIEW.Fetch)?.Status === 'Complete';
        }
        Assert(fetchDone, `${check}: the fetch step of graph ${parentID} did not complete within 30s`);

        const steps = await stepsByName();
        const byPerson = steps.get(REVIEW.ByPerson);
        const byServer = steps.get(REVIEW.ByServer);
        Assert(byPerson != null && byServer != null, `${check}: the Human step rows were not found`);
        Assert(UUIDsEqual(byPerson!.UserID, ctx.User.ID) && UUIDsEqual(byServer!.UserID, ctx.User.ID), `${check}: the Human steps are not assigned to the submitter`);
        await complete(byPerson!, byServer!);

        let parentStatus: string | undefined;
        for (const deadline = Date.now() + 30_000; Date.now() < deadline && !parentStatus;) {
            await settle(200);
            const p = await loadTask(ctx, parentID);
            if (p.Status === 'Complete' || p.Status === 'Failed' || p.Status === 'Cancelled' || p.Status === 'Blocked') {
                parentStatus = p.Status;
            } else if (options.PersonOnly && ranTainted.has(REVIEW.AfterPerson)) {
                // Only the person's branch can finish: server code could not complete the other step.
                parentStatus = p.Status;
            }
        }
        Assert(parentStatus != null, `${check}: graph ${parentID} did not ${options.PersonOnly ? 'run the step after the person' : 'settle'} within 30s`);
        run = { ParentStatus: parentStatus!, Steps: await stepsByName(), RanTainted: ranTainted };
    } finally {
        await dispatcher.Stop();
        cleanupFailures = await DeleteTaskGraph(ctx.Provider, ctx.User, parentID).catch((e: unknown) => [String(e)]);
    }
    Assert(cleanupFailures.length === 0, `${check}: cleanup left rows behind: ${cleanupFailures.join('; ')}`);
    return run!;
}

/** TGS6's and TGS7's shared verdict: the person's review cleared taint, and server code's completion cleared nothing. */
function assertReviewOutcome(run: ReviewGraphRun, ctx: IntegrationCheckContext, check: string): void {
    const completer = (t: MJTaskEntity | undefined): unknown =>
        (JSON.parse(t?.Configuration ?? '{}') as { runtime?: { completedByUserID?: string } }).runtime?.completedByUserID;
    AssertEqual(run.ParentStatus, 'Complete', `${check}: parent graph status`);
    AssertEqual(run.Steps.get(REVIEW.ByPerson)?.Status, 'Complete', `${check}: the person's Human step status`);
    AssertEqual(run.Steps.get(REVIEW.ByServer)?.Status, 'Complete', `${check}: the server-code Human step status`);
    Assert(UUIDsEqual(completer(run.Steps.get(REVIEW.ByPerson)) as string, ctx.User.ID), `${check}: the person's completion was not recorded as theirs`);
    AssertEqual(completer(run.Steps.get(REVIEW.ByServer)), undefined, `${check}: a completer was recorded for the server-code completion`);
    AssertEqual(run.RanTainted.get(REVIEW.AfterPerson), false, `${check}: the step after the person's review ran tainted`);
    AssertEqual(run.RanTainted.get(REVIEW.AfterServer), true, `${check}: the step after the server-code completion ran clean`);
}

/** Asserts `row`'s save is refused, for the reason `because` names (a fragment of the refusal message). */
async function assertRefused(row: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, because: string, what: string): Promise<void> {
    Assert(!(await row.Save()), `${what} was saved`);
    const message = row.LatestResult?.CompleteMessage ?? '';
    Assert(message.includes(because), `${what} was refused for another reason: ${message}`);
}

/**
 * TGS6 — completing the Human step itself. The person's way is a save of the step inside a client CRUD boundary (as
 * `ResolverBase` wraps the Tasks UI's save), and clears taint: the step after it runs clean. Server code acting as the
 * submitter (an agent run calling Update Record, a plain server-side save as the same user) can do nothing to the graph
 * that would change what it trusts: not complete the other Human step, fill in the person's answer, reassign their step,
 * rewrite or rerun the fetch that already ran, or rewrite who the workflow runs as. TGS5 proves the real runner refuses
 * a gated action given a tainted envelope, so the clean envelope is what lets a gated action run after a review.
 */
async function checkPersonsReviewClearsTaint(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }
    const steps = 'of a workflow step cannot be changed';
    const run = await runReviewGraph(ctx, 'TGS6', async (byPerson, byServer) => {
        const completeByServer = await loadTask(ctx, byServer.ID);
        completeByServer.Status = 'Complete';
        await assertRefused(completeByServer, steps, 'TGS6: server code completing a Human step');

        const prefill = await loadTask(ctx, byPerson.ID);
        prefill.OutputPayload = JSON.stringify({ BCC: 'it165-attacker@example.com' });
        await assertRefused(prefill, steps, "TGS6: server code's answer filled in on the person's Human step");

        const reassign = await loadTask(ctx, byPerson.ID);
        reassign.UserID = null;
        await assertRefused(reassign, steps, "TGS6: server code reassigning the person's Human step");

        const fetchID = (await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${byPerson.ParentID}' AND Name='${REVIEW.Fetch}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
            ctx.User,
        )).Results?.[0]?.ID;
        Assert(fetchID != null, 'TGS6: the fetch step row was not found');
        const rewrite = await loadTask(ctx, fetchID!);
        rewrite.OutputPayload = JSON.stringify({ page: 'rewritten by server code' });
        await assertRefused(rewrite, steps, "TGS6: server code's rewrite of the fetch step's output");
        const rerun = await loadTask(ctx, fetchID!);
        rerun.Status = 'Pending';
        await assertRefused(rerun, steps, 'TGS6: server code putting the completed fetch back to Pending');

        const workflow = await loadTask(ctx, byPerson.ParentID!);
        workflow.InputPayload = JSON.stringify({ ...JSON.parse(workflow.InputPayload ?? '{}'), invocation: { data: { To: 'it165-attacker@example.com' } } });
        await assertRefused(workflow, 'of a workflow cannot be changed', "TGS6: server code's rewrite of the workflow's metadata");

        byPerson.Status = 'Complete';
        const savedByPerson = await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => byPerson.Save());
        Assert(savedByPerson, `TGS6: the person's completion was refused: ${byPerson.LatestResult?.CompleteMessage ?? ''}`);
    }, { PersonOnly: true });

    const completer = (JSON.parse(run.Steps.get(REVIEW.ByPerson)?.Configuration ?? '{}') as { runtime?: { completedByUserID?: string } }).runtime?.completedByUserID;
    Assert(UUIDsEqual(completer, ctx.User.ID), "TGS6: the person's completion was not recorded as theirs");
    AssertEqual(run.RanTainted.get(REVIEW.AfterPerson), false, "TGS6: the step after the person's review ran tainted");
    AssertEqual(run.Steps.get(REVIEW.ByServer)?.Status, 'Pending', 'TGS6: the Human step server code tried to complete');
    Assert(!run.RanTainted.has(REVIEW.AfterServer), 'TGS6: the step after the Human step server code tried to complete ran');
}

/**
 * TGS7 — answering the step's request instead. The graph has a submitting run, so the dispatcher raises a request
 * for each Human step, and only the dispatcher may: server code acting as the submitter cannot create a request for
 * a step already `Approved` (the review's reproduction), nor point an answer the person gave elsewhere at the step.
 * The person answers their step's raised request through a client CRUD boundary (as the dashboard's save is);
 * server code answers the other's with a plain server-side save, as an agent run calling Update Record would. Server
 * code's answer still settles its step, but records no responder, so the step clears nothing.
 */
async function checkServerAnsweredRequestClearsNothing(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }
    const agents = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    Assert(agents.Success && (agents.Results?.length ?? 0) === 1, 'TGS7: failed to query an agent from MJ: AI Agents');
    const agentID = agents.Results![0].ID;
    const submittingRun = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
    submittingRun.NewRecord();
    submittingRun.AgentID = agentID;
    submittingRun.Status = 'Paused';
    submittingRun.StartedAt = new Date();
    Assert(await submittingRun.Save(), `TGS7: could not create the submitting run: ${submittingRun.LatestResult?.CompleteMessage ?? ''}`);

    const newRequest = async (fields: Partial<MJAIAgentRequestEntity>): Promise<MJAIAgentRequestEntity> => {
        const request = await ctx.Provider.GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', ctx.User);
        request.NewRecord();
        request.AgentID = agentID;
        request.RequestForUserID = ctx.User.ID;
        request.Request = 'it165 TGS7 fixture request';
        request.RequestedAt = new Date();
        request.SetMany(fields);
        return request;
    };
    const raisedRequestFor = async (step: MJTaskEntity): Promise<MJAIAgentRequestEntity | undefined> => {
        for (const deadline = Date.now() + 30_000; Date.now() < deadline;) {
            const open = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentRequestEntity>(
                { EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingTaskID='${step.ID}' AND Status='Requested'`, ResultType: 'entity_object', BypassCache: true },
                ctx.User,
            );
            if (open.Results?.length) return open.Results[0];
            await settle(200);
        }
        return undefined;
    };

    const responders: Record<string, string | null> = {};
    let elsewhere: MJAIAgentRequestEntity | undefined;
    try {
        const run = await runReviewGraph(ctx, 'TGS7', async (byPerson, byServer) => {
            // The review's reproduction: created already Approved, naming the step. Refused outright now.
            const forged = await newRequest({ OriginatingTaskID: byServer.ID, Status: 'Approved' });
            await assertRefused(forged, 'Only the task-graph dispatcher raises a request', 'TGS7: an Approved request server code created for a workflow step');

            // An answer the person gave to something else, pointed at the step afterwards. Refused.
            // Created answered in one save, so it wakes no agent; the person's own request, so it records them.
            elsewhere = await newRequest({ Status: 'Approved' });
            Assert(await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => elsewhere!.Save()), `TGS7: could not create the person's unrelated answer: ${elsewhere.LatestResult?.CompleteMessage ?? ''}`);
            Assert(UUIDsEqual(elsewhere.ResponseByUserID ?? undefined, ctx.User.ID), "TGS7: the person's unrelated answer did not record them");
            elsewhere.OriginatingTaskID = byServer.ID;
            await assertRefused(elsewhere, 'OriginatingTaskID cannot change', "TGS7: the person's other answer, pointed at a workflow step by server code");

            const personal = await raisedRequestFor(byPerson);
            const serverSide = await raisedRequestFor(byServer);
            Assert(personal != null && serverSide != null, 'TGS7: the dispatcher did not raise a request for each Human step within 30s');
            // Server code cannot fill in the answer the person's approval would then carry into the step's output.
            const prefill = (await raisedRequestFor(byPerson))!;
            prefill.ResponseData = JSON.stringify({ BCC: 'it165-attacker@example.com' });
            await assertRefused(prefill, 'only from the save that answers it', "TGS7: server code's answer filled in on the person's request");
            personal!.Status = 'Approved';
            Assert(await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => personal!.Save()), `TGS7: the person's answer was refused: ${personal!.LatestResult?.CompleteMessage ?? ''}`);
            serverSide!.Status = 'Approved';
            Assert(await serverSide!.Save(), `TGS7: the server-code answer was refused: ${serverSide!.LatestResult?.CompleteMessage ?? ''}`);
            responders.person = personal!.ResponseByUserID;
            responders.server = serverSide!.ResponseByUserID;
        }, { AgentRunID: submittingRun.ID });
        Assert(UUIDsEqual(responders.person ?? undefined, ctx.User.ID), "TGS7: the person's answer did not record them as the responder");
        AssertEqual(responders.server, null, 'TGS7: a responder was recorded for the server-code answer');
        assertReviewOutcome(run, ctx, 'TGS7');
    } finally {
        if (elsewhere?.IsSaved) await elsewhere.Delete().catch(() => false);
        await submittingRun.Delete().catch(() => false);
    }
}

/**
 * TGS8 — a step completed outside the dispatcher before what feeds it has finished. The fetch is held running while the
 * step after it is force-completed through the debugger's verb (a guarded write that records no taint). The step after
 * that must run tainted: a step `Complete` with nothing recorded is nobody's vouched-for result, so the taint walk does
 * not look past it to the unfinished fetch and read that as clean.
 */
async function checkEarlySettleClearsNothing(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }
    const actions = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
        { EntityName: 'MJ: Actions', Fields: ['Name'], MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    Assert(actions.Success && (actions.Results?.length ?? 0) === 1, 'TGS8: failed to query an action from MJ: Actions');
    const actionName = actions.Results![0].Name;
    const step = (tempId: string, dependsOn: string[]) => ({
        tempId, name: `it165 early ${tempId}`, description: 'fixture', kind: 'Action' as const, configuration: { actionName }, dependsOn,
    });
    const context = { EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID, ConversationDetailID: null, Provider: ctx.Provider, ContextUser: ctx.User };
    const submitted = await new TaskGraphService().Submit(
        { workflowName: `it165-TGS8-early-${Date.now()} (mj-integration-test — safe to delete)`, continuation: 'none', tasks: [step('fetch', []), step('relay', ['fetch']), step('send', ['relay'])] } as TaskGraphSpec,
        { ...context, SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false }, Debug: { paused: false } },
    );
    Assert(submitted.Success && !!submitted.ParentTaskID, `TGS8: failed to submit graph: ${submitted.ErrorMessage ?? ''}`);
    const parentID = submitted.ParentTaskID!;

    let releaseFetch: () => void = () => undefined;
    const fetchHeld = new Promise<void>((resolve) => { releaseFetch = resolve; });
    let sendRanTainted: boolean | undefined;
    const dispatcher = new TaskGraphDispatcher(
        providerFactory(ctx),
        new NoopAgentRunner(),
        ctx.User as UserInfo,
        { InstanceID: `it165-TGS8-${randomUUID().slice(0, 8)}`, PollIntervalSeconds: 0.1, ClaimTTLSeconds: 300, ReconciliationIntervalSeconds: 3600, MaxConcurrentTasks: 4 },
        undefined,
        undefined,
        {
            EnforcesSecurityEnvelope: true,
            RunActionForTask: async (params: TaskActionRunParams): Promise<TaskActionRunResult> => {
                const task = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', params.ContextUser);
                await task.Load(params.TaskID);
                if (task.Name === 'it165 early fetch') {
                    await fetchHeld;
                    return { Success: true, Output: { page: 'untrusted-data' }, IsOutputTainted: true };
                }
                if (task.Name === 'it165 early send') sendRanTainted = params.SecurityEnvelope?.IsRunTainted === true;
                return { Success: true, Output: {} };
            },
        },
    );
    const statusOf = async (name: string): Promise<string | undefined> => (await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Status: string }>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}' AND Name='${name}'`, Fields: ['Status'], ResultType: 'simple', BypassCache: true },
        ctx.User,
    )).Results?.[0]?.Status;

    let cleanupFailures: string[] = [];
    try {
        await dispatcher.Start();
        let fetchRunning = false;
        for (const deadline = Date.now() + 30_000; Date.now() < deadline && !fetchRunning;) {
            await settle(200);
            fetchRunning = (await statusOf('it165 early fetch')) === 'In Progress';
        }
        Assert(fetchRunning, 'TGS8: the fetch did not start within 30s');
        const relayID = (await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}' AND Name='it165 early relay'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
            ctx.User,
        )).Results?.[0]?.ID;
        Assert(relayID != null, 'TGS8: the relay step row was not found');
        const forced = await new TaskGraphService().ForceCompleteTask(relayID!, { forwarded: 'by hand' }, context);
        Assert(forced.Success, `TGS8: the relay step could not be force-completed: ${forced.ErrorMessage ?? ''}`);

        for (const deadline = Date.now() + 30_000; Date.now() < deadline && sendRanTainted === undefined;) {
            await settle(200);
        }
        Assert(sendRanTainted !== undefined, 'TGS8: the step after the forced one did not run while the fetch was held');
        AssertEqual(await statusOf('it165 early fetch'), 'In Progress', 'TGS8: the fetch finished before the step after the forced one ran');
        AssertEqual(sendRanTainted, true, 'TGS8: the step after a step completed outside the dispatcher ran clean');
    } finally {
        releaseFetch();
        await dispatcher.Stop();
        cleanupFailures = await DeleteTaskGraph(ctx.Provider, ctx.User, parentID).catch((e: unknown) => [String(e)]);
    }
    Assert(cleanupFailures.length === 0, `TGS8: cleanup left rows behind: ${cleanupFailures.join('; ')}`);
}

/**
 * TGS9 — only the task-graph service creates a workflow, adds a step to one, or changes its edges. A workflow's steps
 * run as the user its metadata names, so an ordinary save as the submitter (an agent run calling Create Record or
 * Update Record) must not be able to make one: not a new workflow, not a step under a real one (with a `StepType` or
 * without), not a workflow-typed task under an ordinary one, not an ordinary task retyped into a workflow, and not an
 * edge added to or removed from a real one. Ordinary
 * tasks, and subtasks under them, still save as before.
 */
async function checkOnlyTheServiceMakesWorkflows(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const actions = await rv.RunView<{ ID: string; Name: string }>({ EntityName: 'MJ: Actions', Fields: ['ID', 'Name'], MaxRows: 1, ResultType: 'simple' }, ctx.User);
    Assert(actions.Success && (actions.Results?.length ?? 0) === 1, 'TGS9: failed to query an action from MJ: Actions');
    const action = actions.Results![0];
    const types = await rv.RunView<{ ID: string; Name: string }>({ EntityName: 'MJ: Task Types', Fields: ['ID', 'Name'], ResultType: 'simple' }, ctx.User);
    const workflowType = types.Results?.find((t) => t.Name === TASK_GRAPH_WORKFLOW_TYPE_NAME);
    const otherType = types.Results?.find((t) => t.Name !== TASK_GRAPH_WORKFLOW_TYPE_NAME);
    Assert(workflowType != null && otherType != null, 'TGS9: needs the workflow task type and one other');

    const submitted = await new TaskGraphService().Submit(
        {
            workflowName: `it165-TGS9-${Date.now()} (mj-integration-test — safe to delete)`,
            continuation: 'none',
            tasks: [
                { tempId: 'fetch', name: 'it165 TGS9 fetch', description: 'fixture', kind: 'Action', configuration: { actionName: action.Name }, dependsOn: [] },
                { tempId: 'send', name: 'it165 TGS9 send', description: 'fixture', kind: 'Action', configuration: { actionName: action.Name }, dependsOn: ['fetch'] },
            ],
        } as TaskGraphSpec,
        {
            EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
            Provider: ctx.Provider,
            ContextUser: ctx.User,
            SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false },
            Debug: { paused: true },
        },
    );
    Assert(submitted.Success && !!submitted.ParentTaskID, `TGS9: the service could not submit a graph: ${submitted.ErrorMessage ?? ''}`);
    const parentID = submitted.ParentTaskID!;

    const newTask = async (fields: Partial<MJTaskEntity>): Promise<MJTaskEntity> => {
        const task = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
        task.NewRecord();
        task.Name = 'it165 TGS9 fixture';
        task.EnvironmentID = MJEnvironmentEntityExtended.DefaultEnvironmentID;
        task.Status = 'Pending';
        task.SetMany(fields);
        return task;
    };
    const ordinaryRows: MJTaskEntity[] = [];
    const creates = 'Only the task-graph service creates a workflow';
    let cleanupFailures: string[] = [];
    try {
        const forgedWorkflow = await newTask({
            TypeID: workflowType!.ID, Status: 'In Progress',
            InputPayload: JSON.stringify({ continuation: 'none', reinvokeDepth: 0, failureSemantics: 'block', submittedByUserID: ctx.User.ID, submittedByAgentRunID: null }),
        });
        await assertRefused(forgedWorkflow, creates, 'TGS9: a workflow created by an ordinary save');
        await assertRefused(await newTask({ TypeID: workflowType!.ID, ParentID: parentID, StepType: 'Action', ActionID: action.ID }), creates, 'TGS9: a step added to a real workflow by an ordinary save');
        await assertRefused(await newTask({ TypeID: workflowType!.ID, ParentID: parentID }), creates, 'TGS9: a task without a StepType added under a real workflow');

        const ordinary = await newTask({ TypeID: otherType!.ID });
        Assert(await ordinary.Save(), `TGS9: an ordinary task was refused: ${ordinary.LatestResult?.CompleteMessage ?? ''}`);
        ordinaryRows.push(ordinary);
        const subtask = await newTask({ TypeID: otherType!.ID, ParentID: ordinary.ID });
        Assert(await subtask.Save(), `TGS9: an ordinary subtask was refused: ${subtask.LatestResult?.CompleteMessage ?? ''}`);
        ordinaryRows.unshift(subtask);
        // Filed under the workflow type, under an ordinary task: the dispatcher finds graphs by their steps' type.
        await assertRefused(await newTask({ TypeID: workflowType!.ID, ParentID: ordinary.ID, ActionID: action.ID }), creates, 'TGS9: a workflow-typed task added under an ordinary task');
        ordinary.TypeID = workflowType!.ID;
        ordinary.Status = 'In Progress';
        await assertRefused(ordinary, creates, 'TGS9: an ordinary task retyped into a workflow');

        const children = await rv.RunView<{ ID: string; Name: string }>({ EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, Fields: ['ID', 'Name'], ResultType: 'simple', BypassCache: true }, ctx.User);
        const fetchID = children.Results?.find((c) => c.Name === 'it165 TGS9 fetch')?.ID;
        const sendID = children.Results?.find((c) => c.Name === 'it165 TGS9 send')?.ID;
        Assert(fetchID != null && sendID != null, 'TGS9: the submitted steps were not found');
        const edges = await rv.RunView<MJTaskDependencyEntity>({ EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID='${sendID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User);
        const edge = edges.Results?.[0];
        Assert(edge != null, "TGS9: the send step's edge was not found");
        const edges_ = "dependencies are written only by the task-graph service";
        Assert(!(await edge!.Delete()), "TGS9: an ordinary delete removed the edge into the send step");
        Assert((edge!.LatestResult?.CompleteMessage ?? '').includes(edges_), `TGS9: the edge delete was refused for another reason: ${edge!.LatestResult?.CompleteMessage ?? ''}`);
        const added = await ctx.Provider.GetEntityObject<MJTaskDependencyEntity>('MJ: Task Dependencies', ctx.User);
        added.NewRecord();
        added.TaskID = fetchID!;
        added.DependsOnTaskID = sendID!;
        added.DependencyType = 'Prerequisite';
        await assertRefused(added, edges_, 'TGS9: an edge added to a workflow by an ordinary save');
    } finally {
        for (const row of ordinaryRows) await row.Delete().catch(() => false);
        cleanupFailures = await DeleteTaskGraph(ctx.Provider, ctx.User, parentID).catch((e: unknown) => [String(e)]);
    }
    Assert(cleanupFailures.length === 0, `TGS9: cleanup left rows behind: ${cleanupFailures.join('; ')}`);
}

/**
 * TGS10 — the REST entity handler (`EntityCRUDHandler`, what MJAPI's `/api/v1/entities` routes run) validates a row
 * before it saves it. The workflow checks judge a row with facts the save resolves, so that early validation must not
 * mistake an ordinary subtask for a workflow step: renaming one over REST saves. The same handler still cannot rename
 * a real workflow step or create a workflow.
 */
async function checkRestEditsOrdinaryTasks(ctx: IntegrationCheckContext): Promise<void> {
    if (!MutationTierOn(ctx)) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
        return;
    }
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const types = await rv.RunView<{ ID: string; Name: string }>({ EntityName: 'MJ: Task Types', Fields: ['ID', 'Name'], ResultType: 'simple' }, ctx.User);
    const workflowType = types.Results?.find((t) => t.Name === TASK_GRAPH_WORKFLOW_TYPE_NAME);
    const otherType = types.Results?.find((t) => t.Name !== TASK_GRAPH_WORKFLOW_TYPE_NAME);
    Assert(workflowType != null && otherType != null, 'TGS10: needs the workflow task type and one other');
    const actions = await rv.RunView<{ Name: string }>({ EntityName: 'MJ: Actions', Fields: ['Name'], MaxRows: 1, ResultType: 'simple' }, ctx.User);
    Assert(actions.Success && (actions.Results?.length ?? 0) === 1, 'TGS10: failed to query an action from MJ: Actions');
    const environmentID = MJEnvironmentEntityExtended.DefaultEnvironmentID;
    const text = (outcome: unknown): string => JSON.stringify(outcome);

    const ordinaryRows: MJTaskEntity[] = [];
    let parentID: string | undefined;
    let cleanupFailures: string[] = [];
    try {
        for (const parent of [null, 'child'] as const) {
            const task = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
            task.NewRecord();
            task.Name = `it165 TGS10 ordinary ${parent ?? 'parent'}`;
            task.TypeID = otherType!.ID;
            task.EnvironmentID = environmentID;
            task.Status = 'Pending';
            if (parent) task.ParentID = ordinaryRows[0].ID;
            Assert(await task.Save(), `TGS10: an ordinary task was refused: ${task.LatestResult?.CompleteMessage ?? ''}`);
            ordinaryRows.unshift(task);
        }
        const subtaskID = ordinaryRows[0].ID;
        const renamed = await EntityCRUDHandler.UpdateEntity('MJ: Tasks', subtaskID, { Name: 'it165 TGS10 renamed over REST' }, ctx.User);
        Assert(renamed.success, `TGS10: REST could not rename an ordinary subtask: ${text(renamed)}`);
        AssertEqual((await loadTask(ctx, subtaskID)).Name, 'it165 TGS10 renamed over REST', 'TGS10: the subtask name after the REST rename');

        const submitted = await new TaskGraphService().Submit(
            {
                workflowName: `it165-TGS10-${Date.now()} (mj-integration-test — safe to delete)`,
                continuation: 'none',
                tasks: [{ tempId: 'only', name: 'it165 TGS10 step', description: 'fixture', kind: 'Action', configuration: { actionName: actions.Results![0].Name }, dependsOn: [] }],
            } as TaskGraphSpec,
            { EnvironmentID: environmentID, Provider: ctx.Provider, ContextUser: ctx.User, SecurityEnvelope: { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false }, Debug: { paused: true } },
        );
        Assert(submitted.Success && !!submitted.ParentTaskID, `TGS10: the service could not submit a graph: ${submitted.ErrorMessage ?? ''}`);
        parentID = submitted.ParentTaskID!;
        const stepID = (await rv.RunView<{ ID: string }>({ EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, ctx.User)).Results?.[0]?.ID;
        Assert(stepID != null, 'TGS10: the submitted step was not found');
        const stepRenamed = await EntityCRUDHandler.UpdateEntity('MJ: Tasks', stepID!, { Name: 'it165 TGS10 step renamed over REST' }, ctx.User);
        Assert(!stepRenamed.success && text(stepRenamed).includes('of a workflow step cannot be changed'), `TGS10: REST renamed a workflow step, or was refused for another reason: ${text(stepRenamed)}`);

        const forged = await EntityCRUDHandler.CreateEntity('MJ: Tasks', { Name: 'it165 TGS10 forged workflow', TypeID: workflowType!.ID, EnvironmentID: environmentID, Status: 'In Progress' }, ctx.User);
        const forgedID = (forged.entity as { ID?: string } | undefined)?.ID;
        if (forgedID) ordinaryRows.push(await loadTask(ctx, forgedID));
        Assert(!forged.success && text(forged).includes('Only the task-graph service creates a workflow'), `TGS10: REST created a workflow, or was refused for another reason: ${text(forged)}`);
    } finally {
        for (const row of ordinaryRows) await row.Delete().catch(() => false);
        if (parentID) cleanupFailures = await DeleteTaskGraph(ctx.Provider, ctx.User, parentID).catch((e: unknown) => [String(e)]);
    }
    Assert(cleanupFailures.length === 0, `TGS10: cleanup left rows behind: ${cleanupFailures.join('; ')}`);
}

export const TaskGraphSecurityChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.TGS1`, Name: 'TGS1: every row of a submitted graph carries its envelope, and the envelope cannot be edited', Fn: checkEnvelopeOnEveryRowAndImmutable, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS2`, Name: 'TGS2: of two concurrent compensation rows for one forward step, exactly one lands', Fn: checkOneCompensationPerForwardStep, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS3`, Name: 'TGS3: the A2A task store refuses task-graph steps and files A2A tasks under their own type', Fn: checkA2AStoreSeesOnlyA2ARows, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS4`, Name: 'TGS4: a tainted graph through the real dispatcher is gated on taint at a Decision-downstream action, failing the graph and triggering saga compensation', Fn: checkDispatcherTaintGateAndCompensation, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS5`, Name: "TGS5: MJServer's real TaskGraphActionRunner refuses a disallowWhenTainted action on a tainted graph before it runs", Fn: checkRealRunnerRefusesTaintedEgress, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS6`, Name: "TGS6: the submitter's own review of a Human step clears taint, and server code can neither complete one nor rewrite what the graph trusts", Fn: checkPersonsReviewClearsTaint, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS7`, Name: "TGS7: only the dispatcher raises a workflow step's request; the submitter's own answer clears taint, and server code's answer settles the step but clears nothing", Fn: checkServerAnsweredRequestClearsNothing, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS8`, Name: "TGS8: a step completed outside the dispatcher before what feeds it has finished leaves its next step tainted", Fn: checkEarlySettleClearsNothing, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS9`, Name: 'TGS9: only the task-graph service creates a workflow, adds a step to one, or changes its edges', Fn: checkOnlyTheServiceMakesWorkflows, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS10`, Name: "TGS10: REST renames an ordinary subtask, and still cannot rename a workflow step or create a workflow", Fn: checkRestEditsOrdinaryTasks, RequiresMutation: true },
];

for (const check of TaskGraphSecurityChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
