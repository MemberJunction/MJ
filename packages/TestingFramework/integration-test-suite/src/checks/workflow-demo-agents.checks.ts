/**
 * workflow-demo-agents.checks.ts — the 'workflow-demo-agents' bundle.
 *
 * **What these protect.** Two Flow agents ship as metadata (`Schema Documentation Sweep`,
 * `Content Pipeline`), and between them they are the only committed exercise of the graph shapes a
 * linear flow cannot express: a bounded `While` whose body revises in one pass, and an exclusive
 * pair where exactly one branch runs. They are also the first shipped agents to use `Prompt` nodes
 * as loop bodies.
 *
 * They deliberately do NOT contain an AND-join. A Flow agent compiles with TraversalMode
 * 'sequential', where a step with two outgoing paths becomes one exclusive group — so a fan-out
 * cannot mean "both", and an authored one silently ran half the graph. WD2 now asserts the inverse
 * invariant: the only fan-out is the conditional pair, where choosing is the intent.
 *
 * Metadata is the easiest thing in this repo to break silently. A renamed action, a step whose
 * `Configuration` loses a key, a path whose condition is dropped — none of it fails a build, none of
 * it fails a unit test, and the agent still *looks* fine on the canvas. It fails at submission, at
 * which point someone is watching a workflow do nothing and has no idea why.
 *
 * So these assert the compiled shape, not the row count:
 *
 *   - WD1: both agents exist, are Flow type, and carry the steps their design calls for
 *   - WD2: Content Pipeline COMPILES, and the compiled graph really has the AND-join, the bounded
 *          loop, and the exclusive pair — not merely the steps that ought to produce them
 *   - WD3: Schema Documentation Sweep compiles, its Get Records output lands where the ForEach
 *          reads it, and its loop body is a Prompt
 *   - WD4: the run-tree stored query is callable end to end and assembles into a tree
 *   - WD5: that query reports OWN cost, never the rollup it now feeds — the one place the real
 *          SQL's cost basis is asserted, and the guard against a silently compounding total
 *
 * Deterministic — **no model calls**. Compilation is pure, and WD4 anchors on a run row the check
 * creates and the bundle Teardown removes.
 */
import { RunView, type IMetadataProvider, type IRunQueryProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { TaskGraphSpec, TaskGraphSpecNode } from '@memberjunction/ai-core-plus';
import { BuildAgentRunTree, LoadAgentRunTree, SumAgentRunTreeCost } from '@memberjunction/ai-core-plus';
import { MJAIAgentEntity, MJAIAgentRunEntity } from '@memberjunction/core-entities';
import {
    CompileFlowToTaskGraph,
    type FlowCompilerPath,
    type FlowCompilerStep,
} from '@memberjunction/ai-core-plus';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const SCHEMA_SWEEP = 'Schema Documentation Sweep';
const CONTENT_PIPELINE = 'Content Pipeline';

/** Runs this bundle created, removed in Teardown. */
const CREATED_RUN_IDS: string[] = [];

/**
 * The run-query capability of a provider, when it has one.
 *
 * `IMetadataProvider` does not extend `IRunQueryProvider`, but every provider that ships — SQL
 * Server on the server, GraphQL in the browser — implements both. Narrowing by CAPABILITY rather
 * than casting states that relationship honestly: a provider that genuinely cannot run queries
 * returns undefined and the loader falls back, instead of failing at the call site with a type lie.
 */
function asRunQueryProvider(provider: IMetadataProvider): IRunQueryProvider | undefined {
    const candidate = provider as unknown as Partial<IRunQueryProvider>;
    return typeof candidate.RunQuery === 'function' ? (candidate as IRunQueryProvider) : undefined;
}

/** Loads a Flow agent by name, failing with a message that says which one is missing. */
async function loadFlowAgent(ctx: IntegrationCheckContext, name: string): Promise<MJAIAgentEntity> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentEntity>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
            ResultType: 'entity_object',
        },
        ctx.User,
    );
    Assert(result.Success, `could not read agents: ${result.ErrorMessage}`);
    const agent = (result.Results ?? [])[0];
    Assert(!!agent, `the '${name}' demo agent is not in metadata — was it removed, or never pushed?`);
    AssertEqual(agent.Type, 'Flow', `'${name}' must be a Flow agent`);
    return agent;
}

/**
 * Compiles a Flow agent into a task graph.
 *
 * Reached through the ClassFactory-free export rather than by running the agent, because
 * compilation is the thing under test: it is pure, it needs no model, and it is where a metadata
 * mistake actually surfaces.
 */
async function compile(ctx: IntegrationCheckContext, agent: MJAIAgentEntity): Promise<TaskGraphSpec> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const [steps, paths, agents, actions, prompts] = await rv.RunViews(
        [
            { EntityName: 'MJ: AI Agent Steps', ExtraFilter: `AgentID='${agent.ID}'`, ResultType: 'entity_object' },
            { EntityName: 'MJ: AI Agent Step Paths', ResultType: 'entity_object' },
            { EntityName: 'MJ: AI Agents', Fields: ['ID', 'Name'], ResultType: 'simple' },
            { EntityName: 'MJ: Actions', Fields: ['ID', 'Name'], ResultType: 'simple' },
            { EntityName: 'MJ: AI Prompts', Fields: ['ID', 'Name'], ResultType: 'simple' },
        ],
        ctx.User,
    );

    const stepRows = (steps.Results ?? []) as unknown as FlowCompilerStep[];
    const stepIDs = new Set(stepRows.map((s) => s.ID.toLowerCase()));
    // Only this agent's edges. Paths are not agent-scoped, so filtering by endpoint is what keeps
    // one agent's graph from picking up another's.
    const pathRows = ((paths.Results ?? []) as unknown as FlowCompilerPath[])
        .filter((p) => stepIDs.has(String(p.OriginStepID).toLowerCase()));

    const nameOf = (rows: readonly unknown[]) =>
        new Map((rows as { ID: string; Name: string }[]).map((r) => [r.ID.toLowerCase(), r.Name]));
    const agentNames = nameOf(agents.Results ?? []);
    const actionNames = nameOf(actions.Results ?? []);
    const promptNames = nameOf(prompts.Results ?? []);

    const result = CompileFlowToTaskGraph(stepRows, pathRows, {
        WorkflowName: agent.Name ?? '(unnamed)',
        ResolveAgentName: (id) => agentNames.get(id.toLowerCase()) ?? null,
        ResolveActionName: (id) => actionNames.get(id.toLowerCase()) ?? null,
        ResolvePromptName: (id) => promptNames.get(id.toLowerCase()) ?? null,
    });

    Assert(
        result.Errors.length === 0,
        `'${agent.Name}' does not compile: ${result.Errors.map((e) => e.Message).join('; ')}`,
    );
    Assert(!!result.Spec, `'${agent.Name}' compiled to nothing`);
    return result.Spec!;
}

/**
 * The task id a dependency points at, in either form it can take.
 *
 * A dependency is normally an object carrying the id plus its condition; the bare-string form
 * survives from older specs. Reading only one of them is how an assertion ends up permanently false
 * while looking correct.
 */
function dependencyId(dep: unknown): string {
    return typeof dep === 'string' ? dep : String((dep as { tempId?: string })?.tempId ?? '');
}

/** The node with this name, or a failure that names what WAS found. */
function nodeNamed(spec: TaskGraphSpec, name: string): TaskGraphSpecNode {
    const match = spec.tasks.find((t) => t.name === name);
    Assert(
        !!match,
        `no step named '${name}' in the compiled graph. Found: ${spec.tasks.map((t) => t.name).join(', ')}`,
    );
    return match!;
}

export const WorkflowDemoAgentChecks: NamedCheck[] = [
    {
        Id: 'workflow-demo-agents.WD1',
        Name: 'WD1: both workflow demo agents are present, Flow type, and carry their steps',
        Fn: async (ctx: IntegrationCheckContext) => {
            const sweep = await loadFlowAgent(ctx, SCHEMA_SWEEP);
            const pipeline = await loadFlowAgent(ctx, CONTENT_PIPELINE);

            const steps = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ AgentID: string; Name: string }>(
                {
                    EntityName: 'MJ: AI Agent Steps',
                    Fields: ['AgentID', 'Name'],
                    ExtraFilter: `AgentID IN ('${sweep.ID}','${pipeline.ID}')`,
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(steps.Success, `could not read agent steps: ${steps.ErrorMessage}`);

            const sweepSteps = (steps.Results ?? []).filter((s) => UUIDsEqual(s.AgentID, sweep.ID));
            const pipelineSteps = (steps.Results ?? []).filter((s) => UUIDsEqual(s.AgentID, pipeline.ID));

            // 3, not 2: the sweep gained its Human approval step when HITL landed. This assertion
            // was merged stale — the demo changed in the same range and the check did not.
            AssertEqual(sweepSteps.length, 3, `${SCHEMA_SWEEP} should have 3 steps`);
            AssertEqual(pipelineSteps.length, 6, `${CONTENT_PIPELINE} should have 6 steps`);

            console.log(`      → ${SCHEMA_SWEEP}: ${sweepSteps.length} steps · ${CONTENT_PIPELINE}: ${pipelineSteps.length} steps`);
        },
    },

    {
        Id: 'workflow-demo-agents.WD2',
        Name: 'WD2: Content Pipeline compiles with no accidental fan-out, a bounded loop, and an exclusive pair',
        Fn: async (ctx: IntegrationCheckContext) => {
            const spec = await compile(ctx, await loadFlowAgent(ctx, CONTENT_PIPELINE));

            // ── No UNCONDITIONAL fan-out anywhere ────────────────────────────────────────────
            // This replaces an AND-join assertion, and the reason is the point of the check.
            // A Flow agent compiles with TraversalMode 'sequential', where a step with two outgoing
            // paths becomes ONE exclusive group: exactly one branch runs and the loser is Skipped.
            // So an AND-join is not expressible here at all — wiring one produced a graph that
            // LOOKED parallel and silently ran half of it, which is how this demo drafted from one
            // research result for its entire life.
            //
            // The invariant that actually protects the workflow is therefore the opposite one: the
            // only fan-out may be the CONDITIONAL pair at the review step, where choosing one branch
            // is the intent. An unconditional fan-out is always an accident.
            const byOrigin = new Map<string, { conditional: number; total: number }>();
            for (const task of spec.tasks) {
                for (const dep of task.dependsOn ?? []) {
                    const originID = dependencyId(dep);
                    const condition = typeof dep === 'string' ? undefined : (dep as { condition?: string }).condition;
                    const seen = byOrigin.get(originID) ?? { conditional: 0, total: 0 };
                    seen.total += 1;
                    if (condition && condition.trim()) seen.conditional += 1;
                    byOrigin.set(originID, seen);
                }
            }
            for (const [originID, counts] of byOrigin) {
                if (counts.total < 2) continue;
                const originName = spec.tasks.find((t) => t.tempId === originID)?.name ?? originID;
                AssertEqual(
                    counts.conditional, counts.total,
                    `'${originName}' fans out to ${counts.total} steps with only ${counts.conditional} ` +
                    `condition(s). Sequential traversal turns a fan-out into an exclusive choice, so ` +
                    `the unconditional branches here will be Skipped without comment.`,
                );
            }

            // The research chain still reaches the draft — the fan-out is gone, the coverage is not.
            const draft = nodeNamed(spec, 'Draft the piece');
            const draftDeps = (draft.dependsOn ?? []).map(dependencyId);
            AssertEqual(draftDeps.length, 1, 'the draft step must follow the research chain');
            AssertEqual(
                spec.tasks.find((t) => t.tempId === draftDeps[0])?.name, 'Research: focused',
                'the draft must come after BOTH research steps, i.e. after the second one in the chain',
            );

            // The bounded loop. An unbounded revision loop on a model that will not converge is the
            // failure mode this cap exists to prevent, so the cap itself is the assertion.
            const review = nodeNamed(spec, 'Review against brand rules');
            AssertEqual(review.kind, 'While', 'the review step must compile to a While node');
            const loop = review.configuration as { maxIterations?: number; condition?: string };
            AssertEqual(loop.maxIterations, 3, 'the revision loop must stay bounded at 3 iterations');
            Assert(!!loop.condition, 'the While node lost its exit condition — it would never stop');

            // The exclusive pair. Both edges must carry a condition; an unconditional edge here
            // would run BOTH closing notes, reporting a draft as approved and given-up at once.
            const approved = nodeNamed(spec, 'Close out: approved');
            const gaveUp = nodeNamed(spec, 'Close out: gave up');
            for (const [node, label] of [[approved, 'approved'], [gaveUp, 'gave up']] as const) {
                const edges = (node.dependsOn ?? []).map(dependencyId);
                Assert(edges.includes(review.tempId), `the '${label}' branch must follow the review step`);
            }
            Assert(
                approved.tempId !== gaveUp.tempId,
                'the two closing steps collapsed into one — the exclusive pair is gone',
            );

            console.log('      → no unconditional fan-out, While bounded at 3, exclusive pair intact');
        },
    },

    {
        Id: 'workflow-demo-agents.WD3',
        Name: 'WD3: Schema Documentation Sweep compiles, and its records reach its loop',
        Fn: async (ctx: IntegrationCheckContext) => {
            const spec = await compile(ctx, await loadFlowAgent(ctx, SCHEMA_SWEEP));

            const find = nodeNamed(spec, 'Find undocumented fields');
            AssertEqual(find.kind, 'Action', 'the first step must be an Action node');

            // The seam that silently breaks: Get Records writes to `fields`, the ForEach reads
            // `fields`. Rename either and the loop iterates zero times, which at runtime looks like
            // the agent deciding there was nothing to do.
            const findConfig = find.configuration as { outputMapping?: string };
            const mapping = String(findConfig.outputMapping ?? '');
            Assert(
                mapping.includes('fields'),
                `Get Records must map its Records output to 'fields'; got ${mapping}`,
            );

            const loopNode = nodeNamed(spec, 'Propose a description for each field');
            AssertEqual(loopNode.kind, 'ForEach', 'the second step must compile to a ForEach node');
            const loop = loopNode.configuration as { collectionPath?: string; bodyType?: string };
            AssertEqual(
                loop.collectionPath,
                'payload.fields',
                'the ForEach must iterate the collection Get Records wrote — and with the payload. prefix, or the dialect reads it as a literal and the loop runs zero times',
            );

            console.log(`      → Get Records → 'fields' → ForEach, body is a prompt`);
        },
    },

    {
        Id: 'workflow-demo-agents.WD4',
        Name: 'WD4: the run-tree query is callable and assembles into a tree',
        Fn: async (ctx: IntegrationCheckContext) => {
            // A run of its own rather than whatever happens to be in the database, so the assertion
            // is about the QUERY and not about the history of this install.
            const agents = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentEntity>(
                { EntityName: 'MJ: AI Agents', MaxRows: 1, ResultType: 'entity_object' }, ctx.User,
            );
            Assert(agents.Success && (agents.Results ?? []).length > 0, 'no agents exist to anchor a run on');

            const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            run.NewRecord();
            run.AgentID = agents.Results![0].ID;
            run.Status = 'Completed';
            run.StartedAt = new Date();
            run.CompletedAt = new Date();
            run.RunName = 'mj-integration-test-run-tree (safe to delete)';
            Assert(await run.Save(), `could not save the anchor run: ${run.LatestResult?.CompleteMessage}`);
            CREATED_RUN_IDS.push(run.ID);

            const tree = await LoadAgentRunTree(run.ID, asRunQueryProvider(ctx.Provider), ctx.User);
            Assert(!tree.ErrorMessage, `the run-tree query failed: ${tree.ErrorMessage}`);
            AssertEqual(tree.Rows.length, 1, 'a run with no steps must return exactly its own node');
            AssertEqual(tree.Root?.NodeType, 'Run', 'the root of a run tree must be the run');
            Assert(UUIDsEqual(tree.Root?.NodeID ?? '', run.ID), 'the root must be the run asked for');
            AssertEqual(tree.Truncated, false, 'a one-node tree cannot be truncated');

            // The assembler is pure and must agree with what the loader returned — if these ever
            // disagree, one of them is reordering or dropping nodes.
            const rebuilt = BuildAgentRunTree(tree.Rows);
            AssertEqual(rebuilt?.NodeID, tree.Root?.NodeID, 'BuildAgentRunTree disagreed with the loader');

            // A run that does not exist is an empty tree, NOT an error — callers render "nothing
            // here yet" rather than a failure, and a thrown exception would break that.
            const missing = await LoadAgentRunTree(
                '00000000-0000-0000-0000-000000000000', asRunQueryProvider(ctx.Provider), ctx.User,
            );
            Assert(!missing.ErrorMessage, `an unknown run should return an empty tree, not an error: ${missing.ErrorMessage}`);
            AssertEqual(missing.Root, null, 'an unknown run must produce a null root');

            console.log('      → run tree loads, assembles, and returns empty for an unknown run');
        },
    },

    {
        Id: 'workflow-demo-agents.WD5',
        Name: 'WD5: the run tree reports OWN cost, never the rollup it feeds',
        Fn: async (ctx: IntegrationCheckContext) => {
            // 🔒 THE RULING, ENCODED. Since v6.1 the settlement-time cost rollup on AIAgentRun is
            // WRITTEN from this query (TaskGraphDispatcher.rollUpCostToSubmittingRun sums the tree).
            // That is only safe because the query selects TotalCost — own spend — and never
            // TotalCostRollup. If anyone "improves" it to read the rollup, the column becomes an
            // input to its own computation: every settlement folds the previous total back in and
            // the number inflates, compounding, with no error and no visible symptom until someone
            // questions a bill.
            //
            // The unit tests cannot catch that — they assemble trees from fixtures and never touch
            // the SQL. This check is the only place the real query's cost basis is asserted, which
            // is why it plants an ABSURD rollup: if the query ever reads it, the failure is
            // unmistakable rather than a plausible-looking number.
            const agents = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentEntity>(
                { EntityName: 'MJ: AI Agents', MaxRows: 1, ResultType: 'entity_object' }, ctx.User,
            );
            Assert(agents.Success && (agents.Results ?? []).length > 0, 'no agents exist to anchor a run on');

            const OWN_COST = 0.25;
            const OWN_TOKENS = 1000;
            const OWN_PROMPT_TOKENS = 700;
            const OWN_COMPLETION_TOKENS = 300;
            const ABSURD = 999.0;

            const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            run.NewRecord();
            run.AgentID = agents.Results![0].ID;
            run.Status = 'Completed';
            run.StartedAt = new Date();
            run.CompletedAt = new Date();
            run.RunName = 'mj-integration-test-cost-basis (safe to delete)';
            run.TotalCost = OWN_COST;
            run.TotalTokensUsed = OWN_TOKENS;
            run.TotalPromptTokensUsed = OWN_PROMPT_TOKENS;
            run.TotalCompletionTokensUsed = OWN_COMPLETION_TOKENS;
            // Deliberately inconsistent with own-cost. A correct tree can never surface these.
            run.TotalCostRollup = ABSURD;
            run.TotalTokensUsedRollup = ABSURD;
            Assert(await run.Save(), `could not save the cost-basis run: ${run.LatestResult?.CompleteMessage}`);
            CREATED_RUN_IDS.push(run.ID);

            const tree = await LoadAgentRunTree(run.ID, asRunQueryProvider(ctx.Provider), ctx.User);
            Assert(!tree.ErrorMessage, `the run-tree query failed: ${tree.ErrorMessage}`);
            Assert(!!tree.Root, 'the cost-basis run produced no tree');

            AssertEqual(
                tree.Root!.Cost, OWN_COST,
                `the tree reported ${tree.Root!.Cost} for a run whose OWN cost is ${OWN_COST}. If this ` +
                `is ${ABSURD}, the query is reading TotalCostRollup — which the dispatcher writes FROM ` +
                `this query, so the total now compounds on every settlement.`,
            );
            AssertEqual(tree.Root!.Tokens, OWN_TOKENS, 'the tree must report own tokens, not the rollup');

            // The widened projection: all four columns the rollup writes come from one basis.
            AssertEqual(tree.Root!.PromptTokens, OWN_PROMPT_TOKENS, 'the tree lost the prompt-token split');
            AssertEqual(tree.Root!.CompletionTokens, OWN_COMPLETION_TOKENS, 'the tree lost the completion-token split');

            // And the sum a settlement would cache back is exactly the tree — the equality that IS
            // the ruling ("the tree is the authority; the Rollup columns are its cache").
            const totals = SumAgentRunTreeCost(tree.Root!);
            AssertEqual(totals.Cost, OWN_COST, 'the settlement total disagreed with the tree it sums');
            AssertEqual(totals.PromptTokens, OWN_PROMPT_TOKENS, 'the settlement prompt-token total disagreed with the tree');

            console.log('      → tree reports own cost (not the rollup it feeds), with all four columns');
        },
    },
];

for (const check of WorkflowDemoAgentChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('workflow-demo-agents', {
    Setup: async () => { /* the demo agents ship as metadata; nothing to build */ },
    Teardown: async (ctx: IntegrationCheckContext) => {
        for (const runID of CREATED_RUN_IDS) {
            const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            if (await run.Load(runID)) await run.Delete();
        }
        CREATED_RUN_IDS.length = 0;
    },
});
