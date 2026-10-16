import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';
import { RealtimeAudioRecorder } from '../lib/services/realtime-audio-recorder';

class FakeMediaStream extends EventTarget implements MediaStream {
    public readonly active = true;
    public readonly id = 'fake-stream';
    public onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    public onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    private tracks: MediaStreamTrack[];

    constructor(tracks: MediaStreamTrack[]) {
        super();
        this.tracks = tracks;
    }
    public addTrack(track: MediaStreamTrack): void {
        this.tracks.push(track);
    }
    public clone(): MediaStream {
        return this;
    }
    public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getTrackById(_id: string): MediaStreamTrack | null {
        return null;
    }
    public getTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getVideoTracks(): MediaStreamTrack[] {
        return [];
    }
    public removeTrack(_track: MediaStreamTrack): void {}
}


class RecordingDriver extends BaseRealtimeClient {
  /** Every Connect() the service made, newest last — length doubles as a "started once" assert. */
  public static Connects: ClientRealtimeSessionConfig[] = [];
  public Disconnected = false;
  public Publish(stream: MediaStream): void { this.publishRemoteMediaStream(stream); }

  public override async Connect(config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
    RecordingDriver.Connects.push(config);
  }
  public override SendText(_text: string): void {
    /* not under test */
  }
  public override CancelActiveResponse(): void {
    /* not under test */
  }
  public override SendContextNote(_text: string): void {
    /* not under test */
  }
  public override RequestSpokenUpdate(_instructions: string): void {
    /* not under test */
  }
  public override SendToolResult(_callID: string, _outputJson: string): void {
    /* not under test */
  }
  public override SetMuted(_muted: boolean): void {
    /* not under test */
  }
  public override async Disconnect(): Promise<void> {
    this.Disconnected = true;
  }
  public override get IsBusy(): boolean {
    return false;
  }
  public override get IsAudioPlaying(): boolean {
    return false;
  }
}


// Exercise the existing recording boundary directly: provider/microphone acquisition is
// covered by realtime-session-from-result, while these guards cover stream handoff.
describe('RealtimeSessionService agent audio recording handoff (#5153)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(RealtimeAudioRecorder.prototype, 'Start').mockImplementation(() => {});
    vi.spyOn(RealtimeAudioRecorder.prototype, 'IsRecording', 'get').mockReturnValue(true);
    vi.spyOn(RealtimeAudioRecorder.prototype, 'AttachRemoteStream').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('starts recording with the PCM agent stream already published at Connect', () => {
    const service = new RealtimeSessionService();
    const client = new RecordingDriver();
    const stream = new FakeMediaStream([]);
    const mic = new FakeMediaStream([]);
    service['localStream'] = mic;
    client.Publish(stream);

    service['startRecording'](client);

    expect(RealtimeAudioRecorder.prototype.Start).toHaveBeenCalledExactlyOnceWith(mic, stream);
    expect(RealtimeAudioRecorder.prototype.AttachRemoteStream).toHaveBeenCalledExactlyOnceWith(stream);
  });
  it('attaches a WebRTC track that arrives after recording starts', () => {
    const service = new RealtimeSessionService();
    const client = new RecordingDriver();
    const mic = new FakeMediaStream([]);
    const stream = new FakeMediaStream([]);
    service['localStream'] = mic;

    service['startRecording'](client);
    expect(RealtimeAudioRecorder.prototype.Start).toHaveBeenCalledExactlyOnceWith(mic, null);
    expect(RealtimeAudioRecorder.prototype.AttachRemoteStream).not.toHaveBeenCalled();
    client.Publish(stream);

    expect(RealtimeAudioRecorder.prototype.AttachRemoteStream).toHaveBeenCalledExactlyOnceWith(stream);
  });
});
