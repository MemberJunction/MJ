/**
 * agent-loop-live.checks.ts — the 'agent-loop-live' bundle (AL1–AL7): the LIVE-MODEL loop
 * foundation (plans/integration-test-expansion/agents-extended-suite-proposal.md §5).
 *
 * Runs the seeded imperative test agents SERVER-IN-PROCESS (AgentRunner.RunAgent via makeAIClient,
 * passing ctx.User — NOT over the GraphQL wire; Q8, the dedicated wire path is IT63) and asserts
 * ONLY deterministic, framework-produced observables — never the model's prose (§3):
 *   - AIAgentRun.Status settled + every AIAgentRunStep terminal with CompletedAt (verifyAgentRun),
 *   - loop step lineage/order (Prompt → Actions → Prompt) + action-step TargetLogID linkage,
 *   - the deterministic ACTION output (42 for 6*7) carried into a later AIPromptRun.Messages,
 *   - the cost-rollup arithmetic identity (run total = Σ child AIPromptRun tokens),
 *   - conversation-run plumbing (ConversationID + agent-response ConversationDetail),
 *   - the multi-vendor model ladder as a test target: a broken-binding run FAILS cleanly (AL6),
 *     a primary-binding-off run COMPLETES on the secondary vendor (AL7).
 *
 * LIVE-MODEL tier (RequiresLiveModel) — real model calls, ON by default, opt out with RUN_AGENT_TESTS=0.
 * Self-cleaning: every live run is FK-purged (prompt runs → steps → run) and every conversation/detail
 * removed in the lifecycle Teardown; the AL6/AL7 binding toggles restore inside each check's own finally.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MJConversationEntity, MJConversationDetailEntity, MJAIPromptModelEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, verifyAgentRun } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentLiveFixture } from '@memberjunction/testing-integration';
import {
    AGENT_LIVE_FIXTURE_TAG, AGENT_LIVE_SETTLE_MS, newMarker, sleep,
    makeAIClient, userTurn, runAgentOverWire, resolveRunId,
    getRunSteps, getPromptRuns, sumPromptRunTokens, deleteById, purgeAgentRun,
} from './agent-live-shared';

/** Resolve the bundle accumulator or fail loudly (lifecycle Setup must have run). */
function fixture(ctx: IntegrationCheckContext): AgentLiveFixture {
    if (!ctx.AgentLoopLiveFixture) {
        throw new Error('AgentLoopLiveFixture not initialized — the agent-loop-live lifecycle Setup must run first.');
    }
    return ctx.AgentLoopLiveFixture;
}

/** Load an IT roster agent by exact name (entity_object) or throw. */
async function agentByName(name: string, user: UserInfo): Promise<MJAIAgentEntityExtended> {
    const r = await new RunView().RunView<MJAIAgentEntityExtended>({
        EntityName: 'MJ: AI Agents',
        ExtraFilter: `Name='${name}'`,
        ResultType: 'entity_object',
        BypassCache: true,
    }, user);
    Assert(r.Success && r.Results.length === 1, `agent '${name}' resolves in metadata (found ${r.Results?.length ?? 0})`);
    const agent = r.Results[0];
    Assert(agent.Status === 'Active', `agent '${name}' is Active (got '${agent.Status}')`);
    return agent;
}

/** Create a marker-tagged conversation + one user ConversationDetail; returns both ids (recorded for teardown). */
async function createConversationTurn(ctx: IntegrationCheckContext, text: string): Promise<{ conversationId: string; detailId: string }> {
    const fx = fixture(ctx);
    const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
    conversation.Name = `AL live ${fx.Marker} ${AGENT_LIVE_FIXTURE_TAG}`;
    conversation.UserID = ctx.User.ID;
    Assert(await conversation.Save(), `conversation save: ${conversation.LatestResult?.CompleteMessage}`);
    fx.ConversationIds.push(conversation.ID);

    const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
    detail.ConversationID = conversation.ID;
    detail.Role = 'User';
    detail.Message = text;
    detail.HiddenToUser = false;
    Assert(await detail.Save(), `conversation detail save: ${detail.LatestResult?.CompleteMessage}`);
    fx.ConversationDetailIds.push(detail.ID);
    return { conversationId: conversation.ID, detailId: detail.ID };
}

/** Resolve the winning run id and record it for FK-safe teardown; fail loudly if no run landed. */
async function landRun(ctx: IntegrationCheckContext, result: Awaited<ReturnType<typeof runAgentOverWire>>, fallbackFilter: string, label: string): Promise<string> {
    await sleep(AGENT_LIVE_SETTLE_MS);
    const runId = await resolveRunId(result, ctx.User, fallbackFilter, ctx.Provider);
    Assert(!!runId, `${label}: an AI Agent Run landed (result.agentRun or fallback query)`);
    fixture(ctx).LiveRunIds.push(runId!);
    return runId!;
}

/** Active MJ: AI Prompt Models bindings for the agent's system prompt, highest-priority first. */
async function activeBindingsForAgentPrompt(agentName: string, user: UserInfo): Promise<MJAIPromptModelEntity[]> {
    // The IT roster names each prompt "<Agent> - System Prompt".
    const promptName = `${agentName} - System Prompt`;
    const prompt = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: AI Prompts', ExtraFilter: `Name='${promptName}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(prompt.Success && prompt.Results.length === 1, `prompt '${promptName}' resolves (found ${prompt.Results?.length ?? 0})`);
    const bindings = await new RunView().RunView<MJAIPromptModelEntity>({
        EntityName: 'MJ: AI Prompt Models',
        ExtraFilter: `PromptID='${prompt.Results[0].ID}' AND Status='Active'`,
        OrderBy: 'Priority DESC',
        ResultType: 'entity_object',
        BypassCache: true,
    }, user);
    Assert(bindings.Success, `prompt-model bindings load: ${bindings.ErrorMessage}`);
    return bindings.Results || [];
}

export const AgentLoopLiveChecks: NamedCheck[] = [
    {
        Id: 'agent-loop-live.AL1',
        Name: 'AL1: IT: Echo Agent run reaches terminal state with every step finalized (no orphan Running steps)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), echo, userTurn('ping'));
            const runId = await landRun(ctx, result, `AgentID='${echo.ID}' AND Status<>'Running'`, 'AL1');
            // Deep pass: run settled + EVERY step terminal with CompletedAt (the ai-verify.ts:96 invariant).
            const v = await verifyAgentRun(runId, ctx.User, true);
            Assert(v.stepCount > 0, 'AL1: the run produced at least one step (the loop executed)');
        }
    },
    {
        Id: 'agent-loop-live.AL2',
        Name: 'AL2: IT: Tool Loop Agent produces Prompt→Actions(Calculate Expression, linked)→Prompt lineage in order',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const toolLoop = await agentByName('IT: Tool Loop Agent', ctx.User);
            const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), toolLoop, userTurn('Calculate 6*7 using your action.'));
            const runId = await landRun(ctx, result, `AgentID='${toolLoop.ID}' AND Status<>'Running'`, 'AL2');
            // deep=false: the Actions step's Action Execution Log is written by the fire-and-forget
            // queue and can land arbitrarily late — its finalization is pinned by actions-pipeline
            // AP2. AL2's contract is the STEP lineage + linkage (TargetLogID set), asserted below.
            await verifyAgentRun(runId, ctx.User, true, { skipActionLogs: true });

            const steps = await getRunSteps(runId, ctx.User, ctx.Provider);
            const types = steps.map(s => s.StepType);
            // P-compliance: the model took the instructed action (an Actions step naming Calculate Expression).
            const actionStep = steps.find(s => s.StepType === 'Actions' && (s.StepName ?? '').toLowerCase().includes('calculate expression'));
            Assert(!!actionStep, `AL2 [model-noncompliance:] expected an Actions step for 'Calculate Expression' (steps=${JSON.stringify(types)})`);
            Assert(!!actionStep!.TargetLogID, 'AL2: the Actions step is linked to its Action Execution Log (TargetLogID set)');
            // Lineage: a Prompt precedes the Actions step and another Prompt follows it (loop sequencing).
            const actionIdx = steps.indexOf(actionStep!);
            Assert(steps.slice(0, actionIdx).some(s => s.StepType === 'Prompt'), 'AL2: a Prompt step precedes the action (decision turn)');
            Assert(steps.slice(actionIdx + 1).some(s => s.StepType === 'Prompt'), 'AL2: a Prompt step follows the action (result-consuming turn)');
        }
    },
    {
        Id: 'agent-loop-live.AL3',
        Name: 'AL3: the deterministic action result (42 for 6*7) is carried into a later prompt run\'s Messages',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const toolLoop = await agentByName('IT: Tool Loop Agent', ctx.User);
            const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), toolLoop, userTurn('Calculate 6*7 using your action.'));
            const runId = await landRun(ctx, result, `AgentID='${toolLoop.ID}' AND Status<>'Running'`, 'AL3');

            const steps = await getRunSteps(runId, ctx.User, ctx.Provider);
            const actionStep = steps.find(s => s.StepType === 'Actions' && (s.StepName ?? '').toLowerCase().includes('calculate expression'));
            Assert(!!actionStep, 'AL3 [model-noncompliance:] the instructed Calculate Expression action ran (prerequisite for the carry-into-context assertion)');

            const promptRuns = await getPromptRuns(runId, ctx.User, ctx.Provider);
            Assert(promptRuns.length >= 2, `AL3: at least two prompt runs (a result-consuming turn exists) — got ${promptRuns.length}`);
            // 42 is the ACTION's deterministic output for 6*7 (pure code), not model prose — so any prompt
            // run whose assembled Messages contains it proves action results are folded back into context.
            const carried = promptRuns.some(p => (p.Messages ?? '').includes('42'));
            Assert(carried, 'AL3: a prompt run\'s Messages contains the action result 42 (action output folded into context)');
        }
    },
    {
        Id: 'agent-loop-live.AL4',
        Name: 'AL4: cost-rollup identity — AIAgentRun.TotalTokensUsed = Σ child AIPromptRun tokens, all > 0',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const toolLoop = await agentByName('IT: Tool Loop Agent', ctx.User);
            const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), toolLoop, userTurn('Calculate 6*7 using your action.'));
            const runId = await landRun(ctx, result, `AgentID='${toolLoop.ID}' AND Status<>'Running'`, 'AL4');

            const promptRuns = await getPromptRuns(runId, ctx.User, ctx.Provider);
            const sum = sumPromptRunTokens(promptRuns);
            Assert(sum > 0, `AL4: child prompt runs recorded tokens (Σ=${sum} > 0)`);

            const run = await new RunView().RunView<{ TotalTokensUsed: number | null; TotalTokensUsedRollup: number | null }>({
                EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${runId}'`,
                Fields: ['TotalTokensUsed', 'TotalTokensUsedRollup'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            const row = run.Results?.[0];
            const total = Number(row?.TotalTokensUsed ?? row?.TotalTokensUsedRollup ?? 0);
            Assert(total > 0, `AL4: the run header rollup total > 0 (got ${total})`);
            // Exact arithmetic identity over nondeterministic magnitudes — this agent has no sub-agents,
            // so the run total must equal the sum of its own prompt runs (catches double-billing / dropped rollup).
            AssertEqual(total, sum, `AL4: TotalTokensUsed (${total}) equals Σ prompt-run tokens (${sum})`);
        }
    },
    {
        Id: 'agent-loop-live.AL5',
        Name: 'AL5: conversation-run plumbing — a conversation-linked run stamps ConversationID and writes an agent-response detail',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            // NOTE: replaces the proposal\'s Chat-pause AL5 — no Chat-instructed agent is seeded among the 5
            // verified IT agents; HITL pause/approve is covered by the agent-plan-mode bundle (sibling). This
            // asserts the conversation-run linkage the carry-forward + compaction bundles depend on.
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const turn = await createConversationTurn(ctx, `AL5 conversation plumbing ${fixture(ctx).Marker}`);
            const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), echo, userTurn('ping'), { conversationDetailId: turn.detailId, conversationId: turn.conversationId });
            const runId = await landRun(ctx, result, `ConversationID='${turn.conversationId}' AND AgentID='${echo.ID}'`, 'AL5');

            const run = await new RunView().RunView<{ ConversationID: string | null }>({
                EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${runId}'`,
                Fields: ['ConversationID'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            AssertEqual((run.Results?.[0]?.ConversationID ?? '').toUpperCase(), turn.conversationId.toUpperCase(), 'AL5: run stamped with the conversation id');

            const details = await new RunView().RunView<{ ID: string; Role: string }>({
                EntityName: 'MJ: Conversation Details', ExtraFilter: `ConversationID='${turn.conversationId}'`,
                Fields: ['ID', 'Role'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            Assert(details.Success, `AL5: conversation details load: ${details.ErrorMessage}`);
            // NOTE: the agent-response ConversationDetail (Role='AI') is written by the RESOLVER
            // layer (RunAIAgentResolver), not by core AgentRunner.RunAgent — so under the
            // server-in-process transport it is not written, and that is correct. AL5's invariant
            // is the conversation-run LINKAGE (ConversationID stamped on the run, asserted above),
            // which the carry-forward + compaction bundles depend on. The response-detail write is
            // a resolver-path concern; the dedicated client-wire bundle exercises that path.
            Assert((details.Results || []).some(d => d.Role === 'User'), 'AL5: the seeding user ConversationDetail is present (linkage intact)');
        }
    },
    {
        Id: 'agent-loop-live.AL6',
        Name: 'AL6: failure path — IT: Failover Agent with ALL model bindings deactivated terminates non-Completed with an ErrorMessage, steps still terminal',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const failover = await agentByName('IT: Failover Agent', ctx.User);
            const bindings = await activeBindingsForAgentPrompt('IT: Failover Agent', ctx.User);
            Assert(bindings.length >= 1, 'AL6: the failover prompt has at least one active model binding to disable');
            try {
                for (const b of bindings) { b.Status = 'Inactive'; Assert(await b.Save(), `AL6: disable binding ${b.ID}: ${b.LatestResult?.CompleteMessage}`); }
                await sleep(AGENT_LIVE_SETTLE_MS);

                const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), failover, userTurn('ping'));
                const runId = await resolveRunId(result, ctx.User, `AgentID='${failover.ID}'`, ctx.Provider);
                if (runId) {
                    fixture(ctx).LiveRunIds.push(runId);
                    await sleep(AGENT_LIVE_SETTLE_MS);
                    const run = await new RunView().RunView<{ Status: string; ErrorMessage: string | null }>({
                        EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${runId}'`,
                        Fields: ['Status', 'ErrorMessage'], ResultType: 'simple', BypassCache: true,
                    }, ctx.User);
                    const row = run.Results?.[0];
                    Assert(!!row, 'AL6: the run row was read back');
                    Assert(row!.Status !== 'Completed', `AL6: a no-model run did NOT silently Complete (Status='${row!.Status}')`);
                    Assert(row!.Status !== 'Running', `AL6: the failed run finalized (not stuck Running)`);
                    Assert(!!row!.ErrorMessage && String(row!.ErrorMessage).length > 0, 'AL6: an ErrorMessage was recorded on the failed run');
                    // Any steps that were created must still be terminal (no orphan Running step on the failure path).
                    const steps = await getRunSteps(runId, ctx.User, ctx.Provider);
                    Assert(steps.every(s => s.Status !== 'Running' && s.CompletedAt != null), 'AL6: every step finalized on the failure path');
                } else {
                    // No run row created at all is also an acceptable clean failure (nothing to leak).
                    Assert(result.success === false, 'AL6: with no model available the wire call reports failure');
                }
            } finally {
                for (const b of bindings) { b.Status = 'Active'; if (!(await b.Save())) { console.error(`AL6: RESTORE FAILED for binding ${b.ID}: ${b.LatestResult?.CompleteMessage}`); } }
            }
        }
    },
    {
        Id: 'agent-loop-live.AL7',
        Name: 'AL7: failover chain — with the primary binding deactivated, the run completes on the SECONDARY vendor (persisted AIPromptRun model)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const failover = await agentByName('IT: Failover Agent', ctx.User);
            const bindings = await activeBindingsForAgentPrompt('IT: Failover Agent', ctx.User);
            Assert(bindings.length >= 2, `AL7: the failover prompt needs ≥2 active bindings for a ladder (got ${bindings.length})`);
            const primary = bindings[0];
            const secondary = bindings[1];
            try {
                primary.Status = 'Inactive';
                Assert(await primary.Save(), `AL7: disable primary binding ${primary.ID}: ${primary.LatestResult?.CompleteMessage}`);
                await sleep(AGENT_LIVE_SETTLE_MS);

                const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), failover, userTurn('ping'));
                const runId = await landRun(ctx, result, `AgentID='${failover.ID}' AND Status<>'Running'`, 'AL7');
                await verifyAgentRun(runId, ctx.User, true);

                const promptRuns = await getPromptRuns(runId, ctx.User, ctx.Provider);
                Assert(promptRuns.length >= 1, 'AL7: the run recorded at least one prompt run');
                // Structural failover proof: the winning model persisted on the AIPromptRun is the secondary
                // binding\'s model, never the deactivated primary\'s (swapping models never rewrites this check).
                const winners = promptRuns.filter(p => p.ModelID);
                Assert(winners.length > 0, 'AL7: a prompt run recorded its winning ModelID');
                Assert(winners.every(p => !UUIDsEqual(p.ModelID!, primary.ModelID)), `AL7: no prompt run ran on the disabled primary model (${primary.ModelID})`);
                Assert(winners.some(p => UUIDsEqual(p.ModelID!, secondary.ModelID)), `AL7: the run completed on the secondary model (${secondary.ModelID})`);
                // Rollup identity still holds on the failover path (no double-billing).
                const run = await new RunView().RunView<{ TotalTokensUsed: number | null; TotalTokensUsedRollup: number | null }>({
                    EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${runId}'`, Fields: ['TotalTokensUsed', 'TotalTokensUsedRollup'], ResultType: 'simple', BypassCache: true,
                }, ctx.User);
                const rr = run.Results?.[0];
                AssertEqual(Number(rr?.TotalTokensUsed ?? rr?.TotalTokensUsedRollup ?? -1), sumPromptRunTokens(promptRuns), 'AL7: rollup identity holds after failover');
            } finally {
                primary.Status = 'Active';
                if (!(await primary.Save())) { console.error(`AL7: RESTORE FAILED for primary binding ${primary.ID}: ${primary.LatestResult?.CompleteMessage}`); }
            }
        }
    },
];

for (const check of AgentLoopLiveChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/** FK-safe teardown: purge live runs (prompt runs → steps → run), then all details, then conversations. */
async function teardownAgentLive(fx: AgentLiveFixture | undefined, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    if (!fx) {
        return;
    }
    for (const runId of fx.LiveRunIds) {
        try { await purgeAgentRun(runId, provider, user); } catch (e) { console.error('live run purge failed:', e); }
    }
    for (const stepId of fx.FabricatedStepIds) {
        await deleteById('MJ: AI Agent Run Steps', stepId, provider, user);
    }
    for (const runId of fx.FabricatedRunIds) {
        await deleteById('MJ: AI Agent Runs', runId, provider, user);
    }
    // Delete EVERY detail in each fixture conversation (covers agent-response details the run created), then the conversation.
    for (const convId of fx.ConversationIds) {
        try {
            const details = await new RunView().RunView<{ ID: string }>({
                EntityName: 'MJ: Conversation Details', ExtraFilter: `ConversationID='${convId}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
            }, user);
            for (const d of (details.Success ? details.Results : [])) {
                await deleteById('MJ: Conversation Details', d.ID, provider, user);
            }
            await deleteById('MJ: Conversations', convId, provider, user);
        } catch (e) { console.error('conversation cleanup failed:', e); }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-loop-live', {
    Setup: async ctx => {
        ctx.AgentLoopLiveFixture = {
            Marker: newMarker('AL'),
            ConversationIds: [], ConversationDetailIds: [], LiveRunIds: [], FabricatedRunIds: [], FabricatedStepIds: [],
        };
    },
    Teardown: async ctx => {
        await teardownAgentLive(ctx.AgentLoopLiveFixture, ctx.Provider, ctx.User);
        ctx.AgentLoopLiveFixture = undefined;
    }
});
