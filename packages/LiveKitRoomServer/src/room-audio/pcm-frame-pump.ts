/**
 * @fileoverview {@link PcmFramePump} — plays a PCM16 buffer out to a sink in real time, one 20 ms frame at a time.
 *
 * The native LiveKit wrapper's `publishAudio` queues whatever it is given and drains it as fast as the WebRTC audio
 * source accepts it; it does not pace. Handing it a whole song would buffer minutes of audio in memory and make pause,
 * stop and announcements lag by that much. So the pump paces itself: a fast ticker compares monotonic elapsed time
 * with frames sent and emits only what is due, plus a small lead (~150 ms) that absorbs timer jitter. The lead is all
 * that is ever outstanding downstream.
 *
 * - **Drift correction** — frames due are computed from the elapsed time since the timeline started, never by
 *   counting ticks, so a late tick sends two frames and the average rate stays exact.
 * - **Bounded catch-up** — after a long stall (a blocked event loop) the pump does not burst the backlog; it drops it
 *   and restarts the timeline, so the downstream queue can never grow past the lead plus a small margin.
 * - **Loop**, **Pause/Resume** (resume restarts the timeline — no burst), and **InsertClip**: the music fades down to a
 *   duck level, the clip plays over it, and the music fades back up.
 *
 * The clock and ticker are injectable so tests drive time by hand.
 *
 * @module @memberjunction/livekit-room-server
 */

import { LogError } from '@memberjunction/core';
import { FloatToPcm16 } from './audio-decoder';

/** A running ticker the pump can cancel. */
export interface PumpTicker {
  /** Stops the ticker. Idempotent. */
  Cancel(): void;
}

/** The pump's source of time and ticks — `performance.now()` + `setInterval` in production, a fake in tests. */
export interface PumpClock {
  /** Monotonic milliseconds. */
  Now(): number;
  /** Calls `callback` every `intervalMs` until cancelled. */
  StartTicker(callback: () => void, intervalMs: number): PumpTicker;
}

/** Why a pump stopped: its (non-looping) audio ran out, it was stopped, or the sink threw. */
export type PumpEndReason = 'Completed' | 'Stopped' | 'SinkError';

/** Construction options for {@link PcmFramePump}. */
export interface PcmFramePumpOptions {
  /** Mono PCM16 to play, at {@link SampleRate}. Must not be empty. */
  Music: Int16Array;
  /** The rate of {@link Music}, of inserted clips, and of the frames handed to {@link Sink}. */
  SampleRate: number;
  /** Receives each frame. Every frame is a freshly allocated array the sink may keep. */
  Sink: (frame: Int16Array<ArrayBuffer>) => void;
  /** Loop {@link Music} forever. Default `true`. */
  Loop?: boolean;
  /** Frame duration in ms. Default 20. */
  FrameMs?: number;
  /** How far ahead of real time the pump keeps the sink, in ms. Default 150. */
  LeadMs?: number;
  /** How long the music takes to fade down for a clip (and back up after), in ms. Default 150. */
  DuckMs?: number;
  /** The music's level while a clip plays, 0–1. Default 0.15. */
  DuckLevel?: number;
  /** Time source. Default: {@link SystemPumpClock}. */
  Clock?: PumpClock;
  /** Called once when the pump stops, with the reason. */
  OnEnded?: (reason: PumpEndReason) => void;
}

/** How often the ticker fires, in ms. Shorter than a frame so lateness never exceeds about half a frame. */
const TICK_MS = 10;

/** How far behind real time the pump will catch up before it drops the backlog instead, in ms. */
const MAX_CATCH_UP_MS = 200;

/** The production clock: `performance.now()` and an unref'd `setInterval` (a playing pump never holds the process open). */
export const SystemPumpClock: PumpClock = {
  Now: () => performance.now(),
  StartTicker: (callback, intervalMs) => {
    const handle = setInterval(callback, intervalMs);
    handle.unref?.();
    return { Cancel: () => clearInterval(handle) };
  },
};

/** A clip waiting to play, or playing, and how to tell its caller it finished. */
interface QueuedClip {
  Pcm: Int16Array;
  Done: (played: boolean) => void;
}

/** Paces mono PCM16 out to a sink in real time. See the file overview. */
export class PcmFramePump {
  private readonly music: Int16Array;
  private readonly sampleRate: number;
  private readonly sink: (frame: Int16Array<ArrayBuffer>) => void;
  private readonly loop: boolean;
  private readonly frameMs: number;
  private readonly samplesPerFrame: number;
  private readonly leadFrames: number;
  private readonly maxBurstFrames: number;
  private readonly duckLevel: number;
  private readonly gainStep: number;
  private readonly clock: PumpClock;
  private readonly onEnded?: (reason: PumpEndReason) => void;

  private ticker: PumpTicker | null = null;
  private running = false;
  private paused = false;
  private ended = false;
  private timelineStart = 0;
  private framesOnTimeline = 0;
  private framesSent = 0;
  private musicPosition = 0;
  private musicDone = false;
  private gain = 1;
  private readonly clipQueue: QueuedClip[] = [];
  private currentClip: QueuedClip | null = null;
  private clipPosition = 0;

  /** @throws {Error} when the music is empty or a timing option is not positive. */
  constructor(options: PcmFramePumpOptions) {
    if (options.Music.length === 0) throw new Error('PcmFramePump needs non-empty audio to play.');
    if (!(options.SampleRate > 0)) throw new Error(`PcmFramePump needs a positive sample rate; got ${options.SampleRate}.`);
    this.music = options.Music;
    this.sampleRate = options.SampleRate;
    this.sink = options.Sink;
    this.loop = options.Loop ?? true;
    this.frameMs = options.FrameMs ?? 20;
    this.samplesPerFrame = Math.max(1, Math.round((this.sampleRate * this.frameMs) / 1000));
    this.leadFrames = Math.max(1, Math.ceil((options.LeadMs ?? 150) / this.frameMs));
    this.maxBurstFrames = this.leadFrames + Math.ceil(MAX_CATCH_UP_MS / this.frameMs);
    this.duckLevel = Math.min(1, Math.max(0, options.DuckLevel ?? 0.15));
    const duckSamples = Math.max(1, Math.round(((options.DuckMs ?? 150) * this.sampleRate) / 1000));
    this.gainStep = (1 - this.duckLevel) / duckSamples;
    this.clock = options.Clock ?? SystemPumpClock;
    this.onEnded = options.OnEnded;
  }

  /** True between {@link Start} and the pump ending (including while paused). */
  public get IsRunning(): boolean {
    return this.running;
  }

  /** True while paused. */
  public get IsPaused(): boolean {
    return this.paused;
  }

  /** Frames handed to the sink so far. */
  public get FramesSent(): number {
    return this.framesSent;
  }

  /** Samples per frame at the pump's rate. */
  public get SamplesPerFrame(): number {
    return this.samplesPerFrame;
  }

  /** Starts playback: sends the lead immediately, then paces in real time. A second call is a no-op. */
  public Start(): void {
    if (this.running || this.ended) {
      return;
    }
    this.running = true;
    this.restartTimeline();
    this.ticker = this.clock.StartTicker(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Stops sending frames until {@link Resume}. Playback position, ducking and queued clips are kept. */
  public Pause(): void {
    if (this.running) {
      this.paused = true;
    }
  }

  /** Continues after {@link Pause} from where it left off, on a fresh timeline (so nothing bursts). */
  public Resume(): void {
    if (!this.running || !this.paused) {
      return;
    }
    this.paused = false;
    this.restartTimeline();
    this.tick();
  }

  /**
   * How much already-sent audio is still ahead of real time, in ms: the pump keeps the sink up to `LeadMs` ahead, so
   * after the last frame is sent the room is still playing this much. Zero once real time has caught up.
   */
  public get QueuedAheadMs(): number {
    const sentUntil = this.timelineStart + this.framesOnTimeline * this.frameMs;
    return Math.max(0, sentUntil - this.clock.Now());
  }

  /**
   * Plays `pcm` over the music: the music fades down to the duck level, the clip plays, the music fades back up.
   * Clips queue behind one another.
   *
   * @param pcm Mono PCM16 at the pump's sample rate.
   * @returns Resolves `true` once the clip has been sent in full, `false` if the pump stopped first or the clip is empty.
   */
  public InsertClip(pcm: Int16Array): Promise<boolean> {
    if (!this.running || pcm.length === 0) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => this.clipQueue.push({ Pcm: pcm, Done: resolve }));
  }

  /** Stops the pump for good. Idempotent; pending clips resolve `false`. */
  public Stop(): void {
    this.finish('Stopped');
  }

  private restartTimeline(): void {
    this.timelineStart = this.clock.Now();
    this.framesOnTimeline = 0;
  }

  private tick(): void {
    if (!this.running || this.paused) {
      return;
    }
    try {
      const due = this.framesDue();
      for (let i = 0; i < due && this.running && !this.paused; i++) {
        this.emitFrame();
      }
    } catch (err) {
      LogError(`[PcmFramePump] the sink failed; stopping playback: ${err instanceof Error ? err.message : String(err)}`);
      this.finish('SinkError');
    }
  }

  /** Frames owed to the sink now, given elapsed time and the lead. Drops the backlog after a long stall. */
  private framesDue(): number {
    const elapsed = this.clock.Now() - this.timelineStart;
    const target = Math.floor(elapsed / this.frameMs) + this.leadFrames;
    const due = target - this.framesOnTimeline;
    if (due > this.maxBurstFrames) {
      this.restartTimeline(); // stalled too long: skip the missed audio rather than flood the sink
      return this.leadFrames;
    }
    return Math.max(0, due);
  }

  private emitFrame(): void {
    const frame = new Int16Array(this.samplesPerFrame);
    for (let i = 0; i < frame.length; i++) {
      frame[i] = FloatToPcm16(this.nextSample());
    }
    this.framesOnTimeline++;
    this.framesSent++;
    this.sink(frame);
    if (this.musicDone && !this.currentClip && this.clipQueue.length === 0) {
      this.finish('Completed');
    }
  }

  /** The next output sample in [-1, 1]: ducked music plus whatever clip is playing. */
  private nextSample(): number {
    this.advanceGain();
    this.startQueuedClipIfDucked();
    return this.nextMusicSample() * this.gain + this.nextClipSample();
  }

  /** Moves the music gain one step toward its target: the duck level while a clip is queued or playing, else full. */
  private advanceGain(): void {
    const ducking = this.currentClip !== null || this.clipQueue.length > 0;
    const target = ducking ? this.duckLevel : 1;
    if (this.gain > target) {
      this.gain = Math.max(target, this.gain - this.gainStep);
    } else if (this.gain < target) {
      this.gain = Math.min(target, this.gain + this.gainStep);
    }
  }

  private startQueuedClipIfDucked(): void {
    if (!this.currentClip && this.clipQueue.length > 0 && this.gain <= this.duckLevel) {
      this.currentClip = this.clipQueue.shift() ?? null;
      this.clipPosition = 0;
    }
  }

  private nextMusicSample(): number {
    if (this.musicDone) {
      return 0;
    }
    const sample = this.music[this.musicPosition] / 32768;
    this.musicPosition++;
    if (this.musicPosition >= this.music.length) {
      this.musicPosition = 0;
      this.musicDone = !this.loop;
    }
    return sample;
  }

  private nextClipSample(): number {
    const clip = this.currentClip;
    if (!clip) {
      return 0;
    }
    const sample = clip.Pcm[this.clipPosition] / 32768;
    this.clipPosition++;
    if (this.clipPosition >= clip.Pcm.length) {
      this.currentClip = null;
      clip.Done(true);
    }
    return sample;
  }

  /** Ends the pump once: cancels the ticker, fails any pending clips, reports the reason. */
  private finish(reason: PumpEndReason): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.running = false;
    this.paused = false;
    try {
      this.ticker?.Cancel();
    } finally {
      this.ticker = null;
      this.failPendingClips();
      this.onEnded?.(reason);
    }
  }

  private failPendingClips(): void {
    const pending = this.currentClip ? [this.currentClip, ...this.clipQueue] : [...this.clipQueue];
    this.currentClip = null;
    this.clipQueue.length = 0;
    for (const clip of pending) {
      clip.Done(false);
    }
  }
}
