/**
 * @fileoverview IT165 — task-graph security envelopes, saga compensation claims and the A2A store's row
 * boundary, against a live database (deterministic, mutating, server transport).
 *
 * - TGS1: a submitted graph's parent and every child carry the submitting run's envelope in
 *   `Task.SecurityEnvelope`, and an edit to it on an existing row is refused (`MJTaskEntityServer`).
 * - TGS2: two compensation rows for one forward step cannot both exist — `CompensatesTaskID`'s unique
 *   index lets exactly one of two concurrent inserts land, which is what makes materializing a saga
 *   compensation a claim across dispatchers.
 * - TGS3: the durable A2A task store reads a task-graph step's ID as "not found" and will not write over
 *   or cancel it, while an A2A task saves under the `A2A Task` type and reads back.
 *
 * Fixtures: one start-paused Human-only graph (so no dispatcher picks it up) and the rows the checks
 * create, all removed in teardown, rows that reference another first.
 *
 * @module @memberjunction/integration-test-suite
 */
import { randomUUID } from 'crypto';
import { RunView } from '@memberjunction/core';
import { MJEnvironmentEntityExtended, MJTaskDependencyEntity, MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import {
    ParseTaskSecurityEnvelope,
    TASK_SECURITY_ENVELOPE_VERSION,
    type TaskGraphSpec,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import { TaskGraphService } from '@memberjunction/task-graph';
// The store's own entry: the package root also starts the A2A server's config load on import.
import { A2A_TASK_TYPE_NAME, DurableEntityA2ATaskStore, type Task } from '@memberjunction/a2aserver/task-store';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
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
    AssertEqual((await new DurableEntityA2ATaskStore().LoadTaskForUser(a2aID, ctx.User, ctx.Provider))?.id, a2aID, 'TGS3: the A2A task read back');
}

export const TaskGraphSecurityChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.TGS1`, Name: 'TGS1: every row of a submitted graph carries its envelope, and the envelope cannot be edited', Fn: checkEnvelopeOnEveryRowAndImmutable, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS2`, Name: 'TGS2: of two concurrent compensation rows for one forward step, exactly one lands', Fn: checkOneCompensationPerForwardStep, RequiresMutation: true },
    { Id: `${BUNDLE}.TGS3`, Name: 'TGS3: the A2A task store refuses task-graph steps and files A2A tasks under their own type', Fn: checkA2AStoreSeesOnlyA2ARows, RequiresMutation: true },
];

for (const check of TaskGraphSecurityChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
