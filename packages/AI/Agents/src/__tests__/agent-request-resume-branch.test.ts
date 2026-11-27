/**
 * Unit tests for the branch an agent-request resume runs on.
 *
 * When a person answers an agent request from the Agent Requests dashboard or the API, the
 * resumed run takes the branch of the message that spawned the originating run, so its user and
 * reply rows land in that fork and the run reads that fork's path. A run with no such message,
 * or one whose message cannot be loaded, resumes on Main.
 *
 * No DB, no network — the provider is a fake and `RunAgentInConversation` is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => logErrorMock(...args),
        LogStatus: () => undefined,
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';
import { MJAIAgentRequestEntityServer } from '../MJAIAgentRequestEntityServer';

const USER = { ID: 'user-1', Email: 'it@example.com' } as unknown as UserInfo;

/** The private resume seam this suite drives, reached through an explicit shape (no `any`). */
interface ResumeSeam {
    resumeAgent(): Promise<void>;
}

/** Fake entities the provider hands out, keyed by entity name. */
interface FakeEntities {
    run: { ID: string; AgentID: string; ConversationID: string | null; ConversationDetailID: string | null };
    detail?: { ID: string; BranchID: string | null } | null;
    detailLoadThrows?: boolean;
}

function makeProvider(entities: FakeEntities): IMetadataProvider {
    const GetEntityObject = vi.fn(async (entityName: string) => {
        if (entityName === 'MJ: AI Agent Runs') {
            return { ...entities.run, Load: vi.fn(async () => true) };
        }
        if (entityName === 'MJ: AI Agents') {
            return { ID: entities.run.AgentID, Name: 'IT: Resumer', Load: vi.fn(async () => true) };
        }
        if (entityName === 'MJ: Conversation Details') {
            const detail = entities.detail ?? null;
            return {
                ID: detail?.ID ?? '',
                BranchID: detail?.BranchID ?? null,
                Load: vi.fn(async () => {
                    if (entities.detailLoadThrows) throw new Error('read failed');
                    return detail !== null;
                }),
            };
        }
        throw new Error(`unexpected entity ${entityName}`);
    });
    return { GetEntityObject } as unknown as IMetadataProvider;
}

/** A request instance with only the fields resumeAgent reads. */
function makeRequest(provider: IMetadataProvider): ResumeSeam {
    const request = Object.create(MJAIAgentRequestEntityServer.prototype) as MJAIAgentRequestEntityServer;
    const fields: Record<string, unknown> = {
        ID: 'request-1',
        ContextCurrentUser: USER,
        ProviderToUse: provider,
        OriginatingAgentRunID: 'run-0',
        OriginatingAgentRunStepID: null,
        Status: 'Responded',
        Response: 'Go ahead',
        ResponseData: null,
        ResponseSchema: null,
    };
    for (const [name, value] of Object.entries(fields)) {
        Object.defineProperty(request, name, { value, writable: true, configurable: true });
    }
    return request as unknown as ResumeSeam;
}

describe('MJAIAgentRequestEntityServer resume — the run takes the originating branch', () => {
    let runInConversation: MockInstance<AgentRunner['RunAgentInConversation']>;

    beforeEach(() => {
        logErrorMock.mockReset();
        runInConversation = vi.spyOn(AgentRunner.prototype, 'RunAgentInConversation').mockResolvedValue(
            { agentResult: { success: true } } as unknown as Awaited<ReturnType<AgentRunner['RunAgentInConversation']>>
        );
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function resumedParams(): ExecuteAgentParams {
        return runInConversation.mock.calls[0][0];
    }

    it('passes the fork of the message that spawned the originating run', async () => {
        const provider = makeProvider({
            run: { ID: 'run-0', AgentID: 'agent-1', ConversationID: 'conv-1', ConversationDetailID: 'reply-0' },
            detail: { ID: 'reply-0', BranchID: 'fork-1' },
        });

        await makeRequest(provider).resumeAgent();

        expect(runInConversation).toHaveBeenCalledTimes(1);
        expect(resumedParams().ConversationBranchID).toBe('fork-1');
        expect(runInConversation.mock.calls[0][1]).toMatchObject({ conversationId: 'conv-1', userMessage: 'Go ahead' });
    });

    it('resumes on Main when the originating message is on Main', async () => {
        const provider = makeProvider({
            run: { ID: 'run-0', AgentID: 'agent-1', ConversationID: 'conv-1', ConversationDetailID: 'reply-0' },
            detail: { ID: 'reply-0', BranchID: null },
        });

        await makeRequest(provider).resumeAgent();

        expect(resumedParams()).not.toHaveProperty('ConversationBranchID');
        expect(logErrorMock).not.toHaveBeenCalled();
    });

    it('resumes on Main when the originating run has no message', async () => {
        const provider = makeProvider({
            run: { ID: 'run-0', AgentID: 'agent-1', ConversationID: 'conv-1', ConversationDetailID: null },
        });

        await makeRequest(provider).resumeAgent();

        expect(resumedParams()).not.toHaveProperty('ConversationBranchID');
        expect(provider.GetEntityObject).not.toHaveBeenCalledWith('MJ: Conversation Details', USER);
    });

    it('names no branch when the originating run has no conversation', async () => {
        const provider = makeProvider({
            run: { ID: 'run-0', AgentID: 'agent-1', ConversationID: null, ConversationDetailID: 'reply-0' },
            detail: { ID: 'reply-0', BranchID: 'fork-1' },
        });

        await makeRequest(provider).resumeAgent();

        expect(resumedParams()).not.toHaveProperty('ConversationBranchID');
        expect(provider.GetEntityObject).not.toHaveBeenCalledWith('MJ: Conversation Details', USER);
    });

    it('resumes on Main and logs when the originating message cannot be loaded', async () => {
        const provider = makeProvider({
            run: { ID: 'run-0', AgentID: 'agent-1', ConversationID: 'conv-1', ConversationDetailID: 'reply-0' },
            detail: null,
        });

        await makeRequest(provider).resumeAgent();

        expect(resumedParams()).not.toHaveProperty('ConversationBranchID');
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('reply-0'));
    });

    it('resumes on Main and logs when reading the originating message throws', async () => {
        const provider = makeProvider({
            run: { ID: 'run-0', AgentID: 'agent-1', ConversationID: 'conv-1', ConversationDetailID: 'reply-0' },
            detail: { ID: 'reply-0', BranchID: 'fork-1' },
            detailLoadThrows: true,
        });

        await makeRequest(provider).resumeAgent();

        expect(resumedParams()).not.toHaveProperty('ConversationBranchID');
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('reply-0'));
    });
});

/**
 * Owner-batch item 3 (D-091, D5-22): the conversation host settles a plan card's answer as the person's own save
 * BEFORE the continuation run, and marks that one save so it does not also start `resumeAgent` (the host runs the
 * continuation itself). Any other answer resumes exactly as before. `BaseEntity.Save` is spied (the database write);
 * the request double carries the fields `Save` reads.
 */
describe('MJAIAgentRequestEntityServer — an answer the conversation host settles does not resume (A2 attack 13a)', () => {
    let baseSave: MockInstance;
    let resume: MockInstance;

    beforeEach(async () => {
        const core = await import('@memberjunction/core');
        baseSave = vi.spyOn(core.BaseEntity.prototype, 'Save').mockResolvedValue(true);
        resume = vi.spyOn(MJAIAgentRequestEntityServer.prototype as unknown as ResumeSeam, 'resumeAgent').mockResolvedValue(undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function answeringRequest(): MJAIAgentRequestEntityServer {
        const request = Object.create(MJAIAgentRequestEntityServer.prototype) as MJAIAgentRequestEntityServer;
        const state: Record<string, unknown> = {
            ID: 'request-1', ContextCurrentUser: USER, Status: 'Approved', OriginatingAgentRunID: 'run-0',
            ResumingAgentRunID: null, OriginatingTaskID: null, HumanTaskProvider: null, AgentID: 'agent-1', ResponseByUserID: null,
        };
        for (const name of Object.keys(state)) {
            Object.defineProperty(request, name, { get: () => state[name], set: (v: unknown) => { state[name] = v; }, configurable: true });
        }
        Object.defineProperty(request, 'IsSaved', { get: () => true, configurable: true });
        Object.defineProperty(request, 'GetFieldByName', {
            value: (n: string) => (n === 'Status' ? { OldValue: 'Requested', Value: state.Status, Dirty: true } : { OldValue: state[n], Value: state[n], Dirty: false }),
            configurable: true,
        });
        return request;
    }

    it('a dashboard/API answer (Requested → Approved) resumes the run, as on next', async () => {
        const request = answeringRequest();
        expect(await request.Save()).toBe(true);
        expect(resume).toHaveBeenCalledTimes(1);
    });

    it('MarkAnsweredByConversationHost(): that save does not start resumeAgent', async () => {
        const request = answeringRequest();
        request.MarkAnsweredByConversationHost();
        expect(await request.Save()).toBe(true);
        expect(baseSave).toHaveBeenCalledTimes(1);
        expect(resume).not.toHaveBeenCalled();
    });

    it('the mark is one-shot: it is cleared by that save, so a later answering save resumes again', async () => {
        const request = answeringRequest();
        request.MarkAnsweredByConversationHost();
        await request.Save();
        await request.Save();
        expect(resume).toHaveBeenCalledTimes(1);
    });

    it('the mark is cleared even when the save fails', async () => {
        baseSave.mockResolvedValueOnce(false);
        const request = answeringRequest();
        request.MarkAnsweredByConversationHost();
        expect(await request.Save()).toBe(false);
        await request.Save();
        expect(resume).toHaveBeenCalledTimes(1);
    });
});
