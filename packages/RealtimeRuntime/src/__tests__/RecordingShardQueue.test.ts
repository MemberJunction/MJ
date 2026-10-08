import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  MAX_CONCURRENT_FLUSHES,
  MAX_SHARD_UPLOAD_ATTEMPTS,
  RecordingShardQueue,
  SHARD_UPLOAD_TIMEOUT_MS,
  type ShardSnapshot,
  type ShardUpload,
} from '../session/RecordingShardQueue';

interface Deferred<T> {
  Promise: Promise<T>;
  Resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { Promise: promise, Resolve: resolve };
}

/** Lets every already-resolved promise continuation run. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const snapshotOf = (audio: string | null): ShardSnapshot => vi.fn(async () => audio);

interface UploadCall {
  Index: number;
  Audio: string;
}

/** An upload that records its calls and answers from `outcome` (default: stored). */
function recordingUpload(
  outcome: (call: UploadCall, attempt: number) => boolean | Error = () => true,
): { Upload: ShardUpload; Calls: UploadCall[] } {
  const calls: UploadCall[] = [];
  const upload: ShardUpload = async (index, audio) => {
    const call = { Index: index, Audio: audio };
    calls.push(call);
    const attempt = calls.filter((c) => c.Index === index).length;
    const result = outcome(call, attempt);
    if (result instanceof Error) throw result;
    return result;
  };
  return { Upload: upload, Calls: calls };
}

describe('RecordingShardQueue', () => {
  let warn: MockInstance;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('assigns indexes 0, 1, 2 across successful flushes', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload();
    await queue.Flush(snapshotOf('a'), Upload);
    await queue.Flush(snapshotOf('b'), Upload);
    await queue.Flush(snapshotOf('c'), Upload);
    expect(Calls.map((c) => c.Index)).toEqual([0, 1, 2]);
    expect(queue.RetainedCount).toBe(0);
  });

  it('resends a refused shard with the same index and bytes, before the new shard', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload((call, attempt) => !(call.Index === 0 && attempt === 1));
    await queue.Flush(snapshotOf('a'), Upload);
    expect(queue.RetainedCount).toBe(1);
    await queue.Flush(snapshotOf('b'), Upload);
    expect(Calls).toEqual([
      { Index: 0, Audio: 'a' },
      { Index: 0, Audio: 'a' },
      { Index: 1, Audio: 'b' },
    ]);
    expect(queue.RetainedCount).toBe(0);
  });

  it('retains a shard whose upload threw', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload((call, attempt) =>
      call.Index === 0 && attempt === 1 ? new Error('network down') : true,
    );
    await queue.Flush(snapshotOf('a'), Upload);
    expect(queue.RetainedCount).toBe(1);
    await queue.Flush(snapshotOf(null), Upload);
    expect(Calls.map((c) => c.Index)).toEqual([0, 0]);
    expect(queue.RetainedCount).toBe(0);
  });

  it('drops a shard after MAX_SHARD_UPLOAD_ATTEMPTS failures, warns with its index, and never reuses the index', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload((call) => call.Index !== 0);
    await queue.Flush(snapshotOf('a'), Upload);
    for (let i = 1; i < MAX_SHARD_UPLOAD_ATTEMPTS; i++) {
      await queue.Flush(snapshotOf(null), Upload);
    }
    expect(queue.RetainedCount).toBe(0);
    const dropWarning = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('Dropping'));
    expect(dropWarning).toBeDefined();
    expect(dropWarning).toContain('shard 0');
    expect(dropWarning).toContain('silence');
    await queue.Flush(snapshotOf('b'), Upload);
    expect(Calls[Calls.length - 1]).toEqual({ Index: 1, Audio: 'b' });
  });

  it('uses no index for a null snapshot but still retries retained shards', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload((call, attempt) => !(call.Index === 0 && attempt === 1));
    await queue.Flush(snapshotOf('a'), Upload);
    await queue.Flush(snapshotOf(null), Upload);
    await queue.Flush(snapshotOf('b'), Upload);
    expect(Calls.map((c) => c.Index)).toEqual([0, 0, 1]);
  });

  it('uses no index for an empty-string snapshot', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload();
    await queue.Flush(snapshotOf(''), Upload);
    await queue.Flush(snapshotOf('a'), Upload);
    expect(Calls).toEqual([{ Index: 0, Audio: 'a' }]);
  });

  it('warns about a throwing snapshot and still retries retained shards', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload((call, attempt) => !(call.Index === 0 && attempt === 1));
    await queue.Flush(snapshotOf('a'), Upload);
    const failing: ShardSnapshot = async () => {
      throw new Error('encoder exploded');
    };
    await expect(queue.Flush(failing, Upload)).resolves.toBeUndefined();
    expect(Calls.map((c) => c.Index)).toEqual([0, 0]);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('snapshot'))).toBe(true);
  });

  it('never uploads the same retained shard twice at once across concurrent flushes, and stores every shard', async () => {
    const queue = new RecordingShardQueue();
    const stored = new Set<number>();
    const active = new Map<number, number>();
    const gates: Array<Deferred<void>> = [];
    let maxActiveForAnyIndex = 0;
    let refuseFirstOfShardZero = true;
    const upload: ShardUpload = async (index) => {
      if (index === 0 && refuseFirstOfShardZero) {
        refuseFirstOfShardZero = false;
        return false;
      }
      active.set(index, (active.get(index) ?? 0) + 1);
      maxActiveForAnyIndex = Math.max(maxActiveForAnyIndex, active.get(index) ?? 0);
      const gate = createDeferred<void>();
      gates.push(gate);
      await gate.Promise;
      active.set(index, (active.get(index) ?? 1) - 1);
      stored.add(index);
      return true;
    };
    await queue.Flush(snapshotOf('a'), upload);
    expect(queue.RetainedCount).toBe(1);

    const flushes = [queue.Flush(snapshotOf('b'), upload), queue.Flush(snapshotOf(null), upload)];
    for (let i = 0; i < 10 && stored.size < 2; i++) {
      await settle();
      gates.shift()?.Resolve();
    }
    await Promise.all(flushes);

    expect(maxActiveForAnyIndex).toBe(1);
    expect([...stored].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('keeps RetainedCount at MAX_SHARD_UPLOAD_ATTEMPTS - 1 or fewer when uploads always fail', async () => {
    const queue = new RecordingShardQueue();
    const { Upload } = recordingUpload(() => false);
    for (let i = 0; i < 10; i++) {
      await queue.Flush(snapshotOf(`s${i}`), Upload);
      expect(queue.RetainedCount).toBeLessThanOrEqual(MAX_SHARD_UPLOAD_ATTEMPTS - 1);
    }
    expect(queue.RetainedCount).toBe(MAX_SHARD_UPLOAD_ATTEMPTS - 1);
  });

  it('keeps chronological indexes when the first snapshot resolves after a second flush started', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload();
    const first = createDeferred<string | null>();
    const second = createDeferred<string | null>();
    const snapshot1 = vi.fn(() => first.Promise);
    const snapshot2 = vi.fn(() => second.Promise);

    const flush1 = queue.Flush(snapshot1, Upload);
    const flush2 = queue.Flush(snapshot2, Upload);
    await settle();
    // Snapshot 2 must not even be taken until snapshot 1 has been indexed.
    expect(snapshot2).not.toHaveBeenCalled();

    first.Resolve('older');
    await settle();
    second.Resolve('newer');
    await Promise.all([flush1, flush2]);

    expect(Calls.find((c) => c.Audio === 'older')?.Index).toBe(0);
    expect(Calls.find((c) => c.Audio === 'newer')?.Index).toBe(1);
  });

  it('uploads retained shards even when the new window\'s snapshot never resolves', async () => {
    const queue = new RecordingShardQueue();
    const stored = new Set<number>();
    let refuseFirst = true;
    const upload: ShardUpload = async (index) => {
      if (refuseFirst) {
        refuseFirst = false;
        return false;
      }
      stored.add(index);
      return true;
    };
    await queue.Flush(snapshotOf('a'), upload);
    expect(queue.RetainedCount).toBe(1);

    // The hung snapshot must not strand the already-failed shard behind it.
    const hungFlush = queue.Flush(() => new Promise<string | null>(() => undefined), upload);
    await settle();
    expect([...stored]).toEqual([0]);
    expect(queue.RetainedCount).toBe(0);
    void hungFlush;
  });

  it('skips a flush without snapshotting when MAX_CONCURRENT_FLUSHES are in flight', async () => {
    expect(MAX_CONCURRENT_FLUSHES).toBe(2);
    const queue = new RecordingShardQueue();
    // Shard 0 fails once and is retained; flush 1 below takes ownership of it.
    await queue.Flush(snapshotOf('a'), recordingUpload(() => false).Upload);
    expect(queue.RetainedCount).toBe(1);

    const uploadGate = createDeferred<boolean>();
    const uploadedIndexes: number[] = [];
    const gatedUpload: ShardUpload = (index) => {
      uploadedIndexes.push(index);
      return uploadGate.Promise;
    };
    const snapshotGate = createDeferred<string | null>();
    // Flush 1 takes shard 0 into its in-flight batch and hangs in its upload; flush 2 hangs in its snapshot.
    // The skipped third call must therefore not upload shard 0, and nothing is left retained.
    const flush1 = queue.Flush(snapshotOf(null), gatedUpload);
    const flush2 = queue.Flush(() => snapshotGate.Promise, gatedUpload);
    await settle();
    expect(uploadedIndexes).toEqual([0]);
    expect(queue.RetainedCount).toBe(0);

    const third = vi.fn(async () => 'c');
    await queue.Flush(third, gatedUpload);
    expect(third).not.toHaveBeenCalled();
    expect(queue.RetainedCount).toBe(0);
    expect(uploadedIndexes).toEqual([0]);

    uploadGate.Resolve(true);
    snapshotGate.Resolve(null);
    await Promise.all([flush1, flush2]);
    // Capacity is released: a later flush snapshots again.
    await queue.Flush(third, gatedUpload);
    expect(third).toHaveBeenCalledTimes(1);
  });

  it('warns once per capacity stall, not once per skipped tick', async () => {
    const queue = new RecordingShardQueue();
    const { Upload } = recordingUpload();
    const gates = [createDeferred<string | null>(), createDeferred<string | null>()];
    const flushes = gates.map((gate) => queue.Flush(() => gate.Promise, Upload));
    await queue.Flush(snapshotOf('x'), Upload);
    await queue.Flush(snapshotOf('y'), Upload);
    const stallWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('at capacity'));
    expect(stallWarnings).toHaveLength(1);
    expect(String(stallWarnings[0][0])).toContain('in flight');
    expect(String(stallWarnings[0][0])).toContain('retained');

    gates.forEach((gate) => gate.Resolve(null));
    await Promise.all(flushes);
    // A flush that actually runs ends the stall, so the next stall warns again.
    const again = gates.map(() => createDeferred<string | null>());
    const flushesAgain = again.map((gate) => queue.Flush(() => gate.Promise, Upload));
    await queue.Flush(snapshotOf('z'), Upload);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('at capacity'))).toHaveLength(2);
    again.forEach((gate) => gate.Resolve(null));
    await Promise.all(flushesAgain);
  });

  describe('upload timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('treats a never-resolving upload as failed after SHARD_UPLOAD_TIMEOUT_MS, retains it and releases capacity', async () => {
      const queue = new RecordingShardQueue();
      const hung: ShardUpload = () => new Promise<boolean>(() => undefined);
      const flushes = [queue.Flush(snapshotOf('a'), hung), queue.Flush(snapshotOf('b'), hung)];
      await vi.advanceTimersByTimeAsync(SHARD_UPLOAD_TIMEOUT_MS);
      await Promise.all(flushes);

      expect(queue.RetainedCount).toBe(2);
      const timeoutWarning = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('timed out'));
      expect(timeoutWarning).toBeDefined();
      expect(timeoutWarning).toContain(`attempt 1/${MAX_SHARD_UPLOAD_ATTEMPTS}`);
      expect(timeoutWarning).toContain(String(SHARD_UPLOAD_TIMEOUT_MS));
      expect(vi.getTimerCount()).toBe(0);

      // inFlight was released, so the next flush runs and retries both shards oldest-first.
      const { Upload, Calls } = recordingUpload();
      const snapshot = snapshotOf(null);
      await queue.Flush(snapshot, Upload);
      expect(snapshot).toHaveBeenCalledTimes(1);
      expect(Calls.map((c) => c.Index)).toEqual([0, 1]);
    });

    it('a timed-out upload that LATER rejects causes no unhandled rejection and no extra retained entry', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const queue = new RecordingShardQueue();
        let rejectLate!: (reason: Error) => void;
        const slow: ShardUpload = () =>
          new Promise<boolean>((_, reject) => {
            rejectLate = reject;
          });
        const flush = queue.Flush(snapshotOf('a'), slow);
        await vi.advanceTimersByTimeAsync(SHARD_UPLOAD_TIMEOUT_MS);
        await flush;
        expect(queue.RetainedCount).toBe(1);

        rejectLate(new Error('late failure'));
        await vi.advanceTimersByTimeAsync(0);
        expect(queue.RetainedCount).toBe(1);
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });

    it('a timed-out upload that LATER resolves true still leaves exactly one retained entry (idempotent same-index retry)', async () => {
      const queue = new RecordingShardQueue();
      let resolveLate!: (stored: boolean) => void;
      const slow: ShardUpload = () =>
        new Promise<boolean>((resolve) => {
          resolveLate = resolve;
        });
      const flush = queue.Flush(snapshotOf('a'), slow);
      await vi.advanceTimersByTimeAsync(SHARD_UPLOAD_TIMEOUT_MS);
      await flush;

      resolveLate(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(queue.RetainedCount).toBe(1);
    });

    it('clears the timer when the upload settles in time', async () => {
      const queue = new RecordingShardQueue();
      await queue.Flush(snapshotOf('a'), recordingUpload().Upload);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('retries retained shards in index order even when they failed out of order', async () => {
    const queue = new RecordingShardQueue();
    const firstRound: Record<number, Deferred<boolean>> = {
      0: createDeferred<boolean>(),
      1: createDeferred<boolean>(),
    };
    const seen: number[] = [];
    let firstRoundOver = false;
    const upload: ShardUpload = async (index) => {
      seen.push(index);
      return firstRoundOver ? true : firstRound[index].Promise;
    };
    const flush1 = queue.Flush(snapshotOf('a'), upload);
    await settle();
    const flush2 = queue.Flush(snapshotOf('b'), upload);
    await settle();
    // Shard 1 fails before shard 0 does.
    firstRound[1].Resolve(false);
    await settle();
    firstRound[0].Resolve(false);
    await Promise.all([flush1, flush2]);
    expect(queue.RetainedCount).toBe(2);

    firstRoundOver = true;
    seen.length = 0;
    await queue.Flush(snapshotOf(null), upload);
    expect(seen).toEqual([0, 1]);
  });

  it('makes exactly MAX_SHARD_UPLOAD_ATTEMPTS attempts for a refused shard, never one more', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload(() => false);
    await queue.Flush(snapshotOf('a'), Upload);
    for (let i = 0; i < 5; i++) await queue.Flush(snapshotOf(null), Upload);
    expect(Calls.filter((c) => c.Index === 0)).toHaveLength(MAX_SHARD_UPLOAD_ATTEMPTS);
  });

  it('makes exactly MAX_SHARD_UPLOAD_ATTEMPTS attempts for a shard whose upload throws', async () => {
    const queue = new RecordingShardQueue();
    const { Upload, Calls } = recordingUpload(() => new Error('boom'));
    await queue.Flush(snapshotOf('a'), Upload);
    for (let i = 0; i < 5; i++) await queue.Flush(snapshotOf(null), Upload);
    expect(Calls.filter((c) => c.Index === 0)).toHaveLength(MAX_SHARD_UPLOAD_ATTEMPTS);
  });

  it('resolves, never rejects, for a throwing snapshot, a throwing upload and a refusing upload', async () => {
    const throwingSnapshot: ShardSnapshot = async () => {
      throw new Error('snapshot');
    };
    await expect(new RecordingShardQueue().Flush(throwingSnapshot, recordingUpload().Upload)).resolves.toBeUndefined();
    await expect(
      new RecordingShardQueue().Flush(snapshotOf('a'), recordingUpload(() => new Error('upload')).Upload),
    ).resolves.toBeUndefined();
    await expect(
      new RecordingShardQueue().Flush(snapshotOf('a'), recordingUpload(() => false).Upload),
    ).resolves.toBeUndefined();
  });
});
