import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ArtifactFileService } from '../services/artifact-file.service';
import { ArtifactIconService } from '../services/artifact-icon.service';
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

// ─── Collection and link rows by version ID ─────────────────────────────────────────────────────

interface VersionRow { ID: string; ArtifactID: string; VersionNumber: number; Name: string | null; Content: string; __mj_CreatedAt: Date }
type LoadSeam = { loadArtifact: (targetVersionNumber?: number) => Promise<void> };
type ReloadSeam = { loadCollectionAssociations: () => Promise<void>; loadLinksData: () => Promise<void> };

interface ProviderOptions {
  /** Fails a whole batch, as the API's clause screen does, when one filter in it reads the Artifact Versions base view. */
  ScreenBaseViewReads?: boolean;
  /** Rejects the batch that carries the collection and link queries. */
  ThrowOnChildBatch?: boolean;
}

function versionRows(numbers: number[]): VersionRow[] {
  return [...numbers]
    .sort((a, b) => b - a)
    .map((n) => ({ ID: `ver-${n}`, ArtifactID: 'a1', VersionNumber: n, Name: null, Content: '{}', __mj_CreatedAt: new Date('2026-10-01') }));
}

/**
 * A provider whose RunViews returns `rows` for MJ: Artifact Versions and nothing else, and records
 * every batch and every single RunView. GetEntityObject hands back load-only stubs for the artifact
 * and its versions; any other record fails to load.
 */
function versionsProvider(rows: VersionRow[], options: ProviderOptions = {}): { Provider: IMetadataProvider; Batches: RunViewParams[][]; Singles: RunViewParams[] } {
  const batches: RunViewParams[][] = [];
  const singles: RunViewParams[] = [];
  const toResult = (results: unknown[]): RunViewResult =>
    ({ Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length }) as unknown as RunViewResult;
  const refused = (): RunViewResult =>
    ({ Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: "Invalid ExtraFilter: entity 'MJ: Artifact Versions' is row-level-security filtered for you" }) as unknown as RunViewResult;
  const readsVersionsBaseView = (p: RunViewParams) => /vwArtifactVersions/i.test(String(p.ExtraFilter ?? ''));
  const fake = {
    CurrentUser: { ID: 'test-user-id' },
    Entities: [],
    Roles: [],
    EntityByName: () => undefined,
    RunView: async (p: RunViewParams) => {
      singles.push(p);
      return options.ScreenBaseViewReads && readsVersionsBaseView(p) ? refused() : toResult([]);
    },
    RunViews: async (list: RunViewParams[]) => {
      batches.push(list);
      if (options.ScreenBaseViewReads && list.some(readsVersionsBaseView)) {
        return list.map(refused);
      }
      if (options.ThrowOnChildBatch && list.some((p) => p.EntityName === 'MJ: Collection Artifacts')) {
        throw new Error('network down');
      }
      return list.map((p) => toResult(p.EntityName === 'MJ: Artifact Versions' ? rows : []));
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
  return { Provider: fake as unknown as IMetadataProvider, Batches: batches, Singles: singles };
}

async function renderLoaded(numbers: number[], options: ProviderOptions = {}) {
  vi.spyOn(ArtifactViewerPanelComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  const { Provider, Batches, Singles } = versionsProvider(versionRows(numbers), options);
  const f = renderComponentFixture(ArtifactViewerPanelComponent, {
    imports: CHILDREN,
    declarations: [ArtifactViewerPanelComponent],
    providers: [
      { provide: MJNotificationService, useValue: {} },
      { provide: ArtifactFileService, useValue: fileServiceStub },
      { provide: ArtifactIconService, useValue: { getArtifactIcon: () => 'fa-file' } },
    ],
    inputs: { artifactId: 'a1', Provider, viewContext: 'collection' },
  });
  await (f.componentInstance as unknown as LoadSeam).loadArtifact();
  f.detectChanges();
  return { f, Batches, Singles };
}

describe('ArtifactViewerPanelComponent — collection and link rows by version ID', () => {
  const ID_LIST = "ArtifactVersionID IN ('ver-3','ver-2','ver-1')";
  /** The single reads keyed by version ID; the load also reads the selected version's attributes on its own. */
  const childReads = (singles: RunViewParams[]) =>
    singles.filter((p) => p.EntityName === 'MJ: Collection Artifacts' || p.EntityName === 'MJ: Conversation Detail Artifacts');

  it('reads the version list alone, then the collection and link rows by the IDs it returned', async () => {
    const { Batches } = await renderLoaded([1, 2, 3]);
    expect(Batches[0].map((p) => p.EntityName)).toEqual(['MJ: Artifact Versions']);
    expect(Batches[0][0].ExtraFilter).toBe("ArtifactID='a1'");
    expect(Batches[1].map((p) => p.EntityName)).toEqual(['MJ: Collection Artifacts', 'MJ: Conversation Detail Artifacts']);
    expect(Batches[1].map((p) => p.ExtraFilter)).toEqual([ID_LIST, ID_LIST]);
    expect(Batches.length).toBe(2);
  });

  it('opens the artifact for a user whose read of Artifact Versions is row-filtered', async () => {
    // The API refuses a client filter that reads the base view of a row-filtered entity, and the refusal fails the whole batch.
    const { f, Batches, Singles } = await renderLoaded([1, 2, 3], { ScreenBaseViewReads: true });
    expect(f.componentInstance.error).toBeNull();
    expect(f.componentInstance.artifactVersion?.ID).toBe('ver-3');
    expect([...Batches.flat(), ...Singles].map((p) => String(p.ExtraFilter)).filter((filter) => /\bSELECT\b/i.test(filter))).toEqual([]);
  });

  it('reloads the collection and link rows by version ID', async () => {
    const { f, Singles } = await renderLoaded([1, 2, 3]);
    const reload = f.componentInstance as unknown as ReloadSeam;
    expect(childReads(Singles)).toEqual([]);
    await reload.loadCollectionAssociations();
    await reload.loadLinksData();
    expect(childReads(Singles).map((p) => p.EntityName)).toEqual(['MJ: Collection Artifacts', 'MJ: Collection Artifacts', 'MJ: Conversation Detail Artifacts']);
    expect(childReads(Singles).map((p) => p.ExtraFilter)).toEqual([ID_LIST, ID_LIST, ID_LIST]);
  });

  it('still opens the artifact when the collection and link batch fails, and reads those rows one entity at a time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { f, Singles } = await renderLoaded([1, 2, 3], { ThrowOnChildBatch: true });
    expect(f.componentInstance.error).toBeNull();
    expect(f.componentInstance.artifactVersion?.ID).toBe('ver-3');
    expect(childReads(Singles).map((p) => p.EntityName).sort()).toEqual(['MJ: Collection Artifacts', 'MJ: Collection Artifacts', 'MJ: Conversation Detail Artifacts']);
    expect(childReads(Singles).map((p) => p.ExtraFilter)).toEqual([ID_LIST, ID_LIST, ID_LIST]);
  });
});
