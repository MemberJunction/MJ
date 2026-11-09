/**
 * Pins how the AI Agent form picks the prompts and actions linked to the agent. It used to re-filter
 * every agent's links once per prompt and once per action; it now gathers this agent's links once.
 * These specs hold it to the same answers: engine order, IDs matched in any case, other agents'
 * links ignored.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { MJAIAgentFormComponentExtended } from './ai-agent-form.component';

const AGENT = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_AGENT = 'bbbbbbbb-0000-0000-0000-000000000002';

function linked() {
    const form = Object.create(MJAIAgentFormComponentExtended.prototype) as MJAIAgentFormComponentExtended;
    (form as unknown as { record: { ID: string } }).record = { ID: AGENT };
    (form as unknown as { resolveLinkedPromptsAndActions(): void }).resolveLinkedPromptsAndActions();
    return { prompts: form.AgentPrompts.map(p => p.Name), actions: form.AgentActions.map(a => a.Name) };
}

describe('MJAIAgentFormComponentExtended linked prompts and actions', () => {
    afterEach(() => vi.restoreAllMocks());

    it("keeps engine order, matches IDs in any case, and ignores other agents' links", () => {
        vi.spyOn(AIEngineBase, 'Instance', 'get').mockReturnValue({
            Prompts: [{ ID: 'p1', Name: 'Summarize' }, { ID: 'p2', Name: 'Classify' }, { ID: 'p3', Name: 'Draft' }],
            AgentPrompts: [
                { AgentID: AGENT.toUpperCase(), PromptID: 'P3' },
                { AgentID: OTHER_AGENT, PromptID: 'p2' },
                { AgentID: AGENT, PromptID: 'p1' },
            ],
            AgentActions: [
                { AgentID: AGENT, ActionID: 'A2' },
                { AgentID: OTHER_AGENT, ActionID: 'a1' },
            ],
        } as unknown as AIEngineBase);
        vi.spyOn(ActionEngineBase, 'Instance', 'get').mockReturnValue({
            Actions: [{ ID: 'a1', Name: 'Send Email' }, { ID: 'a2', Name: 'Web Search' }],
        } as unknown as ActionEngineBase);

        expect(linked()).toEqual({ prompts: ['Summarize', 'Draft'], actions: ['Web Search'] });
    });

    it('returns nothing for an agent with no links', () => {
        vi.spyOn(AIEngineBase, 'Instance', 'get').mockReturnValue({
            Prompts: [{ ID: 'p1', Name: 'Summarize' }],
            AgentPrompts: [{ AgentID: OTHER_AGENT, PromptID: 'p1' }],
            AgentActions: [],
        } as unknown as AIEngineBase);
        vi.spyOn(ActionEngineBase, 'Instance', 'get').mockReturnValue({
            Actions: [{ ID: 'a1', Name: 'Send Email' }],
        } as unknown as ActionEngineBase);

        expect(linked()).toEqual({ prompts: [], actions: [] });
    });
});
