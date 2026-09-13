import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetAttachmentService } from '../services/ConversationAttachmentService';
import {
    AttachmentBlobStoreUnavailableError,
    type AttachmentBlobUploadInput,
    type IAttachmentBlobStore,
} from '../services/IAttachmentBlobStore';

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
        return true;
    }
}

const contextUser = { ID: 'user-1', Name: 'Tester', Email: 't@example.test' } as never;

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

        it('is swappable at runtime, which is the whole point of the seam', async () => {
            const second = new RecordingBlobStore();
            GetAttachmentService().BlobStore = second;
            await GetAttachmentService().DownloadFileContent('f1', contextUser);
            expect(GetAttachmentService().BlobStore).toBe(second);
        });
    });
});
