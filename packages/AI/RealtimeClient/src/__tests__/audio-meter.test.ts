/**
 * Unit tests for the audio-activity metering layer: the pure DSP helpers
 * (RMS / frequency bucketing — no Web Audio needed) and the BaseRealtimeClient
 * capability surface (GetAudioActivity null-when-unmetered contract, attach/replace/
 * close lifecycle), and the mic meter following the mic mute.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BucketizeFrequencyData,
  ComputeRmsLevel,
  IRealtimeAudioMeter,
  RealtimeAudioMeter,
  REALTIME_AUDIO_BIN_COUNT
} from '../audio/audioMeter';
import { BaseRealtimeClient, RealtimeAudioActivity } from '../generic/baseRealtimeClient';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';

describe('ComputeRmsLevel', () => {
  it('returns 0 for silence (all bytes centered at 128) and for empty input', () => {
    expect(ComputeRmsLevel(new Uint8Array(0))).toBe(0);
    expect(ComputeRmsLevel(new Uint8Array(64).fill(128))).toBe(0);
  });

  it('clamps a full-scale square wave to 1', () => {
    const bytes = new Uint8Array(64);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 2 === 0 ? 0 : 255;
    }
    expect(ComputeRmsLevel(bytes)).toBe(1);
  });

  it('scales monotonically with amplitude', () => {
    const quiet = new Uint8Array(64).fill(128 + 8);
    const loud = new Uint8Array(64).fill(128 + 64);
    expect(ComputeRmsLevel(quiet)).toBeGreaterThan(0);
    expect(ComputeRmsLevel(loud)).toBeGreaterThan(ComputeRmsLevel(quiet));
  });
});

describe('BucketizeFrequencyData', () => {
  it('returns all-zero bins for empty input and non-positive counts', () => {
    expect(BucketizeFrequencyData(new Uint8Array(0))).toEqual(new Array(REALTIME_AUDIO_BIN_COUNT).fill(0));
    expect(BucketizeFrequencyData(new Uint8Array(8).fill(255), 0)).toEqual([]);
  });

  it('produces the requested bin count, normalized 0..1', () => {
    const bins = BucketizeFrequencyData(new Uint8Array(128).fill(255), 9);
    expect(bins).toHaveLength(9);
    for (const b of bins) {
      expect(b).toBeGreaterThan(0.99);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('reflects where the energy sits (low-band energy lands in the early bins)', () => {
    const data = new Uint8Array(128).fill(0);
    data.fill(255, 0, 10); // energy only in the lowest bins
    const bins = BucketizeFrequencyData(data, 9);
    expect(bins[0]).toBeGreaterThan(0.5);
    expect(bins[8]).toBe(0);
  });

  it('ignores the hiss-dominated top of the spectrum (>70%)', () => {
    const data = new Uint8Array(128).fill(0);
    data.fill(255, 120); // energy only in the top ~6%
    const bins = BucketizeFrequencyData(data, 9);
    expect(bins.every(b => b === 0)).toBe(true);
  });
});

describe('RealtimeAudioMeter factories (no Web Audio in this environment)', () => {
  it('ForStream returns null instead of throwing when AudioContext is unavailable', () => {
    expect(RealtimeAudioMeter.ForStream({} as MediaStream)).toBeNull();
  });
});

/** Minimal concrete client exposing the protected meter hooks for testing. */
class MeterProbeClient extends BaseRealtimeClient {
  public async Connect(_config: ClientRealtimeSessionConfig, _mic: MediaStream): Promise<void> { /* not used */ }
  public SendText(): void { /* not used */ }
  public CancelActiveResponse(): void { /* not used */ }
  public SendContextNote(): void { /* not used */ }
  public RequestSpokenUpdate(): void { /* not used */ }
  public SendToolResult(): void { /* not used */ }
  public SetMuted(): void { /* not used */ }
  public async Disconnect(): Promise<void> { /* not used */ }
  public get IsBusy(): boolean { return false; }
  public get IsAudioPlaying(): boolean { return false; }

  public AttachInput(meter: IRealtimeAudioMeter | null): void { this.attachInputAudioMeter(meter); }
  public AttachOutput(meter: IRealtimeAudioMeter | null): void { this.attachOutputAudioMeter(meter); }
  public CloseMeters(): void { this.closeAudioMeters(); }
}

function fakeMeter(level: number): IRealtimeAudioMeter & { Closed: boolean } {
  return {
    Closed: false,
    Level: () => level,
    Bins: (count = REALTIME_AUDIO_BIN_COUNT) => new Array(count).fill(level),
    Close(): void { this.Closed = true; }
  };
}

describe('BaseRealtimeClient.GetAudioActivity (capability surface)', () => {
  it('returns null when NO meters are attached (hosts fall back to turn-state visuals)', () => {
    expect(new MeterProbeClient().GetAudioActivity()).toBeNull();
  });

  it('reports per-direction levels + bins, null for the un-metered direction', () => {
    const client = new MeterProbeClient();
    client.AttachOutput(fakeMeter(0.6));

    const activity = client.GetAudioActivity() as RealtimeAudioActivity;
    expect(activity.OutputLevel).toBe(0.6);
    expect(activity.OutputBins).toHaveLength(REALTIME_AUDIO_BIN_COUNT);
    expect(activity.InputLevel).toBeNull();
    expect(activity.InputBins).toBeNull();
  });

  it('replacing a meter closes the previous one; closeAudioMeters closes both and returns to null', () => {
    const client = new MeterProbeClient();
    const first = fakeMeter(0.2);
    const second = fakeMeter(0.4);
    const input = fakeMeter(0.1);
    client.AttachOutput(first);
    client.AttachOutput(second);
    expect(first.Closed).toBe(true);
    expect(second.Closed).toBe(false);

    client.AttachInput(input);
    client.CloseMeters();
    expect(second.Closed).toBe(true);
    expect(input.Closed).toBe(true);
    expect(client.GetAudioActivity()).toBeNull();
  });
});

// ── Mic meter mute: the meter reads a clone, so it must follow the mic track's `enabled` flag ──────────

/** A mic track: `clone()` copies `enabled`, as the browser does. */
class FakeMicTrack {
  public enabled = true;
  public Stopped = false;
  public readonly Clones: FakeMicTrack[] = [];
  public clone(): FakeMicTrack {
    const copy = new FakeMicTrack();
    copy.enabled = this.enabled;
    this.Clones.push(copy);
    return copy;
  }
  public stop(): void { this.Stopped = true; }
}

class FakeMediaStream {
  constructor(public readonly Tracks: FakeMicTrack[] = []) {}
  public getAudioTracks(): FakeMicTrack[] { return this.Tracks; }
}

/** An analyser over a stream: full-scale signal while any of its tracks is enabled, silence otherwise. */
class FakeAnalyser {
  public fftSize = 2048;
  public smoothingTimeConstant = 0.8;
  public Tracks: FakeMicTrack[] = [];
  public get frequencyBinCount(): number { return this.fftSize / 2; }
  private get live(): boolean { return this.Tracks.some(t => t.enabled); }
  public getByteTimeDomainData(out: Uint8Array): void {
    for (let i = 0; i < out.length; i++) {
      out[i] = this.live ? (i % 2 === 0 ? 0 : 255) : 128;
    }
  }
  public getByteFrequencyData(out: Uint8Array): void { out.fill(this.live ? 255 : 0); }
  public disconnect(): void { /* nothing to release */ }
}

class FakeAudioContext {
  public state = 'running';
  private stream: FakeMediaStream | null = null;
  public createMediaStreamSource(stream: FakeMediaStream): { connect(analyser: FakeAnalyser): void } {
    this.stream = stream;
    return { connect: (analyser: FakeAnalyser): void => { analyser.Tracks = this.stream?.Tracks ?? []; } };
  }
  public createAnalyser(): FakeAnalyser { return new FakeAnalyser(); }
  public async resume(): Promise<void> { /* already running */ }
  public async close(): Promise<void> { /* nothing to release */ }
}

describe('RealtimeAudioMeter.ForMicStream follows the mic mute', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('MediaStream', FakeMediaStream);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function micMeter(...tracks: FakeMicTrack[]): RealtimeAudioMeter {
    const meter = RealtimeAudioMeter.ForMicStream(new FakeMediaStream(tracks) as unknown as MediaStream);
    expect(meter).not.toBeNull();
    return meter as RealtimeAudioMeter;
  }

  it('reads the clone while the mic is live', () => {
    const mic = new FakeMicTrack();
    const meter = micMeter(mic);
    expect(meter.Level()).toBe(1);
    expect(meter.Bins().every(b => b > 0.99)).toBe(true);
  });

  it('reads silence while the mic track is disabled, and resumes on unmute', () => {
    const mic = new FakeMicTrack();
    const meter = micMeter(mic);

    mic.enabled = false;
    expect(meter.Level()).toBe(0);
    expect(meter.Bins()).toEqual(new Array(REALTIME_AUDIO_BIN_COUNT).fill(0));
    expect(mic.Clones[0].enabled).toBe(false);

    mic.enabled = true;
    expect(meter.Level()).toBe(1);
    expect(meter.Bins().every(b => b > 0.99)).toBe(true);
  });

  it('a meter built while muted (mic replaced during mute) reads silence, then resumes after unmute', () => {
    const mic = new FakeMicTrack();
    mic.enabled = false;
    const meter = micMeter(mic);
    expect(mic.Clones[0].enabled).toBe(false);
    expect(meter.Level()).toBe(0);

    mic.enabled = true;
    expect(meter.Level()).toBe(1);
    expect(mic.Clones[0].enabled).toBe(true);
  });

  it('keeps reading while any one of several mic tracks is enabled', () => {
    const first = new FakeMicTrack();
    const second = new FakeMicTrack();
    const meter = micMeter(first, second);

    first.enabled = false;
    expect(meter.Level()).toBe(1);

    second.enabled = false;
    expect(meter.Level()).toBe(0);
  });

  it('Close stops the clones, not the mic tracks', () => {
    const mic = new FakeMicTrack();
    const meter = micMeter(mic);
    meter.Close();
    expect(mic.Clones[0].Stopped).toBe(true);
    expect(mic.Stopped).toBe(false);
    expect(meter.Level()).toBe(0);
  });
});
