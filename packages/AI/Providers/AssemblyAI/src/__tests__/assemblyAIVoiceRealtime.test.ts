import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeModel, RealtimeProxyRegistry, type IRealtimeSession, type RealtimeSessionParams, type RealtimeInProcessPeer } from '@memberjunction/ai';
import { AssemblyAIVoiceRealtime, BuildAssemblyAIVoiceSettings } from '../assemblyAIVoiceRealtime';
import type { VoicePipelineConfig, VoicePipelineProviders } from '../voice/assemblyAIVoicePipeline';
import type { AssemblyAIVoiceSettings } from '../assemblyAIVoiceRealtime';
import { FakeLLMCall, FakeSTT, FakeTTS, settle } from './helpers/pipelineHarness';

const PARAMS: RealtimeSessionParams = {
    Model: 'assemblyai-stt-3-7-realtime-agent',
    SystemPrompt: 'SECRET PROMPT',
    InitialContext: 'Earlier: hello.',
    Tools: [{ Name: 'secret_tool', Description: 'd', ParametersSchema: { type: 'object' } }],
    UserID: 'user-1',
};

/** The driver with its three services faked; records the settings each call was opened with. */
class TestDriver extends AssemblyAIVoiceRealtime {
    public STTs: FakeSTT[] = [];
    public TTSs: FakeTTS[] = [];
    public LLM: FakeLLMCall[] = [];
    public Settings: AssemblyAIVoiceSettings[] = [];
    public FailTTS = false;
    protected override createProviders(settings: AssemblyAIVoiceSettings): VoicePipelineProviders {
        this.Settings.push(settings);
        return {
            OpenSTT: async (h) => {
                const s = new FakeSTT(h);
                this.STTs.push(s);
                return s;
            },
            OpenTTS: async (h) => {
                if (this.FailTTS) throw new Error('no voice');
                const t = new FakeTTS(h);
                this.TTSs.push(t);
                return t;
            },
            StreamLLM: (request, signal) => {
                const c = new FakeLLMCall(request, signal);
                this.LLM.push(c);
                return c.Events();
            },
        };
    }
    public get STT(): FakeSTT {
        return this.STTs[this.STTs.length - 1];
    }
    public get TTS(): FakeTTS {
        return this.TTSs[this.TTSs.length - 1];
    }
}

describe('AssemblyAIVoiceRealtime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubEnv('MJAPI_PUBLIC_URL', 'https://api.example.com/base');
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('is the driver registered as AssemblyAIVoiceRealtime', () => {
        const made = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(BaseRealtimeModel, 'AssemblyAIVoiceRealtime', 'key');
        expect(made).toBeInstanceOf(AssemblyAIVoiceRealtime);
        expect(made?.SupportsClientDirect).toBe(true);
    });

    describe('browser sessions', () => {
        it('mints a one-time proxy URL and gives the browser no prompt, tool or key', async () => {
            const config = await new TestDriver('sk-secret').CreateClientSession(PARAMS);
            expect(config.Provider).toBe('assemblyai-voice');
            expect(config.ServerHeldConfig).toBe(true);
            expect(config.EphemeralToken).toMatch(/^wss:\/\/api\.example\.com\/realtime-proxy\?ticket=/);
            expect(config.SessionConfig).toEqual({ sampleRate: 24000, callID: expect.any(String) });
            const all = JSON.stringify(config);
            for (const secret of ['SECRET PROMPT', 'secret_tool', 'sk-secret', 'Earlier']) expect(all).not.toContain(secret);
        });

        it('moves the call before the provider session limit', async () => {
            const config = await new TestDriver('k').CreateClientSession(PARAMS);
            expect(config.ConnectionMaxSeconds).toBe(3600);
            expect(config.TrustNativeResumption).toBe(false);
        });

        it('carries the session cap to the call', async () => {
            const driver = new TestDriver('k');
            const config = await driver.CreateClientSession({ ...PARAMS, MaxSessionSeconds: 120 });
            expect(config.MaxSessionSeconds).toBe(120);
            const { peer, closes } = openTicket(config.EphemeralToken);
            await settle(121_000);
            expect(closes).toEqual([4000]);
            peer;
        });

        it('counts the session cap from the mint, not from when the browser connects', async () => {
            const config = await new TestDriver('k').CreateClientSession({ ...PARAMS, MaxSessionSeconds: 120 });
            await settle(100_000);
            const { closes } = openTicket(config.EphemeralToken);
            await settle(19_000);
            expect(closes).toEqual([]);
            await settle(2_000);
            expect(closes).toEqual([4000]);
        });

        it('a ticket does not outlive the session cap', async () => {
            const driver = new TestDriver('k');
            const config = await driver.CreateClientSession({ ...PARAMS, MaxSessionSeconds: 60 });
            await settle(61_000);
            expect(RealtimeProxyRegistry.Instance.Consume(ticketOf(config.EphemeralToken))).toBeNull();
        });

        it('opens nothing until the browser connects, then runs the call with the server prompt, context and tools', async () => {
            const driver = new TestDriver('k');
            const config = await driver.CreateClientSession(PARAMS);
            expect(driver.STTs).toHaveLength(0);
            const { sent, upstream } = openTicket(config.EphemeralToken);
            await settle();
            expect(sent.map((f) => f.type)).toEqual(['session.created']);
            upstream.Receive(JSON.stringify({ type: 'session.update', session: { instructions: 'HACKED' } }));
            driver.STT.Say('Hi.');
            await settle();
            expect(String(driver.LLM[0].Request.Messages[0].content)).toBe('SECRET PROMPT\n\n## Prior context\nEarlier: hello.');
            expect(driver.LLM[0].Request.Tools[0].Name).toBe('secret_tool');
            upstream.Closed();
            expect(driver.STT.CloseCalls).toBe(1);
            expect(driver.TTS.CloseCalls).toBe(1);
        });

        it('speaks the first message once per call, not again on the connection that replaces it', async () => {
            const driver = new TestDriver('k');
            const params = { ...PARAMS, Config: { firstMessage: 'Hi, I am Kyla.' } };
            const first = await driver.CreateClientSession(params);
            openTicket(first.EphemeralToken);
            const second = await driver.RefreshClientSessionCredential(params, first.SessionConfig);
            openTicket(second.EphemeralToken);
            await settle();
            expect(driver.Settings.map((s) => s.FirstMessage)).toEqual(['Hi, I am Kyla.', undefined]);
        });

        it('ends the old connection once the one that replaces it is ready', async () => {
            const driver = new TestDriver('k');
            const first = await driver.CreateClientSession(PARAMS);
            const a = openTicket(first.EphemeralToken);
            await settle();
            const second = await driver.RefreshClientSessionCredential(PARAMS, first.SessionConfig);
            expect(second.SessionConfig).toEqual(first.SessionConfig);
            expect(a.closes).toEqual([]);
            const b = openTicket(second.EphemeralToken);
            await settle();
            expect(a.closes).toEqual([1000]);
            expect(b.closes).toEqual([]);
            expect(driver.STTs.map((s) => s.CloseCalls)).toEqual([1, 0]);
            b.upstream.Closed();
        });

        it('keeps the old connection when its replacement cannot open', async () => {
            const driver = new TestDriver('k');
            const first = await driver.CreateClientSession(PARAMS);
            const a = openTicket(first.EphemeralToken);
            await settle();
            const second = await driver.RefreshClientSessionCredential(PARAMS, first.SessionConfig);
            driver.FailTTS = true;
            openTicket(second.EphemeralToken);
            await settle();
            expect(a.closes).toEqual([]);
            a.upstream.Closed();
        });

        it('two separate calls do not end each other', async () => {
            const driver = new TestDriver('k');
            const a = openTicket((await driver.CreateClientSession(PARAMS)).EphemeralToken);
            const b = openTicket((await driver.CreateClientSession(PARAMS)).EphemeralToken);
            await settle();
            expect([...a.closes, ...b.closes]).toEqual([]);
            a.upstream.Closed();
            b.upstream.Closed();
        });

        it('names the user on the ticket', async () => {
            const config = await new TestDriver('k').CreateClientSession(PARAMS);
            const entry = RealtimeProxyRegistry.Instance.Consume(ticketOf(config.EphemeralToken));
            expect(entry?.UserID).toBe('user-1');
            expect(entry?.DriverClass).toBe('TestDriver');
        });
    });

    describe('server sessions', () => {
        async function start(driver = new TestDriver('k'), params = PARAMS): Promise<{ driver: TestDriver; session: IRealtimeSession }> {
            const opening = driver.StartSession(params);
            await settle();
            return { driver, session: await opening };
        }

        it('speaks the session contract end to end', async () => {
            const { driver, session } = await start();
            const audio: number[] = [];
            const transcripts: string[] = [];
            const usage: number[] = [];
            session.OnOutput((chunk) => audio.push(chunk.byteLength));
            session.OnTranscript((t) => t.IsFinal && transcripts.push(`${t.Role}: ${t.Text}`));
            session.OnUsage((u) => usage.push(u.InputTokens, u.OutputTokens));
            session.SendInput({ Data: new ArrayBuffer(4800), Kind: 'audio' });
            expect(driver.STT.Audio).toBe(4800);
            driver.STT.Say('Hi.');
            await settle();
            driver.LLM[0].Text('Hello there.').Usage(7, 3).End();
            await settle();
            driver.TTS.Deliver(0, 100);
            await settle(200);
            expect(audio).toEqual([4800]);
            expect(transcripts).toEqual(['user: Hi.', 'assistant: Hello there.']);
            expect(usage).toEqual([7, 3]);
            await session.Close();
        });

        it('runs a tool call through the contract', async () => {
            const { driver, session } = await start();
            const calls: string[] = [];
            session.OnToolCall((c) => calls.push(`${c.CallID} ${c.ToolName} ${c.Arguments}`));
            driver.STT.Say('Use it.');
            await settle();
            driver.LLM[0].Calls({ CallID: 'c1', Name: 'secret_tool', Arguments: '{"a":1}' }).End();
            await settle();
            expect(calls).toEqual(['c1 secret_tool {"a":1}']);
            await session.SendToolResult('c1', '{"ok":true}');
            await settle();
            expect(driver.LLM).toHaveLength(2);
            expect(driver.LLM[1].Request.Messages.at(-1)).toMatchObject({ role: 'tool', content: '{"ok":true}' });
            await session.Close();
        });

        it('reports an interruption', async () => {
            const { driver, session } = await start();
            const interrupted = vi.fn();
            session.OnInterruption(interrupted);
            driver.STT.Say('Hi.');
            await settle();
            driver.LLM[0].Text('A long answer.').End();
            await settle();
            driver.TTS.Deliver(0, 5000);
            driver.STT.Say('Stop.');
            expect(interrupted).toHaveBeenCalledTimes(1);
            await session.Close();
        });

        it('waits for the host to ask in a meeting', async () => {
            const { driver, session } = await start(new TestDriver('k'), { ...PARAMS, Config: { disableAutoResponse: true } });
            driver.STT.Say('Hi everyone.');
            await settle();
            expect(driver.LLM).toHaveLength(0);
            session.RequestSpokenUpdate?.('');
            await settle();
            expect(driver.LLM).toHaveLength(1);
            await session.Close();
        });

        it('switches to meeting mode mid-call', async () => {
            const { driver, session } = await start();
            expect(session.Capabilities?.CanReconfigureTurnMode).toBe(true);
            session.Reconfigure?.({ DisableAutoResponse: true });
            driver.STT.Say('Hi.');
            await settle();
            expect(driver.LLM).toHaveLength(0);
            await session.Close();
        });

        it('takes new tools mid-call', async () => {
            const { driver, session } = await start();
            await session.RegisterTools([{ Name: 'new_tool', Description: 'd', ParametersSchema: { type: 'object' } }]);
            driver.STT.Say('Hi.');
            await settle();
            expect(driver.LLM[0].Request.Tools.map((t) => t.Name)).toEqual(['new_tool']);
            await session.Close();
        });

        it('closes both services on Close, and reports nothing', async () => {
            const { driver, session } = await start();
            const error = vi.fn();
            session.OnError(error);
            await session.Close();
            await settle();
            expect(driver.STT.CloseCalls).toBe(1);
            expect(driver.TTS.CloseCalls).toBe(1);
            expect(error).not.toHaveBeenCalled();
        });

        it('rejects, with nothing left open, when a service cannot be opened', async () => {
            const driver = new TestDriver('k');
            driver.FailTTS = true;
            const opening = expect(driver.StartSession(PARAMS)).rejects.toThrow();
            await settle(20_000);
            await opening;
            expect(driver.STT.CloseCalls).toBe(1);
        });
    });

    describe('settings', () => {
        const settings = (Config?: RealtimeSessionParams['Config'], Model = PARAMS.Model) => BuildAssemblyAIVoiceSettings({ ...PARAMS, Model, Config });

        it('has working defaults', () => {
            expect(settings()).toMatchObject({ SpeechModel: 'assemblyai-stt-3-7-realtime-agent', LLMModel: 'gemma-4-31b', VoiceID: 'aai-kyla', Mode: 'balanced', AutoRespond: true });
        });

        it('takes another LLM, voice, key terms and first message', () => {
            expect(settings({ llmModel: 'claude-haiku-5-5', voice: 'aai-bert', keyterms: ['MJ', 3], firstMessage: ' Hi. ' })).toMatchObject({
                LLMModel: 'claude-haiku-5-5', VoiceID: 'aai-bert', Keyterms: ['MJ'], FirstMessage: 'Hi.',
            });
        });

        it('takes a cloned voice by its UUID', () => {
            expect(settings({ voice: '37e65973-9d96-5aab-adcd-01bf56ab5af9' }).VoiceID).toBe('37e65973-9d96-5aab-adcd-01bf56ab5af9');
        });

        it('keeps the call working when the voice belongs to the retired Voice Agent API', () => {
            expect(settings({ voice: 'ivy' }).VoiceID).toBe('aai-kyla');
        });

        it('uses the model id for speech only when it names a speech model', () => {
            expect(settings(undefined, 'assemblyai-stt-4-realtime-agent').SpeechModel).toBe('assemblyai-stt-4-realtime-agent');
            expect(settings(undefined, 'something-else').SpeechModel).toBe('assemblyai-stt-3-7-realtime-agent');
        });

        it.each([['low', 'max_accuracy'], ['auto', 'balanced'], ['high', 'min_latency']])('maps %s eagerness to %s', (Eagerness, mode) => {
            expect(settings({ turnDetection: { Eagerness } }).Mode).toBe(mode);
        });

        it('maps silence and threshold, and declares what it maps', () => {
            expect(settings({ turnDetection: { SilenceDurationMs: 900, Threshold: 0.4 } })).toMatchObject({ MaxTurnSilenceMs: 900, VadThreshold: 0.4 });
            expect(AssemblyAIVoiceRealtime.DriverFacts.SupportedTurnSettings).toEqual({ Eagerness: 'approximate', SilenceDurationMs: 'exact', Threshold: 'exact' });
        });
    });

    it('offers its voices', () => {
        const voices = new AssemblyAIVoiceRealtime('k').SupportedVoices;
        expect(voices.map((v) => v.ID)).toContain('aai-kyla');
        expect(voices.every((v) => v.ID.startsWith('aai-'))).toBe(true);
    });
});

function ticketOf(url: string): string {
    return new URL(url).searchParams.get('ticket') ?? '';
}

/** Connects to a minted ticket the way MJAPI's proxy does. */
function openTicket(url: string): { sent: Array<{ type: string }>; closes: Array<number | undefined>; peer: RealtimeInProcessPeer; upstream: { Receive(f: string): void; Closed(): void } } {
    const sent: Array<{ type: string }> = [];
    const closes: Array<number | undefined> = [];
    const entry = RealtimeProxyRegistry.Instance.Consume(ticketOf(url));
    const peer: RealtimeInProcessPeer = {
        Send: (f) => sent.push(JSON.parse(f) as { type: string }),
        Close: (code) => {
            closes.push(code);
            upstream.Closed();
        },
    };
    const upstream = entry!.OpenInProcess!(peer);
    return { sent, closes, peer, upstream };
}
