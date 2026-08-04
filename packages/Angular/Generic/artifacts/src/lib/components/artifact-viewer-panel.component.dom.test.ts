import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
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

interface State { isLoading?: boolean; error?: string | null; artifact?: MJArtifactEntity | null; allVersions?: MJArtifactVersionEntity[]; selectedVersionNumber?: number }
function render(state: State = {}, inputs: Record<string, unknown> = {}) {
  vi.spyOn(ArtifactViewerPanelComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  return renderComponentFixture(ArtifactViewerPanelComponent, {
    imports: CHILDREN,
    declarations: [ArtifactViewerPanelComponent],
    providers: [{ provide: MJNotificationService, useValue: {} }],
    inputs: { artifactId: 'a1', ...inputs },
    setup: (c) => {
      c.isLoading = state.isLoading ?? false;
      c.error = state.error ?? null;
      c.artifact = state.artifact ?? ARTIFACT;
      c.allVersions = state.allVersions ?? [VERSION];
      c.selectedVersionNumber = state.selectedVersionNumber ?? 2;
    },
  });
}

afterEach(() => vi.restoreAllMocks());

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
