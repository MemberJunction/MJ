/**
 * BaseAgent's client tools step at its seams: the browser's answer comes from
 * ClientToolRequestManager.RequestClientTool (replaced here), and the step's conversation message and
 * step record are what the run keeps. The step runs as Execute runs it, through a HarnessAgent whose
 * step-record methods record their input instead of writing rows.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ChatMessageContentBlock } from '@memberjunction/ai';
import type {
    AgentChatMessage,
    AgentConfiguration,
    BaseAgentNextStep,
    ClientToolResponse,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import { BaseAgent } from '../base-agent';
import { ClientToolRequestManager } from '../ClientToolRequestManager';
import { CLIENT_TOOL_IMAGE_RESULT_EXPIRATION, CLIENT_TOOL_RESULT_EXPIRATION } from '../client-tool-results';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

/** What the step passed to finalizeStepEntity. */
interface FinalizedStep {
    success: boolean;
    errorMessage?: string;
    outputData?: Record<string, unknown>;
}

/** The REAL BaseAgent, with the search-RAG boundary stubbed and the step-record writes recorded. */
class HarnessAgent extends BaseAgent {
    public readonly CreatedSteps: string[] = [];
    public readonly FinalizedSteps: FinalizedStep[] = [];

    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    /** Records the step's name instead of writing a run step row. */
    protected override async createStepEntity(params: { stepName: string }): Promise<MJAIAgentRunStepEntityExtended> {
        this.CreatedSteps.push(params.stepName);
        return {} as MJAIAgentRunStepEntityExtended;
    }

    /** Records what the step would save on its run step row. */
    protected override async finalizeStepEntity(
        _stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: Record<string, unknown>,
    ): Promise<void> {
        this.FinalizedSteps.push({ success, errorMessage, outputData });
    }
}

/** 200,000 characters of base64, about the size of a dashboard screenshot. */
const BASE64 = 'QUJD'.repeat(50_000);
/** A run of the base64 that must never show up in the step record. */
const BASE64_SAMPLE = 'QUJDQUJDQUJD';

/** An agent on prompt turn 4 whose agent type prompt params are `promptParams`. */
function makeAgent(promptParams?: Record<string, unknown>): HarnessAgent {
    const agent = new HarnessAgent();
    agent['_agentTypePromptParams'] = promptParams;
    agent['_promptTurnCount'] = 4;
    return agent;
}

function makeParams(): ExecuteAgentParams {
    return {
        agent: {} as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Is the revenue panel too small?' }],
        contextUser: { ID: 'user-1' } as UserInfo,
        sessionID: 'browser-session-1',
    };
}

/** The model's decision to call one client tool and finish once it has run. */
function screenshotDecision(): BaseAgentNextStep {
    return {
        step: 'ClientTools' as BaseAgentNextStep['step'],
        terminate: false,
        terminateAfterExecution: true,
        message: 'The revenue panel is narrow.',
        clientTools: [{ Name: 'GetDashboardScreenshot', Params: { maxWidth: 1280 }, Description: 'Look at the dashboard' }],
    };
}

/** Answers the step's client tool request with `response`. */
function answerWith(response: Omit<ClientToolResponse, 'RequestID'>) {
    return vi.spyOn(ClientToolRequestManager.Instance, 'RequestClientTool').mockImplementation(async (requestID: string) => ({ RequestID: requestID, ...response }));
}

/** Runs the client tools step as executeNextStep does for a ClientTools decision. */
function runStep(agent: HarnessAgent, params: ExecuteAgentParams): Promise<BaseAgentNextStep> {
    const config: AgentConfiguration = { success: true };
    return agent['executeClientToolsStep'](params, config, screenshotDecision(), 0);
}

/** The message the step added last to the conversation. */
function lastMessage(params: ExecuteAgentParams): AgentChatMessage {
    return params.conversationMessages[params.conversationMessages.length - 1];
}

describe('BaseAgent client tools step', () => {
    it('sends the request for the browser session, then finishes as the decision asked', async () => {
        const agent = makeAgent();
        const params = makeParams();
        const request = answerWith({ Success: true, Result: { width: 1280 } });

        const next = await runStep(agent, params);

        expect(request).toHaveBeenCalledExactlyOnceWith(
            expect.stringMatching(/^ct_/), 'GetDashboardScreenshot', { maxWidth: 1280 }, 'browser-session-1', 'unknown', 30_000, 'Look at the dashboard',
        );
        expect(next).toMatchObject({ step: 'Success', terminate: true, message: 'The revenue panel is narrow.' });
        expect(agent.CreatedSteps).toEqual(['Client Tool: GetDashboardScreenshot']);
    });

    it('adds a result with an image as the image block, then the text block, removed after 2 turns', async () => {
        const agent = makeAgent();
        const params = makeParams();
        answerWith({ Success: true, Result: { width: 1280, height: 720 }, Media: [{ MimeType: 'image/jpeg', Base64: BASE64, Width: 1280, Height: 720 }] });

        await runStep(agent, params);

        const message = lastMessage(params);
        const blocks = message.content as ChatMessageContentBlock[];
        expect(message.role).toBe('user');
        expect(blocks.map(b => b.type)).toEqual(['image_url', 'text']);
        expect(blocks[0]).toMatchObject({ content: `data:image/jpeg;base64,${BASE64}`, mimeType: 'image/jpeg', fileName: 'GetDashboardScreenshot' });
        expect(blocks[1].content).toBe('Client tool results:\n✓ **GetDashboardScreenshot**: succeeded\n  Result: {"width":1280,"height":720}');
        expect(message.metadata).toEqual({ turnAdded: 4, messageType: 'client-tool-result', ...CLIENT_TOOL_IMAGE_RESULT_EXPIRATION });
        expect(CLIENT_TOOL_IMAGE_RESULT_EXPIRATION.expirationTurns).toBe(2);
    });

    it('saves the media metadata on the step record, never the base64', async () => {
        const agent = makeAgent();
        answerWith({ Success: true, Result: { width: 1280, height: 720 }, Media: [{ MimeType: 'image/jpeg', Base64: BASE64, Width: 1280, Height: 720 }] });

        await runStep(agent, makeParams());

        expect(agent.FinalizedSteps).toEqual([
            {
                success: true,
                errorMessage: undefined,
                outputData: { result: { width: 1280, height: 720 }, media: [{ mimeType: 'image/jpeg', bytes: 150_000, width: 1280, height: 720 }] },
            },
        ]);
        expect(JSON.stringify(agent.FinalizedSteps)).not.toContain(BASE64_SAMPLE);
    });

    it('cuts each result to the clientToolResultMaxChars of the agent type prompt params', async () => {
        const agent = makeAgent({ clientToolResultMaxChars: 10 });
        const params = makeParams();
        const result = { panels: ['Revenue', 'Orders', 'Customers'] };
        const full = JSON.stringify(result);
        answerWith({ Success: true, Result: result });

        await runStep(agent, params);

        const message = lastMessage(params);
        expect(message.content).toBe(
            `Client tool results:\n✓ **GetDashboardScreenshot**: succeeded\n  Result: ${full.slice(0, 10)} [truncated ${full.length - 10} of ${full.length} chars]`,
        );
        expect(message.metadata).toEqual({ turnAdded: 4, messageType: 'client-tool-result', ...CLIENT_TOOL_RESULT_EXPIRATION });
    });

    it('keeps the whole result when the agent type prompt params set no cap', async () => {
        const agent = makeAgent();
        const params = makeParams();
        const result = { panels: ['Revenue', 'Orders', 'Customers'] };
        answerWith({ Success: true, Result: result });

        await runStep(agent, params);

        expect(lastMessage(params).content).toBe(`Client tool results:\n✓ **GetDashboardScreenshot**: succeeded\n  Result: ${JSON.stringify(result)}`);
    });
});
