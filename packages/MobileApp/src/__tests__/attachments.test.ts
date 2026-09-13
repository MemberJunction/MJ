import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the attachment capture service. The three Expo capture modules
 * (`expo-image-picker`, `expo-document-picker`, `expo-file-system`) and the MJ
 * object model (`@memberjunction/core`) are mocked; the mutable `state` drives
 * permission, picker, and persistence outcomes so we can assert the mapping to
 * {@link CapturedAttachment} plus the graceful-degradation paths a simulator
 * hits (permission denied, user cancel, no camera hardware).
 */
type PickerResult = { canceled: boolean; assets: unknown[] | null };

const state = vi.hoisted(() => ({
    libraryPerm: { granted: true, canAskAgain: true } as { granted: boolean; canAskAgain?: boolean },
    cameraPerm: { granted: true, canAskAgain: true } as { granted: boolean; canAskAgain?: boolean },
    requestResult: { granted: true } as { granted: boolean; canAskAgain?: boolean },
    imageResult: { canceled: false, assets: [{ uri: 'file:///lib/IMG.jpg', fileName: 'IMG.jpg', mimeType: 'image/jpeg', fileSize: 2048 }] } as PickerResult,
    cameraThrows: false,
    docResult: { canceled: false, assets: [{ uri: 'file:///docs/report.pdf', name: 'report.pdf', mimeType: 'application/pdf', size: 4096 }] } as PickerResult,
    base64: 'Zm9vYmFy',
    base64Throws: false,
    uploadResult: { Success: true, FileID: 'file-1' } as { Success: boolean; FileID?: string; ErrorMessage?: string },
    uploadThrows: false,
    lastUploadInput: null as { FileName: string; Base64Data: string; MimeType?: string; Description?: string } | null,
    saveResult: true,
    lastSavedLink: null as { FileID: string; EntityID: string; RecordID: string } | null,
    entityKnown: true,
    modalityRows: [{ ID: 'modality-1' }] as { ID: string }[],
    modalityLookupSuccess: true,
    lastModalityFilter: '' as string,
    lastSavedConvAttachment: null as Record<string, unknown> | null,
}));

vi.mock('expo-image-picker', () => ({
    getMediaLibraryPermissionsAsync: () => Promise.resolve(state.libraryPerm),
    requestMediaLibraryPermissionsAsync: () => Promise.resolve(state.requestResult),
    getCameraPermissionsAsync: () => Promise.resolve(state.cameraPerm),
    requestCameraPermissionsAsync: () => Promise.resolve(state.requestResult),
    launchImageLibraryAsync: () => Promise.resolve(state.imageResult),
    launchCameraAsync: () =>
        state.cameraThrows ? Promise.reject(new Error('no camera on simulator')) : Promise.resolve(state.imageResult),
}));

vi.mock('expo-document-picker', () => ({
    getDocumentAsync: () => Promise.resolve(state.docResult),
}));

vi.mock('expo-file-system', () => ({
    File: class {
        constructor(private uri: string) {}
        base64(): Promise<string> {
            return state.base64Throws ? Promise.reject(new Error('unreadable')) : Promise.resolve(state.base64);
        }
    },
}));

vi.mock('@memberjunction/core', () => {
    class FakeLink {
        ID = 'link-1';
        FileID = '';
        EntityID = '';
        RecordID = '';
        LatestResult = { CompleteMessage: 'err' };
        NewRecord(): void {}
        async Save(): Promise<boolean> {
            state.lastSavedLink = { FileID: this.FileID, EntityID: this.EntityID, RecordID: this.RecordID };
            return state.saveResult;
        }
    }
    class Metadata {
        get CurrentUser(): { ID: string } {
            return { ID: 'user-1' };
        }
        EntityByName(name: string): { ID: string; Name: string } | undefined {
            return state.entityKnown ? { ID: 'entity-1', Name: name } : undefined;
        }
        async GetEntityObject(entityName: string): Promise<FakeLink | FakeConvAttachment> {
            return entityName === 'MJ: Conversation Detail Attachments' ? new FakeConvAttachment() : new FakeLink();
        }
    }
    class FakeConvAttachment {
        ID = 'ca-1';
        ConversationDetailID = '';
        FileID = '';
        ModalityID = '';
        MimeType = '';
        FileName = '';
        FileSizeBytes = 0;
        DisplayOrder = 0;
        LatestResult = { CompleteMessage: 'err' };
        NewRecord(): void {}
        async Save(): Promise<boolean> {
            state.lastSavedConvAttachment = {
                ConversationDetailID: this.ConversationDetailID,
                FileID: this.FileID,
                ModalityID: this.ModalityID,
                MimeType: this.MimeType,
                FileName: this.FileName,
                FileSizeBytes: this.FileSizeBytes,
                DisplayOrder: this.DisplayOrder,
            };
            return state.saveResult;
        }
    }
    class RunView {
        async RunView(params: { ExtraFilter?: string }): Promise<{ Success: boolean; Results: unknown[] }> {
            state.lastModalityFilter = params?.ExtraFilter ?? '';
            return { Success: state.modalityLookupSuccess, Results: state.modalityRows };
        }
    }
    class CompositeKey {
        constructor(private readonly value: string) {}
        static FromID(id: string): CompositeKey {
            return new CompositeKey(id);
        }
        ToCompactURLSegment(): string {
            return this.value;
        }
    }
    return { Metadata, CompositeKey, RunView };
});

vi.mock('@memberjunction/graphql-dataprovider', () => {
    class GraphQLFileStorageClient {
        async UploadFile(input: { FileName: string; Base64Data: string; MimeType?: string; Description?: string }) {
            if (state.uploadThrows) throw new Error('network');
            state.lastUploadInput = input;
            return state.uploadResult;
        }
    }
    return { GraphQLFileStorageClient, GraphQLDataProvider: { Instance: {} } };
});

import { CompositeKey } from '@memberjunction/core';
import {
    capturePhoto,
    composeMessageWithAttachment,
    describeAttachment,
    uploadAttachment,
    linkAttachmentToRecord,
    uploadAndLinkAttachment,
    attachFileToConversationDetail,
    uploadAndAttachToMessage,
    pickDocument,
    pickImageFromLibrary,
    readAttachmentBase64,
    type CapturedAttachment,
} from '@/data/services/attachments';

beforeEach(() => {
    state.libraryPerm = { granted: true, canAskAgain: true };
    state.cameraPerm = { granted: true, canAskAgain: true };
    state.requestResult = { granted: true };
    state.imageResult = { canceled: false, assets: [{ uri: 'file:///lib/IMG.jpg', fileName: 'IMG.jpg', mimeType: 'image/jpeg', fileSize: 2048 }] };
    state.cameraThrows = false;
    state.docResult = { canceled: false, assets: [{ uri: 'file:///docs/report.pdf', name: 'report.pdf', mimeType: 'application/pdf', size: 4096 }] };
    state.base64 = 'Zm9vYmFy';
    state.base64Throws = false;
    state.uploadResult = { Success: true, FileID: 'file-1' };
    state.uploadThrows = false;
    state.lastUploadInput = null;
    state.saveResult = true;
    state.lastSavedLink = null;
    state.entityKnown = true;
    state.modalityRows = [{ ID: 'modality-1' }];
    state.modalityLookupSuccess = true;
    state.lastModalityFilter = '';
    state.lastSavedConvAttachment = null;
});

describe('pickImageFromLibrary', () => {
    it('maps a picked asset to a CapturedAttachment', async () => {
        const att = await pickImageFromLibrary();
        expect(att).toEqual<CapturedAttachment>({
            uri: 'file:///lib/IMG.jpg',
            name: 'IMG.jpg',
            mimeType: 'image/jpeg',
            size: 2048,
            kind: 'image',
        });
    });

    it('returns null (no throw) when the user cancels', async () => {
        state.imageResult = { canceled: true, assets: null };
        expect(await pickImageFromLibrary()).toBeNull();
    });

    it('returns null when library permission is permanently denied (no re-prompt)', async () => {
        state.libraryPerm = { granted: false, canAskAgain: false };
        expect(await pickImageFromLibrary()).toBeNull();
    });

    it('prompts and honors the request when the permission is askable', async () => {
        state.libraryPerm = { granted: false, canAskAgain: true };
        state.requestResult = { granted: true };
        const att = await pickImageFromLibrary();
        expect(att?.name).toBe('IMG.jpg');
    });

    it('falls back to a derived name + default mime when the asset omits them', async () => {
        state.imageResult = { canceled: false, assets: [{ uri: 'file:///lib/snap.png' }] };
        const att = await pickImageFromLibrary();
        expect(att).toMatchObject({ name: 'snap.png', mimeType: 'image/jpeg', kind: 'image' });
    });
});

describe('capturePhoto', () => {
    it('maps a captured photo to a CapturedAttachment', async () => {
        const att = await capturePhoto();
        expect(att).toMatchObject({ kind: 'image', mimeType: 'image/jpeg' });
    });

    it('returns null when camera permission is denied', async () => {
        state.cameraPerm = { granted: false, canAskAgain: false };
        expect(await capturePhoto()).toBeNull();
    });

    it('degrades gracefully (null, no throw) when there is no camera (simulator)', async () => {
        state.cameraThrows = true;
        expect(await capturePhoto()).toBeNull();
    });
});

describe('pickDocument', () => {
    it('maps a picked document to a CapturedAttachment', async () => {
        const att = await pickDocument();
        expect(att).toEqual<CapturedAttachment>({
            uri: 'file:///docs/report.pdf',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            size: 4096,
            kind: 'document',
        });
    });

    it('returns null when the user cancels', async () => {
        state.docResult = { canceled: true, assets: null };
        expect(await pickDocument()).toBeNull();
    });

    it('falls back to octet-stream when mimeType is missing', async () => {
        state.docResult = { canceled: false, assets: [{ uri: 'file:///docs/data.bin', name: 'data.bin' }] };
        const att = await pickDocument();
        expect(att?.mimeType).toBe('application/octet-stream');
    });
});

describe('readAttachmentBase64', () => {
    const att: CapturedAttachment = { uri: 'file:///lib/IMG.jpg', name: 'IMG.jpg', mimeType: 'image/jpeg', kind: 'image' };

    it('returns the base64 contents', async () => {
        expect(await readAttachmentBase64(att)).toBe('Zm9vYmFy');
    });

    it('returns null (no throw) when the file cannot be read', async () => {
        state.base64Throws = true;
        expect(await readAttachmentBase64(att)).toBeNull();
    });
});

describe('describeAttachment / composeMessageWithAttachment', () => {
    const image: CapturedAttachment = { uri: 'u', name: 'IMG.jpg', mimeType: 'image/jpeg', size: 2048, kind: 'image' };
    const doc: CapturedAttachment = { uri: 'u', name: 'report.pdf', mimeType: 'application/pdf', kind: 'document' };

    it('describes an image with a formatted size', () => {
        expect(describeAttachment(image)).toBe('[Attached image: IMG.jpg (image/jpeg, 2 KB)]');
    });

    it('describes a document without a size when unknown', () => {
        expect(describeAttachment(doc)).toBe('[Attached file: report.pdf (application/pdf)]');
    });

    it('returns trimmed text unchanged when there is no attachment', () => {
        expect(composeMessageWithAttachment('  hi  ', null)).toBe('hi');
    });

    it('appends the note under the text when both are present', () => {
        expect(composeMessageWithAttachment('look', image)).toBe('look\n\n[Attached image: IMG.jpg (image/jpeg, 2 KB)]');
    });

    it('uses only the note when the text is empty', () => {
        expect(composeMessageWithAttachment('', doc)).toBe('[Attached file: report.pdf (application/pdf)]');
    });
});

describe('uploadAttachment', () => {
    const att: CapturedAttachment = { uri: 'u', name: 'report.pdf', mimeType: 'application/pdf', kind: 'document' };

    it('uploads the bytes and returns the new MJ: Files id', async () => {
        const result = await uploadAttachment(att);
        expect(result).toEqual({ id: 'file-1' });
        expect(state.lastUploadInput).toMatchObject({
            FileName: 'report.pdf',
            Base64Data: 'Zm9vYmFy',
            MimeType: 'application/pdf',
        });
    });

    it('sends a human-readable description alongside the bytes', async () => {
        await uploadAttachment(att);
        expect(state.lastUploadInput?.Description).toContain('report.pdf');
    });

    it('returns null when the file bytes cannot be read', async () => {
        state.base64Throws = true;
        expect(await uploadAttachment(att)).toBeNull();
    });

    it('returns null when the server rejects the upload', async () => {
        state.uploadResult = { Success: false, ErrorMessage: 'quota exceeded' };
        expect(await uploadAttachment(att)).toBeNull();
    });

    it('returns null rather than throwing when the transport fails', async () => {
        state.uploadThrows = true;
        await expect(uploadAttachment(att)).resolves.toBeNull();
    });

    it('returns null when the server reports success but no file id', async () => {
        state.uploadResult = { Success: true };
        expect(await uploadAttachment(att)).toBeNull();
    });
});

describe('linkAttachmentToRecord', () => {
    it('writes a link row keyed by the record, not by a hardcoded ID column', async () => {
        const ok = await linkAttachmentToRecord('file-1', 'MJ: Conversation Details', CompositeKey.FromID('detail-9'));
        expect(ok).toBe(true);
        expect(state.lastSavedLink).toEqual({
            FileID: 'file-1',
            EntityID: 'entity-1',
            RecordID: 'detail-9',
        });
    });

    it('returns false for an entity that is not in metadata', async () => {
        state.entityKnown = false;
        expect(await linkAttachmentToRecord('file-1', 'Nope', CompositeKey.FromID('x'))).toBe(false);
    });

    it('returns false when the link row fails to save', async () => {
        state.saveResult = false;
        expect(await linkAttachmentToRecord('file-1', 'MJ: Conversation Details', CompositeKey.FromID('d'))).toBe(false);
    });
});

describe('uploadAndLinkAttachment', () => {
    const att: CapturedAttachment = { uri: 'u', name: 'report.pdf', mimeType: 'application/pdf', kind: 'document' };

    it('uploads then links, reporting both outcomes', async () => {
        const result = await uploadAndLinkAttachment(att, 'MJ: Conversation Details', CompositeKey.FromID('d1'));
        expect(result).toEqual({ id: 'file-1', linked: true });
    });

    it('keeps the uploaded file even when linking fails — stored beats discarded', async () => {
        state.saveResult = false;
        const result = await uploadAndLinkAttachment(att, 'MJ: Conversation Details', CompositeKey.FromID('d1'));
        expect(result).toEqual({ id: 'file-1', linked: false });
    });

    it('returns null when the upload itself failed', async () => {
        state.uploadResult = { Success: false };
        expect(await uploadAndLinkAttachment(att, 'MJ: Conversation Details', CompositeKey.FromID('d1'))).toBeNull();
    });
});

describe('attachFileToConversationDetail', () => {
    const image: CapturedAttachment = { uri: 'u', name: 'IMG.jpg', mimeType: 'image/jpeg', size: 2048, kind: 'image' };

    it('writes a first-class conversation attachment row', async () => {
        const ok = await attachFileToConversationDetail('file-1', 'detail-1', image);
        expect(ok).toBe(true);
        expect(state.lastSavedConvAttachment).toEqual({
            ConversationDetailID: 'detail-1',
            FileID: 'file-1',
            ModalityID: 'modality-1',
            MimeType: 'image/jpeg',
            FileName: 'IMG.jpg',
            FileSizeBytes: 2048,
            DisplayOrder: 0,
        });
    });

    it('routes an image to the Image modality so a vision model can consume it', async () => {
        await attachFileToConversationDetail('f', 'd', image);
        expect(state.lastModalityFilter).toContain("Name='Image'");
    });

    it('routes audio and video to their own modalities', async () => {
        await attachFileToConversationDetail('f', 'd', { ...image, mimeType: 'audio/m4a' });
        expect(state.lastModalityFilter).toContain("Name='Audio'");
        await attachFileToConversationDetail('f', 'd', { ...image, mimeType: 'video/mp4' });
        expect(state.lastModalityFilter).toContain("Name='Video'");
    });

    it('falls back to the File modality for anything unclassifiable', async () => {
        await attachFileToConversationDetail('f', 'd', { ...image, mimeType: 'application/pdf' });
        expect(state.lastModalityFilter).toContain("Name='File'");
    });

    it('reports an unreported size as 0 rather than blocking the attachment', async () => {
        await attachFileToConversationDetail('f', 'd', { uri: 'u', name: 'x.bin', mimeType: 'application/octet-stream', kind: 'document' });
        expect(state.lastSavedConvAttachment).toMatchObject({ FileSizeBytes: 0 });
    });

    it('returns false when the deployment has no matching modality row', async () => {
        state.modalityRows = [];
        expect(await attachFileToConversationDetail('f', 'd', image)).toBe(false);
    });

    it('returns false when the row fails to save', async () => {
        state.saveResult = false;
        expect(await attachFileToConversationDetail('f', 'd', image)).toBe(false);
    });
});

describe('uploadAndAttachToMessage', () => {
    const image: CapturedAttachment = { uri: 'u', name: 'IMG.jpg', mimeType: 'image/jpeg', size: 2048, kind: 'image' };

    it('uploads then attaches, reporting both outcomes', async () => {
        expect(await uploadAndAttachToMessage(image, 'detail-1')).toEqual({ id: 'file-1', attached: true });
    });

    it('keeps the uploaded file when attaching fails', async () => {
        state.saveResult = false;
        expect(await uploadAndAttachToMessage(image, 'detail-1')).toEqual({ id: 'file-1', attached: false });
    });

    it('returns null when the upload failed', async () => {
        state.uploadResult = { Success: false };
        expect(await uploadAndAttachToMessage(image, 'detail-1')).toBeNull();
    });
});
