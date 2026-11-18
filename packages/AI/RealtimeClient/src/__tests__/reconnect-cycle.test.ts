import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import {
    BaseRealtimeClient,
    RealtimeClientError,
    RealtimeClientReconnectContext,
    RealtimeClientState,
    RefreshedRealtimeClientCredential,
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
    /** Whether a planned move's failed attempt goes back to the old connection, as the OpenAI and Gemini drivers do. */
    public ReturnsToOldConnection = false;
    public Returns = 0;

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
    /** Opens or ends the turn with no state report, as an OpenAI driver's `response.created` and `response.done` can. */
    public SetTurnOpenSilently(open: boolean): void {
        if (open) {
            this.reconnectController.TurnStarted();
        } else {
            this.reconnectController.TurnEnded();
        }
    }
    protected override ResumeOnOldConnection(): boolean {
        if (!this.ReturnsToOldConnection) {
            return false;
        }
        this.Returns++;
        const restore = this.StateToRestoreOnOldConnection;
        if (restore) {
            this.emitStateChange(restore);
        }
        return true;
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

        // A retry's refresh runs in the background and can land after its attempt connected on the old token. Nothing
        // re-armed the timers then, and the next proactive refresh was scheduled from the new token's expiry, so Google
        // closed the connection when the old token expired: a drop instead of a planned move.
        it('arms the move before the old token expires when the refresh lands after the attempt connected on it', async () => {
            vi.useFakeTimers();
            const startedAt = Date.now();
            const tokenLifetimeMs = 300_000;
            const client = new CycleStubClient();
            client.SingleUseToken = false;
            client.TokenBound = true;
            client.ApplySessionConfigTiming({
                Provider: 'test',
                Model: 'test-model',
                EphemeralToken: 'tok-initial',
                ExpiresAt: new Date(startedAt + tokenLifetimeMs).toISOString(),
                SessionConfig: { connectionMaxSeconds: 600, reconnectBufferSeconds: 10 },
            });
            client.SetTokenRefreshCallback(
                () =>
                    new Promise<RefreshedRealtimeClientCredential>((resolve) =>
                        setTimeout(() => resolve({ ...minted(1), SessionConfig: {} }), 800)
                    )
            );
            let attempts = 0;
            client.ReconnectImpl = async () => {
                attempts++;
                if (attempts === 1) {
                    throw new Error('websocket failed');
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            };
            client.ArmConnectionDurationTimer();
            const result = client.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(5_000);
            expect(await result).toBe(true);
            // Attempt 2 connected at 1.5 s on the old token; the refresh it started landed at 1.8 s.
            expect(client.ReconnectContexts[1].Credential.EphemeralToken).toBe('tok-initial');
            expect(client['currentCredential'].EphemeralToken).toBe('tok-refresh-1');

            await vi.advanceTimersByTimeAsync(startedAt + tokenLifetimeMs - 1 - Date.now());
            expect(client.ReconnectContexts).toHaveLength(3);
            expect(client.ReconnectContexts[2].Reason).toBe('duration-expiry');
            expect(client.ReconnectContexts[2].Credential.EphemeralToken).toBe('tok-refresh-1');
            await client.Disconnect();
        });
    });

    // Each return of a planned move to its old connection fired OnReconnecting again, which reset the cycle's refresh:
    // a provider refusing new connections for about 40 s cost 9 mints, and the server's per-session limit refused the
    // 10th and ended the call.
    describe('one credential refresh per reconnect cycle', () => {
        /** A client whose planned move goes back to the old connection while the provider refuses connections. */
        function plannedMoveRefusedFor(
            refusedMs: number,
            refresh: (count: number) => Promise<{ EphemeralToken: string; ExpiresAt: string }>,
            singleUseToken = false
        ): { client: CycleStubClient; errors: RealtimeClientError[]; refreshes: () => number } {
            const made = clientWith(refresh, singleUseToken);
            made.client.ReturnsToOldConnection = true;
            const refusedUntil = Date.now() + refusedMs;
            made.client.ReconnectImpl = async () => {
                if (Date.now() < refusedUntil) {
                    throw new Error('the provider refused the connection');
                }
            };
            made.client.ArmConnectionDurationTimer();
            return made;
        }

        it.each([
            ['a reusable token', false],
            ['a single-use token', true],
        ])('mints once with %s for a planned move that goes back to its old connection many times', async (_label, singleUse) => {
            vi.useFakeTimers();
            const { client, errors, refreshes } = plannedMoveRefusedFor(40_000, async (count) => minted(count), singleUse);
            const result = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(60_000);

            expect(await result).toBe(true);
            expect(errors).toEqual([]);
            expect(client.Returns).toBeGreaterThan(5);
            expect(refreshes()).toBe(1);
            expect(client.ReconnectContexts.at(-1)?.Credential.EphemeralToken).toBe('tok-refresh-1');
            await client.Disconnect();
        });

        it('re-mints a credential that has aged to near expiry while the call was back on its old connection', async () => {
            vi.useFakeTimers();
            // The cycle's refresh mints a token that lives 100 s; the cycle goes on for more than 40 s of that.
            const { client, refreshes } = plannedMoveRefusedFor(50_000, async (count) => ({
                EphemeralToken: `tok-refresh-${count}`,
                ExpiresAt: new Date(Date.now() + (count === 1 ? 100_000 : 1800_000)).toISOString(),
            }));
            const result = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(70_000);

            expect(await result).toBe(true);
            expect(refreshes()).toBe(2);
            expect(client.ReconnectContexts.at(-1)?.Credential.EphemeralToken).toBe('tok-refresh-2');
            await client.Disconnect();
        });

        it('does not count a refresh that landed after its cycle ended toward the next cycle', async () => {
            vi.useFakeTimers();
            const { client, refreshes } = clientWith(
                (count) => new Promise((resolve) => setTimeout(() => resolve(minted(count)), 800)),
                false
            );
            let failNext = 1;
            client.ReconnectImpl = async () => {
                if (failNext > 0) {
                    failNext--;
                    throw new Error('websocket failed');
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            };
            // The retry's refresh runs in the background and lands after the retry connected.
            const first = client.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(5_000);
            expect(await first).toBe(true);
            expect(refreshes()).toBe(1);

            failNext = 1;
            const second = client.TriggerReconnect('connection-lost');
            await vi.advanceTimersByTimeAsync(5_000);
            expect(await second).toBe(true);
            expect(refreshes()).toBe(2);
            await client.Disconnect();
        });
    });

    // OpenAI-protocol drivers leave 'speaking' silently when a tool call arrives, and its response.done ends the turn.
    // A failed move then restored 'speaking': the host was told the agent spoke during the tool run, and the report
    // opened a turn that held the next attempt until the last call.
    describe('the state a failed planned move reports again on its old connection', () => {
        function returningClient(): { client: CycleStubClient; states: RealtimeClientState[] } {
            const { client } = clientWith(async (count) => minted(count), false);
            client.ReturnsToOldConnection = true;
            const states: RealtimeClientState[] = [];
            client.OnStateChange((s) => states.push(s));
            client.ArmConnectionDurationTimer();
            return { client, states };
        }
        function failFirstAttempt(client: CycleStubClient, during?: () => void): void {
            let attempts = 0;
            client.ReconnectImpl = async () => {
                attempts++;
                if (attempts === 1) {
                    during?.();
                    throw new Error('the provider refused the connection');
                }
            };
        }
        function restored(states: RealtimeClientState[]): RealtimeClientState[] {
            return states.slice(states.lastIndexOf('connecting') + 1);
        }

        it('reports listening, not speaking, when the answer ended with no state report (a tool call)', async () => {
            vi.useFakeTimers();
            const { client, states } = returningClient();
            failFirstAttempt(client);
            client.EmitState('speaking');
            client.SetTurnOpenSilently(false);
            const result = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(restored(states)).toEqual(['listening']);
            expect(client['reconnectController'].IsTurnOpen).toBe(false);

            // No turn holds the next attempt: it goes after the retry delay, not at the last call.
            await vi.advanceTimersByTimeAsync(1_000);
            expect(client.ReconnectContexts).toHaveLength(2);
            expect(await result).toBe(true);
            await client.Disconnect();
        });

        it('reports speaking while the answer still goes on, and for one the old connection started meanwhile', async () => {
            vi.useFakeTimers();
            const answering = returningClient();
            failFirstAttempt(answering.client);
            answering.client.EmitState('speaking');
            void answering.client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(restored(answering.states)).toEqual(['speaking']);
            await answering.client.Disconnect();

            const started = returningClient();
            failFirstAttempt(started.client, () => started.client.SetTurnOpenSilently(true));
            started.client.EmitState('listening');
            void started.client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(restored(started.states)).toEqual(['speaking']);
            expect(started.client['reconnectController'].IsTurnOpen).toBe(true);
            await started.client.Disconnect();
        });

        it('reports listening, never connected, which the runtime would leave showing "Resuming"', async () => {
            vi.useFakeTimers();
            const { client, states } = returningClient();
            failFirstAttempt(client);
            client.EmitState('connected');
            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(restored(states)).toEqual(['listening']);
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

            const reconnected = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(1);
            expect(states.at(-1)).toBe('connecting');
            client.SendText('Please say the word banana.');
            expect(userTexts(oldChannel).join()).not.toContain('banana');

            client.FailHandshake();
            await vi.advanceTimersByTimeAsync(0);
            // Live again (reported as listening, never as the 'connected' the move replaced, which a host would leave
            // showing the move), then the text's reply takes the floor at once.
            expect(states.slice(states.lastIndexOf('connecting') + 1)).toEqual(['listening', 'speaking']);
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
