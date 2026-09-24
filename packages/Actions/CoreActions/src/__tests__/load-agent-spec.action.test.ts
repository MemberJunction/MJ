/**
 * Tests for the Load Agent Spec action's lossless-output invariant.
 *
 * The action truncates sub-agent PromptText to 100 chars for readability, but that
 * truncation must apply ONLY to the human-readable `Message`. The `AgentSpec` OUTPUT PARAM
 * is what callers (Agent Manager) merge into the payload and Builder persists — if it were
 * truncated, saving a modified agent would overwrite every sub-agent's prompt template with
 * a 100-char prefix (AgentSpecSync.savePrompts writes PromptText unconditionally). These
 * tests lock the invariant "a loader never emits a lossy value under the key the writer reads."
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadFromDatabaseMock } = vi.hoisted(() => ({ loadFromDatabaseMock: vi.fn() }));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/ai-agent-manager', () => ({
    AgentSpecSync: {
        LoadFromDatabase: (...args: unknown[]) => loadFromDatabaseMock(...args),
    },
}));

import { LoadAgentSpecAction } from '../custom/ai/load-agent-spec.action';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (action: any, params: unknown) => action.InternalRunAction(params);

type Param = { Name: string; Type: string; Value: unknown };
const VALID_UUID = '09d7e6ee-a3dc-4dbd-ba72-349fc68fe8c0';
const LONG_PROMPT = 'X'.repeat(250); // well over the 100-char truncation limit

const makeParams = (agentId: string): { Params: Param[]; ContextUser: unknown } => ({
    Params: [{ Name: 'AgentID', Type: 'Input', Value: agentId }],
    ContextUser: { ID: 'user-1' },
});

const specWithSubAgentPrompt = () => ({
    ID: 'agent-1',
    Name: 'Parent',
    SubAgents: [
        { SubAgent: { ID: 'sub-1', Name: 'Child', Prompts: [{ PromptText: LONG_PROMPT }], SubAgents: [] } },
    ],
});

describe('LoadAgentSpecAction', () => {
    beforeEach(() => {
        loadFromDatabaseMock.mockReset();
    });

    it('returns the FULL sub-agent prompt in the AgentSpec output param (no truncation persists)', async () => {
        const fullSpec = specWithSubAgentPrompt();
        loadFromDatabaseMock.mockResolvedValue({ toJSON: () => fullSpec });

        const params = makeParams(VALID_UUID);
        const r = await run(new LoadAgentSpecAction(), params);

        expect(r.Success).toBe(true);
        const outParam = params.Params.find(p => p.Name === 'AgentSpec');
        expect(outParam).toBeDefined();
        // The object that merges into the payload and round-trips to persistence MUST be complete.
        const outSpec = outParam!.Value as ReturnType<typeof specWithSubAgentPrompt>;
        expect(outSpec.SubAgents[0].SubAgent.Prompts[0].PromptText).toBe(LONG_PROMPT);
        expect(outSpec.SubAgents[0].SubAgent.Prompts[0].PromptText.length).toBe(250);
    });

    it('truncates sub-agent prompts only in the human-readable Message', async () => {
        const fullSpec = specWithSubAgentPrompt();
        loadFromDatabaseMock.mockResolvedValue({ toJSON: () => fullSpec });

        const params = makeParams(VALID_UUID);
        const r = await run(new LoadAgentSpecAction(), params);

        // Message is the display surface — the full 250-char prompt must NOT appear there.
        expect(r.Message).not.toContain(LONG_PROMPT);
        expect(r.Message).toContain('...');
    });
});
