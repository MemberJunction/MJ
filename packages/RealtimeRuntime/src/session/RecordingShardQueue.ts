/**
 * @fileoverview Retry queue for indexed recording shards.
 *
 * The recorder cuts the call's Opus stream into already-indexed `MJOPUS1` shards (see
 * {@link RecordingShardWindow}) and each one is uploaded as it seals. Before this queue a failed
 * upload was never retried, so a single transient error left a permanent gap in the recovered
 * recording (#5197). The queue keeps failed shards and resends them, oldest first, on later
 * flushes — bounded so a dead server cannot grow memory without limit. A shard the queue gives up on
 * is not lost: it stays in the IndexedDB store and is drained on a later load.
 *
 * @module @memberjunction/realtime-runtime
 */
import type { RecordingShard } from './RecordingShardWindow';

/** Resolves true when the server stored the shard; false or a throw are both failures. */
export type ShardUpload = (shard: RecordingShard) => Promise<boolean>;

/** Total upload attempts per shard (the first try plus retries) before it is dropped. */
export const MAX_SHARD_UPLOAD_ATTEMPTS = 3;

/**
 * Flushes allowed in flight at once. Flushes are ~5 s apart, so overlap only happens when an upload
 * is slower than a tick; an unbounded pile-up on a dead network would start a new batch of uploads
 * every tick. A flush that arrives at capacity does not upload, but it does not lose its shards
 * either: they are retained and the next flush that has a free slot sends them, oldest first.
 */
export const MAX_CONCURRENT_FLUSHES = 2;

/**
 * Per-attempt upload deadline. A hung request would otherwise pin one of the
 * {@link MAX_CONCURRENT_FLUSHES} slots forever and silently stop all later shards. A timeout counts
 * as a failed attempt; if the request later succeeds anyway that is harmless, because the server
 * key is per-index and a resend of the same bytes is an idempotent overwrite. The timeout is
 * logical only: the transport may accept no AbortSignal, so a timed-out request may still be on the
 * wire. Requests stay rate-bounded regardless (at most {@link MAX_CONCURRENT_FLUSHES} flushes, each
 * sending at most one batch, per timeout window).
 */
export const SHARD_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Cap on shards held for retry: 10 minutes of 5 s shards. A dead network with flushes at capacity
 * would otherwise grow the retained list (and its bytes) without bound. Overflow drops the oldest;
 * dropped shards remain in the IndexedDB store for the next-load drain.
 */
export const MAX_RETAINED_SHARDS = 120;

/** One-line reason for a warn message; the raw value is still passed along for its stack. */
function describeFailure(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

interface PendingShard {
  Shard: RecordingShard;
  Attempts: number;
}

/**
 * Uploads indexed shards and retains failures for retry on later flushes. A retry keeps its shard's
 * index and bytes. Safe to call {@link Flush} from an overlapping timer.
 */
export class RecordingShardQueue {
  private retained: PendingShard[] = [];
  private inFlight = 0;
  /** True once a capacity stall has been logged; cleared when a flush actually runs. */
  private capacityWarned = false;
  /** Set by {@link Close} when the recording ends; nothing is sent or retained after it. */
  private closed = false;

  constructor(private readonly upload: ShardUpload) {}

  /** Shards awaiting a retry (for tests and diagnostics). */
  public get RetainedCount(): number {
    return this.retained.length;
  }

  /**
   * Uploads retained shards oldest-first, then `fresh`. A failure never stops the rest of the
   * flush. At {@link MAX_CONCURRENT_FLUSHES} in flight nothing is uploaded and `fresh` is retained
   * for the next flush instead. Never rejects.
   */
  public async Flush(fresh: RecordingShard[]): Promise<void> {
    if (this.closed) {
      if (fresh.length > 0) {
        console.warn(
          `[RealtimeSession] Recording flush after the recording ended; shard(s) ${fresh.map((s) => s.Index).join(', ')} not sent — they stay in the local store and are drained later.`,
        );
      }
      return;
    }
    const freshPending = fresh.map((shard): PendingShard => ({ Shard: shard, Attempts: 0 }));
    if (this.inFlight >= MAX_CONCURRENT_FLUSHES) {
      this.retain(freshPending);
      this.warnCapacitySkip();
      return;
    }
    this.capacityWarned = false;
    this.inFlight++;
    try {
      // Swap the array out so a concurrent flush only sees shards nobody is currently sending.
      const batch = [...this.retained, ...freshPending].sort((a, b) => a.Shard.Index - b.Shard.Index);
      this.retained = [];
      for (const pending of batch) {
        // Re-checked before every send: a flush running when the recording ends must not keep
        // uploading shards the terminal request is about to supersede.
        if (this.closed) {
          return;
        }
        await this.send(pending);
      }
    } finally {
      this.inFlight--;
    }
  }

  /**
   * Ends the queue with its recording: discards retained shards and stops any flush in flight from
   * sending more. An upload already on the wire cannot be aborted, so at most that one request can
   * still land. Discarded shards remain in the IndexedDB store and are drained on a later load.
   */
  public Close(): void {
    this.closed = true;
    this.retained = [];
  }

  /** Sorted re-insert: concurrent flushes can fail out of index order, and the oldest must go first. */
  private retain(pending: PendingShard[]): void {
    this.retained.push(...pending);
    this.retained.sort((a, b) => a.Shard.Index - b.Shard.Index);
    const overflow = this.retained.length - MAX_RETAINED_SHARDS;
    if (overflow > 0) {
      const dropped = this.retained.splice(0, overflow);
      console.warn(
        `[RealtimeSession] Retry queue over ${MAX_RETAINED_SHARDS} shards; dropped oldest shard(s) ${dropped.map((p) => p.Shard.Index).join(', ')} from memory — they stay in the local IndexedDB store and are drained on the next load.`,
      );
    }
  }

  /** Warns once per stall so a wedged uploader is visible without logging every tick. */
  private warnCapacitySkip(): void {
    if (this.capacityWarned) {
      return;
    }
    this.capacityWarned = true;
    console.warn(
      `[RealtimeSession] Recording flush at capacity: ${this.inFlight}/${MAX_CONCURRENT_FLUSHES} flushes in flight, ${this.retained.length} shard(s) retained. Retained shards are sent by the next flush with a free slot.`,
    );
  }

  private async uploadWithTimeout(shard: RecordingShard): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`upload timed out after ${SHARD_UPLOAD_TIMEOUT_MS}ms`)), SHARD_UPLOAD_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.upload(shard), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async send(pending: PendingShard): Promise<void> {
    const { Shard: shard } = pending;
    pending.Attempts++;
    let stored = false;
    let failure: unknown = 'server refused the shard';
    try {
      stored = await this.uploadWithTimeout(shard);
    } catch (error) {
      failure = error;
    }
    if (stored) {
      return;
    }
    if (this.closed) {
      console.warn(
        `[RealtimeSession] Recording shard ${shard.Index} upload failed after the recording ended (${describeFailure(failure)}); not retried — it stays in the local store and is drained later:`,
        failure,
      );
      return;
    }
    if (pending.Attempts >= MAX_SHARD_UPLOAD_ATTEMPTS) {
      console.warn(
        `[RealtimeSession] Dropping recording shard ${shard.Index} from the retry queue after ${pending.Attempts}/${MAX_SHARD_UPLOAD_ATTEMPTS} failed uploads (${describeFailure(failure)}); it stays in the local store and is drained later:`,
        failure,
      );
      return;
    }
    console.warn(
      `[RealtimeSession] Recording shard ${shard.Index} upload failed (attempt ${pending.Attempts}/${MAX_SHARD_UPLOAD_ATTEMPTS}: ${describeFailure(failure)}); will retry next flush:`,
      failure,
    );
    this.retain([pending]);
  }
}
