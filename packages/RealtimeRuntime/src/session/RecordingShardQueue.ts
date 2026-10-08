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
 * flush ships the larger window.
 */
export const MAX_CONCURRENT_FLUSHES = 2;

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
      return;
    }
    this.inFlight++;
    try {
      // Swap the array out so a concurrent flush only sees shards nobody is currently sending.
      const batch = this.retained;
      this.retained = [];
      const fresh = await this.captureShard(snapshot);
      if (fresh) {
        batch.push(fresh);
      }
      batch.sort((a, b) => a.Index - b.Index);
      for (const shard of batch) {
        await this.send(shard, upload);
      }
    } finally {
      this.inFlight--;
    }
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

  private async send(shard: PendingShard, upload: ShardUpload): Promise<void> {
    shard.Attempts++;
    let stored = false;
    let failure: unknown = 'server refused the shard';
    try {
      stored = await upload(shard.Index, shard.AudioBase64);
    } catch (error) {
      failure = error;
    }
    if (stored) {
      return;
    }
    if (shard.Attempts >= MAX_SHARD_UPLOAD_ATTEMPTS) {
      console.warn(
        `[RealtimeSession] Dropping recording shard ${shard.Index} after ${shard.Attempts}/${MAX_SHARD_UPLOAD_ATTEMPTS} failed uploads; recovery will fill the gap with silence:`,
        failure,
      );
      return;
    }
    console.warn(
      `[RealtimeSession] Recording shard ${shard.Index} upload failed (attempt ${shard.Attempts}/${MAX_SHARD_UPLOAD_ATTEMPTS}); will retry next flush:`,
      failure,
    );
    // Sorted re-insert: concurrent flushes can fail out of index order, and the oldest must go first.
    this.retained.push(shard);
    this.retained.sort((a, b) => a.Index - b.Index);
  }
}
