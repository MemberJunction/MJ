/**
 * The "Name Conversation" prompt AgentRunner runs for a new conversation is spent on behalf of the
 * agent run it names, so it must run on that run's configuration, runtime keys and credential scope.
 * Under 'RuntimeOnly' a naming prompt built with only `contextUser` would bypass the scope and spend
 * the platform's keys.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIPromptParams, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const h = vi.hoisted(() => ({ executeCalls: [] as AIPromptParams[] }));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: async (): Promise<void> => undefined,
                AgentTypes: [],
                Prompts: [{ ID: 'name-prompt', Name: 'Name Conversation' }],
            };
        },
    },
}));

vi.mock('@memberjunction/ai-prompts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-prompts')>()),
    AIPromptRunner: class {
        public async ExecutePrompt(params: AIPromptParams): Promise<{ success: boolean; result: string }> {
            h.executeCalls.push(params);
            return { success: true, result: JSON.stringify({ name: 'Quarterly numbers', description: 'A chat about Q3' }) };
        }
    },
}));

import { AgentRunner } from '../AgentRunner';

type NamingInternals = {
    GenerateConversationName(
        userMessage: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        credentials?: Pick<ExecuteAgentParams, 'configurationId' | 'apiKeys' | 'CredentialScope'>
    ): Promise<{ name: string; description: string } | null>;
};

describe('AgentRunner conversation naming', () => {
    beforeEach(() => {
        h.executeCalls.length = 0;
    });

    it("runs the naming prompt on the run's configuration, API keys and credential scope", async () => {
        const runner = new AgentRunner() as unknown as NamingInternals;
        const apiKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];

        const named = await runner.GenerateConversationName(
            'How did Q3 go?',
            { ID: 'user-1' } as unknown as UserInfo,
            {} as IMetadataProvider,
            { configurationId: 'config-1', apiKeys, CredentialScope: 'RuntimeOnly' }
        );

        expect(named?.name).toBe('Quarterly numbers');
        expect(h.executeCalls).toHaveLength(1);
        expect(h.executeCalls[0].configurationId).toBe('config-1');
        expect(h.executeCalls[0].apiKeys).toBe(apiKeys);
        expect(h.executeCalls[0].CredentialScope).toBe('RuntimeOnly');
    });
});
