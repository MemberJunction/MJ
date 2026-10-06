/**
 * Shared fakes for the room-audio tests: a WAV builder, a hand-driven pump clock, and a fake native room client.
 */
import type { NativeConnectArgs, NativeRoomClient, NativeRoomModule } from '@memberjunction/ai-bridge-livekit';
import type { PumpClock, PumpTicker } from '../room-audio/pcm-frame-pump';

/** Options for {@link BuildWav}. Samples are floats in [-1, 1], one array per channel. */
export interface WavSpec {
  FormatCode?: number;
  SampleRate: number;
  BitsPerSample: number;
  Channels: number[][];
  /** Chunks written between `fmt ` and `data` (e.g. an odd-sized LIST chunk). */
  ExtraChunks?: { Id: string; Body: Uint8Array }[];
  /** Write a WAVE_FORMAT_EXTENSIBLE fmt chunk whose SubFormat carries the real code. */
  Extensible?: boolean;
}

function writeSample(view: DataView, offset: number, value: number, code: number, bits: number): void {
  if (code === 3 && bits === 32) return view.setFloat32(offset, value, true);
  if (code === 3 && bits === 64) return view.setFloat64(offset, value, true);
  if (bits === 8) return view.setUint8(offset, Math.round(value * 127) + 128);
  if (bits === 16) return view.setInt16(offset, Math.round(value * 32767), true);
  if (bits === 24) {
    const v = Math.round(value * 8388607);
    view.setUint8(offset, v & 0xff);
    view.setUint8(offset + 1, (v >> 8) & 0xff);
    view.setInt8(offset + 2, v >> 16);
    return;
  }
  view.setInt32(offset, Math.round(value * 2147483647), true);
}

function chunk(id: string, body: Uint8Array): Uint8Array {
  const padded = body.byteLength + (body.byteLength & 1);
  const out = new Uint8Array(8 + padded);
  out.set([...id].map((c) => c.charCodeAt(0)), 0);
  new DataView(out.buffer).setUint32(4, body.byteLength, true);
  out.set(body, 8);
  return out;
}

function fmtBody(spec: WavSpec): Uint8Array {
  const code = spec.FormatCode ?? 1;
  const channels = spec.Channels.length;
  const blockAlign = (channels * spec.BitsPerSample) / 8;
  const body = new Uint8Array(spec.Extensible ? 40 : 16);
  const view = new DataView(body.buffer);
  view.setUint16(0, spec.Extensible ? 0xfffe : code, true);
  view.setUint16(2, channels, true);
  view.setUint32(4, spec.SampleRate, true);
  view.setUint32(8, spec.SampleRate * blockAlign, true);
  view.setUint16(12, blockAlign, true);
  view.setUint16(14, spec.BitsPerSample, true);
  if (spec.Extensible) {
    view.setUint16(16, 22, true);
    view.setUint16(24, code, true);
  }
  return body;
}

function dataBody(spec: WavSpec): Uint8Array {
  const code = spec.FormatCode ?? 1;
  const bytes = spec.BitsPerSample / 8;
  const frames = spec.Channels[0].length;
  const body = new Uint8Array(frames * bytes * spec.Channels.length);
  const view = new DataView(body.buffer);
  for (let f = 0; f < frames; f++) {
    spec.Channels.forEach((channel, c) => writeSample(view, (f * spec.Channels.length + c) * bytes, channel[f], code, spec.BitsPerSample));
  }
  return body;
}

/** Builds a complete RIFF/WAVE file. */
export function BuildWav(spec: WavSpec): Uint8Array {
  const parts = [chunk('fmt ', fmtBody(spec)), ...(spec.ExtraChunks ?? []).map((c) => chunk(c.Id, c.Body)), chunk('data', dataBody(spec))];
  const total = 4 + parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(8 + total);
  out.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  new DataView(out.buffer).setUint32(4, total, true);
  out.set([...'WAVE'].map((c) => c.charCodeAt(0)), 8);
  let offset = 12;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** A pump clock the test advances by hand; each `Advance` fires the ticker once per elapsed tick interval. */
export class FakePumpClock implements PumpClock {
  public NowMs = 0;
  public Cancelled = 0;
  private callback: (() => void) | null = null;
  private intervalMs = 10;

  public Now(): number {
    return this.NowMs;
  }

  public StartTicker(callback: () => void, intervalMs: number): PumpTicker {
    this.callback = callback;
    this.intervalMs = intervalMs;
    return {
      Cancel: () => {
        this.Cancelled++;
        this.callback = null;
      },
    };
  }

  public get HasTicker(): boolean {
    return this.callback !== null;
  }

  /** Advances time by `ms`, ticking at the ticker's interval. */
  public Advance(ms: number): void {
    for (let elapsed = 0; elapsed < ms; elapsed += this.intervalMs) {
      this.NowMs += this.intervalMs;
      this.callback?.();
    }
  }

  /** Jumps time forward WITHOUT ticking (a blocked event loop), then ticks once. */
  public Stall(ms: number): void {
    this.NowMs += ms;
    this.callback?.();
  }
}

/** A native room client that records what the player does with it. */
export class FakeRoomClient implements NativeRoomClient {
  public Published: ArrayBuffer[] = [];
  public ConnectArgs: NativeConnectArgs | null = null;
  public Disconnects = 0;
  public ConnectError: Error | null = null;
  /** When set, `publishAudio` throws it (a broken outbound sink). */
  public PublishError: Error | null = null;
  private disconnectedCallback: (() => void) | null = null;

  public async connect(args: NativeConnectArgs) {
    if (this.ConnectError) throw this.ConnectError;
    this.ConnectArgs = args;
    return { localIdentity: 'hold-bot', roomName: 'room' };
  }
  public async disconnect(): Promise<void> {
    this.Disconnects++;
  }
  public publishAudio(pcm: ArrayBuffer): void {
    if (this.PublishError) throw this.PublishError;
    this.Published.push(pcm);
  }
  public flushOutbound(): void {}
  public publishVideo(): void {}
  public publishScreen(): void {}
  public onAudioFrame(): void {}
  public onParticipantConnected(): void {}
  public onParticipantDisconnected(): void {}
  public async getParticipants() {
    return [];
  }
  public async publishData(): Promise<void> {}
  public onDisconnected(cb: () => void): void {
    this.disconnectedCallback = cb;
  }

  /** Simulates the server dropping the bot. */
  public SimulateServerDisconnect(): void {
    this.disconnectedCallback?.();
  }
}

/** A native module whose clients are recorded for the test to inspect. */
export function FakeRoomModule(clients: FakeRoomClient[], options: { OutboundRates?: number[]; ConnectError?: Error } = {}): NativeRoomModule {
  return {
    createRoomClient: (opts) => {
      options.OutboundRates?.push(opts.OutboundSampleRate ?? 0);
      const client = new FakeRoomClient();
      client.ConnectError = options.ConnectError ?? null;
      clients.push(client);
      return client;
    },
  };
}
