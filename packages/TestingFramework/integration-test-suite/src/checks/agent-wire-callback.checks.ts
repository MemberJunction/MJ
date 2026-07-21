/**
 * agent-wire-callback.checks.ts — the 'agent-wire-callback' bundle (WC1–WC2).
 *
 * The ONE place the extended-agents family runs an agent over the ACTUAL GraphQL WIRE
 * (GraphQLAIClient.RunAIAgent → live MJAPI), specifically to exercise the fire-and-forget
 * FOLLOW-UP CALLBACK path: the mutation returns immediately (`fireAndForget: true`), and the
 * completed run is delivered later via the WebSocket completion event, reconciled by
 * FireAndForgetHelper. The rest of the family runs server-in-process (Q8) because the
 * correlation-heavy assertions need a synchronous handle — but the wire callback itself is
 * load-bearing product behavior (it's how the browser gets agent results, and how a headless
 * client with a real WS provider does too), so it gets dedicated coverage here.
 *
 * TRANSPORT: CLIENT (IT record transport:'client'). The integration client bootstrap installs a
 * full GraphQLDataProvider, which DOES implement PushStatusUpdates + WebSockets in Node — so the
 * real fire-and-forget + WS-completion path runs. Under any non-GraphQL provider these checks
 * skip-as-pass loudly (they cannot exercise the wire).
 *
 * LIVE-MODEL tier: real model calls (IT: Echo Agent on its cheap/fast binding). Marker-isolated,
 * self-cleaning.
 */
import { RunView, Metadata } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import type { ExecuteAgentParams, ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import { Assert } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const createdRunIds: string[] = [];

/**
 * Resolve the GraphQL client for the wire path. The driver hands ctx.Provider as a `Metadata`
 * FACADE under client transport; the actual GraphQLDataProvider the client bootstrap installed
 * is the process global (Metadata.Provider) — so check ctx.Provider first, then the global.
 * Returns undefined only when neither is a GraphQL provider (genuinely not on the wire).
 */
function wireClient(provider: IMetadataProvider): GraphQLAIClient | undefined {
    if (provider instanceof GraphQLDataProvider) {
        return new GraphQLAIClient(provider);
    }
    const globalProvider = Metadata.Provider;
    if (globalProvider instanceof GraphQLDataProvider) {
        return new GraphQLAIClient(globalProvider);
    }
    return undefined;
}

async function echoAgent(user: UserInfo): Promise<MJAIAgentEntity | undefined> {
    const r = await new RunView().RunView<MJAIAgentEntity>({
        EntityName: 'MJ: AI Agents',
        ExtraFilter: `Name='IT: Echo Agent'`,
        ResultType: 'entity_object',
    }, user);
    return r.Success && r.Results.length > 0 ? r.Results[0] : undefined;
}

async function runSettled(ctx: IntegrationCheckContext, runId: string): Promise<string | undefined> {
    // Poll the persisted run for a settled status — the fire-and-forget completion may reconcile
    // just after the client promise resolves.
    for (let i = 0; i < 20; i++) {
        const r = await new RunView().RunView<{ Status: string }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ID='${runId}'`,
            Fields: ['Status'],
            ResultType: 'simple',
            BypassCache: true,
        }, ctx.User);
        const st = r.Success ? r.Results?.[0]?.Status : undefined;
        if (st && st !== 'Running') { return st; }
        await new Promise(res => setTimeout(res, 500));
    }
    return undefined;
}

export const AgentWireCallbackChecks: NamedCheck[] = [
    {
        Id: 'agent-wire-callback.WC1',
        Name: 'WC1: fire-and-forget RunAIAgent over the wire resolves via the WS completion callback with a settled run',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const client = wireClient(ctx.Provider);
            if (!client) {
                console.warn('  ⚠ agent-wire-callback.WC1 SKIPPED — not on client (GraphQL) transport; the wire callback path is unexercisable in-process.');
                return;
            }
            const agent = await echoAgent(ctx.User);
            Assert(!!agent, "IT: Echo Agent not seeded (mj sync push --dir=metadata-optional/integration-test)");

            // The mutation returns immediately (fireAndForget:true); the RESULT here can only be
            // populated by the fire-and-forget FOLLOW-UP — the WebSocket completion event that
            // FireAndForgetHelper subscribes to and reconciles. A broken callback path yields no
            // agentRun (or throws) — exactly the regression this pins.
            const result: ExecuteAgentResult = await client.RunAIAgent({
                agent: agent as unknown as MJAIAgentEntityExtended,
                conversationMessages: [{ role: 'user', content: `wire callback probe ${FIXTURE_TAG}` }],
            } as ExecuteAgentParams);

            const runId = (result as unknown as { agentRun?: { ID?: string } }).agentRun?.ID;
            Assert(!!runId, 'WC1: the fire-and-forget completion callback delivered no agentRun — the WS follow-up path is broken');
            createdRunIds.push(runId!);
            const status = await runSettled(ctx, runId!);
            Assert(status === 'Completed' || status === 'AwaitingFeedback',
                `WC1: the wire-delivered run did not settle (status=${status ?? 'never settled'})`);
        }
    },
    {
        Id: 'agent-wire-callback.WC2',
        Name: 'WC2: onProgress fires during a wire run — the streaming subscription delivers ≥1 progress event',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const client = wireClient(ctx.Provider);
            if (!client) {
                console.warn('  ⚠ agent-wire-callback.WC2 SKIPPED — not on client (GraphQL) transport.');
                return;
            }
            const agent = await echoAgent(ctx.User);
            Assert(!!agent, 'IT: Echo Agent not seeded');

            let progressEvents = 0;
            const result: ExecuteAgentResult = await client.RunAIAgent({
                agent: agent as unknown as MJAIAgentEntityExtended,
                conversationMessages: [{ role: 'user', content: `wire progress probe ${FIXTURE_TAG}` }],
                onProgress: () => { progressEvents += 1; },
            } as unknown as ExecuteAgentParams);

            const runId = (result as unknown as { agentRun?: { ID?: string } }).agentRun?.ID;
            if (runId) { createdRunIds.push(runId); }
            // The onProgress callback rides the same subscription channel as the completion event;
            // at least one progress notification must arrive over the wire during a real run. Zero
            // means the streaming subscription regressed (the browser would show no live progress).
            Assert(progressEvents > 0, 'WC2: onProgress never fired — the wire progress-streaming subscription delivered nothing');
        }
    }
];

for (const check of AgentWireCallbackChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-wire-callback', {
    Setup: async () => { createdRunIds.length = 0; },
    Teardown: async (ctx: IntegrationCheckContext) => {
        for (const id of createdRunIds) {
            try {
                const run = await ctx.Provider.GetEntityObject<import('@memberjunction/core-entities').MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
                if (await run.Load(id)) { await run.Delete(); }
            } catch { /* best effort */ }
        }
        createdRunIds.length = 0;
    }
});
