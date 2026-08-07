/**
 * task-graph-orchestration.checks.ts — the 'task-graph-orchestration' bundle: live integration
 * checks for the task-graph substrate delivered by the unified workflow DAG engine program
 * (plan: PR #3456).
 *
 * **Phase 1 scope is deliberately narrow.** The behavioral checks that would exercise submission
 * — cycle rejection, unknown-agent rejection, payloads landing in columns — need to drive the
 * orchestrator, which in Phase 1 still lives inside MJServer as `TaskOrchestrator`. Reaching it
 * from here would mean exporting it from MJServer and taking a dependency on the whole server
 * package, both of which Phase 2 immediately undoes: per the plan's §3.2 the submission API moves
 * to `@memberjunction/task-graph` (`TaskGraphService`), and per D6 the useful parts of
 * `TaskOrchestrator` carry over there. Those checks therefore land in Phase 2 against the new
 * package's public API — which is their correct target anyway, since that is where server-side
 * submission validation lives.
 *
 * What Phase 1 CAN verify without that coupling is that the schema it added is genuinely present
 * and usable through the entity layer. That is not a tautology: the columns can exist in the
 * database while being absent from generated metadata, which is exactly what happens when the
 * migration lands without CodeGen being re-run — a silent failure that breaks every consumer of
 * the typed properties.
 *
 *   - TG1: the six Phase 1 Task columns exist in entity metadata
 *   - TG2: they round-trip through BaseEntity (write, reload, read back)
 *   - TG3: AIAgentRunStep.StepType accepts the new 'TaskGraph' value
 *
 * Deterministic — no model calls. TG2 creates one task and the bundle Teardown removes it.
 */
import { Metadata, RunView } from '@memberjunction/core';
import { MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Columns added by the Phase 1 migration. */
const PHASE1_TASK_FIELDS = [
    'InputPayload',
    'OutputPayload',
    'ErrorMessage',
    'AgentRunID',
    'ClaimedBy',
    'ClaimExpiresAt',
] as const;

const TASK_NAME = 'mj-integration-test-task-graph-columns (safe to delete)';
const CREATED_TASK_IDS: string[] = [];
const CREATED_TASK_TYPE_IDS: string[] = [];

/** Resolves a TaskType, creating a disposable one if the install has none. */
async function resolveTaskTypeID(ctx: IntegrationCheckContext): Promise<string> {
    const existing = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Task Types', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const found = existing.Results?.[0]?.ID;
    if (found) return found;

    const tt = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
    tt.NewRecord();
    tt.Name = 'mj-integration-test-task-type (safe to delete)';
    tt.Description = 'Created by the task-graph-orchestration integration bundle.';
    const saved = await tt.Save();
    Assert(saved, `could not create a TaskType fixture: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED_TASK_TYPE_IDS.push(tt.ID);
    return tt.ID;
}

export const TaskGraphOrchestrationChecks: NamedCheck[] = [
    {
        Id: 'task-graph-orchestration.TG1',
        Name: 'TG1: the six Phase 1 Task columns are present in entity metadata',
        Fn: async (_ctx: IntegrationCheckContext) => {
            // Guards the migration-ran-but-CodeGen-did-not failure mode: the columns exist in SQL
            // while the generated entity has no idea, so every typed consumer breaks silently.
            const entity = new Metadata().EntityByName('MJ: Tasks');
            Assert(!!entity, 'MJ: Tasks entity not found in metadata');

            const missing = PHASE1_TASK_FIELDS.filter(f => !entity!.Fields.some(ef => ef.Name === f));
            Assert(
                missing.length === 0,
                `MJ: Tasks is missing Phase 1 field(s): ${missing.join(', ')} — did CodeGen run after the migration?`,
            );
            console.log(`      → all ${PHASE1_TASK_FIELDS.length} Phase 1 columns present in metadata`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG2',
        Name: 'TG2: the Phase 1 payload/claim columns round-trip through the entity layer',
        Fn: async (ctx: IntegrationCheckContext) => {
            const envRes = await new RunView().RunView<{ ID: string }>(
                { EntityName: 'MJ: Environments', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
            );
            const environmentID = envRes.Results?.[0]?.ID;
            Assert(!!environmentID, 'could not resolve an Environment');

            const task = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
            task.NewRecord();
            task.Name = TASK_NAME;
            task.TypeID = await resolveTaskTypeID(ctx);
            task.EnvironmentID = environmentID!;
            task.Status = 'Pending';
            task.InputPayload = JSON.stringify({ integrationCheck: true, marker: 'TG2' });
            task.OutputPayload = JSON.stringify({ rows: 42 });
            task.ErrorMessage = 'TG2 write check';
            task.ClaimedBy = 'integration-check-instance';

            const saved = await task.Save();
            Assert(saved, `writing the Phase 1 columns failed: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            CREATED_TASK_IDS.push(task.ID);

            await settle(250);
            const reread = await new RunView().RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${task.ID}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const row = reread.Results?.[0];
            Assert(!!row, 'task did not reload');

            AssertEqual(
                (JSON.parse(row!.InputPayload!) as { marker?: string }).marker, 'TG2',
                'InputPayload round-trips',
            );
            AssertEqual(
                (JSON.parse(row!.OutputPayload!) as { rows?: number }).rows, 42,
                'OutputPayload round-trips',
            );
            AssertEqual(row!.ErrorMessage, 'TG2 write check', 'ErrorMessage round-trips');
            AssertEqual(row!.ClaimedBy, 'integration-check-instance', 'ClaimedBy round-trips');
            console.log(`      → payload/claim columns round-tripped on task ${row!.ID}`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG3',
        Name: "TG3: AIAgentRunStep.StepType accepts the new 'TaskGraph' value",
        Fn: async (_ctx: IntegrationCheckContext) => {
            // The value list is CodeGen-derived from the CHECK constraint, so its presence proves
            // the drop-and-re-add in the migration was picked up rather than silently skipped.
            const entity = new Metadata().EntityByName('MJ: AI Agent Run Steps');
            Assert(!!entity, 'MJ: AI Agent Run Steps entity not found in metadata');

            const stepType = entity!.Fields.find(f => f.Name === 'StepType');
            Assert(!!stepType, 'StepType field not found');

            const values = (stepType!.EntityFieldValues ?? []).map(v => v.Value);
            Assert(
                values.includes('TaskGraph'),
                `StepType value list does not include 'TaskGraph' (has: ${values.join(', ')})`,
            );
            console.log("      → StepType value list includes 'TaskGraph'");
        }
    },
];

for (const check of TaskGraphOrchestrationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('task-graph-orchestration', {
    // Nothing to build up front — TG1/TG3 are metadata assertions and TG2 creates its own row.
    Setup: async () => { /* no shared fixture */ },
    Teardown: async (ctx: IntegrationCheckContext) => {
        for (const id of CREATED_TASK_IDS) {
            const res = await new RunView().RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const row = res.Results?.[0];
            if (row) await row.Delete();
        }
        CREATED_TASK_IDS.length = 0;

        // Only removes a TaskType this bundle created; a pre-existing one is left alone.
        for (const id of CREATED_TASK_TYPE_IDS) {
            const res = await new RunView().RunView<MJTaskTypeEntity>(
                { EntityName: 'MJ: Task Types', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const row = res.Results?.[0];
            if (row) await row.Delete();
        }
        CREATED_TASK_TYPE_IDS.length = 0;
    },
});
