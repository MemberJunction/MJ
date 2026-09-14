import { describe, it, expect, vi, beforeEach } from 'vitest';

type RunViewResult = { Success: boolean; Results?: unknown[]; ErrorMessage?: string };

const state = vi.hoisted(() => ({
    runView: (): { Success: boolean; Results?: unknown[]; ErrorMessage?: string } => ({ Success: true, Results: [] }),
    lastProcessMessage: null as unknown,
    processMessageResult: { success: true } as unknown,
    saveResult: true,
    savedDetails: [] as Array<Record<string, unknown>>,
}));

// SendMessage now delegates orchestration to ConversationsRuntime. Mocking that boundary keeps
// this suite about the part mobile still owns — framing a turn as two Conversation Detail rows —
// and stops the real runtime (and the whole MJ entity layer behind it) loading under Node.
vi.mock('@memberjunction/conversations-runtime', () => ({
    ConversationsRuntime: {
        Instance: {
            Config: async () => undefined,
            AgentRunner: {
                processMessage: async (input: unknown) => {
                    state.lastProcessMessage = input;
                    return state.processMessageResult;
                },
            },
        },
    },
}));

vi.mock('@memberjunction/core', () => {
    let seq = 0;
    class FakeDetail {
        ID = `detail-${++seq}`;
        ConversationID = '';
        Message = '';
        Role = '';
        Status = '';
        ParentID: string | undefined;
        AgentID: string | undefined;
        UserID: string | undefined;
        HiddenToUser = false;
        LatestResult = { CompleteMessage: 'save blew up' };
        NewRecord(): void {}
        async Save(): Promise<boolean> {
            if (!state.saveResult) return false;
            state.savedDetails.push({
                ID: this.ID, Role: this.Role, Status: this.Status, Message: this.Message,
                ParentID: this.ParentID, AgentID: this.AgentID, UserID: this.UserID,
                ConversationID: this.ConversationID,
            });
            return true;
        }
    }
    class Metadata {
        CurrentUser = { ID: 'user-1' };
        async GetEntityObject(): Promise<FakeDetail> {
            return new FakeDetail();
        }
    }
    class RunView {
        async RunView(): Promise<RunViewResult> {
            return state.runView();
        }
    }
    return { Metadata, RunView };
});

import { LoadAgents, ResolveTargetAgent, SendMessage } from '@/data/services/agents';

function agentRows(...rows: Array<{ ID: string; Name: string; Description?: string | null }>): void {
    state.runView = () => ({ Success: true, Results: rows });
}

beforeEach(() => {
    state.runView = () => ({ Success: true, Results: [] });
});

describe('LoadAgents', () => {
    it('maps result rows into AgentOption shape', async () => {
        agentRows(
            { ID: '1', Name: 'Skip', Description: 'default' },
            { ID: '2', Name: 'Research Agent', Description: null },
        );
        const agents = await LoadAgents();
        expect(agents).toEqual([
            { id: '1', name: 'Skip', description: 'default' },
            { id: '2', name: 'Research Agent', description: null },
        ]);
    });

    it('substitutes a placeholder name for unnamed agents', async () => {
        agentRows({ ID: '1', Name: null as unknown as string });
        const agents = await LoadAgents();
        expect(agents[0].name).toBe('(unnamed agent)');
    });

    it('throws when the RunView fails', async () => {
        state.runView = () => ({ Success: false, ErrorMessage: 'db down' });
        await expect(LoadAgents()).rejects.toThrow(/db down/);
    });
});

describe('ResolveTargetAgent', () => {
    it('returns null when no agents exist', async () => {
        agentRows();
        expect(await ResolveTargetAgent('hello')).toBeNull();
    });

    it('resolves an @mention against the agent roster (ignoring spaces/case)', async () => {
        agentRows({ ID: '1', Name: 'Sage' }, { ID: '2', Name: 'Research Agent' });
        const agent = await ResolveTargetAgent('@research please look into this');
        expect(agent?.id).toBe('2');
    });

    it('lets an @mention outrank the caller’s preferred agent', async () => {
        // Naming someone is the most specific signal a user can give; a stored default must not
        // override what they just typed.
        agentRows({ ID: '1', Name: 'Sage' }, { ID: '2', Name: 'Research Agent' });
        const agent = await ResolveTargetAgent('@research look into this', '1');
        expect(agent?.id).toBe('2');
    });

    it('uses the preferred agent when there is no mention', async () => {
        // The bug this covers: voice mode passed nothing here, so the user's chosen default was
        // ignored and resolution fell through to an alphabetical accident — "Actionsmith" on a
        // stock deployment.
        agentRows({ ID: '1', Name: 'Actionsmith' }, { ID: '2', Name: 'Sage' }, { ID: '3', Name: 'Analyst' });
        const agent = await ResolveTargetAgent('', '3');
        expect(agent?.id).toBe('3');
    });

    it('matches the preferred agent id case-insensitively — UUID casing differs by platform', async () => {
        agentRows({ ID: 'AAAA-BBBB', Name: 'Analyst' }, { ID: '2', Name: 'Sage' });
        expect((await ResolveTargetAgent('', 'aaaa-bbbb'))?.id).toBe('AAAA-BBBB');
    });

    it('falls through to Sage when the preferred agent no longer exists', async () => {
        // A stale preference — an agent since deleted, or access revoked — must not fail the turn.
        agentRows({ ID: '1', Name: 'Actionsmith' }, { ID: '2', Name: 'Sage' });
        const agent = await ResolveTargetAgent('', 'deleted-agent');
        expect(agent?.name).toBe('Sage');
    });

    it('prefers Sage when there is no mention and no preference', async () => {
        // MJ's own code-const fallback, so a mobile turn lands on the same agent a web turn would.
        agentRows({ ID: '1', Name: 'Actionsmith' }, { ID: '2', Name: 'Sage' });
        const agent = await ResolveTargetAgent('just a question');
        expect(agent?.id).toBe('2');
    });

    it('falls back to Sage when an @mention matches nothing', async () => {
        agentRows({ ID: '1', Name: 'Actionsmith' }, { ID: '2', Name: 'Sage' });
        const agent = await ResolveTargetAgent('@nobody are you there');
        expect(agent?.name).toBe('Sage');
    });

    it('falls back to the first agent when the deployment has no Sage', async () => {
        agentRows({ ID: '9', Name: 'Analyst' }, { ID: '8', Name: 'Forecaster' });
        const agent = await ResolveTargetAgent('plain message');
        expect(agent?.id).toBe('9');
    });
});

describe('SendMessage', () => {
    beforeEach(() => {
        state.savedDetails = [];
        state.lastProcessMessage = null;
        state.processMessageResult = { success: true };
        state.saveResult = true;
    });

    it('frames a turn as a user row plus an in-progress AI row', async () => {
        const result = await SendMessage({ conversationId: 'conv-1', text: 'hello' });
        expect(result.success).toBe(true);

        const [user, ai] = state.savedDetails;
        expect(user).toMatchObject({ Role: 'User', Status: 'Complete', Message: 'hello', UserID: 'user-1' });
        expect(ai).toMatchObject({ Role: 'AI', Status: 'In-Progress', Message: '', ParentID: user.ID });
    });

    it('hands the AI row — not the user row — to the runtime', async () => {
        // The server writes the answer INTO the detail it is given. Passing the user row lands
        // the reply on it as Role='User' and renders it as plain text in a user bubble.
        await SendMessage({ conversationId: 'conv-1', text: 'hi' });
        const input = state.lastProcessMessage as { conversationDetailId: string; message: { ID: string } };
        const [user, ai] = state.savedDetails;
        expect(input.conversationDetailId).toBe(ai.ID);
        expect(input.message.ID).toBe(user.ID);
    });

    it('passes an explicit agent through, and leaves resolution to the runtime otherwise', async () => {
        await SendMessage({ conversationId: 'c', text: 'x', agentId: 'agent-7' });
        expect((state.lastProcessMessage as { explicitAgentId: string }).explicitAgentId).toBe('agent-7');
        expect(state.savedDetails[1]).toMatchObject({ AgentID: 'agent-7' });

        state.savedDetails = [];
        await SendMessage({ conversationId: 'c', text: 'x' });
        expect((state.lastProcessMessage as { explicitAgentId: string | null }).explicitAgentId).toBeNull();
    });

    it('reports both detail ids so a caller can attach files and track the reply', async () => {
        const result = await SendMessage({ conversationId: 'c', text: 'x' });
        const [user, ai] = state.savedDetails;
        expect(result.userMessageId).toBe(user.ID);
        expect(result.aiMessageId).toBe(ai.ID);
    });

    it('fails cleanly when the user message cannot be saved', async () => {
        state.saveResult = false;
        const result = await SendMessage({ conversationId: 'c', text: 'x' });
        expect(result.success).toBe(false);
        expect(state.lastProcessMessage).toBeNull();
    });

    it('reports a null result — no agent could be resolved — as a failure', async () => {
        state.processMessageResult = null;
        const result = await SendMessage({ conversationId: 'c', text: 'x' });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('No agent');
    });

    it('reports a FAILED run as a failure, and carries its message', async () => {
        // `processMessage` never throws. It returns null only when no agent resolved; a quota
        // rejection, an agent that threw, or a transport failure all come back as a well-formed
        // result with success:false. Testing only for null reported those as successes, leaving a
        // permanently spinning bubble and no error anywhere in the UI.
        state.processMessageResult = { success: false, errorMessage: 'Agent quota exceeded' };
        const result = await SendMessage({ conversationId: 'c', text: 'x' });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('Agent quota exceeded');
    });

    it('falls back to a readable message when a failed run carries none', async () => {
        state.processMessageResult = { success: false };
        const result = await SendMessage({ conversationId: 'c', text: 'x' });
        expect(result).toMatchObject({ success: false, errorMessage: 'The agent run failed.' });
    });

    it('runs onUserMessageSaved BEFORE the agent, with the saved user row', async () => {
        // Ordering is the whole assertion. An attachment uploaded after the run produces an agent
        // that answers "I don't see an attachment" while the file appears a second later.
        const calls: string[] = [];
        let seenId: string | null = null;
        state.processMessageResult = { success: true };
        await SendMessage({
            conversationId: 'c',
            text: 'x',
            onUserMessageSaved: async (id) => {
                calls.push('attach');
                seenId = id;
            },
        });
        calls.push('run');
        expect(calls).toEqual(['attach', 'run']);
        expect(seenId).toBe(state.savedDetails[0].ID);
        expect(state.lastProcessMessage).not.toBeNull();
    });

    it('fails the send when onUserMessageSaved throws, without running the agent', async () => {
        const result = await SendMessage({
            conversationId: 'c',
            text: 'x',
            onUserMessageSaved: async () => {
                throw new Error('upload refused');
            },
        });
        expect(result).toMatchObject({ success: false, errorMessage: 'upload refused' });
        expect(state.lastProcessMessage).toBeNull();
    });
});
