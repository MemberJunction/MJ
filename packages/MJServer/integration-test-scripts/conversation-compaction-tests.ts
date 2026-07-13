/**
 * conversation-compaction-tests.ts — deterministic live integration tests for the
 * cross-turn conversation compaction assembly layer (plans/agent-conversation-compaction.md).
 *
 * Exercises real server componentry against the live dev database — real
 * SQLServerDataProvider, real entity saves (spCreate/spUpdate + the
 * trgConversationDetail_AssignSequence trigger), real ConversationEngine cache — with
 * NO LLM calls (credential-light deterministic tier). Covers:
 *
 *   - DB trigger: per-conversation monotonic Sequence assignment on insert
 *   - ConversationEngine.GetAgentContextWindow: no-boundary passthrough, legacy
 *     maxTailMessages cap, boundary selection at the highest non-null
 *     SummaryOfEarlierConversation, boundary-row-included-raw windowing,
 *     excludeDetailIds (in-flight placeholder) filtering, and entity-event cache
 *     coherency after an external SummaryOfEarlierConversation save
 *
 * Fixtures are self-created and self-deleted (tagged "(mj-integration-test — safe to
 * delete)"); reference-only toward existing records (the context user).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/conversation-compaction-tests.ts
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI, AICtx } from './lib/ai-bootstrap';
import { ConversationEngine, MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationToolManager, ConversationSearchHit, ConversationToolMessage } from '@memberjunction/ai-agents';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

interface Fixture {
    conversation: MJConversationEntity;
    details: MJConversationDetailEntity[];
}

/** Creates a conversation + N detail rows through the real entity save path. */
async function CreateConversationFixture(ctx: AICtx, messages: Array<{ role: 'User' | 'AI'; text: string }>): Promise<Fixture> {
    const conversation = await ctx.provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.user);
    conversation.Name = `Compaction assembly test ${FIXTURE_TAG}`;
    conversation.UserID = ctx.user.ID;
    if (!(await conversation.Save())) {
        throw new Error(`Fixture conversation save failed: ${conversation.LatestResult?.CompleteMessage}`);
    }

    const details: MJConversationDetailEntity[] = [];
    for (const message of messages) {
        const detail = await ctx.provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.user);
        detail.ConversationID = conversation.ID;
        detail.Role = message.role;
        detail.Message = message.text;
        detail.HiddenToUser = false;
        if (!(await detail.Save())) {
            throw new Error(`Fixture detail save failed: ${detail.LatestResult?.CompleteMessage}`);
        }
        details.push(detail);
    }
    return { conversation, details };
}

/** Deletes fixture details then the conversation (FK order). */
async function CleanupFixture(fixture: Fixture): Promise<void> {
    for (const detail of fixture.details) {
        await detail.Delete();
    }
    await fixture.conversation.Delete();
}

async function main(): Promise<void> {
    let ctx: AICtx;
    try {
        ctx = await bootstrapAI();
    } catch (error) {
        console.error('Bootstrap failed:', error);
        process.exit(2);
    }

    const runner = new TestRunner('Conversation Compaction — Assembly Layer (deterministic)');
    const fixtures: Fixture[] = [];
    const engine = ConversationEngine.Instance;

    runner.Test('trigger assigns per-conversation monotonic Sequence via real spCreate', async () => {
        const fixture = await CreateConversationFixture(ctx, [
            { role: 'User', text: 'm1' },
            { role: 'AI', text: 'm2' },
            { role: 'User', text: 'm3' },
        ]);
        fixtures.push(fixture);
        const sequences = fixture.details.map(d => d.Sequence);
        AssertEqual(JSON.stringify(sequences), JSON.stringify([1, 2, 3]), 'Sequence values from spCreate SELECT-back');
    });

    runner.Test('GetAgentContextWindow: no boundary → all messages, chronological, metadata stamped', async () => {
        const fixture = fixtures[0];
        const window = await engine.GetAgentContextWindow(fixture.conversation.ID, ctx.user);
        AssertEqual(window.length, 3, 'window length');
        AssertEqual(window.map(m => m.content).join(','), 'm1,m2,m3', 'chronological content');
        AssertEqual(window.map(m => m.role).join(','), 'user,assistant,user', 'role mapping');
        AssertEqual(window[0].metadata?.sequence, 1, 'sequence metadata');
        Assert(!!window[0].metadata?.conversationDetailId, 'conversationDetailId stamped');
        Assert(window.every(m => !m.metadata?.isConversationSummary), 'no summary flags without a boundary');
    });

    runner.Test('GetAgentContextWindow: maxTailMessages caps the no-boundary window', async () => {
        const fixture = fixtures[0];
        const window = await engine.GetAgentContextWindow(fixture.conversation.ID, ctx.user, { maxTailMessages: 2 });
        AssertEqual(window.map(m => m.content).join(','), 'm2,m3', 'last-2 cap');
    });

    runner.Test('summary save → boundary window [summary, boundary raw, tail] via warm cache', async () => {
        const fixture = fixtures[0];
        // External entity save (the same path the compaction manager uses) — the engine's
        // entity-event handler must merge it into the already-warm cache in place.
        const boundary = fixture.details[1]; // Sequence 2
        boundary.SummaryOfEarlierConversation = 'SUMMARY of sequence 1';
        Assert(await boundary.Save(), `summary save: ${boundary.LatestResult?.CompleteMessage}`);

        const window = await engine.GetAgentContextWindow(fixture.conversation.ID, ctx.user);
        AssertEqual(window.length, 3, 'summary + boundary + tail');
        AssertEqual(window[0].metadata?.isConversationSummary, true, 'first message is the summary');
        AssertEqual(window[0].metadata?.summaryBoundarySequence, 2, 'boundary sequence');
        AssertEqual(window[0].content as string, 'SUMMARY of sequence 1', 'summary text verbatim');
        AssertEqual(window[1].content as string, 'm2', 'boundary row included raw');
        AssertEqual(window[2].content as string, 'm3', 'tail after boundary');
    });

    runner.Test('highest-sequence summary wins (recursive summaries)', async () => {
        const fixture = fixtures[0];
        const newer = fixture.details[2]; // Sequence 3
        newer.SummaryOfEarlierConversation = 'SUMMARY of sequences 1-2';
        Assert(await newer.Save(), `newer summary save: ${newer.LatestResult?.CompleteMessage}`);

        const window = await engine.GetAgentContextWindow(fixture.conversation.ID, ctx.user);
        AssertEqual(window.length, 2, 'summary + boundary(=last row)');
        AssertEqual(window[0].metadata?.summaryBoundarySequence, 3, 'newest boundary selected');
        AssertEqual(window[1].content as string, 'm3', 'boundary raw');
    });

    runner.Test('excludeDetailIds drops the in-flight placeholder row', async () => {
        const fixture = fixtures[0];
        const placeholderId = fixture.details[2].ID;
        const window = await engine.GetAgentContextWindow(fixture.conversation.ID, ctx.user, {
            excludeDetailIds: [placeholderId],
        });
        // With the seq-3 row excluded, its summary no longer participates; the seq-2
        // summary (set in the earlier test) becomes the boundary again.
        AssertEqual(window[0].metadata?.summaryBoundarySequence, 2, 'boundary recomputed without excluded row');
        Assert(window.every(m => m.metadata?.conversationDetailId !== placeholderId), 'excluded row absent');
    });

    runner.Test('retrieval tools page and search the full stored history (live cache reads)', async () => {
        const fixture = fixtures[0];
        const tools = new ConversationToolManager();
        tools.Initialize(fixture.conversation.ID, ctx.user);

        // Exact paging by the trigger-assigned sequence handle
        const bySeq = await tools.ExecuteSingleToolCall({ tool: 'getMessageBySequence', input: { sequence: 1 } });
        Assert(bySeq.result.success, `getMessageBySequence failed: ${bySeq.result.errorMessage}`);
        AssertEqual((bySeq.result.data as ConversationToolMessage).message, 'm1', 'exact message by sequence');

        // Range paging — includes rows the summary now covers (full history stays addressable)
        const byRange = await tools.ExecuteSingleToolCall({ tool: 'getMessagesByRange', input: { startSequence: 1, endSequence: 3 } });
        Assert(byRange.result.success, `getMessagesByRange failed: ${byRange.result.errorMessage}`);
        const rangeData = byRange.result.data as { messages: ConversationToolMessage[] };
        AssertEqual(rangeData.messages.map(m => m.message).join(','), 'm1,m2,m3', 'inclusive range in order');

        // Search over pre-summary history
        const search = await tools.ExecuteSingleToolCall({ tool: 'searchConversation', input: { query: 'm2' } });
        Assert(search.result.success, `searchConversation failed: ${search.result.errorMessage}`);
        const hits = (search.result.data as { hits: ConversationSearchHit[] }).hits;
        AssertEqual(hits.length, 1, 'one search hit');
        AssertEqual(hits[0].sequence, 2, 'hit points at the right sequence handle');
    });

    runner.Test('second conversation is independently sequenced and windowed', async () => {
        const fixture = await CreateConversationFixture(ctx, [
            { role: 'User', text: 'other-1' },
            { role: 'AI', text: 'other-2' },
        ]);
        fixtures.push(fixture);
        AssertEqual(JSON.stringify(fixture.details.map(d => d.Sequence)), JSON.stringify([1, 2]), 'independent sequence space');
        const window = await engine.GetAgentContextWindow(fixture.conversation.ID, ctx.user);
        AssertEqual(window.length, 2, 'independent window');
    });

    let failures = 0;
    try {
        failures = await runner.Run();
    } finally {
        for (const fixture of fixtures) {
            try {
                await CleanupFixture(fixture);
            } catch (error) {
                console.error('Fixture cleanup failed:', error);
            }
        }
        await ctx.pool.close();
    }
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Suite crashed:', error);
    process.exit(2);
});
