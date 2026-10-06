import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, type VideoSourceState } from '@memberjunction/ai-realtime-client';
import type { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import type { IMetadataProvider } from '@memberjunction/core';
import { RealtimeSessionRuntime, REALTIME_CAPTURES_OFF, type RealtimeCaptureStates, type StartRealtimeClientSessionResult } from '../index';
import { ShareHost, VideoClient } from './capture-test-helpers';

/** A video model's driver: it negotiates audio and inbound video when it connects. */
@RegisterClass(BaseRealtimeClient, 'capture-provider')
class CaptureProviderClient extends VideoClient {
    public override async Connect(_config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
        this.Negotiate(true);
    }
}

/** Answers the runtime's GraphQL relays with nothing. */
class QuietProvider {
    public readonly sessionId = 'transport-session-1';
    public async ExecuteGQL(): Promise<unknown> {
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

function mintedSession(): StartRealtimeClientSessionResult {
    return {
        AgentSessionId: 'session-1',
        ConversationId: 'conv-1',
        Provider: 'capture-provider',
        Model: 'video-model',
        EphemeralToken: 'token',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Video Model',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
    };
}

function build() {
    const host = new ShareHost();
    const runtime = new RealtimeSessionRuntime(host);
    runtime.Provider = new QuietProvider() as unknown as IMetadataProvider;
    const captures: RealtimeCaptureStates[] = [];
    runtime.Captures$.subscribe((c) => captures.push(c));
    let sources: readonly VideoSourceState[] = [];
    runtime.VideoSources$.subscribe((s) => (sources = s));
    return { host, runtime, captures, sources: () => sources };
}

describe('RealtimeSessionRuntime camera and screen share', () => {
    it('has neither outside a session, and says so when asked to start one', async () => {
        const { runtime, captures } = build();
        expect(captures).toEqual([REALTIME_CAPTURES_OFF]);
        expect(await runtime.StartCamera()).toEqual({ Status: 'failed', Failure: 'no-session', Message: 'There is no call to share with.' });
        expect(await runtime.StartScreenShare()).toMatchObject({ Status: 'failed', Failure: 'no-session' });
    });

    it('starts the camera in a live session through the host controller, and lists it as a source', async () => {
        const { host, runtime, captures, sources } = build();
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        const controller = host.Controllers[0];
        const state = await runtime.StartCamera('cam-1');
        expect(state).toEqual({ Status: 'on', Stream: controller.CameraStream });
        expect(captures[captures.length - 1].Camera.Status).toBe('on');
        expect(controller.StartCalls).toContainEqual(['camera', 'cam-1']);
        expect(sources().map((s) => s.SourceID)).toEqual(['capture:camera']);
        await runtime.EndRealtimeSession();
    });

    it('shares a screen through the host, and stops it on request', async () => {
        const { host, runtime, captures } = build();
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        expect(await runtime.StartScreenShare({ PreferredSurface: 'tab' })).toMatchObject({ Status: 'on', Surface: 'window' });
        expect(host.Requests).toEqual([{ PreferredSurface: 'tab' }]);
        runtime.StopScreenShare();
        expect(captures[captures.length - 1].Screen).toEqual({ Status: 'off' });
        await runtime.EndRealtimeSession();
    });

    it('stops both when the session ends, before releasing the controller', async () => {
        const { host, runtime, captures, sources } = build();
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        await runtime.StartCamera();
        await runtime.StartScreenShare();
        const controller = host.Controllers[0];
        await runtime.EndRealtimeSession();
        expect(captures[captures.length - 1]).toEqual(REALTIME_CAPTURES_OFF);
        expect(controller.StopCalls).toContain('camera');
        expect(controller.Disposed).toBe(true);
        expect(sources()).toEqual([]);
        expect(await runtime.StartCamera()).toMatchObject({ Failure: 'no-session' });
    });
});
