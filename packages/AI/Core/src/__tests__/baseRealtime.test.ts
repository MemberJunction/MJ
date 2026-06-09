import { describe, it, expect, vi } from 'vitest';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeToolDefinition,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
} from '../generic/baseRealtime';

/**
 * In-test concrete session that stores registered handlers and tools so we can assert
 * registration and manually drive the event hooks deterministically (no network, no audio).
 */
class MockRealtimeSession implements IRealtimeSession {
    public RegisteredTools: RealtimeToolDefinition[] = [];
    public SentInput: ArrayBuffer[] = [];
    public Closed = false;

    public OutputHandler?: (chunk: ArrayBuffer) => void;
    public TranscriptHandler?: (t: RealtimeTranscript) => void;
    public ToolCallHandler?: (call: RealtimeToolCall) => void;
    public InterruptionHandler?: () => void;
    public UsageHandler?: (u: RealtimeUsage) => void;

    public SendInput(chunk: ArrayBuffer): void {
        this.SentInput.push(chunk);
    }

    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        this.RegisteredTools = tools;
    }

    public OnOutput(handler: (chunk: ArrayBuffer) => void): void {
        this.OutputHandler = handler;
    }

    public OnTranscript(handler: (t: RealtimeTranscript) => void): void {
        this.TranscriptHandler = handler;
    }

    public OnToolCall(handler: (call: RealtimeToolCall) => void): void {
        this.ToolCallHandler = handler;
    }

    public OnInterruption(handler: () => void): void {
        this.InterruptionHandler = handler;
    }

    public OnUsage(handler: (u: RealtimeUsage) => void): void {
        this.UsageHandler = handler;
    }

    public async Close(): Promise<void> {
        this.Closed = true;
    }
}

/**
 * Concrete BaseRealtimeModel for testing — returns a MockRealtimeSession, optionally
 * eagerly registering any tools passed in params.
 */
class MockRealtimeModel extends BaseRealtimeModel {
    public LastParams?: RealtimeSessionParams;

    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        this.LastParams = params;
        const session = new MockRealtimeSession();
        if (params.Tools) {
            await session.RegisterTools(params.Tools);
        }
        return session;
    }
}

const sampleTool: RealtimeToolDefinition = {
    Name: 'invokeTargetAgent',
    Description: 'Runs the full target agent and returns its result.',
    ParametersSchema: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
    },
};

function makeModel(): MockRealtimeModel {
    return new MockRealtimeModel('test-api-key');
}

describe('BaseRealtimeModel', () => {
    it('StartSession returns an IRealtimeSession handle', async () => {
        const model = makeModel();
        const session = await model.StartSession({ Model: 'gpt-realtime-2', SystemPrompt: 'You are a co-agent.' });
        expect(session).toBeDefined();
        expect(typeof session.SendInput).toBe('function');
        expect(typeof session.Close).toBe('function');
    });

    it('passes session params through to the driver', async () => {
        const model = makeModel();
        const params: RealtimeSessionParams = {
            Model: 'gemini-3.1-flash-live',
            SystemPrompt: 'voice for the target agent',
            InitialContext: 'prior conversation history',
            Config: { voice: 'verse', language: 'en' },
        };
        await model.StartSession(params);
        expect(model.LastParams).toEqual(params);
    });

    it('eagerly registers tools provided in session params', async () => {
        const model = makeModel();
        const session = (await model.StartSession({
            Model: 'gpt-realtime-2',
            SystemPrompt: 'sys',
            Tools: [sampleTool],
        })) as MockRealtimeSession;
        expect(session.RegisteredTools).toEqual([sampleTool]);
    });
});

describe('IRealtimeSession', () => {
    let session: MockRealtimeSession;

    function newSession(): MockRealtimeSession {
        return new MockRealtimeSession();
    }

    it('RegisterTools stores the registered tools', async () => {
        session = newSession();
        await session.RegisterTools([sampleTool]);
        expect(session.RegisteredTools).toHaveLength(1);
        expect(session.RegisteredTools[0].Name).toBe('invokeTargetAgent');
    });

    it('SendInput is callable and forwards media frames', () => {
        session = newSession();
        const frame = new ArrayBuffer(8);
        session.SendInput(frame);
        expect(session.SentInput).toHaveLength(1);
        expect(session.SentInput[0]).toBe(frame);
    });

    it('OnOutput registers a handler that can be invoked', () => {
        session = newSession();
        const handler = vi.fn();
        session.OnOutput(handler);
        const chunk = new ArrayBuffer(4);
        session.OutputHandler?.(chunk);
        expect(handler).toHaveBeenCalledWith(chunk);
    });

    it('OnTranscript registers a handler that receives transcript events', () => {
        session = newSession();
        const handler = vi.fn();
        session.OnTranscript(handler);
        const transcript: RealtimeTranscript = { Role: 'user', Text: 'hello', IsFinal: true };
        session.TranscriptHandler?.(transcript);
        expect(handler).toHaveBeenCalledWith(transcript);
    });

    it('OnToolCall registers a handler that receives tool calls', () => {
        session = newSession();
        const handler = vi.fn();
        session.OnToolCall(handler);
        const call: RealtimeToolCall = { CallID: 'c1', ToolName: 'invokeTargetAgent', Arguments: '{"prompt":"hi"}' };
        session.ToolCallHandler?.(call);
        expect(handler).toHaveBeenCalledWith(call);
    });

    it('OnInterruption registers a handler that fires on barge-in', () => {
        session = newSession();
        const handler = vi.fn();
        session.OnInterruption(handler);
        session.InterruptionHandler?.();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('OnUsage registers a handler that receives incremental usage', () => {
        session = newSession();
        const handler = vi.fn();
        session.OnUsage(handler);
        const usage: RealtimeUsage = { InputTokens: 10, OutputTokens: 20 };
        session.UsageHandler?.(usage);
        expect(handler).toHaveBeenCalledWith(usage);
    });

    it('Close is callable and marks the session closed', async () => {
        session = newSession();
        await session.Close();
        expect(session.Closed).toBe(true);
    });
});
