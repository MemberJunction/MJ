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
    storageProviders: [{ ID: 'prov-1' }] as { ID: string }[],
    runViewSuccess: true,
    saveResult: true,
    lastSavedFile: null as { Name: string; ProviderID: string; ContentType: string | null; Status: string } | null,
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
    class FakeFile {
        ID = 'file-1';
        Name = '';
        ProviderID = '';
        ContentType: string | null = null;
        Status = '';
        LatestResult = { CompleteMessage: 'err' };
        NewRecord(): void {}
        async Save(): Promise<boolean> {
            state.lastSavedFile = { Name: this.Name, ProviderID: this.ProviderID, ContentType: this.ContentType, Status: this.Status };
            return state.saveResult;
        }
    }
    class Metadata {
        get CurrentUser(): { ID: string } {
            return { ID: 'user-1' };
        }
        async GetEntityObject(): Promise<FakeFile> {
            return new FakeFile();
        }
    }
    class RunView {
        async RunView(): Promise<{ Success: boolean; Results: unknown[] }> {
            return { Success: state.runViewSuccess, Results: state.storageProviders };
        }
    }
    return { Metadata, RunView };
});

import {
    capturePhoto,
    composeMessageWithAttachment,
    describeAttachment,
    persistAttachment,
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
    state.storageProviders = [{ ID: 'prov-1' }];
    state.runViewSuccess = true;
    state.saveResult = true;
    state.lastSavedFile = null;
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

describe('persistAttachment', () => {
    const att: CapturedAttachment = { uri: 'u', name: 'report.pdf', mimeType: 'application/pdf', kind: 'document' };

    it('creates an MJ: Files catalog record and returns its id', async () => {
        const result = await persistAttachment(att);
        expect(result).toEqual({ id: 'file-1' });
        expect(state.lastSavedFile).toMatchObject({
            Name: 'report.pdf',
            ProviderID: 'prov-1',
            ContentType: 'application/pdf',
            Status: 'Pending',
        });
    });

    it('returns null when no storage provider is configured', async () => {
        state.storageProviders = [];
        expect(await persistAttachment(att)).toBeNull();
    });

    it('returns null when the save fails', async () => {
        state.saveResult = false;
        expect(await persistAttachment(att)).toBeNull();
    });
});
