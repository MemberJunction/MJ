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
import { BaseAgent, PayloadManager, CircuitBreakerActionResult, IDENTICAL_FAILURE_THRESHOLD, ACTION_FAILURE_BUDGET } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentAction } from '@memberjunction/ai-core-plus';
import { ActionEngineServer } from '@memberjunction/actions';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import { MJActionExecutionLogEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
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
    /** Run-scoped circuit-breaker state (ALS7–ALS11). */
    _fatalActionFailures: Set<string>;
    _actionFailureHistory: Map<string, { lastParamsString: string; identicalFailures: number; totalConsecutiveFailures: number }>;
    recordActionFailure(action: AgentAction, actionEntity: MJActionEntityExtended | undefined, message: string | null | undefined, normalizedParams: string): void;
    normalizeActionParams(params: Record<string, unknown> | null | undefined): string;
}

/** The core 'Calculate Expression' action: a pure, deterministic failure source with no external dependency. */
const BREAKER_ACTION = 'Calculate Expression';
/** An expression the action refuses (INVALID_EXPRESSION), never a fatal-pattern message. */
const BAD_EXPRESSION = 'process.exit(0)';

/**
 * A BaseAgent driven straight at ExecuteSingleAction — the single seam every action call in a run
 * passes through (the main loop, the realtime tool path, and the ForEach / While / pipeline
 * callers that pass `skipCircuitBreaker`). Nothing here starts a run or touches an LLM: the action
 * engine executes the real core action, and the breaker's rules are observed through the result
 * type and the presence or absence of an Action Execution Log row.
 */
interface BreakerHarness {
    agent: BaseAgent;
    internals: AgentLoopInternals;
    params: ExecuteAgentParams;
    calc: MJActionEntityExtended;
    /** One call; log rows are tracked for teardown before anything can throw. */
    call(expression: string, options?: { skipCircuitBreaker?: boolean }): Promise<{ result: ActionResult; elapsedMs: number }>;
}

async function makeBreakerHarness(ctx: IntegrationCheckContext, checkId: string): Promise<BreakerHarness | undefined> {
    const engine = await configuredAIEngine(ctx);
    if (engine.Agents.length === 0) {
        skipNote(checkId, 'no AI Agents in metadata — ExecuteSingleAction needs an agent for context');
        return undefined;
    }
    const actionEngine = ActionEngineServer.Instance;
    await actionEngine.Config(false, ctx.User);
    const calc = actionEngine.Actions.find(a => a.Name === BREAKER_ACTION && a.Status === 'Active');
    if (!calc) {
        skipNote(checkId, `the core '${BREAKER_ACTION}' action is not Active in this database`);
        return undefined;
    }
    const agentEnt = await ctx.Provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', ctx.User);
    Assert(await agentEnt.Load(engine.Agents[0].ID), 'existing agent loads');

    const agent = new BaseAgent();
    const internals = agent as unknown as AgentLoopInternals;
    internals._activeProvider = ctx.Provider;
    const params: ExecuteAgentParams = {
        agent: agentEnt,
        conversationMessages: [],
        contextUser: ctx.User,
        provider: ctx.Provider
    };
    const fx = requireFixture();
    return {
        agent, internals, params, calc,
        call: async (expression, options) => {
            const started = Date.now();
            const result = await agent.ExecuteSingleAction(params, { name: BREAKER_ACTION, params: { Expression: expression } }, calc, ctx.User, options);
            const elapsedMs = Date.now() - started;
            if (result.LogEntry?.ID) {
                fx.LogIds.push(result.LogEntry.ID);
            }
            return { result, elapsedMs };
        }
    };
}

/** True for a result the breaker produced instead of dispatching. */
function blockedReason(result: ActionResult): string | undefined {
    return result instanceof CircuitBreakerActionResult ? result.Reason : undefined;
}

/** Module-level accumulator (no IntegrationCheckContext slot — the framework package is not modified). */
interface AgentLoopFixture {
    /** Tagged MJ: AI Agent Runs fixture rows + runs persisted by Execute legs (deleted after steps). */
    Runs: Array<{ ID: string; Delete(): Promise<boolean> }>;
    /** Tagged step rows created through the internals (deleted first). */
    Steps: Array<{ Delete(): Promise<boolean> }>;
    /** Run IDs whose steps were created by Execute itself and must be swept by query. */
    RunIdsToSweep: string[];
    /** Action Execution Log rows written by the dispatched (non-blocked) calls in ALS7–ALS11. */
    LogIds: string[];
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
            // Exact-equality here was the same GETUTCDATE-tick flake ALS2 documents (both
            // stamps come from independent column DEFAULTs). The single-write proof is the
            // terminal fields arriving IN the insert (Status/Success/CompletedAt asserted
            // above); the timestamp only needs the never-precedes invariant.
            Assert(new Date(String(row.__mj_UpdatedAt)).getTime() >= new Date(String(row.__mj_CreatedAt)).getTime(), 'UpdatedAt must never precede CreatedAt');
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
    },
    {
        Id: 'agent-loop-standin.ALS7',
        Name: `ALS7: identical-arguments rule — ${IDENTICAL_FAILURE_THRESHOLD} failures with the same arguments block the next identical call before the engine (no log row, ~0ms); different arguments still dispatch`,
        Fn: async (ctx): Promise<void> => {
            const h = await makeBreakerHarness(ctx, 'ALS7');
            if (!h) { return; }
            for (let i = 1; i <= IDENTICAL_FAILURE_THRESHOLD; i++) {
                const { result } = await h.call(BAD_EXPRESSION);
                AssertEqual(result.Success, false, `dispatched failure ${i} reports Success=false`);
                AssertEqual(blockedReason(result), undefined, `failure ${i} was DISPATCHED, not blocked`);
                Assert(!!result.LogEntry?.ID, `failure ${i} reached the engine (Action Execution Log row created)`);
                Assert((result.Message ?? '').length > 0, `failure ${i} carries the action's own message`);
            }
            const record = h.internals._actionFailureHistory.get(BREAKER_ACTION);
            AssertEqual(record?.identicalFailures, IDENTICAL_FAILURE_THRESHOLD, 'the failure history counted the identical failures');

            const blocked = await h.call(BAD_EXPRESSION);
            AssertEqual(blockedReason(blocked.result), 'identical-arguments', 'the next identical call is blocked by the identical-arguments rule');
            AssertEqual(blocked.result.Success, false, 'a blocked call is a failed result');
            Assert(!blocked.result.LogEntry, 'a blocked call never reaches the engine: no Action Execution Log row');
            Assert(blocked.elapsedMs < 250, `a blocked call short-circuits (took ${blocked.elapsedMs}ms)`);
            Assert((blocked.result.Message ?? '').includes('identical arguments'), 'the blocked message tells the model why');

            const different = await h.call('Math.sqrt(-1)');
            AssertEqual(blockedReason(different.result), undefined, 'different arguments still dispatch (the rule is per-arguments, not per-action)');
            Assert(!!different.result.LogEntry?.ID, 'the different-arguments call reached the engine');
            console.log(`      → ${IDENTICAL_FAILURE_THRESHOLD} identical failures dispatched, the 3rd blocked in ${blocked.elapsedMs}ms with no log row; new arguments dispatched`);
        }
    },
    {
        Id: 'agent-loop-standin.ALS8',
        Name: `ALS8: attempt budget — ${ACTION_FAILURE_BUDGET} consecutive failures across DIFFERENT arguments disable the action for the run; the next call is blocked whatever its arguments`,
        Fn: async (ctx): Promise<void> => {
            const h = await makeBreakerHarness(ctx, 'ALS8');
            if (!h) { return; }
            for (let i = 1; i <= ACTION_FAILURE_BUDGET; i++) {
                const { result } = await h.call(`${BAD_EXPRESSION} + ${i}`);
                AssertEqual(blockedReason(result), undefined, `varied-argument failure ${i} dispatched (self-correction room)`);
                AssertEqual(result.Success, false, `varied-argument failure ${i} failed at the engine`);
            }
            const record = h.internals._actionFailureHistory.get(BREAKER_ACTION);
            AssertEqual(record?.totalConsecutiveFailures, ACTION_FAILURE_BUDGET, 'the budget counted every consecutive failure');
            AssertEqual(record?.identicalFailures, 1, 'no two calls shared arguments, so the identical counter never grew');

            const blocked = await h.call('1 + 1 + fresh_arguments');
            AssertEqual(blockedReason(blocked.result), 'attempts-exhausted', 'the budget rule blocks the next call even with new arguments');
            Assert(!blocked.result.LogEntry, 'the budget-blocked call wrote no log row');
            console.log(`      → ${ACTION_FAILURE_BUDGET} varied failures dispatched; call ${ACTION_FAILURE_BUDGET + 1} blocked on the budget`);
        }
    },
    {
        Id: 'agent-loop-standin.ALS9',
        Name: 'ALS9: a success clears both counters — after identical failures, one good call re-opens the action for the very arguments that failed',
        Fn: async (ctx): Promise<void> => {
            const h = await makeBreakerHarness(ctx, 'ALS9');
            if (!h) { return; }
            for (let i = 1; i <= IDENTICAL_FAILURE_THRESHOLD; i++) {
                await h.call(BAD_EXPRESSION);
            }
            Assert(!!h.internals._actionFailureHistory.get(BREAKER_ACTION), 'precondition: failure history exists');

            const good = await h.call('(2 * 3) + 4');
            AssertEqual(good.result.Success, true, `the valid expression succeeds: ${good.result.Message}`);
            AssertEqual(h.internals._actionFailureHistory.has(BREAKER_ACTION), false, 'a success cleared the failure record');

            const again = await h.call(BAD_EXPRESSION);
            AssertEqual(blockedReason(again.result), undefined, 'the previously-blocked arguments dispatch again after a success');
            Assert(!!again.result.LogEntry?.ID, 'the re-opened call reached the engine');
            console.log('      → identical failures, one success, identical arguments dispatch again');
        }
    },
    {
        Id: 'agent-loop-standin.ALS10',
        Name: 'ALS10: fatal lockout — one credential/configuration failure disables the action for the run, for ANY arguments, before the engine',
        Fn: async (ctx): Promise<void> => {
            const h = await makeBreakerHarness(ctx, 'ALS10');
            if (!h) { return; }
            // The core fixture action cannot produce a credential failure on demand, so the lockout
            // is recorded through the same method a dispatched fatal failure goes through; what is
            // under test is the breaker's response to it on every later call.
            const action: AgentAction = { name: BREAKER_ACTION, params: { Expression: BAD_EXPRESSION } };
            h.internals.recordActionFailure(action, h.calc, 'API key not found for the expression service', h.internals.normalizeActionParams(action.params));
            Assert(h.internals._fatalActionFailures.has(BREAKER_ACTION), 'a fatal message locks the action out');
            AssertEqual(h.internals._actionFailureHistory.has(BREAKER_ACTION), false, 'a fatal failure is not counted in the parameter-aware history');

            const same = await h.call(BAD_EXPRESSION);
            AssertEqual(blockedReason(same.result), 'fatal', 'the next call is blocked as fatal');
            Assert(!same.result.LogEntry, 'the fatal-blocked call wrote no log row');
            Assert(same.elapsedMs < 250, `fatal block short-circuits (took ${same.elapsedMs}ms)`);

            const other = await h.call('(2 * 3) + 4');
            AssertEqual(blockedReason(other.result), 'fatal', 'fatal lockout is argument-independent: even a valid call is blocked');
            Assert(!other.result.LogEntry, 'the valid-but-locked-out call never reached the engine');
            console.log(`      → fatal lockout blocks identical and different arguments alike, ${same.elapsedMs}ms / ${other.elapsedMs}ms`);
        }
    },
    {
        Id: 'agent-loop-standin.ALS11',
        Name: 'ALS11: skipCircuitBreaker (ForEach / While / pipeline callers) bypasses all three rules and leaves the failure history untouched in both directions',
        Fn: async (ctx): Promise<void> => {
            const h = await makeBreakerHarness(ctx, 'ALS11');
            if (!h) { return; }
            // Lock the action out fatally AND build an identical-arguments record, then prove the
            // exempt path ignores both and neither dispatch outcome moves the counters.
            const action: AgentAction = { name: BREAKER_ACTION, params: { Expression: BAD_EXPRESSION } };
            h.internals.recordActionFailure(action, h.calc, 'API key not found for the expression service', h.internals.normalizeActionParams(action.params));
            const before = { fatal: h.internals._fatalActionFailures.has(BREAKER_ACTION), record: h.internals._actionFailureHistory.get(BREAKER_ACTION) };
            AssertEqual(before.fatal, true, 'precondition: fatal lockout in place');

            const exemptFailure = await h.call(BAD_EXPRESSION, { skipCircuitBreaker: true });
            AssertEqual(blockedReason(exemptFailure.result), undefined, 'the exempt call is dispatched despite the fatal lockout');
            AssertEqual(exemptFailure.result.Success, false, 'the exempt call ran and failed at the engine');
            Assert(!!exemptFailure.result.LogEntry?.ID, 'the exempt call reached the engine (log row created)');
            AssertEqual(h.internals._actionFailureHistory.has(BREAKER_ACTION), false, 'an exempt failure did not create a failure record');

            const exemptSuccess = await h.call('(2 * 3) + 4', { skipCircuitBreaker: true });
            AssertEqual(exemptSuccess.result.Success, true, 'the exempt valid call succeeds');
            AssertEqual(h.internals._fatalActionFailures.has(BREAKER_ACTION), true, 'an exempt success did not clear the fatal lockout');

            const guarded = await h.call('(2 * 3) + 4');
            AssertEqual(blockedReason(guarded.result), 'fatal', 'the next guarded call is still blocked: the exempt calls changed nothing');
            console.log('      → exempt calls dispatch through a lockout and leave the breaker state exactly as they found it');
        }
    },
    {
        Id: 'agent-loop-standin.ALS12',
        Name: 'ALS12: a bound parameter (boundActionParams) replaces the model\'s value at dispatch and is marked Bound in the execution log',
        Fn: async (ctx): Promise<void> => {
            const h = await makeBreakerHarness(ctx, 'ALS12');
            if (!h) { return; }
            // The model asks for the expression the action refuses; the binding fixes it to one that works.
            h.params.boundActionParams = { [h.calc.ID]: { Expression: '(2 * 3) + 4' } };
            const { result } = await h.call(BAD_EXPRESSION);
            AssertEqual(result.Success, true, 'the bound expression ran, not the model\'s');
            Assert(!!result.LogEntry?.ID, 'the dispatched call wrote an Action Execution Log row');
            const logged = JSON.parse(result.LogEntry?.Params ?? '[]') as Array<{ Name: string; Value: unknown; Bound?: boolean }>;
            const expression = logged.find(p => p.Name === 'Expression');
            AssertEqual(expression?.Value, '(2 * 3) + 4', 'the log holds the bound value');
            AssertEqual(expression?.Bound, true, 'the log marks the parameter Bound');
            Assert(!(result.LogEntry?.Params ?? '').includes(BAD_EXPRESSION), 'the model\'s discarded value is not in the log');
            console.log('      → bound value dispatched and marked Bound in the execution log');
        }
    },
    {
        Id: 'agent-loop-standin.ALS13',
        Name: 'ALS13: a binding that names no input of the action refuses the call before the engine, tells the model only that the action is unavailable, and locks it out for the run',
        Fn: async (ctx): Promise<void> => {
            const h = await makeBreakerHarness(ctx, 'ALS13');
            if (!h) { return; }
            h.params.boundActionParams = { [h.calc.ID]: { NotAParameter: 'x' } };
            const refused = await h.call('1 + 1');
            AssertEqual(blockedReason(refused.result), 'fatal', 'the refusal is a fatal block');
            Assert(!refused.result.LogEntry, 'a refused call never reached the engine: no log row');
            Assert(!(refused.result.Message ?? '').includes('NotAParameter'), 'the model is not told which parameter is bound');
            Assert(h.internals._fatalActionFailures.has(BREAKER_ACTION), 'the action is locked out for the run');
            delete h.params.boundActionParams;
            const after = await h.call('1 + 1');
            AssertEqual(blockedReason(after.result), 'fatal', 'the lockout holds for later calls, like any fatal failure');
            Assert(!after.result.LogEntry, 'the locked-out call wrote no log row');
            console.log('      → refused before the engine, generic message, locked out for the run');
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
        fixture = { Runs: [], Steps: [], RunIdsToSweep: [], LogIds: [] };
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
        // 4. Action Execution Log rows from the dispatched breaker calls (ALS7–ALS11). The log
        //    INSERT/UPDATE ride a fire-and-forget queue — let them land before deleting.
        if (fx.LogIds.length > 0) {
            await settle(1500);
        }
        for (const id of [...fx.LogIds].reverse()) {
            try {
                const log = await ctx.Provider.GetEntityObject<MJActionExecutionLogEntity>('MJ: Action Execution Logs', ctx.User);
                if (await log.Load(id)) { await log.Delete(); }
            } catch (e) { console.error('Action log cleanup failed:', e); }
        }
        fixture = undefined;
    }
});
