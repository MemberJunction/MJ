import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { FetchRecordingTransport } from '../session/RecordingTransport';
import { MAX_SHARD_UPLOAD_ATTEMPTS, RecordingShardQueue } from '../session/RecordingShardQueue';
import type { RecordingShard } from '../session/RecordingShardWindow';

const shard: RecordingShard = { Index: 3, StartSample: 0, SampleCount: 240000, Bytes: new Uint8Array([3]) };

describe('MJ#6012 a network failure is not "server refused the shard"', () => {
  let warn: MockInstance;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('logs the fetch failure, not a server refusal, when the request never reaches the server', async () => {
    const transport = new FetchRecordingTransport({
      BaseURL: 'http://api.test',
      Headers: () => ({}),
      Fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });
    // Wired the way RealtimeSessionRuntime wires the queue: the transport's outcome goes through unchanged.
    const queue = new RecordingShardQueue((s) => transport.UploadShard('session-1', s));
    for (let i = 0; i < MAX_SHARD_UPLOAD_ATTEMPTS; i++) await queue.Flush(i === 0 ? [shard] : []);

    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.filter((m) => m.includes('server refused the shard'))).toEqual([]);
    expect(messages.some((m) => m.includes('Failed to fetch'))).toBe(true);
  });
});
