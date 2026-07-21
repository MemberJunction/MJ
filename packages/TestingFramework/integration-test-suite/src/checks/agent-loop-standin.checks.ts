/**
 * agent-loop-standin.checks.ts — the 'agent-loop-standin' bundle (ALS1–ALS6): agent-loop
 * machinery exercised WITHOUT any LLM call, per test-catalog Domain 4 (the deterministic
 * neighbors of the live-model AR1 run and the stand-in-LLM AI9–AI11 items).
 *
 * TRANSPORT: **SERVER-ONLY by necessity** (same as conversation-compaction): BaseAgent step
 * internals, the step-save queue, and the Execute early-exit paths are server-process seams in
 * `@memberjunction/ai-agents` with no client surface. ALS5/ALS6 are pure in-process helpers.
 *
 * NO LLM CALLS — every Execute leg here exits DETERMINISTICALLY BEFORE Phase 2 of
 * BaseAgent.Execute (config load / context-memory / RAG injection), the first point where a
 * model-adjacent dependency (local-embedding similarity) could be touched:
 *   - ALS3 exits at the pre-start cancellation check (before Phase 1 — no AgentRun row at all);
 *   - ALS4 exits at validateAgentWithTracking (after Phase 1, before Phase 2).
 * The step checks (ALS1/ALS2) drive the protected step-persistence internals directly — the
 * same access pattern as conversation-compaction CC9/CC10 and the unit tier
 * (base-agent-step-save.test.ts) — extending CC9's SUCCESS single-INSERT proof with the
 * FAILURE and two-phase shapes it does not cover.
 *
 * ORDERED, MUTATING-BY-DESIGN bundle (own tagged fixtures only; reference-only toward existing
 * records — existing agents are only READ, and the one in-memory Status mutation in ALS4 is
 * NEVER saved). Fixtures accumulate on a module-level accumulator (this bundle predates no
 * context-fixture slot in IntegrationCheckContext and deliberately does not modify the
 * framework package) and are torn down FK-ordered (steps → runs) by the registered lifecycle,
 * tagged "(mj-integration-test — safe to delete)". Checks are NOT RequiresMutation-gated,
 * mirroring runquery-cache / conversation-compaction.
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended
} from '@memberjunction/ai-core-plus';
import { BaseAgent, PayloadManager } from '@memberjunction/ai-agents';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/**
 * BaseAgent internals surface used by ALS1/ALS2/ALS4 — the same access pattern as
 * conversation-compaction.checks.ts and the unit tier; the members are protected/private by
 * design and this interface is the sanctioned test-side keyhole.
 */
interface AgentLoopInternals {
    _activeProvider: unknown;
    _agentRun: MJAIAgentRunEntityExtended;
    _stepSaveQueue: { Flush(): Promise<{ failures: number }> };
    createStepEntity(p: Record<string, unknown>): Promise<MJAIAgentRunStepEntityExtended>;
    finalizeStepEntity(step: MJAIAgentRunStepEntityExtended, success: boolean, errorMessage?: string, outputData?: unknown): Promise<void>;
}

/** Module-level accumulator (no IntegrationCheckContext slot — the framework package is not modified). */
interface AgentLoopFixture {
    /** Tagged MJ: AI Agent Runs fixture rows + runs persisted by Execute legs (deleted after steps). */
    Runs: Array<{ ID: string; Delete(): Promise<boolean> }>;
    /** Tagged step rows created through the internals (deleted first). */
    Steps: Array<{ Delete(): Promise<boolean> }>;
    /** Run IDs whose steps were created by Execute itself and must be swept by query. */
    RunIdsToSweep: string[];
}

let fixture: AgentLoopFixture | undefined;

function requireFixture(): AgentLoopFixture {
    if (!fixture) {
        throw new Error('agent-loop-standin fixture not initialized — the bundle lifecycle Setup must run before its checks.');
    }
    return fixture;
}

/** Loud, uniform skip-as-pass note. */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ agent-loop-standin.${checkId} SKIPPED — ${reason}`);
}

/** Ensure the AI metadata cache is loaded (agent catalog + permission rows for Execute's gate). */
async function configuredAIEngine(ctx: IntegrationCheckContext): Promise<AIEngineBase> {
    const engine = AIEngineBase.Instance;
    await engine.Config(false, ctx.User, ctx.Provider);
    return engine;
}

/** Creates a real (tagged) AI Agent Run row referencing an existing agent (CC pattern). */
async function createAgentRunFixture(ctx: IntegrationCheckContext): Promise<MJAIAgentRunEntityExtended> {
    const fx = requireFixture();
    const anyAgent = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: AI Agents', Fields: ['ID'], MaxRows: 1, ResultType: 'simple'
    }, ctx.User);
    Assert(anyAgent.Success && anyAgent.Results.length > 0, 'an existing agent to reference');
    const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
    run.AgentID = anyAgent.Results[0].ID;
    run.Status = 'Running';
    run.StartedAt = new Date();
    Assert(await run.Save(), `run fixture save: ${run.LatestResult?.CompleteMessage}`);
    fx.Runs.push(run);
    return run;
}

/** A BaseAgent wired to this run's provider + agent run, opened through the internals keyhole. */
function makeAgentInternals(ctx: IntegrationCheckContext, run: MJAIAgentRunEntityExtended): AgentLoopInternals {
    const agent = new BaseAgent();
    const internals = agent as unknown as AgentLoopInternals;
    internals._activeProvider = ctx.Provider;
    internals._agentRun = run;
    return internals;
}

/**
 * An Active agent Execute's permission gate will pass for the context user WITHOUT relying on
 * ambient grants: zero grant rows (open default → Run allowed) or owned by the context user.
 */
function findExecutableActiveAgent(engine: AIEngineBase, userId: string): MJAIAgentEntityExtended | undefined {
    const granted = new Set(engine.AgentPermissions.map(p => p.AgentID.toLowerCase()));
    return engine.Agents.find(a =>
        a.Status === 'Active' &&
        (!granted.has(a.ID.toLowerCase()) || UUIDsEqual(a.OwnerUserID, userId))
    );
}

/** Read a step row back through the real view (fresh, cache-bypassed). */
async function readStepRow(ctx: IntegrationCheckContext, stepId: string): Promise<Record<string, string | null>> {
    const persisted = await new RunView().RunView<Record<string, string | null>>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `ID='${stepId}'`,
        Fields: ['ID', 'StepType', 'Status', 'Success', 'ErrorMessage', 'OutputData', 'CompletedAt', '__mj_CreatedAt', '__mj_UpdatedAt'],
        ResultType: 'simple',
        BypassCache: true
    }, ctx.User);
    Assert(persisted.Success && persisted.Results.length === 1, `step ${stepId} read back exactly once`);
    return persisted.Results[0];
}

export const AgentLoopStandinChecks: NamedCheck[] = [
    {
        Id: 'agent-loop-standin.ALS1',
        Name: 'ALS1: FAILED completed-at-creation step persists via a SINGLE INSERT (Status/Success/ErrorMessage carried, no UPDATE round trip)',
        Fn: async (ctx): Promise<void> => {
            // CC9 proved the SUCCESS single-INSERT; a regression could special-case failures back
            // into INSERT-then-UPDATE (or drop the error fields from the INSERT column set) and
            // CC9 would stay green. Same seam, failure shape.
            const fx = requireFixture();
            const run = await createAgentRunFixture(ctx);
            const internals = makeAgentInternals(ctx, run);
            const errorMessage = `deliberate integration-test step failure ${FIXTURE_TAG}`;

            const step = await internals.createStepEntity({
                stepType: 'Tool',
                stepName: `Failed tool step ${FIXTURE_TAG}`,
                contextUser: ctx.User,
                completed: { success: false, errorMessage, outputData: { probe: 'als1' } }
            });
            fx.Steps.push(step);
            const flushed = await internals._stepSaveQueue.Flush();
            AssertEqual(flushed.failures, 0, 'the failed-step single INSERT persisted');

            const row = await readStepRow(ctx, step.ID);
            AssertEqual(row.Status, 'Failed', 'INSERT carried terminal Status=Failed');
            AssertEqual(String(row.Success), 'false', 'INSERT carried Success=false');
            AssertEqual(row.ErrorMessage, errorMessage, 'INSERT carried the ErrorMessage verbatim');
            Assert((row.OutputData || '').includes('"probe":"als1"'), 'INSERT carried the failure OutputData');
            Assert(row.CompletedAt != null, 'INSERT carried CompletedAt for the terminal failure');
            AssertEqual(
                new Date(String(row.__mj_UpdatedAt)).getTime(),
                new Date(String(row.__mj_CreatedAt)).getTime(),
                'no UPDATE followed the INSERT — failure landed in ONE write'
            );
        }
    },
    {
        Id: 'agent-loop-standin.ALS2',
        Name: "ALS2: two-phase step lifecycle Running → finalize(Failed), with the non-terminal 'Plan' StepType round-tripping intact",
        Fn: async (ctx): Promise<void> => {
            // The other half of the persistence contract: a long-lived step INSERTs as Running,
            // then finalization UPDATEs it terminal. 'Plan' is deliberately the StepType probe —
            // it is one of the newer non-terminal step types (in AIAgentRunStep.StepType but NOT
            // in AIAgentRun.FinalStep), the exact place a CHECK-constraint / generated-union skew
            // would first bite.
            const fx = requireFixture();
            const run = await createAgentRunFixture(ctx);
            const internals = makeAgentInternals(ctx, run);

            const step = await internals.createStepEntity({
                stepType: 'Plan',
                stepName: `Two-phase plan step ${FIXTURE_TAG}`,
                contextUser: ctx.User
            });
            fx.Steps.push(step);
            let flushed = await internals._stepSaveQueue.Flush();
            AssertEqual(flushed.failures, 0, 'phase-1 INSERT persisted');

            const phase1 = await readStepRow(ctx, step.ID);
            AssertEqual(phase1.StepType, 'Plan', "phase-1 row round-tripped StepType 'Plan' (non-terminal type persists)");
            AssertEqual(phase1.Status, 'Running', 'phase-1 row is Running');
            Assert(phase1.CompletedAt == null, 'phase-1 row has no CompletedAt yet');

            await internals.finalizeStepEntity(step, false, 'two-phase deliberate failure', { probe: 'als2' });
            flushed = await internals._stepSaveQueue.Flush();
            AssertEqual(flushed.failures, 0, 'phase-2 UPDATE persisted');

            const phase2 = await readStepRow(ctx, step.ID);
            AssertEqual(phase2.Status, 'Failed', 'finalize(false) landed Status=Failed');
            AssertEqual(String(phase2.Success), 'false', 'finalize(false) landed Success=false');
            AssertEqual(phase2.StepType, 'Plan', 'StepType survived finalization unchanged');
            Assert(phase2.CompletedAt != null, 'finalization stamped CompletedAt');
            Assert((phase2.ErrorMessage || '').includes('two-phase deliberate failure'), 'finalization carried the error message');
            Assert((phase2.OutputData || '').includes('"probe":"als2"'), 'finalization carried the output data');
            Assert((phase2.OutputData || '').includes('"success":false'), 'OutputData wraps the execution context with success:false');
            // NOTE: no UpdatedAt>CreatedAt assert — SQL Server's GETUTCDATE tick (~3ms) can
            // stamp a fast INSERT+UPDATE identically, making that comparison flaky. The
            // two-write proof is already airtight above: phase-1 was OBSERVED as
            // Status='Running' in the DB, phase-2 as Status='Failed' — two distinct persisted
            // states cannot come from one write.
            Assert(
                new Date(String(phase2.__mj_UpdatedAt)).getTime() >= new Date(String(phase2.__mj_CreatedAt)).getTime(),
                'UpdatedAt must never precede CreatedAt'
            );
        }
    },
    {
        Id: 'agent-loop-standin.ALS3',
        Name: 'ALS3: a PRE-ABORTED cancellation token exits Execute before ANY AgentRun row exists (no orphan run, no LLM)',
        Fn: async (ctx): Promise<void> => {
            // The cancel-before-start gate sits BEFORE Phase 1 (permission / engine init /
            // initializeAgentRun), so a caller that hands Execute an already-aborted signal must
            // get a failed result AND leave zero DB residue. A regression that moves the gate
            // after Phase 1 shows up here as a persisted orphan run.
            const engine = await configuredAIEngine(ctx);
            if (engine.Agents.length === 0) {
                skipNote('ALS3', 'no AI Agents in metadata — Execute cannot be exercised');
                return;
            }
            const agentEnt = await ctx.Provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', ctx.User);
            Assert(await agentEnt.Load(engine.Agents[0].ID), 'existing agent loads');

            const controller = new AbortController();
            controller.abort('integration-test pre-abort');

            const agent = new BaseAgent();
            const result = await agent.Execute({
                agent: agentEnt,
                conversationMessages: [{ role: 'user', content: 'agent-loop-standin ALS3 — should never run' }],
                contextUser: ctx.User,
                provider: ctx.Provider,
                cancellationToken: controller.signal
            });
            AssertEqual(result.success, false, 'a pre-aborted token must yield a failed result');
            // The typed contract says agentRun is always present, but on this earliest exit no
            // run has been initialized — pin that nothing was PERSISTED either way.
            const run: MJAIAgentRunEntityExtended | undefined = result.agentRun;
            if (run && run.IsSaved) {
                requireFixture().Runs.push(run); // track for teardown before failing loudly
                requireFixture().RunIdsToSweep.push(run.ID);
                Assert(false, `cancel-before-start PERSISTED an AgentRun row (${run.ID}) — the early-exit gate moved after run initialization`);
            }
            console.log('      → pre-aborted Execute returned success:false with no persisted AgentRun row');
        }
    },
    {
        Id: 'agent-loop-standin.ALS4',
        Name: 'ALS4: a non-Active agent deterministically fails Execute — run Failed + FinalStep Failed + terminal Validation step, exact message, no LLM',
        Fn: async (ctx): Promise<void> => {
            // The validateAgent gate (after Phase 1, before Phase 2/prompts): pin the failure
            // SURFACE a disabled agent produces — the exact error text UIs match on, the run row
            // shape (Status/FinalStep), and that the Validation step persisted terminal. The
            // Status flip happens ONLY on an in-memory copy that is never saved.
            const fx = requireFixture();
            const engine = await configuredAIEngine(ctx);
            const candidate = findExecutableActiveAgent(engine, ctx.User.ID);
            if (!candidate) {
                skipNote('ALS4', `no Active agent whose Run gate passes for the context user without ambient grants (${engine.Agents.length} agents)`);
                return;
            }
            const agentEnt = await ctx.Provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', ctx.User);
            Assert(await agentEnt.Load(candidate.ID), 'candidate agent loads');
            agentEnt.Status = 'Disabled'; // in-memory ONLY — never saved

            const agent = new BaseAgent();
            const result = await agent.Execute({
                agent: agentEnt,
                conversationMessages: [{ role: 'user', content: 'agent-loop-standin ALS4 — should be refused' }],
                contextUser: ctx.User,
                provider: ctx.Provider
            });
            // Track DB residue immediately, before any assertion can throw.
            const run: MJAIAgentRunEntityExtended | undefined = result.agentRun;
            if (run && run.IsSaved) {
                fx.Runs.push(run);
                fx.RunIdsToSweep.push(run.ID);
            }
            // Flush the fire-and-forget step queue so the Validation step is queryable + sweepable.
            const internals = agent as unknown as AgentLoopInternals;
            await internals._stepSaveQueue.Flush();

            AssertEqual(result.success, false, 'a Disabled agent must fail Execute');
            Assert(!!run && run.IsSaved, 'the failure path persists the AgentRun row (phase-1 creation + failure finalization)');
            AssertEqual(run!.Status, 'Failed', 'run Status=Failed');
            AssertEqual(run!.FinalStep, 'Failed', "run FinalStep='Failed'");
            Assert(
                (run!.ErrorMessage || '').includes('not active') && (run!.ErrorMessage || '').includes('Disabled'),
                `run ErrorMessage must name the inactive status; got: '${run!.ErrorMessage}'`
            );

            const steps = await new RunView().RunView<{ ID: string; StepType: string; Status: string }>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID='${run!.ID}'`,
                Fields: ['ID', 'StepType', 'Status'],
                ResultType: 'simple',
                BypassCache: true
            }, ctx.User);
            Assert(steps.Success, `step read-back failed: ${steps.ErrorMessage}`);
            const validation = steps.Results.filter(s => s.StepType === 'Validation');
            Assert(validation.length > 0, 'the refused run persisted its Validation step');
            Assert(validation.every(s => s.Status !== 'Running'), `Validation step left non-terminal: ${validation.map(s => s.Status).join(',')}`);
            console.log(`      → Disabled '${candidate.Name}' refused deterministically; run ${run!.ID} Failed/Failed with ${steps.Results.length} persisted step(s)`);
        }
    },
    {
        Id: 'agent-loop-standin.ALS5',
        Name: 'ALS5: PayloadManager.applyAgentChangeRequest — pure apply (add/update/__DELETE__), original untouched, allowedPaths BLOCKS out-of-scope writes',
        Fn: async (ctx): Promise<void> => {
            void ctx;
            interface ProbePayload {
                keep: string;
                added?: string;
                user: { name: string; temp?: string };
                items: number[];
            }
            const pm = new PayloadManager();
            const original: ProbePayload = { keep: 'x', user: { name: 'old', temp: 'gone' }, items: [1, 2] };

            // 1. Apply: newElements adds, updateElements updates + __DELETE__ removes; counts move;
            //    the ORIGINAL object is never mutated (clone-on-apply contract).
            const applied = pm.applyAgentChangeRequest<ProbePayload>(original, {
                newElements: { added: 'new' },
                updateElements: { user: { name: 'new', temp: '__DELETE__' } },
                reasoning: 'agent-loop-standin ALS5 probe'
            });
            AssertEqual(applied.result.added, 'new', 'newElements addition applied');
            AssertEqual(applied.result.user.name, 'new', 'updateElements update applied');
            AssertEqual('temp' in applied.result.user, false, '__DELETE__ removed the property');
            AssertEqual(applied.result.keep, 'x', 'untouched property preserved');
            AssertEqual(JSON.stringify(applied.result.items), '[1,2]', 'untouched array preserved');
            Assert(applied.applied.additions >= 1, 'addition counted');
            Assert(applied.applied.updates >= 1, 'update counted');
            Assert(applied.applied.deletions >= 1, '__DELETE__ counted as a deletion');
            AssertEqual(original.user.name, 'old', 'the ORIGINAL payload was mutated by apply — clone contract broken');
            AssertEqual(original.user.temp, 'gone', 'the ORIGINAL payload lost a property');

            // 2. allowedPaths: a write outside the granted paths is BLOCKED and reported — the
            //    downstream sub-agent write-permission fence.
            const fenced = pm.applyAgentChangeRequest<ProbePayload>(original, {
                updateElements: { keep: 'hacked', user: { name: 'allowed-update' } },
                reasoning: 'agent-loop-standin ALS5 fence probe'
            }, { allowedPaths: ['user.*'], analyzeChanges: false });
            AssertEqual(fenced.result.keep, 'x', "an out-of-scope write to 'keep' landed despite allowedPaths (SECURITY fence broken)");
            AssertEqual(fenced.result.user.name, 'allowed-update', 'the in-scope write was wrongly blocked');
            Assert((fenced.blockedOperations?.length ?? 0) > 0, 'the blocked write was not reported in blockedOperations');
            Assert(
                (fenced.blockedOperations ?? []).some(b => b.path.includes('keep')),
                `blockedOperations does not name the fenced path: ${JSON.stringify(fenced.blockedOperations)}`
            );
            console.log('      → apply/__DELETE__/counts verified; original immutable; allowedPaths fence blocks + reports');
        }
    },
    {
        Id: 'agent-loop-standin.ALS6',
        Name: 'ALS6: payload scope helpers — applyPayloadScope / reversePayloadScope round-trip, missing path → null, change-request path transform',
        Fn: async (ctx): Promise<void> => {
            void ctx;
            const pm = new PayloadManager();
            const full = { a: { b: { c: 1, d: 'keep' } }, other: 2 };

            // Extract: the scoped view is the subtree, cloned (mutating it must not touch the source).
            const scoped = pm.applyPayloadScope(full, '/a/b') as { c: number; d: string } | null;
            Assert(scoped !== null, 'scope extraction returned null for an existing path');
            AssertEqual(scoped!.c, 1, 'scoped view carries the subtree');
            scoped!.c = 99;
            AssertEqual(full.a.b.c, 1, 'mutating the scoped view leaked into the source — clone contract broken');

            // Missing path → null (the sub-agent gets "no payload", not a fabricated shape).
            AssertEqual(pm.applyPayloadScope(full, '/a/missing') as unknown as null, null, 'a nonexistent scope path must yield null');

            // Reverse: wrap the (edited) scoped content back at the same path — round trip.
            const rewrapped = pm.reversePayloadScope<{ a: { b: { c: number; d: string } } }>(scoped, '/a/b');
            AssertEqual(rewrapped.a.b.c, 99, 'reverse scope re-nested the edited subtree at the original path');
            AssertEqual(rewrapped.a.b.d, 'keep', 'reverse scope preserved sibling content of the subtree');

            // Change-request path transform: scoped-relative paths become absolute dot-paths, so a
            // sub-agent's surgical edits target the right place in the PARENT payload.
            const transformed = pm.transformChangeRequestPaths<Record<string, unknown>>(
                { updateElements: { c: 5 }, reasoning: 'agent-loop-standin ALS6 probe' },
                '/a/b'
            );
            const updates = (transformed.updateElements ?? {}) as Record<string, unknown>;
            AssertEqual(updates['a.b.c'], 5, `scope transform did not prefix the path: ${JSON.stringify(transformed.updateElements)}`);
            console.log('      → scope extract/reverse round-trip, null-on-missing, and path transform all hold');
        }
    }
];

for (const check of AgentLoopStandinChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Accumulator lifecycle (module-level — no framework changes): Setup resets the accumulator;
// Teardown deletes FK-ordered (queried step sweep for Execute-created steps → tracked steps →
// runs), best-effort per record so one failure never strands the rest.
IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-loop-standin', {
    Setup: async () => {
        fixture = { Runs: [], Steps: [], RunIdsToSweep: [] };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const fx = fixture;
        if (!fx) {
            return;
        }
        // 1. Sweep steps Execute created itself (ALS4's Validation step) by run id.
        for (const runId of fx.RunIdsToSweep) {
            try {
                const steps = await new RunView().RunView<MJAIAgentRunStepEntityExtended>({
                    EntityName: 'MJ: AI Agent Run Steps',
                    ExtraFilter: `AgentRunID='${runId}'`,
                    ResultType: 'entity_object',
                    BypassCache: true
                }, ctx.User);
                if (steps.Success) {
                    for (const step of steps.Results) {
                        try { await step.Delete(); } catch (e) { console.error('Step sweep cleanup failed:', e); }
                    }
                }
            } catch (e) {
                console.error('Step sweep query failed:', e);
            }
        }
        // 2. Steps this bundle created through the internals.
        for (const step of fx.Steps) {
            try { await step.Delete(); } catch (e) { console.error('Step fixture cleanup failed:', e); }
        }
        // 3. Runs (fixture rows + Execute-persisted rows).
        for (const run of fx.Runs) {
            try { await run.Delete(); } catch (e) { console.error('Agent run fixture cleanup failed:', e); }
        }
        fixture = undefined;
    }
});
