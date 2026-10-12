/**
 * @fileoverview Cuts a call's continuous Opus packet stream into indexed `MJOPUS1` shards.
 *
 * Shard boundaries are decided here, once, and never revisited: an index is only ever sent with
 * one set of bytes (the server treats a differing resend as a conflict). That is why a tail that is
 * sent early (page hidden) is *sealed* — later packets start a new shard at the next index.
 *
 * @module @memberjunction/realtime-runtime
 */
import {
  EncodeRecordingShard,
  RECORDING_FRAME_SAMPLES,
  RECORDING_PACKET_LENGTH_PREFIX_BYTES,
  RECORDING_SHARD_HEADER_BYTES,
  RECORDING_SHARD_WINDOW_PACKETS,
  RECORDING_TERMINAL_MAX_BYTES,
} from '@memberjunction/ai-core-plus';

/** One sealed, encoded shard ready to store and upload. */
export interface RecordingShard {
  /** Zero-based, contiguous position in the call's shard sequence. */
  Index: number;
  /** 48 kHz sample offset of the shard's first frame. */
  StartSample: number;
  /** Audio samples the shard covers. */
  SampleCount: number;
  /** The encoded `MJOPUS1` bytes. */
  Bytes: Uint8Array;
}

/**
 * Accumulates Opus packets and seals them into shards. Pure: no timers, no I/O.
 *
 * A window seals when it reaches {@link RECORDING_SHARD_WINDOW_PACKETS} packets, or just BEFORE a
 * packet that would push the encoded shard past {@link RECORDING_TERMINAL_MAX_BYTES}. The byte cap
 * guarantees that whatever tail is pending always fits the terminal request body, even after a VBR
 * spike.
 */
export class RecordingShardWindow {
  private pending: Uint8Array[] = [];
  private pendingBytes = RECORDING_SHARD_HEADER_BYTES;
  private nextIndex = 0;
  private sealedSamples = 0;

  /** Index of the last sealed shard; -1 before any seal. */
  public get LastSealedIndex(): number {
    return this.nextIndex - 1;
  }

  /** End sample of the last sealed shard. */
  public get SealedSamples(): number {
    return this.sealedSamples;
  }

  /** End sample of everything appended so far, sealed or pending. */
  public get PendingSamples(): number {
    return this.sealedSamples + this.pending.length * RECORDING_FRAME_SAMPLES;
  }

  /** Adds packets in capture order and returns every shard that sealed as a result. */
  public Append(packets: Uint8Array[]): RecordingShard[] {
    const sealed: RecordingShard[] = [];
    for (const packet of packets) {
      const cost = RECORDING_PACKET_LENGTH_PREFIX_BYTES + packet.length;
      if (this.pending.length > 0 && this.pendingBytes + cost > RECORDING_TERMINAL_MAX_BYTES) {
        sealed.push(this.seal(this.pending.length * RECORDING_FRAME_SAMPLES));
      }
      this.pending.push(packet);
      this.pendingBytes += cost;
      if (this.pending.length >= RECORDING_SHARD_WINDOW_PACKETS) {
        sealed.push(this.seal(this.pending.length * RECORDING_FRAME_SAMPLES));
      }
    }
    return sealed;
  }

  /**
   * Seals the partial window now. `sampleCount` (default packets*960) is clamped to
   * [0, packets*960]; the caller passes less when the encoder's last frame was padded. Returns null
   * when no packets are pending, so a second call is a no-op.
   */
  public SealTail(sampleCount?: number): RecordingShard | null {
    if (this.pending.length === 0) {
      return null;
    }
    const max = this.pending.length * RECORDING_FRAME_SAMPLES;
    const wanted = sampleCount ?? max;
    return this.seal(Math.min(Math.max(Math.floor(wanted), 0), max));
  }

  private seal(sampleCount: number): RecordingShard {
    const shard: RecordingShard = {
      Index: this.nextIndex,
      StartSample: this.sealedSamples,
      SampleCount: sampleCount,
      Bytes: EncodeRecordingShard({
        ShardIndex: this.nextIndex,
        StartSample: this.sealedSamples,
        SampleCount: sampleCount,
        PacketCount: this.pending.length,
        Packets: this.pending,
      }),
    };
    this.nextIndex++;
    this.sealedSamples += sampleCount;
    this.pending = [];
    this.pendingBytes = RECORDING_SHARD_HEADER_BYTES;
    return shard;
  }
}
