/**
 * Unit tests for how AgentRunner.RunAgentInConversation reports a REFUSED conversation-detail save.
 *
 * WHY THIS EXISTS (MJ#4791 follow-up): `MJConversationDetailEntityExtended`'s owner gate refuses a
 * write by a non-owner (for example the elevated System user writing a widget guest's agent
 * response) and records WHY only on `LatestResult`. It logs nothing itself. AgentRunner reported
 * every such refusal with a fixed string, so the gate's reason never reached a log line or the
 * thrown error. The invariant pinned here: each save-failure path carries
 * `LatestResult.CompleteMessage`.
 *
 * No DB, no network — the provider is a fake and RunAgent is stubbed on the instance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult, MediaOutput } from '@memberjunction/ai-core-plus';

const loggedErrors: string[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (message: unknown) => {
            loggedErrors.push(String(message));
        },
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

const REFUSAL = 'You do not have access to this conversation.';
const USER = { ID: 'user-1', Email: 'it@example.com' } as unknown as UserInfo;

/** A fake conversation-detail entity whose Save() results are scripted per call. */
interface FakeDetail {
    ID: string;
    ConversationID?: string;
    Status?: string;
    Message?: string;
    Error?: string;
    LatestResult: { CompleteMessage: string } | null;
    Save: ReturnType<typeof vi.fn>;
    Load: ReturnType<typeof vi.fn>;
    EnsureSaveComplete: ReturnType<typeof vi.fn>;
    [key: string]: unknown;
}

function makeDetail(id: string, saveResults: boolean[]): FakeDetail {
    const results = [...saveResults];
    const detail: FakeDetail = {
        ID: id,
        LatestResult: null,
        Save: vi.fn(async () => {
            const ok = results.length > 0 ? (results.shift() as boolean) : true;
            detail.LatestResult = ok ? null : { CompleteMessage: REFUSAL };
            return ok;
        }),
        Load: vi.fn(async () => true),
        EnsureSaveComplete: vi.fn(async () => undefined),
        MarkServerAuthoredReply: vi.fn(),
    };
    return detail;
}

/** Provider handing out the scripted details in creation order (user message, then agent response). */
function makeProvider(details: FakeDetail[]): IMetadataProvider {
    const queue = [...details];
    return {
        GetEntityObject: vi.fn(async () => queue.shift()),
    } as unknown as IMetadataProvider;
}

function makeParams(): ExecuteAgentParams {
    return {
        agent: { ID: 'agent-1', Name: 'IT: Save Failure' },
        conversationMessages: [],
        contextUser: USER,
    } as unknown as ExecuteAgentParams;
}

interface RunAgentStub {
    RunAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;
}

describe('AgentRunner.RunAgentInConversation — refused conversation-detail saves carry the reason', () => {
    beforeEach(() => {
        loggedErrors.length = 0;
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('the user-message detail refusal throws with the gate reason', async () => {
        const runner = new AgentRunner(makeProvider([makeDetail('user-detail', [false])]));
        await expect(
            runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', userMessage: 'hi' }),
        ).rejects.toThrow(REFUSAL);
    });

    it('the agent-response detail refusal throws with the gate reason', async () => {
        const runner = new AgentRunner(makeProvider([makeDetail('user-detail', [true]), makeDetail('agent-detail', [false])]));
        await expect(
            runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', userMessage: 'hi' }),
        ).rejects.toThrow(REFUSAL);
    });

    it('a refused progress update and a refused error-status persist both log the gate reason', async () => {
        // Agent-response detail: create OK, then the progress save and the error-persist save are refused.
        const agentDetail = makeDetail('agent-detail', [true, false, false]);
        const runner = new AgentRunner(makeProvider([makeDetail('user-detail', [true]), agentDetail]));
        const stub = runner as unknown as RunAgentStub;
        vi.spyOn(stub, 'RunAgent').mockImplementation(async (params: ExecuteAgentParams) => {
            await params.onProgress?.({ step: 'prompt_execution', percentage: 10, message: 'working' } as never);
            throw new Error('agent crashed');
        });

        await expect(
            runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', userMessage: 'hi' }),
        ).rejects.toThrow('agent crashed');

        const progressLine = loggedErrors.find((line) => line.includes('progress update'));
        expect(progressLine).toBeDefined();
        expect(progressLine).toContain(REFUSAL);
        const persistLine = loggedErrors.find((line) => line.includes('persist Error'));
        expect(persistLine).toBeDefined();
        expect(persistLine).toContain(REFUSAL);
    });

    it('a refused final-status save logs the gate reason and fails the run, so the caller does not wait for a reply that never lands', async () => {
        // Agent-response detail: create OK, then the final-status save (step 5) is refused.
        const agentDetail = makeDetail('agent-detail', [true, false]);
        const runner = new AgentRunner(makeProvider([makeDetail('user-detail', [true]), agentDetail]));
        const stub = runner as unknown as RunAgentStub;
        vi.spyOn(stub, 'RunAgent').mockResolvedValue({
            success: true,
            payload: undefined,
            agentRun: { ID: 'run-1', Status: 'Completed', FinalStep: 'Success' },
        } as unknown as ExecuteAgentResult);

        await expect(
            runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', userMessage: 'hi' }),
        ).rejects.toThrow(REFUSAL);

        const finalLine = loggedErrors.find((line) => line.includes('final status'));
        expect(finalLine).toBeDefined();
        expect(finalLine).toContain(REFUSAL);
    });

    describe('a refused final-status save still keeps the run\'s artifacts and media', () => {
        // WHY: step 5 (the reply save) runs before steps 6, 6b and 7. AgentRunner is the only writer of
        // AIAgentRunMedia and nothing retries, so if a refused reply save skipped those steps the run's
        // artifacts would be unlinked and its media bytes lost for good. The run must still fail with the
        // reply-save reason, after the later steps ran.
        const MEDIA: MediaOutput = { modality: 'Image', mimeType: 'image/png', data: 'bm90LWluLXRoZS1wYXlsb2Fk' };

        function stubSuccessfulRunWithOutputs(runner: AgentRunner): void {
            vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue({
                success: true,
                payload: { report: 'done' },
                fileOutputs: [{ fileName: 'report.pdf' }],
                mediaOutputs: [MEDIA],
                agentRun: { ID: 'run-1', Status: 'Completed', FinalStep: 'Success' },
            } as unknown as ExecuteAgentResult);
        }

        function spyPostRunSteps(runner: AgentRunner) {
            return {
                processArtifacts: vi.spyOn(runner, 'ProcessAgentArtifacts').mockResolvedValue(undefined),
                processFileArtifacts: vi.spyOn(runner, 'ProcessFileArtifacts').mockResolvedValue([]),
                saveMedia: vi.spyOn(runner, 'SaveAgentRunMedia').mockResolvedValue(['media-1']),
                createMediaArtifacts: vi.spyOn(runner, 'CreateMediaArtifacts').mockResolvedValue(undefined),
            };
        }

        it('runs every artifact and media step, then rejects with the reply-save reason', async () => {
            const runner = new AgentRunner(makeProvider([makeDetail('user-detail', [true]), makeDetail('agent-detail', [true, false])]));
            stubSuccessfulRunWithOutputs(runner);
            const steps = spyPostRunSteps(runner);

            await expect(
                runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', userMessage: 'hi' }),
            ).rejects.toThrow(`The agent's reply could not be saved: ${REFUSAL}`);

            expect(steps.processArtifacts).toHaveBeenCalledTimes(1);
            expect(steps.processFileArtifacts).toHaveBeenCalledTimes(1);
            expect(steps.saveMedia).toHaveBeenCalledTimes(1);
            expect(steps.createMediaArtifacts).toHaveBeenCalledTimes(1);
        });

        it('still saves the media when the payload artifact step also rejects, and the thrown error stays the reply-save one', async () => {
            const runner = new AgentRunner(makeProvider([makeDetail('user-detail', [true]), makeDetail('agent-detail', [true, false])]));
            stubSuccessfulRunWithOutputs(runner);
            const steps = spyPostRunSteps(runner);
            steps.processArtifacts.mockRejectedValue(new Error('artifact link failed'));

            await expect(
                runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', userMessage: 'hi' }),
            ).rejects.toThrow(`The agent's reply could not be saved: ${REFUSAL}`);

            expect(steps.processFileArtifacts).toHaveBeenCalledTimes(1);
            expect(steps.saveMedia).toHaveBeenCalledTimes(1);
            expect(steps.createMediaArtifacts).toHaveBeenCalledTimes(1);
            // The swallowed-for-now step failure is logged with what failed, not dropped.
            expect(loggedErrors.some((line) => line.includes('artifact link failed'))).toBe(true);
        });

        it('links nothing to a caller-supplied detail it could not write, and keeps only the media audit rows', async () => {
            // WHY: a caller-supplied detail ID (legacy RunAIAgent(conversationDetailId=...)) was not created for this run,
            // and the gate refused writing the reply into it. Linking artifacts to that row would still write into a
            // conversation the gate kept this run out of, as the run user (the system user for a widget guest). The
            // media bytes are recorded on the run itself (AIAgentRunMedia), so those are still kept.
            const runner = new AgentRunner(makeProvider([makeDetail('caller-detail', [false])]));
            stubSuccessfulRunWithOutputs(runner);
            const steps = spyPostRunSteps(runner);

            await expect(
                runner.RunAgentInConversation(makeParams(), { conversationId: 'conv-1', conversationDetailId: 'caller-detail' }),
            ).rejects.toThrow(`The agent's reply could not be saved: ${REFUSAL}`);

            expect(steps.saveMedia).toHaveBeenCalledTimes(1);
            expect(steps.processArtifacts).not.toHaveBeenCalled();
            expect(steps.processFileArtifacts).not.toHaveBeenCalled();
            expect(steps.createMediaArtifacts).not.toHaveBeenCalled();
        });
    });
});
