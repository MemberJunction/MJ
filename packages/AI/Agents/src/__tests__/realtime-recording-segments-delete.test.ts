/**
 * `DeleteRealtimeRecordingSegments` must actually remove a session's crash-recovery shards once the
 * consolidated recording lands. The fake driver lists the way S3 and Google Cloud Storage do
 * (ListObjects with a prefix and the default '/' delimiter): a key whose remainder after the prefix
 * still contains the delimiter is rolled up into `prefixes`, not returned in `objects`. Listing
 * `realtime-recordings/<id>` without a trailing slash therefore returns no objects at all — which is
 * how the shards were being left behind with nothing logged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDriverMock } = vi.hoisted(() => ({ getDriverMock: vi.fn() }));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: { Instance: { GetDriver: getDriverMock } },
}));

import { DeleteRealtimeRecordingSegments } from '../realtime/realtime-recording-store';
import { UserInfo } from '@memberjunction/core';

/** In-memory bucket with prefix + delimiter listing semantics (S3 ListObjectsV2 / GCS). */
class DelimitedBucket {
    public readonly Keys: Set<string>;
    constructor(keys: string[]) {
        this.Keys = new Set(keys);
    }
    public async ListObjects(prefix: string, delimiter = '/'): Promise<{ objects: { name: string }[]; prefixes: string[] }> {
        const objects: { name: string }[] = [];
        const prefixes = new Set<string>();
        for (const key of this.Keys) {
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            const cut = rest.indexOf(delimiter);
            if (cut >= 0) prefixes.add(prefix + rest.slice(0, cut + 1));
            else objects.push({ name: key });
        }
        return { objects, prefixes: [...prefixes] };
    }
    public async DeleteObject(key: string): Promise<boolean> {
        return this.Keys.delete(key);
    }
}

describe('DeleteRealtimeRecordingSegments (#5195 upload-after-close path)', () => {
    let bucket: DelimitedBucket;

    beforeEach(() => {
        bucket = new DelimitedBucket([
            'realtime-recordings/sess-123/seg-0000.pcm',
            'realtime-recordings/sess-123/seg-0001.pcm',
            'realtime-recordings/sess-123/recording.wav',
            'realtime-recordings/sess-123/peaks.json',
            // A neighbouring session whose id starts with this one's: must never be touched.
            'realtime-recordings/sess-1234/seg-0000.pcm',
        ]);
        getDriverMock.mockReset();
        getDriverMock.mockResolvedValue(bucket);
    });

    it("deletes the session's seg-* shards and keeps the consolidated file and peaks", async () => {
        const deleted = await DeleteRealtimeRecordingSegments('sess-123', 'acct-1', {} as UserInfo);

        expect(deleted).toBe(2);
        expect([...bucket.Keys].sort()).toEqual([
            'realtime-recordings/sess-123/peaks.json',
            'realtime-recordings/sess-123/recording.wav',
            'realtime-recordings/sess-1234/seg-0000.pcm',
        ]);
    });
});
