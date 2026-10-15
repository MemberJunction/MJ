import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RealtimeAudioRecorder } from '../lib/services/realtime-audio-recorder';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';

interface SentShard {
  agentSessionId: string;
  segmentIndex: number;
  audioBase64: string;
  mimeType: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const blobTexts = new WeakMap<Blob, string>();

function makeTestBlob(text: string): Blob {
  const blob = new Blob([text]);
  blobTexts.set(blob, text);
  return blob;
}

async function readTestBlob(blob: Blob): Promise<string> {
  return blobTexts.get(blob) ?? (await blob.text());
}

async function settle(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

describe('RealtimeSessionService recording shard retry (#5246)', () => {
  let service: RealtimeSessionService;
  let provider: GraphQLDataProvider;
  let recorder: RealtimeAudioRecorder;
  let sent: SentShard[];

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    service = new RealtimeSessionService();
    provider = new GraphQLDataProvider();
    recorder = new RealtimeAudioRecorder();
    sent = [];

    vi.spyOn(RealtimeAudioRecorder.prototype, 'SampleRate', 'get').mockReturnValue(24000);
    service.Provider = provider;
    service['agentSessionId'] = 'session-1';
    service['recorder'] = recorder;
    service['blobToBase64'] = vi.fn(async (blob: Blob) => await readTestBlob(blob));
    service['startSegmentFlushing']();
    // Stop the background timer so tests drive flush ticks deterministically.
    if (service['segmentTimer']) {
      clearInterval(service['segmentTimer']);
      service['segmentTimer'] = null;
    }
  });

  afterEach(() => {
    service['stopSegmentFlushing']();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockSegments(segments: Array<string | null>): ReturnType<typeof vi.spyOn> {
    let call = 0;
    return vi.spyOn(recorder, 'SnapshotNewSegment').mockImplementation(() => {
      const next = segments[call++] ?? null;
      return next === null ? null : makeTestBlob(next);
    });
  }

  function mockSegmentGql(
    handler: (vars: SentShard, attemptNumber: number) => Promise<Record<string, boolean>>,
  ): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(provider, 'ExecuteGQL').mockImplementation(async (query, vars) => {
      if (query.includes('UploadRealtimeRecordingSegment')) {
        const record: Record<string, string | number | undefined> = vars ?? {};
        const typedVars: SentShard = {
          agentSessionId: String(record['agentSessionId'] ?? ''),
          segmentIndex: Number(record['segmentIndex'] ?? -1),
          audioBase64: String(record['audioBase64'] ?? ''),
          mimeType: String(record['mimeType'] ?? ''),
        };
        sent.push(typedVars);
        return await handler(typedVars, sent.length);
      }
      return {};
    });
  }

  it('resends a refused shard under its original index before capturing the next shard', async () => {
    mockSegments(['first', 'second']);
    let call = 0;
    mockSegmentGql(async () => {
      call++;
      return { UploadRealtimeRecordingSegment: call !== 1 };
    });

    await service['flushRecordingSegment']();
    expect(sent).toEqual([
      { agentSessionId: 'session-1', segmentIndex: 0, audioBase64: 'first', mimeType: 'audio/L16;rate=24000' },
    ]);

    await service['flushRecordingSegment']();
    expect(sent).toEqual([
      { agentSessionId: 'session-1', segmentIndex: 0, audioBase64: 'first', mimeType: 'audio/L16;rate=24000' },
      { agentSessionId: 'session-1', segmentIndex: 0, audioBase64: 'first', mimeType: 'audio/L16;rate=24000' },
      { agentSessionId: 'session-1', segmentIndex: 1, audioBase64: 'second', mimeType: 'audio/L16;rate=24000' },
    ]);
  });

  it('resends a shard whose upload threw a network error under its original index', async () => {
    mockSegments(['first', 'second']);
    let call = 0;
    mockSegmentGql(async () => {
      call++;
      if (call === 1) {
        throw new Error('offline');
      }
      return { UploadRealtimeRecordingSegment: true };
    });

    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 'first' },
      { segmentIndex: 0, audioBase64: 'first' },
      { segmentIndex: 1, audioBase64: 'second' },
    ]);
  });

  it('treats malformed or empty GraphQL results as upload failures and retries them', async () => {
    mockSegments(['s0', 's1', 's2', null]);
    const responses: Array<Record<string, boolean> | null> = [
      null,
      { UploadRealtimeRecordingSegment: true },
      {},
      { UploadRealtimeRecordingSegment: true },
      { somethingElse: true },
      { UploadRealtimeRecordingSegment: true },
    ];
    mockSegmentGql(async () => responses.shift() ?? { UploadRealtimeRecordingSegment: false });

    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 's0' },
      { segmentIndex: 0, audioBase64: 's0' },
      { segmentIndex: 1, audioBase64: 's1' },
      { segmentIndex: 1, audioBase64: 's1' },
      { segmentIndex: 2, audioBase64: 's2' },
      { segmentIndex: 2, audioBase64: 's2' },
    ]);
  });

  it('drops a shard after three failed attempts and never reuses its index', async () => {
    const warn = vi.spyOn(console, 'warn');
    mockSegments(['lost', null, null, 'next']);
    mockSegmentGql(async (vars) => ({
      UploadRealtimeRecordingSegment: vars.segmentIndex !== 0,
    }));

    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 'lost' },
      { segmentIndex: 0, audioBase64: 'lost' },
      { segmentIndex: 0, audioBase64: 'lost' },
      { segmentIndex: 1, audioBase64: 'next' },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Dropping.*shard 0.*silence/), expect.anything());
  });

  it('keeps retained shards bounded to at most 2 when every upload fails across ticks', async () => {
    mockSegments(['s0', 's1', 's2', 's3', null]);
    let failAll = true;
    mockSegmentGql(async () => ({
      UploadRealtimeRecordingSegment: !failAll,
    }));

    for (let i = 0; i < 4; i++) {
      await service['flushRecordingSegment']();
    }

    // After 4 failing ticks, shards 0 and 1 have exhausted their 3 attempts and been dropped;
    // only shards 2 and 3 remain retained.
    sent.length = 0;
    failAll = false;
    await service['flushRecordingSegment']();

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 2, audioBase64: 's2' },
      { segmentIndex: 3, audioBase64: 's3' },
    ]);
  });

  it('assigns indexes in capture order when an earlier encode resolves after a later flush starts', async () => {
    const firstEncode = deferred<string>();
    mockSegments(['older', 'newer']);
    let encodeCall = 0;
    service['blobToBase64'] = vi.fn((blob: Blob) => {
      encodeCall++;
      if (encodeCall === 1) {
        return firstEncode.promise;
      }
      return readTestBlob(blob);
    });
    mockSegmentGql(async () => ({ UploadRealtimeRecordingSegment: true }));

    const flush1 = service['flushRecordingSegment']();
    const flush2 = service['flushRecordingSegment']();
    await settle();
    firstEncode.resolve('older');
    await Promise.all([flush1, flush2]);

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 'older' },
      { segmentIndex: 1, audioBase64: 'newer' },
    ]);
  });

  it('skips a flush without snapshotting when two flushes are already in flight', async () => {
    const warn = vi.spyOn(console, 'warn');
    const uploads = [deferred<boolean>(), deferred<boolean>()];
    const snapshotSpy = mockSegments(['s0', 's1', 's2', 's3']);
    let uploadCall = 0;
    mockSegmentGql(async () => {
      const current = uploads[uploadCall++];
      const ok = current ? await current.promise : true;
      return { UploadRealtimeRecordingSegment: ok };
    });

    const flush1 = service['flushRecordingSegment']();
    const flush2 = service['flushRecordingSegment']();
    await settle();
    expect(snapshotSpy).toHaveBeenCalledTimes(2);

    // Both slots are busy; overlapping ticks must skip without taking a new snapshot.
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    expect(snapshotSpy).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('at capacity'));

    uploads[0].resolve(true);
    await flush1;

    // One slot freed; next flush runs, and another while busy warns again.
    uploads.push(deferred<boolean>());
    const flush3 = service['flushRecordingSegment']();
    await settle();
    await service['flushRecordingSegment']();
    expect(warn).toHaveBeenCalledTimes(2);

    uploads[1].resolve(true);
    uploads[2].resolve(true);
    await Promise.all([flush2, flush3]);
  });

  it('uploads retained shards before awaiting a new window snapshot', async () => {
    let call = 0;
    vi.spyOn(recorder, 'SnapshotNewSegment').mockImplementation(() => {
      call++;
      return makeTestBlob(call === 1 ? 'retained' : 'hung');
    });
    service['blobToBase64'] = vi.fn((blob: Blob) => {
      if (call >= 2) {
        return new Promise<string>(() => undefined);
      }
      return readTestBlob(blob);
    });
    let uploadCall = 0;
    mockSegmentGql(async () => {
      uploadCall++;
      return { UploadRealtimeRecordingSegment: uploadCall > 1 };
    });

    await service['flushRecordingSegment']();
    expect(sent).toHaveLength(1);

    void service['flushRecordingSegment']();
    await settle();

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 'retained' },
      { segmentIndex: 0, audioBase64: 'retained' },
    ]);
  });

  it('uses no index when the snapshot is empty or encode fails, while still retrying retained shards', async () => {
    const warn = vi.spyOn(console, 'warn');
    let snapCall = 0;
    vi.spyOn(recorder, 'SnapshotNewSegment').mockImplementation(() => {
      snapCall++;
      if (snapCall === 1) return makeTestBlob('first');
      if (snapCall === 2) return null;
      if (snapCall === 3) return makeTestBlob('throw-encode');
      return makeTestBlob('second');
    });
    service['blobToBase64'] = vi.fn(async (blob: Blob) => {
      const text = await readTestBlob(blob);
      if (text === 'throw-encode') {
        throw new Error('recorder closed');
      }
      return text;
    });
    let uploadCall = 0;
    mockSegmentGql(async () => {
      uploadCall++;
      return { UploadRealtimeRecordingSegment: uploadCall !== 1 };
    });

    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to snapshot'), expect.any(Error));
    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 'first' },
      { segmentIndex: 0, audioBase64: 'first' },
      { segmentIndex: 1, audioBase64: 'second' },
    ]);
  });

  it('times out a hung upload after 60s, retains the shard, releases capacity, and ignores late settlement', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn');
    const hung = deferred<Record<string, boolean>>();
    mockSegments(['first', 'second']);
    let uploadCall = 0;
    mockSegmentGql(async () => {
      uploadCall++;
      if (uploadCall === 1) {
        return hung.promise;
      }
      return { UploadRealtimeRecordingSegment: true };
    });

    let flush1Done = false;
    const flush1 = service['flushRecordingSegment']().then(() => {
      flush1Done = true;
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(flush1Done).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(flush1Done).toBe(true);
    await flush1;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timed out'), expect.any(Error));

    // Late rejection after timeout must not cause an unhandled rejection or duplicate retention.
    hung.reject(new Error('socket closed after timeout'));
    await settle();

    await service['flushRecordingSegment']();

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 'first' },
      { segmentIndex: 0, audioBase64: 'first' },
      { segmentIndex: 1, audioBase64: 'second' },
    ]);
  });

  it('retries retained shards in index order when concurrent flushes fail out of order', async () => {
    const uploads = [deferred<boolean>(), deferred<boolean>()];
    mockSegments(['s0', 's1', null]);
    let uploadCall = 0;
    mockSegmentGql(async () => {
      const current = uploads[uploadCall++];
      const ok = current ? await current.promise : true;
      return { UploadRealtimeRecordingSegment: ok };
    });

    const flush1 = service['flushRecordingSegment']();
    const flush2 = service['flushRecordingSegment']();
    await settle();

    // Shard 1 fails first, then shard 0 fails second.
    uploads[1].resolve(false);
    await flush2;
    uploads[0].resolve(false);
    await flush1;

    await service['flushRecordingSegment']();

    expect(sent.map(s => ({ segmentIndex: s.segmentIndex, audioBase64: s.audioBase64 }))).toEqual([
      { segmentIndex: 0, audioBase64: 's0' },
      { segmentIndex: 1, audioBase64: 's1' },
      { segmentIndex: 0, audioBase64: 's0' },
      { segmentIndex: 1, audioBase64: 's1' },
    ]);
  });

  it('stops an in-flight flush and discards retained shards when recording stops', async () => {
    const retryGate = deferred<boolean>();
    const snapshotSpy = mockSegments(['s0', 's1', 's2']);
    let uploadCall = 0;
    mockSegmentGql(async () => {
      uploadCall++;
      if (uploadCall <= 3) {
        return { UploadRealtimeRecordingSegment: false };
      }
      const ok = await retryGate.promise;
      return { UploadRealtimeRecordingSegment: ok };
    });

    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();
    // Both s0 (retried once on flush 2) and s1 (captured on flush 2) are now retained.
    expect(sent.map(s => s.segmentIndex)).toEqual([0, 0, 1]);

    // Start flush 3: it begins retrying s0 and blocks on retryGate.
    const inFlightFlush = service['flushRecordingSegment']();
    await settle();
    expect(sent.map(s => s.segmentIndex)).toEqual([0, 0, 1, 0]);

    // Stop segment flushing / recording while s0's retry is in flight.
    vi.spyOn(recorder, 'Stop').mockResolvedValue(null);
    await service['stopRecording']();

    retryGate.resolve(true);
    await inFlightFlush;

    // Neither retained shard s1 nor fresh snapshot s2 was sent after recording stopped.
    expect(sent.map(s => s.segmentIndex)).toEqual([0, 0, 1, 0]);
    expect(snapshotSpy).toHaveBeenCalledTimes(2);
  });

  it('isolates an in-flight flush from a previous session when a new session starts', async () => {
    const staleUpload = deferred<boolean>();
    mockSegments(['session-a-s0', 'session-b-s0', 'session-b-s1']);
    let uploadCall = 0;
    mockSegmentGql(async () => {
      uploadCall++;
      if (uploadCall === 1) {
        return { UploadRealtimeRecordingSegment: await staleUpload.promise };
      }
      if (uploadCall === 2) {
        return { UploadRealtimeRecordingSegment: false };
      }
      return { UploadRealtimeRecordingSegment: true };
    });

    const sessionAFlush = service['flushRecordingSegment']();
    await settle();

    // Session A resets and Session B starts before Session A's upload settles.
    service['resetState']();
    service['agentSessionId'] = 'session-2';
    service['recorder'] = recorder;
    service['startSegmentFlushing']();
    if (service['segmentTimer']) {
      clearInterval(service['segmentTimer']);
      service['segmentTimer'] = null;
    }

    staleUpload.resolve(false);
    await sessionAFlush;

    // Session B flushes twice: shard 0 fails on flush 1 and retries on flush 2 before shard 1.
    await service['flushRecordingSegment']();
    await service['flushRecordingSegment']();

    expect(sent).toEqual([
      { agentSessionId: 'session-1', segmentIndex: 0, audioBase64: 'session-a-s0', mimeType: 'audio/L16;rate=24000' },
      { agentSessionId: 'session-2', segmentIndex: 0, audioBase64: 'session-b-s0', mimeType: 'audio/L16;rate=24000' },
      { agentSessionId: 'session-2', segmentIndex: 0, audioBase64: 'session-b-s0', mimeType: 'audio/L16;rate=24000' },
      { agentSessionId: 'session-2', segmentIndex: 1, audioBase64: 'session-b-s1', mimeType: 'audio/L16;rate=24000' },
    ]);
  });
});
