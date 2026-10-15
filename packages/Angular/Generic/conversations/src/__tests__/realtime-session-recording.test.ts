import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
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


function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

/** Drives real End/record/usage/close/upload through a controllable GraphQL transport. */
describe('recording teardown durability (#5195)', () => {
  let target: EventTarget;
  beforeEach(() => {
    target = new EventTarget();
    vi.stubGlobal('window', target);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function build(recorded = true) {
    const service = new RealtimeSessionService();
    const client = new RecordingDriver();
    const provider = new GraphQLDataProvider();
    const started = deferred<void>();
    const upload = deferred<boolean>();
    const mutations: string[] = [];
    const execute = vi.spyOn(provider, 'ExecuteGQL').mockImplementation(async (query) => {
      const name = query.match(/mutation (\w+)/)?.[1] ?? '';
      mutations.push(name);
      if (name === 'UploadRealtimeRecording') {
        started.resolve();
        if (!await upload.promise) throw new Error('network gone');
        return { UploadRealtimeRecording: { Success: true, FileID: 'file-1' } };
      }
      return {};
    });
    service.Provider = provider;
    service['agentSessionId'] = 'session-1';
    service['client'] = client;
    service['_active$'].next(true);
    service['pendingUsageInput'] = 10;
    service['pendingUsageOutput'] = 5;
    if (recorded) {
      service['recorder'] = new RealtimeAudioRecorder();
      vi.spyOn(RealtimeAudioRecorder.prototype, 'MimeType', 'get').mockReturnValue('audio/wav');
      vi.spyOn(RealtimeAudioRecorder.prototype, 'Stop').mockResolvedValue(new Blob(['wav']));
      vi.spyOn(RealtimeAudioRecorder.prototype, 'GetPeaks').mockReturnValue([0.2, 0.8]);
      service['blobToBase64'] = vi.fn(async () => 'd2F2');
    }
    return { service, client, started, upload, mutations, execute };
  }

  function unloadIsGuarded(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('flushes usage and closes before a slow recording upload starts', async () => {
    const { service, started, upload, mutations, execute } = build();
    const ending = service.EndRealtimeSession();
    await started.promise;
    try {
      expect(mutations).toEqual(['RelayRealtimeUsage', 'CloseAgentSession', 'UploadRealtimeRecording']);
      expect(execute.mock.calls.find(([query]) => query.includes('mutation UploadRealtimeRecording('))?.[1])
        .toMatchObject({ agentSessionId: 'session-1', audioBase64: 'd2F2', mimeType: 'audio/wav', peaks: [0.2, 0.8] });
    } finally {
      upload.resolve(true);
      await ending;
    }
    expect(service.IsActive).toBe(false);
    expect(service.CurrentAgentSessionId).toBeNull();
  });

  it('closes and uploads even if the driver disconnect throws', async () => {
    const { service, client, upload, mutations } = build();
    vi.spyOn(client, 'Disconnect').mockRejectedValue(new Error('socket gone'));
    upload.resolve(true);
    await service.EndRealtimeSession();
    expect(mutations).toContain('CloseAgentSession');
    expect(mutations).toContain('UploadRealtimeRecording');
    expect(service.IsActive).toBe(false);
  });

  it('arms synchronously, remains armed during upload, and clears after successful upload', async () => {
    const { service, started, upload } = build();
    const ending = service.EndRealtimeSession();
    const armedAtEnd = unloadIsGuarded();
    await started.promise;
    const armedAtUpload = unloadIsGuarded();
    upload.resolve(true);
    await ending;
    expect(armedAtEnd).toBe(true);
    expect(armedAtUpload).toBe(true);
    expect(unloadIsGuarded()).toBe(false);
  });

  it('the session is closed before a failed upload and the guard clears', async () => {
    const { service, started, upload, mutations } = build();
    const ending = service.EndRealtimeSession();
    await started.promise;
    const alreadyClosed = mutations.includes('CloseAgentSession');
    upload.resolve(false);
    await ending;
    expect(alreadyClosed).toBe(true);
    expect(service.IsActive).toBe(false);
    expect(unloadIsGuarded()).toBe(false);
  });

  it('coalesces repeated End calls while the upload is pending', async () => {
    const { service, client, started, upload, mutations } = build();
    const disconnect = vi.spyOn(client, 'Disconnect');
    const first = service.EndRealtimeSession();
    const second = service.EndRealtimeSession();
    await started.promise;
    upload.resolve(true);
    await Promise.all([first, second]);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(mutations.filter(name => name === 'CloseAgentSession')).toHaveLength(1);
    expect(mutations.filter(name => name === 'UploadRealtimeRecording')).toHaveLength(1);
    expect(unloadIsGuarded()).toBe(false);
  });

  it('clears saving state if another teardown step rejects', async () => {
    const { service } = build();
    service['disposeChannels'] = () => { throw new Error('channel disposal failed'); };
    const states: boolean[] = [];
    const subscription = service.SavingRecording$.subscribe(saving => states.push(saving));
    await expect(service.EndRealtimeSession()).rejects.toThrow('channel disposal failed');
    expect(states).toEqual([false, true, false]);
    expect(service.IsSavingRecording).toBe(false);
    expect(unloadIsGuarded()).toBe(false);
    subscription.unsubscribe();
  });

  it('still flushes usage and closes if stopping the recording fails', async () => {
    const { service, mutations } = build();
    vi.mocked(RealtimeAudioRecorder.prototype.Stop).mockRejectedValue(new Error('recording failed'));
    await service.EndRealtimeSession();
    expect(mutations).toEqual(['RelayRealtimeUsage', 'CloseAgentSession']);
    expect(service.IsSavingRecording).toBe(false);
    expect(unloadIsGuarded()).toBe(false);
  });

  it('does not arm or upload for an unrecorded call', async () => {
    const { service, mutations } = build(false);
    const ending = service.EndRealtimeSession();
    expect(unloadIsGuarded()).toBe(false);
    await ending;
    expect(mutations).toContain('CloseAgentSession');
    expect(mutations).not.toContain('UploadRealtimeRecording');
  });
});
