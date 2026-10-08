/**
 * Unit tests for the branch a RunAgentInConversation run reads.
 *
 * A caller that does not name `ConversationBranchID` (anything but the RunAIAgent resolver) still
 * runs on the branch its reply row is on: the run's artifacts are gathered from that branch's
 * path, and the params handed to RunAgent carry the branch so history tools, compaction and
 * carry-forward read the same path. A reply row on the trunk leaves the key absent.
 * The user and reply rows the runner creates itself carry the branch the caller named, else Main.
 *
 * No DB, no network — the provider is a fake and RunAgent and the artifact gather are stubbed on
 * the instance, matching `agent-runner-conversation-artifacts.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult, InputArtifact } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView() {
                return { Success: true, Results: [] };
            }
        },
        RunQuery: class {
            async RunQuery() {
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';

const USER = { ID: 'user-1', Email: 'it@example.com' } as unknown as UserInfo;

/** The instance seams this suite stubs, reached through an explicit shape (no `any`). */
interface RunnerSeams {
    RunAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;
    gatherConversationArtifacts(conversationId: string, contextUser: UserInfo, historyFrom?: Date, branchId?: string | null): Promise<InputArtifact[]>;
}

/** A fake conversation-detail entity. */
interface FakeDetail {
    ID: string;
    ConversationID: string;
    BranchID: string | null;
    Status?: string;
    Save: ReturnType<typeof vi.fn>;
    Load: ReturnType<typeof vi.fn>;
    EnsureSaveComplete: ReturnType<typeof vi.fn>;
    [key: string]: unknown;
}

function makeDetail(id: string, branchId: string | null): FakeDetail {
    return {
        ID: id,
        ConversationID: 'conv-1',
        BranchID: branchId,
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        EnsureSaveComplete: vi.fn(async () => undefined),
    };
}

/** Provider handing out the given details in creation order. */
function makeProvider(details: FakeDetail[]): IMetadataProvider {
    const queue = [...details];
    return { GetEntityObject: vi.fn(async () => queue.shift()) } as unknown as IMetadataProvider;
}

function makeParams(over: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: { ID: 'agent-1', Name: 'IT: Branch Reader' },
        conversationMessages: [],
        contextUser: USER,
        ...over,
    } as unknown as ExecuteAgentParams;
}

interface Stubbed {
    runner: AgentRunner;
    gather: MockInstance<RunnerSeams['gatherConversationArtifacts']>;
    runAgent: MockInstance<RunnerSeams['RunAgent']>;
}

function stub(provider: IMetadataProvider): Stubbed {
    const runner = new AgentRunner(provider);
    const seams = runner as unknown as RunnerSeams;
    const gather = vi.spyOn(seams, 'gatherConversationArtifacts').mockResolvedValue([]);
    const runAgent = vi.spyOn(seams, 'RunAgent').mockResolvedValue({
        success: false,
        agentRun: { ID: 'run-1', Message: 'done' },
    } as unknown as ExecuteAgentResult);
    return { runner, gather, runAgent };
}

function runParams(s: Stubbed): ExecuteAgentParams {
    return s.runAgent.mock.calls[0][0];
}

describe('AgentRunner.RunAgentInConversation — the run reads its branch', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the branch of a caller-created reply row when the caller names none', async () => {
        const s = stub(makeProvider([makeDetail('reply-1', 'b1')]));

        await s.runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', conversationDetailId: 'reply-1' });

        expect(s.gather).toHaveBeenCalledWith('conv-1', USER, undefined, 'b1');
        expect(runParams(s).ConversationBranchID).toBe('b1');
    });

    it('reads the branch of a reply row loaded without a pre-resolved conversation', async () => {
        const s = stub(makeProvider([makeDetail('reply-1', 'b1'), makeDetail('reply-1', 'b1')]));

        await s.runner.RunAgentInConversation(makeParams(), { conversationDetailId: 'reply-1' });

        expect(s.gather).toHaveBeenCalledWith('conv-1', USER, undefined, 'b1');
        expect(runParams(s).ConversationBranchID).toBe('b1');
    });

    it('writes the caller-named branch on the user and reply rows it creates, and reads that branch', async () => {
        const userRow = makeDetail('user-1', null);
        const replyRow = makeDetail('reply-1', null);
        const s = stub(makeProvider([userRow, replyRow]));

        await s.runner.RunAgentInConversation(makeParams({ ConversationBranchID: 'b1' }), { conversationId: 'conv-1', userMessage: 'hi' });

        expect(userRow.BranchID).toBe('b1');
        expect(replyRow.BranchID).toBe('b1');
        expect(s.gather).toHaveBeenCalledWith('conv-1', USER, undefined, 'b1');
        expect(runParams(s).ConversationBranchID).toBe('b1');
    });

    it('writes Main on the rows it creates when the caller names no branch', async () => {
        const userRow = makeDetail('user-1', 'stale');
        const replyRow = makeDetail('reply-1', 'stale');
        const s = stub(makeProvider([userRow, replyRow]));

        await s.runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', userMessage: 'hi' });

        expect(userRow.BranchID).toBeNull();
        expect(replyRow.BranchID).toBeNull();
        expect(s.gather).toHaveBeenCalledWith('conv-1', USER, undefined, undefined);
        expect(runParams(s)).not.toHaveProperty('ConversationBranchID');
    });

    it('leaves ConversationBranchID absent for a reply row on the trunk', async () => {
        const s = stub(makeProvider([makeDetail('reply-1', null)]));

        await s.runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', conversationDetailId: 'reply-1' });

        expect(s.gather).toHaveBeenCalledWith('conv-1', USER, undefined, undefined);
        expect(runParams(s)).not.toHaveProperty('ConversationBranchID');
    });

    it('keeps the branch the caller named over the reply row\'s branch', async () => {
        const s = stub(makeProvider([makeDetail('reply-1', 'b1')]));

        await s.runner.RunAgentInConversation(makeParams({ ConversationBranchID: 'b2' }), { conversationId: 'conv-1', conversationDetailId: 'reply-1' });

        expect(s.gather).toHaveBeenCalledWith('conv-1', USER, undefined, 'b2');
        expect(runParams(s).ConversationBranchID).toBe('b2');
    });
});
