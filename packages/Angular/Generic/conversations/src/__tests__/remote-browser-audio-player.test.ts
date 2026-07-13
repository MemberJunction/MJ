import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IAudioSink,
  RemoteBrowserAudioChunkInput,
  RemoteBrowserAudioPlayer,
} from '../lib/components/realtime/remote-browser/remote-browser-audio-player';

/**
 * A fake {@link IAudioSink} recording every append (decoded back to its base64 form for easy assertion)
 * plus the open/close/mute lifecycle — the seam that lets the player's queue/seq/drain logic be unit-tested
 * with no browser media stack.
 */
class FakeAudioSink implements IAudioSink {
  public OpenCount = 0;
  public CloseCount = 0;
  public Appended: string[] = [];
  public MutedStates: boolean[] = [];
  private open = false;
  /** When true, the next {@link Open} rejects (to exercise the open-failure path). */
  public FailNextOpen = false;
  /** When true, every {@link AppendChunk} rejects (to exercise the drop-on-append path). */
  public FailAppends = false;

  public get IsOpen(): boolean {
    return this.open;
  }

  public async Open(): Promise<void> {
    this.OpenCount++;
    if (this.FailNextOpen) {
      this.FailNextOpen = false;
      throw new Error('open failed');
    }
    this.open = true;
  }

  public async AppendChunk(bytes: Uint8Array): Promise<void> {
    if (this.FailAppends) {
      throw new Error('append failed');
    }
    this.Appended.push(Buffer.from(bytes).toString('base64'));
  }

  public SetMuted(muted: boolean): void {
    this.MutedStates.push(muted);
  }

  public Close(): void {
    this.CloseCount++;
    this.open = false;
  }
}

/** Builds a webm-opus chunk input with the given base64 payload + seq. */
function chunk(dataBase64: string, seq: number, codec = 'webm-opus'): RemoteBrowserAudioChunkInput {
  return { dataBase64, codec, sampleRate: 48000, channels: 2, seq };
}

describe('RemoteBrowserAudioPlayer', () => {
  let sink: FakeAudioSink;
  let player: RemoteBrowserAudioPlayer;

  beforeEach(() => {
    sink = new FakeAudioSink();
    player = new RemoteBrowserAudioPlayer(sink);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('opens the sink lazily and appends decoded chunk bytes in order', async () => {
    player.Enqueue(chunk('QUJD', 0)); // "ABC"
    player.Enqueue(chunk('REVG', 1)); // "DEF"
    // Let the async open + drain settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(sink.OpenCount).toBe(1);
    expect(sink.Appended).toEqual(['QUJD', 'REVG']);
  });

  it('drops chunks whose codec is not webm-opus (never appends them)', async () => {
    player.Enqueue(chunk('QUJD', 0, 'pcm16'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sink.OpenCount).toBe(0);
    expect(sink.Appended).toEqual([]);
  });

  it('ignores empty / malformed chunks', async () => {
    player.Enqueue(chunk('', 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(sink.Appended).toEqual([]);
  });

  it('warns on a sequence gap but still plays the chunk', async () => {
    player.Enqueue(chunk('QUJD', 0));
    player.Enqueue(chunk('REVG', 5)); // gap: 1..4 missing
    await new Promise((r) => setTimeout(r, 0));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('sequence gap'));
    expect(sink.Appended).toEqual(['QUJD', 'REVG']);
  });

  it('bounds the queue (drops oldest) so a burst beyond capacity never grows unbounded', () => {
    // Make appends hang by never opening: enqueue many before any drain completes.
    // Use a sink that stays closed so nothing drains and the queue fills.
    const stuckSink = new FakeAudioSink();
    stuckSink.Open = async () => { /* never marks open → drain never runs */ };
    const stuckPlayer = new RemoteBrowserAudioPlayer(stuckSink);
    for (let i = 0; i < 200; i++) {
      stuckPlayer.Enqueue(chunk('QUJD', i));
    }
    // The internal cap is 64; the queue must not exceed it.
    expect(stuckPlayer.QueueDepth).toBeLessThanOrEqual(64);
  });

  it('continues after a single append failure (drops the chunk, keeps draining)', async () => {
    sink.FailAppends = true;
    player.Enqueue(chunk('QUJD', 0));
    await new Promise((r) => setTimeout(r, 0));
    // Open happened, the append was attempted + dropped, nothing recorded.
    expect(sink.OpenCount).toBe(1);
    expect(sink.Appended).toEqual([]);
  });

  it('recovers when the sink open fails, then retries on the next chunk', async () => {
    sink.FailNextOpen = true;
    player.Enqueue(chunk('QUJD', 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(sink.OpenCount).toBe(1);
    expect(sink.Appended).toEqual([]);

    // Next chunk retries the open (which now succeeds) and plays both queued chunks.
    player.Enqueue(chunk('REVG', 1));
    await new Promise((r) => setTimeout(r, 0));
    expect(sink.OpenCount).toBe(2);
    expect(sink.Appended).toEqual(['QUJD', 'REVG']);
  });

  it('applies muted state to the sink once open (toggle before the first chunk)', async () => {
    player.SetMuted(true); // toggled before any audio — latched
    player.Enqueue(chunk('QUJD', 0));
    await new Promise((r) => setTimeout(r, 0));
    // The latched muted state is applied at open time.
    expect(sink.MutedStates).toContain(true);
  });

  it('relays a later mute toggle to the open sink', async () => {
    player.Enqueue(chunk('QUJD', 0));
    await new Promise((r) => setTimeout(r, 0));
    player.SetMuted(true);
    expect(sink.MutedStates[sink.MutedStates.length - 1]).toBe(true);
  });

  it('Dispose clears the queue and closes the sink; later chunks are ignored', async () => {
    player.Enqueue(chunk('QUJD', 0));
    await new Promise((r) => setTimeout(r, 0));
    player.Dispose();
    expect(sink.CloseCount).toBe(1);

    player.Enqueue(chunk('REVG', 1));
    await new Promise((r) => setTimeout(r, 0));
    // No new appends after disposal.
    expect(sink.Appended).toEqual(['QUJD']);
  });
});
