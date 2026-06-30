/**
 * Unit tests for the waveform-peaks sidecar written alongside a realtime recording. The storage
 * driver is mocked — these tests verify ONLY that a `peaks.json` (a JSON array of numbers) is
 * written into the session's folder via `PutObject`, with the right path/payload/content-type, and
 * that missing/empty peaks are a no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage engine so no real driver/account/network is touched. `putObjectMock` is hoisted
// so the vi.mock factory can close over it.
const { putObjectMock, getDriverMock } = vi.hoisted(() => {
    const putObjectMock = vi.fn(async () => true);
    const getDriverMock = vi.fn(async () => ({ PutObject: putObjectMock }));
    return { putObjectMock, getDriverMock };
});

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        Instance: {
            GetDriver: getDriverMock,
        },
    },
}));

import { writeRecordingPeaksSidecar } from '../realtime/realtime-recording-store';
import { UserInfo } from '@memberjunction/core';

const fakeUser = {} as UserInfo;

describe('writeRecordingPeaksSidecar', () => {
    beforeEach(() => {
        putObjectMock.mockClear();
        getDriverMock.mockClear();
    });

    it('writes peaks.json into the session folder with a JSON array payload and application/json type', async () => {
        const peaks = [0, 0.5, 1, 0.25];
        const ok = await writeRecordingPeaksSidecar('sess-123', 'acct-1', peaks, fakeUser);

        expect(ok).toBe(true);
        expect(getDriverMock).toHaveBeenCalledWith('acct-1', fakeUser);
        expect(putObjectMock).toHaveBeenCalledTimes(1);

        const [path, payload, contentType] = putObjectMock.mock.calls[0];
        expect(path).toBe('realtime-recordings/sess-123/peaks.json');
        expect(contentType).toBe('application/json');
        // Payload is a Buffer of the JSON-serialized peak array.
        expect(JSON.parse((payload as Buffer).toString('utf8'))).toEqual(peaks);
    });

    it('is a no-op (no driver call) when peaks is undefined or empty', async () => {
        expect(await writeRecordingPeaksSidecar('s', 'a', undefined, fakeUser)).toBe(false);
        expect(await writeRecordingPeaksSidecar('s', 'a', [], fakeUser)).toBe(false);
        expect(getDriverMock).not.toHaveBeenCalled();
        expect(putObjectMock).not.toHaveBeenCalled();
    });

    it('never throws — a driver failure is swallowed and returns false', async () => {
        getDriverMock.mockRejectedValueOnce(new Error('boom'));
        await expect(writeRecordingPeaksSidecar('s', 'a', [0.1, 0.2], fakeUser)).resolves.toBe(false);
    });
});
