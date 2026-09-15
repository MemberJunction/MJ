import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetAttachmentService } from '../services/ConversationAttachmentService';
import {
    AttachmentBlobStoreUnavailableError,
    type AttachmentBlobUploadInput,
    type IAttachmentBlobStore,
} from '@memberjunction/ai-core-plus';

/**
 * Tests for the attachment blob seam.
 *
 * The seam exists so attachment *policy* (limits, the inline-vs-storage threshold, modality,
 * thumbnails) can live in one place while *storage* stays pluggable. Before it, one import of
 * `@memberjunction/storage` made this whole package server-only, and the same rules ended up
 * reimplemented three times — with the Angular copy quietly storing everything inline regardless
 * of size.
 *
 * What matters here is the contract at the boundary: an unbound store is a supported configuration
 * rather than a crash, and content crosses as base64 so nothing in the shared layer depends on
 * Node's `Buffer`.
 */
class RecordingBlobStore implements IAttachmentBlobStore {
    public Uploads: AttachmentBlobUploadInput[] = [];
    public DeletedIds: string[] = [];
    /** What {@link Delete} reports — `false` means "the bytes are still there". */
    public DeleteSucceeds = true;

    public async Upload(input: AttachmentBlobUploadInput) {
        this.Uploads.push(input);
        return { Success: true, FileID: 'file-1' };
    }
    public async Download() {
        return 'YmFzZTY0';
    }
    public async GetDownloadUrl() {
        return 'https://example.test/file';
    }
    public async Delete(fileId: string) {
        this.DeletedIds.push(fileId);
        return this.DeleteSucceeds;
    }
}

const contextUser = { ID: 'user-1', Name: 'Tester', Email: 't@example.test' } as never;

/** A minimal attachment row, enough for the delete path to load and act on. */
class FakeAttachment {
    public FileID: string | null = 'file-1';
    public Deleted = false;
    public async Load(): Promise<boolean> {
        return true;
    }
    public async Delete(): Promise<boolean> {
        this.Deleted = true;
        return true;
    }
}

/**
 * A provider that hands back one attachment row.
 *
 * Passing a provider explicitly is how these tests avoid the global `Metadata.Provider` — the
 * service already accepts one per call for exactly this reason (server isolation).
 */
function providerReturning(attachment: FakeAttachment) {
    return { GetEntityObject: async () => attachment } as never;
}

describe('attachment blob seam', () => {
    beforeEach(() => {
        GetAttachmentService().BlobStore = null;
    });

    describe('with no store bound', () => {
        it('is a supported configuration, not a crash — the service still constructs', () => {
            expect(GetAttachmentService().BlobStore).toBeNull();
        });

        it('returns null from DownloadFileContent instead of throwing', async () => {
            await expect(GetAttachmentService().DownloadFileContent('f1', contextUser)).resolves.toBeNull();
        });

        it('returns null from GetDownloadUrl instead of throwing', async () => {
            await expect(GetAttachmentService().GetDownloadUrl('f1', contextUser)).resolves.toBeNull();
        });

        it('refuses to delete a storage-backed attachment it cannot unstore', async () => {
            // With no store, the bytes are unreachable — so the row has to stay, or it becomes a
            // pointer-less file on a host that simply is not configured for storage.
            const attachment = new FakeAttachment();
            await expect(
                GetAttachmentService().DeleteAttachment('att-1', contextUser, providerReturning(attachment)),
            ).resolves.toBe(false);
            expect(attachment.Deleted).toBe(false);
        });

        it('names the condition distinctly, so callers can tell a deployment shape from an incident', () => {
            expect(AttachmentBlobStoreUnavailableError).toMatch(/not available on this host/i);
            expect(AttachmentBlobStoreUnavailableError).toMatch(/inline/i);
        });
    });

    describe('with a store bound', () => {
        let store: RecordingBlobStore;

        beforeEach(() => {
            store = new RecordingBlobStore();
            GetAttachmentService().BlobStore = store;
        });

        it('delegates downloads and returns base64, never a Buffer', async () => {
            const content = await GetAttachmentService().DownloadFileContent('f1', contextUser);
            expect(content).toBe('YmFzZTY0');
            // A Buffer here is what made the service Node-only; the type is the assertion.
            expect(typeof content).toBe('string');
        });

        it('delegates download URLs', async () => {
            await expect(GetAttachmentService().GetDownloadUrl('f1', contextUser)).resolves.toBe(
                'https://example.test/file',
            );
        });

        it('passes the upload through to the bound store', async () => {
            const result = await store.Upload(
                { FileName: 'a.png', MimeType: 'image/png', Base64Data: 'YQ==' },
                contextUser,
            );
            expect(result).toMatchObject({ Success: true, FileID: 'file-1' });
            expect(store.Uploads).toHaveLength(1);
            expect(store.Uploads[0].Base64Data).toBe('YQ==');
        });

        it('deletes the attachment row once the store confirms the bytes are gone', async () => {
            const attachment = new FakeAttachment();
            const deleted = await GetAttachmentService().DeleteAttachment(
                'att-1',
                contextUser,
                providerReturning(attachment),
            );
            expect(deleted).toBe(true);
            expect(store.DeletedIds).toEqual(['file-1']);
            expect(attachment.Deleted).toBe(true);
        });

        it('keeps the attachment row when the store could not remove the bytes', async () => {
            // A `false` from the store means the content is still there. Deleting the row anyway
            // orphans it — content nothing points at, which is the exact failure the seam's
            // contract forbids and which three doc comments promised was handled.
            store.DeleteSucceeds = false;
            const attachment = new FakeAttachment();
            const deleted = await GetAttachmentService().DeleteAttachment(
                'att-1',
                contextUser,
                providerReturning(attachment),
            );
            expect(deleted).toBe(false);
            expect(attachment.Deleted).toBe(false);
        });

        it('is swappable at runtime, which is the whole point of the seam', async () => {
            const second = new RecordingBlobStore();
            GetAttachmentService().BlobStore = second;
            await GetAttachmentService().DownloadFileContent('f1', contextUser);
            expect(GetAttachmentService().BlobStore).toBe(second);
        });
    });
});
