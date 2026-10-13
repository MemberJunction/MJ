import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ArtifactFileService } from '../services/artifact-file.service';
import { renderComponentFixture, query, text, capture, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { ArtifactViewerPanelComponent } from './artifact-viewer-panel.component';

/**
 * DOM coverage for <mj-artifact-viewer-panel> — the artifact viewer with header, version selector and
 * plugin/code/markdown content (~8×). Content loading (ngOnInit) is stubbed and the plugin/editor
 * children are stubbed; these cover the panel chrome driven by public state: the loading state, the
 * error state, the header (title, version, close → closed), and the showHeader gate.
 */

@Component({ standalone: true, selector: 'mj-artifact-type-plugin-viewer', template: '' })
class PluginViewerStub {
  @Input() artifactTypeName = ''; @Input() artifactVersion: unknown; @Input() contentType = ''; @Input() readonly = false;
  @Output() applyFormRequested = new EventEmitter<unknown>(); @Output() navigationRequest = new EventEmitter<unknown>();
  @Output() openEntityRecord = new EventEmitter<unknown>(); @Output() pluginLoaded = new EventEmitter<unknown>(); @Output() tabsChanged = new EventEmitter<unknown>();
}
@Component({ standalone: true, selector: 'mj-code-editor', template: '' })
class CodeEditorStub { @Input() language = ''; @Input() lineWrapping = false; @Input() readonly = false; @Input() value = ''; }
@Component({ standalone: true, selector: 'mj-markdown', template: '' })
class MarkdownStub { @Input() data = ''; @Input() enableCollapsibleHeadings = false; @Input() enableHtml = false; @Input() enableLineNumbers = false; @Input() enableSmartypants = false; }

const CHILDREN = [PluginViewerStub, CodeEditorStub, MarkdownStub, StubEmptyStateComponent];
const ARTIFACT = { Name: 'Q3 Report', Description: 'Quarterly numbers' } as unknown as MJArtifactEntity;
const VERSION = { ID: 'v1', VersionNumber: 2 } as unknown as MJArtifactVersionEntity;
type OnInitProto = { ngOnInit: () => Promise<void> };

interface State { isLoading?: boolean; error?: string | null; artifact?: MJArtifactEntity | null; allVersions?: MJArtifactVersionEntity[]; selectedVersionNumber?: number; artifactVersion?: MJArtifactVersionEntity | null; activeTab?: string; driverClass?: string | null; displayMarkdown?: string | null }
function render(state: State = {}, inputs: Record<string, unknown> = {}) {
  vi.spyOn(ArtifactViewerPanelComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  return renderComponentFixture(ArtifactViewerPanelComponent, {
    imports: CHILDREN,
    declarations: [ArtifactViewerPanelComponent],
    providers: [{ provide: MJNotificationService, useValue: {} }, { provide: ArtifactFileService, useValue: fileServiceStub }],
    inputs: { artifactId: 'a1', ...inputs },
    setup: (c) => {
      c.isLoading = state.isLoading ?? false;
      c.error = state.error ?? null;
      c.artifact = state.artifact ?? ARTIFACT;
      c.allVersions = state.allVersions ?? [VERSION];
      c.selectedVersionNumber = state.selectedVersionNumber ?? 2;
      if (state.artifactVersion !== undefined) c.artifactVersion = state.artifactVersion;
      if (state.activeTab) c.activeTab = state.activeTab;
      if (state.driverClass !== undefined) (c as unknown as { artifactTypeDriverClass: string | null }).artifactTypeDriverClass = state.driverClass;
      if (state.displayMarkdown !== undefined) c.displayMarkdown = state.displayMarkdown;
    },
  });
}

const fileServiceStub = {
  getDownloadUrl: vi.fn(async () => 'https://storage.example/exam.csv'),
  dataUrlToArrayBuffer: (dataUrl: string) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer,
  dataUrlToObjectUrl: () => 'blob:stub',
};

afterEach(() => vi.restoreAllMocks());

describe('ArtifactViewerPanelComponent (DOM) — no viewer plugin fallback', () => {
  const csvVersion = {
    ID: 'v-csv', VersionNumber: 1, ContentMode: 'Text', MimeType: 'text/csv', FileName: 'exam.csv',
    Content: `data:text/csv;base64,${btoa('Number,Question\n1,What is a quorum?')}`,
  } as unknown as MJArtifactVersionEntity;
  const csvArtifact = { Name: 'exam.csv', Type: 'CSV' } as unknown as MJArtifactEntity;

  it('shows a file card with a Download action for a type with no plugin, instead of an empty pane', () => {
    const f = render({ artifact: csvArtifact, allVersions: [csvVersion], selectedVersionNumber: 1, artifactVersion: csvVersion, activeTab: 'display', driverClass: null });
    expect(query(f, '[data-testid="file-fallback"]')).not.toBeNull();
    expect(text(f, '.file-fallback-name')).toContain('exam.csv');
    expect(query(f, '.file-fallback button')).not.toBeNull();
  });

  it('is not shown when a plugin exists', () => {
    const f = render({ artifact: csvArtifact, allVersions: [csvVersion], selectedVersionNumber: 1, artifactVersion: csvVersion, activeTab: 'display', driverClass: 'SomePlugin' });
    expect(query(f, '[data-testid="file-fallback"]')).toBeNull();
  });

  it('is not shown when extracted markdown is available', () => {
    const f = render({ artifact: csvArtifact, allVersions: [csvVersion], selectedVersionNumber: 1, artifactVersion: csvVersion, activeTab: 'display', driverClass: null, displayMarkdown: '# extracted' });
    expect(query(f, '[data-testid="file-fallback"]')).toBeNull();
  });
});

describe('ArtifactViewerPanelComponent (DOM)', () => {
  it('shows the loading state while loading', () => {
    expect(query(render({ isLoading: true }), '.loading-state')).not.toBeNull();
  });

  it('shows the error empty-state when a load error occurred', () => {
    const f = render({ isLoading: false, error: 'Failed to load artifact' });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
  });

  it('renders the header with the artifact display name', () => {
    const f = render({ isLoading: false });
    expect(query(f, '.panel-header')).not.toBeNull();
    expect(text(f, '.panel-header h3')).toContain('Q3 Report');
  });

  it('shows the selected version number in the version selector', () => {
    expect(text(render({ isLoading: false, selectedVersionNumber: 2 }), '.version-label')).toBe('v2');
  });

  it('hides the header when showHeader is false', () => {
    expect(query(render({ isLoading: false }, { showHeader: false }), '.panel-header')).toBeNull();
  });

  it('emits closed when the close button is clicked', () => {
    const f = render({ isLoading: false }, { showCloseButton: true });
    const out = capture(f.componentInstance.closed);
    (query(f, '.close-btn') as HTMLElement).click();
    expect(out.length).toBe(1);
  });
});
