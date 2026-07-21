/**
 * Throwaway repro: run 'IT: Echo Agent' over the GraphQL wire from a headless client.
 * Proves the PushStatusUpdates defect (before fix) / the clean run (after fix).
 */
import { bootstrapIntegrationClient } from '@memberjunction/testing-integration/client';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import type { AIAgentEntity, MJAIAgentRunEntity } from '@memberjunction/core-entities';

async function main(): Promise<void> {
    await bootstrapIntegrationClient();
    const md = new Metadata();
    const user = md.CurrentUser;
    const provider = Metadata.Provider as unknown as GraphQLDataProvider;
    console.log('provider ctor:', provider?.constructor?.name);
    console.log('typeof provider.PushStatusUpdates:', typeof (provider as any).PushStatusUpdates);

    const client = new GraphQLAIClient(provider);

    const rv = new RunView();
    const r = await rv.RunView<AIAgentEntity>({
        EntityName: 'MJ: AI Agents',
        ExtraFilter: `Name='IT: Echo Agent'`,
        ResultType: 'entity_object'
    }, user);
    const agent = r.Success ? r.Results[0] : undefined;
    if (!agent) { console.error('agent not found'); process.exit(2); }
    console.log('agent:', agent.ID, agent.Name);

    const t0 = Date.now();
    let result: any;
    try {
        result = await client.RunAIAgent({
            agent,
            conversationMessages: [{ role: 'user', content: 'Hello from headless repro' }]
        } as any);
    } catch (e) {
        console.error('RunAIAgent THREW:', e instanceof Error ? e.message : String(e));
        console.error((e as Error)?.stack);
        process.exit(1);
    }
    console.log(`RunAIAgent returned in ${Date.now() - t0}ms`);
    console.log('result.success:', result?.success);
    console.log('result.errorMessage:', result?.errorMessage);
    const runId = result?.agentRun?.ID ?? result?.agentRun?.Get?.('ID');
    console.log('agentRun ID:', runId);

    if (runId) {
        const rv2 = new RunView();
        const rr = await rv2.RunView<MJAIAgentRunEntity>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ID='${runId}'`,
            ResultType: 'entity_object',
            BypassCache: true
        }, user);
        const run = rr.Success ? rr.Results[0] : undefined;
        console.log('persisted run Status:', run?.Status, '| CompletedAt:', run?.CompletedAt);
    }
    process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
