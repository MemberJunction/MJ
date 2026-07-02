/**
 * In-flight memory writes smoke harness — drives the real persistence pipeline.
 *
 * Boots the same SQL Server data provider `mj sync` uses, registers every class via the
 * server-bootstrap manifest (so MJAIAgentNoteEntityServer's auto-embed + vector sync are live),
 * then exercises the full memory-write path end-to-end against the configured database:
 *
 *   1. write        — MemoryWriteManager.ExecuteWrite persists a Provisional note
 *                     (asserts Status/AuthorType/scope/TTL/embedding on the actual row)
 *   2. idempotency  — exact same text, same run → skipped-duplicate
 *   3. supersede    — near-duplicate text, same run → superseded-own (text updated in place)
 *   4. cross-run    — near-duplicate text, NEW manager (fresh run) → deduped (AccessCount bumped)
 *   5. injection    — AgentContextInjector renders the provisional note first with the
 *                     (provisional) label and recency-wins policy
 *   6. hardening    — MemoryManagerAgent.hardenSingleNote flips Status → Active, ExpiresAt → NULL
 *   7. cleanup      — deletes the smoke notes it created
 *
 * No LLM API keys required: embeddings use the local embedding model, and the hardening
 * dedupe LLM is only consulted when a similar ACTIVE note exists (the smoke note is unique).
 *
 * Usage (from repo root):  npx tsx packages/AI/Agents/scripts/memory-write-smoke.ts
 */
import 'dotenv/config';
// Side-effect import: registers ALL @memberjunction classes (providers, entity subclasses, engines).
import '@memberjunction/server-bootstrap/mj-class-registrations';
import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, RunView, UserInfo, LogStatus } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { MemoryWriteManager, MemoryWriteContext } from '@memberjunction/ai-agents';
import { AgentContextInjector } from '@memberjunction/ai-agents';
import { MemoryManagerAgent } from '@memberjunction/ai-agents';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

const SMOKE_MARKER = `[memory-write-smoke ${new Date().toISOString()}]`;

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail?: string): void {
    if (condition) {
        passCount++;
        LogStatus(`  ✅ ${name}`);
    } else {
        failCount++;
        LogStatus(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

/** Exposes the protected hardening internals for direct smoke-testing. */
class HardeningHarness extends MemoryManagerAgent {
    public async HardenOne(
        note: MJAIAgentNoteEntity,
        dedupePrompt: MJAIPromptEntityExtended | undefined,
        runner: AIPromptRunner,
        contextUser: UserInfo,
    ): Promise<'hardened' | 'deduped' | 'failed'> {
        return this.hardenSingleNote(note, dedupePrompt, runner, contextUser);
    }
}

async function bootstrapProvider(): Promise<sql.ConnectionPool> {
    const pool = new sql.ConnectionPool({
        server: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
        database: process.env.DB_DATABASE,
        user: process.env.CODEGEN_DB_USERNAME || process.env.DB_USERNAME,
        password: process.env.CODEGEN_DB_PASSWORD || process.env.DB_PASSWORD,
        options: {
            encrypt: (process.env.DB_HOST || '').includes('.database.windows.net'),
            trustServerCertificate: true,
            enableArithAbort: true,
        },
    });
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    return pool;
}

async function loadNote(noteId: string, contextUser: UserInfo): Promise<MJAIAgentNoteEntity | null> {
    const md = new Metadata(); // global-provider-ok: single-connection CLI smoke harness that bootstraps the global provider itself
    const note = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
    return (await note.Load(noteId)) ? note : null;
}

async function main(): Promise<void> {
    const pool = await bootstrapProvider();
    const users = UserCache.Instance.Users;
    if (!users || users.length === 0) {
        throw new Error('No users found in UserCache — cannot establish a context user.');
    }
    const contextUser = users[0];
    LogStatus(`Context user: ${contextUser.Name} (${contextUser.ID})`);

    await AIEngine.Instance.Config(false, contextUser);

    // Pick any agent to scope the smoke notes to (scope only — we don't run the agent).
    const rv = new RunView();
    const agentResult = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: AI Agents',
        Fields: ['ID', 'Name'],
        MaxRows: 1,
        ResultType: 'simple',
    }, contextUser);
    if (!agentResult.Success || !agentResult.Results?.length) {
        throw new Error('No AI Agents found to scope smoke notes to.');
    }
    const agentId = agentResult.Results[0].ID;
    LogStatus(`Scoping smoke notes to agent: ${agentResult.Results[0].Name} (${agentId})\n`);

    const context: MemoryWriteContext = {
        agentId,
        contextUser,
        userId: contextUser.ID,
        verbose: true,
    };

    const createdNoteIds: string[] = [];
    try {
        // ── 1. Write path ───────────────────────────────────────────────
        LogStatus('1. Write path (Provisional persistence)');
        const manager = new MemoryWriteManager();
        const noteText = `User prefers cobalt-blue dashboards for quarterly reviews. ${SMOKE_MARKER}`;
        const written = await manager.ExecuteWrite({ note: noteText, type: 'Preference' }, context);
        check('disposition is written', written.disposition === 'written', written.disposition + (written.reason ? `: ${written.reason}` : ''));
        if (written.noteId) createdNoteIds.push(written.noteId);

        const row = written.noteId ? await loadNote(written.noteId, contextUser) : null;
        check('note row loads', row !== null);
        if (row) {
            check("Status = 'Provisional'", row.Status === 'Provisional', String(row.Status));
            check("AuthorType = 'Agent'", row.AuthorType === 'Agent', String(row.AuthorType));
            check('AgentID scoped', row.AgentID === agentId);
            check('UserID scoped', UUIDsEqual(row.UserID, contextUser.ID));
            check('EmbeddingVector populated', !!row.EmbeddingVector && row.EmbeddingVector.length > 2);
            const ttlDays = row.ExpiresAt ? (row.ExpiresAt.getTime() - Date.now()) / 86_400_000 : -1;
            check('ExpiresAt ≈ +7 days', ttlDays > 6.5 && ttlDays < 7.5, `${ttlDays.toFixed(2)} days`);
        }

        // ── 2. Within-run idempotency ───────────────────────────────────
        LogStatus('\n2. Within-run idempotency');
        const repeat = await manager.ExecuteWrite({ note: noteText, type: 'Preference' }, context);
        check('exact repeat skipped', repeat.disposition === 'skipped-duplicate', repeat.disposition);

        // ── 3. Same-run supersede-own ───────────────────────────────────
        LogStatus('\n3. Same-run supersede-own (last write wins)');
        const supersedeText = `User prefers crimson-red dashboards for quarterly reviews. ${SMOKE_MARKER}`;
        const superseded = await manager.ExecuteWrite({ note: supersedeText, type: 'Preference' }, context);
        check('disposition is superseded-own', superseded.disposition === 'superseded-own', superseded.disposition + (superseded.reason ? `: ${superseded.reason}` : ''));
        check('supersedes the SAME note', superseded.noteId === written.noteId);
        const supersededRow = written.noteId ? await loadNote(written.noteId, contextUser) : null;
        check('note text updated in place', supersededRow?.Note === supersedeText, supersededRow?.Note?.slice(0, 60));

        // ── 4. Cross-run dedupe (exact restatement) ─────────────────────
        // Submits the IDENTICAL text, so this now specifically exercises the
        // exact-restatement dedupe path (near-but-different text writes instead).
        LogStatus('\n4. Cross-run dedupe (new manager = new run, exact restatement)');
        const accessBefore = supersededRow?.AccessCount || 0;
        const freshManager = new MemoryWriteManager();
        const crossRun = await freshManager.ExecuteWrite({ note: supersedeText, type: 'Preference' }, context);
        check('disposition is deduped', crossRun.disposition === 'deduped', crossRun.disposition);
        const dedupedRow = written.noteId ? await loadNote(written.noteId, contextUser) : null;
        check('AccessCount bumped', (dedupedRow?.AccessCount || 0) > accessBefore, `${accessBefore} -> ${dedupedRow?.AccessCount}`);

        // ── 4b. Cross-run paraphrase writes (corrections preserved) ─────
        // Live regression for the observed bug: a near-duplicate with different
        // text must be WRITTEN, not absorbed into the pre-existing note.
        LogStatus('\n4b. Cross-run paraphrase (ADD-only-strict: written, not deduped)');
        const paraphraseText = `The user prefers crimson red dashboards for their quarterly reviews. ${SMOKE_MARKER}`;
        const paraphrase = await freshManager.ExecuteWrite({ note: paraphraseText, type: 'Preference' }, context);
        check('paraphrase disposition is written', paraphrase.disposition === 'written', paraphrase.disposition + (paraphrase.reason ? `: ${paraphrase.reason}` : ''));
        check('paraphrase is a NEW note', !!paraphrase.noteId && paraphrase.noteId !== written.noteId);
        if (paraphrase.noteId) createdNoteIds.push(paraphrase.noteId);

        // ── 5. Injection formatting ─────────────────────────────────────
        LogStatus('\n5. Injection (provisional-first, labeled, recency-wins policy)');
        const injector = new AgentContextInjector();
        const notesForContext = await injector.GetNotesForContext({
            agentId,
            userId: contextUser.ID,
            strategy: 'Recent',
            maxNotes: 10,
            contextUser,
        });
        const formatted = injector.FormatNotesForInjection(notesForContext);
        check('provisional note retrieved for injection', notesForContext.some(n => written.noteId != null && UUIDsEqual(n.ID, written.noteId)));
        check('formatted with (provisional) label', formatted.includes('] (provisional)'));
        check('RECENT NOTES block present', formatted.includes('RECENT NOTES'));
        check('recency-wins policy present', formatted.includes('recency wins'));

        // ── 6. Hardening ────────────────────────────────────────────────
        LogStatus('\n6. Hardening (Provisional -> Active, ExpiresAt -> NULL)');
        const harness = new HardeningHarness();
        const noteToHarden = written.noteId ? await loadNote(written.noteId, contextUser) : null;
        if (noteToHarden) {
            const outcome = await harness.HardenOne(noteToHarden, undefined, new AIPromptRunner(), contextUser);
            check('outcome is hardened', outcome === 'hardened', outcome);
            const hardenedRow = await loadNote(noteToHarden.ID, contextUser);
            check("Status = 'Active' after hardening", hardenedRow?.Status === 'Active', String(hardenedRow?.Status));
            check('ExpiresAt cleared', hardenedRow?.ExpiresAt === null, String(hardenedRow?.ExpiresAt));
        } else {
            check('note available to harden', false);
        }

        // ── 6b. Within-batch hardening dedupe ───────────────────────────
        // Verifies the emergent property the unit tests can't: sequential
        // hardening + per-Save vector sync means a note hardened earlier in
        // the SAME batch is visible (Active) to later items' dedupe checks —
        // so the paraphrase duplicates that ADD-only-strict now produces are
        // consolidated by the Memory Manager rather than accumulating.
        // Requires the real dedupe prompt (LLM call) — uses the configured key.
        LogStatus('\n6b. Within-batch hardening dedupe (paraphrase consolidated into hardened note)');
        const dedupePrompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Deduplicate Note' && p.Category === 'MJ: System'
        );
        const paraphraseNote = paraphrase.noteId ? await loadNote(paraphrase.noteId, contextUser) : null;
        if (paraphraseNote && dedupePrompt && written.noteId) {
            const dedupeOutcome = await harness.HardenOne(paraphraseNote, dedupePrompt, new AIPromptRunner(), contextUser);
            check('paraphrase hardening outcome is deduped', dedupeOutcome === 'deduped', dedupeOutcome);
            const archivedRow = await loadNote(paraphraseNote.ID, contextUser);
            check("paraphrase archived", archivedRow?.Status === 'Archived', String(archivedRow?.Status));
            check('lineage points at the hardened note', archivedRow?.ConsolidatedIntoNoteID === written.noteId, String(archivedRow?.ConsolidatedIntoNoteID));
        } else {
            check('dedupe prompt + paraphrase note available', false, dedupePrompt ? 'note missing' : 'dedupe prompt not found');
        }
    } finally {
        // ── 7. Cleanup ──────────────────────────────────────────────────
        LogStatus('\n7. Cleanup');
        for (const id of createdNoteIds) {
            const note = await loadNote(id, contextUser);
            if (note) {
                const deleted = await note.Delete();
                LogStatus(`  ${deleted ? 'deleted' : 'FAILED to delete'} smoke note ${id}`);
            }
        }
        await pool.close();
    }

    LogStatus(`\n══════════ SMOKE RESULT: ${passCount} passed, ${failCount} failed ══════════`);
    if (failCount > 0) process.exit(1);
}

main().catch((err) => {
    console.error('Smoke harness crashed:', err);
    process.exit(1);
});
