/**
 * conversation-compaction.checks.ts — the 'conversation-compaction' bundle (CC1–CC20).
 *
 * GRADUATED from packages/MJServer/integration-test-scripts/conversation-compaction-tests.ts
 * (shipped inside PR #2732 as a standalone dispatcher; check bodies lifted verbatim), so the
 * logic now lives ONCE in the registry and is consumed identically by the thin tsx dispatcher
 * and the metadata-driven IntegrationTestDriver (IT30).
 *
 * Deterministic, SERVER transport, NO LLM calls: exercises the cross-turn conversation
 * compaction assembly layer (plans/agent-conversation-compaction.md) against the live DB —
 * real spCreate/spUpdate + the trgConversationDetail_AssignSequence trigger, the real
 * ConversationEngine cache, the retrieval tools, BaseAgent's single-INSERT step persistence,
 * and the prior-turn tool-result carry-forward cache. Server-only by necessity: BaseAgent
 * step internals, ConversationEngine warm-cache coherency, and PriorTurnToolResultCache are
 * server-process seams with no client surface (the resolver-side wire coverage is a separate,
 * live-model gap — see plans/integration-test-expansion/next-merge-coverage-study-2026-07-20.md).
 *
 * ORDERED bundle: CC1 creates the conversation CC2–CC7 window checks reuse (same pattern as
 * the Q-series sharing warmed slots). Fixtures are accumulated on ctx.CompactionFixture and
 * torn down FK-ordered (steps → runs → details → conversations) by the registered lifecycle,
 * tagged "(mj-integration-test — safe to delete)".
 *
 * The whole bundle mutates the DB by design (its own tagged fixtures only; reference-only
 * toward existing records), mirroring runquery-cache: checks are NOT RequiresMutation-gated.
 */
import { RunView } from '@memberjunction/core';
import {
    ConversationEngine,
    ConversationWindowFields,
    ConversationWindowSourceRow,
    MJConversationEntity,
    MJConversationBranchEntity,
    MJConversationDetailEntity,
    MJAIAgentSessionEntity,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJConversationDetailArtifactEntity,
} from '@memberjunction/core-entities';
import type { ConversationBranchRow } from '@memberjunction/core-entities';
import { MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseAgent, ConversationToolManager, ConversationSearchHit, ConversationToolMessage, PriorTurnToolResultCache } from '@memberjunction/ai-agents';
import type { CarryForwardStepRecord } from '@memberjunction/ai-agents';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, ConversationCompactionFixture } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** Resolve the bundle's accumulator fixture or fail loudly (lifecycle Setup must run first). */
function requireFixture(ctx: IntegrationCheckContext): ConversationCompactionFixture {
    if (!ctx.CompactionFixture) {
        throw new Error('CompactionFixture not initialized — the conversation-compaction lifecycle Setup must run before its checks.');
    }
    return ctx.CompactionFixture;
}

/**
 * Creates a conversation + N detail rows through the real entity save path (spCreate +
 * the Sequence trigger) and records them on the accumulator for teardown.
 */
async function CreateConversationFixture(
    ctx: IntegrationCheckContext,
    messages: Array<{ role: 'User' | 'AI'; text: string; sessionId?: string }>
): Promise<{ Conversation: MJConversationEntity; Details: MJConversationDetailEntity[] }> {
    const fixture = requireFixture(ctx);
    const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
    conversation.Name = `Compaction assembly test ${FIXTURE_TAG}`;
    conversation.UserID = ctx.User.ID;
    if (!(await conversation.Save())) {
        throw new Error(`Fixture conversation save failed: ${conversation.LatestResult?.CompleteMessage}`);
    }

    const details: MJConversationDetailEntity[] = [];
    for (const message of messages) {
        const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
        detail.ConversationID = conversation.ID;
        detail.Role = message.role;
        detail.Message = message.text;
        detail.HiddenToUser = false;
        if (message.sessionId) {
            detail.AgentSessionID = message.sessionId;   // collapses to ONE timeline card
        }
        if (!(await detail.Save())) {
            throw new Error(`Fixture detail save failed: ${detail.LatestResult?.CompleteMessage}`);
        }
        details.push(detail);
    }
    const entry = { Conversation: conversation, Details: details };
    fixture.Conversations.push(entry);
    return entry;
}

/** Creates a real (tagged) AI Agent Run row referencing an existing agent. */
async function CreateAgentRunFixture(ctx: IntegrationCheckContext, conversationId?: string): Promise<MJAIAgentRunEntityExtended> {
    const fixture = requireFixture(ctx);
    const anyAgent = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: AI Agents', Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
    }, ctx.User);
    Assert(anyAgent.Success && anyAgent.Results.length > 0, 'an existing agent to reference');
    const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
    run.AgentID = anyAgent.Results[0].ID;
    run.Status = 'Running';
    run.StartedAt = new Date();
    if (conversationId) {
        run.ConversationID = conversationId;
    }
    Assert(await run.Save(), `run fixture save: ${run.LatestResult?.CompleteMessage}`);
    fixture.AgentRuns.push(run);
    return run;
}

/**
 * BaseAgent internals surface used by CC8/CC9 — same access pattern as the unit tier
 * (base-agent-step-save.test.ts); the methods are protected/private by design.
 */
interface BaseAgentStepInternals {
    _activeProvider: unknown;
    _agentRun: MJAIAgentRunEntityExtended;
    _executeParams: Record<string, unknown> | undefined;
    _depth: number;
    _conversationBranches: ConversationBranchRow[];
    _stepSaveQueue: { Flush(): Promise<{ failures: number }> };
    createStepEntity(p: Record<string, unknown>): Promise<MJAIAgentRunStepEntityExtended>;
    loadPriorTurnToolResultSteps(p: Record<string, unknown>): Promise<CarryForwardStepRecord[]>;
    cachePriorTurnToolResults(): void;
}

/**
 * A settled (AwaitingFeedback) run for `agentId` whose reply row is `replyDetailId`, with one
 * completed Tool step whose OutputData carries `marker`.
 */
async function CreateSettledToolRun(
    ctx: IntegrationCheckContext,
    conversationId: string,
    agentId: string,
    replyDetailId: string,
    marker: string
): Promise<void> {
    const fixture = requireFixture(ctx);
    const run = await CreateAgentRunFixture(ctx, conversationId);
    const step = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', ctx.User);
    step.AgentRunID = run.ID;
    step.StepNumber = 1;
    step.StepType = 'Tool';
    step.StepName = `Conversation Tool: getMessageBySequence ${FIXTURE_TAG}`;
    step.Status = 'Completed';
    step.OutputData = JSON.stringify({ marker });
    Assert(await step.Save(), `tool step fixture save: ${step.LatestResult?.CompleteMessage}`);
    fixture.Steps.push(step);
    run.AgentID = agentId;
    run.Status = 'AwaitingFeedback';
    run.ConversationDetailID = replyDetailId;
    Assert(await run.Save(), `run settle save: ${run.LatestResult?.CompleteMessage}`);
}

/** The carry-forward loader's DB fallback on one path: the cache is cleared first. */
async function LoadPriorTurnFromDb(
    internals: BaseAgentStepInternals,
    params: Record<string, unknown>,
    branches: ConversationBranchRow[]
): Promise<CarryForwardStepRecord[]> {
    PriorTurnToolResultCache.Instance.Clear();
    internals._conversationBranches = branches;
    return internals.loadPriorTurnToolResultSteps(params);
}

/** True when the loader returned exactly one step and it carries `marker`. */
function HasOnlyMarker(steps: CarryForwardStepRecord[], marker: string): boolean {
    return steps.length === 1 && (steps[0].OutputData || '').includes(`"${marker}"`);
}

/** A conversation with a trunk and one sibling branch, from {@link CreateBranchedConversationFixture}. */
interface BranchedConversationFixture {
    ConversationID: string;
    BranchID: string;
    /** Trunk row `<label>-1` (User), at the fork point: on both paths. */
    BeforeFork: MJConversationDetailEntity;
    /** Trunk row `<label>-2` (AI), after the fork point: on the trunk only. */
    TrunkOnly: MJConversationDetailEntity;
    /** Branch row `<label>-3` (AI): on the branch only. */
    BranchOnly: MJConversationDetailEntity;
}

/**
 * Trunk rows `<label>-1` (User) and `<label>-2` (AI), and a branch that forks after
 * `<label>-1` and holds `<label>-3` (AI). Every row is recorded on the accumulator for teardown.
 */
async function CreateBranchedConversationFixture(
    ctx: IntegrationCheckContext,
    label: string
): Promise<BranchedConversationFixture> {
    const fixture = requireFixture(ctx);
    const entry = await CreateConversationFixture(ctx, [{ role: 'User', text: `${label}-1` }, { role: 'AI', text: `${label}-2` }]);
    const conversationId = entry.Conversation.ID;

    const branch = await ctx.Provider.GetEntityObject<MJConversationBranchEntity>('MJ: Conversation Branches', ctx.User);
    branch.ConversationID = conversationId;
    branch.ParentBranchID = null;
    branch.ForkFromSequence = entry.Details[0].Sequence;
    Assert(await branch.Save(), `branch fixture save: ${branch.LatestResult?.CompleteMessage}`);
    fixture.WindowRoots.push(branch);   // after its details, before its conversation

    const branchRow = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
    branchRow.ConversationID = conversationId;
    branchRow.Role = 'AI';
    branchRow.Message = `${label}-3`;
    branchRow.HiddenToUser = false;
    branchRow.BranchID = branch.ID;
    Assert(await branchRow.Save(), `branch row save: ${branchRow.LatestResult?.CompleteMessage}`);
    entry.Details.push(branchRow);   // teardown sweeps entry.Details

    return {
        ConversationID: conversationId,
        BranchID: branch.ID,
        BeforeFork: entry.Details[0],
        TrunkOnly: entry.Details[1],
        BranchOnly: branchRow,
    };
}

/**
 * Sibling branches never share a prior run. Trunk rows sb-1 (User) and sb-2 (AI); branch B
 * forks after sb-1 and holds sb-3. A run whose reply is sb-3 is not the trunk's prior run, and a
 * NEWER run whose reply is sb-2 (trunk, after the fork) is not B's prior run.
 */
async function AssertSiblingBranchRunsNotCarried(
    ctx: IntegrationCheckContext,
    internals: BaseAgentStepInternals,
    agentId: string
): Promise<void> {
    const conv = await CreateBranchedConversationFixture(ctx, 'sb');
    const conversationId = conv.ConversationID;

    const branches = await ConversationEngine.LoadBranchesFresh(conversationId, ctx.User, ctx.Provider);
    const trunkParams = { conversationId, contextUser: ctx.User, agent: { ID: agentId } };
    const branchParams = { ...trunkParams, ConversationBranchID: conv.BranchID };

    await CreateSettledToolRun(ctx, conversationId, agentId, conv.BranchOnly.ID, 'on-branch');
    AssertEqual((await LoadPriorTurnFromDb(internals, trunkParams, [])).length, 0,
        'a run whose reply is on a sibling branch is not the trunk prior run');
    Assert(HasOnlyMarker(await LoadPriorTurnFromDb(internals, branchParams, branches), 'on-branch'),
        'the branch finds its own run (control)');

    await CreateSettledToolRun(ctx, conversationId, agentId, conv.TrunkOnly.ID, 'on-trunk');
    Assert(HasOnlyMarker(await LoadPriorTurnFromDb(internals, branchParams, branches), 'on-branch'),
        'a newer trunk run past the fork point is not the branch prior run');
    Assert(HasOnlyMarker(await LoadPriorTurnFromDb(internals, trunkParams, []), 'on-trunk'),
        'the trunk finds its own run (control)');
    internals._conversationBranches = [];
    PriorTurnToolResultCache.Instance.Clear();
}

/** First existing row's ID for a reference-only lookup, or fail loudly. */
async function RequireAnyId(ctx: IntegrationCheckContext, entityName: string): Promise<string> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: entityName, Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success && result.Results.length > 0, `an existing ${entityName} row to reference`);
    return result.Results[0].ID;
}

/**
 * A real (tagged) agent session, so details can carry a genuine `AgentSessionID`.
 *
 * The FK is enforced, so the session-expansion check cannot fake the stamp — which is the
 * point: the behaviour under test is the engine issuing a SECOND read keyed on that column.
 */
async function CreateSessionFixture(ctx: IntegrationCheckContext, conversationId: string): Promise<string> {
    const fixture = requireFixture(ctx);
    const session = await ctx.Provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', ctx.User);
    session.AgentID = await RequireAnyId(ctx, 'MJ: AI Agents');
    session.UserID = ctx.User.ID;
    session.Status = 'Closed';
    session.ConversationID = conversationId;
    session.LastActiveAt = new Date();
    Assert(await session.Save(), `session fixture save: ${session.LatestResult?.CompleteMessage}`);
    fixture.WindowRoots.push(session);   // details reference it — deleted after them
    return session.ID;
}

/**
 * Attaches a real artifact to a detail through all THREE tables the window rebuild walks:
 * artifact → version → detail/version junction.
 *
 * `LoadDetailWindow` reconstructs the card the stored query used to hand over pre-joined, so
 * nothing short of the real chain exercises it — this is precisely the seam unit mocks cannot
 * reach.
 */
async function AttachArtifactFixture(
    ctx: IntegrationCheckContext,
    detailId: string,
    direction: 'Input' | 'Output',
    name: string
): Promise<{ ArtifactID: string; VersionID: string }> {
    const artifactId = await CreateArtifactFixture(ctx, name);
    const versionId = await CreateArtifactVersionFixture(ctx, artifactId, 1, name);
    await LinkArtifactVersionFixture(ctx, detailId, versionId, direction);
    return { ArtifactID: artifactId, VersionID: versionId };
}

/** A tagged `MJ: Artifacts` row with no versions; returns its ID. */
async function CreateArtifactFixture(ctx: IntegrationCheckContext, name: string): Promise<string> {
    const fixture = requireFixture(ctx);
    const artifact = await ctx.Provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
    artifact.Name = `${name} ${FIXTURE_TAG}`;
    artifact.EnvironmentID = await RequireAnyId(ctx, 'MJ: Environments');
    artifact.TypeID = await RequireAnyId(ctx, 'MJ: Artifact Types');
    artifact.UserID = ctx.User.ID;
    artifact.Visibility = 'Always';
    Assert(await artifact.Save(), `artifact fixture save: ${artifact.LatestResult?.CompleteMessage}`);
    fixture.WindowRoots.push(artifact);
    return artifact.ID;
}

/** Version `versionNumber` of an artifact fixture; returns its ID. */
async function CreateArtifactVersionFixture(
    ctx: IntegrationCheckContext,
    artifactId: string,
    versionNumber: number,
    name: string
): Promise<string> {
    const fixture = requireFixture(ctx);
    const version = await ctx.Provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
    version.ArtifactID = artifactId;
    version.VersionNumber = versionNumber;
    version.Name = `${name} v${versionNumber}`;
    version.Content = JSON.stringify({ probe: name, version: versionNumber });
    version.UserID = ctx.User.ID;
    Assert(await version.Save(), `version fixture save: ${version.LatestResult?.CompleteMessage}`);
    fixture.WindowRoots.push(version);   // LIFO teardown puts this before its artifact
    return version.ID;
}

/** Links a detail to an artifact version through `MJ: Conversation Detail Artifacts`. */
async function LinkArtifactVersionFixture(
    ctx: IntegrationCheckContext,
    detailId: string,
    versionId: string,
    direction: 'Input' | 'Output'
): Promise<void> {
    const fixture = requireFixture(ctx);
    const junction = await ctx.Provider.GetEntityObject<MJConversationDetailArtifactEntity>(
        'MJ: Conversation Detail Artifacts', ctx.User
    );
    junction.ConversationDetailID = detailId;
    junction.ArtifactVersionID = versionId;
    junction.Direction = direction;
    Assert(await junction.Save(), `junction fixture save: ${junction.LatestResult?.CompleteMessage}`);
    fixture.WindowJunctions.push(junction);   // references a detail — deleted before it
}

/** Version numbers that `filter` returns from `MJ: Artifact Versions`, ascending. */
async function ArtifactVersionNumbers(ctx: IntegrationCheckContext, filter: string): Promise<number[]> {
    const result = await new RunView().RunView<{ VersionNumber: number }>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: filter,
        OrderBy: 'VersionNumber ASC',
        Fields: ['VersionNumber'],
        ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success, `artifact version read: ${result.ErrorMessage}`);
    return result.Results.map(r => r.VersionNumber);
}

/** Messages of the pinned rows that `filter` returns from `MJ: Conversation Details`, by Sequence. */
async function PinnedMessages(ctx: IntegrationCheckContext, filter: string): Promise<string[]> {
    const result = await new RunView().RunView<{ Message: string }>({
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: `${filter} AND IsPinned=1`,
        OrderBy: 'Sequence ASC',
        Fields: ['Message'],
        ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success, `pinned detail read: ${result.ErrorMessage}`);
    return result.Results.map(r => r.Message);
}

/** Sequential `mN` messages, for the paging checks. */
function PlainMessages(count: number): Array<{ role: 'User' | 'AI'; text: string }> {
    return Array.from({ length: count }, (_, i) => ({
        role: (i % 2 === 0 ? 'User' : 'AI') as 'User' | 'AI',
        text: `w${i + 1}`,
    }));
}

/** The ordered conversation-compaction bundle. Mutates the DB by design (own tagged fixtures only). */
export const ConversationCompactionChecks: NamedCheck[] = [
    {
        Id: 'conversation-compaction.CC1',
        Name: 'CC1: trigger assigns per-conversation monotonic Sequence via real spCreate',
        Fn: async (ctx): Promise<void> => {
            const entry = await CreateConversationFixture(ctx, [
                { role: 'User', text: 'm1' },
                { role: 'AI', text: 'm2' },
                { role: 'User', text: 'm3' },
            ]);
            const sequences = entry.Details.map(d => d.Sequence);
            AssertEqual(JSON.stringify(sequences), JSON.stringify([1, 2, 3]), 'Sequence values from spCreate SELECT-back');
        }
    },
    {
        Id: 'conversation-compaction.CC2',
        Name: 'CC2: GetAgentContextWindow — no boundary → all messages, chronological, metadata stamped',
        Fn: async (ctx): Promise<void> => {
            const entry = requireFixture(ctx).Conversations[0];
            const window = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User);
            AssertEqual(window.length, 3, 'window length');
            AssertEqual(window.map(m => m.content).join(','), 'm1,m2,m3', 'chronological content');
            AssertEqual(window.map(m => m.role).join(','), 'user,assistant,user', 'role mapping');
            AssertEqual(window[0].metadata?.sequence, 1, 'sequence metadata');
            Assert(!!window[0].metadata?.conversationDetailId, 'conversationDetailId stamped');
            Assert(window.every(m => !m.metadata?.isConversationSummary), 'no summary flags without a boundary');
        }
    },
    {
        Id: 'conversation-compaction.CC3',
        Name: 'CC3: maxTailMessages caps the no-boundary window',
        Fn: async (ctx): Promise<void> => {
            const entry = requireFixture(ctx).Conversations[0];
            const window = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User, { maxTailMessages: 2 });
            AssertEqual(window.map(m => m.content).join(','), 'm2,m3', 'last-2 cap');
        }
    },
    {
        Id: 'conversation-compaction.CC4',
        Name: 'CC4: summary save → boundary window [summary, boundary raw, tail] via warm cache',
        Fn: async (ctx): Promise<void> => {
            const entry = requireFixture(ctx).Conversations[0];
            // External entity save (the same path the compaction manager uses) — the engine's
            // entity-event handler must merge it into the already-warm cache in place.
            const boundary = entry.Details[1]; // Sequence 2
            boundary.SummaryOfEarlierConversation = 'SUMMARY of sequence 1';
            Assert(await boundary.Save(), `summary save: ${boundary.LatestResult?.CompleteMessage}`);

            const window = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User);
            AssertEqual(window.length, 3, 'summary + boundary + tail');
            AssertEqual(window[0].metadata?.isConversationSummary, true, 'first message is the summary');
            AssertEqual(window[0].metadata?.summaryBoundarySequence, 2, 'boundary sequence');
            AssertEqual(window[0].content as string, 'SUMMARY of sequence 1', 'summary text verbatim');
            AssertEqual(window[1].content as string, 'm2', 'boundary row included raw');
            AssertEqual(window[2].content as string, 'm3', 'tail after boundary');
        }
    },
    {
        Id: 'conversation-compaction.CC5',
        Name: 'CC5: highest-sequence summary wins (recursive summaries)',
        Fn: async (ctx): Promise<void> => {
            const entry = requireFixture(ctx).Conversations[0];
            const newer = entry.Details[2]; // Sequence 3
            newer.SummaryOfEarlierConversation = 'SUMMARY of sequences 1-2';
            Assert(await newer.Save(), `newer summary save: ${newer.LatestResult?.CompleteMessage}`);

            const window = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User);
            AssertEqual(window.length, 2, 'summary + boundary(=last row)');
            AssertEqual(window[0].metadata?.summaryBoundarySequence, 3, 'newest boundary selected');
            AssertEqual(window[1].content as string, 'm3', 'boundary raw');
        }
    },
    {
        Id: 'conversation-compaction.CC6',
        Name: 'CC6: excludeDetailIds drops the in-flight placeholder row',
        Fn: async (ctx): Promise<void> => {
            const entry = requireFixture(ctx).Conversations[0];
            const placeholderId = entry.Details[2].ID;
            const window = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User, {
                excludeDetailIds: [placeholderId],
            });
            // With the seq-3 row excluded, its summary no longer participates; the seq-2
            // summary (set in CC4) becomes the boundary again.
            AssertEqual(window[0].metadata?.summaryBoundarySequence, 2, 'boundary recomputed without excluded row');
            Assert(window.every(m => m.metadata?.conversationDetailId !== placeholderId), 'excluded row absent');
        }
    },
    {
        Id: 'conversation-compaction.CC7',
        Name: 'CC7: retrieval tools page and search the full stored history (live cache reads)',
        Fn: async (ctx): Promise<void> => {
            const entry = requireFixture(ctx).Conversations[0];
            const tools = new ConversationToolManager();
            tools.Initialize(entry.Conversation.ID, ctx.User);

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
        }
    },
    {
        Id: 'conversation-compaction.CC8',
        Name: 'CC8: second conversation is independently sequenced and windowed',
        Fn: async (ctx): Promise<void> => {
            const entry = await CreateConversationFixture(ctx, [
                { role: 'User', text: 'other-1' },
                { role: 'AI', text: 'other-2' },
            ]);
            AssertEqual(JSON.stringify(entry.Details.map(d => d.Sequence)), JSON.stringify([1, 2]), 'independent sequence space');
            const window = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User);
            AssertEqual(window.length, 2, 'independent window');
        }
    },
    {
        Id: 'conversation-compaction.CC9',
        Name: 'CC9: completed-at-creation step persists via a SINGLE INSERT (real spCreate, no UPDATE round trip)',
        Fn: async (ctx): Promise<void> => {
            const fixture = requireFixture(ctx);
            const run = await CreateAgentRunFixture(ctx);
            const agent = new BaseAgent();
            const internals = agent as unknown as BaseAgentStepInternals;
            internals._activeProvider = ctx.Provider;
            internals._agentRun = run;

            const step = await internals.createStepEntity({
                stepType: 'Compaction',
                stepName: `Cross-Turn Conversation Compaction (post-turn) ${FIXTURE_TAG}`,
                contextUser: ctx.User,
                completed: { success: true, outputData: { fired: true, tokensBefore: 3000, tokensAfter: 1200 } },
            });
            fixture.Steps.push(step);
            const flushed = await internals._stepSaveQueue.Flush();
            AssertEqual(flushed.failures, 0, 'the single INSERT persisted');

            // Fresh read-back through the real view: terminal state landed in ONE write —
            // __mj_UpdatedAt still equals __mj_CreatedAt (any post-INSERT UPDATE would bump it).
            const persisted = await new RunView().RunView<{ Status: string; Success: boolean; OutputData: string; __mj_CreatedAt: string; __mj_UpdatedAt: string }>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `ID='${step.ID}'`,
                Fields: ['Status', 'Success', 'OutputData', '__mj_CreatedAt', '__mj_UpdatedAt'],
                ResultType: 'simple',
            }, ctx.User);
            Assert(persisted.Success && persisted.Results.length === 1, 'step row read back');
            const row = persisted.Results[0];
            AssertEqual(row.Status, 'Completed', 'INSERT carried terminal Status');
            AssertEqual(row.Success, true, 'INSERT carried Success');
            Assert((row.OutputData || '').includes('"fired":true'), 'INSERT carried OutputData');
            AssertEqual(new Date(row.__mj_UpdatedAt).getTime(), new Date(row.__mj_CreatedAt).getTime(), 'no UPDATE followed the INSERT');
        }
    },
    {
        Id: 'conversation-compaction.CC10',
        Name: 'CC10: carry-forward loader — DB fallback on cache miss, cache precedence on hit, agent- and branch-scoped provenance',
        Fn: async (ctx): Promise<void> => {
            const fixture = requireFixture(ctx);
            const entry = await CreateConversationFixture(ctx, [{ role: 'User', text: 'cf-1' }]);
            const run = await CreateAgentRunFixture(ctx, entry.Conversation.ID);
            const agentId = run.AgentID;

            // A real completed Tool step on the prior run (direct entity save — the DB-side shape).
            const toolStep = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', ctx.User);
            toolStep.AgentRunID = run.ID;
            toolStep.StepNumber = 1;
            toolStep.StepType = 'Tool';
            toolStep.StepName = `Conversation Tool: getMessageBySequence ${FIXTURE_TAG}`;
            toolStep.Status = 'Completed';
            toolStep.OutputData = JSON.stringify({ marker: 'from-db' });
            Assert(await toolStep.Save(), `tool step fixture save: ${toolStep.LatestResult?.CompleteMessage}`);
            fixture.Steps.push(toolStep);
            // AwaitingFeedback (not Completed) — the normal chat-turn ending. The loader's
            // settled-status filter must find it (this exact status is what the PR-review
            // gate fix exists for).
            run.Status = 'AwaitingFeedback';
            // The loader carries a run forward only when its reply row is on the run's branch
            // path; this conversation's row is on the trunk.
            run.ConversationDetailID = entry.Details[0].ID;
            Assert(await run.Save(), `run settle save: ${run.LatestResult?.CompleteMessage}`);

            const agent = new BaseAgent();
            const internals = agent as unknown as BaseAgentStepInternals;
            internals._activeProvider = ctx.Provider;
            const loadParams = { conversationId: entry.Conversation.ID, contextUser: ctx.User, agent: { ID: agentId } };

            // Miss → the RunView pair against the real run/step rows (AwaitingFeedback found).
            PriorTurnToolResultCache.Instance.Clear();
            const fromDb = await internals.loadPriorTurnToolResultSteps(loadParams);
            AssertEqual(fromDb.length, 1, 'DB fallback found the AwaitingFeedback prior run tool step');
            Assert((fromDb[0].OutputData || '').includes('from-db'), 'DB fallback returned the stored OutputData');

            // Provenance: a DIFFERENT agent in the same conversation must not see this run.
            const otherAgentParams = { ...loadParams, agent: { ID: '00000000-0000-0000-0000-00000000BEEF' } };
            const otherAgentSteps = await internals.loadPriorTurnToolResultSteps(otherAgentParams);
            AssertEqual(otherAgentSteps.length, 0, "another agent's loader finds no prior run (AgentID filter)");

            // Hit → the cache wins without touching the DB (distinct marker proves the source).
            PriorTurnToolResultCache.Instance.Set(entry.Conversation.ID, agentId, null, [{ OutputData: JSON.stringify({ marker: 'from-cache' }) }]);
            const fromCache = await internals.loadPriorTurnToolResultSteps(loadParams);
            AssertEqual(fromCache.length, 1, 'cache hit returned one record');
            Assert((fromCache[0].OutputData || '').includes('from-cache'), 'cache took precedence over the DB rows');

            // Population path: a settling root run publishes its in-memory steps for the next turn.
            PriorTurnToolResultCache.Instance.Clear();
            internals._agentRun = run; // Status='AwaitingFeedback', Steps holds the in-memory tool step
            run.Steps.push(toolStep);
            internals._executeParams = { conversationId: entry.Conversation.ID };
            internals._depth = 0;
            internals.cachePriorTurnToolResults();
            const populated = PriorTurnToolResultCache.Instance.Get(entry.Conversation.ID, agentId, null);
            Assert(!!populated && populated.length === 1 && (populated[0].OutputData || '').includes('from-db'),
                'AwaitingFeedback run completion populated the cache from in-memory steps');
            AssertEqual(PriorTurnToolResultCache.Instance.Get(entry.Conversation.ID, '00000000-0000-0000-0000-00000000BEEF', null), undefined,
                "population is agent-scoped — another agent's key stays cold");
            PriorTurnToolResultCache.Instance.Clear();

            // Branch provenance: a run on a sibling branch is never carried forward.
            await AssertSiblingBranchRunsNotCarried(ctx, internals, agentId);
        }
    },
    {
        Id: 'conversation-compaction.CC11',
        Name: 'CC11: AssembleContextWindow parity — fresh RunView rows AND the production loader fold identically to the engine window',
        Fn: async (ctx): Promise<void> => {
            const entry = await CreateConversationFixture(ctx, [
                { role: 'User', text: 'p1' },
                { role: 'AI', text: 'p2' },
                { role: 'User', text: 'p3' },
                { role: 'AI', text: 'p4' },
            ]);
            // Give it a boundary so the fold path (not just passthrough) is compared.
            const boundary = entry.Details[2];
            boundary.SummaryOfEarlierConversation = 'PARITY SUMMARY of 1-2';
            Assert(await boundary.Save(), `parity summary save: ${boundary.LatestResult?.CompleteMessage}`);

            const engineWindow = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User);

            // Deliberately an INDEPENDENT hand-built query (not ConversationEngine.
            // LoadWindowRowsFresh): this parity probe exists to verify that a fresh
            // ConversationWindowFields load folds identically to the cached engine window —
            // routing it through the production loader would make the comparison circular.
            const rows = await new RunView().RunView<ConversationWindowSourceRow>({
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ConversationID='${entry.Conversation.ID}'`,
                OrderBy: 'Sequence ASC',
                Fields: [...ConversationWindowFields],
                ResultType: 'simple',
            }, ctx.User);
            Assert(rows.Success, `fresh row load: ${rows.ErrorMessage}`);
            const assembled = ConversationEngine.AssembleContextWindow(rows.Results || []);

            AssertEqual(assembled.length, engineWindow.length, 'window lengths match');
            for (let i = 0; i < assembled.length; i++) {
                AssertEqual(assembled[i].content as string, engineWindow[i].content as string, `content[${i}] matches`);
                AssertEqual(assembled[i].role, engineWindow[i].role, `role[${i}] matches`);
                AssertEqual(assembled[i].metadata?.sequence, engineWindow[i].metadata?.sequence, `sequence[${i}] matches`);
            }

            // PRODUCTION LOADER parity (coverage-study rec #3): LoadWindowRowsFresh is what every
            // production path actually calls, yet before this assertion it never ran in any test —
            // a field-list or filter regression there (e.g. dropping SummaryOfEarlierConversation
            // from ConversationWindowFields) would have passed the whole suite. The hand-built
            // query above stays independent; the loader is asserted AGAINST it, so the probe is
            // not circular.
            const loaderRows = await ConversationEngine.LoadWindowRowsFresh(entry.Conversation.ID, ctx.User, ctx.Provider);
            AssertEqual(loaderRows.length, (rows.Results || []).length, 'production loader row count matches the independent query');
            const loaderAssembled = ConversationEngine.AssembleContextWindow(loaderRows);
            AssertEqual(loaderAssembled.length, engineWindow.length, 'production-loader window length matches the engine');
            for (let i = 0; i < loaderAssembled.length; i++) {
                AssertEqual(loaderAssembled[i].content as string, engineWindow[i].content as string, `loader content[${i}] matches`);
                AssertEqual(loaderAssembled[i].metadata?.sequence, engineWindow[i].metadata?.sequence, `loader sequence[${i}] matches`);
            }

            // Exclusion parity: excluding the newest row produces identical windows too.
            const newestId = entry.Details[3].ID;
            const engineExcluded = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User, { excludeDetailIds: [newestId] });
            const assembledExcluded = ConversationEngine.AssembleContextWindow(rows.Results || [], { excludeDetailIds: [newestId] });
            AssertEqual(assembledExcluded.length, engineExcluded.length, 'excluded window lengths match');
            Assert(assembledExcluded.every(m => m.metadata?.conversationDetailId !== newestId), 'excluded row absent from assembled window');
        }
    },
    {
        Id: 'conversation-compaction.CC12',
        Name: 'CC12: BREAK ATTEMPT — concurrent same-conversation inserts still get distinct consecutive Sequences (UPDLOCK path)',
        Fn: async (ctx): Promise<void> => {
            // Coverage-study rec #4: the trgConversationDetail_AssignSequence trigger takes
            // UPDLOCK/HOLDLOCK on its MAX-read precisely to serialize concurrent inserts into one
            // conversation — the one case the sequential CC1 fixture never exercises. A regression
            // (lost lock hints, MAX moved outside the trigger) shows up here as duplicate or
            // gapped Sequence values.
            const entry = await CreateConversationFixture(ctx, [{ role: 'User', text: 'seed' }]);
            const saves = await Promise.all([1, 2, 3, 4].map(async n => {
                const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
                detail.ConversationID = entry.Conversation.ID;
                detail.Role = 'User';
                detail.Message = `concurrent-${n}`;
                detail.HiddenToUser = false;
                const ok = await detail.Save();
                return { ok, detail };
            }));
            for (const s of saves) {
                Assert(s.ok, `concurrent save failed: ${s.detail.LatestResult?.CompleteMessage}`);
                entry.Details.push(s.detail); // teardown sweeps entry.Details
            }
            const sequences = saves.map(s => s.detail.Sequence).sort((a, b) => a - b);
            AssertEqual(new Set(sequences).size, 4, `all concurrent Sequences distinct (got ${JSON.stringify(sequences)})`);
            AssertEqual(JSON.stringify(sequences), JSON.stringify([2, 3, 4, 5]), 'consecutive after the seed row — no gaps, no duplicates');
        }
    },
    {
        Id: 'conversation-compaction.CC13',
        Name: 'CC13: LoadDetailWindow — newest page, chronological, real trigger Sequence bounds',
        Fn: async (ctx): Promise<void> => {
            // Its own 12-row conversation: CC1's fixture is 3 rows and is mutated by CC4-CC7.
            const entry = await CreateConversationFixture(ctx, PlainMessages(12));
            const window = await ConversationEngine.Instance.LoadDetailWindow(
                { ConversationID: entry.Conversation.ID, PageSize: 4, RawOverread: 4 }, ctx.User
            );

            AssertEqual(window.Details.length, 4, 'RawOverread respected against the live view');
            // The read is Sequence DESC; the engine reverses it. Sequences come from the real
            // trgConversationDetail_AssignSequence trigger, not from a fixture literal.
            AssertEqual(window.Details.map(d => d.Message).join(','), 'w9,w10,w11,w12', 'newest page, chronological');
            AssertEqual(window.OldestSequence, 9, 'OldestSequence is the page floor');
            AssertEqual(window.NewestSequence, 12, 'NewestSequence is the conversation tail');
            AssertEqual(window.HasMoreAbove, true, 'probe finds the eight rows below the page');
            AssertEqual(window.Failed, false, 'a successful read is not flagged');
        }
    },
    {
        Id: 'conversation-compaction.CC14',
        Name: 'CC14: BeforeSequence pages strictly older, and the first page reports no more above',
        Fn: async (ctx): Promise<void> => {
            const entry = requireFixture(ctx).Conversations[requireFixture(ctx).Conversations.length - 1];
            const older = await ConversationEngine.Instance.LoadDetailWindow(
                { ConversationID: entry.Conversation.ID, BeforeSequence: 9, PageSize: 4, RawOverread: 4 }, ctx.User
            );
            AssertEqual(older.Details.map(d => d.Message).join(','), 'w5,w6,w7,w8', 'the page below Sequence 9');
            Assert(older.Details.every(d => d.Sequence < 9), 'strictly older than the bound — no overlap');
            AssertEqual(older.HasMoreAbove, true, 'four rows still below');

            const first = await ConversationEngine.Instance.LoadDetailWindow(
                { ConversationID: entry.Conversation.ID, BeforeSequence: 5, PageSize: 4, RawOverread: 4 }, ctx.User
            );
            AssertEqual(first.Details.map(d => d.Message).join(','), 'w1,w2,w3,w4', 'the start of the conversation');
            AssertEqual(first.HasMoreAbove, false, 'nothing below Sequence 1 — the sentinel retires');
        }
    },
    {
        Id: 'conversation-compaction.CC15',
        Name: 'CC15: a window is never written into the engine detail cache',
        Fn: async (ctx): Promise<void> => {
            // The highest-consequence invariant in the windowing work, proven against a live
            // engine rather than a mock: GetAgentContextWindow reads _detailCache as COMPLETE
            // history, so a partial entry there starves the agent silently and with no error.
            const entry = await CreateConversationFixture(ctx, PlainMessages(6));
            Assert(!ConversationEngine.Instance.HasCachedDetails(entry.Conversation.ID), 'cache cold before the window read');

            await ConversationEngine.Instance.LoadDetailWindow(
                { ConversationID: entry.Conversation.ID, PageSize: 2, RawOverread: 2 }, ctx.User
            );
            Assert(!ConversationEngine.Instance.HasCachedDetails(entry.Conversation.ID), 'window did NOT populate _detailCache');

            // And the full-history API still returns everything for the same conversation.
            const agentWindow = await ConversationEngine.Instance.GetAgentContextWindow(entry.Conversation.ID, ctx.User);
            AssertEqual(agentWindow.length, 6, 'agent context window still sees all six rows');
        }
    },
    {
        Id: 'conversation-compaction.CC16',
        Name: 'CC16: session expansion completes a realtime session split by the page boundary',
        Fn: async (ctx): Promise<void> => {
            // Rows 5-7 share one session. A newest-4 read lands on w7 as its oldest row, which
            // is session-stamped — the engine must issue a second, session-keyed read for w5-w6
            // or the card renders from a partial row set AND repeats on the next older page.
            const conversationId = (await CreateConversationFixture(ctx, [{ role: 'User', text: 'seed' }]))
                .Conversation.ID;
            const sessionId = await CreateSessionFixture(ctx, conversationId);
            const fixture = requireFixture(ctx);
            const entry = fixture.Conversations[fixture.Conversations.length - 1];

            for (let i = 2; i <= 10; i++) {
                const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>(
                    'MJ: Conversation Details', ctx.User
                );
                detail.ConversationID = conversationId;
                detail.Role = 'AI';
                detail.Message = `w${i}`;
                detail.HiddenToUser = false;
                if (i >= 5 && i <= 7) {
                    detail.AgentSessionID = sessionId;
                }
                Assert(await detail.Save(), `session-row save: ${detail.LatestResult?.CompleteMessage}`);
                entry.Details.push(detail);
            }

            const window = await ConversationEngine.Instance.LoadDetailWindow(
                { ConversationID: conversationId, PageSize: 4, RawOverread: 4 }, ctx.User
            );

            const stamped = window.Details.filter(d => d.AgentSessionID === sessionId).map(d => d.Message);
            AssertEqual(stamped.join(','), 'w5,w6,w7', 'every row of the session came along');
            // 4 requested + the 2 the expansion reached back for.
            AssertEqual(window.Details.length, 6, 'page widened by exactly the missing session rows');
            AssertEqual(window.OldestSequence, 5, 'OldestSequence moved to the session floor');
        }
    },
    {
        Id: 'conversation-compaction.CC17',
        Name: 'CC17: artifact rebuild joins junction → version → artifact for the window rows',
        Fn: async (ctx): Promise<void> => {
            const entry = await CreateConversationFixture(ctx, [
                { role: 'User', text: 'ask' },
                { role: 'AI', text: 'answer with artifact' },
            ]);
            const target = entry.Details[1];
            const created = await AttachArtifactFixture(ctx, target.ID, 'Output', 'Window probe artifact');

            const window = await ConversationEngine.Instance.LoadDetailWindow(
                { ConversationID: entry.Conversation.ID }, ctx.User
            );

            const artifacts = window.ArtifactsByDetailId.get(target.ID);
            Assert(!!artifacts && artifacts.length === 1, 'one artifact reconstructed for the detail');
            const card = artifacts![0];
            AssertEqual(card.ArtifactID, created.ArtifactID, 'artifact id from the third table');
            AssertEqual(card.ArtifactVersionID, created.VersionID, 'version id from the junction');
            AssertEqual(card.VersionNumber, 1, 'version number carried through');
            Assert((card.ArtifactName ?? '').startsWith('Window probe artifact'), 'artifact NAME resolved (third read)');
            Assert(!!card.ArtifactType, 'artifact TYPE resolved');
        }
    },
    {
        Id: 'conversation-compaction.CC18',
        Name: "CC18: only Direction='Output' artifacts reach the window",
        Fn: async (ctx): Promise<void> => {
            // Mirrors GetConversationComplete: inputs are what the user handed the agent and
            // are not rendered as result cards. Dropping the filter would double every card on
            // a detail that both consumed and produced an artifact.
            const entry = await CreateConversationFixture(ctx, [{ role: 'AI', text: 'both directions' }]);
            const target = entry.Details[0];
            await AttachArtifactFixture(ctx, target.ID, 'Output', 'Kept output');
            await AttachArtifactFixture(ctx, target.ID, 'Input', 'Excluded input');

            const window = await ConversationEngine.Instance.LoadDetailWindow(
                { ConversationID: entry.Conversation.ID }, ctx.User
            );

            const artifacts = window.ArtifactsByDetailId.get(target.ID) ?? [];
            AssertEqual(artifacts.length, 1, 'the Input artifact was filtered out');
            Assert((artifacts[0].ArtifactName ?? '').startsWith('Kept output'), 'the surviving card is the Output one');
        }
    },
    {
        Id: 'conversation-compaction.CC19',
        Name: 'CC19: ArtifactVersionScopeFilter — each path sees the versions its messages link (any direction) and the unlinked one',
        Fn: async (ctx): Promise<void> => {
            // v1 is linked (Output) from the trunk row after the fork, v2 (Input) from the
            // branch row, and v3 from no message. A version is visible on a path when a message
            // on that path links it, in either direction, or when no message links it.
            const conv = await CreateBranchedConversationFixture(ctx, 'av');
            const artifactId = await CreateArtifactFixture(ctx, 'Scoped history');
            const onTrunk = await CreateArtifactVersionFixture(ctx, artifactId, 1, 'Scoped history');
            const onBranch = await CreateArtifactVersionFixture(ctx, artifactId, 2, 'Scoped history');
            await CreateArtifactVersionFixture(ctx, artifactId, 3, 'Scoped history');
            await LinkArtifactVersionFixture(ctx, conv.TrunkOnly.ID, onTrunk, 'Output');
            await LinkArtifactVersionFixture(ctx, conv.BranchOnly.ID, onBranch, 'Input');

            const trunkScope = ConversationEngine.TrunkScope(conv.ConversationID);
            const branchScope = await ConversationEngine.LoadScope(conv.ConversationID, conv.BranchID, ctx.User, ctx.Provider);

            // conversation-scope: artifact-wide control read, no conversation path applies
            const all = await ArtifactVersionNumbers(ctx, `ArtifactID='${artifactId}'`);
            AssertEqual(all.join(','), '1,2,3', 'control: the artifact has three versions');
            AssertEqual((await ArtifactVersionNumbers(ctx, ConversationEngine.ArtifactVersionScopeFilter(trunkScope, artifactId))).join(','),
                '1,3', 'the trunk sees its Output-linked version and the unlinked one');
            AssertEqual((await ArtifactVersionNumbers(ctx, ConversationEngine.ArtifactVersionScopeFilter(branchScope, artifactId))).join(','),
                '2,3', 'the branch sees its Input-linked version and the unlinked one');
        }
    },
    {
        Id: 'conversation-compaction.CC20',
        Name: 'CC20: ScopeFilter — a pinned-row read on each path returns only the pins on that path',
        Fn: async (ctx): Promise<void> => {
            // One pin per path, plus the row at the fork point, which is on both paths.
            const conv = await CreateBranchedConversationFixture(ctx, 'pin');
            for (const row of [conv.BeforeFork, conv.TrunkOnly, conv.BranchOnly]) {
                row.IsPinned = true;
                Assert(await row.Save(), `pin save: ${row.LatestResult?.CompleteMessage}`);
            }

            const trunkScope = ConversationEngine.TrunkScope(conv.ConversationID);
            const branchScope = await ConversationEngine.LoadScope(conv.ConversationID, conv.BranchID, ctx.User, ctx.Provider);

            // conversation-scope: whole-conversation control read across every path
            const all = await PinnedMessages(ctx, `ConversationID='${conv.ConversationID}'`);
            AssertEqual(all.join(','), 'pin-1,pin-2,pin-3', 'control: three pinned rows across both paths');
            AssertEqual((await PinnedMessages(ctx, ConversationEngine.ScopeFilter(trunkScope))).join(','),
                'pin-1,pin-2', 'the trunk reads its own pins and not the branch pin');
            AssertEqual((await PinnedMessages(ctx, ConversationEngine.ScopeFilter(branchScope))).join(','),
                'pin-1,pin-3', 'the branch reads the fork-point pin and its own pin, not the trunk pin after the fork');
        }
    }
];

for (const check of ConversationCompactionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Accumulator lifecycle: Setup only initializes the empty accumulator (fixtures are created
// INSIDE the ordered checks); Teardown deletes everything FK-ordered, best-effort per record.
IntegrationCheckRegistry.Instance.RegisterLifecycle('conversation-compaction', {
    Setup: async ctx => {
        ctx.CompactionFixture = { Conversations: [], AgentRuns: [], Steps: [], WindowJunctions: [], WindowRoots: [] };
    },
    Teardown: async ctx => {
        const fixture = ctx.CompactionFixture;
        if (!fixture) {
            return;
        }
        // Junctions point AT conversation details, so they go before the details below.
        for (const junction of fixture.WindowJunctions) {
            try { await junction.Delete(); } catch (e) { console.error('Window junction cleanup failed:', e); }
        }
        for (const step of fixture.Steps) {
            try { await step.Delete(); } catch (e) { console.error('Step fixture cleanup failed:', e); }
        }
        for (const run of fixture.AgentRuns) {
            try { await run.Delete(); } catch (e) { console.error('Agent run fixture cleanup failed:', e); }
        }
        // Details BEFORE conversations, as before — but now in a pass of their own, because
        // WindowRoots has to run between the two: a detail references its agent session, and
        // that session references the conversation. Deleting a conversation with the loop
        // still holding its session would fail the FK.
        for (const entry of fixture.Conversations) {
            for (const detail of entry.Details) {
                try { await detail.Delete(); } catch (e) { console.error('Detail fixture cleanup failed:', e); }
            }
        }
        // REVERSE insertion order: an artifact version was pushed after its artifact, so
        // reversing puts the version first. Sessions land here too — after the details that
        // pointed at them, before the conversations they point at.
        for (const root of [...fixture.WindowRoots].reverse()) {
            try { await root.Delete(); } catch (e) { console.error('Window root cleanup failed:', e); }
        }
        for (const entry of fixture.Conversations) {
            try { await entry.Conversation.Delete(); } catch (e) { console.error('Conversation fixture cleanup failed:', e); }
        }
        ctx.CompactionFixture = undefined;
    }
});
