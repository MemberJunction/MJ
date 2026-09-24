import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for the React Native realtime driver layer.
 *
 * What these cover is the decision surface — which providers this build can carry audio for, that
 * the RN drivers are the ones the shared runtime actually resolves, and that the host's microphone
 * acquisition and release order their platform calls correctly. What they deliberately do NOT cover
 * is the WebRTC negotiation itself: that is `react-native-webrtc` talking to a real provider, and a
 * mocked peer connection would prove only that the mock works. Live audio is verified on a device.
 */
const state = vi.hoisted(() => ({
    permissionGranted: true,
    sessionConfigured: false,
    streamOrNull: {} as unknown,
    calls: [] as string[],
}));

vi.mock('react-native-webrtc', () => ({
    RTCPeerConnection: class {},
    registerGlobals: () => {
        state.calls.push('registerGlobals');
    },
    mediaDevices: {
        getUserMedia: async () => {
            state.calls.push('getUserMedia');
            return state.streamOrNull;
        },
    },
}));

vi.mock('@/voice/rn-audio-adapter', () => ({
    RequestMicrophonePermission: async () => {
        state.calls.push('permission');
        return state.permissionGranted;
    },
    ConfigureVoiceAudioSession: async () => {
        state.calls.push('audioSession');
        state.sessionConfigured = true;
    },
    ResetVoiceAudioSession: async () => {
        state.calls.push('resetAudioSession');
        state.sessionConfigured = false;
    },
}));

import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import {
    IsRealtimeProviderSupported,
    SupportedRealtimeProviders,
    RNOpenAILiveClient,
    RNOpenAIRealtimeClient,
} from '@/voice/rn-realtime-driver';
import { RNRealtimeMediaHost } from '@/voice/rn-media-host';

describe('IsRealtimeProviderSupported', () => {
    it('accepts the WebRTC providers this build ships a driver for', () => {
        expect(IsRealtimeProviderSupported('openai-live')).toBe(true);
        expect(IsRealtimeProviderSupported('openai')).toBe(true);
    });

    it('rejects the PCM-over-WebSocket providers, which need an audio plane this build lacks', () => {
        // Saying so up front lets the UI explain itself instead of opening a silent session.
        expect(IsRealtimeProviderSupported('gemini')).toBe(false);
        expect(IsRealtimeProviderSupported('elevenlabs')).toBe(false);
        expect(IsRealtimeProviderSupported('assemblyai')).toBe(false);
    });

    it('rejects Grok Voice, which speaks the OpenAI protocol but over a PCM websocket', () => {
        // The name is the trap: `xAIRealtimeClient` derives from the websocket+PCM base, not from
        // the WebRTC drivers this file overrides, so it constructs an `AudioContext` under Hermes.
        expect(IsRealtimeProviderSupported('xai')).toBe(false);
        expect(SupportedRealtimeProviders).not.toContain('xai');
    });

    it('treats an absent provider as unsupported rather than throwing', () => {
        expect(IsRealtimeProviderSupported(null)).toBe(false);
        expect(IsRealtimeProviderSupported(undefined)).toBe(false);
        expect(IsRealtimeProviderSupported('')).toBe(false);
    });

    it('exposes the supported set for callers that want to explain the gap', () => {
        expect(SupportedRealtimeProviders).toContain('openai-live');
        expect(SupportedRealtimeProviders).not.toContain('gemini');
    });
});

describe('driver registration', () => {
    // The session runtime resolves a client with
    // `ClassFactory.CreateInstance(BaseRealtimeClient, provider)`. Registering against any other
    // base class files the driver in a bucket that lookup never reads — the browser driver wins,
    // and `new RTCPeerConnection()` throws under Hermes. Asserting on the resolved CLASS (not just
    // that something resolves) is what makes that failure impossible to reintroduce.
    it.each([
        ['openai-live', RNOpenAILiveClient],
        ['openai', RNOpenAIRealtimeClient],
    ])('resolves the RN driver for %s through BaseRealtimeClient', (provider, expected) => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(
            BaseRealtimeClient,
            provider,
        );
        expect(instance).toBeInstanceOf(expected);
    });

    it('installs the react-native-webrtc globals at module load', () => {
        // The drivers and the audio meters reach for `MediaStream` and `RTCSessionDescription` the
        // way a browser provides them; `registerGlobals()` is what puts them there.
        expect(state.calls).toContain('registerGlobals');
    });
});

describe('RNRealtimeMediaHost', () => {
    it('asks permission, configures the audio session, then captures — in that order', async () => {
        state.calls = [];
        state.permissionGranted = true;
        state.streamOrNull = {};
        await new RNRealtimeMediaHost().AcquireMicrophone();
        // Configuring the session after capture begins produces a call whose first seconds have
        // the wrong route and echo behaviour, so the order is the assertion.
        expect(state.calls).toEqual(['permission', 'audioSession', 'getUserMedia']);
    });

    it('throws on denied permission without touching the audio session', async () => {
        state.calls = [];
        state.permissionGranted = false;
        await expect(new RNRealtimeMediaHost().AcquireMicrophone()).rejects.toThrow(/permission/i);
        expect(state.calls).toEqual(['permission']);
    });

    it('throws when the platform returns no stream', async () => {
        state.permissionGranted = true;
        state.streamOrNull = null;
        await expect(new RNRealtimeMediaHost().AcquireMicrophone()).rejects.toThrow(/no microphone/i);
    });

    it('puts the audio session back when the call ends', async () => {
        // Without this the app stays in record-and-play mode for its lifetime, and every later
        // sound goes out on the call route at call volume.
        state.calls = [];
        await new RNRealtimeMediaHost().ReleaseMicrophone();
        expect(state.calls).toEqual(['resetAudioSession']);
    });

    it('does not offer recording — an optional capability this host declines', () => {
        // Returning nothing is a supported configuration, not a degraded one: recording is
        // consent-gated and the runtime's session clock does not depend on a recorder existing.
        expect((new RNRealtimeMediaHost() as { CreateRecorder?: unknown }).CreateRecorder).toBeUndefined();
    });
});
