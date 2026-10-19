import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, type RealtimeClientTranscript } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { type StartRealtimeClientSessionResult } from '../index';
import { FakeRecordingHost, FakeRecordingRuntime, FakeRecordingTransport, FakeShardStore } from './recording-test-helpers';

/** A final-only driver (OpenAI Realtime shape): no user interims, one final user transcript per turn. */
@RegisterClass(BaseRealtimeClient, 'fake-final-only-provider')
class FakeFinalOnlyClient extends BaseRealtimeClient {
    public static Latest: FakeFinalOnlyClient | null = null;
    constructor(...args: ConstructorParameters<typeof BaseRealtimeClient>) {
        super(...args);
        FakeFinalOnlyClient.Latest = this;
    }
    public async Connect(): Promise<void> {}
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
    public Emit(transcript: RealtimeClientTranscript): void {
        this.emitTranscript(transcript);
    }
    /** The provider's VAD saw the user start to speak (OpenAI `input_audio_buffer.speech_started`). */
    public SpeechStart(): void {
        this.emitUserSpeechStart();
    }
}

interface RelayedTurn {
    role: string;
    utteranceStartMs: number | null;
    utteranceEndMs: number | null;
}

class GqlProvider {
    public CurrentUser: { ID: string } | null = { ID: 'user-a' };
    public Relayed: RelayedTurn[] = [];
    public readonly sessionId = 'transport-session-1';
    public async ExecuteGQL(query: string, variables?: Record<string, unknown>): Promise<unknown> {
        if (query.includes('RelayRealtimeTranscript') && variables) {
            this.Relayed.push({
                role: String(variables['role']),
                utteranceStartMs: variables['utteranceStartMs'] as number | null,
                utteranceEndMs: variables['utteranceEndMs'] as number | null,
            });
        }
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
        Provider: 'fake-final-only-provider',
        Model: 'model-1',
        EphemeralToken: 'token',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Fake Realtime',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
    };
}

async function startRecorded() {
    expect(FakeFinalOnlyClient).toBeDefined();
    const log: string[] = [];
    const host = new FakeRecordingHost();
    const runtime = new FakeRecordingRuntime(host, new FakeShardStore(log), new FakeRecordingTransport(log, []));
    const provider = new GqlProvider();
    runtime.Provider = provider as unknown as IMetadataProvider;
    await runtime.StartRealtimeSessionFromResult(mintedSession(), { recordingConsent: true });
    const recorder = host.recorder!;
    let now = 0;
    recorder.NowOffsetMs = () => now;
    const client = FakeFinalOnlyClient.Latest!;
    return { runtime, provider, client, advanceTo: (ms: number) => { now = ms; } };
}

/** One assistant turn (interim at 1351 ms, final at 5690 ms), so the user turn under test is not the first turn. */
function speakAssistantTurn(client: FakeFinalOnlyClient, advanceTo: (ms: number) => void): void {
    advanceTo(1351);
    client.Emit({ Role: 'Assistant', Text: 'Hello', IsFinal: false, Kind: 'normal' });
    advanceTo(5690);
    client.Emit({ Role: 'Assistant', Text: 'Hello there', IsFinal: true, Kind: 'normal' });
}

describe('RealtimeSessionRuntime per-turn timing for final-only user transcripts (MJ#5483)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('relays utteranceStartMs as null, never 0, for a user turn whose start the driver did not signal', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(37122);
        client.Emit({ Role: 'User', Text: 'Hi, I would like to apply', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        const [assistant, user] = provider.Relayed;
        expect(assistant).toEqual({ role: 'assistant', utteranceStartMs: 1351, utteranceEndMs: 5690 });
        expect(user).toEqual({ role: 'user', utteranceStartMs: null, utteranceEndMs: 37122 });
    });

    it('relays the real start for a user turn whose start the driver signalled with the user-speech-start event', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart();
        advanceTo(37122);
        client.Emit({ Role: 'User', Text: 'Hi, I would like to apply', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 8400, utteranceEndMs: 37122 });
    });

    it('keeps the first user-speech-start of a turn when the VAD fires again mid-sentence', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart();
        advanceTo(20000);
        client.SpeechStart();
        advanceTo(37122);
        client.Emit({ Role: 'User', Text: 'Hi, I paused, then went on', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        expect(provider.Relayed[1].utteranceStartMs).toBe(8400);
    });
});

describe('RealtimeSessionRuntime per-turn timing: the user speech start keeps its own slot (MJ#5483)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not give the user onset to the assistant turn when the user transcript arrives after the assistant final', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart();
        advanceTo(9000);
        client.Emit({ Role: 'Assistant', Text: 'Sure', IsFinal: false, Kind: 'normal' });
        advanceTo(12000);
        client.Emit({ Role: 'Assistant', Text: 'Sure, let us start', IsFinal: true, Kind: 'normal' });
        advanceTo(13000);
        client.Emit({ Role: 'User', Text: 'I would like to apply', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(3));

        expect(provider.Relayed[1]).toEqual({ role: 'assistant', utteranceStartMs: 9000, utteranceEndMs: 12000 });
        expect(provider.Relayed[2]).toEqual({ role: 'user', utteranceStartMs: 8400, utteranceEndMs: 13000 });
    });

    it('keeps both starts when the user transcript arrives during the assistant reply', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart();
        advanceTo(9000);
        client.Emit({ Role: 'Assistant', Text: 'Sure', IsFinal: false, Kind: 'normal' });
        advanceTo(9500);
        client.Emit({ Role: 'User', Text: 'I would like to apply', IsFinal: true, Kind: 'normal' });
        advanceTo(12000);
        client.Emit({ Role: 'Assistant', Text: 'Sure, let us start', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(3));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 8400, utteranceEndMs: 9500 });
        expect(provider.Relayed[2]).toEqual({ role: 'assistant', utteranceStartMs: 9000, utteranceEndMs: 12000 });
    });

    it('does not move the assistant start for a VAD false positive with no user transcript', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart();
        advanceTo(9000);
        client.Emit({ Role: 'Assistant', Text: 'Sure', IsFinal: false, Kind: 'normal' });
        advanceTo(12000);
        client.Emit({ Role: 'Assistant', Text: 'Sure, let us start', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        expect(provider.Relayed[1]).toEqual({ role: 'assistant', utteranceStartMs: 9000, utteranceEndMs: 12000 });
    });

    it('does not carry a VAD false positive onset into the next real user turn', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart(); // a cough: the provider sends an empty transcript, so nothing is relayed
        advanceTo(9000);
        client.Emit({ Role: 'Assistant', Text: 'Sure', IsFinal: false, Kind: 'normal' });
        advanceTo(12000);
        client.Emit({ Role: 'Assistant', Text: 'Sure, let us start', IsFinal: true, Kind: 'normal' });
        advanceTo(30000);
        client.SpeechStart(); // the user really speaks
        advanceTo(32000);
        client.Emit({ Role: 'User', Text: 'I would like to apply', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(3));

        expect(provider.Relayed[2]).toEqual({ role: 'user', utteranceStartMs: 30000, utteranceEndMs: 32000 });
    });

    it('clears the user speech start on a continuation (replacesPrevious) so the next turn stamps its own', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8000);
        client.SpeechStart();
        advanceTo(10000);
        client.Emit({ Role: 'User', Text: 'I would like', IsFinal: true, Kind: 'normal' });
        advanceTo(11000);
        client.SpeechStart();
        advanceTo(12000);
        client.Emit({ Role: 'User', Text: 'I would like to apply', IsFinal: true, Kind: 'normal', ReplacesPrevious: true });
        advanceTo(20000);
        client.SpeechStart();
        advanceTo(25000);
        client.Emit({ Role: 'User', Text: 'For the nurse role', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(4));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 8000, utteranceEndMs: 10000 });
        expect(provider.Relayed[2]).toEqual({ role: 'user', utteranceStartMs: null, utteranceEndMs: 12000 });
        expect(provider.Relayed[3]).toEqual({ role: 'user', utteranceStartMs: 20000, utteranceEndMs: 25000 });
    });

    it('keeps each start on a barge-in that cuts the assistant off', async () => {
        const { provider, client, advanceTo } = await startRecorded();

        advanceTo(1351);
        client.Emit({ Role: 'Assistant', Text: 'Hello', IsFinal: false, Kind: 'normal' });
        advanceTo(3000);
        client.SpeechStart();
        advanceTo(5690);
        client.Emit({ Role: 'Assistant', Text: 'Hello there', IsFinal: true, Kind: 'normal' });
        advanceTo(8000);
        client.Emit({ Role: 'User', Text: 'Sorry, one question', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        expect(provider.Relayed[0]).toEqual({ role: 'assistant', utteranceStartMs: 1351, utteranceEndMs: 5690 });
        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 3000, utteranceEndMs: 8000 });
    });

    it('keeps a barge-in onset when the user pauses and resumes before the first transcript arrives', async () => {
        const { provider, client, advanceTo } = await startRecorded();

        advanceTo(1351);
        client.Emit({ Role: 'Assistant', Text: 'Hello, let me tell you about', IsFinal: false, Kind: 'normal' });
        advanceTo(3000);
        client.SpeechStart(); // the user cuts the assistant off
        advanceTo(3500);
        client.Emit({ Role: 'Assistant', Text: 'Hello, let me tell you about', IsFinal: true, Kind: 'normal' });
        advanceTo(5000);
        client.SpeechStart(); // the user resumes after a pause
        advanceTo(5600);
        client.Emit({ Role: 'User', Text: 'Sorry, one question', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 3000, utteranceEndMs: 5600 });
    });

    it('releases a VAD false positive onset on an empty user transcript, with no assistant turn between', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8000);
        client.SpeechStart(); // a cough
        advanceTo(8800);
        client.Emit({ Role: 'User', Text: '', IsFinal: true, Kind: 'normal' }); // the provider transcribed nothing
        advanceTo(20000);
        client.SpeechStart(); // the user really speaks
        advanceTo(24000);
        client.Emit({ Role: 'User', Text: 'I would like to apply', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 20000, utteranceEndMs: 24000 });
    });
});
