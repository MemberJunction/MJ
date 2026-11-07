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
    MarkServerAuthoredReply: () => void;
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
        MarkServerAuthoredReply: () => undefined,
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

/** Records the Name each Save() of this entity wrote. */
function recordSavedNames(entity: RacyDetail): unknown[] {
    const names: unknown[] = [];
    const save = entity.Save;
    entity.Save = () => { names.push(entity.Name); return save(); };
    return names;
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
        const savedNames = recordSavedNames(convEntity);
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
        // Conversation name & description are saved before RunAgentInConversation returns
        expect(savedNames).toEqual(['Chat with Betty', 'Smart Title']);
        expect(convEntity.Description).toBe('Smart Description');
        // Newly created agentResponseDetail is not redundantly reloaded before final Save
        expect(loadSpy).not.toHaveBeenCalled();
    });

    it('still saves the generated conversation name when the run throws', async () => {
        const convEntity = makeRacyDetail('conv-new');
        const savedNames = recordSavedNames(convEntity);
        const runner = new AgentRunner(makeProvider([convEntity, makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
        vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockResolvedValue({ name: 'Smart Title', description: '' });
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockRejectedValue(new Error('model down'));

        await expect(runner.RunAgentInConversation({
            agent: { ID: 'agent-1', Name: 'Betty' },
            conversationMessages: [],
            contextUser: USER,
        } as unknown as ExecuteAgentParams, { userMessage: 'What are the membership tiers?' })).rejects.toThrow('model down');

        expect(savedNames.at(-1)).toBe('Smart Title');
    });

    const runInConversation = (runner: AgentRunner, options: Record<string, unknown>) => runner.RunAgentInConversation({
        agent: { ID: 'agent-1', Name: 'Betty' },
        conversationMessages: [],
        contextUser: USER,
    } as unknown as ExecuteAgentParams, { userMessage: 'What are the membership tiers?', ...options });
    const reply = { success: true, agentRun: { Message: 'Reply' } } as unknown as ExecuteAgentResult;

    it('does not generate a name when the caller supplied one', async () => {
        const convEntity = makeRacyDetail('conv-new');
        const savedNames = recordSavedNames(convEntity);
        const runner = new AgentRunner(makeProvider([convEntity, makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
        const nameSpy = vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName');
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);

        await runInConversation(runner, { conversationName: 'Caller Title' });

        expect(nameSpy).not.toHaveBeenCalled();
        expect(savedNames).toEqual(['Caller Title']);
    });

    it('keeps the initial name, and does not throw, when no name comes back', async () => {
        const convEntity = makeRacyDetail('conv-new');
        const savedNames = recordSavedNames(convEntity);
        const runner = new AgentRunner(makeProvider([convEntity, makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
        vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockResolvedValue(null);
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);

        await expect(runInConversation(runner, {})).resolves.toBeDefined();
        expect(savedNames).toEqual(['Chat with Betty']);
    });

    it('returns the run result when naming never finishes, after the naming cap', async () => {
        const cap = Reflect.get(AgentRunner, 'NAMING_WAIT_MS');
        Reflect.set(AgentRunner, 'NAMING_WAIT_MS', 20);
        try {
            const convEntity = makeRacyDetail('conv-new');
            const savedNames = recordSavedNames(convEntity);
            const runner = new AgentRunner(makeProvider([convEntity, makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
            vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockReturnValue(new Promise<null>(() => undefined));
            vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);

            await expect(runInConversation(runner, {})).resolves.toBeDefined();
            expect(savedNames).toEqual(['Chat with Betty']);
        } finally {
            Reflect.set(AgentRunner, 'NAMING_WAIT_MS', cap);
        }
    }, 2000);

    it('keeps a rename made during the run, and an archive made during the run', async () => {
        const renamed = makeRacyDetail('conv-new');
        const renamedSaves = recordSavedNames(renamed);
        renamed.Load = async () => { renamed.Name = 'My Custom Title'; renamed.Status = 'Archived'; return true; };
        let runner = new AgentRunner(makeProvider([renamed, makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
        vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockResolvedValue({ name: 'Smart Title', description: '' });
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);
        await runInConversation(runner, {});
        expect(renamedSaves).toEqual(['Chat with Betty']);
        expect([renamed.Name, renamed.Status]).toEqual(['My Custom Title', 'Archived']);

        const archived = makeRacyDetail('conv-new');
        const archivedStatusAtSave: unknown[] = [];
        const save = archived.Save;
        archived.Save = () => { archivedStatusAtSave.push(`${archived.Name}/${archived.Status}`); return save(); };
        archived.Load = async () => { archived.Status = 'Archived'; return true; };
        runner = new AgentRunner(makeProvider([archived, makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
        vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockResolvedValue({ name: 'Smart Title', description: '' });
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);
        await runInConversation(runner, {});
        expect(archivedStatusAtSave.at(-1)).toBe('Smart Title/Archived');
    });

    it('a reload that throws while saving the name does not replace a successful run\'s result', async () => {
        const convEntity = makeRacyDetail('conv-new');
        const savedNames = recordSavedNames(convEntity);
        convEntity.Load = async () => { throw new Error('connection reset'); };
        const runner = new AgentRunner(makeProvider([convEntity, makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
        vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockResolvedValue({ name: 'Smart Title', description: '' });
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);

        const result = await runInConversation(runner, {});

        expect(result.agentResult).toBe(reply);
        expect(savedNames).toEqual(['Chat with Betty']);
    });

    it('saves the generated name after the run\'s own writes', async () => {
        const events: string[] = [];
        const convEntity = makeRacyDetail('conv-new');
        const agentDetail = makeRacyDetail('agent-detail');
        const convSave = convEntity.Save;
        convEntity.Save = () => { events.push(`conv:${convEntity.Name}`); return convSave(); };
        const agentSave = agentDetail.Save;
        agentDetail.Save = () => { events.push(`reply:${agentDetail.Status}`); return agentSave(); };
        const runner = new AgentRunner(makeProvider([convEntity, makeRacyDetail('user-detail'), agentDetail]));
        vi.spyOn(runner as unknown as RunAgentStub, 'generateConversationName').mockResolvedValue({ name: 'Smart Title', description: '' });
        vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);

        await runInConversation(runner, {});

        expect(events.indexOf('conv:Smart Title')).toBeGreaterThan(events.lastIndexOf('reply:Complete'));
        expect(events.lastIndexOf('reply:Complete')).toBeGreaterThan(-1);
    });

    it('still gathers artifacts for an existing conversation', async () => {
        const artifacts = [{ artifactId: 'art-1' }];
        const runner = new AgentRunner(makeProvider([makeRacyDetail('user-detail'), makeRacyDetail('agent-detail')]));
        vi.spyOn(runner as unknown as RunAgentStub, 'gatherConversationArtifacts').mockResolvedValue(artifacts);
        const runSpy = vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue(reply);

        await runInConversation(runner, { conversationId: 'conv-1' });

        expect(runSpy.mock.calls[0][0].inputArtifacts).toEqual(artifacts);
    });
});
