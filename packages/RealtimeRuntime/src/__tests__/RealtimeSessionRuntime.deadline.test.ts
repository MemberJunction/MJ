import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Observable, Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { SerializeRealtimeSessionEvent, type IdentityVerifiedEventPayload } from '@memberjunction/ai-core-plus';
import {
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type SessionEndReason,
    type StartRealtimeClientSessionResult,
} from '../index';

/**
 * The runtime's half of the deadline alarm (MJ#6182 item 1): `SetSessionDeadline` arms the clock,
 * the runtime re-publishes its warnings and its reach with the live session id, ends the call itself
 * with reason `'deadline'` unless the host opted out, and stamps `TimeLimit` on the server row.
 *
 * Same start/stop fixture shape as `RealtimeSessionRuntime.test.ts` (a driver that connects to
 * nothing, a provider that records every GraphQL call), plus the session-event subscription so the
 * `identity.verified` extension can be published. Real timers with short deadlines: the runtime's
 * own timers (liveness pulse, drain) stay real too, so nothing is half-faked.
 */

const SESSION = 'deadline-session-1';

@RegisterClass(BaseRealtimeClient, 'deadline-fake-provider')
class DeadlineFakeClient extends BaseRealtimeClient {
    public static DisconnectCalls = 0;
    public async Connect(): Promise<void> {
        this.emitStateChange('listening');
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {
        DeadlineFakeClient.DisconnectCalls++;
    }
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

class Host implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

/** Records every GraphQL call with its variables, and carries the session-event subscription. */
class DeadlineProvider {
    public readonly sessionId = 'transport-deadline-1';
    public Calls: Array<{ query: string; variables: Record<string, unknown> | undefined }> = [];
    public Streams: Subject<unknown>[] = [];
    public async ExecuteGQL(query: string, variables?: Record<string, unknown>): Promise<unknown> {
        this.Calls.push({ query, variables });
        if (query.includes('RealtimeSessionVerificationStatus')) {
            return { RealtimeSessionVerificationStatus: { Success: true, VerificationState: 'unverified' } };
        }
        return {};
    }
    public Subscribe(): Observable<unknown> {
        const stream = new Subject<unknown>();
        this.Streams.push(stream);
        return stream.asObservable();
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
    /** The `closeReason` of every `CloseAgentSession` the runtime sent, in order. */
    public get CloseReasons(): unknown[] {
        return this.Calls.filter((c) => c.query.includes('CloseAgentSession')).map((c) => c.variables?.['closeReason']);
    }
    public PublishVerified(payload: IdentityVerifiedEventPayload): void {
        const wire = SerializeRealtimeSessionEvent({ Type: 'identity.verified', AgentSessionID: SESSION, OccurredAt: '2030-01-01T00:00:00Z', Payload: payload });
        this.Streams[this.Streams.length - 1].next({ RealtimeSessionEvents: wire });
    }
}

function mintedSession(): StartRealtimeClientSessionResult {
    return {
        AgentSessionId: SESSION,
        ConversationId: 'conv-1',
        Provider: 'deadline-fake-provider',
        Model: 'model-1',
        EphemeralToken: 'token',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Fake Realtime',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
    };
}

async function startLive() {
    const runtime = new RealtimeSessionRuntime(new Host());
    const provider = new DeadlineProvider();
    runtime.Provider = provider as unknown as IMetadataProvider;
    const order: string[] = [];
    const ended: SessionEndReason[] = [];
    runtime.SessionDeadlineReached$.subscribe((e) => order.push(`reached:${e.sessionId}`));
    runtime.SessionEnded$.subscribe((e) => {
        order.push(`ended:${e.reason}`);
        ended.push(e.reason);
    });
    await runtime.StartRealtimeSessionFromResult(mintedSession());
    return { runtime, provider, order, ended };
}

const inMs = (ms: number): Date => new Date(Date.now() + ms);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `check` holds, at most `MAX_WAIT_MS`; fails with `what` when the cap is hit. */
async function waitUntil(check: () => boolean, what: string): Promise<void> {
    const MAX_WAIT_MS = 2000;
    const started = Date.now();
    while (!check()) {
        if (Date.now() - started > MAX_WAIT_MS) {
            throw new Error(`Timed out after ${MAX_WAIT_MS} ms waiting for ${what}`);
        }
        await sleep(5);
    }
}

describe('RealtimeSessionRuntime — session deadline alarm', () => {
    beforeEach(() => {
        DeadlineFakeClient.DisconnectCalls = 0;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('default options: Reached$ then SessionEnded$ deadline within 2 s, driver End once', async () => {
        const { runtime, order } = await startLive();
        runtime.SetSessionDeadline(inMs(50));
        await waitUntil(() => order.some((o) => o.startsWith('ended:')), 'the session to end');
        expect(order).toEqual([`reached:${SESSION}`, 'ended:deadline']);
        expect(DeadlineFakeClient.DisconnectCalls).toBe(1);
        expect(runtime.IsActive).toBe(false);
    });

    it('autoEnd false: Reached$ fires, session stays live, later End() reports explicit', async () => {
        const { runtime, order, ended } = await startLive();
        runtime.SetSessionDeadline(inMs(30), { autoEnd: false });
        await waitUntil(() => order.includes(`reached:${SESSION}`), 'the deadline to be reached');
        await sleep(30);
        expect(runtime.IsActive).toBe(true);
        expect(ended).toEqual([]);
        await runtime.EndRealtimeSession();
        expect(ended).toEqual(['explicit']);
    });

    it("End('deadline') reports deadline and closes the server session as TimeLimit", async () => {
        const { runtime, provider, ended } = await startLive();
        await runtime.EndRealtimeSession('deadline');
        expect(ended).toEqual(['deadline']);
        expect(provider.CloseReasons).toEqual(['TimeLimit']);
    });

    it('auto-end closes the server session as TimeLimit; explicit stays Explicit; error stays Error', async () => {
        const auto = await startLive();
        auto.runtime.SetSessionDeadline(inMs(20));
        await waitUntil(() => auto.ended.length > 0, 'the auto-end');
        expect(auto.provider.CloseReasons).toEqual(['TimeLimit']);

        const explicit = await startLive();
        await explicit.runtime.EndRealtimeSession();
        expect(explicit.provider.CloseReasons).toEqual(['Explicit']);

        const failed = await startLive();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // The runtime's own failure path: what a fatal driver error mid-call runs.
        await (failed.runtime as unknown as { endOnFailure(): Promise<void> }).endOnFailure();
        expect(failed.ended).toEqual(['error']);
        expect(failed.provider.CloseReasons).toEqual(['Error']);
    });

    it('a host End() from inside Reached$ is coalesced with the auto-end: one close, one end event', async () => {
        const { runtime, provider, ended } = await startLive();
        runtime.SessionDeadlineReached$.subscribe(() => void runtime.EndRealtimeSession());
        runtime.SetSessionDeadline(inMs(20));
        await waitUntil(() => ended.length > 0, 'the session to end');
        await sleep(20);
        expect(ended).toHaveLength(1);
        expect(provider.CloseReasons).toHaveLength(1);
        expect(DeadlineFakeClient.DisconnectCalls).toBe(1);
    });

    it('warning events carry the live sessionId', async () => {
        const { runtime } = await startLive();
        const warnings: Array<{ sessionId: string; remainingMs: number; deadline: Date }> = [];
        runtime.SessionDeadlineWarning$.subscribe((w) => warnings.push(w));
        const deadline = inMs(120);
        runtime.SetSessionDeadline(deadline, { autoEnd: false, warnBeforeMs: [100, 60] });
        await waitUntil(() => warnings.length === 2, 'both warnings');
        expect(warnings.map((w) => [w.sessionId, w.remainingMs])).toEqual([
            [SESSION, 100],
            [SESSION, 60],
        ]);
        expect(warnings[0].deadline.getTime()).toBe(deadline.getTime());
        await runtime.EndRealtimeSession();
    });

    it('session end clears the deadline and no late End fires', async () => {
        const { runtime, provider, order } = await startLive();
        runtime.SetSessionDeadline(inMs(60), { warnBeforeMs: [30] });
        const warned: string[] = [];
        runtime.SessionDeadlineWarning$.subscribe((w) => warned.push(w.sessionId));
        await runtime.EndRealtimeSession();
        expect(runtime.SessionDeadline).toBeNull();
        await sleep(100);
        expect(order).toEqual(['ended:explicit']);
        expect(warned).toEqual([]);
        expect(provider.CloseReasons).toEqual(['Explicit']);
    });

    it('identity.verified Extend keeps the options and re-arms', async () => {
        const { runtime, provider, order, ended } = await startLive();
        runtime.SetSessionDeadline(inMs(40), { autoEnd: false });
        const extended = inMs(120);
        provider.PublishVerified({
            VerifiedEmail: 'ada@example.com',
            VerifiedName: 'Ada',
            VerifiedAt: '2030-01-01T00:00:00Z',
            Method: 'code',
            MaxSessionDeadlineIso: extended.toISOString(),
        });
        expect(runtime.SessionDeadline?.getTime()).toBe(extended.getTime());
        await sleep(70);
        expect(order).toEqual([]); // the original deadline was replaced, not kept
        await waitUntil(() => order.includes(`reached:${SESSION}`), 'the extended deadline');
        await sleep(20);
        expect(ended).toEqual([]); // autoEnd: false survived the extension
        expect(runtime.IsActive).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('a deadline reached while the session is minted ends the call once it is minted', async () => {
        const runtime = new RealtimeSessionRuntime(new Host());
        const provider = new DeadlineProvider();
        runtime.Provider = provider as unknown as IMetadataProvider;
        const order: string[] = [];
        runtime.SessionDeadlineReached$.subscribe((e) => order.push(`reached:${e.sessionId}`));
        runtime.SessionEnded$.subscribe((e) => order.push(`ended:${e.reason}`));
        runtime.SetSessionDeadline(inMs(-1000));
        await sleep(20); // the clock's Reached$ fires now, before any session id exists
        expect(order).toEqual([]);
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        await waitUntil(() => order.some((o) => o.startsWith('ended:')), 'the session to end');
        await sleep(20);
        expect(order).toEqual([`reached:${SESSION}`, 'ended:deadline']);
        expect(provider.CloseReasons).toEqual(['TimeLimit']);
    });

    it('a deadline set again before the mint drops the pending reach', async () => {
        const runtime = new RealtimeSessionRuntime(new Host());
        runtime.Provider = new DeadlineProvider() as unknown as IMetadataProvider;
        const order: string[] = [];
        runtime.SessionDeadlineReached$.subscribe((e) => order.push(`reached:${e.sessionId}`));
        runtime.SessionEnded$.subscribe((e) => order.push(`ended:${e.reason}`));
        runtime.SetSessionDeadline(inMs(-1000));
        await sleep(20);
        runtime.SetSessionDeadline(inMs(60_000));
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        await sleep(40);
        expect(order).toEqual([]);
        expect(runtime.IsActive).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('a host that extends the deadline inside Reached$ is not ended', async () => {
        const { runtime, order, ended } = await startLive();
        runtime.SessionDeadlineReached$.subscribe(() => runtime.SetSessionDeadline(inMs(60_000)));
        runtime.SetSessionDeadline(inMs(20));
        await waitUntil(() => order.includes(`reached:${SESSION}`), 'the deadline to be reached');
        await sleep(30);
        expect(ended).toEqual([]);
        expect(runtime.IsActive).toBe(true);
        await runtime.EndRealtimeSession();
        expect(ended).toEqual(['explicit']);
    });

    it('EndRealtimeSession given a non-reason (a JS caller passing an event object) ends as explicit', async () => {
        const { runtime, provider, ended } = await startLive();
        const click = { type: 'click' } as unknown as 'explicit';
        await runtime.EndRealtimeSession(click);
        expect(ended).toEqual(['explicit']);
        expect(provider.CloseReasons).toEqual(['Explicit']);
    });

    it('Reached$ with no live session emits nothing and ends nothing', async () => {
        const runtime = new RealtimeSessionRuntime(new Host());
        const reached: string[] = [];
        const ended: string[] = [];
        runtime.SessionDeadlineReached$.subscribe((e) => reached.push(e.sessionId));
        runtime.SessionEnded$.subscribe((e) => ended.push(e.reason));
        runtime.SetSessionDeadline(inMs(10));
        await sleep(40);
        expect(reached).toEqual([]);
        expect(ended).toEqual([]);
    });
});
