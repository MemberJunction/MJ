import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import {
    BaseRealtimeClient,
    RealtimeClientError,
    RealtimeClientReconnectContext,
    RealtimeClientState,
} from '../generic/baseRealtimeClient';
import { IRealtimeAudioSink, IRealtimePeerConnection, OpenAIRealtimeClient } from '../drivers/openAIRealtimeClient';
import { FakeAudioSink, FakeDataChannel, FakeMediaStream, FakePeerConnection, FakeTrack } from './helpers/realtime-fakes';

/**
 * The client half of a reconnect cycle: what an attempt's preparation waits for (the credential refresh, #31) and which
 * credential the new connection is tracked against (F14, #38). Transport work is a scripted `Reconnect`.
 */
class CycleStubClient extends BaseRealtimeClient {
    public ReconnectContexts: RealtimeClientReconnectContext[] = [];
    public ReconnectImpl: (ctx: RealtimeClientReconnectContext) => Promise<void> = async () => undefined;
    public SingleUseToken = true;
    public TokenBound = false;

    public async Connect(_config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
        /* not used */
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
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
    public EmitState(s: RealtimeClientState): void {
        this.emitStateChange(s);
    }
    protected override get RequiresFreshTokenPerReconnect(): boolean {
        return this.SingleUseToken;
    }
    protected override ConnectionClosesAtCredentialExpiry(): boolean {
        return this.TokenBound;
    }
    protected override async Reconnect(context: RealtimeClientReconnectContext): Promise<void> {
        this.ReconnectContexts.push(context);
        await this.ReconnectImpl(context);
    }
}

/** A client mid-call with a valid 30-minute credential, whose refresh callback is `refresh`. */
function clientWith(
    refresh: (count: number) => Promise<{ EphemeralToken: string; ExpiresAt: string }>,
    singleUseToken: boolean
): { client: CycleStubClient; errors: RealtimeClientError[]; refreshes: () => number } {
    const client = new CycleStubClient();
    client.SingleUseToken = singleUseToken;
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
        const minted = await refresh(count);
        return { ...minted, SessionConfig: {} };
    });
    const errors: RealtimeClientError[] = [];
    client.OnError((e) => errors.push(e));
    return { client, errors, refreshes: () => count };
}

const NEVER_SETTLES = new Promise<never>(() => undefined);

function minted(count: number): { EphemeralToken: string; ExpiresAt: string } {
    return { EphemeralToken: `tok-refresh-${count}`, ExpiresAt: new Date(Date.now() + 1800_000).toISOString() };
}

describe('BaseRealtimeClient reconnect cycle', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    describe('a credential refresh that never returns (#31)', () => {
        // The retry's refresh is optional when the credential is still valid and reusable: the attempt must not wait on
        // it. A request sent into a dead HTTP/2 connection during the outage never settles.
        it('does not hold a retry on a hung optional refresh while the credential is still valid', async () => {
            vi.useFakeTimers();
            const { client, errors } = clientWith(() => NEVER_SETTLES, false);
            const outageEnds = Date.now() + 2_000;
            client.ReconnectImpl = async () => {
                if (Date.now() < outageEnds) {
                    throw new Error('websocket failed');
                }
            };
            const startedAt = Date.now();
            let settledAt = 0;
            const result = client.TriggerReconnect('connection-lost').then((ok) => {
                settledAt = Date.now();
                return ok;
            });
            await vi.advanceTimersByTimeAsync(60_000);

            expect(await result).toBe(true);
            expect(errors).toEqual([]);
            // Attempts at 0 s and 1 s fail on the outage; the one at 4 s connects with the still-valid credential.
            expect(settledAt - startedAt).toBeLessThanOrEqual(4_000);
            expect(client.ReconnectContexts.at(-1)?.Credential.EphemeralToken).toBe('tok-initial');
            await client.Disconnect();
        });

        // A single-use credential must be re-minted, so the attempt waits for the refresh; but a refresh that has
        // outlived its own attempt and the next one is not joined again: a new request goes out.
        it('sends a new refresh instead of joining one that has outlived two attempts', async () => {
            vi.useFakeTimers();
            const { client, errors, refreshes } = clientWith(
                (count) => (count === 1 ? NEVER_SETTLES : Promise.resolve(minted(count))),
                true
            );
            const result = client.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(60_000);

            expect(await result).toBe(true);
            expect(errors).toEqual([]);
            expect(refreshes()).toBe(2);
            expect(client.ReconnectContexts).toHaveLength(1);
            expect(client.ReconnectContexts[0].Credential.EphemeralToken).toBe('tok-refresh-2');
            await client.Disconnect();
        });

        it('still joins a slow refresh from the attempt before, so a slow server is not asked twice (F5)', async () => {
            vi.useFakeTimers();
            const { client, refreshes } = clientWith(
                (count) => new Promise((resolve) => setTimeout(() => resolve(minted(count)), 20_000)),
                true
            );
            const result = client.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(25_000);

            expect(await result).toBe(true);
            expect(refreshes()).toBe(1);
            await client.Disconnect();
        });
    });

    describe('the credential a move opened on (F14, #38)', () => {
        it('tracks the credential the attempt opened on, not one a scheduled refresh minted while it was opening', async () => {
            vi.useFakeTimers();
            // The refresh mints a token that outlives the one the call opened on.
            const { client } = clientWith(
                async (count) => ({ EphemeralToken: `tok-refresh-${count}`, ExpiresAt: new Date(Date.now() + 3600_000).toISOString() }),
                false
            );
            client.TokenBound = true;
            client.ReconnectImpl = async () => {
                // The scheduled refresh lands while the new connection is opening on the token it was handed.
                await client['refreshCredentialForReconnect']();
            };
            const result = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(await result).toBe(true);

            const openedOn = client.ReconnectContexts[0].Credential.EphemeralToken;
            expect(client['connectionCredential'].EphemeralToken).toBe(openedOn);
            // The newer token outlives the one the connection opened on, so the move before that expiry is planned.
            expect(client['connectionDeadlineAtMs']()).toBe(Date.parse(client.ReconnectContexts[0].Credential.ExpiresAt));
            // The attempt spent a use of the token it opened on, not of the one minted after it started.
            expect(client['connectionsOnCredential']).toBe(0);
            await client.Disconnect();
        });

        it('tracks the credential a driver re-minted inside its own Reconnect', async () => {
            vi.useFakeTimers();
            const { client } = clientWith(async (count) => minted(count), false);
            client.TokenBound = true;
            let reminted = '';
            client.ReconnectImpl = async (ctx) => {
                reminted = (await ctx.RefreshCredential()).EphemeralToken;
            };
            const result = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(await result).toBe(true);

            expect(client['connectionCredential'].EphemeralToken).toBe(reminted);
            expect(client['connectionsOnCredential']).toBe(1);
            await client.Disconnect();
        });
    });

    // #34: typed text was held for the whole cycle after a failed planned attempt, and dropped if the cycle failed.
    describe('OpenAI: a failed planned attempt goes back to the old data channel (#34)', () => {
        /** An OpenAI client whose first reconnect handshake waits for the test, then fails. */
        class FailingMoveOpenAIClient extends OpenAIRealtimeClient {
            public PeerConnections: FakePeerConnection[] = [];
            private failHandshake: ((error: Error) => void) | null = null;
            protected override createPeerConnection(): IRealtimePeerConnection {
                const pc = new FakePeerConnection();
                this.PeerConnections.push(pc);
                queueMicrotask(() => pc.Channel.Open());
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                return new FakeAudioSink();
            }
            protected override async postSdpOffer(): Promise<string> {
                if (this.PeerConnections.length === 2) {
                    await new Promise<void>((_resolve, reject) => {
                        this.failHandshake = reject;
                    });
                }
                return 'FAKE_ANSWER_SDP';
            }
            public FailHandshake(): void {
                this.failHandshake?.(new Error('SDP exchange failed'));
                this.failHandshake = null;
            }
        }

        function userTexts(channel: FakeDataChannel): string[] {
            return channel
                .SentEvents()
                .filter((e) => e.type === 'conversation.item.create' && e.item?.role === 'user')
                .map((e) => JSON.stringify(e.item));
        }

        it('reports the call live again and sends the text held for the move on the old channel', async () => {
            vi.useFakeTimers();
            const client = new FailingMoveOpenAIClient();
            const states: RealtimeClientState[] = [];
            client.OnStateChange((s) => states.push(s));
            const connected = client.Connect(
                {
                    Provider: 'openai',
                    Model: 'gpt-realtime-2.1',
                    EphemeralToken: 'tok-34',
                    ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                    SessionConfig: { type: 'realtime', instructions: 'System prompt', connectionMaxSeconds: 600 },
                },
                new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream
            );
            await vi.advanceTimersByTimeAsync(1);
            await connected;
            const oldChannel = client.PeerConnections[0].Channel;

            const stateBeforeMove = states.at(-1);
            const reconnected = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(1);
            expect(states.at(-1)).toBe('connecting');
            client.SendText('Please say the word banana.');
            expect(userTexts(oldChannel).join()).not.toContain('banana');

            client.FailHandshake();
            await vi.advanceTimersByTimeAsync(0);
            // Live again in the state the move replaced, then the text's reply takes the floor at once.
            expect(states.slice(states.lastIndexOf('connecting') + 1)).toEqual([stateBeforeMove, 'speaking']);
            expect(userTexts(oldChannel).join()).toContain('banana');
            expect(oldChannel.readyState).toBe('open');

            // The text started a reply on the old channel: the next attempt waits for it to end.
            oldChannel.EmitServer({ type: 'response.created', response: { id: 'r1' } });
            await vi.advanceTimersByTimeAsync(5_000);
            expect(client.PeerConnections).toHaveLength(2);
            oldChannel.EmitServer({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
            await vi.advanceTimersByTimeAsync(10);
            expect(client.PeerConnections).toHaveLength(3);
            expect(await reconnected).toBe(true);
            await client.Disconnect();
        });
    });
});
