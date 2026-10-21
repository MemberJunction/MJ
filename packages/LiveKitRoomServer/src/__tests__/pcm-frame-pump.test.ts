import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PcmFramePump, type PcmFramePumpOptions, type PumpEndReason } from '../room-audio/pcm-frame-pump';
import { FakePumpClock } from './room-audio-test-helpers';

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn() };
});

const RATE = 48000;
const FRAME = 960; // 20 ms at 48 kHz
const LEAD = 8; // ceil(150 ms / 20 ms)

/** Constant-level PCM: `level` of full scale, `seconds` long. */
function constant(level: number, seconds: number): Int16Array {
  return new Int16Array(Math.round(seconds * RATE)).fill(Math.round(level * 32767));
}

describe('PcmFramePump', () => {
  let clock: FakePumpClock;
  let frames: Int16Array[];
  let ended: PumpEndReason[];

  beforeEach(() => {
    clock = new FakePumpClock();
    frames = [];
    ended = [];
  });

  function pump(overrides: Partial<PcmFramePumpOptions> = {}): PcmFramePump {
    return new PcmFramePump({
      Music: constant(0.5, 1),
      SampleRate: RATE,
      Clock: clock,
      Sink: (frame) => frames.push(frame),
      OnEnded: (reason) => ended.push(reason),
      ...overrides,
    });
  }

  it('sends the lead at once, then exactly one 20 ms frame per 20 ms', () => {
    const p = pump();
    p.Start();
    expect(frames.length).toBe(LEAD);
    expect(frames[0].length).toBe(FRAME);
    clock.Advance(1000);
    expect(frames.length).toBe(LEAD + 50);
    p.Stop();
  });

  it('hands the sink a fresh buffer every frame', () => {
    const p = pump();
    p.Start();
    expect(new Set(frames.map((f) => f.buffer)).size).toBe(frames.length);
    p.Stop();
  });

  it('never lets the outstanding audio grow: a long stall drops the backlog instead of bursting it', () => {
    const p = pump();
    p.Start();
    clock.Advance(100);
    const before = frames.length;
    clock.Stall(5000); // the event loop was blocked for 5 s
    expect(frames.length - before).toBeLessThanOrEqual(LEAD);
    // ...and from there it is back to real time: one frame per 20 ms.
    const afterStall = frames.length;
    clock.Advance(1000);
    expect(frames.length - afterStall).toBe(50);
    p.Stop();
  });

  it('catches up a short delay so the average rate stays exact', () => {
    const p = pump();
    p.Start();
    clock.Stall(100); // a 100 ms late tick
    expect(frames.length).toBe(LEAD + 5);
    p.Stop();
  });

  it('loops the music', () => {
    const music = new Int16Array(FRAME + FRAME / 2).map((_, i) => (i < FRAME ? 1000 : 2000));
    const p = pump({ Music: music });
    p.Start();
    // frame 0 = 960×1000; frame 1 = 480×2000 then wraps to 480×1000.
    expect(frames[1][0]).toBe(2000);
    expect(frames[1][FRAME / 2]).toBe(1000);
    expect(p.IsRunning).toBe(true);
    p.Stop();
  });

  it('ends on its own, cancelling its ticker, when non-looping music runs out', () => {
    const p = pump({ Music: constant(0.5, 0.1), Loop: false });
    p.Start();
    expect(ended).toEqual(['Completed']);
    expect(frames.length).toBe(5);
    expect(clock.HasTicker).toBe(false);
    expect(p.IsRunning).toBe(false);
  });

  it('sends nothing while paused and resumes without a burst', () => {
    const p = pump();
    p.Start();
    p.Pause();
    const paused = frames.length;
    clock.Advance(2000);
    expect(frames.length).toBe(paused);
    p.Resume();
    expect(frames.length - paused).toBe(LEAD);
    clock.Advance(200);
    expect(frames.length - paused).toBe(LEAD + 10);
    p.Stop();
  });

  it('ducks the music under an inserted clip, then brings it back', async () => {
    const p = pump();
    p.Start();
    const done = p.InsertClip(constant(0.25, 0.2));
    clock.Advance(1000);
    expect(await done).toBe(true);
    const levels = frames.map((f) => f[f.length - 1] / 32767);
    expect(levels[0]).toBeCloseTo(0.5, 2); // before the clip: full music
    expect(levels.some((l) => Math.abs(l - (0.5 * 0.15 + 0.25)) < 0.005)).toBe(true); // ducked music + clip
    expect(levels[levels.length - 1]).toBeCloseTo(0.5, 2); // after: back to full
    p.Stop();
  });

  it('plays queued clips one after another', async () => {
    const p = pump();
    p.Start();
    const first = p.InsertClip(constant(0.25, 0.1));
    const second = p.InsertClip(constant(0.25, 0.1));
    clock.Advance(1000);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    p.Stop();
  });

  it('stops for good: cancels its ticker, fails pending clips, and ignores a second stop', async () => {
    const p = pump();
    p.Start();
    const clip = p.InsertClip(constant(0.25, 5));
    p.Stop();
    p.Stop();
    expect(await clip).toBe(false);
    expect(ended).toEqual(['Stopped']);
    expect(clock.Cancelled).toBe(1);
    const count = frames.length;
    clock.Advance(500);
    expect(frames.length).toBe(count);
    expect(await p.InsertClip(constant(0.25, 0.1))).toBe(false);
  });

  it('stops with SinkError when the sink throws', () => {
    const p = pump({
      Sink: () => {
        throw new Error('track gone');
      },
    });
    p.Start();
    expect(ended).toEqual(['SinkError']);
    expect(clock.HasTicker).toBe(false);
  });

  it('reports how much sent audio is still ahead of real time', () => {
    const p = pump({ Music: constant(0.5, 0.1), Loop: false }); // 100 ms = 5 frames, all inside the initial lead
    p.Start();
    expect(ended).toEqual(['Completed']);
    expect(p.QueuedAheadMs).toBe(100);
    clock.NowMs = 60;
    expect(p.QueuedAheadMs).toBe(40);
    clock.NowMs = 250;
    expect(p.QueuedAheadMs).toBe(0);
  });

  it('refuses empty music', () => {
    expect(() => pump({ Music: new Int16Array(0) })).toThrow(/non-empty/);
  });
});
