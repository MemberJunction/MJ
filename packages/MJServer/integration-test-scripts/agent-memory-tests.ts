/**
 * agent-memory-tests.ts — LIVE-MODEL, CLIENT-FIRST integration test for the AI agent MEMORY lifecycle.
 *
 * Drives the real stack over the GraphQL wire (GraphQLAIClient → live MJAPI): runs a
 * memory-enabled agent (Sage) with conversations designed to trigger memory formation,
 * runs the Memory Manager to harden, then re-runs the agent to prove injection. The
 * SPECIFIC memories are nondeterministic (LLM), so every assertion is at the PROCESS level:
 *
 *   Phase A — Formation: a memory-triggering convo → ≥1 `MJ: AI Agent Notes` row with
 *             Status='Provisional', AuthorType='Agent' (isolated by a unique marker string).
 *   Phase B — Hardening: run the Memory Manager → the Provisional note flips to Active
 *             (ExpiresAt cleared) — a deterministic state transition.
 *   Phase C — Injection: re-run the agent → the now-Active note is injected (its AccessCount
 *             bumps and/or it appears in the run-step memoryAttribution).
 *
 * Because the LLM's decision to EMIT a memoryWrite is itself nondeterministic, Phase A runs
 * a few convos and asserts ≥1 note formed (robust), then asserts the deterministic invariants
 * on whatever formed. Self-cleaning: every note carrying the run's marker is deleted in `finally`.
 *
 * GATED: live-model tier — only runs when RUN_AGENT_TESTS=1 (real LLM calls, needs credentials).
 * PREREQUISITE: MJAPI running; a memory-enabled Sage agent + a Memory Manager agent seeded.
 *
 * USAGE:  RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/agent-memory-tests.ts
 * Exit: 0 = passed, 1 = failures, 2 = bootstrap/connectivity error, 3 = skipped (gate off).
 */
import { bootstrapIntegrationClient } from '@memberjunction/testing-integration/client';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import type { AIAgentNoteEntity, AIAgentEntity } from '@memberjunction/core-entities';

const MARKER = `MJMEMTEST-${Date.now().toString(36)}`;
let failures = 0;
const createdNoteIDs = new Set<string>();

function log(s: string): void { console.log(s); }
function assert(cond: boolean, name: string, detail = ''): void {
    if (cond) { log(`  ✓ ${name}${detail ? '  ' + detail : ''}`); }
    else { failures++; log(`  ✗ ${name}${detail ? '  ' + detail : ''}`); }
}

/** Find the memory notes this run produced (isolated by the marker embedded in each convo). */
async function findMarkerNotes(user: UserInfo): Promise<AIAgentNoteEntity[]> {
    const rv = new RunView();
    const r = await rv.RunView<AIAgentNoteEntity>({
        EntityName: 'MJ: AI Agent Notes',
        ExtraFilter: `Note LIKE '%${MARKER}%'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object',
        BypassCache: true   // always read fresh — we assert on post-mutation Status/AccessCount transitions
    }, user);
    const notes = r.Success ? r.Results : [];
    for (const n of notes) createdNoteIDs.add(n.ID);
    return notes;
}

/** Run an agent over the wire and return its completed run (with steps), or null. */
async function runAgent(client: GraphQLAIClient, agent: AIAgentEntity, message: string): Promise<Record<string, unknown> | null> {
    try {
        // The client reads params.agent.ID + params.conversationMessages (NOT agentId/messages).
        const result = await client.RunAIAgent({
            agent,
            conversationMessages: [{ role: 'user', content: message }]
        } as unknown as Parameters<GraphQLAIClient['RunAIAgent']>[0]);
        return result as unknown as Record<string, unknown>;
    } catch (e) {
        log(`    (agent run error: ${e instanceof Error ? e.message : String(e)})`);
        return null;
    }
}

async function main(): Promise<void> {
    if (process.env.RUN_AGENT_TESTS !== '1') {
        log('SKIPPED — live-model tier. Set RUN_AGENT_TESTS=1 to run (real LLM calls).');
        process.exit(3);
    }
    await bootstrapIntegrationClient();
    const md = new Metadata(); // global-provider-ok: dedicated single-provider client test process
    const user = md.CurrentUser;
    const client = new GraphQLAIClient(Metadata.Provider as unknown as GraphQLDataProvider);

    // Resolve the memory-enabled agent (Sage) + the Memory Manager.
    const rv = new RunView();
    const [sageR, mmR] = await rv.RunViews<AIAgentEntity>([
        { EntityName: 'MJ: AI Agents', ExtraFilter: `Name='Sage'`, ResultType: 'entity_object' },
        { EntityName: 'MJ: AI Agents', ExtraFilter: `Name='Memory Manager'`, ResultType: 'entity_object' }
    ], user);
    const sage = sageR.Success ? sageR.Results[0] : undefined;
    const memoryManager = mmR.Success ? mmR.Results[0] : undefined;

    console.log(`\n╭─ Agent Memory Lifecycle (client-first, live-model) — marker ${MARKER} ─`);
    console.log(`│  Sage: ${sage?.ID ?? 'NOT FOUND'}   Memory Manager: ${memoryManager?.ID ?? 'NOT FOUND'}   User: ${user?.Email}`);
    console.log(`╰${'─'.repeat(70)}\n`);

    if (!sage) { log('  ✗ Sage agent not found — cannot run the memory lifecycle'); failures++; }
    assert(!!sage?.AllowMemoryWrite, 'Precondition: Sage has AllowMemoryWrite enabled');
    assert(!!sage?.InjectNotes, 'Precondition: Sage has InjectNotes enabled');

    try {
        if (sage) {
            // ── Phase A — Formation ──────────────────────────────────────────────
            log('\n── Phase A: memory formation (run convos designed to trigger a memoryWrite) ──');
            const prefs = [
                `For my work tagged ${MARKER}, I always want answers formatted as short bullet points, never long paragraphs. Please remember this preference for future conversations.`,
                `Also for ${MARKER}: remember that I work in the Pacific time zone, so schedule suggestions should assume PT.`
            ];
            for (const p of prefs) {
                log(`  → running Sage: "${p.slice(0, 70)}…"`);
                await runAgent(client, sage, p);
            }
            const formed = await findMarkerNotes(user);
            assert(formed.length > 0, 'A1: at least one memory note formed from the convos', `(${formed.length} found)`);
            const provisionalAgent = formed.filter(n => n.Status === 'Provisional' && n.AuthorType === 'Agent');
            assert(formed.length === 0 || provisionalAgent.length > 0,
                'A2: formed notes are Status=Provisional, AuthorType=Agent (in-flight write invariant)',
                `(${provisionalAgent.length}/${formed.length})`);
            assert(formed.every(n => !!n.AgentID), 'A3: every formed note is scoped to an agent');

            // ── Phase B — Hardening (Memory Manager) ─────────────────────────────
            log('\n── Phase B: run the Memory Manager (hardening: Provisional → Active) ──');
            const targets = provisionalAgent.map(n => n.ID);
            if (memoryManager && targets.length > 0) {
                await runAgent(client, memoryManager, 'Run the memory hardening and maintenance pass.');
                const after = await findMarkerNotes(user);
                const hardened = after.filter(n => targets.includes(n.ID) && (n.Status === 'Active' || n.Status === 'Archived'));
                assert(hardened.length > 0,
                    'B1: after the Memory Manager, provisional note(s) transitioned to Active (or Archived-consolidated)',
                    `(${hardened.length}/${targets.length})`);
                const activated = after.filter(n => targets.includes(n.ID) && n.Status === 'Active');
                assert(activated.length === 0 || activated.every(n => !n.ExpiresAt),
                    'B2: promoted-to-Active notes had their ExpiresAt (7-day TTL) cleared');
            } else if (!memoryManager) {
                log('  ⚠ Memory Manager agent not found — skipping hardening assertions');
            } else {
                log('  ⚠ no provisional agent notes to harden — skipping (Phase A formed none)');
            }

            // ── Phase C — Injection ──────────────────────────────────────────────
            log('\n── Phase C: injection (re-run Sage; the formed note should be injected) ──');
            const before = await findMarkerNotes(user);
            const noteIds = before.map(n => n.ID); // unique GUIDs — NOT contaminated by the query text
            // Cut-off BEFORE the Phase C run. Load-bearing: the Memory Manager's own Phase B steps
            // legitimately reference these same note IDs (it just hardened them), so an unscoped
            // "recent steps" window would false-positive on Phase B instead of proving Phase C injection.
            const phaseCStart = new Date(Date.now() - 1000).toISOString();
            await runAgent(client, sage, `What formatting do I prefer for my ${MARKER} work?`);
            await new Promise(r => setTimeout(r, 6000)); // let the fire-and-forget step saves flush

            // Injection stamps the run step with memoryAttribution.injectedNoteIds — so a step from
            // THIS (Phase C) run referencing one of OUR note IDs proves the note was injected.
            const rvs = new RunView();
            const stepR = await rvs.RunView<{ ID: string; OutputData?: string; TargetLogID?: string }>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `__mj_CreatedAt >= '${phaseCStart}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 40,
                Fields: ['ID', 'OutputData', '__mj_CreatedAt'],
                ResultType: 'simple',
                BypassCache: true
            }, user);
            const injected = (stepR.Success ? stepR.Results : []).some(s => {
                const out = String((s as { OutputData?: string }).OutputData ?? '');
                return noteIds.some(id => out.includes(id));
            });
            // Fallback: an AccessCount/LastAccessedAt bump on the note (also a valid injection signal).
            const beforeState = new Map(before.map(n => [n.ID, { access: n.AccessCount ?? 0, last: String(n.LastAccessedAt ?? '') }]));
            const after = await findMarkerNotes(user);
            const bumped = after.some(n => { const b = beforeState.get(n.ID); return b && ((n.AccessCount ?? 0) > b.access || String(n.LastAccessedAt ?? '') !== b.last); });

            assert(before.length > 0 && (injected || bumped),
                'C1: the formed note was injected on the follow-up run (its note ID appears in a run-step memoryAttribution and/or its access stamp bumped)',
                `(notes=${before.length}, stepAttribution=${injected}, accessBump=${bumped})`);
        }
    } finally {
        // ── Self-clean: delete every note carrying this run's marker ──
        log('\n── Cleanup: deleting marker notes ──');
        const toDelete = await findMarkerNotes(user);
        let deleted = 0;
        for (const n of toDelete) {
            if (await n.Delete()) deleted++;
        }
        log(`  removed ${deleted}/${toDelete.length} marker notes`);
    }

    console.log(`\n  ${failures === 0 ? 'PASS' : 'FAIL'}  ${failures} failure(s)\n`);
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap / connectivity error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
