/**
 * `ReadRealtimeRecordingFile` reads a recording's bytes for a file ID. The `MJ: Files` row names only a storage
 * PROVIDER, so the reader resolves the account through `FileStorageEngine.ResolveFileObject` — the storage gate (Read on
 * the account, and the tracked-file rule on the object). These tests pin that the reader goes through the gate, passes
 * the caller and its provider, never reads bytes when the gate refuses, and keeps its never-throw contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveFileObjectMock, getObjectMock } = vi.hoisted(() => ({
    resolveFileObjectMock: vi.fn(),
    getObjectMock: vi.fn(async () => Buffer.from('RIFF....')),
}));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: { Instance: { ResolveFileObject: resolveFileObjectMock } },
}));

import { ReadRealtimeRecordingFile } from '../realtime/realtime-recording-store';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const caller = { ID: 'user-1', UserRoles: [] } as unknown as UserInfo;
const fileRow = {
    ID: 'file-1', ProviderID: 'prov-1', ProviderKey: 'realtime-recordings/s1/recording.wav', Name: 'recording.wav', ContentType: 'audio/wav',
    Load: async () => true,
};
const provider = { GetEntityObject: async () => fileRow } as unknown as IMetadataProvider;

describe('ReadRealtimeRecordingFile — the storage gate', () => {
    beforeEach(() => {
        resolveFileObjectMock.mockReset();
        getObjectMock.mockClear();
    });

    it('resolves the account through the gate, as the caller, and reads the object it resolved', async () => {
        resolveFileObjectMock.mockResolvedValue({ Account: { ID: 'acct-1' }, Driver: { GetObject: getObjectMock }, ObjectKey: fileRow.ProviderKey });
        const result = await ReadRealtimeRecordingFile('file-1', caller, provider);
        expect(resolveFileObjectMock).toHaveBeenCalledWith(fileRow, caller, 'Read', provider);
        expect(getObjectMock).toHaveBeenCalledWith({ fullPath: fileRow.ProviderKey });
        expect(result?.MimeType).toBe('audio/wav');
    });

    it('returns null — and reads nothing — when the gate refuses', async () => {
        resolveFileObjectMock.mockRejectedValue(new Error('You do not have access to this storage account or it does not exist.'));
        const result = await ReadRealtimeRecordingFile('file-1', caller, provider);
        expect(result).toBeNull();
        expect(getObjectMock).not.toHaveBeenCalled();
    });

    it('returns null when the row\'s provider has no storage account', async () => {
        resolveFileObjectMock.mockResolvedValue(null);
        expect(await ReadRealtimeRecordingFile('file-1', caller, provider)).toBeNull();
    });
});
