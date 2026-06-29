/**
 * ContextCrush smoke harness — drives the REAL wired agent-runner methods against the
 * configured database + live LLM stack, demonstrating Priorities 1, 2, 3, and 4.
 *
 * Boots the same SQL Server data provider as `mj sync` / MJAPI, registers every class via
 * the server-bootstrap manifest, then exercises:
 *
 *   P1 — structural JSON compression (BaseAgent action-result crush via resolveActionResultCrush +
 *        formatParamValueForResult + CrushJSON): a 200-row array-of-objects (raw OR JSON-string) is
 *        crushed to tabular "$t" form with a context-crush legend; opt-out + below-threshold verbatim.
 *
 *   P2 — cache-aware expiration (BaseAgent.pruneAndCompactExpiredMessages + PartitionStablePrefix):
 *        builds a conversation with a stable prefix + a volatile (expiring) action-result tail,
 *        then asserts (a) volatile tail is removed, (b) volatile tail is compacted (First N Chars),
 *        and (c) THE KEY GUARD: an expired message that falls inside the cache-stable prefix is
 *        DEFERRED (kept) so the provider KV-cache prefix is preserved — while the volatile tail
 *        still expires. The stable prefix is byte-identical before/after every prune.
 *
 *   P3 — AST-aware code crushing (BaseAgent action-result crush via resolveActionResultCrush +
 *        formatParamValueForResult + CrushCode): with crushCodeLang='sql', a >600-char SQL VALUES
 *        action-result string is collapsed to "… value tuples elided"; opt-out + below-threshold
 *        paths fall back to verbatim.
 *
 *   P4 — mine failed runs for corrective memory (MemoryManagerAgent.LoadInstructiveFailedAgentRuns +
 *        ExtractNotesFromFailedRuns): seeds a real Failed AIAgentRun whose ErrorMessage carries a
 *        generalizable lesson, confirms the selector finds it, then runs the LIVE-LLM corrective
 *        extraction and asserts an Issue/Context note candidate tagged Ephemeral (never Constraint).
 *
 * Requires a live LLM key for P4 (the corrective extraction prompt). P2/P3 logic is deterministic.
 *
 * Usage (from repo root, in the workbench where P4 code + DB + LLM keys exist):
 *   npx tsx packages/AI/Agents/scripts/contextcrush-smoke.ts
 */
import 'dotenv/config';
// Side-effect import: registers ALL @memberjunction classes (providers, entity subclasses, engines).
import '@memberjunction/server-bootstrap/mj-class-registrations';
import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, RunView, UserInfo, LogStatus } from '@memberjunction/core';
import { AIAgentRunEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { MemoryManagerAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentChatMessage } from '@memberjunction/ai-core-plus';

const SMOKE_MARKER = `[contextcrush-smoke ${new Date().toISOString()}]`;

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

// Savings tracking — measures actual character reduction per reduction op (crush = structural
// JSON/code crushing; expire = P2 message expiration), reported as an average at the end.
type SavingCat = 'crush' | 'expire';
interface Saving { cat: SavingCat; name: string; before: number; after: number; }
const savings: Saving[] = [];
function pctOf(before: number, after: number): number {
    return before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0;
}
function recordSaving(cat: SavingCat, name: string, before: number, after: number): void {
    savings.push({ cat, name, before, after });
    LogStatus(`  📉 ${name}: ${before} → ${after} chars (${pctOf(before, after)}% reduced)`);
}
function avgPct(items: Saving[]): number {
    if (!items.length) return 0;
    return Math.round((items.reduce((s, x) => s + (x.before > 0 ? 1 - x.after / x.before : 0), 0) / items.length) * 1000) / 10;
}
function reportSavings(): void {
    const crush = savings.filter(s => s.cat === 'crush');
    const totBefore = savings.reduce((s, x) => s + x.before, 0);
    const totAfter = savings.reduce((s, x) => s + x.after, 0);
    LogStatus(`\n────────── SAVINGS SUMMARY ──────────`);
    for (const s of savings) LogStatus(`  [${s.cat}] ${s.name}: ${s.before} → ${s.after} (${pctOf(s.before, s.after)}%)`);
    LogStatus(`  AVG crush-only (P1+P3):  ${avgPct(crush)}%   over ${crush.length} ops`);
    LogStatus(`  AVG all reduction ops:   ${avgPct(savings)}%   over ${savings.length} ops`);
    LogStatus(`  AGGREGATE (weighted):    ${pctOf(totBefore, totAfter)}%   (${totBefore} → ${totAfter} chars)`);
}

/** A failed-run projection, matching MemoryManagerAgent's internal InstructiveFailedRun shape. */
interface FailedRunLite {
    ID: string;
    AgentID: string | null;
    ConversationID: string | null;
    Status: string;
    ErrorMessage: string | null;
}

/** An extracted corrective-note candidate, matching MemoryManagerAgent's internal ExtractedNote shape. */
interface ExtractedNoteLite {
    type: string;
    content: string;
    confidence: number;
    protectionTierHint?: string;
}

/**
 * Exposes the protected/private wired methods for direct smoke-testing. Extends
 * MemoryManagerAgent (concrete) so it inherits BaseAgent's P2/P3 methods AND the P4 mining methods.
 * Private members are reached via a typed surface cast (esbuild/tsx erases access modifiers).
 */
class SmokeHarness extends MemoryManagerAgent {
    /** P2: run the real prune/compaction pass over a caller-owned message array. */
    public async Prune(params: ExecuteAgentParams, currentTurn: number): Promise<void> {
        return this.pruneAndCompactExpiredMessages(params, currentTurn);
    }

    /** P1/P3: set the crush config from params, then format a single action-result param value (real path). */
    public CrushValue(value: unknown, params: ExecuteAgentParams): string {
        const self = this as unknown as {
            _actionResultCrush: unknown;
            resolveActionResultCrush(p: ExecuteAgentParams): unknown;
            formatParamValueForResult(v: unknown, maxLength?: number): string;
        };
        self._actionResultCrush = self.resolveActionResultCrush(params);
        return self.formatParamValueForResult(value);
    }

    /** P4: the failed-run selector. */
    public LoadFailed(since: Date | null, user: UserInfo): Promise<FailedRunLite[]> {
        const self = this as unknown as { LoadInstructiveFailedAgentRuns(s: Date | null, u: UserInfo): Promise<FailedRunLite[]> };
        return self.LoadInstructiveFailedAgentRuns(since, user);
    }

    /** P4: the corrective-extraction (live LLM). */
    public ExtractFromFailed(runs: FailedRunLite[], user: UserInfo): Promise<ExtractedNoteLite[]> {
        (this as unknown as { _verbose: boolean })._verbose = true;
        const self = this as unknown as { ExtractNotesFromFailedRuns(r: FailedRunLite[], u: UserInfo): Promise<ExtractedNoteLite[]> };
        return self.ExtractNotesFromFailedRuns(runs, user);
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

/** A long, repetitive SQL VALUES list that CrushCode collapses (>600 chars, 4+ tuples). */
function buildLargeSql(): string {
    const tuples: string[] = [];
    for (let i = 1; i <= 60; i++) tuples.push(`(${i},'row_value_label_${String(i).padStart(4, '0')}')`);
    return `SELECT x, y FROM (VALUES ${tuples.join(',')}) AS t(x, y)`;
}

/** A 200-row array-of-objects — the canonical repetitive action payload CrushJSON tabularizes. */
function buildLargeResultSet(): Record<string, unknown>[] {
    return Array.from({ length: 200 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
        status: i % 2 === 0 ? 'Active' : 'Inactive',
        category: 'StandardCategory',
    }));
}

function makeParams(overrides: Partial<ExecuteAgentParams>): ExecuteAgentParams {
    return overrides as ExecuteAgentParams;
}

function prefixJSON(messages: AgentChatMessage[], count: number): string {
    return JSON.stringify(messages.slice(0, count));
}

// ──────────────────────────────────────────────────────────────────────────
// P1 — structural JSON compression (default-on)
// ──────────────────────────────────────────────────────────────────────────
function runP1(harness: SmokeHarness): void {
    LogStatus('\n════ P1 — structural JSON compression (default-on action-result crush) ════');
    const data = buildLargeResultSet();
    const verbatim = JSON.stringify(data);
    // Default config: no crushActionResults:false, no crushCodeLang → P1 JSON crush is on.
    const onParams = makeParams({ data: { __agentTypePromptParams: {} } });

    // Raw object/array param.
    const crushed = harness.CrushValue(data, onParams);
    check('raw array-of-objects crushed to tabular form ($t)', crushed.includes('$t'));
    check('crushed output carries the context-crush legend', crushed.includes('context-crush'));
    check('crushed output measurably smaller than verbatim JSON', crushed.length < verbatim.length, `${crushed.length} vs ${verbatim.length}`);
    recordSaving('crush', 'P1 raw 200-row JSON', verbatim.length, crushed.length);

    // JSON-STRING param (actions that JSON.stringify their payload, e.g. run-adhoc-query's Results)
    // — the P1 wiring-gap regression: these must also be crushed.
    const crushedStr = harness.CrushValue(verbatim, onParams);
    check('JSON-STRING param also crushed (wiring-gap regression)', crushedStr.includes('$t') && crushedStr.includes('context-crush'));
    recordSaving('crush', 'P1 JSON-string param', verbatim.length, crushedStr.length);

    // Opt-out → verbatim.
    const offParams = makeParams({ data: { __agentTypePromptParams: { crushActionResults: false } } });
    const optedOut = harness.CrushValue(data, offParams);
    check('opt-out (crushActionResults:false) returns verbatim JSON', optedOut === verbatim && !optedOut.includes('$t'));

    // Below threshold → verbatim.
    const small = harness.CrushValue([{ id: 1, name: 'Small' }], onParams);
    check('below-threshold JSON left verbatim', small === JSON.stringify([{ id: 1, name: 'Small' }]));
}

// ──────────────────────────────────────────────────────────────────────────
// P2 — cache-aware expiration
// ──────────────────────────────────────────────────────────────────────────
async function runP2(harness: SmokeHarness): Promise<void> {
    LogStatus('\n════ P2 — cache-aware expiration (prune confined to volatile tail) ════');

    // (a) Volatile action-result REMOVED; stable prefix byte-identical.
    {
        const messages: AgentChatMessage[] = [
            { role: 'system', content: 'SYSTEM PREFIX — stable, must never be mutated by a prune.' },
            { role: 'user', content: 'USER REQUEST — original ask, part of the cache-stable prefix.' },
            { role: 'user', content: 'X'.repeat(2000), metadata: { messageType: 'action-result', expirationTurns: 2, expirationMode: 'Remove', turnAdded: 0 } },
        ];
        const before = prefixJSON(messages, 2);
        const tailBefore = (messages[2].content as string).length;
        await harness.Prune(makeParams({ conversationMessages: messages, verbose: false }), 5);
        check('(a) volatile action-result removed', messages.length === 2, `len=${messages.length}`);
        check('(a) stable prefix byte-identical', prefixJSON(messages, 2) === before);
        recordSaving('expire', 'P2 remove (expired tail)', tailBefore, 0);
    }

    // (b) Volatile action-result COMPACTED (First N Chars); stable prefix byte-identical.
    {
        const messages: AgentChatMessage[] = [
            { role: 'system', content: 'SYSTEM PREFIX — stable.' },
            { role: 'user', content: 'USER REQUEST — stable.' },
            { role: 'user', content: 'Y'.repeat(2000), metadata: { messageType: 'action-result', expirationTurns: 2, expirationMode: 'Compact', compactMode: 'First N Chars', compactLength: 80, turnAdded: 0 } },
        ];
        const before = prefixJSON(messages, 2);
        const tailBefore = (messages[2].content as string).length;
        await harness.Prune(makeParams({ conversationMessages: messages, verbose: false }), 5);
        const tail = messages[2];
        const tailContent = typeof tail?.content === 'string' ? tail.content : '';
        check('(b) volatile action-result still present (compacted, not removed)', messages.length === 3);
        recordSaving('expire', 'P2 compact (First N Chars)', tailBefore, tailContent.length);
        check('(b) tail content compacted/shortened', tailContent.length < 200 && tailContent.includes('[Compacted'), `len=${tailContent.length}`);
        check('(b) tail metadata wasCompacted=true', tail?.metadata?.wasCompacted === true);
        check('(b) stable prefix byte-identical', prefixJSON(messages, 2) === before);
    }

    // (c) THE KEY GUARD: an expired message INSIDE the stable prefix is DEFERRED (kept),
    //     while the volatile tail still expires. This is the P2 change vs. the old behavior.
    {
        const messages: AgentChatMessage[] = [
            { role: 'system', content: 'SYSTEM PREFIX — stable.' },
            // Non-volatile (no result messageType) but EXPIRED → sits in the prefix → must be DEFERRED.
            { role: 'user', content: 'Injected context that is technically expired but load-bearing for cache.', metadata: { expirationTurns: 1, expirationMode: 'Remove', turnAdded: 0 } },
            // Volatile tail → expires normally.
            { role: 'user', content: 'Z'.repeat(2000), metadata: { messageType: 'action-result', expirationTurns: 1, expirationMode: 'Remove', turnAdded: 0 } },
        ];
        await harness.Prune(makeParams({ conversationMessages: messages, verbose: false }), 5);
        const hasDeferred = messages.some(m => typeof m.content === 'string' && m.content.includes('load-bearing for cache'));
        const tailGone = !messages.some(m => typeof m.content === 'string' && m.content.startsWith('ZZZ'));
        check('(c) expired prefix message DEFERRED (cache guard preserved it)', hasDeferred);
        check('(c) volatile tail still expired', tailGone, `len=${messages.length}`);
    }
}

// ──────────────────────────────────────────────────────────────────────────
// P3 — AST-aware code crushing
// ──────────────────────────────────────────────────────────────────────────
function runP3(harness: SmokeHarness): void {
    LogStatus('\n════ P3 — AST-aware code crushing (opt-in via crushCodeLang) ════');
    const sqlStr = buildLargeSql();

    const onParams = makeParams({ data: { __agentTypePromptParams: { crushCodeLang: 'sql' } } });
    const crushed = harness.CrushValue(sqlStr, onParams);
    check('crushed output collapses the VALUES list', crushed.includes('value tuples elided'), crushed.slice(0, 80));
    check('crushed output is shorter than the original SQL', crushed.length < sqlStr.length, `${crushed.length} vs ${sqlStr.length}`);
    recordSaving('crush', 'P3 SQL VALUES list', sqlStr.length, crushed.length);

    const offParams = makeParams({ data: { __agentTypePromptParams: { crushActionResults: false } } });
    const optedOut = harness.CrushValue(sqlStr, offParams);
    check('opt-out (crushActionResults:false) returns verbatim', optedOut === sqlStr && !optedOut.includes('value tuples elided'));

    const noLangParams = makeParams({ data: { __agentTypePromptParams: {} } });
    const noLang = harness.CrushValue(sqlStr, noLangParams);
    check('no crushCodeLang → code left verbatim (default off)', noLang === sqlStr);

    const small = harness.CrushValue('SELECT 1;', onParams);
    check('below-threshold SQL left verbatim', small === 'SELECT 1;');
}

// ──────────────────────────────────────────────────────────────────────────
// P4 — mine failed runs for corrective memory (live LLM)
// ──────────────────────────────────────────────────────────────────────────
/** Seed a Failed AIAgentRun with the given error, run selection + live-LLM extraction, then delete it. */
async function seedAndMine(
    harness: SmokeHarness, contextUser: UserInfo, agentId: string, errorMessage: string, label: string,
): Promise<{ selected: boolean; candidates: ExtractedNoteLite[] }> {
    const md = new Metadata(); // global-provider-ok: single-connection CLI smoke harness
    let seededRunId: string | null = null;
    try {
        const run = await md.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
        run.NewRecord();
        run.AgentID = agentId;
        run.Status = 'Failed';
        run.StartedAt = new Date();
        run.CompletedAt = new Date();
        run.Success = false;
        run.ErrorMessage = `${errorMessage} ${SMOKE_MARKER}`;
        const saved = await run.Save();
        check(`[${label}] seeded a Failed AIAgentRun`, saved, run.LatestResult?.CompleteMessage);
        if (!saved) return { selected: false, candidates: [] };
        seededRunId = run.ID;

        const since = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
        const failed = await harness.LoadFailed(since, contextUser);
        const mine = failed.find(f => f.ID === seededRunId);
        check(`[${label}] selector finds the Failed run`, !!mine, `found ${failed.length} failed run(s)`);

        const candidates = mine ? await harness.ExtractFromFailed([mine], contextUser) : [];
        LogStatus(`  → [${label}] extraction produced ${candidates.length} corrective candidate(s)`);
        for (const c of candidates) LogStatus(`     [${c.type} / ${c.protectionTierHint ?? '—'} / conf ${c.confidence}] ${c.content.slice(0, 90)}`);
        return { selected: !!mine, candidates };
    } finally {
        if (seededRunId) {
            const run = await md.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
            if (await run.Load(seededRunId)) {
                const deleted = await run.Delete();
                LogStatus(`  ${deleted ? 'deleted' : 'FAILED to delete'} seeded run ${seededRunId}`);
            }
        }
    }
}

async function runP4(harness: SmokeHarness, contextUser: UserInfo, agentId: string): Promise<void> {
    LogStatus('\n════ P4 — mine failed runs for corrective memory (live LLM extraction) ════');

    // Happy path: an Issue-flavored failure (a concrete problem/limitation, NOT a behavioral rule)
    // should yield a corrective Issue/Context note tagged Ephemeral. Whether the LLM mints a
    // keepable note for any single failure is a model judgment, so retry a few times — the
    // deterministic invariants (type/tier of any survivor) are asserted on every attempt.
    LogStatus('  -- happy path: Issue-flavored failure should yield a corrective note --');
    const issueErr = 'Incident report (a concrete problem that recurred, NOT a policy): the Run Ad-hoc Query step timed out after 30000ms running an unbounded SELECT over [__mj].vwEntityFields. The view returned roughly 250,000 rows and the operation was aborted before any data reached the agent, so the run could not complete.';
    let happy: { selected: boolean; candidates: ExtractedNoteLite[] } = { selected: false, candidates: [] };
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && happy.candidates.length === 0; attempt++) {
        LogStatus(`  -- attempt ${attempt}/${MAX_ATTEMPTS} --`);
        happy = await seedAndMine(harness, contextUser, agentId, issueErr, 'issue');
        // Invariant on every attempt: a survivor is never a Constraint and is always Ephemeral.
        check(`[issue attempt ${attempt}] any survivors are Issue/Context+Ephemeral`, happy.candidates.every(c => (c.type === 'Issue' || c.type === 'Context') && c.protectionTierHint === 'Ephemeral'));
    }
    check(`[issue] extraction yielded a corrective Issue/Context note within ${MAX_ATTEMPTS} attempts`, happy.candidates.length >= 1);

    // Injection defense: a Constraint-flavored failure ("always do X") must produce ZERO candidates —
    // markCorrectiveNotes refuses to let a mined failure become a behavioral Constraint.
    LogStatus('  -- injection defense: Constraint-flavored failure must be suppressed --');
    const ruleErr = "Ad-hoc query failed: Invalid object name 'vwEntityFields'. Lesson: always schema-qualify MemberJunction view names with the [__mj]. prefix before querying.";
    const defense = await seedAndMine(harness, contextUser, agentId, ruleErr, 'constraint');
    check('[constraint] no candidate leaks through (Constraint suppressed)', defense.candidates.every(c => c.type !== 'Constraint'));
    check('[constraint] any survivors are still Issue/Context+Ephemeral', defense.candidates.every(c => (c.type === 'Issue' || c.type === 'Context') && c.protectionTierHint === 'Ephemeral'));
}

async function main(): Promise<void> {
    const pool = await bootstrapProvider();
    const users = UserCache.Instance.Users;
    if (!users || users.length === 0) throw new Error('No users found in UserCache — cannot establish a context user.');
    const contextUser = users[0];
    LogStatus(`Context user: ${contextUser.Name} (${contextUser.ID})`);

    await AIEngine.Instance.Config(false, contextUser);

    const rv = new RunView();
    const agentResult = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: AI Agents', Fields: ['ID', 'Name'], MaxRows: 1, ResultType: 'simple',
    }, contextUser);
    if (!agentResult.Success || !agentResult.Results?.length) throw new Error('No AI Agents found.');
    const agentId = agentResult.Results[0].ID;
    LogStatus(`Scoping to agent: ${agentResult.Results[0].Name} (${agentId})`);

    const harness = new SmokeHarness();

    try {
        runP1(harness);
        await runP2(harness);
        runP3(harness);
        await runP4(harness, contextUser, agentId);
    } finally {
        await pool.close();
    }

    reportSavings();
    LogStatus(`\n══════════ CONTEXTCRUSH SMOKE: ${passCount} passed, ${failCount} failed ══════════`);
    if (failCount > 0) process.exit(1);
}

main().catch((err) => {
    console.error('Smoke harness crashed:', err);
    process.exit(1);
});
