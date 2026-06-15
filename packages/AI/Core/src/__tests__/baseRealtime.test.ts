import { describe, it, expect, vi } from 'vitest';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeToolDefinition,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeSessionError,
    ClientRealtimeSessionConfig,
} from '../generic/baseRealtime';

/**
 * In-test concrete session that stores registered handlers and tools so we can assert
 * registration and manually drive the event hooks deterministically (no network, no audio).
 */
class MockRealtimeSession implements IRealtimeSession {
    public RegisteredTools: RealtimeToolDefinition[] = [];
    public SentInput: ArrayBuffer[] = [];
    public Closed = false;
    public SentToolResults: { CallID: string; Output: string }[] = [];
    public SentContextNotes: string[] = [];
    public RequestedSpokenUpdates: string[] = [];

    public OutputHandler?: (chunk: ArrayBuffer) => void;
    public TranscriptHandler?: (t: RealtimeTranscript) => void;
    public ToolCallHandler?: (call: RealtimeToolCall) => void;
    public InterruptionHandler?: () => void;
    public UsageHandler?: (u: RealtimeUsage) => void;
    public ErrorHandler?: (error: RealtimeSessionError) => void;
    public CloseHandler?: () => void;

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

    public async SendToolResult(callID: string, output: string): Promise<void> {
        this.SentToolResults.push({ CallID: callID, Output: output });
    }

    public SendContextNote(text: string): void {
        this.SentContextNotes.push(text);
    }

    public RequestSpokenUpdate(instructions: string): void {
        this.RequestedSpokenUpdates.push(instructions);
    }

    public OnInterruption(handler: () => void): void {
        this.InterruptionHandler = handler;
    }

    public OnUsage(handler: (u: RealtimeUsage) => void): void {
        this.UsageHandler = handler;
    }

    public OnError(handler: (error: RealtimeSessionError) => void): void {
        this.ErrorHandler = handler;
    }

    public OnClose(handler: () => void): void {
        this.CloseHandler = handler;
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

describe('BaseRealtimeModel client-direct capability', () => {
    it('SupportsClientDirect defaults to false', () => {
        const model = makeModel();
        expect(model.SupportsClientDirect).toBe(false);
    });

    it('CreateClientSession throws "not supported" by default', async () => {
        const model = makeModel();
        await expect(model.CreateClientSession({ Model: 'm', SystemPrompt: 'sys' })).rejects.toThrow(
            /does not support client-direct/
        );
    });

    it('a provider may override SupportsClientDirect + CreateClientSession', async () => {
        class ClientDirectModel extends BaseRealtimeModel {
            public override get SupportsClientDirect(): boolean {
                return true;
            }
            public async StartSession(): Promise<IRealtimeSession> {
                return new MockRealtimeSession();
            }
            public override async CreateClientSession(
                params: RealtimeSessionParams
            ): Promise<ClientRealtimeSessionConfig> {
                return {
                    Provider: 'mock',
                    Model: params.Model,
                    EphemeralToken: 'ek_123',
                    ExpiresAt: new Date(0).toISOString(),
                    SessionConfig: { instructions: params.SystemPrompt },
                };
            }
        }
        const model = new ClientDirectModel('test-api-key');
        expect(model.SupportsClientDirect).toBe(true);
        const cfg = await model.CreateClientSession({ Model: 'gpt-realtime', SystemPrompt: 'be brief' });
        expect(cfg.EphemeralToken).toBe('ek_123');
        expect(cfg.SessionConfig).toEqual({ instructions: 'be brief' });
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

    it('SendToolResult is part of the contract and forwards the call result', async () => {
        session = newSession();
        // Structurally assert SendToolResult is on the IRealtimeSession contract.
        const contract: IRealtimeSession = session;
        expect(typeof contract.SendToolResult).toBe('function');
        await contract.SendToolResult('c1', '{"temp":72}');
        expect(session.SentToolResults).toHaveLength(1);
        expect(session.SentToolResults[0]).toEqual({ CallID: 'c1', Output: '{"temp":72}' });
    });

    it('SendContextNote is an OPTIONAL capability exercised when present', () => {
        session = newSession();
        const contract: IRealtimeSession = session;
        // Feature-detect, then exercise — the calling pattern consumers must follow.
        expect(typeof contract.SendContextNote).toBe('function');
        contract.SendContextNote?.('[progress] delegated run is 50% complete');
        expect(session.SentContextNotes).toEqual(['[progress] delegated run is 50% complete']);
    });

    it('RequestSpokenUpdate is an OPTIONAL capability exercised when present', () => {
        session = newSession();
        const contract: IRealtimeSession = session;
        expect(typeof contract.RequestSpokenUpdate).toBe('function');
        contract.RequestSpokenUpdate?.('In one short sentence, say the report is being drafted.');
        expect(session.RequestedSpokenUpdates).toEqual(['In one short sentence, say the report is being drafted.']);
    });

    it('a session OMITTING the optional interim-update members still satisfies the contract', () => {
        // Minimal session with NO SendContextNote / RequestSpokenUpdate / OnClose — providers
        // that cannot support them omit the members; optionality keeps them contract-conformant.
        const minimal: IRealtimeSession = {
            SendInput: () => undefined,
            RegisterTools: async () => undefined,
            SendToolResult: async () => undefined,
            OnOutput: () => undefined,
            OnTranscript: () => undefined,
            OnToolCall: () => undefined,
            OnInterruption: () => undefined,
            OnUsage: () => undefined,
            OnError: () => undefined,
            Close: async () => undefined,
        };
        expect(minimal.SendContextNote).toBeUndefined();
        expect(minimal.RequestSpokenUpdate).toBeUndefined();
        expect(minimal.OnClose).toBeUndefined();
        // Optional-chained invocation on an omitting session is a safe no-op for callers.
        expect(() => minimal.SendContextNote?.('note')).not.toThrow();
        expect(() => minimal.RequestSpokenUpdate?.('update')).not.toThrow();
        expect(() => minimal.OnClose?.(() => undefined)).not.toThrow();
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

    it('OnError is part of the contract and receives fatal + non-fatal errors', () => {
        session = newSession();
        const contract: IRealtimeSession = session;
        expect(typeof contract.OnError).toBe('function');
        const handler = vi.fn();
        contract.OnError(handler);
        const fatal: RealtimeSessionError = { Message: 'token expired', Fatal: true };
        const recoverable: RealtimeSessionError = { Message: 'bad frame', Code: 'invalid_request_error', Fatal: false };
        session.ErrorHandler?.(fatal);
        session.ErrorHandler?.(recoverable);
        expect(handler).toHaveBeenNthCalledWith(1, fatal);
        expect(handler).toHaveBeenNthCalledWith(2, recoverable);
    });

    it('OnClose is an OPTIONAL capability exercised when present', () => {
        session = newSession();
        const contract: IRealtimeSession = session;
        expect(typeof contract.OnClose).toBe('function');
        const handler = vi.fn();
        contract.OnClose?.(handler);
        session.CloseHandler?.();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('Close is callable and marks the session closed', async () => {
        session = newSession();
        await session.Close();
        expect(session.Closed).toBe(true);
    });
});
