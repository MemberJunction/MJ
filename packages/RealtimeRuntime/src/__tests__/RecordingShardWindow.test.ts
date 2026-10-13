import { describe, expect, it } from 'vitest';
import {
  ParseRecordingShard,
  RECORDING_FRAME_SAMPLES,
  RECORDING_PACKET_LENGTH_PREFIX_BYTES,
  RECORDING_SHARD_HEADER_BYTES,
  RECORDING_SHARD_WINDOW_PACKETS,
  RECORDING_TERMINAL_MAX_BYTES,
} from '@memberjunction/ai-core-plus';
import { RecordingShardWindow } from '../session/RecordingShardWindow';

const WINDOW_SAMPLES = RECORDING_SHARD_WINDOW_PACKETS * RECORDING_FRAME_SAMPLES;
const packets = (count: number, size = 40): Uint8Array[] =>
  Array.from({ length: count }, (_, i) => new Uint8Array(size).fill(i % 251));

describe('RecordingShardWindow', () => {
  it('seals a shard per format maximum (500 packets) and keeps the rest pending', () => {
    const window = new RecordingShardWindow();
    const sealed = window.Append(packets(1100));
    expect(sealed.map((s) => s.Index)).toEqual([0, 1]);
    expect(sealed.map((s) => s.StartSample)).toEqual([0, 2 * WINDOW_SAMPLES]);
    expect(sealed.map((s) => s.SampleCount)).toEqual([2 * WINDOW_SAMPLES, 2 * WINDOW_SAMPLES]);
    expect(window.LastSealedIndex).toBe(1);
    expect(window.SealedSamples).toBe(4 * WINDOW_SAMPLES);
    expect(window.PendingSamples).toBe(4 * WINDOW_SAMPLES + 100 * RECORDING_FRAME_SAMPLES);
  });

  it('a tick that took a few packets more than the window seals ONE shard, not a full window plus a sliver', () => {
    // Timer jitter hands the 5 s tick 251-255 packets; cutting at 250 then sealing the tick's tail
    // made a 1-5 packet shard every few ticks (#5294 live smoke: ~100-byte shards after full ones).
    const window = new RecordingShardWindow();
    const sealed = window.Append(packets(255));
    const tail = window.SealTail();
    const shards = tail ? [...sealed, tail] : sealed;
    expect(shards).toHaveLength(1);
    expect(ParseRecordingShard(shards[0].Bytes).PacketCount).toBe(255);
  });

  it('encodes sealed shards as parseable MJOPUS1 bytes', () => {
    const sealed = new RecordingShardWindow().Append(packets(500));
    const parsed = ParseRecordingShard(sealed[0].Bytes);
    expect(parsed.ShardIndex).toBe(0);
    expect(parsed.PacketCount).toBe(500);
    expect(parsed.SampleCount).toBe(2 * WINDOW_SAMPLES);
  });

  it('has no sealed shard initially', () => {
    const window = new RecordingShardWindow();
    expect(window.LastSealedIndex).toBe(-1);
    expect(window.SealedSamples).toBe(0);
    expect(window.PendingSamples).toBe(0);
  });

  it('SealTail seals the partial window with a clamped sample count', () => {
    const window = new RecordingShardWindow();
    window.Append(packets(600));
    const tail = window.SealTail(100 * RECORDING_FRAME_SAMPLES - 480);
    expect(tail?.Index).toBe(1);
    expect(tail?.StartSample).toBe(2 * WINDOW_SAMPLES);
    expect(tail?.SampleCount).toBe(100 * RECORDING_FRAME_SAMPLES - 480);
    expect(ParseRecordingShard(tail!.Bytes).PacketCount).toBe(100);
  });

  it('SealTail defaults to packets*960 and clamps into [0, packets*960]', () => {
    const a = new RecordingShardWindow();
    a.Append(packets(3));
    expect(a.SealTail()?.SampleCount).toBe(3 * RECORDING_FRAME_SAMPLES);
    const b = new RecordingShardWindow();
    b.Append(packets(3));
    expect(b.SealTail(10 ** 9)?.SampleCount).toBe(3 * RECORDING_FRAME_SAMPLES);
    const c = new RecordingShardWindow();
    c.Append(packets(3));
    expect(c.SealTail(-5)?.SampleCount).toBe(0);
  });

  it('SealTail returns null with no pending packets, including a second call', () => {
    const window = new RecordingShardWindow();
    expect(window.SealTail()).toBeNull();
    window.Append(packets(5));
    expect(window.SealTail()).not.toBeNull();
    expect(window.SealTail()).toBeNull();
  });

  it('continues at the next index and sample after a tail seal (never re-sends an index)', () => {
    const window = new RecordingShardWindow();
    window.Append(packets(10));
    const tail = window.SealTail();
    expect(tail?.Index).toBe(0);
    const next = window.Append(packets(500));
    expect(next[0].Index).toBe(1);
    expect(next[0].StartSample).toBe(10 * RECORDING_FRAME_SAMPLES);
  });

  it('keeps shard ranges contiguous when a tail has a trimmed sample count', () => {
    const window = new RecordingShardWindow();
    window.Append(packets(10));
    const tail = window.SealTail(10 * RECORDING_FRAME_SAMPLES - 100);
    expect(window.SealedSamples).toBe(tail!.StartSample + tail!.SampleCount);
    const next = window.Append(packets(500));
    expect(next[0].StartSample).toBe(tail!.StartSample + tail!.SampleCount);
  });

  it('seals exactly before the packet that would overflow the terminal body, and the tail fits', () => {
    const size = 200;
    const cost = RECORDING_PACKET_LENGTH_PREFIX_BYTES + size;
    const window = new RecordingShardWindow();
    const sealed = window.Append(packets(250, size)); // would be 28 + 250*202 > 48 KiB if unsealed
    expect(sealed).toHaveLength(1);
    const first = ParseRecordingShard(sealed[0].Bytes);
    expect(sealed[0].Bytes.length).toBeLessThanOrEqual(RECORDING_TERMINAL_MAX_BYTES);
    // One more packet would not have fit: the seal happened at the latest possible packet.
    expect(sealed[0].Bytes.length + cost).toBeGreaterThan(RECORDING_TERMINAL_MAX_BYTES);
    expect(sealed[0].SampleCount).toBe(first.PacketCount * RECORDING_FRAME_SAMPLES);
    const tail = window.SealTail();
    expect(tail).not.toBeNull();
    expect(tail!.Bytes.length).toBeLessThanOrEqual(RECORDING_TERMINAL_MAX_BYTES);
    expect(first.PacketCount + ParseRecordingShard(tail!.Bytes).PacketCount).toBe(250);
    expect(RECORDING_SHARD_HEADER_BYTES).toBe(28);
  });
});
