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
        Name: 'PG3: a DELETE under an :add,update grant is blocked + recorded (per-op suffix enforced)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = guardOrSkip('PG3'); if (!fx) return;
            const marker = newMarker('IT-PG3');
            const present = `PRESENT-${marker}`;
            const rootRunId = await runWithCompliance(
                () => runParent(ctx, fx, { analysis: { x: present }, __marker: marker }, 'IT: Payload Child',
                    'delete the payload element at path analysis.x (operation: delete)'),
                async (id) => /delete/i.test(await childPromptText(ctx, id, fx.ChildID)) && (await childPromptText(ctx, id, fx.ChildID)).includes('analysis.x'),
                'PG3 delete-block'
            );
            const run = await readRun(ctx.Provider, ctx.User, rootRunId);
            const analysis = parseJsonObject(JSON.stringify(parseJsonObject(run?.FinalPayload).analysis ?? {}));
            AssertEqual(analysis.x, present, 'PG3: the ungranted DELETE slipped through — analysis.x was removed');

            const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
            const attempted = subAgentSteps(steps)
                .map(parseStepPayloadChange)
                .flatMap((p) => p?.payloadValidation?.upstreamMergeViolations?.attemptedOperations ?? []);
            Assert(
                attempted.some((o) => (o.path ?? '').includes('analysis.x') && /delete|remove/i.test(o.operation ?? '')),
                `PG3: the blocked delete was not recorded as a violation: ${JSON.stringify(attempted)}`
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
            await withAgentFieldOverride(ctx, 'IT: Payload Child', 'Status', 'Disabled', async () => {
                // The disabled child cannot run — delegation fails. Phase P: the parent still attempted delegation.
                const rootRunId = await runWithCompliance(
                    () => runParent(ctx, fx, { __marker: marker }, 'IT: Payload Child'),
                    async (id) => (await readSteps(ctx.Provider, ctx.User, id)).some((s) => s.StepType === 'Sub-Agent'),
                    'PG8 failed-subagent'
                );
                const run = await readRun(ctx.Provider, ctx.User, rootRunId);
                const finalPayload = parseJsonObject(run?.FinalPayload);
                Assert(!('analysis' in finalPayload) && !('secret' in finalPayload),
                    `PG8: state from a failed sub-agent was merged into the parent: ${JSON.stringify(finalPayload)}`);
                const steps = await readSteps(ctx.Provider, ctx.User, rootRunId);
                const sub = subAgentSteps(steps);
                Assert(sub.length === 0 || sub.every((s) => s.Status !== 'Completed' || !s.PayloadAtEnd || !JSON.parse(s.PayloadAtEnd || '{}').analysis),
                    'PG8: the failed Sub-Agent step still carried a merged analysis payload');
            });
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
                const childText = await childPromptText(ctx, rootRunId, fx.ChildID);
                // CURRENT contract (Q4a, unresolved): malformed downstream JSON ⇒ ["*"] ⇒ FULL payload reaches
                // the child, so the `secret` sentinel is now visible (the inverse of PG1). This check PINS that
                // behavior so any change (e.g. a future fail-CLOSED ruling) surfaces here loudly.
                Assert(childText.includes(secretVal),
                    'PG9: malformed downstream JSON did NOT fail open to ["*"] — behavior changed; reconcile with Amith Q4a and update this pin.');
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
