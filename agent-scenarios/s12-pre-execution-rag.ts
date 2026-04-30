/**
 * S12 — Pre-execution RAG injects retrieved_context before LLM call.
 *
 * Story: Sage is configured for pre-execution RAG; before its first prompt
 * fires, AgentPreExecutionRAG runs and injects matching seeded data as a
 * `<retrieved_context>` system message.
 *
 * Setup:
 *   - AIAgentSearchScope row with Phase=PreExecution
 *   - Sage tool list deliberately stays unmodified for THIS scenario so
 *     we can isolate the pre-exec path. Override the baseline phase to
 *     PreExecution-only (not Both).
 *   - Use a tightly-keyed query so BM25 actually matches at RAG time
 *
 * Proof:
 *   - Captured prompt input (via promptCaptures hook) contains a
 *     `<retrieved_context>` system message
 *   - SearchExecutionLog has a row with AIAgentID=Sage, scope=audit-scope
 *     (proves the AIAgentID-threading fix from earlier this session)
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S12Setup { baseline: BaselineSnapshot; }

const scenario: Scenario = {
    id: 's12',
    name: 'Pre-execution RAG injects retrieved_context into prompt',
    exercises: 'AgentPreExecutionRAG end-to-end + AIAgentID threading on RAG path',
    setup: async (pool): Promise<S12Setup> => {
        await deleteSeededActions(pool, 's12');
        await seedActions(pool, 's12', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID], { phase: 'PreExecution' });
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `AgentScenario-Seed-s12`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success`);

        const allContent = ctx.promptCaptures.map(c => c.chatMessages.map(m => m.content).join('\n')).join('\n---\n');
        const hasRetrievedContext = /<retrieved_context>/i.test(allContent);
        assert(hasRetrievedContext,
            `<retrieved_context> system message present in prompt (captures=${ctx.promptCaptures.length})`);

        const seedNamesInPrompt = Array.from({ length: 5 }, (_, i) => `AgentScenario-Seed-s12-${i + 1}`)
            .filter(n => allContent.includes(n)).length;
        assert(seedNamesInPrompt >= 1,
            `prompt contains at least one seeded action name (${seedNamesInPrompt}/5)`);

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const ragRow = logs.find(r => r.Status === 'Success');
        assert(!!ragRow,
            `SearchExecutionLog row attributed to Sage on this scope (proves AIAgentID threading)`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S12Setup | undefined;
        await deleteSeededActions(pool, 's12');
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);
