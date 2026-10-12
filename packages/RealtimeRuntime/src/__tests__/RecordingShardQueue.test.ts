import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  MAX_CONCURRENT_FLUSHES,
  MAX_SHARD_UPLOAD_ATTEMPTS,
  RecordingShardQueue,
  SHARD_UPLOAD_TIMEOUT_MS,
  type ShardUpload,
} from '../session/RecordingShardQueue';
import type { RecordingShard } from '../session/RecordingShardWindow';

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

/** A shard whose first byte identifies its content, so tests can see which bytes were resent. */
const shardOf = (index: number, marker = index): RecordingShard => ({
  Index: index,
  StartSample: index * 240000,
  SampleCount: 240000,
  Bytes: new Uint8Array([marker]),
});

interface UploadCall {
  Index: number;
  Marker: number;
}

/** An upload that records its calls and answers from `outcome` (default: stored). */
function recordingUpload(
  outcome: (call: UploadCall, attempt: number) => boolean | Error = () => true,
): { Upload: ShardUpload; Calls: UploadCall[] } {
  const calls: UploadCall[] = [];
  const upload: ShardUpload = async (shard) => {
    const call = { Index: shard.Index, Marker: shard.Bytes[0] };
    calls.push(call);
    const attempt = calls.filter((c) => c.Index === shard.Index).length;
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

  it('uploads fresh shards with the index they were sealed with', async () => {
    const { Upload, Calls } = recordingUpload();
    const queue = new RecordingShardQueue(Upload);
    await queue.Flush([shardOf(0)]);
    await queue.Flush([shardOf(1), shardOf(2)]);
    expect(Calls.map((c) => c.Index)).toEqual([0, 1, 2]);
    expect(queue.RetainedCount).toBe(0);
  });

  it('resends a refused shard with the same index and bytes, before the new shard', async () => {
    const { Upload, Calls } = recordingUpload((call, attempt) => !(call.Index === 0 && attempt === 1));
    const queue = new RecordingShardQueue(Upload);
    await queue.Flush([shardOf(0, 7)]);
    expect(queue.RetainedCount).toBe(1);
    await queue.Flush([shardOf(1, 8)]);
    expect(Calls).toEqual([
      { Index: 0, Marker: 7 },
      { Index: 0, Marker: 7 },
      { Index: 1, Marker: 8 },
    ]);
    expect(queue.RetainedCount).toBe(0);
  });

  it('retains a shard whose upload threw', async () => {
    const { Upload, Calls } = recordingUpload((call, attempt) =>
      call.Index === 0 && attempt === 1 ? new Error('network down') : true,
    );
    const queue = new RecordingShardQueue(Upload);
    await queue.Flush([shardOf(0)]);
    expect(queue.RetainedCount).toBe(1);
    await queue.Flush([]);
    expect(Calls.map((c) => c.Index)).toEqual([0, 0]);
    expect(queue.RetainedCount).toBe(0);
  });

  describe('Close (the recording ended)', () => {
    it('discards retained shards, and a later flush sends nothing', async () => {
      const { Upload, Calls } = recordingUpload(() => false);
      const queue = new RecordingShardQueue(Upload);
      await queue.Flush([shardOf(0)]);
      expect(queue.RetainedCount).toBe(1);
      queue.Close();
      expect(queue.RetainedCount).toBe(0);
      await queue.Flush([shardOf(1)]);
      expect(Calls.map((c) => c.Index)).toEqual([0]);
      expect(queue.RetainedCount).toBe(0);
    });

    it('stops a flush already in flight from sending the rest of its batch', async () => {
      const held = createDeferred<boolean>();
      const calls: number[] = [];
      let slow = false;
      const upload: ShardUpload = async (shard) => {
        if (!slow) return false; // first round: two refused shards stay retained
        calls.push(shard.Index);
        return shard.Index === 0 ? held.Promise : true;
      };
      const queue = new RecordingShardQueue(upload);
      await queue.Flush([shardOf(0), shardOf(1)]);
      expect(queue.RetainedCount).toBe(2);

      slow = true;
      const inFlight = queue.Flush([shardOf(2)]);
      await settle();
      expect(calls).toEqual([0]); // shard 0's resend is on the wire
      queue.Close(); // the user hangs up
      held.Resolve(false);
      await inFlight;
      expect(calls).toEqual([0]); // shards 1 and 2 are never sent
      expect(queue.RetainedCount).toBe(0);
    });

    it('does not retain a shard whose in-flight upload fails after Close, and says it stays in the store', async () => {
      const held = createDeferred<boolean>();
      let first = true;
      const upload: ShardUpload = async () => {
        if (first) {
          first = false;
          return false;
        }
        return held.Promise;
      };
      const queue = new RecordingShardQueue(upload);
      await queue.Flush([shardOf(0)]);
      const inFlight = queue.Flush([]);
      await settle();
      queue.Close();
      held.Resolve(false);
      await inFlight;
      expect(queue.RetainedCount).toBe(0);
      const message = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('after the recording ended'));
      expect(message).toContain('shard 0');
      expect(message).toContain('local store');
    });
  });

  it('drops a shard after MAX_SHARD_UPLOAD_ATTEMPTS failures, warns that it stays in the store, and keeps later indexes', async () => {
    const { Upload, Calls } = recordingUpload((call) => call.Index !== 0);
    const queue = new RecordingShardQueue(Upload);
    await queue.Flush([shardOf(0)]);
    for (let i = 1; i < MAX_SHARD_UPLOAD_ATTEMPTS; i++) {
      await queue.Flush([]);
    }
    expect(queue.RetainedCount).toBe(0);
    const dropWarning = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('Dropping'));
    expect(dropWarning).toBeDefined();
    expect(dropWarning).toContain('shard 0');
    expect(dropWarning).toContain('local store');
    expect(dropWarning).not.toContain('silence');
    await queue.Flush([shardOf(1)]);
    expect(Calls[Calls.length - 1]).toEqual({ Index: 1, Marker: 1 });
  });

  it('retries retained shards even when a flush brings no fresh shards', async () => {
    const { Upload, Calls } = recordingUpload((call, attempt) => !(call.Index === 0 && attempt === 1));
    const queue = new RecordingShardQueue(Upload);
    await queue.Flush([shardOf(0)]);
    await queue.Flush([]);
    await queue.Flush([shardOf(1)]);
    expect(Calls.map((c) => c.Index)).toEqual([0, 0, 1]);
  });

  it('never uploads the same retained shard twice at once across concurrent flushes, and stores every shard', async () => {
    const stored = new Set<number>();
    const active = new Map<number, number>();
    const gates: Array<Deferred<void>> = [];
    let maxActiveForAnyIndex = 0;
    let refuseFirstOfShardZero = true;
    const upload: ShardUpload = async (shard) => {
      const index = shard.Index;
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
    const queue = new RecordingShardQueue(upload);
    await queue.Flush([shardOf(0)]);
    expect(queue.RetainedCount).toBe(1);

    const flushes = [queue.Flush([shardOf(1)]), queue.Flush([])];
    for (let i = 0; i < 10 && stored.size < 2; i++) {
      await settle();
      gates.shift()?.Resolve();
    }
    await Promise.all(flushes);

    expect(maxActiveForAnyIndex).toBe(1);
    expect([...stored].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('keeps RetainedCount at MAX_SHARD_UPLOAD_ATTEMPTS - 1 or fewer when uploads always fail', async () => {
    const { Upload } = recordingUpload(() => false);
    const queue = new RecordingShardQueue(Upload);
    for (let i = 0; i < 10; i++) {
      await queue.Flush([shardOf(i)]);
      expect(queue.RetainedCount).toBeLessThanOrEqual(MAX_SHARD_UPLOAD_ATTEMPTS - 1);
    }
    expect(queue.RetainedCount).toBe(MAX_SHARD_UPLOAD_ATTEMPTS - 1);
  });

  it('retries retained shards in index order even when they failed out of order', async () => {
    const firstRound: Record<number, Deferred<boolean>> = {
      0: createDeferred<boolean>(),
      1: createDeferred<boolean>(),
    };
    const seen: number[] = [];
    let firstRoundOver = false;
    const upload: ShardUpload = async (shard) => {
      seen.push(shard.Index);
      return firstRoundOver ? true : firstRound[shard.Index].Promise;
    };
    const queue = new RecordingShardQueue(upload);
    const flush1 = queue.Flush([shardOf(0)]);
    await settle();
    const flush2 = queue.Flush([shardOf(1)]);
    await settle();
    // Shard 1 fails before shard 0 does.
    firstRound[1].Resolve(false);
    await settle();
    firstRound[0].Resolve(false);
    await Promise.all([flush1, flush2]);
    expect(queue.RetainedCount).toBe(2);

    firstRoundOver = true;
    seen.length = 0;
    await queue.Flush([]);
    expect(seen).toEqual([0, 1]);
  });

  describe('capacity', () => {
    it('retains fresh shards, uploads nothing, when MAX_CONCURRENT_FLUSHES are in flight', async () => {
      expect(MAX_CONCURRENT_FLUSHES).toBe(2);
      const gate = createDeferred<boolean>();
      const uploaded: number[] = [];
      const upload: ShardUpload = (shard) => {
        uploaded.push(shard.Index);
        return gate.Promise;
      };
      const queue = new RecordingShardQueue(upload);
      const flush1 = queue.Flush([shardOf(0)]);
      const flush2 = queue.Flush([shardOf(1)]);
      await settle();
      expect(uploaded).toEqual([0, 1]);

      // Out-of-order arrival: 3 then 2 must still be retained sorted.
      await queue.Flush([shardOf(3), shardOf(2)]);
      expect(uploaded).toEqual([0, 1]);
      expect(queue.RetainedCount).toBe(2);

      gate.Resolve(true);
      await Promise.all([flush1, flush2]);
      // Capacity released: the next flush sends the retained shards oldest first.
      uploaded.length = 0;
      await queue.Flush([]);
      expect(uploaded).toEqual([2, 3]);
      expect(queue.RetainedCount).toBe(0);
    });

    it('warns once per capacity stall, not once per skipped flush', async () => {
      const gate = createDeferred<boolean>();
      const queue = new RecordingShardQueue(() => gate.Promise);
      const flushes = [queue.Flush([shardOf(0)]), queue.Flush([shardOf(1)])];
      await settle();
      await queue.Flush([shardOf(2)]);
      await queue.Flush([shardOf(3)]);
      const stallWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('at capacity'));
      expect(stallWarnings).toHaveLength(1);
      expect(String(stallWarnings[0][0])).toContain('in flight');
      gate.Resolve(true);
      await Promise.all(flushes);
    });
  });

  describe('upload timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('treats a hung upload as a failed attempt, releases its slot, and retries it next flush', async () => {
      let hang = true;
      const calls: number[] = [];
      const upload: ShardUpload = (shard) => {
        calls.push(shard.Index);
        return hang ? new Promise<boolean>(() => undefined) : Promise.resolve(true);
      };
      const queue = new RecordingShardQueue(upload);
      const flush = queue.Flush([shardOf(0)]);
      await vi.advanceTimersByTimeAsync(SHARD_UPLOAD_TIMEOUT_MS);
      await flush;
      expect(queue.RetainedCount).toBe(1);
      const timeoutWarning = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('timed out'));
      expect(timeoutWarning).toContain(`attempt 1/${MAX_SHARD_UPLOAD_ATTEMPTS}`);
      expect(timeoutWarning).toContain(String(SHARD_UPLOAD_TIMEOUT_MS));
      expect(vi.getTimerCount()).toBe(0);

      hang = false;
      await queue.Flush([]);
      expect(calls).toEqual([0, 0]);
      expect(queue.RetainedCount).toBe(0);
    });

    it('a timed-out upload that LATER rejects causes no unhandled rejection and no extra retained entry', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        let rejectLate!: (reason: Error) => void;
        const slow: ShardUpload = () =>
          new Promise<boolean>((_, reject) => {
            rejectLate = reject;
          });
        const queue = new RecordingShardQueue(slow);
        const flush = queue.Flush([shardOf(0)]);
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

    it('clears the timer when the upload settles in time', async () => {
      const queue = new RecordingShardQueue(recordingUpload().Upload);
      await queue.Flush([shardOf(0)]);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('makes exactly MAX_SHARD_UPLOAD_ATTEMPTS attempts for a refused shard, never one more', async () => {
    const { Upload, Calls } = recordingUpload(() => false);
    const queue = new RecordingShardQueue(Upload);
    await queue.Flush([shardOf(0)]);
    for (let i = 0; i < 5; i++) await queue.Flush([]);
    expect(Calls.filter((c) => c.Index === 0)).toHaveLength(MAX_SHARD_UPLOAD_ATTEMPTS);
  });

  it('makes exactly MAX_SHARD_UPLOAD_ATTEMPTS attempts for a shard whose upload throws', async () => {
    const { Upload, Calls } = recordingUpload(() => new Error('boom'));
    const queue = new RecordingShardQueue(Upload);
    await queue.Flush([shardOf(0)]);
    for (let i = 0; i < 5; i++) await queue.Flush([]);
    expect(Calls.filter((c) => c.Index === 0)).toHaveLength(MAX_SHARD_UPLOAD_ATTEMPTS);
  });

  it('resolves, never rejects, for a throwing upload and a refusing upload', async () => {
    await expect(new RecordingShardQueue(recordingUpload(() => new Error('upload')).Upload).Flush([shardOf(0)])).resolves.toBeUndefined();
    await expect(new RecordingShardQueue(recordingUpload(() => false).Upload).Flush([shardOf(0)])).resolves.toBeUndefined();
  });
});
