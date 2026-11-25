/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import type { ArtifactExportOption } from '../lib/components/base-artifact-viewer.component';
import { MarkdownArtifactViewerComponent } from '../lib/components/plugins/markdown-artifact-viewer.component';
import { SpreadsheetArtifactViewerComponent } from '../lib/components/plugins/spreadsheet-artifact-viewer.component';
import { SlideDeckArtifactViewerComponent } from '../lib/components/plugins/slide-deck-artifact-viewer.component';
import { PdfArtifactViewerComponent } from '../lib/components/plugins/pdf-artifact-viewer.component';
import { DocxArtifactViewerComponent } from '../lib/components/plugins/docx-artifact-viewer.component';
import { XlsxArtifactViewerComponent } from '../lib/components/plugins/xlsx-artifact-viewer.component';
import { ImageArtifactViewerComponent } from '../lib/components/plugins/image-artifact-viewer.component';
import { AudioArtifactViewerComponent } from '../lib/components/plugins/audio-artifact-viewer.component';
import { VideoArtifactViewerComponent } from '../lib/components/plugins/video-artifact-viewer.component';
import { SvgArtifactViewerComponent } from '../lib/components/plugins/svg-artifact-viewer.component';
import { HtmlArtifactViewerComponent } from '../lib/components/plugins/html-artifact-viewer.component';
import { JsonArtifactViewerComponent } from '../lib/components/plugins/json-artifact-viewer.component';
import { CodeArtifactViewerComponent } from '../lib/components/plugins/code-artifact-viewer.component';
import type { PptxExportPackage } from '../lib/services/slide-deck-export.service';

interface ExportMenu {
    GetExportOptions(): ArtifactExportOption[];
    RunExport(key: string): Promise<void>;
}

interface CapturedDownload {
    FileName: string;
    Blob: Blob | null;
}

/** A viewer instance made without its constructor, with the given fields set. */
function bareViewer<T extends object>(viewerClass: { prototype: T }, fields: object = {}): T {
    return Object.assign(Object.create(viewerClass.prototype) as T, fields);
}

function version(fields: Partial<MJArtifactVersionEntity>): MJArtifactVersionEntity {
    return Object.assign(Object.create(null) as MJArtifactVersionEntity, fields);
}

function keysOf(viewer: ExportMenu): string[] {
    return viewer.GetExportOptions().map((option) => option.Key);
}

/** jsdom's Blob has no text(), so read it with a FileReader. */
function readBlobText(blob: Blob | null): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!blob) {
            reject(new Error('No blob was downloaded'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalFetch = globalThis.fetch;

/** Records each file the browser is asked to save. */
function captureDownloads(): CapturedDownload[] {
    const downloads: CapturedDownload[] = [];
    let lastBlob: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
        lastBlob = blob;
        return 'blob:test';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ FileName: this.download, Blob: lastBlob });
    });
    return downloads;
}

afterEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.fetch = originalFetch;
});

describe('Docs export menu', () => {
    it('offers Word, Markdown and PDF, and runs Word and Markdown through the existing exports', async () => {
        const viewer = bareViewer(MarkdownArtifactViewerComponent);
        const docx = vi.spyOn(viewer, 'OnExportDocx').mockResolvedValue();
        const markdown = vi.spyOn(viewer, 'OnExportMarkdown').mockImplementation(() => undefined);

        expect(keysOf(viewer)).toEqual(['docx', 'md', 'pdf-portrait', 'pdf-landscape']);
        await viewer.RunExport('docx');
        await viewer.RunExport('md');
        expect(docx).toHaveBeenCalledTimes(1);
        expect(markdown).toHaveBeenCalledTimes(1);
    });
});

describe('Sheets export menu', () => {
    it('offers the workbook as Excel and the active sheet as CSV, through the existing exports', async () => {
        const viewer = bareViewer(SpreadsheetArtifactViewerComponent);
        const xlsx = vi.spyOn(viewer, 'ExportWorkbookAsXlsx').mockReturnValue(new Uint8Array());
        const csv = vi.spyOn(viewer, 'ExportActiveSheetAsCsv').mockReturnValue('');

        expect(keysOf(viewer)).toEqual(['xlsx', 'csv']);
        await viewer.RunExport('xlsx');
        await viewer.RunExport('csv');
        expect(xlsx).toHaveBeenCalledTimes(1);
        expect(csv).toHaveBeenCalledTimes(1);
    });
});

describe('Slides export menu', () => {
    it('offers PowerPoint and a printable PDF, through the existing exports', async () => {
        const viewer = bareViewer(SlideDeckArtifactViewerComponent);
        const pptx = vi.spyOn(viewer, 'OnExportPptx').mockReturnValue(Object.create(null) as PptxExportPackage);
        const pdf = vi.spyOn(viewer, 'OnExportPdf').mockReturnValue('');

        expect(keysOf(viewer)).toEqual(['pptx', 'pdf-print']);
        await viewer.RunExport('pptx');
        await viewer.RunExport('pdf-print');
        expect(pptx).toHaveBeenCalledTimes(1);
        expect(pdf).toHaveBeenCalledTimes(1);
    });
});

describe('file viewers offer the original file', () => {
    type FileViewer = ExportMenu & { OnDownload(): Promise<void> };
    const cases: Array<[string, { prototype: FileViewer }, string]> = [
        ['PDF', PdfArtifactViewerComponent, 'downloadUrl'],
        ['Word', DocxArtifactViewerComponent, 'downloadUrl'],
        ['Excel', XlsxArtifactViewerComponent, 'downloadUrl'],
        ['Image', ImageArtifactViewerComponent, 'ImageUrl'],
    ];

    it.each(cases)('%s: offers it once the file has loaded, and downloads it with the existing Download', async (_name, viewerClass, urlField) => {
        expect(keysOf(bareViewer(viewerClass, { [urlField]: '' }))).toEqual([]);

        const viewer = bareViewer(viewerClass, { [urlField]: 'https://files.example/doc' });
        const download = vi.spyOn(viewer, 'OnDownload').mockResolvedValue();
        expect(keysOf(viewer)).toEqual(['file']);
        await viewer.RunExport('file');
        expect(download).toHaveBeenCalledTimes(1);
    });
});

describe('media viewers offer the original file', () => {
    const cases: Array<[string, { prototype: ExportMenu }, string]> = [
        ['Audio', AudioArtifactViewerComponent, 'AudioUrl'],
        ['Video', VideoArtifactViewerComponent, 'VideoUrl'],
    ];

    it.each(cases)('%s: downloads the loaded file under its file name', async (_name, viewerClass, urlField) => {
        expect(keysOf(bareViewer(viewerClass, { [urlField]: '' }))).toEqual([]);

        const fetchMock = vi.fn(async () => new Response(new Blob(['media'])));
        globalThis.fetch = fetchMock;
        const downloads = captureDownloads();
        const viewer = bareViewer(viewerClass, {
            [urlField]: 'https://files.example/media',
            artifactVersion: version({ Name: 'Board call', FileName: 'board-call.mp4' }),
        });

        expect(keysOf(viewer)).toEqual(['file']);
        await viewer.RunExport('file');
        expect(fetchMock).toHaveBeenCalledWith('https://files.example/media');
        expect(downloads.map((d) => d.FileName)).toEqual(['board-call.mp4']);
    });
});

describe('text viewers download their source', () => {
    const cases: Array<[string, { prototype: ExportMenu }, string, string, string, string]> = [
        ['SVG', SvgArtifactViewerComponent, 'SvgContent', '<svg></svg>', 'Logo.svg', 'image/svg+xml'],
        ['HTML', HtmlArtifactViewerComponent, 'HtmlContent', '<p>Hi</p>', 'Logo.html', 'text/html'],
        ['JSON', JsonArtifactViewerComponent, 'JsonContent', '{"a":1}', 'Logo.json', 'application/json'],
    ];

    it.each(cases)('%s: offers the source once loaded, and saves it under the artifact name', async (_name, viewerClass, contentField, content, fileName, mimeType) => {
        const artifactVersion = version({ Name: 'Logo' });
        expect(keysOf(bareViewer(viewerClass, { [contentField]: '', artifactVersion }))).toEqual([]);

        const downloads = captureDownloads();
        const viewer = bareViewer(viewerClass, { [contentField]: content, artifactVersion });
        expect(keysOf(viewer)).toEqual(['file']);
        await viewer.RunExport('file');
        expect(downloads.map((d) => d.FileName)).toEqual([fileName]);
        expect(downloads[0].Blob?.type).toBe(mimeType);
        expect(await readBlobText(downloads[0].Blob)).toBe(content);
    });

    it.each([
        ['application/javascript', 'app.js'],
        ['application/sql', 'app.sql'],
        ['text/x-python', 'app.py'],
    ])('Code (%s): saves the source with the extension for its language', async (contentType, fileName) => {
        const downloads = captureDownloads();
        const viewer = bareViewer(CodeArtifactViewerComponent, {
            artifactVersion: version({ Name: 'app', Content: 'print(1)' }),
            ContentType: contentType,
        });
        viewer.ngOnInit();

        expect(keysOf(viewer)).toEqual(['file']);
        await viewer.RunExport('file');
        expect(downloads.map((d) => d.FileName)).toEqual([fileName]);
        expect(await readBlobText(downloads[0].Blob)).toBe('print(1)');
    });
});
