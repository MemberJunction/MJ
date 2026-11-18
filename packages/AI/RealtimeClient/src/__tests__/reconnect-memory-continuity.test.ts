import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerContent, LiveServerMessage } from '@google/genai';
import {
    REALTIME_MEMORY_CONTINUITY_PREAMBLE,
    REALTIME_RESUMPTION_RECOVERY_WINDOW_MS,
    type ClientRealtimeSessionConfig,
} from '@memberjunction/ai';
import {
    type GeminiClientConnectArgs,
    type GeminiLiveClientSession,
} from '../drivers/geminiRealtimeClient';
import { xAIRealtimeClient } from '../drivers/xaiRealtimeClient';
import { AssemblyAIRealtimeClient, type IAssemblyAIClientSocket } from '../drivers/assemblyAIRealtimeClient';
import type { IOpenAIProtocolClientSocket } from '../generic/openAIProtocolClient';
import type { IPcmMicCapture } from '../audio/micCapture';
import type { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import { VideoSourceArbiter } from '../media/videoSourceArbiter';
import {
    collect,
    ConfirmGeminiSetup,
    FakeGeminiSession,
    FakeMediaStream,
    FakeMicCapture,
    FakeTrack,
    GeminiTestClient,
    makeGeminiConfig,
} from './helpers/realtime-fakes';

// ── Test harnesses ─────────────────────────────────────────────────────────────

class FakePlayback implements IRealtimePcmPlayback {
    public IsPlaying = false;
    public GetOutputStream(): MediaStream | null {
        return null;
    }
    public Enqueue(_pcm16: ArrayBuffer): void {}
    public Flush(): void {}
    public Close(): void {}
}

class LongCallGeminiClient extends GeminiTestClient {
    public Connections: Array<{ Args: GeminiClientConnectArgs; Session: FakeGeminiSession }> = [];

    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        const session = new FakeGeminiSession();
        session.OnCloseCallback = () =>
            args.OnClose({ code: 1000, reason: 'closed', wasClean: true } as CloseEvent);
        this.Connections.push({ Args: args, Session: session });
        this.LastConnectArgs = args;
        ConfirmGeminiSetup(args);
        return session;
    }

    public EmitOn(index: number, message: LiveServerMessage): void {
        this.Connections[index].Args.OnMessage(message);
    }
}

const CONTENT = (content: LiveServerContent): LiveServerMessage => ({ serverContent: content }) as LiveServerMessage;
const HEARD = (text: string): LiveServerMessage => CONTENT({ inputTranscription: { text } });
const SAID = (text: string): LiveServerMessage => CONTENT({ outputTranscription: { text } });
const TURN_COMPLETE = CONTENT({ turnComplete: true });

class FakeXAISocket implements IOpenAIProtocolClientSocket {
    public Url = '';
    public Sent: string[] = [];
    public Closed = false;
    public onopen: (() => void) | null = null;
    public onmessage: ((data: string) => void) | null = null;
    public onerror: ((message: string) => void) | null = null;
    public onclose: (() => void) | null = null;

    public send(data: string): void {
        this.Sent.push(data);
    }

    public close(): void {
        this.Closed = true;
    }
}

class NetworkSimXAIClient extends xAIRealtimeClient {
    public Sockets: FakeXAISocket[] = [];
    public Online = true;
    public RejectConversationIds = new Set<string>();

    protected override isHostNetworkOnline(): boolean {
        return this.Online;
    }

    protected override createSocket(url: string): IOpenAIProtocolClientSocket {
        const socket = new FakeXAISocket();
        socket.Url = url;
        this.Sockets.push(socket);
        const convMatch = /[?&]conversation_id=([^&]+)/.exec(url);
        const resumedConvId = convMatch ? decodeURIComponent(convMatch[1]) : null;
        queueMicrotask(() => {
            if (!this.Online) {
                socket.onerror?.('ERR_INTERNET_DISCONNECTED');
                socket.onclose?.();
                return;
            }
            if (resumedConvId && this.RejectConversationIds.has(resumedConvId)) {
                socket.onerror?.(`conversation ${resumedConvId} expired`);
                socket.onclose?.();
                return;
            }
            socket.onopen?.();
        });
        return socket;
    }

    protected override async createMicCapture(
        _micStream: MediaStream,
        _sampleRate: number,
        _onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IPcmMicCapture> {
        return new FakeMicCapture();
    }

    protected override createPlayback(_sampleRate: number): IRealtimePcmPlayback {
        return new FakePlayback();
    }

    public get CurrentSocket(): FakeXAISocket {
        return this.Sockets[this.Sockets.length - 1];
    }
}

class FakeAssemblyAISocket implements IAssemblyAIClientSocket {
    public Url = '';
    public Sent: string[] = [];
    public onopen: (() => void) | null = null;
    public onmessage: ((data: string) => void) | null = null;
    public onerror: ((message: string) => void) | null = null;
    public onclose: (() => void) | null = null;

    public send(data: string): void {
        this.Sent.push(data);
        const parsed = JSON.parse(data) as { type?: string };
        if (parsed.type === 'session.update' && this.Sent.length === 1) {
            queueMicrotask(() => {
                this.onmessage?.(JSON.stringify({ type: 'session.ready', session_id: `aai_${Math.random().toString(36).slice(2, 8)}` }));
            });
        }
    }

    public close(): void {
        /* no-op */
    }

    public SentSystemPrompts(): string[] {
        return this.Sent
            .map((raw) => JSON.parse(raw) as { type?: string; session?: { system_prompt?: string } })
            .filter((f) => f.type === 'session.update' && typeof f.session?.system_prompt === 'string')
            .map((f) => f.session!.system_prompt!);
    }
}

class SimAssemblyAIClient extends AssemblyAIRealtimeClient {
    public Sockets: FakeAssemblyAISocket[] = [];

    protected override createSocket(url: string): IAssemblyAIClientSocket {
        const socket = new FakeAssemblyAISocket();
        socket.Url = url;
        this.Sockets.push(socket);
        queueMicrotask(() => socket.onopen?.());
        return socket;
    }

    protected override async createMicCapture(): Promise<IPcmMicCapture> {
        return new FakeMicCapture();
    }

    protected override createPlayback(): IRealtimePcmPlayback {
        return new FakePlayback();
    }
}

function buildExplorerScreenSnapshot(screenIndex: number): string {
    const padding = `Dashboard widgets, KPIs, entity filters, and active tool schemas for screen #${screenIndex}. `.repeat(24);
    return `[app-context]\nApp: Analytics Hub\nSection: Screen_${screenIndex}\nCurrently viewing: EntityView_${screenIndex}\nScreen details: ${padding}`;
}

function flattenGeminiSeedText(session: FakeGeminiSession): string {
    return session.ClientContents
        .flatMap((c) => c.turns ?? [])
        .flatMap((t) => t.parts ?? [])
        .map((p) => p.text ?? '')
        .join('\n');
}

// ── Call simulation suites ─────────────────────────────────────────────────────

describe('Multi-reconnect call memory continuity simulations', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Simulation 1 (Explorer + Gemini Live 60-min / 6-reconnect call): preserves opening AIDP turn, replaces 50 screen notes, and drops 30 progress notes across all 6 reconnects', async () => {
        const client = new LongCallGeminiClient();
        const { errors } = collect(client);
        let tokenCounter = 0;

        client.SetTokenRefreshCallback(async () => ({
            EphemeralToken: `auth_tokens/gemini-refresh-${++tokenCounter}`,
            ExpiresAt: new Date(Date.now() + 1800_000).toISOString(),
            SessionConfig: {
                model: 'gemini-3.8-live',
                config: { responseModalities: ['AUDIO'], sessionResumption: {} },
            },
        }));

        const config: ClientRealtimeSessionConfig = {
            ...makeGeminiConfig({
                model: 'gemini-3.8-live',
                supportsInboundVideo: true,
                maxInboundVideoRate: 1,
                requestedTracks: [
                    { Modality: 'audio', Direction: 'inbound' },
                    { Modality: 'audio', Direction: 'outbound' },
                    { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 },
                ],
                config: { responseModalities: ['AUDIO'], sessionResumption: {} },
            }),
            ConnectionMaxSeconds: 600,
            ReconnectBufferSeconds: 30,
            TrustNativeResumption: false,
        };

        await client.Connect(config, new FakeMediaStream([new FakeTrack()]));
        expect(client.Connections).toHaveLength(1);

        const arbiter = VideoSourceArbiter.ForSink(client);
        arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard', ChannelKey: 'Whiteboard' });
        arbiter.RegisterSource({ SourceID: 'rb', Label: 'Remote Browser', ChannelKey: 'RemoteBrowser' });

        // Opening turn at t = 0: user establishes the call's core objective ("AIDP").
        client.EmitOn(0, HEARD("Remember I'm working on AIDP — the AI Data Platform rollout."));
        client.EmitOn(0, SAID("Got it! You're working on AIDP, the AI Data Platform rollout. I'll keep that in mind."));
        client.EmitOn(0, TURN_COMPLETE);

        // Durable one-off security event early in the call
        client.SendContextNote('[session-policy] Workspace tier: Enterprise-Prod.');

        let screenCounter = 0;
        let progressCounter = 0;
        let turnCounter = 0;

        // Simulate 6 legs × ~10 minutes = 60 minutes total (including 30-min token rotation)
        for (let leg = 0; leg < 6; leg++) {
            const activeConnIdx = client.Connections.length - 1;
            const prevConnCount = client.Connections.length;

            // ~8-9 Explorer screen navigations per leg (~50 total across the 60-min call), each ~2,000 chars!
            const screensThisLeg = leg < 2 ? 9 : 8;
            for (let s = 0; s < screensThisLeg; s++) {
                screenCounter++;
                const fullSnapshot = buildExplorerScreenSnapshot(screenCounter);
                expect(fullSnapshot.length).toBeGreaterThan(1_900);
                const compactDelta = `[app-context]\nSection: Screen_${screenCounter}\nCurrently viewing: EntityView_${screenCounter}`;
                client.SendContextNote(compactDelta, {
                    StateKey: 'app-context',
                    MemoryText: fullSnapshot,
                });
            }

            // 5 ephemeral delegated-agent progress notes per leg (30 total)
            for (let p = 0; p < 5; p++) {
                progressCounter++;
                client.SendContextNote(
                    `[delegated-agent progress] Sage step ${progressCounter}: scanning schema batch ${progressCounter}`,
                    { Ephemeral: true }
                );
            }

            // Channel state updates + video focus switches (replaceable state keys)
            client.SendContextNote(
                `[channel Whiteboard#wb-1 — delta] Sticky count=${leg + 1}`,
                {
                    StateKey: 'channel:Whiteboard:wb-1',
                    MemoryText: `[channel Whiteboard#wb-1 — state_snapshot] Active board state at leg ${leg + 1} with ${(leg + 1) * 3} Architecture nodes.`,
                }
            );
            arbiter.SetFocusedChannel(leg % 2 === 0 ? 'Whiteboard' : 'RemoteBrowser');

            // 8 substantive spoken user/assistant turns per leg (48 turns > 36,000 chars across the call,
            // intentionally exceeding the 24,000-char rolling conversation budget!)
            for (let t = 0; t < 8; t++) {
                turnCounter++;
                const detail = 'We reviewed column lineage, partition keys, and incremental sync latency metrics for this table. '.repeat(4);
                client.EmitOn(activeConnIdx, HEARD(`Turn ${turnCounter} question: how should table_${turnCounter} be partitioned? ${detail}`));
                client.EmitOn(activeConnIdx, SAID(`Turn ${turnCounter} answer: partition table_${turnCounter} by tenant and month. ${detail}`));
                client.EmitOn(activeConnIdx, TURN_COMPLETE);
            }

            // Advance to the 10-minute soft reconnect window (600 - 45 = 555s)
            await vi.advanceTimersByTimeAsync(555_000);
            expect(client.Connections.length).toBeGreaterThan(prevConnCount);

            // Inspect the seed sent as the VERY FIRST clientContent frame on the newly opened connection!
            const reconnectedSession = client.Connections.at(-1)!.Session;
            expect(reconnectedSession.ClientContents.length).toBeGreaterThanOrEqual(1);
            const seedPayload = reconnectedSession.ClientContents[0];
            const seededText = (seedPayload.turns ?? [])
                .flatMap((turn) => turn.parts ?? [])
                .map((part) => part.text ?? '')
                .join('\n');

            // 1. Continuity preamble + pinned opening AIDP turn MUST survive all 6 reconnects!
            expect(seededText).toContain(REALTIME_MEMORY_CONTINUITY_PREAMBLE);
            expect(seededText).toContain("Remember I'm working on AIDP — the AI Data Platform rollout.");
            expect(seededText).toContain("Got it! You're working on AIDP, the AI Data Platform rollout.");

            // 2. Latest conversation turn from the leg that just finished MUST be present!
            expect(seededText).toContain(`Turn ${turnCounter} question: how should table_${turnCounter} be partitioned?`);
            expect(seededText).toContain(`Turn ${turnCounter} answer: partition table_${turnCounter} by tenant and month.`);

            // 3. ONLY the latest Explorer screen snapshot (`Screen_${screenCounter}`) may appear — ZERO stale screens!
            expect(seededText).toContain(`Section: Screen_${screenCounter}`);
            for (let prevScreen = 1; prevScreen < screenCounter; prevScreen++) {
                expect(seededText).not.toContain(`Section: Screen_${prevScreen}\n`);
            }

            // 4. ONLY the latest Whiteboard state snapshot may appear — ZERO earlier board snapshots!
            expect(seededText).toContain(`Active board state at leg ${leg + 1}`);
            if (leg > 0) {
                expect(seededText).not.toContain(`Active board state at leg ${leg} `);
            }

            // 5. ZERO ephemeral delegated-agent progress notes may ever enter reconnect seeds!
            expect(seededText).not.toContain('[delegated-agent progress]');

            // 6. Once conversation turns exceed 24,000 chars (by leg 3+), middle omission marker separates pinned head from tail
            if (leg >= 3) {
                expect(seededText).toContain('middle conversation entries omitted; recent conversation follows.');
            }
        }

        expect(errors).toEqual([]);
        expect(client.Connections.length).toBeGreaterThanOrEqual(7);
        expect(flattenGeminiSeedText(client.Connections.at(-1)!.Session)).toContain("working on AIDP");
        await client.Disconnect();
    });

    it('Simulation 2 (xAI Grok Voice 10s network drop + multi-reconnect call): preserves spoken turns, typed text, and screen state across outage recovery AND subsequent reconnects', async () => {
        const client = new NetworkSimXAIClient();
        const { errors, states } = collect(client);
        let minted = 1;

        client.SetTokenRefreshCallback(async () => ({
            EphemeralToken: `tok-xai-${++minted}`,
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: { instructions: 'You are Grok Voice inside MJ Explorer.' },
        }));

        const connectPromise = client.Connect(
            {
                Provider: 'xai',
                Model: 'grok-voice-latest',
                EphemeralToken: 'tok-xai-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 600,
                ReconnectBufferSeconds: 30,
                SessionConfig: { instructions: 'You are Grok Voice inside MJ Explorer.' },
            },
            new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;
        expect(client.TrustsNativeResumption).toBe(false);

        // Initial conversation conv_1: spoken fact + typed message + 10 screen notes
        client.CurrentSocket.onmessage?.(JSON.stringify({ type: 'conversation.created', conversation: { id: 'conv_1' } }));
        client.CurrentSocket.onmessage?.(
            JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                item_id: 'u_open',
                transcript: 'Remember project code 7788 and codename Borealis.',
            })
        );
        client.CurrentSocket.onmessage?.(
            JSON.stringify({
                type: 'response.output_audio_transcript.done',
                item_id: 'a_open',
                transcript: 'Confirmed: project code 7788 and codename Borealis.',
            })
        );
        client.CurrentSocket.onmessage?.(JSON.stringify({ type: 'response.done' }));

        client.SendText('Also include milestone M4 in the release checklist.');
        client.CurrentSocket.onmessage?.(JSON.stringify({ type: 'response.created' }));
        client.CurrentSocket.onmessage?.(
            JSON.stringify({
                type: 'response.output_audio_transcript.done',
                item_id: 'a_typed',
                transcript: 'Added milestone M4 to the release checklist.',
            })
        );
        client.CurrentSocket.onmessage?.(JSON.stringify({ type: 'response.done' }));

        for (let s = 1; s <= 10; s++) {
            client.SendContextNote(`[app-context] Section: Screen_${s}`, {
                StateKey: 'app-context',
                MemoryText: buildExplorerScreenSnapshot(s),
            });
        }

        // Cut the network for 10 seconds mid-call!
        client.Online = false;
        client.CurrentSocket.onclose?.();

        await vi.advanceTimersByTimeAsync(10_000);
        expect(errors).toEqual([]);

        // Restore network at t = 10s; recovery completes onto fresh conversation conv_2
        client.Online = true;
        await vi.advanceTimersByTimeAsync(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS);

        expect(errors).toEqual([]);
        expect(states.at(-1)).toBe('listening');
        const postDropSocket = client.CurrentSocket;
        expect(postDropSocket.Url).not.toContain('conversation_id=');
        postDropSocket.onmessage?.(JSON.stringify({ type: 'conversation.created', conversation: { id: 'conv_2' } }));

        const postDropSent = postDropSocket.Sent.join('\n');
        expect(postDropSent).toContain('Remember project code 7788 and codename Borealis.');
        expect(postDropSent).toContain('Also include milestone M4 in the release checklist.');
        expect(postDropSent).toContain('Section: Screen_10');
        expect(postDropSent).not.toContain('Section: Screen_1\n');

        // User adds another fact after recovery on conv_2
        postDropSocket.onmessage?.(
            JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                item_id: 'u_post_drop',
                transcript: 'Assign Priya as release lead.',
            })
        );
        postDropSocket.onmessage?.(
            JSON.stringify({
                type: 'response.output_audio_transcript.done',
                item_id: 'a_post_drop',
                transcript: 'Priya is assigned as release lead.',
            })
        );
        postDropSocket.onmessage?.(JSON.stringify({ type: 'response.done' }));

        // Trigger TWO subsequent planned reconnects (conv_3 and conv_4) — the exact step where xAI previously lost memory!
        for (const nextConvId of ['conv_3', 'conv_4']) {
            const prevCount = client.Sockets.length;
            const reconnected = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(await reconnected).toBe(true);
            expect(client.Sockets.length).toBe(prevCount + 1);

            const sock = client.CurrentSocket;
            expect(sock.Url).not.toContain('conversation_id=');
            sock.onmessage?.(JSON.stringify({ type: 'conversation.created', conversation: { id: nextConvId } }));

            const allFrames = sock.Sent.join('\n');
            expect(allFrames).toContain('Remember project code 7788 and codename Borealis.');
            expect(allFrames).toContain('Confirmed: project code 7788 and codename Borealis.');
            expect(allFrames).toContain('Also include milestone M4 in the release checklist.');
            expect(allFrames).toContain('Assign Priya as release lead.');
            expect(allFrames).toContain('Section: Screen_10');
        }

        await client.Disconnect();
    });

    it('Simulation 3 (Explicit TrustNativeResumption: true): preserves handle across offline retry attempts, and latches to seed mode once an online handle rejection breaks native lineage', async () => {
        const client = new NetworkSimXAIClient();
        const { errors } = collect(client);
        let minted = 1;

        client.SetTokenRefreshCallback(async () => ({
            EphemeralToken: `tok-optin-${++minted}`,
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            TrustNativeResumption: true,
            SessionConfig: { instructions: 'Native resumption opt-in test' },
        }));

        const connectPromise = client.Connect(
            {
                Provider: 'xai',
                Model: 'grok-voice-latest',
                EphemeralToken: 'tok-optin-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                TrustNativeResumption: true,
                SessionConfig: { instructions: 'Native resumption opt-in test' },
            },
            new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        client.CurrentSocket.onmessage?.(JSON.stringify({ type: 'conversation.created', conversation: { id: 'conv_native_1' } }));
        client.CurrentSocket.onmessage?.(
            JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                item_id: 'u1',
                transcript: 'Secret passphrase Otter-99.',
            })
        );
        client.CurrentSocket.onmessage?.(
            JSON.stringify({
                type: 'response.output_audio_transcript.done',
                item_id: 'a1',
                transcript: 'Remembering Otter-99.',
            })
        );
        client.CurrentSocket.onmessage?.(JSON.stringify({ type: 'response.done' }));

        // Part A: 10s offline drop — failed offline attempts MUST NOT burn conv_native_1!
        client.Online = false;
        client.CurrentSocket.onclose?.();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(client.ResumptionHandle).toBe('conv_native_1');

        client.Online = true;
        await vi.advanceTimersByTimeAsync(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS);
        expect(errors).toEqual([]);
        expect(client.CurrentSocket.Url).toContain('conversation_id=conv_native_1');

        // Part B: Now conv_native_1 expires server-side while host IS online -> Attempt 1 fails, Attempt 2 seeds onto conv_seed_2.
        client.RejectConversationIds.add('conv_native_1');
        const fallbackSwap = client.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(5_000);
        expect(await fallbackSwap).toBe(true);

        const seededSocket = client.CurrentSocket;
        expect(seededSocket.Url).not.toContain('conversation_id=');
        expect(seededSocket.Sent.join('\n')).toContain('Secret passphrase Otter-99.');

        // Server assigns conv_seed_2 to the seeded session. Because native lineage was broken, the NEXT reconnect
        // MUST NOT natively resume conv_seed_2 (which would lose the text-seeded history on providers like xAI)!
        seededSocket.onmessage?.(JSON.stringify({ type: 'conversation.created', conversation: { id: 'conv_seed_2' } }));
        const nextSwap = client.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(100);
        expect(await nextSwap).toBe(true);

        expect(client.CurrentSocket.Url).not.toContain('conversation_id=');
        expect(client.CurrentSocket.Sent.join('\n')).toContain('Secret passphrase Otter-99.');

        await client.Disconnect();
    });

    it('Simulation 4 (AssemblyAIRealtimeClient system_prompt emulation): deduplicates StateKey notes, replaces Ephemeral progress notes, and avoids duplicate prompt notes across reconnects', async () => {
        const client = new SimAssemblyAIClient();
        let minted = 1;
        client.SetTokenRefreshCallback(async () => ({
            EphemeralToken: `aai-tok-${++minted}`,
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: { session: { system_prompt: 'Base AssemblyAI instructions.' } },
        }));

        const connectPromise = client.Connect(
            {
                Provider: 'assemblyai',
                Model: 'assemblyai-agent',
                EphemeralToken: 'aai-tok-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                SessionConfig: { session: { system_prompt: 'Base AssemblyAI instructions.' } },
            },
            new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream
        );
        await vi.advanceTimersByTimeAsync(5);
        await connectPromise;

        client.Sockets[0].onmessage?.(JSON.stringify({ type: 'transcript.user', text: 'Remember budget cap is $50k.' }));
        client.Sockets[0].onmessage?.(JSON.stringify({ type: 'transcript.agent', text: 'Budget cap noted at $50k.' }));
        client.Sockets[0].onmessage?.(JSON.stringify({ type: 'reply.done' }));

        for (let i = 1; i <= 5; i++) {
            client.SendContextNote(`[app-context] Delta screen ${i}`, {
                StateKey: 'app-context',
                MemoryText: `[app-context] Full snapshot screen ${i}`,
            });
            client.SendContextNote(`[delegated-agent progress] Step ${i}`, { Ephemeral: true });
        }
        client.SendContextNote('[durable-note] Escalation approved by VP.');

        const latestLivePrompt = client.Sockets[0].SentSystemPrompts().at(-1) ?? '';
        expect(latestLivePrompt).toContain('Full snapshot screen 5');
        expect(latestLivePrompt).not.toContain('Full snapshot screen 4');
        expect(latestLivePrompt).toContain('[delegated-agent progress] Step 5');
        expect(latestLivePrompt).not.toContain('[delegated-agent progress] Step 4');
        expect(latestLivePrompt).toContain('[durable-note] Escalation approved by VP.');

        // Reconnect #1
        const r1 = client.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(10);
        expect(await r1).toBe(true);

        const reconnect1Prompt = client.Sockets[1].SentSystemPrompts()[0] ?? '';
        expect(reconnect1Prompt).toContain('Remember budget cap is $50k.');
        expect(reconnect1Prompt).toContain('Full snapshot screen 5');
        expect(reconnect1Prompt).toContain('[durable-note] Escalation approved by VP.');
        expect(reconnect1Prompt).not.toContain('[delegated-agent progress]');
        // Durable note appears ONCE (in the rendered seed), not duplicated in Background updates!
        expect(reconnect1Prompt.split('[durable-note] Escalation approved by VP.')).toHaveLength(2);

        // Send one more screen update and Reconnect #2
        client.SendContextNote('[app-context] Delta screen 6', {
            StateKey: 'app-context',
            MemoryText: '[app-context] Full snapshot screen 6',
        });
        const r2 = client.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(10);
        expect(await r2).toBe(true);

        const reconnect2Prompt = client.Sockets[2].SentSystemPrompts()[0] ?? '';
        expect(reconnect2Prompt).toContain('Remember budget cap is $50k.');
        expect(reconnect2Prompt).toContain('Full snapshot screen 6');
        expect(reconnect2Prompt).not.toContain('Full snapshot screen 5');
        expect(reconnect2Prompt.split('[durable-note] Escalation approved by VP.')).toHaveLength(2);

        await client.Disconnect();
    });
});
