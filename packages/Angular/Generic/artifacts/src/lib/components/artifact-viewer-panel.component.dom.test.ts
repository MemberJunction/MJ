import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { ConversationEngine, type ConversationScope, type MJArtifactEntity, type MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ArtifactFileService } from '../services/artifact-file.service';
import { ArtifactIconService } from '../services/artifact-icon.service';
import { renderComponentFixture, query, queryAll, text, capture, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
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
  @Input() VisibleVersionNumbers: ReadonlyArray<number> | null = null;
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

// ─── Versions in a conversation scope ───────────────────────────────────────────────────────────

const CONVERSATION_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const SCOPE: ConversationScope = {
  ConversationID: CONVERSATION_ID,
  BranchID: BRANCH_ID,
  Branches: [{ ID: BRANCH_ID, ConversationID: CONVERSATION_ID, ParentBranchID: null, ForkFromSequence: 2, Name: null }],
};

interface VersionRow { ID: string; ArtifactID: string; VersionNumber: number; Name: string | null; Content: string; __mj_CreatedAt: Date }
interface LinkRow { ID: string; ConversationDetailID: string; ArtifactVersionID: string; Direction: 'Input' | 'Output' }
type LoadSeam = { loadArtifact: (targetVersionNumber?: number) => Promise<void> };

function versionRows(numbers: number[]): VersionRow[] {
  return [...numbers]
    .sort((a, b) => b - a)
    .map((n) => ({ ID: `ver-${n}`, ArtifactID: 'a1', VersionNumber: n, Name: null, Content: '{}', __mj_CreatedAt: new Date('2026-10-01') }));
}

/**
 * A provider whose RunViews returns `rows` for MJ: Artifact Versions, `links` for MJ: Conversation
 * Detail Artifacts and nothing else, and records every batch. GetEntityObject hands back load-only
 * stubs for the artifact and its versions; any other record fails to load.
 */
function versionsProvider(rows: VersionRow[], links: LinkRow[] = []): { Provider: IMetadataProvider; Batches: RunViewParams[][] } {
  const batches: RunViewParams[][] = [];
  const toResult = (results: unknown[]): RunViewResult =>
    ({ Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length }) as unknown as RunViewResult;
  const fake = {
    CurrentUser: { ID: 'test-user-id' },
    Entities: [],
    Roles: [],
    EntityByName: () => undefined,
    RunView: async () => toResult([]),
    RunViews: async (list: RunViewParams[]) => {
      batches.push(list);
      return list.map((p) => toResult(
        p.EntityName === 'MJ: Artifact Versions' ? rows : p.EntityName === 'MJ: Conversation Detail Artifacts' ? links : []
      ));
    },
    GetEntityObject: async (entityName: string) => {
      if (entityName === 'MJ: Artifacts') {
        return { ID: 'a1', Name: 'Q3 Report', Description: null, Type: null, Load: async () => true };
      }
      const version: Partial<VersionRow> & { Load: (id: string) => Promise<boolean> } = {
        Load: async (id: string) => {
          const row = rows.find((r) => r.ID === id);
          if (row) Object.assign(version, row);
          return !!row;
        },
      };
      return version;
    },
  };
  return { Provider: fake as unknown as IMetadataProvider, Batches: batches };
}

async function renderLoaded(numbers: number[], inputs: Record<string, unknown>, targetVersionNumber?: number, links: LinkRow[] = []) {
  vi.spyOn(ArtifactViewerPanelComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  const { Provider, Batches } = versionsProvider(versionRows(numbers), links);
  const f = renderComponentFixture(ArtifactViewerPanelComponent, {
    imports: CHILDREN,
    declarations: [ArtifactViewerPanelComponent],
    providers: [
      { provide: MJNotificationService, useValue: {} },
      { provide: ArtifactFileService, useValue: fileServiceStub },
      { provide: ArtifactIconService, useValue: { getArtifactIcon: () => 'fa-file' } },
    ],
    inputs: { artifactId: 'a1', Provider, ...inputs },
  });
  await (f.componentInstance as unknown as LoadSeam).loadArtifact(targetVersionNumber);
  f.detectChanges();
  return { f, Batches };
}

function dropdownLabels(f: ReturnType<typeof renderComponentFixture<ArtifactViewerPanelComponent>>): string[] {
  f.componentInstance.ShowVersionDropdown = true;
  f.componentRef.changeDetectorRef.markForCheck();
  f.detectChanges();
  return queryAll(f, '.version-option .version-number').map((el) => el.textContent?.trim() ?? '');
}

describe('ArtifactViewerPanelComponent — versions in a conversation scope', () => {
  it('reads the version list with ArtifactVersionScopeFilter when a scope is set', async () => {
    const { Batches } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'conversation' });
    expect(Batches[0][0].EntityName).toBe('MJ: Artifact Versions');
    expect(Batches[0][0].ExtraFilter).toBe(ConversationEngine.ArtifactVersionScopeFilter(SCOPE, 'a1'));
  });

  it('reads every version of the artifact without a scope', async () => {
    const { Batches } = await renderLoaded([1, 2, 3], { viewContext: 'conversation' });
    expect(Batches[0][0].ExtraFilter).toBe("ArtifactID='a1'");
  });

  it('keeps the collection and link queries of the batch unchanged with a scope', async () => {
    const { Batches } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'conversation' });
    expect(Batches[0].map((p) => p.EntityName)).toEqual(['MJ: Artifact Versions', 'MJ: Collection Artifacts', 'MJ: Conversation Detail Artifacts']);
    expect(Batches[0][1].ExtraFilter).toContain("WHERE ArtifactID='a1'");
    expect(Batches[0][2].ExtraFilter).toContain("WHERE ArtifactID='a1'");
  });

  it('labels a version that follows a gap with the visible version before it', async () => {
    const { f } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'conversation' });
    expect(dropdownLabels(f)).toEqual(['v4 · from v2', 'v2', 'v1']);
  });

  it('labels consecutive versions with their number only', async () => {
    const { f } = await renderLoaded([1, 2, 3], { Scope: SCOPE, viewContext: 'conversation' });
    expect(dropdownLabels(f)).toEqual(['v3', 'v2', 'v1']);
  });

  it('does not label gaps without a scope', async () => {
    const { f } = await renderLoaded([1, 2, 4], { viewContext: 'conversation' });
    expect(dropdownLabels(f)).toEqual(['v4', 'v2', 'v1']);
  });

  it('shows the newest visible version and a notice when the requested version is not visible', async () => {
    const { f } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'conversation' }, 3);
    expect(f.componentInstance.SelectedVersionNumber).toBe(4);
    expect(f.componentInstance.artifactVersion?.ID).toBe('ver-4');
    expect(f.componentInstance.ScopeNotice).toBe('Version 3 is on another branch; showing v4.');
    expect(text(f, '.scope-notice')).toBe('Version 3 is on another branch; showing v4.');
  });

  it('shows the requested version without a notice when it is visible', async () => {
    const { f } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'conversation' }, 2);
    expect(f.componentInstance.SelectedVersionNumber).toBe(2);
    expect(f.componentInstance.ScopeNotice).toBeNull();
    expect(query(f, '.scope-notice')).toBeNull();
  });

  it('clears the notice on the next load', async () => {
    const { f } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'conversation' }, 3);
    expect(f.componentInstance.ScopeNotice).not.toBeNull();
    await (f.componentInstance as unknown as LoadSeam).loadArtifact(2);
    f.detectChanges();
    expect(f.componentInstance.ScopeNotice).toBeNull();
    expect(query(f, '.scope-notice')).toBeNull();
  });

  it('ignores the scope in collection context', async () => {
    const { f, Batches } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'collection' }, 3);
    expect(Batches[0][0].ExtraFilter).toBe("ArtifactID='a1'");
    expect(f.componentInstance.SelectedVersionNumber).toBe(4);
    expect(f.componentInstance.ScopeNotice).toBeNull();
    expect(f.componentInstance.PluginVisibleVersionNumbers).toBeNull();
  });

  it('shows a version whose only link from the path is an Input link, without a notice or error', async () => {
    // An attachment's version is linked to its message with Direction='Input' only; the scoped read returns it.
    const inputLink: LinkRow = { ID: 'cda-1', ConversationDetailID: 'detail-1', ArtifactVersionID: 'ver-1', Direction: 'Input' };
    const { f, Batches } = await renderLoaded([1], { Scope: SCOPE, viewContext: 'conversation' }, 1, [inputLink]);
    expect(Batches[0][0].ExtraFilter).toBe(ConversationEngine.ArtifactVersionScopeFilter(SCOPE, 'a1'));
    expect(f.componentInstance.error).toBeNull();
    expect(f.componentInstance.ScopeNotice).toBeNull();
    expect(f.componentInstance.SelectedVersionNumber).toBe(1);
    expect(f.componentInstance.artifactVersion?.ID).toBe('ver-1');
    expect(query(f, '.scope-notice')).toBeNull();
    expect(queryAll(f, 'mj-empty-state').map((el) => el.getAttribute('title'))).not.toContain("Couldn't load artifact");
  });

  it('reports that no version is on the current path when the scoped read is empty', async () => {
    const { f } = await renderLoaded([], { Scope: SCOPE, viewContext: 'conversation' }, 3);
    expect(f.componentInstance.error).toBe('No version of this artifact is on the current path.');
    expect(queryAll(f, 'mj-empty-state').map((el) => el.getAttribute('title'))).toContain("Couldn't load artifact");
  });

  it('hands the visible version numbers to the viewer plugin with a scope', async () => {
    const { f } = await renderLoaded([1, 2, 4], { Scope: SCOPE, viewContext: 'conversation' });
    expect(f.componentInstance.PluginVisibleVersionNumbers).toEqual([4, 2, 1]);
  });

  it('hands no version numbers to the viewer plugin without a scope', async () => {
    const { f } = await renderLoaded([1, 2, 4], { viewContext: 'conversation' });
    expect(f.componentInstance.PluginVisibleVersionNumbers).toBeNull();
  });
});
