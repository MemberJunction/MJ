import { describe, expect, it, vi, afterEach } from 'vitest';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { GraphQLAIClient } from '../graphQLAIClient';
import { GraphQLDataProvider } from '../graphQLDataProvider';
import { GraphQLSystemUserClient } from '../graphQLSystemUserClient';

/**
 * `ExecuteAgentParams.Audience` and `TrustReservedRunData` are server-only: the RunAIAgent mutations have no input for
 * them. Dropping them on the wire would run a room's agent with the caller's full reach, so the clients refuse instead.
 */

const AUDIENCE: ExecuteAgentParams['Audience'] = { Mode: 'Intersection', UserIDs: ['11111111-0000-4000-8000-000000000001'] };

function params(extra: Partial<ExecuteAgentParams>): ExecuteAgentParams {
    return { agent: { ID: 'agent-1' }, conversationMessages: [], ...extra } as unknown as ExecuteAgentParams;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('agent clients refuse server-only params instead of dropping them', () => {
    it('GraphQLAIClient.RunAIAgent fails without sending a run that carries an Audience or TrustReservedRunData', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const executeGQL = vi.fn();
        const client = new GraphQLAIClient({ sessionId: 's', ExecuteGQL: executeGQL } as unknown as GraphQLDataProvider);
        for (const extra of [{ Audience: AUDIENCE }, { TrustReservedRunData: true }]) {
            const result = await client.RunAIAgent(params(extra));
            expect(result.success).toBe(false);
            expect(result.errorMessage).toMatch(/server-only/);
        }
        expect(executeGQL).not.toHaveBeenCalled();
    });

    it('GraphQLSystemUserClient.RunAIAgent fails without sending a run that carries an Audience', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const client = new GraphQLSystemUserClient('http://localhost:0/graphql', '', 's', 'key');
        const request = vi.spyOn(client.Client, 'request');
        const result = await client.RunAIAgent(params({ Audience: AUDIENCE }));
        expect(result.success).toBe(false);
        expect(request).not.toHaveBeenCalled();
    });
});
