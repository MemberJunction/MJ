/**
 * Unit test for a race between AgentRunner's progress saves and its final status update.
 *
 * BaseEntity raises its 'save' event, which EnsureSaveComplete() waits for, before the save has
 * finished committing, and Save() hands a concurrent caller the in-flight save's promise. A
 * progress save still committing when the run ended therefore swallowed the final update: the
 * agent-response detail stayed 'In-Progress' with the last progress message. The fake detail below
 * reproduces exactly that ordering.
 *
 * No DB, no network — the provider is a fake and RunAgent is stubbed on the instance.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

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
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** What reached the "database" for a detail, and the in-memory record the runner edits. */
interface RacyDetail {
    ID: string;
    Status?: string;
    Message?: string;
    LatestResult: null;
    Persisted: { Status?: string; Message?: string };
    Save: () => Promise<boolean>;
    Load: () => Promise<boolean>;
    EnsureSaveComplete: () => Promise<void>;
    [key: string]: unknown;
}

/**
 * A conversation detail whose Save() behaves like BaseEntity's: it is registered as in flight at
 * once, writes the values it was called with, raises 'save' (releasing EnsureSaveComplete) and only
 * then finishes committing; a Save() made meanwhile gets the in-flight promise and writes nothing.
 */
function makeRacyDetail(id: string): RacyDetail {
    let inFlight: Promise<boolean> | null = null;
    let saveEventWaiters: Array<() => void> = [];
    const detail: RacyDetail = {
        ID: id,
        LatestResult: null,
        Persisted: {},
        Save: () => {
            if (inFlight) return inFlight;
            const written = { Status: detail.Status, Message: detail.Message };
            inFlight = (async () => {
                await delay(1);
                detail.Persisted = written;
                const waiters = saveEventWaiters;
                saveEventWaiters = [];
                waiters.forEach(release => release());
                await delay(20); // still committing after the 'save' event
                inFlight = null;
                return true;
            })();
            return inFlight;
        },
        Load: async () => true,
        EnsureSaveComplete: () => inFlight ? new Promise<void>(resolve => { saveEventWaiters.push(resolve); }) : Promise.resolve(),
    };
    return detail;
}

function makeProvider(details: RacyDetail[]): IMetadataProvider {
    const queue = [...details];
    return { GetEntityObject: vi.fn(async () => queue.shift()) } as unknown as IMetadataProvider;
}

interface RunAgentStub {
    RunAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;
    generateConversationName(userMessage: string, contextUser: UserInfo): Promise<{ name: string; description: string } | null>;
    gatherConversationArtifacts(conversationId: string, contextUser: UserInfo): Promise<unknown[]>;
}

describe('AgentRunner.RunAgentInConversation — a progress save still committing does not swallow the final status', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('persists Complete and the final message when the run ends during a progress save', async () => {
        const agentDetail = makeRacyDetail('agent-detail');
        const runner = new AgentRunner(makeProvider([makeRacyDetail('user-detail'), agentDetail]));
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockImplementation(async (params: ExecuteAgentParams) => {
            // A last progress update, not awaited by the agent, right before the run returns.
            void params.onProgress?.({ step: 'prompt_execution', percentage: 90, message: 'almost done' } as never);
            return { success: true, agentRun: { Message: 'All done' } } as unknown as ExecuteAgentResult;
        });

        await runner.RunAgentInConversation({
            agent: { ID: 'agent-1', Name: 'IT: Progress Race' },
            conversationMessages: [],
            contextUser: USER,
        } as unknown as ExecuteAgentParams, { conversationId: 'conv-1', userMessage: 'hi' });
        await delay(50);

        expect(agentDetail.Persisted).toEqual({ Status: 'Complete', Message: 'All done' });
    });

    it('runs generateConversationName in parallel with RunAgent and skips artifact queries on a brand-new conversation', async () => {
        const events: string[] = [];
        const convEntity = makeRacyDetail('conv-new');
        const userDetail = makeRacyDetail('user-detail');
        const agentDetail = makeRacyDetail('agent-detail');
        const loadSpy = vi.spyOn(agentDetail, 'Load');

        const runner = new AgentRunner(makeProvider([convEntity, userDetail, agentDetail]));
        const gatherSpy = vi.spyOn(runner as unknown as RunAgentStub, 'gatherConversationArtifacts');

        vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockImplementation(async () => {
            events.push('rename:start');
            await delay(80);
            events.push('rename:done');
            return { name: 'Smart Title', description: 'Smart Description' };
        });

        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockImplementation(async (params: ExecuteAgentParams) => {
            events.push('runAgent:start');
            expect(params.inputArtifacts).toEqual([]);
            await delay(10);
            events.push('runAgent:done');
            return { success: true, agentRun: { Message: 'Reply' } } as unknown as ExecuteAgentResult;
        });

        await runner.RunAgentInConversation({
            agent: { ID: 'agent-1', Name: 'Betty' },
            conversationMessages: [],
            contextUser: USER,
        } as unknown as ExecuteAgentParams, { userMessage: 'What are the membership tiers?' });

        // RunAgent starts before generateConversationName finishes (parallel execution)
        expect(events.indexOf('runAgent:start')).toBeLessThan(events.indexOf('rename:done'));
        // Brand-new conversation skips gatherConversationArtifacts DB queries
        expect(gatherSpy).not.toHaveBeenCalled();
        // Conversation name & description are persisted before RunAgentInConversation returns
        expect(convEntity.Name).toBe('Smart Title');
        expect(convEntity.Description).toBe('Smart Description');
        // Newly created agentResponseDetail is not redundantly reloaded before final Save
        expect(loadSpy).not.toHaveBeenCalled();
    });
});

