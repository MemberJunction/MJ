/**
 * The replayed-reasoning prefix guard as `executeModel` wires it, rather than as a bare function.
 *
 * The agent hands the runner the previous request's system-prompt-and-tools fingerprint; the runner
 * must strip replayed reasoning when this request's differs, and record this request's fingerprint
 * on the result so the agent can hand it back next time. Both the first attempt and the one
 * tools-stripped envelope retry do this. These tests drive the real `executeModel`, with only the
 * driver, the credential lookup and the model catalog stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ChatParams, ChatResult, type ChatMessage, type ChatTool } from '@memberjunction/ai';
import type { AIPromptParams, MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        AIEngine: {
            Instance: {
                IsInferenceProvider: () => true,
                // Every model in these tests can take native tools and defaults to them.
                GetEffectiveModelConfiguration: () => ({ LLM: { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true } })
            }
        }
    };
});

import { AIPromptRunner } from '../AIPromptRunner';
import { GetSentPrefixFingerprint, ReplayedReasoningPrefixFingerprint } from '../replayedReasoningPrefix';
import { GetToolCallingMode } from '../nativeToolCallingGate';

type ExecuteModel = (
    model: MJAIModelEntityExtended,
    renderedPrompt: string,
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    vendorId: string | null,
    conversationMessages?: ChatMessage[],
    templateMessageRole?: 'system',
    cancellationToken?: AbortSignal,
    vendorDriverClass?: string,
    vendorApiName?: string
) => Promise<ChatResult>;

/** What the stub driver was sent, captured per call. */
interface SentRequest {
    messages: ChatMessage[];
    tools: ChatTool[] | undefined;
    fingerprint: string;
}

const model = { ID: 'model-1', Name: 'Claude Test', DriverClass: 'StubLLM', APIName: 'claude-test', ModelVendors: [] } as unknown as MJAIModelEntityExtended;
const prompt = { ID: 'prompt-1', Name: 'Loop', PromptConfigurationObject: { LLM: { UseNativeToolCalling: true } } } as unknown as MJAIPromptEntityExtended;
const tool = (name: string): ChatTool => ({ name, description: `Call ${name}.`, inputSchema: { type: 'object', properties: {} } });

/** A history whose last assistant turn carries a replayed thinking block. */
const history = (): ChatMessage[] => [
    { role: 'user', content: 'Go' },
    { role: 'assistant', content: 'Searching first.', reasoning: [{ provider: 'anthropic', kind: 'thinking', text: 'Search.', signature: 'sig-1' }] },
    { role: 'user', content: 'Continue' }
];

const okResult = (): ChatResult => {
    const r = new ChatResult(true, new Date(), new Date());
    r.data = { choices: [{ message: { role: 'assistant', content: '{"taskComplete": true}' }, finish_reason: 'stop', index: 0 }], usage: undefined as never };
    return r;
};

let sent: SentRequest[];
let responder: (call: number) => ChatResult;
let runner: AIPromptRunner;

beforeEach(() => {
    sent = [];
    responder = () => okResult();
    runner = new AIPromptRunner();
    vi.spyOn(runner as unknown as { ResolveCredentialForExecution(): Promise<string> }, 'ResolveCredentialForExecution').mockResolvedValue('key');
    vi.spyOn(runner as unknown as { logStatus(): void }, 'logStatus').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const name of ['injectNativeFileInputs', 'stripUnsupportedMediaBlocks', 'applyAssistantPrefill']) {
        vi.spyOn(runner as unknown as Record<string, () => void>, name).mockImplementation(() => undefined);
    }
    const llm = {
        SupportsTools: true,
        ChatCompletion: async (p: ChatParams): Promise<ChatResult> => {
            sent.push({ messages: p.messages, tools: p.tools, fingerprint: ReplayedReasoningPrefixFingerprint(p) });
            return responder(sent.length - 1);
        }
    };
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => llm as never);
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** One request through the real executeModel, as the agent sends it: tools, history, previous fingerprint. */
async function send(toolNames: string[], previousPrefix: string | undefined): Promise<ChatResult> {
    const executeModel = (runner as unknown as { executeModel: ExecuteModel }).executeModel.bind(runner);
    const params = { prompt, tools: toolNames.map(tool), ReplayedReasoningPrefix: previousPrefix, data: {} } as unknown as AIPromptParams;
    return executeModel(model, 'You are the loop agent.', prompt, params, null, history(), 'system', undefined, 'StubLLM', 'claude-test');
}

const replaysReasoning = (request: SentRequest): boolean => request.messages.some((m) => m.reasoning);

describe('AIPromptRunner.executeModel — the replayed-reasoning prefix', () => {
    it('records the fingerprint of the request it sent on the result', async () => {
        const result = await send(['search'], undefined);

        expect(GetSentPrefixFingerprint(result)).toBe(sent[0].fingerprint);
    });

    it('sends the next request without replayed reasoning when the tool list changed, and records the new fingerprint', async () => {
        const first = await send(['search'], undefined);
        const second = await send(['search', 'skill_bundled_action'], GetSentPrefixFingerprint(first));

        expect(replaysReasoning(sent[0])).toBe(true);
        expect(replaysReasoning(sent[1])).toBe(false);
        expect(GetSentPrefixFingerprint(second)).toBe(sent[1].fingerprint);
        expect(GetSentPrefixFingerprint(second)).not.toBe(GetSentPrefixFingerprint(first));
    });

    it('keeps the replayed reasoning when the tool list is unchanged', async () => {
        const first = await send(['search'], undefined);
        await send(['search'], GetSentPrefixFingerprint(first));

        expect(replaysReasoning(sent[1])).toBe(true);
    });
});

describe('AIPromptRunner.executeModel — the tools-stripped retry and the replayed-reasoning prefix', () => {
    /** The first attempt is refused for its tools; the retry, sent without them, succeeds. */
    const refuseToolsOnce = (call: number): ChatResult => {
        if (call > 0) {
            return okResult();
        }
        const r = new ChatResult(false, new Date(), new Date());
        r.data = { choices: [], usage: undefined as never };
        r.statusText = 'error';
        r.errorMessage = 'invalid tool call: the tools param was rejected';
        return r;
    };

    it('strips the replayed reasoning from the retry, whose tools differ from the previous request, and records what the retry sent', async () => {
        const first = await send(['search'], undefined);
        responder = refuseToolsOnce;
        sent = [];

        const result = await send(['search'], GetSentPrefixFingerprint(first));

        expect(sent).toHaveLength(2);
        // The first attempt matched the previous request, so it kept the reasoning; the retry dropped the tools.
        expect(replaysReasoning(sent[0])).toBe(true);
        expect(sent[1].tools).toBeUndefined();
        expect(replaysReasoning(sent[1])).toBe(false);
        expect(GetToolCallingMode(result)).toBe('NativeFallback');
        expect(GetSentPrefixFingerprint(result)).toBe(sent[1].fingerprint);
    });
});

describe('AIPromptRunner.executeModel — a native call the provider throws on is retried with the envelope prompt', () => {
    it('sends the retry the prompt rendered for the envelope, with the action catalog, not the native wording', async () => {
        responder = (call) => {
            if (call === 0) {
                throw Object.assign(new Error('400 Function tools with reasoning_effort are not supported for test-model in /v1/chat/completions.'), { status: 400 });
            }
            return okResult();
        };
        const executeModel = (runner as unknown as { executeModel: ExecuteModel }).executeModel.bind(runner);
        const params = { prompt, tools: [tool('search')], data: { _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'envelope' } } as unknown as AIPromptParams;
        (runner as unknown as { registerNativeRerender(p: AIPromptParams, r: (d: Record<string, unknown>) => Promise<string>): void })
            .registerNativeRerender(params, async (data) => (data._NATIVE_TOOL_CALLING ? 'Call the tools you are given.' : 'Action catalog: search(query).'));

        const result = await executeModel(model, 'Call the tools you are given.', prompt, params, null, history(), 'system', undefined, 'StubLLM', 'claude-test');

        expect(sent).toHaveLength(2);
        expect(sent[0].messages[0].content).toBe('Call the tools you are given.');
        expect(sent[1].tools).toBeUndefined();
        expect(sent[1].messages[0].content).toBe('Action catalog: search(query).');
        expect(GetToolCallingMode(result)).toBe('NativeFallback');
    });
});
