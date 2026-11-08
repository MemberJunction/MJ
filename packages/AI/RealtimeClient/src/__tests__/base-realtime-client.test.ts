import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import {
    BaseRealtimeClient,
    REQUESTED_TRACKS_SESSION_KEY,
    RealtimeClientError,
    RealtimeClientReconnectContext,
    RealtimeClientState,
    RealtimeClientToolCall,
    RealtimeClientTranscript,
    RealtimeClientUsage,
    ToProviderSessionConfig,
} from '../generic/baseRealtimeClient';
import type { MediaVideoSource } from '../media/model';
import { FakeMediaStream } from './helpers/realtime-fakes';

/**
 * Minimal concrete subclass exposing the protected emit helpers so the base-class
 * handler plumbing can be exercised without any provider wiring.
 */
class StubRealtimeClient extends BaseRealtimeClient {
    public Busy = false;
    public Playing = false;
    public ReconnectContexts: RealtimeClientReconnectContext[] = [];
    public ReconnectImpl: (ctx: RealtimeClientReconnectContext) => Promise<void> = async () => undefined;

    public async Connect(_config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
        /* not used in these tests */
    }
    public SendText(_text: string): void {}
    public SendContextNote(_text: string): void {}
    public RequestSpokenUpdate(_instructions: string): void {}
    public SendToolResult(callID: string, outputJson: string): void {
        this.recordToolResult(callID, outputJson);
    }
    public CancelActiveResponse(): void {}
    public SetMuted(_muted: boolean): void {}
    public async Disconnect(): Promise<void> {
        this.DisposeReconnectTimers();
    }
    public get IsBusy(): boolean {
        return this.Busy;
    }
    public get IsAudioPlaying(): boolean {
        return this.Playing;
    }

    protected override async Reconnect(context: RealtimeClientReconnectContext): Promise<void> {
        this.ReconnectContexts.push(context);
        await this.ReconnectImpl(context);
    }

    // expose the protected emit helpers
    public EmitTranscript(t: RealtimeClientTranscript): void {
        this.emitTranscript(t);
    }
    public EmitToolCall(c: RealtimeClientToolCall): void {
        this.emitToolCall(c);
    }
    public EmitState(s: RealtimeClientState): void {
        this.emitStateChange(s);
    }
    public EmitError(e: RealtimeClientError): void {
        this.emitError(e);
    }
    public EmitInterruption(): void {
        this.emitInterruption();
    }
    public EmitUsage(u: RealtimeClientUsage): void {
        this.emitUsage(u);
    }
    public EmitRemoteVideo(video: MediaVideoSource | MediaStream): void {
        this.emitRemoteVideo(video);
    }
    public Publish(s: MediaStream | null): void {
        this.publishRemoteMediaStream(s);
    }
    public Clear(): void {
        this.clearRemoteMediaStream();
    }
}

describe('BaseRealtimeClient', () => {
    describe('remote video', () => {
        it('hands a driver\'s plain stream on as a stream source', () => {
            const client = new StubRealtimeClient();
            const received: MediaVideoSource[] = [];
            client.OnRemoteVideo((video) => received.push(video));
            const stream = new FakeMediaStream([]);
            client.EmitRemoteVideo(stream);
            expect(received).toEqual([{ Kind: 'stream', Stream: stream }]);
        });

        it('hands a player that owns the element on as it is', () => {
            const client = new StubRealtimeClient();
            const received: MediaVideoSource[] = [];
            client.OnRemoteVideo((video) => received.push(video));
            const player: MediaVideoSource = { Kind: 'element', Attach: () => () => undefined };
            client.EmitRemoteVideo(player);
            expect(received).toEqual([player]);
            expect(received[0]).toBe(player);
        });
    });

    describe('handler plumbing', () => {
        it('should deliver transcripts to the registered handler', () => {
            const client = new StubRealtimeClient();
            const received: RealtimeClientTranscript[] = [];
            client.OnTranscript((t) => received.push(t));

            const transcript: RealtimeClientTranscript = { Role: 'Assistant', Text: 'hi', IsFinal: true, Kind: 'normal' };
            client.EmitTranscript(transcript);

            expect(received).toEqual([transcript]);
        });

        it('should deliver tool calls to the registered handler', () => {
            const client = new StubRealtimeClient();
            const received: RealtimeClientToolCall[] = [];
            client.OnToolCall((c) => received.push(c));

            client.EmitToolCall({ CallID: 'c1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"q":1}' });

            expect(received).toEqual([{ CallID: 'c1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"q":1}' }]);
        });

        it('should deliver state changes to the registered handler', () => {
            const client = new StubRealtimeClient();
            const states: RealtimeClientState[] = [];
            client.OnStateChange((s) => states.push(s));

            client.EmitState('connecting');
            client.EmitState('listening');

            expect(states).toEqual(['connecting', 'listening']);
        });

        it('should deliver errors to the registered handler', () => {
            const client = new StubRealtimeClient();
            const errors: RealtimeClientError[] = [];
            client.OnError((e) => errors.push(e));

            client.EmitError({ Message: 'boom', Code: 'x', Fatal: false });

            expect(errors).toEqual([{ Message: 'boom', Code: 'x', Fatal: false }]);
        });

        it('should deliver interruptions to the registered handler', () => {
            const client = new StubRealtimeClient();
            let fired = 0;
            client.OnInterruption(() => fired++);

            client.EmitInterruption();
            client.EmitInterruption();

            expect(fired).toBe(2);
        });

        it('should store a SINGLE handler — re-registering replaces the previous one', () => {
            const client = new StubRealtimeClient();
            const first: RealtimeClientState[] = [];
            const second: RealtimeClientState[] = [];
            client.OnStateChange((s) => first.push(s));
            client.OnStateChange((s) => second.push(s));

            client.EmitState('speaking');

            expect(first).toEqual([]);
            expect(second).toEqual(['speaking']);
        });

        it('should deliver usage updates (deltas) to the registered handler', () => {
            const client = new StubRealtimeClient();
            const received: RealtimeClientUsage[] = [];
            client.OnUsage((u) => received.push(u));

            client.EmitUsage({ InputTokens: 120, OutputTokens: 45, Raw: { input_tokens: 120 } });
            client.EmitUsage({ OutputTokens: 7 });

            expect(received).toEqual([
                { InputTokens: 120, OutputTokens: 45, Raw: { input_tokens: 120 } },
                { OutputTokens: 7 },
            ]);
        });

        it('should replace the usage handler on re-registration (single-handler style)', () => {
            const client = new StubRealtimeClient();
            const first: RealtimeClientUsage[] = [];
            const second: RealtimeClientUsage[] = [];
            client.OnUsage((u) => first.push(u));
            client.OnUsage((u) => second.push(u));

            client.EmitUsage({ InputTokens: 1, OutputTokens: 2 });

            expect(first).toEqual([]);
            expect(second).toEqual([{ InputTokens: 1, OutputTokens: 2 }]);
        });

        it('should be safe to emit with no handler registered', () => {
            const client = new StubRealtimeClient();
            expect(() => {
                client.EmitTranscript({ Role: 'User', Text: 'x', IsFinal: true, Kind: 'normal' });
                client.EmitToolCall({ CallID: 'c', ToolName: 't', ArgumentsJson: '{}' });
                client.EmitState('closed');
                client.EmitError({ Message: 'm', Fatal: true });
                client.EmitInterruption();
                client.EmitUsage({ InputTokens: 1 });
            }).not.toThrow();
        });
    });

    describe('remote media stream slot', () => {
        const fakeStream = (): MediaStream => ({ id: 'remote' }) as unknown as MediaStream;

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('is null before anything is published', () => {
            expect(new StubRealtimeClient().GetRemoteMediaStream()).toBeNull();
        });

        it('fires a handler registered BEFORE publish once, with the stream', () => {
            const client = new StubRealtimeClient();
            const received: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => received.push(s));
            const stream = fakeStream();
            client.Publish(stream);
            expect(received).toEqual([stream]);
            expect(client.GetRemoteMediaStream()).toBe(stream);
        });

        it('fires a handler registered AFTER publish immediately and synchronously', () => {
            const client = new StubRealtimeClient();
            const stream = fakeStream();
            client.Publish(stream);
            const received: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => received.push(s));
            expect(received).toEqual([stream]);
        });

        it('delivers to every registered handler', () => {
            const client = new StubRealtimeClient();
            const a: MediaStream[] = [];
            const b: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => a.push(s));
            client.OnRemoteMediaStream((s) => b.push(s));
            const stream = fakeStream();
            client.Publish(stream);
            expect(a).toEqual([stream]);
            expect(b).toEqual([stream]);
        });

        it('isolates a throwing handler: sibling still fires, nothing throws, console.warn is called', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const client = new StubRealtimeClient();
            const sibling: MediaStream[] = [];
            client.OnRemoteMediaStream(() => {
                throw new Error('host boom');
            });
            client.OnRemoteMediaStream((s) => sibling.push(s));
            expect(() => client.Publish(fakeStream())).not.toThrow();
            expect(sibling).toHaveLength(1);
            expect(warn).toHaveBeenCalled();

            // Late registration against an already-landed stream must isolate too.
            expect(() =>
                client.OnRemoteMediaStream(() => {
                    throw new Error('late boom');
                }),
            ).not.toThrow();
            expect(warn).toHaveBeenCalledTimes(2);
        });

        it('publish(null) sets null and fires nothing', () => {
            const client = new StubRealtimeClient();
            const received: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => received.push(s));
            client.Publish(null);
            expect(client.GetRemoteMediaStream()).toBeNull();
            expect(received).toHaveLength(0);
        });

        it('clear drops the stream AND the handlers, so a later publish reaches only new handlers', () => {
            const client = new StubRealtimeClient();
            const stale: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => stale.push(s));
            client.Publish(fakeStream());
            expect(stale).toHaveLength(1);

            client.Clear();
            expect(client.GetRemoteMediaStream()).toBeNull();

            const fresh: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => fresh.push(s));
            client.Publish(fakeStream());
            expect(stale).toHaveLength(1);
            expect(fresh).toHaveLength(1);
        });
    });

    describe('ToProviderSessionConfig and reconnect orchestration', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('strips REQUESTED_TRACKS_SESSION_KEY and all 4 shared timing/resumption keys from SessionConfig', () => {
            const cleaned = ToProviderSessionConfig({
                model: 'gpt-realtime-1.5',
                voice: 'alloy',
                [REQUESTED_TRACKS_SESSION_KEY]: [{ Modality: 'audio', Direction: 'inbound' }],
                connectionMaxSeconds: 600,
                sessionMaxSeconds: 3600,
                reconnectBufferSeconds: 30,
                trustNativeResumption: true,
            });
            expect(cleaned).toEqual({
                model: 'gpt-realtime-1.5',
                voice: 'alloy',
            });
        });

        it('records final normal turns (including ReplacesPrevious), tool calls, and tool results in ConversationMemory', () => {
            const client = new StubRealtimeClient();
            client.EmitTranscript({ Role: 'User', Text: 'First draft', IsFinal: true, Kind: 'normal' });
            client.EmitTranscript({
                Role: 'User',
                Text: 'Corrected question',
                IsFinal: true,
                Kind: 'normal',
                ReplacesPrevious: true,
            });
            client.EmitTranscript({ Role: 'Assistant', Text: 'Still working...', IsFinal: true, Kind: 'narration' });
            client.EmitToolCall({ CallID: 'call-1', ToolName: 'search_db', ArgumentsJson: '{"q":"mj"}' });
            client.SendToolResult('call-1', '{"count":3}');
            client.EmitTranscript({ Role: 'Assistant', Text: 'Found 3 records.', IsFinal: true, Kind: 'normal' });

            const seed = client.ConversationMemory.Seed();
            expect(seed.Entries).toEqual([
                { Kind: 'user', Text: 'Corrected question' },
                { Kind: 'toolCall', Name: 'search_db', ArgumentsJson: '{"q":"mj"}' },
                { Kind: 'toolResult', Name: 'search_db', OutputJson: '{"count":3}' },
                { Kind: 'assistant', Text: 'Found 3 records.' },
            ]);
        });

        it('refreshes credential and falls back from native resumption on Attempt 1 to ConversationSeed on Attempt 2', async () => {
            vi.useFakeTimers();
            const client = new StubRealtimeClient();
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok-initial',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                SessionConfig: {
                    connectionMaxSeconds: 600,
                    reconnectBufferSeconds: 30,
                    trustNativeResumption: true,
                },
            });
            client.RecordResumptionHandle('handle-abc');
            client.EmitTranscript({ Role: 'User', Text: 'Hello before reconnect', IsFinal: true, Kind: 'normal' });

            let refreshCount = 0;
            client.SetTokenRefreshCallback(async () => {
                refreshCount++;
                return {
                    EphemeralToken: `tok-refresh-${refreshCount}`,
                    ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                    SessionConfig: {},
                };
            });

            client.ReconnectImpl = async (ctx) => {
                if (ctx.Attempt === 1) {
                    throw new Error('Invalid resumption handle');
                }
            };

            const promise = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(1500);
            const ok = await promise;

            expect(ok).toBe(true);
            expect(refreshCount).toBe(2);
            expect(client.ReconnectContexts).toHaveLength(2);
            expect(client.ReconnectContexts[0].UseNativeResumption).toBe(true);
            expect(client.ReconnectContexts[0].ResumptionHandle).toBe('handle-abc');
            expect(client.ReconnectContexts[0].ConversationSeed).toBeNull();
            expect(client.ReconnectContexts[1].UseNativeResumption).toBe(false);
            expect(client.ReconnectContexts[1].ResumptionHandle).toBeNull();
            expect(client.ReconnectContexts[1].ConversationSeed?.Entries).toEqual([
                { Kind: 'user', Text: 'Hello before reconnect' },
            ]);
        });

        it('defers reconnect in the soft window while busy and triggers immediately when state becomes listening', async () => {
            vi.useFakeTimers();
            const client = new StubRealtimeClient();
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                SessionConfig: {
                    connectionMaxSeconds: 100,
                    reconnectBufferSeconds: 10,
                },
            });
            client.Busy = true;
            client.ArmConnectionDurationTimer();

            // Advance into the soft window (between 75s and 90s)
            await vi.advanceTimersByTimeAsync(80_000);
            expect(client.ReconnectContexts).toHaveLength(0);

            // Turn finishes -> state becomes listening -> triggers deferred reconnect
            client.Busy = false;
            client.EmitState('listening');
            await vi.advanceTimersByTimeAsync(10);

            expect(client.ReconnectContexts).toHaveLength(1);
            expect(client.ReconnectContexts[0].Reason).toBe('duration-expiry');
            await client.Disconnect();
        });
    });
});

