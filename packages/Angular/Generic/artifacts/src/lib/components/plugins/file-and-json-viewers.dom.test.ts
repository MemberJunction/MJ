import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, forwardRef, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { ArtifactFileService } from '../../services/artifact-file.service';
import { DocxArtifactViewerComponent } from './docx-artifact-viewer.component';
import { XlsxArtifactViewerComponent } from './xlsx-artifact-viewer.component';
import { PdfArtifactViewerComponent } from './pdf-artifact-viewer.component';
import { JsonArtifactViewerComponent } from './json-artifact-viewer.component';
import { ImageArtifactViewerComponent } from './image-artifact-viewer.component';

@Component({ standalone: true, selector: 'mj-file-artifact-toolbar', template: '' })
class ToolbarStub {
  @Input() fileName = '';
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() isDownloading = false;
  @Input() showPrint = false;
  @Input() showZoom = false;
  @Input() zoomPercent = 100;
  @Input() canZoomIn = false;
  @Input() canZoomOut = false;
  @Output() download = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();
  @Output() prevPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() zoomReset = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-docx-preview', template: '' })
class DocxPreviewStub {
  @Input() ArrayBuffer: ArrayBuffer | null = null;
  @Output() Loaded = new EventEmitter<string>();
  @Output() Failed = new EventEmitter<string>();
}

@Component({ standalone: true, selector: 'mj-xlsx-preview', template: '' })
class XlsxPreviewStub {
  @Input() ArrayBuffer: ArrayBuffer | null = null;
  @Output() Loaded = new EventEmitter<object[]>();
  @Output() Failed = new EventEmitter<string>();
  @Output() SheetChange = new EventEmitter<number>();
}

@Component({ standalone: true, selector: 'mj-markdown', template: '' })
class MarkdownStub {
  @Input() data = '';
  @Input() enableCollapsibleHeadings = false;
  @Input() enableLineNumbers = false;
  @Input() enableSmartypants = false;
  @Input() enableHtml = false;
}

@Component({
  standalone: true,
  selector: 'mj-code-editor',
  template: '',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CodeEditorStub),
      multi: true,
    },
  ],
})
class CodeEditorStub implements ControlValueAccessor {
  @Input() language = '';
  @Input() readonly = true;
  writeValue(_val: string | null): void {}
  registerOnChange(_fn: (val: string | null) => void): void {}
  registerOnTouched(_fn: () => void): void {}
}

function makeVersion(overrides: Partial<{
  ID: string;
  ArtifactID: string;
  VersionNumber: number;
  Name: string;
  FileName: string;
  MimeType: string;
  ContentMode: string;
  Content: string;
}>): MJArtifactVersionEntity {
  return Object.assign(Object.create(null) as MJArtifactVersionEntity, {
    ID: overrides.ID ?? 'v-1',
    ArtifactID: overrides.ArtifactID ?? 'a-1',
    VersionNumber: overrides.VersionNumber ?? 1,
    Name: overrides.Name ?? 'Test Artifact',
    FileName: overrides.FileName ?? 'test.bin',
    MimeType: overrides.MimeType ?? '',
    ContentMode: overrides.ContentMode ?? 'Inline',
    Content: overrides.Content ?? '',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  TestBed.resetTestingModule();
});

describe('File & JSON Artifact Viewers (XSS + ObjectURL cleanup)', () => {
  it('JsonArtifactViewerComponent binds [srcdoc] without host-origin Blob URLs, removes allow-popups-to-escape-sandbox, and prints in allow-modals iframe', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:json-preview');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    const f = renderComponentFixture(JsonArtifactViewerComponent, {
      imports: [CommonModule, FormsModule, MarkdownStub, CodeEditorStub],
      declarations: [JsonArtifactViewerComponent],
      inputs: {
        artifactVersion: makeVersion({ ID: '', Content: JSON.stringify({ html: '<script>alert(1)</script><p>Hi</p>' }) }),
      },
    });
    await f.componentInstance.ngOnInit();
    f.componentInstance.DisplayHtml = '<script>alert(1)</script><p>Hi</p>';
    f.detectChanges();

    const previewIframe = f.nativeElement.querySelector('iframe.html-iframe') as HTMLIFrameElement | null;
    expect(previewIframe).not.toBeNull();
    expect(previewIframe?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(previewIframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(previewIframe?.getAttribute('sandbox')).not.toContain('allow-popups-to-escape-sandbox');
    expect(previewIframe?.getAttribute('src')).toBeNull();
    expect(previewIframe?.getAttribute('srcdoc')).toContain('<p>Hi</p>');

    f.componentInstance.OpenInNewWindow();
    expect(createSpy).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('blob:json-preview', '_blank', 'noopener,noreferrer');

    f.componentInstance.PrintHtml();
    const iframe = document.body.querySelector('iframe[sandbox="allow-modals allow-scripts"]') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe?.srcdoc).toContain("script-src 'nonce-");
    expect(iframe?.srcdoc).not.toContain('<script>alert(1)</script>');
    iframe?.remove();

    f.destroy();
  });

  it('DocxArtifactViewerComponent revokes inline blob URL on destroy and prints inside sandboxed allow-modals iframe', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:docx-inline-1');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const inlineContent = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${btoa('PK-mock-docx')}`;

    const f = renderComponentFixture(DocxArtifactViewerComponent, {
      imports: [CommonModule, ToolbarStub, DocxPreviewStub],
      declarations: [DocxArtifactViewerComponent],
      providers: [{ provide: ArtifactFileService, useClass: ArtifactFileService }],
      inputs: {
        artifactVersion: makeVersion({ FileName: 'memo.docx', ContentMode: 'Inline', Content: inlineContent }),
      },
    });
    await f.componentInstance.ngOnInit();
    f.componentInstance.OnPreviewLoaded('<p>Hello</p><script>evil()</script>');
    f.componentInstance.OnPrint();

    const iframe = document.body.querySelector('iframe[sandbox="allow-modals allow-scripts"]') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe?.srcdoc).toContain("script-src 'nonce-");
    expect(iframe?.srcdoc).not.toContain('<script>evil()</script>');
    iframe?.remove();

    f.destroy();
    expect(revokeSpy).toHaveBeenCalledWith('blob:docx-inline-1');
  });

  it('XlsxArtifactViewerComponent revokes inline blob URL on destroy', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xlsx-inline-1');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const inlineContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${btoa('PK-mock-xlsx')}`;

    const f = renderComponentFixture(XlsxArtifactViewerComponent, {
      imports: [CommonModule, ToolbarStub, XlsxPreviewStub],
      declarations: [XlsxArtifactViewerComponent],
      providers: [{ provide: ArtifactFileService, useClass: ArtifactFileService }],
      inputs: {
        artifactVersion: makeVersion({ FileName: 'sheet.xlsx', ContentMode: 'Inline', Content: inlineContent }),
      },
    });
    await f.componentInstance.ngOnInit();
    f.destroy();
    expect(revokeSpy).toHaveBeenCalledWith('blob:xlsx-inline-1');
  });

  it('PdfArtifactViewerComponent revokes inline blob URL on destroy after loading', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-inline-1');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const inlineContent = `data:application/pdf;base64,${btoa('%PDF-1.4 valid-stub')}`;

    const f = renderComponentFixture(PdfArtifactViewerComponent, {
      imports: [CommonModule, ToolbarStub],
      declarations: [PdfArtifactViewerComponent],
      providers: [{ provide: ArtifactFileService, useClass: ArtifactFileService }],
      inputs: {
        artifactVersion: makeVersion({ FileName: 'doc.pdf', ContentMode: 'Inline', Content: inlineContent }),
      },
    });
    const inst = f.componentInstance as object as {
      initPdfJs: () => Promise<void>;
      loadPdfFromData: () => Promise<{ numPages: number; destroy: () => void }>;
      setFitWidthZoom: () => Promise<void>;
      renderPage: () => Promise<void>;
    };
    vi.spyOn(inst, 'initPdfJs').mockResolvedValue(undefined);
    vi.spyOn(inst, 'loadPdfFromData').mockResolvedValue({ numPages: 1, destroy: vi.fn() });
    vi.spyOn(inst, 'setFitWidthZoom').mockResolvedValue(undefined);
    vi.spyOn(inst, 'renderPage').mockResolvedValue(undefined);

    await f.componentInstance.ngOnInit();
    f.destroy();
    expect(revokeSpy).toHaveBeenCalledWith('blob:pdf-inline-1');
  });

  it('ImageArtifactViewerComponent.OnPrint prints inline SVG in sandbox="allow-modals" with scripts stripped and never calls bare window.open', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="20" height="20" onload="alert(2)"/></svg>';
    const svgDataUri = `data:image/svg+xml;base64,${btoa(maliciousSvg)}`;

    const f = renderComponentFixture(ImageArtifactViewerComponent, {
      imports: [CommonModule, ToolbarStub],
      declarations: [ImageArtifactViewerComponent],
      providers: [{ provide: ArtifactFileService, useClass: ArtifactFileService }],
      inputs: {
        artifactVersion: makeVersion({
          FileName: 'diagram.svg',
          MimeType: 'image/svg+xml',
          ContentMode: 'Text',
          Content: svgDataUri,
        }),
      },
    });
    await f.componentInstance.ngOnInit();
    f.componentInstance.OnPrint();

    expect(openSpy).not.toHaveBeenCalled();
    const iframe = document.body.querySelector('iframe[sandbox="allow-modals allow-scripts"]') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe?.srcdoc).toContain("script-src 'nonce-");
    expect(iframe?.srcdoc).not.toContain('<script>alert(1)</script>');
    expect(iframe?.srcdoc).not.toContain('onload');
    expect(iframe?.srcdoc).toContain('<rect');
    iframe?.remove();

    f.destroy();
  });
});
