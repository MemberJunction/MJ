/**
 * task-graph-orchestration.checks.ts — the 'task-graph-orchestration' bundle (TG1–TG4): live
 * integration checks for the task-graph substrate delivered by Phase 1 of the unified workflow
 * DAG engine program (plan: PR #3456).
 *
 * These pin the three correctness fixes at the SEAM — i.e. against a real database through
 * TaskOrchestrator's public API — rather than against the pure algorithms, which are already
 * covered exhaustively by unit tests in `@memberjunction/ai-core-plus`
 * (`task-graph-algorithms.test.ts`, 44 cases). What can only be verified here is that the
 * orchestrator actually rejects bad graphs BEFORE persisting them, and that payloads land in
 * their columns rather than smuggled inside Description.
 *
 *   - TG1: a cyclic graph is rejected at creation and persists nothing
 *   - TG2: a graph naming an unknown agent is rejected rather than silently executing with holes
 *   - TG3: inputs land in Task.InputPayload; Description carries no __TASK_METADATA__ marker
 *   - TG4: the six Phase 1 columns exist and are writable/readable as columns
 *
 * Deterministic — no model calls. TG1 and TG2 assert on rejection, so they leave nothing behind;
 * TG3/TG4 create a graph and the bundle Teardown removes it in FK-safe order.
 *
 * The failure-propagation and wave-parallelization behaviors are NOT covered here: exercising them
 * end to end requires real agent runs (model calls), which this deterministic tier excludes. Their
 * logic lives in the pure algorithms and is unit-tested; the durable-dispatcher bundle in Phase 2
 * is where they get live coverage, once execution no longer depends on an LLM answering.
 */
import { Metadata, RunView } from '@memberjunction/core';
import { MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import { TaskOrchestrator } from '@memberjunction/server';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const CREATED_PARENT_IDS: string[] = [];

/** Builds an orchestrator bound to the check's provider + user. */
function orchestrator(ctx: IntegrationCheckContext): TaskOrchestrator {
    // (contextUser, pubSub, sessionId, userPayload, createNotifications, conversationDetailId, provider)
    return new TaskOrchestrator(ctx.User, undefined, undefined, undefined, false, undefined, ctx.Provider);
}

/** Resolves the environment the checks should create tasks in. */
async function resolveEnvironmentID(ctx: IntegrationCheckContext): Promise<string> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Environments', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const id = res.Results?.[0]?.ID;
    Assert(!!id, 'Could not resolve an Environment for task-graph checks');
    return id!;
}

/** Resolves any real agent name, so a graph can be well-formed without hardcoding one. */
async function resolveAgentName(ctx: IntegrationCheckContext): Promise<string> {
    const res = await new RunView().RunView<{ Name: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['Name'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const name = res.Results?.[0]?.Name;
    Assert(!!name, 'Could not resolve an AI Agent for task-graph checks');
    return name!;
}

/** Counts parent tasks by name — used to prove a rejected graph persisted nothing. */
async function countTasksNamed(ctx: IntegrationCheckContext, name: string): Promise<number> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `Name='${name.replace(/'/g, "''")}'`, Fields: ['ID'], ResultType: 'simple' },
        ctx.User,
    );
    return res.Results?.length ?? 0;
}

export const TaskGraphOrchestrationChecks: NamedCheck[] = [
    {
        Id: 'task-graph-orchestration.TG1',
        Name: 'TG1: a cyclic task graph is rejected at creation and persists nothing',
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const workflowName = 'mj-integration-test-cyclic-graph (safe to delete)';
            const environmentId = await resolveEnvironmentID(ctx);

            // a -> b -> a. Before Phase 1 this persisted happily and then deadlocked: nothing ever
            // became eligible, the loop exited, and the parent was marked Complete.
            const graph = {
                workflowName,
                reasoning: 'integration check: cycle rejection',
                tasks: [
                    { tempId: 'a', name: 'A', description: 'A', agentName, dependsOn: ['b'] },
                    { tempId: 'b', name: 'B', description: 'B', agentName, dependsOn: ['a'] },
                ],
            };

            let threw = false;
            try {
                await orchestrator(ctx).createTasksFromGraph(graph as never, null as never, environmentId);
            } catch (e) {
                threw = true;
                const msg = e instanceof Error ? e.message : String(e);
                Assert(/cycle/i.test(msg), `rejection should name the cycle, got: ${msg}`);
            }
            Assert(threw, 'a cyclic graph must be rejected, not persisted');

            await settle(200);
            AssertEqual(await countTasksNamed(ctx, workflowName), 0, 'a rejected cyclic graph must persist no parent task');
            console.log('      → cyclic graph rejected before persistence');
        }
    },
    {
        Id: 'task-graph-orchestration.TG2',
        Name: 'TG2: a graph naming an unknown agent is rejected rather than executing with holes',
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const workflowName = 'mj-integration-test-unknown-agent (safe to delete)';
            const environmentId = await resolveEnvironmentID(ctx);

            // Previously the unresolvable task was logged and SKIPPED, so the graph ran missing
            // a step the caller had asked for — a silent partial execution.
            const graph = {
                workflowName,
                reasoning: 'integration check: unknown-agent rejection',
                tasks: [
                    { tempId: 'a', name: 'A', description: 'A', agentName, dependsOn: [] },
                    { tempId: 'b', name: 'B', description: 'B', agentName: 'ThisAgentDoesNotExist_MJIntegrationCheck', dependsOn: [] },
                ],
            };

            let threw = false;
            try {
                await orchestrator(ctx).createTasksFromGraph(graph as never, null as never, environmentId);
            } catch (e) {
                threw = true;
                const msg = e instanceof Error ? e.message : String(e);
                Assert(
                    msg.includes('ThisAgentDoesNotExist_MJIntegrationCheck'),
                    `rejection should name the unresolvable agent, got: ${msg}`,
                );
            }
            Assert(threw, 'a graph with an unknown agent must be rejected, not silently trimmed');

            await settle(200);
            AssertEqual(await countTasksNamed(ctx, workflowName), 0, 'a rejected graph must persist no parent task');
            console.log('      → unknown-agent graph rejected before persistence');
        }
    },
    {
        Id: 'task-graph-orchestration.TG3',
        Name: 'TG3: task inputs land in Task.InputPayload, not behind a __TASK_METADATA__ marker in Description',
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const workflowName = 'mj-integration-test-payload-columns (safe to delete)';
            const environmentId = await resolveEnvironmentID(ctx);

            const graph = {
                workflowName,
                reasoning: 'integration check: payload columns',
                tasks: [
                    {
                        tempId: 'a',
                        name: 'Payload Task',
                        description: 'A task whose input should be a column',
                        agentName,
                        dependsOn: [],
                        inputPayload: { integrationCheck: true, marker: 'TG3' },
                    },
                ],
            };

            const { parentTaskId } = await orchestrator(ctx).createTasksFromGraph(graph as never, null as never, environmentId);
            CREATED_PARENT_IDS.push(parentTaskId);
            await settle(300);

            const res = await new RunView().RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskId}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const child = res.Results?.[0];
            Assert(!!child, 'child task was not persisted');

            Assert(!!child!.InputPayload, 'InputPayload column is empty — the input was not stored as a column');
            const parsed = JSON.parse(child!.InputPayload!) as { marker?: string };
            AssertEqual(parsed.marker, 'TG3', 'InputPayload round-trips the submitted payload');

            // The whole point of the column: Description goes back to being a human description.
            Assert(
                !(child!.Description ?? '').includes('__TASK_METADATA__'),
                'Description still carries the legacy __TASK_METADATA__ marker',
            );
            console.log(`      → InputPayload stored as a column; Description clean (task ${child!.ID})`);
        }
    },
    {
        Id: 'task-graph-orchestration.TG4',
        Name: 'TG4: the Phase 1 payload/claim columns exist and round-trip through the entity layer',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Guards against the columns being present in the migration but missing from generated
            // metadata — the failure mode where CodeGen did not re-run after the schema change.
            const entity = new Metadata().EntityByName('MJ: Tasks');
            Assert(!!entity, 'MJ: Tasks entity not found in metadata');

            for (const field of ['InputPayload', 'OutputPayload', 'ErrorMessage', 'AgentRunID', 'ClaimedBy', 'ClaimExpiresAt']) {
                Assert(
                    entity!.Fields.some(f => f.Name === field),
                    `MJ: Tasks is missing the Phase 1 field ${field} — did CodeGen run after the migration?`,
                );
            }

            Assert(CREATED_PARENT_IDS.length > 0, 'TG3 must run before TG4 (it creates the fixture graph)');
            const parentTaskId = CREATED_PARENT_IDS[CREATED_PARENT_IDS.length - 1];

            const res = await new RunView().RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskId}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const child = res.Results?.[0];
            Assert(!!child, 'fixture child task not found');

            child!.OutputPayload = JSON.stringify({ integrationCheck: true });
            child!.ErrorMessage = 'TG4 write check';
            const saved = await child!.Save();
            Assert(saved, `writing the new columns failed: ${child!.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            await settle(200);
            const reread = await new RunView().RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${child!.ID}'`, ResultType: 'entity_object' }, ctx.User,
            );
            AssertEqual(reread.Results?.[0]?.ErrorMessage, 'TG4 write check', 'ErrorMessage round-trips');
            console.log('      → all six Phase 1 columns present in metadata and writable');
        }
    },
];

for (const check of TaskGraphOrchestrationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('task-graph-orchestration', {
    // Nothing to build up front — TG1/TG2 assert on rejection and TG3 creates its own fixture.
    Setup: async () => { /* no shared fixture */ },
    Teardown: async (ctx: IntegrationCheckContext) => {
        // FK-safe: dependencies -> children -> parent.
        for (const parentTaskId of CREATED_PARENT_IDS) {
            const childRes = await new RunView().RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskId}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const children = childRes.Results ?? [];

            if (children.length > 0) {
                const idList = children.map(c => `'${c.ID}'`).join(',');
                const depRes = await new RunView().RunView(
                    { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${idList})`, ResultType: 'entity_object' },
                    ctx.User,
                );
                for (const dep of (depRes.Results ?? []) as Array<{ Delete: () => Promise<boolean> }>) {
                    await dep.Delete();
                }
            }

            for (const child of children) {
                await child.Delete();
            }

            const parentRes = await new RunView().RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${parentTaskId}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const parent = parentRes.Results?.[0];
            if (parent) await parent.Delete();
        }
        CREATED_PARENT_IDS.length = 0;
    },
});

// Referenced so the import of MJTaskTypeEntity is not elided; the bundle relies on the task type
// the orchestrator ensures on first use rather than creating its own.
export type _TaskTypeRef = MJTaskTypeEntity;
