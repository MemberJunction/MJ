/**
 * @fileoverview Retry queue for crash-recovery audio shards.
 *
 * The browser recorder is snapshotted every ~15 s and each snapshot ("shard") is uploaded so a tab
 * crash loses at most one window of audio. Before this queue a failed upload was never retried, so a
 * single transient error left a permanent gap in the recovered recording (#5197). The queue keeps
 * failed shards and resends them, oldest first, on later flushes — bounded so a dead server cannot
 * grow memory without limit.
 *
 * @module @memberjunction/realtime-runtime
 */

/** Takes the audio recorded since the previous snapshot as base64, or null/'' when there is none. */
export type ShardSnapshot = () => Promise<string | null>;

/** Resolves true when the server stored the shard; false or a throw are both failures. */
export type ShardUpload = (segmentIndex: number, audioBase64: string) => Promise<boolean>;

/** Total upload attempts per shard (the first try plus retries) before it is dropped. */
export const MAX_SHARD_UPLOAD_ATTEMPTS = 3;

/**
 * Flushes allowed in flight at once. Ticks are 15 s apart, so overlap only happens when an upload is
 * slower than a tick; an unbounded pile-up on a dead network would snapshot (and hold in memory) a
 * new window every tick. A skipped tick costs nothing: the recorder keeps the audio and the next
 * flush ships the larger window. While both slots are pinned the recorder cursor does not advance,
 * so the next capture is one larger window (bounded by the upload timeout x attempts); if that
 * shard is later dropped, recovery fills a correspondingly longer gap with silence.
 */
export const MAX_CONCURRENT_FLUSHES = 2;

/**
 * Per-attempt upload deadline. A hung request would otherwise pin one of the
 * {@link MAX_CONCURRENT_FLUSHES} slots forever and silently stop all later shards. A timeout counts
 * as a failed attempt; if the request later succeeds anyway that is harmless, because the server
 * key is per-index and a resend is an idempotent overwrite.
 */
export const SHARD_UPLOAD_TIMEOUT_MS = 60_000;

/** One-line reason for a warn message; the raw value is still passed along for its stack. */
function describeFailure(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

interface PendingShard {
  Index: number;
  AudioBase64: string;
  Attempts: number;
}

/**
 * Assigns chronological indexes to crash-recovery shards, uploads them, and retains failures for
 * retry on later flushes. Safe to call {@link Flush} from an overlapping timer.
 */
export class RecordingShardQueue {
  private nextIndex = 0;
  private retained: PendingShard[] = [];
  private inFlight = 0;
  /** True once a capacity stall has been logged; cleared when a flush actually runs. */
  private capacityWarned = false;
  /**
   * Serializes "take a snapshot, then assign an index". The recorder advances its cursor
   * synchronously but encodes asynchronously, so two overlapping snapshots could resolve out of
   * order and give newer audio an older index. Never rejected: the link catches internally.
   */
  private captureChain: Promise<void> = Promise.resolve();

  /** Shards awaiting a retry (for tests and diagnostics). */
  public get RetainedCount(): number {
    return this.retained.length;
  }

  /**
   * Takes ownership of retained shards, captures a new window, then uploads the batch oldest-first.
   * A failure never stops the rest of the batch. Skips entirely (no snapshot) when
   * {@link MAX_CONCURRENT_FLUSHES} are already running. Never rejects.
   */
  public async Flush(snapshot: ShardSnapshot, upload: ShardUpload): Promise<void> {
    if (this.inFlight >= MAX_CONCURRENT_FLUSHES) {
      this.warnCapacitySkip();
      return;
    }
    this.capacityWarned = false;
    this.inFlight++;
    try {
      // Swap the array out so a concurrent flush only sees shards nobody is currently sending.
      const batch = this.retained;
      this.retained = [];
      const fresh = await this.captureShard(snapshot);
      if (fresh) {
        // Already index-ordered: `send` keeps retained sorted and a fresh index exceeds every earlier one.
        batch.push(fresh);
      }
      for (const shard of batch) {
        await this.send(shard, upload);
      }
    } finally {
      this.inFlight--;
    }
  }

  /** Warns once per stall so a wedged uploader is visible without logging every 15 s tick. */
  private warnCapacitySkip(): void {
    if (this.capacityWarned) {
      return;
    }
    this.capacityWarned = true;
    console.warn(
      `[RealtimeSession] Recording flush skipped: at capacity with ${this.inFlight}/${MAX_CONCURRENT_FLUSHES} flushes in flight and ${this.retained.length} shard(s) retained. The recorder keeps the audio for the next flush.`,
    );
  }

  private captureShard(snapshot: ShardSnapshot): Promise<PendingShard | null> {
    const capture = this.captureChain.then(() => this.takeIndexedSnapshot(snapshot));
    this.captureChain = capture.then(() => undefined);
    return capture;
  }

  private async takeIndexedSnapshot(snapshot: ShardSnapshot): Promise<PendingShard | null> {
    try {
      const audio = await snapshot();
      if (!audio) {
        return null;
      }
      return { Index: this.nextIndex++, AudioBase64: audio, Attempts: 0 };
    } catch (error) {
      console.warn('[RealtimeSession] Failed to snapshot recording shard:', error);
      return null;
    }
  }

  private async uploadWithTimeout(upload: ShardUpload, shard: PendingShard): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`upload timed out after ${SHARD_UPLOAD_TIMEOUT_MS}ms`)), SHARD_UPLOAD_TIMEOUT_MS);
    });
    try {
      return await Promise.race([upload(shard.Index, shard.AudioBase64), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async send(shard: PendingShard, upload: ShardUpload): Promise<void> {
    shard.Attempts++;
    let stored = false;
    let failure: unknown = 'server refused the shard';
    try {
      stored = await this.uploadWithTimeout(upload, shard);
    } catch (error) {
      failure = error;
    }
    if (stored) {
      return;
    }
    if (shard.Attempts >= MAX_SHARD_UPLOAD_ATTEMPTS) {
      console.warn(
        `[RealtimeSession] Dropping recording shard ${shard.Index} after ${shard.Attempts}/${MAX_SHARD_UPLOAD_ATTEMPTS} failed uploads (${describeFailure(failure)}); recovery will fill the gap with silence:`,
        failure,
      );
      return;
    }
    console.warn(
      `[RealtimeSession] Recording shard ${shard.Index} upload failed (attempt ${shard.Attempts}/${MAX_SHARD_UPLOAD_ATTEMPTS}: ${describeFailure(failure)}); will retry next flush:`,
      failure,
    );
    // Sorted re-insert: concurrent flushes can fail out of index order, and the oldest must go first.
    this.retained.push(shard);
    this.retained.sort((a, b) => a.Index - b.Index);
  }
}
