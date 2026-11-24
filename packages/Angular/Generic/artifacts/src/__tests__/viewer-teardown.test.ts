import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ArtifactTypePluginViewerComponent } from '../lib/components/artifact-type-plugin-viewer.component';
import { PdfArtifactViewerComponent } from '../lib/components/plugins/pdf-artifact-viewer.component';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ArtifactTypePluginViewerComponent teardown during GetRegistrationAsync', () => {
    it('does not instantiate the viewer plugin when destroyed while awaiting ClassFactory registration', async () => {
        let resolveReg!: (reg: { SubClass: unknown } | null) => void;
        const regPromise = new Promise<{ SubClass: unknown } | null>((r) => {
            resolveReg = r;
        });
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistrationAsync').mockReturnValue(
            regPromise as ReturnType<typeof MJGlobal.Instance.ClassFactory.GetRegistrationAsync>
        );

        const createComponent = vi.fn();
        const viewer = Object.create(ArtifactTypePluginViewerComponent.prototype) as ArtifactTypePluginViewerComponent;
        const open = viewer as unknown as Record<string, unknown>;
        Object.assign(open, {
            loadSequence: 0,
            isLoading: false,
            error: null,
            ErrorTitle: null,
            ErrorDetails: null,
            componentRef: null,
            loadedDriverClass: null,
            loadedArtifactID: null,
            loadedVersionID: null,
            pluginSubscriptions: [],
            _driverClass: 'FakePlugin',
            artifactVersion: { ID: 'v-1', ArtifactID: 'a-1' },
            ViewerContainer: { createComponent, clear: vi.fn() },
        });

        const load = (viewer as unknown as { loadViewer(): Promise<void> }).loadViewer();
        viewer.ngOnDestroy();
        resolveReg({ SubClass: class FakePlugin {} });
        await load;

        expect(createComponent).not.toHaveBeenCalled();
    });
});

describe('PdfArtifactViewerComponent teardown during async loadPdf', () => {
    it('destroys the loaded PdfDocumentProxy and revokes its object URL if destroyed mid-load', async () => {
        let resolvePdf!: (doc: { numPages: number; destroy: () => void }) => void;
        const pdfPromise = new Promise<{ numPages: number; destroy: () => void }>((r) => {
            resolvePdf = r;
        });
        const destroyDoc = vi.fn();
        const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

        const viewer = Object.create(PdfArtifactViewerComponent.prototype) as PdfArtifactViewerComponent;
        const open = viewer as unknown as Record<string, unknown>;
        Object.assign(open, {
            isDestroyed: false,
            isLoading: true,
            pdfDoc: null,
            renderTask: null,
            downloadUrl: '',
            isObjectUrl: false,
            artifactVersion: {
                ID: 'v-1',
                ContentMode: 'Inline',
                Content: 'data:application/pdf;base64,JVBERi0xLjQK',
                MimeType: 'application/pdf',
            },
            fileService: {
                DataUrlToArrayBuffer: () => new ArrayBuffer(8),
                DataUrlToObjectUrl: () => 'blob:test-pdf',
            },
            cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
            initPdfJs: async () => undefined,
            loadPdfFromData: () => pdfPromise,
        });

        const load = (viewer as unknown as { loadPdf(): Promise<void> }).loadPdf();
        viewer.ngOnDestroy();
        resolvePdf({ numPages: 3, destroy: destroyDoc });
        await load;

        expect(destroyDoc).toHaveBeenCalledTimes(1);
        expect(open.pdfDoc).toBeNull();
        expect(revokeUrl).toHaveBeenCalledWith('blob:test-pdf');
    });
});
