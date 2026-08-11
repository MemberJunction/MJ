/**
 * agent-payload-guards.checks.ts — the 'agent-payload-guards' bundle (PG1–PG9): live-model,
 * CLIENT-FIRST end-to-end coverage of the sub-agent payload scoping guards in PayloadManager +
 * BaseAgent. Per the extended-agents proposal §7 this is the HIGHEST-VALUE bundle in that plan:
 * PayloadManager guard ENFORCEMENT had ZERO unit AND zero integration coverage before this.
 *
 * MACHINERY UNDER TEST (verified anchors):
 *   - Downstream extraction silently strips sibling keys (base-agent.ts:9241; PayloadDownstreamPaths).
 *   - Upstream merge blocks ungranted ops into `blockedOperations`, persisted as
 *     `payloadChangeResult.payloadValidation.upstreamMergeViolations` in the Sub-Agent step's
 *     OutputData (base-agent.ts:8303 / :9488; PayloadManager.ts:257 empty-grant warning).
 *   - Per-op suffixes (`analysis.*:add,update`) block a delete that isn't granted.
 *   - PayloadScope slices the sub-agent's payload root (applyPayloadScope) and reverse-slices writes
 *     back (reversePayloadScope); a scope naming a MISSING path is a HARD Critical failure
 *     (base-agent.ts:9294) — the one fail-CLOSED guard.
 *   - Self-write paths are UNRESTRICTED by default (fail-open); when set they gate the top agent's
 *     own writes, blocked ops recorded as `selfWriteViolations.deniedOperations`.
 *
 * DETERMINISM (§3.1/§3.3): the model is nondeterministic, the framework is not. Every assertion
 * reads deterministic framework state (run/step Payload snapshots + step OutputData); model prose
 * is never asserted. Each guard check is TWO-PHASE with bounded retries: Phase P proves the guarded
 * behavior was ATTEMPTED (the child's persisted raw response contains the attempted path), so
 * "nothing blocked" can never pass vacuously; Phase A (never retried) asserts the machinery.
 *
 * SEEDED ROSTER (metadata-optional/integration-test/ai-agents/.it-payload-agents.json):
 *   IT: Payload Parent  → delegates once to a child, never writes payload itself.
 *   IT: Payload Child   → PayloadDownstreamPaths=["customer.*"], PayloadUpstreamPaths=["analysis.*:add,update"].
 *   IT: Payload Scoped Child → PayloadScope="/analysis".
 *   IT: Self-Write Restricted → PayloadSelfWritePaths=["notes.*"].
 *
 * SELF-CLEANING: every run tree a check spawns is FK-ordered deep-deleted in Teardown. Checks that
 * must vary un-seeded config (PG4 empty-upstream, PG8 disabled-child, PG9 malformed-downstream)
 * snapshot the field, save, run, and RESTORE in a finally — the AL7 "deactivate-in-fixture" pattern.
 */
import { Assert, AssertEqual, IntegrationCheckRegistry, NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import type { AgentInvoker } from './_it-live-agent-harness';
import {
    resolveClient, newMarker, loadAgentByName, runAgentClient, runIdOf, settle,
    readRun, readSteps, readPromptRunsForAgent, parseStepPayloadChange, parseJsonObject,
    deepDeleteRunTrees, runWithCompliance,
    AgentStepRow
} from './_it-live-agent-harness';

/** Module-level fixture (no IntegrationCheckContext slot — the framework package is not modified). */
interface PayloadGuardsFixture {
    Client?: AgentInvoker;
    Parent?: MJAIAgentEntity;
    SelfWrite?: MJAIAgentEntity;
    ChildID: string;
    ScopedChildID: string;
    /** Every root run ID a check produced, deep-deleted in Teardown. */
    CreatedRootRunIds: string[];
    Skip?: string;
}

let fixture: PayloadGuardsFixture | undefined;

function requireFixture(): PayloadGuardsFixture {
    if (!fixture) throw new Error('agent-payload-guards fixture not initialized — Setup must run first.');
    return fixture;
}

/** Loud skip-as-pass note (client transport unavailable / roster unseeded). */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ agent-payload-guards.${checkId} SKIPPED — ${reason}`);
}

/** If Setup could not establish client + roster, skip the check as a pass with a loud note. */
function guardOrSkip(checkId: string): PayloadGuardsFixture | undefined {
    const fx = requireFixture();
    if (fx.Skip) { skipNote(checkId, fx.Skip); return undefined; }
    return fx;
}

/** Track a root run for teardown and return its ID (or undefined). */
function track(fx: PayloadGuardsFixture, runId: string | undefined): string | undefined {
    if (runId) fx.CreatedRootRunIds.push(runId);
    return runId;
}

/** The Sub-Agent steps of a run whose TargetLogID links a child run. */
function subAgentSteps(steps: AgentStepRow[]): AgentStepRow[] {
    return steps.filter((s) => s.StepType === 'Sub-Agent');
}

/** Concatenate the raw Messages+Result of every prompt run a given child agent produced under a root. */
async function childPromptText(ctx: IntegrationCheckContext, rootRunId: string, childAgentId: string): Promise<string> {
    const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
    const childRunIds = subAgentSteps(steps).map((s) => s.TargetLogID).filter((id): id is string => !!id);
    if (childRunIds.length === 0) return '';
    const runs = await readPromptRunsForAgent(ctx.Provider, ctx.User, childRunIds, childAgentId);
    return runs.map((r) => `${r.Messages ?? ''}\n${r.Result ?? ''}`).join('\n');
}

/**
 * Only the child's model RESPONSES (never the prompt it was sent) under a root.
 *
 * Use this — not childPromptText — for any "did the model take the instructed action?" control.
 * childPromptText concatenates Messages + Result, and Messages contains the instruction WE wrote,
 * so grepping it for words from our own instruction passes without the model doing anything. PG3
 * was vacuous exactly that way: it asserted the child text mentioned 'delete' and 'analysis.x',
 * both of which its own instruction string supplies verbatim.
 */
async function childResultText(ctx: IntegrationCheckContext, rootRunId: string, childAgentId: string): Promise<string> {
    const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
    const childRunIds = subAgentSteps(steps).map((s) => s.TargetLogID).filter((id): id is string => !!id);
    if (childRunIds.length === 0) return '';
    const runs = await readPromptRunsForAgent(ctx.Provider, ctx.User, childRunIds, childAgentId);
    return runs.map((r) => r.Result ?? '').join('\n');
}

/** True when the child agent produced at least one prompt run under this root (delegation happened). */
async function childDelegated(ctx: IntegrationCheckContext, rootRunId: string, childAgentId: string): Promise<boolean> {
    const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
    return subAgentSteps(steps).some((s) => !!s.TargetLogID);
}

/** Run IT: Payload Parent (which delegates once) with the given starting payload + optional child instruction. */
async function runParent(
    ctx: IntegrationCheckContext, fx: PayloadGuardsFixture,
    payload: Record<string, unknown>, childName: string, childInstruction?: string
): Promise<string | undefined> {
    if (!fx.Client || !fx.Parent) return undefined;
    const parts = [`Invoke ${childName}.`];
    if (childInstruction) parts.push(`Instruction for the sub-agent: ${childInstruction}`);
    const result = await runAgentClient(fx.Client, fx.Parent, parts.join(' '), payload);
    await settle();
    return track(fx, runIdOf(result));
}

/** Snapshot a field, run body, restore in finally — for the un-seeded-config guard checks. */
async function withAgentFieldOverride<K extends 'PayloadDownstreamPaths' | 'PayloadUpstreamPaths' | 'Status'>(
    ctx: IntegrationCheckContext, agentName: string, field: K, value: MJAIAgentEntity[K],
    body: () => Promise<void>
): Promise<void> {
    const agent = await loadAgentByName(ctx.Provider, ctx.User, agentName);
    Assert(!!agent, `override target '${agentName}' loads`);
    const original = agent![field];
    agent![field] = value;
    const saved = await agent!.Save();
    Assert(saved, `override save on '${agentName}.${field}': ${agent!.LatestResult?.CompleteMessage}`);
    try {
        await body();
    } finally {
        const fresh = await loadAgentByName(ctx.Provider, ctx.User, agentName);
        if (fresh) {
            fresh[field] = original;
            if (!(await fresh.Save())) {
                console.error(`  ✗ FAILED TO RESTORE '${agentName}.${field}' — manual fix needed: ${fresh.LatestResult?.CompleteMessage}`);
            }
        }
    }
}

const CUSTOMER_SENTINEL = 'IT-CUST';
const SECRET_SENTINEL = 'IT-SECRET-LEAK';

export const PayloadGuardsChecks: NamedCheck[] = [
    {
        Id: 'agent-payload-guards.PG1',
        Name: 'PG1: downstream extraction strips sibling keys — the child sees customer.* only, never secret/other',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG1'); if (!fx) return;
            const marker = newMarker('IT-PG1');
            const custVal = `${CUSTOMER_SENTINEL}-${marker}`;
            const secretVal = `${SECRET_SENTINEL}-${marker}`;
            const rootRunId = await runWithCompliance(
                () => runParent(ctx, fx, { customer: { name: custVal }, secret: { key: secretVal }, other: { z: 1 }, __marker: marker }, 'IT: Payload Child'),
                // Phase P: the child must have RECEIVED the granted (customer) data — proves the payload
                // channel is live, so the absence of `secret` below is meaningful (anti-vacuity control).
                async (id) => (await childPromptText(ctx, id, fx.ChildID)).includes(custVal),
                'PG1 downstream'
            );
            const childText = await childPromptText(ctx, rootRunId, fx.ChildID);
            Assert(childText.includes(custVal), 'PG1: granted customer.* data reached the child (positive control)');
            Assert(!childText.includes(secretVal), 'PG1: ungranted sibling `secret` LEAKED into the sub-agent context (downstream strip broken)');
        }
    },
    {
        Id: 'agent-payload-guards.PG2',
        Name: 'PG2: upstream merge blocks the ungranted secret.leak, merges only analysis.*, and RECORDS the violation',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG2'); if (!fx) return;
            const marker = newMarker('IT-PG2');
            const rootRunId = await runWithCompliance(
                () => runParent(ctx, fx, { __marker: marker }, 'IT: Payload Child'),
                // Phase P: the child's raw response must contain the attempted ungranted path.
                async (id) => /secret\.?leak|IT-LEAK-ATTEMPT/i.test(await childPromptText(ctx, id, fx.ChildID)),
                'PG2 upstream-block'
            );
            const run = await readRun(ctx.Provider, ctx.User, rootRunId);
            const finalPayload = parseJsonObject(run?.FinalPayload);
            const analysis = parseJsonObject(JSON.stringify(finalPayload.analysis ?? {}));
            AssertEqual(analysis.result, 'IT-ANALYSIS-OK', 'PG2: the GRANTED analysis.result was merged upstream');
            Assert(!('secret' in finalPayload), 'PG2: the ungranted `secret` was merged into the parent payload (block broken)');

            const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
            const violations = subAgentSteps(steps)
                .map(parseStepPayloadChange)
                .map((p) => p?.payloadValidation?.upstreamMergeViolations)
                .find((v) => !!v);
            Assert(!!violations, 'PG2: the blocked op was not recorded in upstreamMergeViolations (unauditable)');
            Assert(
                (violations!.attemptedOperations ?? []).some((o) => (o.path ?? '').includes('secret')),
                `PG2: upstreamMergeViolations does not name the blocked secret path: ${JSON.stringify(violations)}`
            );
        }
    },
    {
        Id: 'agent-payload-guards.PG3',
        Name: 'PG3: a child DELETE under an :add,update grant does not reach the parent (pins the blocked-but-unaudited seam)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG3'); if (!fx) return;
            const marker = newMarker('IT-PG3');
            const present = `PRESENT-${marker}`;
            const rootRunId = await runWithCompliance(
                () => runParent(ctx, fx, { analysis: { x: present }, __marker: marker }, 'IT: Payload Child',
                    'emit a payload change request that DELETES the element at path analysis.x — ' +
                    'set removeElements.analysis.x to the string "__DELETE__". Change nothing else.'),
                // Phase P: the CHILD must actually have emitted the delete. Read only its RESPONSES
                // (childResultText) — reading Messages too made this vacuous, since the words in our
                // own instruction would satisfy it. The bar is the emitted MECHANISM, not prose:
                // an earlier version accepted the bare word 'delete' anywhere in the reply, which a
                // model saying "I have deleted it" (while emitting no removeElements at all) passes.
                // Then the merge has nothing to block, and the missing audit record looks like a
                // product defect when the child simply never asked for the delete.
                async (id) => {
                    const emitted = await childResultText(ctx, id, fx.ChildID);
                    return /removeElements/.test(emitted) && emitted.includes('__DELETE__') && emitted.includes('analysis');
                },
                'PG3 delete-block'
            );
            const run = await readRun(ctx.Provider, ctx.User, rootRunId);
            const analysis = parseJsonObject(JSON.stringify(parseJsonObject(run?.FinalPayload).analysis ?? {}));
            AssertEqual(analysis.x, present, 'PG3: the ungranted DELETE slipped through — analysis.x was removed');

            // 🚨 WHAT THE PRODUCT ACTUALLY GUARANTEES HERE — and what it does NOT.
            //
            // The child provably emitted the delete:
            //   {"payloadChangeRequest":{"removeElements":{"analysis":{"x":"__DELETE__"}}}}
            // and `analysis.x` still survived in the parent above. So the guarantee that matters —
            // an ungranted delete does not reach the parent — HOLDS, and holds fail-safe.
            //
            // But it is not enforced by the `:add,update` suffix, and no violation is recorded.
            // `mergeUpstreamPayload` merges the child's RESULTING PAYLOAD by path pattern, not its
            // change request: a key the child removed is simply never copied back, so no "delete
            // operation" ever presents itself at the upstream boundary for `isOperationAllowedForPath`
            // to deny. PayloadManager's delete-denial branch — which does push both a warning and a
            // `blockedOperations` entry — sits on the SELF-write path (`processKeyChange`), which this
            // scenario never reaches. Hence: blocked, silently, with an empty audit trail.
            //
            // This check therefore pins the seam as it is (the PG9 treatment) rather than asserting a
            // per-op audit the upstream merge does not implement. Closing the audit gap means teaching
            // the upstream merge to diff parent-vs-child for removals and evaluate delete grants — a
            // behaviour change in the merge engine, not a release-prep edit. If someone implements it,
            // THIS assertion flips and the one below becomes the real per-op audit assertion.
            const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
            const blobs = subAgentSteps(steps).map(parseStepPayloadChange);
            const attempted = blobs.flatMap((p) => p?.payloadValidation?.upstreamMergeViolations?.attemptedOperations ?? []);
            const warnings = blobs.flatMap((p) => p?.warnings ?? []);
            // The child's own emitted text goes in the message: fixtures are purged at teardown, so a
            // red here cannot be re-queried from the database afterwards.
            const emitted = await childResultText(ctx, rootRunId, fx.ChildID);
            Assert(
                emitted.includes('__DELETE__') && emitted.includes('analysis'),
                `PG3: the child never actually emitted the delete, so nothing about the guard was exercised.\n` +
                `  child emitted: ${emitted.slice(0, 1200)}`
            );
            Assert(
                !attempted.some((o) => (o.path ?? '').includes('analysis.x') && /delete|remove/i.test(o.operation ?? '')),
                `PG3: the upstream boundary NOW records a per-op delete violation — the audit gap this check ` +
                `pins has been closed. Flip this assertion to require the record, and drop this comment.\n` +
                `  attemptedOperations: ${JSON.stringify(attempted)}\n` +
                `  merge warnings:      ${JSON.stringify(warnings)}`
            );
        }
    },
    {
        Id: 'agent-payload-guards.PG4',
        Name: 'PG4: PayloadUpstreamPaths=[] ignores ALL child changes (empty-grant is NOT all-grant)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG4'); if (!fx) return;
            const marker = newMarker('IT-PG4');
            await withAgentFieldOverride(ctx, 'IT: Payload Child', 'PayloadUpstreamPaths', '[]', async () => {
                const rootRunId = await runWithCompliance(
                    () => runParent(ctx, fx, { __marker: marker }, 'IT: Payload Child'),
                    async (id) => /analysis\.?result|IT-ANALYSIS-OK/i.test(await childPromptText(ctx, id, fx.ChildID)),
                    'PG4 empty-grant'
                );
                const run = await readRun(ctx.Provider, ctx.User, rootRunId);
                const finalPayload = parseJsonObject(run?.FinalPayload);
                Assert(!('analysis' in finalPayload) && !('secret' in finalPayload),
                    `PG4: empty upstream grant still merged child changes: ${JSON.stringify(finalPayload)}`);
                // Best-effort: the framework's "no upstream paths" warning should surface in a step's OutputData.
                const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
                const warned = steps.some((s) => (s.OutputData ?? '').includes('No upstream paths specified'));
                if (warned) console.log('      → PG4: "No upstream paths specified" warning surfaced in step OutputData');
                else console.log('      → PG4: no-merge proven; warning string not surfaced in step OutputData (outcome is the load-bearing proof)');
            });
        }
    },
    {
        Id: 'agent-payload-guards.PG5',
        Name: 'PG5: PayloadScope=/analysis — scoped child sees ONLY that subtree; its write reverse-slices back under /analysis',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG5'); if (!fx) return;
            const marker = newMarker('IT-PG5');
            const seed = `IT-SEED-${marker}`;
            const custVal = `${CUSTOMER_SENTINEL}-${marker}`;
            const rootRunId = await runWithCompliance(
                () => runParent(ctx, fx, { analysis: { seed }, customer: { name: custVal }, __marker: marker }, 'IT: Payload Scoped Child'),
                async (id) => /IT-SCOPED-OK|"result"/i.test(await childPromptText(ctx, id, fx.ScopedChildID)),
                'PG5 scope'
            );
            const run = await readRun(ctx.Provider, ctx.User, rootRunId);
            const analysis = parseJsonObject(JSON.stringify(parseJsonObject(run?.FinalPayload).analysis ?? {}));
            AssertEqual(analysis.result, 'IT-SCOPED-OK', 'PG5: the scoped write did not reverse-slice back under /analysis');
            AssertEqual(analysis.seed, seed, 'PG5: reverse-scope clobbered a sibling of the scoped subtree');

            // The scoped child must NOT have seen the out-of-scope `customer` sentinel.
            const childText = await childPromptText(ctx, rootRunId, fx.ScopedChildID);
            Assert(!childText.includes(custVal), 'PG5: out-of-scope `customer` leaked into the scoped child (scope slice broken)');
        }
    },
    {
        Id: 'agent-payload-guards.PG6',
        Name: 'PG6: PayloadScope naming a MISSING path is a HARD Critical failure (the one fail-closed guard)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG6'); if (!fx) return;
            const marker = newMarker('IT-PG6');
            // Starting payload OMITS `analysis`, so the scoped child's PayloadScope='/analysis' cannot resolve.
            const rootRunId = await runWithCompliance(
                () => runParent(ctx, fx, { customer: { name: `${CUSTOMER_SENTINEL}-${marker}` }, __marker: marker }, 'IT: Payload Scoped Child'),
                // Compliant when the framework surfaced the critical scope error somewhere in the tree.
                async (id) => criticalScopeErrorPresent(await gatherErrorText(ctx, id)),
                'PG6 scope-missing'
            );
            const errText = await gatherErrorText(ctx, rootRunId);
            Assert(criticalScopeErrorPresent(errText),
                `PG6: missing-scope-path did NOT fail closed with the Critical message: ${errText.slice(0, 400)}`);
            Assert(errText.includes('/analysis'), 'PG6: the critical error did not name the offending scope path /analysis');
        }
    },
    {
        Id: 'agent-payload-guards.PG7',
        Name: 'PG7: self-write default is fail-OPEN (null paths); IT: Self-Write Restricted blocks config.b, lands notes.a',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG7'); if (!fx) return;
            // Part A — pin the fail-OPEN default: a default agent (IT: Payload Child) has NULL self-write paths.
            const child = await loadAgentByName(ctx.Provider, ctx.User, 'IT: Payload Child');
            Assert(!!child, 'PG7: IT: Payload Child loads');
            AssertEqual(child!.PayloadSelfWritePaths, null, 'PG7: the default self-write contract flipped CLOSED (would break every agent)');

            // Part B — the restricted agent enforces its allow-list.
            Assert(!!fx.SelfWrite && !!fx.Client, 'PG7: IT: Self-Write Restricted + client available');
            const marker = newMarker('IT-PG7');
            const selfRunId = await runWithCompliance(
                async () => {
                    const r = await runAgentClient(fx.Client!, fx.SelfWrite!, `Perform your scripted self-write. Marker ${marker}.`);
                    await settle();
                    return track(fx, runIdOf(r));
                },
                // Phase P: the agent's raw response attempted the restricted path.
                async (id) => /config\.?b|IT-CONFIG-ATTEMPT/i.test(await selfAgentText(ctx, id, fx.SelfWrite!.ID)),
                'PG7 self-write'
            );
            const run = await readRun(ctx.Provider, ctx.User, selfRunId);
            const finalPayload = parseJsonObject(run?.FinalPayload);
            const notes = parseJsonObject(JSON.stringify(finalPayload.notes ?? {}));
            AssertEqual(notes.a, 'IT-NOTES-OK', 'PG7: the ALLOWED notes.a self-write did not land');
            Assert(!('config' in finalPayload), 'PG7: the RESTRICTED config.b self-write leaked into the payload');

            const steps = await readSteps(ctx.Provider, ctx.User, selfRunId);
            const denied = steps
                .map(parseStepPayloadChange)
                .flatMap((p) => p?.payloadValidation?.selfWriteViolations?.deniedOperations ?? []);
            Assert(denied.some((o) => (o.path ?? '').includes('config')),
                `PG7: the blocked self-write was not recorded in selfWriteViolations: ${JSON.stringify(denied)}`);
        }
    },
    {
        Id: 'agent-payload-guards.PG8',
        Name: 'PG8: a FAILED sub-agent merges NO upstream state (no partial-state merge from failures)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG8'); if (!fx) return;
            const marker = newMarker('IT-PG8');
            {
                // HOW THIS FORCES A FAILED DELEGATION — and why it no longer flips Status.
                // The original fixture set 'IT: Payload Child'.Status='Disabled'. That CANNOT work in
                // process: the parent's sub-agent set comes from buildAgentBaseCatalog, which is cached on
                // AIEngine and (per its own doc at base-agent.ts ~6585) "does NOT apply any runtime
                // overrides" — so the child stayed delegatable and ran to completion, and this check never
                // once exercised its own scenario. Verified during the 6.1 release.
                // Instead reuse PG6's proven, SEEDED failure mode, which needs no runtime invalidation at
                // all: 'IT: Payload Scoped Child' has PayloadScope='/analysis', so delegating with a payload
                // that OMITS `analysis` is a hard Critical scope failure. PG6 asserts that it fails; PG8
                // asserts the complementary half — that the failure merged nothing upstream.
                const rootRunId = await runWithCompliance(
                    () => runParent(ctx, fx, { customer: { name: `${CUSTOMER_SENTINEL}-${marker}` }, __marker: marker }, 'IT: Payload Scoped Child'),
                    async (id) => (await readSteps(ctx.Provider, ctx.User, id)).some((s) => s.StepType === 'Sub-Agent'),
                    'PG8 failed-subagent'
                );
                // WHAT THE PRODUCT ACTUALLY GUARANTEES (base-agent.ts ~9429): `mergedPayload` is
                // initialized to the parent's own pre-delegation payload and `mergeUpstreamPayload` is
                // called ONLY inside `if (subAgentResult.success)`. So the no-merge contract states
                // exactly this: on a failed sub-agent the step's PayloadAtEnd is BYTE-FOR-BYTE the
                // payload it started with. That is model-independent and directly observable.
                //
                // Two earlier framings of this check were NOT discriminating, and both produced false
                // reds during the 6.1 release:
                //   1. `!('analysis' in FinalPayload)` — the parent owns its payload and its live model
                //      may legitimately write an `analysis` key itself once delegation fails.
                //   2. `!parseJsonObject(step.PayloadAtEnd).analysis` — PayloadAtEnd on a FAILED step
                //      equals PayloadAtStart, so if the parent had already written `analysis` before
                //      delegating, this reds while the guard is working perfectly.
                // Comparing End against Start removes the parent's own authorship from the question
                // entirely: whatever the parent wrote is in BOTH sides and cancels out.
                const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
                const sub = subAgentSteps(steps);
                const stepEvidence = sub
                    .map((s, i) => `  [${i}] Status=${s.Status} err=${(s.ErrorMessage ?? '').slice(0, 120)}\n      AtStart=${(s.PayloadAtStart ?? '(null)').slice(0, 300)}\n      AtEnd  =${(s.PayloadAtEnd ?? '(null)').slice(0, 300)}`)
                    .join('\n') || '  (no Sub-Agent steps)';

                // The scenario is only meaningful if delegation genuinely did NOT succeed. The scoped child's
                // seeded PayloadScope='/analysis' cannot resolve against a payload that omits `analysis`, so a
                // success here means the seeded fixture drifted (scope removed, or `analysis` reintroduced
                // into the starting payload) — a fixture problem, not a guard failure. Say which.
                const childRan = sub.some((s) => !!s.TargetLogID && s.Status === 'Completed' && !s.ErrorMessage);
                Assert(!childRan,
                    `PG8 FIXTURE DRIFT: delegation to 'IT: Payload Scoped Child' SUCCEEDED, so the failed-delegation ` +
                    `path was never exercised. That agent's seeded PayloadScope must be '/analysis' and PG8's ` +
                    `starting payload must OMIT 'analysis' for the scope to fail closed (the same mechanism PG6 ` +
                    `asserts). Check both before touching the no-merge assertions below.\n` +
                    `Sub-Agent steps:\n${stepEvidence}`);

                Assert(sub.length > 0,
                    `model-noncompliance: PG8 — the parent never emitted a Sub-Agent step, so no delegation ` +
                    `was attempted and the no-merge guard was not exercised.`);

                for (const s of sub) {
                    // A null PayloadAtEnd means no post-delegation payload was ever recorded on the step,
                    // which is the no-merge outcome — not a mismatch. Only a PRESENT PayloadAtEnd that
                    // differs from PayloadAtStart evidences a merge.
                    if (!s.PayloadAtEnd) continue;
                    // Compare parsed objects, not raw strings: serialization key order is not part of the
                    // contract, and a re-serialized-but-identical payload is not a merge.
                    const before = JSON.stringify(parseJsonObject(s.PayloadAtStart));
                    const after = JSON.stringify(parseJsonObject(s.PayloadAtEnd));
                    Assert(before === after,
                        `PG8: a FAILED sub-agent's upstream state WAS merged into the parent — the Sub-Agent ` +
                        `step's payload changed across the failed delegation. Sub-Agent steps:\n${stepEvidence}`);
                }
            }
        }
    },
    {
        Id: 'agent-payload-guards.PG9',
        Name: 'PG9: malformed PayloadDownstreamPaths JSON currently fails OPEN to ["*"] (pins Q4a behavior)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG9'); if (!fx) return;
            const marker = newMarker('IT-PG9');
            const secretVal = `${SECRET_SENTINEL}-${marker}`;
            // Set the downstream paths column to non-JSON text; the getter/parse must fall open to ["*"].
            await withAgentFieldOverride(ctx, 'IT: Payload Child', 'PayloadDownstreamPaths', 'not-valid-json {[', async () => {
                const rootRunId = await runWithCompliance(
                    () => runParent(ctx, fx, { customer: { name: `${CUSTOMER_SENTINEL}-${marker}` }, secret: { key: secretVal }, __marker: marker }, 'IT: Payload Child'),
                    (id) => childDelegated(ctx, id, fx.ChildID),
                    'PG9 malformed-downstream'
                );
                // THE AUTHORITATIVE SURFACE is the payload the CHILD RUN actually received, which
                // base-agent.ts persists as the child's own Prompt-step PayloadAtStart (~8791,
                // `payloadAtStart: payload`, where `payload` is the DOWNSTREAM-FILTERED `scopedPayload`).
                //
                // Two nearby surfaces are wrong and must not be used:
                //   - the child's PROMPT TEXT (what this check used to assert): whether a payload key is
                //     rendered into the model-facing message depends on the child's prompt template and
                //     the model, so a satisfied contract can still show no sentinel. That is what reported
                //     "behavior changed" during the 6.1 release while the rule was in fact intact.
                //   - the PARENT's Sub-Agent-step PayloadAtStart (~9415, `previousDecision.newPayload`):
                //     that is the parent's UNFILTERED payload, recorded before scoping, so it contains the
                //     sentinel no matter what the downstream paths were. Asserting on it passes vacuously.
                const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
                const childRunIds = subAgentSteps(steps).map((s) => s.TargetLogID).filter((id): id is string => !!id);
                Assert(childRunIds.length > 0,
                    `model-noncompliance: PG9 — the parent never produced a linked child run, so no downstream ` +
                    `payload was ever computed and the fail-open rule was not exercised.`);
                const childSteps = (await Promise.all(
                    childRunIds.map((id) => readSteps(ctx.Provider, ctx.User, id))
                )).flat();
                const receivedByChild = childSteps.map((s) => s.PayloadAtStart ?? '').join('\n');

                // CURRENT contract (Q4a, unresolved): malformed downstream JSON ⇒ ["*"] ⇒ the FULL payload
                // reaches the child, so the `secret` sentinel IS present in what the child received (the
                // inverse of PG1). This PINS that behavior so a future fail-CLOSED ruling surfaces loudly.
                // The rule itself is pure and synchronous and is ALSO pinned deterministically by
                // packages/AI/Agents/src/__tests__/subagent-payload-paths-failopen.test.ts — this check adds
                // the end-to-end evidence that the computed paths really do govern what the child receives.
                Assert(receivedByChild.includes(secretVal),
                    `PG9: malformed downstream JSON did NOT fail open to ["*"] — the child run did NOT receive ` +
                    `the \`secret\` sentinel; behavior changed. Reconcile with Amith Q4a and update this pin. ` +
                    `Child-run PayloadAtStart: ${receivedByChild.slice(0, 400) || '(empty)'}`);

                // Corroborating only, and deliberately NOT fatal on its own: if the child received the
                // sentinel but never surfaced it in prompt text, that is template/model rendering variance.
                const childText = await childPromptText(ctx, rootRunId, fx.ChildID);
                if (!childText.includes(secretVal)) {
                    console.log('      → PG9 note: the child RECEIVED the sentinel (contract satisfied) but did not render it into prompt text — template/model variance, not a guard failure.');
                }
                console.log('      → PG9: malformed PayloadDownstreamPaths failed OPEN to ["*"] (current, unratified behavior — see proposal Q4a)');
            });
        }
    }
];

/** Gather run + step + sub-agent error text across a root run tree (for the PG6 critical-scope assertion). */
async function gatherErrorText(ctx: IntegrationCheckContext, rootRunId: string): Promise<string> {
    const parts: string[] = [];
    const run = await readRun(ctx.Provider, ctx.User, rootRunId);
    if (run?.ErrorMessage) parts.push(run.ErrorMessage);
    const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
    for (const s of steps) {
        if (s.ErrorMessage) parts.push(s.ErrorMessage);
        if (s.OutputData) parts.push(s.OutputData);
        if (s.FinalPayloadValidationMessages) parts.push(s.FinalPayloadValidationMessages);
        if (s.TargetLogID) {
            const sub = await readRun(ctx.Provider, ctx.User, s.TargetLogID);
            if (sub?.ErrorMessage) parts.push(sub.ErrorMessage);
        }
    }
    return parts.join('\n');
}

function criticalScopeErrorPresent(text: string): boolean {
    return /Critical: Failed to extract payload scope/i.test(text);
}

/** Concatenate raw prompt text for a TOP-LEVEL agent's own run (self-write / plan agents). */
async function selfAgentText(ctx: IntegrationCheckContext, rootRunId: string, agentId: string): Promise<string> {
    const runs = await readPromptRunsForAgent(ctx.Provider, ctx.User, [rootRunId], agentId);
    return runs.map((r) => `${r.Messages ?? ''}\n${r.Result ?? ''}`).join('\n');
}

for (const check of PayloadGuardsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-payload-guards', {
    Setup: async (ctx: IntegrationCheckContext) => {
        fixture = { ChildID: '', ScopedChildID: '', CreatedRootRunIds: [] };
        const client = resolveClient(ctx.Provider, ctx.User);
        const [parent, child, scoped, selfWrite] = await Promise.all([
            loadAgentByName(ctx.Provider, ctx.User, 'IT: Payload Parent'),
            loadAgentByName(ctx.Provider, ctx.User, 'IT: Payload Child'),
            loadAgentByName(ctx.Provider, ctx.User, 'IT: Payload Scoped Child'),
            loadAgentByName(ctx.Provider, ctx.User, 'IT: Self-Write Restricted')
        ]);
        if (!parent || !child || !scoped || !selfWrite) {
            fixture.Skip = 'IT payload roster not seeded — run: npx mj sync push --dir=metadata-optional/integration-test';
            return;
        }
        fixture.Client = client;
        fixture.Parent = parent;
        fixture.SelfWrite = selfWrite;
        fixture.ChildID = child.ID;
        fixture.ScopedChildID = scoped.ID;
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const fx = fixture;
        if (!fx) return;
        await deepDeleteRunTrees(ctx.Provider, ctx.User, fx.CreatedRootRunIds);
        fixture = undefined;
    }
});
