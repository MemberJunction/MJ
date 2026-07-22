import { describe, it, expect, vi, beforeEach } from 'vitest';

type RunViewResult = { Success: boolean; Results?: unknown[]; ErrorMessage?: string };

const state = vi.hoisted(() => ({
    runView: (): { Success: boolean; Results?: unknown[]; ErrorMessage?: string } => ({ Success: true, Results: [] }),
}));

vi.mock('@memberjunction/core', () => {
    class Metadata {
        CurrentUser = { ID: 'user-1' };
    }
    class RunView {
        async RunView(): Promise<RunViewResult> {
            return state.runView();
        }
    }
    return { Metadata, RunView };
});

// agents.ts imports GraphQLDataProvider at module load; stub it out.
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: { Instance: null },
}));

import { loadAgents, resolveTargetAgent } from '@/data/services/agents';

function agentRows(...rows: Array<{ ID: string; Name: string; Description?: string | null }>): void {
    state.runView = () => ({ Success: true, Results: rows });
}

beforeEach(() => {
    state.runView = () => ({ Success: true, Results: [] });
});

describe('loadAgents', () => {
    it('maps result rows into AgentOption shape', async () => {
        agentRows(
            { ID: '1', Name: 'Skip', Description: 'default' },
            { ID: '2', Name: 'Research Agent', Description: null },
        );
        const agents = await loadAgents();
        expect(agents).toEqual([
            { id: '1', name: 'Skip', description: 'default' },
            { id: '2', name: 'Research Agent', description: null },
        ]);
    });

    it('substitutes a placeholder name for unnamed agents', async () => {
        agentRows({ ID: '1', Name: null as unknown as string });
        const agents = await loadAgents();
        expect(agents[0].name).toBe('(unnamed agent)');
    });

    it('throws when the RunView fails', async () => {
        state.runView = () => ({ Success: false, ErrorMessage: 'db down' });
        await expect(loadAgents()).rejects.toThrow(/db down/);
    });
});

describe('resolveTargetAgent', () => {
    it('returns null when no agents exist', async () => {
        agentRows();
        expect(await resolveTargetAgent('hello')).toBeNull();
    });

    it('resolves an @mention against the agent roster (ignoring spaces/case)', async () => {
        agentRows({ ID: '1', Name: 'Skip' }, { ID: '2', Name: 'Research Agent' });
        const agent = await resolveTargetAgent('@research please look into this');
        expect(agent?.id).toBe('2');
    });

    it('falls back to Skip when an @mention does not match any agent', async () => {
        agentRows({ ID: '1', Name: 'Skip' }, { ID: '2', Name: 'Research Agent' });
        const agent = await resolveTargetAgent('@nobody are you there');
        expect(agent?.name).toBe('Skip');
    });

    it('prefers a Skip-like agent when there is no mention', async () => {
        agentRows({ ID: '1', Name: 'Analyst' }, { ID: '2', Name: 'Skip Assistant' });
        const agent = await resolveTargetAgent('just a question');
        expect(agent?.id).toBe('2');
    });

    it('falls back to the first agent when there is no Skip and no mention', async () => {
        agentRows({ ID: '9', Name: 'Analyst' }, { ID: '8', Name: 'Forecaster' });
        const agent = await resolveTargetAgent('plain message');
        expect(agent?.id).toBe('9');
    });
});
