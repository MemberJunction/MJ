/**
 * Unit tests for how `storeRealtimeRecording` reports a failed upload. The storage engine is mocked —
 * these tests verify ONLY that the reason the storage layer knew reaches the caller, instead of being
 * flattened into a bare `null` (the defect: a Drive service-account quota refusal surfaced to the
 * browser as the generic "Storage upload failed.").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage engine so no real driver/account/network is touched. The mocks are hoisted so the
// vi.mock factory can close over them.
const { uploadFileMock, putObjectMock, getDriverMock } = vi.hoisted(() => {
    const uploadFileMock = vi.fn(async () => ({ FileID: 'file-1' }));
    const putObjectMock = vi.fn(async () => true);
    const getDriverMock = vi.fn(async () => ({ PutObject: putObjectMock }));
    return { uploadFileMock, putObjectMock, getDriverMock };
});

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        Instance: {
            GetDriver: getDriverMock,
            UploadFile: uploadFileMock,
        },
    },
}));

import { storeRealtimeRecording } from '../realtime/realtime-recording-store';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

const GOOGLE_QUOTA_MESSAGE = 'Service Accounts do not have storage quota. Leverage shared drives instead.';

const fakeUser = {} as UserInfo;
/**
 * Minimal provider: reached only after a successful upload. No session entity is registered and the
 * session never loads, so neither the file-link nor the session stamping runs.
 */
const fakeProvider = {
    EntityByName: () => undefined,
    GetEntityObject: async () => ({ Load: async () => false }),
} as unknown as IMetadataProvider;

function input() {
    return {
        Audio: Buffer.from('audio'),
        MimeType: 'audio/wav',
        Media: 'Audio' as const,
        StartedAt: new Date('2026-08-16T00:00:00Z'),
        StorageAccountID: 'acct-1',
        SessionID: 'sess-123',
        ContextUser: fakeUser,
        Provider: fakeProvider,
    };
}

describe('storeRealtimeRecording failure reporting', () => {
    beforeEach(() => {
        uploadFileMock.mockClear();
        getDriverMock.mockClear();
        putObjectMock.mockClear();
    });

    it('surfaces the underlying storage failure message rather than a bare null', async () => {
        uploadFileMock.mockRejectedValueOnce(new Error(`FileStorageEngine.UploadFile failed: ${GOOGLE_QUOTA_MESSAGE}`));

        const result = await storeRealtimeRecording(input());

        expect(result.FileID).toBeNull();
        expect(result.ErrorMessage).toContain(GOOGLE_QUOTA_MESSAGE);
    });

    it('never throws — a non-Error rejection still yields a reason', async () => {
        uploadFileMock.mockRejectedValueOnce('storage went away');

        const result = await storeRealtimeRecording(input());

        expect(result.FileID).toBeNull();
        expect(result.ErrorMessage).toBe('storage went away');
    });

    it('returns the file id and no error when the upload succeeds', async () => {
        const result = await storeRealtimeRecording(input());

        expect(result.FileID).toBe('file-1');
        expect(result.ErrorMessage).toBeNull();
    });
});
