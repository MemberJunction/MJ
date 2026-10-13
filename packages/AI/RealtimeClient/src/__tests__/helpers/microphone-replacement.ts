/**
 * The `ReplaceMicrophone` contract (driver obligation #10), run by each driver's test file: after a
 * replacement the driver sends the new track, meters it, and owns its stream (mute and teardown act on
 * it); a stream without an audio track is refused and the session keeps its microphone; before the
 * session connects nothing happens.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeAudioMeter } from '../../audio/audioMeter';
import { FakeMediaStream, FakeMicCapture, FakeRtpSender, FakeTrack } from './realtime-fakes';

/** The driver members the contract exercises. */
export interface MicrophoneReplacingClient {
    ReplaceMicrophone(micStream: MediaStream): Promise<void>;
    SetMuted(muted: boolean): void;
    Disconnect(): Promise<void>;
}

/** The parts of a fake mic track the contract reads. */
export type ContractTrack = Pick<FakeTrack, 'enabled' | 'Stopped'>;

/** Runs the contract for a driver that captures PCM through `CreatePcmMicCapture`. */
export function DescribePcmMicrophoneReplacement(
    connected: () => Promise<{ Client: MicrophoneReplacingClient; Track: ContractTrack; Capture: FakeMicCapture }>,
    idle: () => MicrophoneReplacingClient
): void {
    describe('ReplaceMicrophone (obligation #10)', () => {
        afterEach(() => vi.restoreAllMocks());

        it('rebinds the capture and the input meter, and owns the new stream', async () => {
            const { Client, Capture } = await connected();
            const meter = vi.spyOn(RealtimeAudioMeter, 'ForMicStream');
            const track = new FakeTrack();
            const stream = new FakeMediaStream([track]);
            await Client.ReplaceMicrophone(stream);
            expect(Capture.Rebound).toEqual([stream]);
            expect(meter).toHaveBeenCalledWith(stream);
            await expectOwns(Client, track);
        });

        it('keeps the current microphone when the new stream has no audio track', async () => {
            const { Client, Track, Capture } = await connected();
            await expect(Client.ReplaceMicrophone(new FakeMediaStream([]))).rejects.toThrow('no audio track');
            expect(Capture.Rebound).toEqual([]);
            Client.SetMuted(true);
            expect(Track.enabled).toBe(false);
        });

        it('does nothing before the session connects', async () => {
            await expectIgnoredWhileIdle(idle());
        });

        it('does nothing after the session disconnects', async () => {
            const { Client, Capture } = await connected();
            await Client.Disconnect();
            await expectIgnoredWhileIdle(Client);
            expect(Capture.Rebound).toEqual([]);
        });
    });
}

/** Runs the contract for a driver that sends the microphone over a WebRTC peer connection. */
export function DescribeWebRtcMicrophoneReplacement(
    connected: () => Promise<{ Client: MicrophoneReplacingClient; Track: ContractTrack; Senders: FakeRtpSender[] }>,
    idle: () => MicrophoneReplacingClient
): void {
    describe('ReplaceMicrophone (obligation #10)', () => {
        afterEach(() => vi.restoreAllMocks());

        it('moves the mic sender and the input meter to the new track, and owns the new stream', async () => {
            const { Client, Senders } = await connected();
            const meter = vi.spyOn(RealtimeAudioMeter, 'ForMicStream');
            const track = new FakeTrack();
            const stream = new FakeMediaStream([track]);
            await Client.ReplaceMicrophone(stream);
            expect(Senders.map((sender) => sender.Replaced)).toEqual([[track]]);
            expect(meter).toHaveBeenCalledWith(stream);
            await expectOwns(Client, track);
        });

        it('rejects a stream without an audio track and leaves the sender on the current one', async () => {
            const { Client, Track, Senders } = await connected();
            await expect(Client.ReplaceMicrophone(new FakeMediaStream([]))).rejects.toThrow('no audio track');
            expect(Senders.map((sender) => sender.Replaced)).toEqual([[]]);
            Client.SetMuted(true);
            expect(Track.enabled).toBe(false);
        });

        it('does nothing before the session connects', async () => {
            await expectIgnoredWhileIdle(idle());
        });

        it('does nothing after the session disconnects', async () => {
            const { Client, Senders } = await connected();
            await Client.Disconnect();
            await expectIgnoredWhileIdle(Client);
            expect(Senders.map((sender) => sender.Replaced)).toEqual([[]]);
        });
    });
}

/** Mute and teardown act on the stream the driver now owns. */
async function expectOwns(client: MicrophoneReplacingClient, track: FakeTrack): Promise<void> {
    client.SetMuted(true);
    expect(track.enabled).toBe(false);
    await client.Disconnect();
    expect(track.Stopped).toBe(true);
}

/** A replacement while not connected resolves and leaves the stream alone: the driver did not take it. */
async function expectIgnoredWhileIdle(client: MicrophoneReplacingClient): Promise<void> {
    const track = new FakeTrack();
    await client.ReplaceMicrophone(new FakeMediaStream([track]));
    client.SetMuted(true);
    expect(track.enabled).toBe(true);
}
