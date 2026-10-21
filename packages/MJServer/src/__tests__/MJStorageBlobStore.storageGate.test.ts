/**
 * MJStorageBlobStore (the conversation-attachment blob seam) goes from a file ID to bytes, a signed URL or a delete. The
 * `MJ: Files` row names only a storage PROVIDER, so each path resolves through `FileStorageEngine.ResolveFileObject` —
 * the storage gate (the caller's access on the account, and the tracked-file rule). These tests pin that download and
 * URL ask for Read, delete asks for Write, and a refusal reads, signs and deletes nothing (the seam never throws).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveFileObject, getObject, createUrl, deleteObject } = vi.hoisted(() => ({
    resolveFileObject: vi.fn(),
    getObject: vi.fn(async () => Buffer.from('bytes')),
    createUrl: vi.fn(async () => 'https://signed.example/x'),
    deleteObject: vi.fn(async () => true),
}));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: { Instance: { ResolveFileObject: resolveFileObject } },
    StorageAccessEvaluator: { Instance: { AssertTrackedObjectsReadable: vi.fn() } },
    FileStorageBase: class {},
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJStorageBlobStore } from '../services/MJStorageBlobStore.js';

const caller = { ID: 'user-1', UserRoles: [] } as unknown as UserInfo;
const fileRow = {
    ID: 'file-1', ProviderID: 'prov-1', ProviderKey: 'conversation-attachments/a.png', Name: 'a.png',
    Load: async () => true, Delete: vi.fn(async () => true),
};
const provider = { GetEntityObject: async () => fileRow } as unknown as IMetadataProvider;
const driver = { GetObject: getObject, CreatePreAuthDownloadUrl: createUrl, DeleteObject: deleteObject };

describe('MJStorageBlobStore — every path goes through the storage gate', () => {
    const store = new MJStorageBlobStore();

    beforeEach(() => {
        vi.clearAllMocks();
        resolveFileObject.mockResolvedValue({ Account: { ID: 'acct-1' }, Driver: driver, ObjectKey: fileRow.ProviderKey });
    });

    it('Download and GetDownloadUrl ask for Read, as the caller', async () => {
        expect(await store.Download('file-1', caller, provider)).toBe(Buffer.from('bytes').toString('base64'));
        expect(await store.GetDownloadUrl('file-1', caller, provider)).toBe('https://signed.example/x');
        expect(resolveFileObject.mock.calls.map(c => c[2])).toEqual(['Read', 'Read']);
        expect(resolveFileObject.mock.calls.every(c => c[1] === caller)).toBe(true);
    });

    it('Delete asks for Write', async () => {
        expect(await store.Delete('file-1', caller, provider)).toBe(true);
        expect(resolveFileObject.mock.calls[0][2]).toBe('Write');
    });

    it('a refusal reads, signs and deletes nothing — and the seam still does not throw', async () => {
        resolveFileObject.mockRejectedValue(new Error('You do not have access to this file or it does not exist.'));
        expect(await store.Download('file-1', caller, provider)).toBeNull();
        expect(await store.GetDownloadUrl('file-1', caller, provider)).toBeNull();
        expect(await store.Delete('file-1', caller, provider)).toBe(false);
        expect(getObject).not.toHaveBeenCalled();
        expect(createUrl).not.toHaveBeenCalled();
        expect(deleteObject).not.toHaveBeenCalled();
        expect(fileRow.Delete).not.toHaveBeenCalled();
    });
});
