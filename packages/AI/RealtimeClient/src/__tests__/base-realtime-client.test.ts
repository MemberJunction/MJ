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

/** A client whose connections close when the credential they opened on expires, as Gemini's ephemeral-token ones do. */
class TokenBoundStubClient extends StubRealtimeClient {
    protected override ConnectionClosesAtCredentialExpiry(): boolean {
        return true;
    }
    // A Gemini token opens several connections, so the move uses the token the proactive refresh minted.
    protected override get RequiresFreshTokenPerReconnect(): boolean {
        return false;
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

        it('reads the typed SessionMaxSeconds the server stamps, not only the host-cap MaxSessionSeconds (F1)', () => {
            const client = new StubRealtimeClient();
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 45,
                SessionMaxSeconds: 1200,
                ReconnectBufferSeconds: 7,
                TrustNativeResumption: false,
                SessionConfig: {},
            });
            expect(client['configuredSessionMaxSeconds']).toBe(1200);
            expect(client.CallDurationSeconds).toBe(45);
            expect(client.ReconnectBufferSeconds).toBe(7);
            expect(client.TrustsNativeResumption).toBe(false);
        });

        it('applies the timing a refreshed credential carries (F1)', async () => {
            const client = new StubRealtimeClient();
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                TrustNativeResumption: true,
                SessionConfig: {},
            });
            client.SetTokenRefreshCallback(async () => ({
                EphemeralToken: 'tok-2',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 45,
                SessionMaxSeconds: 1200,
                ReconnectBufferSeconds: 7,
                TrustNativeResumption: false,
            }));
            await client['refreshCredentialForReconnect']();
            expect(client.CallDurationSeconds).toBe(45);
            expect(client['configuredSessionMaxSeconds']).toBe(1200);
            expect(client.ReconnectBufferSeconds).toBe(7);
            expect(client.TrustsNativeResumption).toBe(false);
            await client.Disconnect();
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
            expect(refreshCount).toBe(1);
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

        /** A client mid-call, whose refresh callback takes `refreshMs` (fake time) and counts its calls. */
        function clientWithSlowRefresh(refreshMs: number): { client: StubRealtimeClient; refreshCount: () => number } {
            const client = new StubRealtimeClient();
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok-initial',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                SessionConfig: { connectionMaxSeconds: 600, reconnectBufferSeconds: 30 },
            });
            let count = 0;
            client.SetTokenRefreshCallback(async () => {
                count++;
                const token = `tok-refresh-${count}`;
                await new Promise((resolve) => setTimeout(resolve, refreshMs));
                return { EphemeralToken: token, ExpiresAt: new Date(Date.now() + 600_000).toISOString(), SessionConfig: {} };
            });
            return { client, refreshCount: () => count };
        }

        it('does not count a slow credential refresh against the transport attempt timeout, nor refresh twice (F5)', async () => {
            vi.useFakeTimers();
            const { client, refreshCount } = clientWithSlowRefresh(20_000);
            const abandonedAtStart: boolean[] = [];
            client.ReconnectImpl = async (ctx) => {
                abandonedAtStart.push(ctx.Abandoned);
                await new Promise((resolve) => setTimeout(resolve, 500));
            };

            const startedAt = Date.now();
            let settledAt: number | null = null;
            const promise = client.TriggerReconnect('connection-lost').then((ok) => {
                settledAt = Date.now();
                return ok;
            });
            await vi.advanceTimersByTimeAsync(60_000);

            expect(await promise).toBe(true);
            expect(refreshCount()).toBe(1);
            // One Reconnect, on a live attempt, with the token the single refresh minted.
            expect(abandonedAtStart).toEqual([false]);
            expect(client.ReconnectContexts[0].Credential.EphemeralToken).toBe('tok-refresh-1');
            // Done by refresh time + connect time; the second attempt's retry delay hides inside the refresh.
            expect(settledAt! - startedAt).toBeLessThanOrEqual(20_000 + 500);
            await client.Disconnect();
        });

        it('never starts a Reconnect for an attempt abandoned while its credential refresh was in flight (F5)', async () => {
            vi.useFakeTimers();
            // Outlasts every attempt's refresh budget: the cycle fails, then the refresh resolves late.
            const { client, refreshCount } = clientWithSlowRefresh(120_000);

            const promise = client.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(200_000);

            expect(await promise).toBe(false);
            expect(refreshCount()).toBe(1);
            expect(client.ReconnectContexts).toHaveLength(0);
            await client.Disconnect();
        });

        /** A client mid-call on a 600 s connection, whose token refresh fails until `failUntilMs()`. */
        function clientWithFailingRefresh(failUntilMs: () => number): { client: StubRealtimeClient; errors: RealtimeClientError[] } {
            const client = new StubRealtimeClient();
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok-initial',
                ExpiresAt: new Date(Date.now() + 1800_000).toISOString(),
                SessionConfig: { connectionMaxSeconds: 600, reconnectBufferSeconds: 10 },
            });
            let count = 0;
            client.SetTokenRefreshCallback(async () => {
                count++;
                if (Date.now() < failUntilMs()) {
                    throw new Error('refresh failed: server unavailable');
                }
                return { EphemeralToken: `tok-refresh-${count}`, ExpiresAt: new Date(Date.now() + 1800_000).toISOString(), SessionConfig: {} };
            });
            const errors: RealtimeClientError[] = [];
            client.OnError((e) => errors.push(e));
            return { client, errors };
        }

        // Live (#6462 smoke, F10, A6/A9/R6): the timed move starts with up to 40 s left on a healthy connection. Three
        // refresh failures in 4 s ended the call, instead of retrying on the old connection before the provider limit.
        it('does not end the call when the refresh fails for 5 s at a timed move on a healthy connection (F10)', async () => {
            vi.useFakeTimers();
            let failUntil = Number.POSITIVE_INFINITY;
            const { client, errors } = clientWithFailingRefresh(() => failUntil);
            client.ArmConnectionDurationTimer();
            await vi.advanceTimersByTimeAsync(560_000); // the soft window opens
            failUntil = Date.now() + 5000;
            await vi.advanceTimersByTimeAsync(20_000);

            expect(errors).toEqual([]);
            expect(client.ReconnectContexts).toHaveLength(1);
            expect(client.ReconnectContexts[0].Reason).toBe('duration-expiry');
            expect(client.ReconnectContexts[0].Credential.EphemeralToken).toMatch(/^tok-refresh-/);
            await client.Disconnect();
        });

        // Live (#6462 smoke, F10, N1/EX-cut10): a 10 s network cut ended the call at ~4 s with reconnect-failed.
        it('recovers from a 10 s outage on a lost connection (F10)', async () => {
            vi.useFakeTimers();
            const outageEnds = Date.now() + 10_000;
            const { client, errors } = clientWithFailingRefresh(() => outageEnds);
            client.ReconnectImpl = async () => {
                if (Date.now() < outageEnds) {
                    throw new Error('websocket failed');
                }
            };
            const result = client.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(20_000);

            expect(await result).toBe(true);
            expect(errors).toEqual([]);
            await client.Disconnect();
        });

        it('retries at once on a browser online event, and stops listening once resumed (F10)', async () => {
            vi.useFakeTimers();
            const fakeWindow = new EventTarget();
            vi.stubGlobal('window', fakeWindow);
            try {
                let networkUp = false;
                const { client } = clientWithFailingRefresh(() => 0);
                client.ReconnectImpl = async () => {
                    if (!networkUp) {
                        throw new Error('websocket failed');
                    }
                };
                const result = client.TriggerReconnect('connection-lost');
                await vi.advanceTimersByTimeAsync(4_500); // attempts at 0, 1 and 4 s failed; the next waits 5 s
                const attemptsBefore = client.ReconnectContexts.length;
                networkUp = true;
                fakeWindow.dispatchEvent(new Event('online'));
                await vi.advanceTimersByTimeAsync(0);

                expect(client.ReconnectContexts).toHaveLength(attemptsBefore + 1);
                expect(await result).toBe(true);
                // Resumed: a later online event finds no listener and starts nothing.
                fakeWindow.dispatchEvent(new Event('online'));
                await vi.advanceTimersByTimeAsync(0);
                expect(client.ReconnectContexts).toHaveLength(attemptsBefore + 1);
                await client.Disconnect();
            } finally {
                vi.unstubAllGlobals();
            }
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

        it('keeps waiting for the post-tool turn when a non-blocking tool result is sent while the model is still speaking (#30)', async () => {
            vi.useFakeTimers();
            const client = new StubRealtimeClient();
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                TrustNativeResumption: false,
                SessionConfig: {
                    connectionMaxSeconds: 100,
                    reconnectBufferSeconds: 10,
                },
            });
            client.ArmConnectionDurationTimer();

            // Model starts speaking and emits a non-blocking tool call
            client.Busy = true;
            client.EmitState('speaking');
            client.EmitToolCall({ CallID: 'nb-1', ToolName: 'lookup_fast', ArgumentsJson: '{}' });

            // Advance into the soft window (80s) while still speaking
            await vi.advanceTimersByTimeAsync(80_000);
            expect(client.ReconnectContexts).toHaveLength(0);

            // Tool result is sent while the model is still speaking
            client.SendToolResult('nb-1', '{"ok":true}');

            // The pre-tool speaking turn finishes -> state transitions to listening.
            // Because the tool result was sent during that turn, the client must wait for the post-tool turn!
            client.Busy = false;
            client.EmitState('listening');
            await vi.advanceTimersByTimeAsync(100);
            expect(client.ReconnectContexts).toHaveLength(0);

            // Now the model's post-tool reply turn starts and finishes -> reconnect fires
            client.Busy = true;
            client.EmitState('speaking');
            await vi.advanceTimersByTimeAsync(100);
            expect(client.ReconnectContexts).toHaveLength(0);

            client.Busy = false;
            client.EmitState('listening');
            await vi.advanceTimersByTimeAsync(10);
            expect(client.ReconnectContexts).toHaveLength(1);
            expect(client.ReconnectContexts[0].Reason).toBe('duration-expiry');
            await client.Disconnect();
        });

        // Live (#6462 smoke, F14, L1): a Gemini connection opened on an ephemeral token is closed by Google when that
        // token expires ("1011 auth token has expired"), even after the client refreshed the token. The client dropped
        // at the token's expiry instead of moving onto the fresh token in a planned, turn-aware move before it.
        describe('a connection that closes when its credential expires (F14)', () => {
            const TOKEN_LIFETIME_MS = 300_000;

            /** A client on a 600 s connection whose credential expires after 300 s; each refresh mints a 30-minute token. */
            function clientWithExpiringToken(boundToToken: boolean, refresh?: () => Promise<void>): StubRealtimeClient {
                const client = boundToToken ? new TokenBoundStubClient() : new StubRealtimeClient();
                client.ApplySessionConfigTiming({
                    Provider: 'test',
                    Model: 'test-model',
                    EphemeralToken: 'tok-initial',
                    ExpiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString(),
                    SessionConfig: { connectionMaxSeconds: 600, reconnectBufferSeconds: 10 },
                });
                let count = 0;
                client.SetTokenRefreshCallback(async () => {
                    await refresh?.();
                    count++;
                    return { EphemeralToken: `tok-refresh-${count}`, ExpiresAt: new Date(Date.now() + 1800_000).toISOString(), SessionConfig: {} };
                });
                client.ArmConnectionDurationTimer();
                return client;
            }

            it('moves onto the refreshed token before the old one expires, not at the connection limit', async () => {
                vi.useFakeTimers();
                const startedAt = Date.now();
                const client = clientWithExpiringToken(true);
                await vi.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS - 1);

                expect(client.ReconnectContexts).toHaveLength(1);
                expect(client.ReconnectContexts[0].Reason).toBe('duration-expiry');
                expect(client.ReconnectContexts[0].Credential.EphemeralToken).toBe('tok-refresh-1');
                // Planned after the refresh (60 s before expiry), at the soft window, not at the last moment.
                expect(Date.now() - startedAt).toBeLessThan(TOKEN_LIFETIME_MS);
                await client.Disconnect();
            });

            it('waits for an answer in progress, but moves before the old token expires', async () => {
                vi.useFakeTimers();
                const client = clientWithExpiringToken(true);
                await vi.advanceTimersByTimeAsync(250_000);
                client.EmitState('speaking'); // the answer runs past the expiry
                await vi.advanceTimersByTimeAsync(30_000);
                expect(client.ReconnectContexts).toHaveLength(0); // the turn holds the move past the soft window

                await vi.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS - 280_000 - 1);
                expect(client.ReconnectContexts).toHaveLength(1);
                await client.Disconnect();
            });

            it('moves at the end of the answer when it ends inside the window', async () => {
                vi.useFakeTimers();
                const client = clientWithExpiringToken(true);
                await vi.advanceTimersByTimeAsync(250_000);
                client.EmitState('speaking');
                await vi.advanceTimersByTimeAsync(20_000);
                expect(client.ReconnectContexts).toHaveLength(0);
                client.EmitState('listening');
                await vi.advanceTimersByTimeAsync(0);
                expect(client.ReconnectContexts).toHaveLength(1);
                await client.Disconnect();
            });

            it('does not move a connection that outlives its credential (OpenAI, xAI)', async () => {
                vi.useFakeTimers();
                const client = clientWithExpiringToken(false);
                await vi.advanceTimersByTimeAsync(500_000);
                expect(client.ReconnectContexts).toHaveLength(0);
                await client.Disconnect();
            });

            it('does not move when the refresh fails: there is no newer token to move onto', async () => {
                vi.useFakeTimers();
                const client = clientWithExpiringToken(true, async () => {
                    throw new Error('refresh failed: server unavailable');
                });
                await vi.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS - 1);
                expect(client.ReconnectContexts).toHaveLength(0);
                await client.Disconnect();
            });
        });
    });
});
