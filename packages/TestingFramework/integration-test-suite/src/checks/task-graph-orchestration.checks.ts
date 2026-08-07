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
import { BaseRemotableOperation, RunView } from '@memberjunction/core';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { LoadTaskGraphOperations, TaskGraphService } from '@memberjunction/task-graph';
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

/** The task-graph control plane, as Remote Operation keys. Deliberately no `Pause` — see TG7. */
const TASK_GRAPH_OPERATION_KEYS = [
    'TaskGraph.Submit',
    'TaskGraph.Cancel',
    'TaskGraph.RetryTask',
    'TaskGraph.GetStatus',
] as const;

/**
 * The D3 launch opt-ins. Workflow Planner is on this list although the plan's own opt-in list omits
 * it — emitting task graphs is that agent's entire job, so leaving it gated would break it outright.
 */
const OPTED_IN_AGENTS = [
    'Sage',
    'Workflow Planner',
    'Query Builder',
    'Research Agent',
    'Research Report Writer',
    'Database Research Agent',
    'File Research Agent',
    'Web Research Agent',
] as const;

/** Must match HUMAN_TASK_NOTIFICATION_TYPE in TaskGraphDispatcher. */
const HUMAN_TASK_NOTIFICATION_TYPE = 'Task Assignment';

const TASK_NAME = 'mj-integration-test-task-graph-columns (safe to delete)';
const CREATED_TASK_IDS: string[] = [];
const CREATED_TASK_TYPE_IDS: string[] = [];
/** Parent tasks created by the submission checks; torn down FK-safe (edges -> children -> parent). */
const CREATED_PARENT_IDS: string[] = [];

/** Resolves a TaskType, creating a disposable one if the install has none. */
async function resolveTaskTypeID(ctx: IntegrationCheckContext): Promise<string> {
    const existing = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
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

/** Resolves any real agent name, so a graph can be well-formed without hardcoding one. */
async function resolveAgentName(ctx: IntegrationCheckContext): Promise<string> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['Name'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const name = res.Results?.[0]?.Name;
    Assert(!!name, 'Could not resolve an AI Agent for task-graph checks');
    return name!;
}

/** Counts parent tasks by name — used to prove a rejected graph persisted nothing. */
async function countTasksNamed(ctx: IntegrationCheckContext, name: string): Promise<number> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `Name='${name.replace(/'/g, "''")}'`, Fields: ['ID'], ResultType: 'simple' },
        ctx.User,
    );
    return res.Results?.length ?? 0;
}

/** Submission context bound to the check's provider + user. */
async function buildSubmitContext(ctx: IntegrationCheckContext) {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Environments', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const environmentID = res.Results?.[0]?.ID;
    Assert(!!environmentID, 'could not resolve an Environment');
    return { EnvironmentID: environmentID!, ConversationDetailID: null, ContextUser: ctx.User, Provider: ctx.Provider };
}

export const TaskGraphOrchestrationChecks: NamedCheck[] = [
    {
        Id: 'task-graph-orchestration.TG1',
        Name: 'TG1: the six Phase 1 Task columns are present in entity metadata',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Guards the migration-ran-but-CodeGen-did-not failure mode: the columns exist in SQL
            // while the generated entity has no idea, so every typed consumer breaks silently.
            const entity = ctx.Provider.EntityByName('MJ: Tasks');
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
            const envRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
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
            const reread = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
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
        Fn: async (ctx: IntegrationCheckContext) => {
            // The value list is CodeGen-derived from the CHECK constraint, so its presence proves
            // the drop-and-re-add in the migration was picked up rather than silently skipped.
            const entity = ctx.Provider.EntityByName('MJ: AI Agent Run Steps');
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
    {
        Id: 'task-graph-orchestration.TG4',
        Name: 'TG4: a cyclic graph is rejected by TaskGraphService and persists nothing',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Deferred from Phase 1 — it needed a submission API that did not exist yet. Before the
            // engine work, a cyclic graph persisted happily and then deadlocked silently: nothing
            // ever became eligible, the loop exited, and the parent was marked Complete.
            const workflowName = 'mj-integration-test-cyclic (safe to delete)';
            const spec: TaskGraphSpec = {
                workflowName,
                tasks: [
                    { tempId: 'a', name: 'A', description: 'A', agentName: await resolveAgentName(ctx), dependsOn: ['b'] },
                    { tempId: 'b', name: 'B', description: 'B', agentName: await resolveAgentName(ctx), dependsOn: ['a'] },
                ],
            };
            const result = await new TaskGraphService().Submit(spec, await buildSubmitContext(ctx));
            Assert(!result.Success, 'a cyclic graph must be rejected');
            Assert(/cycle/i.test(result.ErrorMessage ?? ''), `rejection should name the cycle, got: ${result.ErrorMessage}`);

            await settle(200);
            AssertEqual(await countTasksNamed(ctx, workflowName), 0, 'a rejected graph must persist no parent task');
            console.log('      \u2192 cyclic graph rejected before persistence');
        }
    },
    {
        Id: 'task-graph-orchestration.TG5',
        Name: 'TG5: a graph naming an unknown agent is rejected rather than executing with holes',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Previously the unresolvable task was logged and SKIPPED, so the graph ran missing a
            // step the caller had asked for — a silent partial execution.
            const workflowName = 'mj-integration-test-unknown-agent (safe to delete)';
            const spec: TaskGraphSpec = {
                workflowName,
                tasks: [
                    { tempId: 'a', name: 'A', description: 'A', agentName: await resolveAgentName(ctx), dependsOn: [] },
                    { tempId: 'b', name: 'B', description: 'B', agentName: 'ThisAgentDoesNotExist_MJCheck', dependsOn: [] },
                ],
            };
            const result = await new TaskGraphService().Submit(spec, await buildSubmitContext(ctx));
            Assert(!result.Success, 'a graph with an unknown agent must be rejected');
            Assert(
                (result.ErrorMessage ?? '').includes('ThisAgentDoesNotExist_MJCheck'),
                `rejection should name the unresolvable agent, got: ${result.ErrorMessage}`,
            );

            await settle(200);
            AssertEqual(await countTasksNamed(ctx, workflowName), 0, 'a rejected graph must persist no parent task');
            console.log('      \u2192 unknown-agent graph rejected before persistence');
        }
    },
    {
        Id: 'task-graph-orchestration.TG6',
        Name: 'TG6: a valid graph persists parent + children + edges, with inputs in InputPayload',
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const spec: TaskGraphSpec = {
                workflowName: 'mj-integration-test-valid-graph (safe to delete)',
                reasoning: 'integration check: happy path',
                tasks: [
                    { tempId: 'a', name: 'First', description: 'first', agentName, dependsOn: [], inputPayload: { marker: 'TG6' } },
                    { tempId: 'b', name: 'Second', description: 'second', agentName, dependsOn: ['a'] },
                ],
            };
            const result = await new TaskGraphService().Submit(spec, await buildSubmitContext(ctx));
            Assert(result.Success, `submission failed: ${result.ErrorMessage}`);
            Assert(!!result.ParentTaskID, 'no parent task ID returned');
            CREATED_PARENT_IDS.push(result.ParentTaskID!);

            await settle(300);
            const children = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${result.ParentTaskID}'`, ResultType: 'entity_object' }, ctx.User,
            );
            AssertEqual(children.Results?.length ?? 0, 2, 'both child tasks persisted');

            const first = children.Results!.find((c) => c.Name === 'First');
            Assert(!!first?.InputPayload, 'InputPayload was not stored as a column');
            AssertEqual((JSON.parse(first!.InputPayload!) as { marker?: string }).marker, 'TG6', 'InputPayload round-trips');
            Assert(!(first!.Description ?? '').includes('__TASK_METADATA__'), 'Description carries no legacy marker');

            const ids = children.Results!.map((c) => `'${c.ID}'`).join(',');
            const deps = await RunView.FromMetadataProvider(ctx.Provider).RunView(
                { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${ids})`, ResultType: 'simple' }, ctx.User,
            );
            AssertEqual(deps.Results?.length ?? 0, 1, 'the a->b dependency edge persisted');
            console.log(`      \u2192 graph persisted: parent ${result.ParentTaskID}, 2 tasks, 1 edge`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG7',
        Name: 'TG7: the four task-graph Remote Operations are published and backed by implementations',
        Fn: async (ctx: IntegrationCheckContext) => {
            // The control plane is Remote Operations, not bespoke resolvers, so that MCP callers,
            // Action wrappers and the UI all reach one registration. Two failure modes break that
            // and neither shows up in a build:
            //
            //   1. The metadata row is missing \u2014 the operation is unreachable by every caller,
            //      because routing resolves the key against `MJ: Remote Operations` first. This is
            //      what a forgotten `mj sync push` looks like.
            //   2. The row exists but the implementing subclass never registers \u2014 routing resolves
            //      to the CodeGen-emitted, contract-only base, whose InternalExecute does nothing.
            //      A key typo between the metadata row and `@RegisterClass` produces exactly this.
            const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ OperationKey: string; Status: string }>(
                {
                    EntityName: 'MJ: Remote Operations',
                    ExtraFilter: `OperationKey LIKE 'TaskGraph.%'`,
                    Fields: ['OperationKey', 'Status'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(rows.Success, `could not read MJ: Remote Operations: ${rows.ErrorMessage}`);
            const published = new Map((rows.Results ?? []).map((r) => [r.OperationKey, r.Status]));

            LoadTaskGraphOperations();

            for (const key of TASK_GRAPH_OPERATION_KEYS) {
                Assert(published.has(key), `Remote Operation '${key}' has no metadata row \u2014 it is unreachable`);
                AssertEqual(published.get(key), 'Active', `Remote Operation '${key}' is not Active`);

                const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation>(
                    BaseRemotableOperation, key,
                );
                Assert(!!instance, `no class resolved for Remote Operation '${key}'`);
                AssertEqual(instance!.OperationKey, key, `resolved class reports the wrong OperationKey for '${key}'`);
                Assert(
                    instance!.constructor.name.endsWith('ServerOperation'),
                    `'${key}' resolved to '${instance!.constructor.name}' \u2014 the generated contract-only base won, ` +
                    `so every call would succeed at the transport and do nothing`,
                );
            }
            console.log(`      → ${TASK_GRAPH_OPERATION_KEYS.length} task-graph operations published and implemented`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG8',
        Name: 'TG8: the launch opt-in agents carry enableTaskGraphs, and the Loop default stays OFF',
        Fn: async (ctx: IntegrationCheckContext) => {
            // The gate is metadata-driven, so it can be wrong in two directions and the build
            // catches neither. Opting an agent in but never pushing the metadata leaves it unable to
            // delegate at all (Sage's entire delegation path runs through 'Tasks'); leaving the Loop
            // TYPE default on would hand durable reach to every Loop agent in the install at once.
            const agents = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string; AgentTypePromptParams: string | null }>(
                {
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `Name IN (${OPTED_IN_AGENTS.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')})`,
                    Fields: ['Name', 'AgentTypePromptParams'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(agents.Success, `could not read MJ: AI Agents: ${agents.ErrorMessage}`);

            const byName = new Map((agents.Results ?? []).map((a) => [a.Name, a.AgentTypePromptParams]));
            for (const name of OPTED_IN_AGENTS) {
                Assert(byName.has(name), `agent '${name}' not found — was the metadata pushed?`);
                const raw = byName.get(name);
                Assert(!!raw, `agent '${name}' has no AgentTypePromptParams`);
                const params = JSON.parse(raw!) as { enableTaskGraphs?: unknown };
                AssertEqual(params.enableTaskGraphs, true, `agent '${name}' is not opted into task graphs`);
            }

            // And the type-level default must remain false, so opting in stays a deliberate act.
            const types = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ PromptParamsSchema: string | null }>(
                {
                    EntityName: 'MJ: AI Agent Types',
                    ExtraFilter: `Name='Loop'`,
                    Fields: ['PromptParamsSchema'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            const schemaRaw = types.Results?.[0]?.PromptParamsSchema;
            Assert(!!schemaRaw, 'the Loop agent type has no PromptParamsSchema');
            const schema = JSON.parse(schemaRaw!) as { properties?: { enableTaskGraphs?: { default?: unknown } } };
            const declared = schema.properties?.enableTaskGraphs;
            Assert(!!declared, 'PromptParamsSchema does not declare enableTaskGraphs');
            AssertEqual(declared!.default, false, 'the Loop enableTaskGraphs default must stay FALSE');

            console.log(`      → ${OPTED_IN_AGENTS.length} agents opted in; Loop type default is off`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG9',
        Name: 'TG9: TaskDependency.Condition exists and round-trips, so durable graphs can branch',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Conditional edges are what make a runtime task graph the same model as a design-time
            // flow. The column can exist in SQL while being absent from generated metadata — the
            // migration-ran-but-CodeGen-did-not failure — which would leave every typed consumer
            // silently writing nothing.
            const entity = ctx.Provider.EntityByName('MJ: Task Dependencies');
            Assert(!!entity, 'MJ: Task Dependencies entity not found in metadata');
            Assert(
                entity!.Fields.some((f) => f.Name === 'Condition'),
                'MJ: Task Dependencies is missing Condition — did CodeGen run after the Phase 4 migration?',
            );

            // And it must round-trip: a graph submitted with a conditional edge has to come back
            // carrying that condition, or the dispatcher evaluates nothing.
            const agentName = await resolveAgentName(ctx);
            const spec: TaskGraphSpec = {
                workflowName: 'mj-integration-test-conditional-edge (safe to delete)',
                tasks: [
                    { tempId: 'a', name: 'Check', description: 'check', agentName, dependsOn: [] },
                    {
                        tempId: 'b',
                        name: 'Escalate',
                        description: 'escalate',
                        agentName,
                        dependsOn: [{ tempId: 'a', condition: 'output.severity > 3' }],
                    },
                ],
            };
            const result = await new TaskGraphService().Submit(spec, await buildSubmitContext(ctx));
            Assert(result.Success, `conditional-edge submission failed: ${result.ErrorMessage}`);
            CREATED_PARENT_IDS.push(result.ParentTaskID!);

            await settle(300);
            const children = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${result.ParentTaskID}'`, ResultType: 'entity_object' },
                ctx.User,
            );
            const ids = (children.Results ?? []).map((c) => `'${c.ID}'`).join(',');
            const deps = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Condition: string | null }>(
                {
                    EntityName: 'MJ: Task Dependencies',
                    ExtraFilter: `TaskID IN (${ids})`,
                    Fields: ['Condition'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            AssertEqual(deps.Results?.length ?? 0, 1, 'the conditional edge persisted');
            AssertEqual(deps.Results![0].Condition, 'output.severity > 3', 'the condition round-tripped');
            console.log('      → conditional dependency edge persisted and round-tripped');
        }
    },
    {
        Id: 'task-graph-orchestration.TG10',
        Name: 'TG10: the Task Assignment notification type is seeded, so human tasks can be announced',
        Fn: async (ctx: IntegrationCheckContext) => {
            // A human task that nobody is told about stalls its whole graph, silently and
            // indefinitely — the dispatcher has no executor to claim it and no reason to log. The
            // notification is the only thing preventing that, and it needs a seeded type to send.
            const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
                {
                    EntityName: 'MJ: User Notification Types',
                    ExtraFilter: `Name='${HUMAN_TASK_NOTIFICATION_TYPE}'`,
                    Fields: ['Name'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(rows.Success, `could not read MJ: User Notification Types: ${rows.ErrorMessage}`);
            AssertEqual(
                rows.Results?.length ?? 0,
                1,
                `notification type '${HUMAN_TASK_NOTIFICATION_TYPE}' is not seeded — human tasks would stall unannounced`,
            );
            console.log(`      → '${HUMAN_TASK_NOTIFICATION_TYPE}' notification type is seeded`);
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
        // Submitted graphs first: dependency edges, then children, then the parent.
        for (const parentID of CREATED_PARENT_IDS) {
            const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const children = childRes.Results ?? [];
            if (children.length > 0) {
                const ids = children.map((c) => `'${c.ID}'`).join(',');
                const depRes = await RunView.FromMetadataProvider(ctx.Provider).RunView(
                    { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${ids})`, ResultType: 'entity_object' }, ctx.User,
                );
                for (const dep of (depRes.Results ?? []) as Array<{ Delete: () => Promise<boolean> }>) {
                    await dep.Delete();
                }
            }
            for (const child of children) await child.Delete();

            const parentRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${parentID}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const parent = parentRes.Results?.[0];
            if (parent) await parent.Delete();
        }
        CREATED_PARENT_IDS.length = 0;

        for (const id of CREATED_TASK_IDS) {
            const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const row = res.Results?.[0];
            if (row) await row.Delete();
        }
        CREATED_TASK_IDS.length = 0;

        // Only removes a TaskType this bundle created; a pre-existing one is left alone.
        for (const id of CREATED_TASK_TYPE_IDS) {
            const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskTypeEntity>(
                { EntityName: 'MJ: Task Types', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const row = res.Results?.[0];
            if (row) await row.Delete();
        }
        CREATED_TASK_TYPE_IDS.length = 0;
    },
});
