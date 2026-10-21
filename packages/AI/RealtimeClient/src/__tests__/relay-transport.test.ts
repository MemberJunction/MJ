/**
 * Which client drivers open a relay session (`ClientRealtimeSessionConfig.Transport` `'relay'`): only a driver that opts
 * in through `SupportsRelayTransport` (the Gemini Enterprise client). Every other driver refuses one in `Connect`, before
 * it touches the microphone or opens a socket or a peer connection, and says so without quoting the relay URL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../index';
import { FakeMediaStream } from './helpers/realtime-fakes';

const TICKET = '5a1b2c3d-1111-4222-8333-944455556666';
const RELAY_URL = `wss://mjapi.example.test/realtime/relay/${TICKET}`;
const REFUSAL = "cannot open a session through MJAPI's relay";

/** A relay session, as a relay-minting server driver hands it to the client registered under `provider`. */
function relaySession(provider: string): ClientRealtimeSessionConfig {
    return {
        Provider: provider,
        Model: 'stand-in-model',
        EphemeralToken: '',
        ExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        Transport: 'relay',
        RelayUrl: RELAY_URL,
        SessionConfig: {},
    };
}

/** A microphone stream that records whether anything touched it. */
function untouchedMic(): { Stream: MediaStream; Touched: () => boolean } {
    const fake = new FakeMediaStream([]);
    const spies = [vi.spyOn(fake, 'getTracks'), vi.spyOn(fake, 'getAudioTracks')];
    return { Stream: fake as unknown as MediaStream, Touched: () => spies.some((spy) => spy.mock.calls.length > 0) };
}

/** A driver that calls the base check as every driver must (obligation #11), with the opt-in as given. */
class CheckingClient extends BaseRealtimeClient {
    public Connected = false;
    constructor(private readonly relay: boolean) {
        super();
    }
    protected override get SupportsRelayTransport(): boolean {
        return this.relay;
    }
    public async Connect(config: ClientRealtimeSessionConfig): Promise<void> {
        this.AssertTransportSupported(config);
        this.Connected = true;
    }
    public SendText(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public CancelActiveResponse(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

describe('relay sessions: only a driver that opts in opens one', () => {
    const opened: string[] = [];

    beforeEach(() => {
        opened.length = 0;
        // Anything a driver would open: each records the attempt and refuses to work.
        const refuse = (kind: string) =>
            function Refused(): never {
                opened.push(kind);
                throw new Error(`${kind} opened`);
            };
        vi.stubGlobal('WebSocket', refuse('WebSocket'));
        vi.stubGlobal('RTCPeerConnection', refuse('RTCPeerConnection'));
        vi.stubGlobal('AudioContext', refuse('AudioContext'));
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** Every client driver registered in the package, by the provider key a server stamps. */
    const registeredKeys = (): string[] =>
        MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseRealtimeClient)
            .map((registration) => registration.Key)
            .filter((key): key is string => typeof key === 'string' && key.length > 0);

    it('knows every driver the package registers', () => {
        expect(registeredKeys()).toEqual(
            expect.arrayContaining(['openai', 'openai-live', 'gemini', 'gemini-enterprise', 'elevenlabs', 'assemblyai', 'xai', 'huggingface'])
        );
    });

    it('every driver but the Gemini Enterprise client refuses a relay session before it touches the microphone or opens anything, without quoting the relay URL', async () => {
        const refusing = registeredKeys().filter((key) => key !== 'gemini-enterprise');
        expect(refusing.length).toBeGreaterThanOrEqual(7);
        for (const key of refusing) {
            const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, key);
            expect(client, key).toBeInstanceOf(BaseRealtimeClient);
            const mic = untouchedMic();
            const states: string[] = [];
            client?.OnStateChange((state) => states.push(state));

            const connecting = client!.Connect(relaySession(key), mic.Stream);

            await expect(connecting, key).rejects.toThrow(REFUSAL);
            await expect(connecting, key).rejects.toThrow(`'${key}'`);
            await expect(connecting, key).rejects.not.toThrow(TICKET);
            expect(mic.Touched(), key).toBe(false);
            expect(states, key).toEqual([]); // not even 'connecting'
        }
        expect(opened).toEqual([]);
    });

    it("a driver that doesn't opt in refuses a relay session and opens a direct one, whether it says 'direct' or nothing", async () => {
        const relay = new CheckingClient(false);
        await expect(relay.Connect(relaySession('stand-in'))).rejects.toThrow(REFUSAL);
        expect(relay.Connected).toBe(false);

        const direct = new CheckingClient(false);
        await direct.Connect({ ...relaySession('stand-in'), Transport: 'direct', RelayUrl: undefined, EphemeralToken: 'ek_1' });
        expect(direct.Connected).toBe(true);

        const unmarked = new CheckingClient(false);
        await unmarked.Connect({ Provider: 'stand-in', Model: 'm', EphemeralToken: 'ek_1', ExpiresAt: '2030-01-01T00:00:00Z', SessionConfig: {} });
        expect(unmarked.Connected).toBe(true);
    });

    it('a driver that opts in opens a relay session', async () => {
        const client = new CheckingClient(true);
        await client.Connect(relaySession('stand-in'));
        expect(client.Connected).toBe(true);
    });
});
