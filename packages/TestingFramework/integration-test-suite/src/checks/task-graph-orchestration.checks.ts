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
import type { TaskGraphSpec, WorkflowSpec } from '@memberjunction/ai-core-plus';
import { MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { EXECUTE_AGENT_ACTION, LoadTaskGraphOperations, LoadWorkflowOperations, RUN_WORKFLOW_JOB_TYPE, TaskGraphService, WorkflowSpecSync, type WorkflowAgentWriter } from '@memberjunction/task-graph';
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

/** The workflow-authoring control plane, as Remote Operation keys. */
const WORKFLOW_OPERATION_KEYS = ['Workflow.Save', 'Workflow.Validate'] as const;

/** Must match HUMAN_TASK_NOTIFICATION_TYPE in TaskGraphDispatcher. */
const HUMAN_TASK_NOTIFICATION_TYPE = 'Task Assignment';

const TASK_NAME = 'mj-integration-test-task-graph-columns (safe to delete)';
const CREATED_TASK_IDS: string[] = [];
const CREATED_TASK_TYPE_IDS: string[] = [];
/** Parent tasks created by the submission checks; torn down FK-safe (edges -> children -> parent). */
const CREATED_PARENT_IDS: string[] = [];
/** Agents and entity-action rows created by the workflow check; torn down FK-safe. */
const CREATED_WORKFLOW_AGENT_IDS: string[] = [];
const CREATED_ENTITY_ACTION_IDS: string[] = [];

/**
 * Stands in for the host's `AgentSpecSync`-backed writer.
 *
 * The check is about the TRIGGER binding, not about agent persistence — which AgentSpecSync already
 * covers. Using a stub keeps the assertion pointed at the thing that broke, and keeps the check from
 * creating a full agent record it would then have to unwind.
 */
class IntegrationAgentWriter implements WorkflowAgentWriter {
    constructor(private readonly fixedID: string = '11111111-2222-3333-4444-555555555555') {}
    public async PersistFlowAgent(): Promise<string> {
        return this.fixedID;
    }
}

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
    {
        Id: 'task-graph-orchestration.TG11',
        Name: 'TG11: the workflow-authoring Remote Operations are published and implemented',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Closes the "agents cannot schedule anything" hole: an agent can now author a workflow —
            // steps AND triggers — in one typed call. Same two failure modes TG7 guards for the
            // task-graph operations: a metadata row that was never pushed (unreachable), and a
            // subclass that never registers (routing resolves to the contract-only base and every
            // call succeeds at the transport while doing nothing).
            const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ OperationKey: string; Status: string }>(
                {
                    EntityName: 'MJ: Remote Operations',
                    ExtraFilter: `OperationKey LIKE 'Workflow.%'`,
                    Fields: ['OperationKey', 'Status'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(rows.Success, `could not read MJ: Remote Operations: ${rows.ErrorMessage}`);
            const published = new Map((rows.Results ?? []).map((r) => [r.OperationKey, r.Status]));

            LoadWorkflowOperations();

            for (const key of WORKFLOW_OPERATION_KEYS) {
                Assert(published.has(key), `Remote Operation '${key}' has no metadata row — it is unreachable`);
                AssertEqual(published.get(key), 'Active', `Remote Operation '${key}' is not Active`);

                const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation>(
                    BaseRemotableOperation, key,
                );
                Assert(!!instance, `no class resolved for Remote Operation '${key}'`);
                AssertEqual(instance!.OperationKey, key, `resolved class reports the wrong OperationKey for '${key}'`);
                Assert(
                    instance!.constructor.name.endsWith('ServerOperation'),
                    `'${key}' resolved to '${instance!.constructor.name}' — the generated contract-only base won`,
                );
            }
            console.log(`      → ${WORKFLOW_OPERATION_KEYS.length} workflow operations published and implemented`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG12',
        Name: 'TG12: the Scheduled Job Type a workflow schedule reconciles against is seeded',
        Fn: async (ctx: IntegrationCheckContext) => {
            // WorkflowSpecSync creates NO new storage — a workflow's schedule is an ordinary
            // Scheduled Job of this type. Without the seed, saving a scheduled workflow throws at the
            // one moment the user is least able to interpret it.
            const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
                {
                    EntityName: 'MJ: Scheduled Job Types',
                    ExtraFilter: `Name='${RUN_WORKFLOW_JOB_TYPE}'`,
                    Fields: ['Name'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(rows.Success, `could not read MJ: Scheduled Job Types: ${rows.ErrorMessage}`);
            AssertEqual(
                rows.Results?.length ?? 0,
                1,
                `Scheduled Job Type '${RUN_WORKFLOW_JOB_TYPE}' is not seeded — scheduled workflows cannot be saved`,
            );
            console.log(`      → '${RUN_WORKFLOW_JOB_TYPE}' scheduled job type is seeded`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG13',
        Name: 'TG13: an entity-change trigger can bind — the Execute Agent params it needs exist',
        Fn: async (ctx: IntegrationCheckContext) => {
            // WorkflowSpecSync binds an entity-change trigger by writing Entity Action rows that
            // point at 'Execute Agent'. Entity-action INVOCATION was already wired (the save
            // pipeline fires it); what this covers is that the two parameters the binding needs are
            // actually seeded, because a missing one produces a trigger that fires and then either
            // cannot resolve the agent or hands it no record.
            const actionResult = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Actions',
                    ExtraFilter: `Name='${EXECUTE_AGENT_ACTION}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            const actionID = actionResult.Results?.[0]?.ID;
            Assert(!!actionID, `the '${EXECUTE_AGENT_ACTION}' action is not seeded — entity-change triggers cannot bind`);

            const params = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
                {
                    EntityName: 'MJ: Action Params',
                    ExtraFilter: `ActionID='${actionID}'`,
                    Fields: ['Name'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            const names = new Set((params.Results ?? []).map((p) => p.Name));

            Assert(names.has('AgentID'), "'Execute Agent' has no AgentID parameter — the trigger could not say which agent to run");
            // The one a reader is most likely to think optional. Without it the workflow runs on
            // every matching change knowing nothing about the record that caused it.
            Assert(names.has('Data'), "'Execute Agent' has no Data parameter — a triggered agent would receive no record");

            // And the ValueType the Data binding depends on must still be a legal value: a
            // BaseEntity serializes to {} (its fields are getters), so only 'Entity Object Data'
            // delivers the record's actual field values.
            const entity = ctx.Provider.EntityByName('MJ: Entity Action Params');
            Assert(!!entity, 'MJ: Entity Action Params entity not found in metadata');
            const valueType = entity!.Fields.find((f) => f.Name === 'ValueType');
            const allowed = (valueType?.EntityFieldValues ?? []).map((v) => v.Value);
            Assert(
                allowed.includes('Entity Object Data'),
                `ValueType no longer allows 'Entity Object Data' (has: ${allowed.join(', ')}) — triggered agents would get an empty record`,
            );
            Assert(allowed.includes('Static'), `ValueType no longer allows 'Static' — the agent binding would fail`);

            console.log('      → Execute Agent exposes AgentID + Data, and both ValueTypes are legal');
        }
    },
    {
        Id: 'task-graph-orchestration.TG14',
        Name: 'TG14: saving a workflow with an entity-change trigger writes the whole binding',
        // Mutation-class: this one actually SAVES, so it only fires under RUN_MUTATION_TESTS.
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The debt Phase 6 owed. TG13 asserts the binding's PREREQUISITES; nothing drove the
            // save-to-binding round trip, which is precisely how Phase 6 shipped a binding that set
            // which agent to run but never which record changed. The unit tests could not catch it —
            // they mock reconcileTriggers, so the path had never executed at all.
            const agentName = await resolveAgentName(ctx);
            const watched = 'MJ: Tasks'; // any real entity; Tasks is already in this bundle's world

            const spec: WorkflowSpec = {
                name: 'mj-integration-test-workflow (safe to delete)',
                status: 'Draft',
                graph: {
                    workflowName: 'mj-integration-test-workflow (safe to delete)',
                    tasks: [{ tempId: 'a', name: 'Handle change', description: 'handle it', agentName, dependsOn: [] }],
                },
                triggers: [{ type: 'EntityEvent', entityName: watched, invocationType: 'Update' }],
            };

            const result = await new WorkflowSpecSync(new IntegrationAgentWriter()).Persist(spec, {
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });
            Assert(result.Success, `workflow save failed: ${result.ErrorMessage}`);
            Assert(
                result.Unreconciled.length === 0,
                `the entity-change trigger did not bind: ${result.Unreconciled.join('; ')}`,
            );
            CREATED_WORKFLOW_AGENT_IDS.push(result.AgentID!);

            // 1. The EntityAction binding — which entity, which action.
            const entity = ctx.Provider.EntityByName(watched);
            const actionRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
                { EntityName: 'MJ: Actions', ExtraFilter: `Name='${EXECUTE_AGENT_ACTION}'`, Fields: ['ID'], ResultType: 'simple' },
                ctx.User,
            );
            const actionID = actionRes.Results?.[0]?.ID;
            const eaRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; Status: string }>(
                {
                    EntityName: 'MJ: Entity Actions',
                    // Unscoped binding — ScopeEntityID/ScopeRecordID stay null when the spec names
                    // no scope, which TG15 is the counterpart to.
                    ExtraFilter: `EntityID='${entity!.ID}' AND ActionID='${actionID}' AND ScopeEntityID IS NULL AND ScopeRecordID IS NULL`,
                    Fields: ['ID', 'Status'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            AssertEqual(eaRes.Results?.length ?? 0, 1, 'the EntityAction binding was written exactly once');
            AssertEqual(eaRes.Results![0].Status, 'Active', 'the EntityAction binding is Active');
            const entityActionID = eaRes.Results![0].ID;
            CREATED_ENTITY_ACTION_IDS.push(entityActionID);

            // 2. The invocation row — WHICH change fires it.
            const invRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Status: string }>(
                {
                    EntityName: 'MJ: Entity Action Invocations',
                    ExtraFilter: `EntityActionID='${entityActionID}'`,
                    Fields: ['Status'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            AssertEqual(invRes.Results?.length ?? 0, 1, 'the invocation binding was written');

            // 3. BOTH params. This is the assertion that would have caught the Phase 6 bug: the
            //    agent binding alone looks correct, and a triggered workflow would still run knowing
            //    nothing about the record that fired it.
            const paramRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ValueType: string; Value: string | null; ActionParam: string }>(
                {
                    EntityName: 'MJ: Entity Action Params',
                    ExtraFilter: `EntityActionID='${entityActionID}'`,
                    Fields: ['ValueType', 'Value', 'ActionParam'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            const byName = new Map((paramRes.Results ?? []).map((p) => [p.ActionParam, p]));

            const agentParam = byName.get('AgentID');
            Assert(!!agentParam, 'the AgentID parameter was not bound — the trigger could not resolve an agent');
            AssertEqual(agentParam!.ValueType, 'Static', 'AgentID binds as a Static value');
            AssertEqual(agentParam!.Value, result.AgentID, 'AgentID points at the workflow’s agent');

            const dataParam = byName.get('Data');
            Assert(!!dataParam, 'the Data parameter was not bound — a triggered agent would receive NO record');
            AssertEqual(
                dataParam!.ValueType,
                'Entity Object Data',
                'Data must bind as Entity Object Data — a BaseEntity serializes to {} because its fields are getters',
            );

            // 4. Idempotent: saving again must not duplicate or detach a live trigger.
            const again = await new WorkflowSpecSync(new IntegrationAgentWriter(result.AgentID)).Persist(spec, {
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });
            Assert(again.Success, `second save failed: ${again.ErrorMessage}`);
            const eaAfter = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Entity Actions',
                    ExtraFilter: `EntityID='${entity!.ID}' AND ActionID='${actionID}' AND ScopeEntityID IS NULL AND ScopeRecordID IS NULL`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            AssertEqual(eaAfter.Results?.length ?? 0, 1, 're-saving a workflow must not duplicate its binding');

            console.log('      → entity-change trigger bound: EntityAction + invocation + AgentID/Static + Data/Entity Object Data');
        }
    },

    {
        Id: 'task-graph-orchestration.TG15',
        Name: 'TG15: a scoped entity-change trigger actually narrows the binding',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // Phase 6 accepted scopeEntityName/scopeRecordID and then referenced neither, so a
            // workflow the author scoped to ONE record fired on EVERY record of the entity — the
            // same species as the "which record changed" bug, and equally invisible from the UI.
            // The columns and the engine's scope resolver already existed; only the wiring did not.
            //
            // A different entity from TG14 on purpose: one binding per (entity, action) is a
            // database constraint, so sharing an entity would make this a test of TG16's rule.
            const agentName = await resolveAgentName(ctx);
            const watched = 'MJ: Task Types';
            const scopedRecordID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

            const spec: WorkflowSpec = {
                name: 'mj-integration-test-scoped-workflow (safe to delete)',
                status: 'Draft',
                graph: {
                    workflowName: 'mj-integration-test-scoped-workflow (safe to delete)',
                    tasks: [{ tempId: 'a', name: 'Handle change', description: 'handle it', agentName, dependsOn: [] }],
                },
                triggers: [{
                    type: 'EntityEvent',
                    entityName: watched,
                    invocationType: 'Update',
                    scopeEntityName: watched,
                    scopeRecordID: scopedRecordID,
                }],
            };

            const result = await new WorkflowSpecSync(new IntegrationAgentWriter('22222222-3333-4444-5555-666666666666'))
                .Persist(spec, { ContextUser: ctx.User, Provider: ctx.Provider });
            Assert(result.Success, `scoped workflow save failed: ${result.ErrorMessage}`);
            Assert(result.Unreconciled.length === 0, `the scoped trigger did not bind: ${result.Unreconciled.join('; ')}`);
            CREATED_WORKFLOW_AGENT_IDS.push(result.AgentID!);

            const entity = ctx.Provider.EntityByName(watched);
            const eaRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; ScopeEntityID: string | null; ScopeRecordID: string | null }>(
                {
                    EntityName: 'MJ: Entity Actions',
                    ExtraFilter: `EntityID='${entity!.ID}'`,
                    Fields: ['ID', 'ScopeEntityID', 'ScopeRecordID'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            AssertEqual(eaRes.Results?.length ?? 0, 1, 'the scoped binding was written');
            CREATED_ENTITY_ACTION_IDS.push(eaRes.Results![0].ID);
            AssertEqual(
                (eaRes.Results![0].ScopeRecordID ?? '').toLowerCase(),
                scopedRecordID,
                'ScopeRecordID must be written — otherwise the binding watches every record of the entity',
            );
            Assert(
                UUIDsEqual(eaRes.Results![0].ScopeEntityID ?? '', entity!.ID),
                'ScopeEntityID must be set — without it the record ID alone is unresolvable',
            );

            console.log('      → scoped trigger bound to one record via ScopeEntityID/ScopeRecordID');
        }
    },

    {
        Id: 'task-graph-orchestration.TG16',
        Name: 'TG16: two workflows watching one entity keep their own bindings',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // 'Execute Agent' is ONE shared action, so every workflow watching a given entity would
            // land on the same (EntityID, ActionID) pair. Reusing that row means rewriting its
            // AgentID — silently repointing workflow A's trigger at workflow B's agent, leaving A
            // looking configured, still showing its trigger, and never running again.
            //
            // Writing a second row was briefly impossible: UQ_EntityAction_ActionID_EntityID, added
            // by the v5.37.x junction sweep, allowed one binding per (entity, action) — applied
            // outside that sweep's own stated scope of "pure junction tables with no other meaningful
            // data columns". V202608080100 drops it. This check is what proves the drop took effect
            // AND that ownership is matched on the agent rather than on entity + action alone.
            const agentName = await resolveAgentName(ctx);
            const watched = 'MJ: Task Dependencies'; // distinct from TG14/TG15 so the checks stay independent

            const build = (label: string): WorkflowSpec => ({
                name: `mj-integration-test-shared-entity-${label} (safe to delete)`,
                status: 'Draft',
                graph: {
                    workflowName: `mj-integration-test-shared-entity-${label} (safe to delete)`,
                    tasks: [{ tempId: 'a', name: 'Handle change', description: 'handle it', agentName, dependsOn: [] }],
                },
                triggers: [{ type: 'EntityEvent', entityName: watched, invocationType: 'Update' }],
            });

            const agentA = '33333333-4444-5555-6666-777777777777';
            const agentB = '44444444-5555-6666-7777-888888888888';

            for (const [label, agent] of [['a', agentA], ['b', agentB]] as const) {
                const saved = await new WorkflowSpecSync(new IntegrationAgentWriter(agent))
                    .Persist(build(label), { ContextUser: ctx.User, Provider: ctx.Provider });
                Assert(saved.Success, `workflow ${label} save failed: ${saved.ErrorMessage}`);
                Assert(saved.Unreconciled.length === 0, `workflow ${label} did not bind: ${saved.Unreconciled.join('; ')}`);
                CREATED_WORKFLOW_AGENT_IDS.push(saved.AgentID!);
            }

            const entity = ctx.Provider.EntityByName(watched);
            const eaRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Entity Actions',
                    ExtraFilter: `EntityID='${entity!.ID}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            const bindings = eaRes.Results ?? [];
            for (const b of bindings) CREATED_ENTITY_ACTION_IDS.push(b.ID);
            AssertEqual(bindings.length, 2, 'each workflow must own its own binding');

            // The decisive assertion: two bindings pointing at two DIFFERENT agents. One binding, or
            // two carrying the same agent, both mean the second save stole the first one's trigger.
            const paramRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Value: string | null }>(
                {
                    EntityName: 'MJ: Entity Action Params',
                    ExtraFilter: `ActionParam='AgentID' AND EntityActionID IN (${bindings.map((b) => `'${b.ID}'`).join(',')})`,
                    Fields: ['Value'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            const agents = (paramRes.Results ?? []).map((p) => (p.Value ?? '').toLowerCase()).sort();
            AssertEqual(agents.length, 2, 'both bindings carry an AgentID');
            Assert(agents[0] !== agents[1], 'the two bindings run the same agent — the second workflow overwrote the first');

            // Re-saving must still be idempotent now that duplicates are legal: the ownership lookup
            // has to find the workflow's OWN row rather than creating a third.
            const again = await new WorkflowSpecSync(new IntegrationAgentWriter(agentA))
                .Persist(build('a'), { ContextUser: ctx.User, Provider: ctx.Provider });
            Assert(again.Success, `re-save failed: ${again.ErrorMessage}`);
            const afterRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
                { EntityName: 'MJ: Entity Actions', ExtraFilter: `EntityID='${entity!.ID}'`, Fields: ['ID'], ResultType: 'simple' },
                ctx.User,
            );
            AssertEqual(afterRes.Results?.length ?? 0, 2, 're-saving a workflow must find its own binding, not add another');

            console.log('      → two workflows on one entity kept separate bindings and separate agents');
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

        // Entity-action bindings from TG14, FK-safe: params and invocations reference the
        // EntityAction, so they go first.
        for (const entityActionID of CREATED_ENTITY_ACTION_IDS) {
            for (const child of ['MJ: Entity Action Params', 'MJ: Entity Action Invocations']) {
                const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Delete: () => Promise<boolean> }>(
                    { EntityName: child, ExtraFilter: `EntityActionID='${entityActionID}'`, ResultType: 'entity_object' },
                    ctx.User,
                );
                for (const row of res.Results ?? []) await row.Delete();
            }
            const eaRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Delete: () => Promise<boolean> }>(
                { EntityName: 'MJ: Entity Actions', ExtraFilter: `ID='${entityActionID}'`, ResultType: 'entity_object' },
                ctx.User,
            );
            for (const row of eaRes.Results ?? []) await row.Delete();
        }
        CREATED_ENTITY_ACTION_IDS.length = 0;

        // Scheduled Jobs the workflow save may have created, matched by the same ownership marker
        // the reconciler writes — never by name, for the same reason the reconciler doesn't.
        for (const agentID of CREATED_WORKFLOW_AGENT_IDS) {
            const jobs = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Configuration: string | null; Delete: () => Promise<boolean> }>(
                { EntityName: 'MJ: Scheduled Jobs', ResultType: 'entity_object' },
                ctx.User,
            );
            for (const job of jobs.Results ?? []) {
                if (job.Configuration?.includes(agentID)) await job.Delete();
            }
        }
        CREATED_WORKFLOW_AGENT_IDS.length = 0;
    },
});
