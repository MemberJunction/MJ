import '@angular/compiler';
import { EventEmitter, SimpleChange } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import {
  LibraryCreationService,
  SynthesizeArtifactFromSourcesResult,
} from '../lib/services/library-creation.service';
import { LibraryCreateDialogComponent } from '../lib/components/library/library-create-dialog.component';
import { LibraryWorkspaceComponent } from '../lib/components/library/library-workspace.component';
import { LibraryItemSummary } from '../lib/components/library/library.models';

const TEST_USER = {
  ID: '11111111-1111-4111-8111-111111111111',
  Name: 'Amith Nagarajan',
  Email: 'amith@example.com',
} as UserInfo;

function makeItem(id: string, name: string, typeName: string, collectionIds: string[] = []): LibraryItemSummary {
  return {
    Id: id,
    Name: name,
    Description: `${name} summary`,
    TypeName: typeName,
    TypeId: 'type-1',
    DriverClass: 'MarkdownArtifactViewerPlugin',
    Category: typeName.includes('Spreadsheet') ? 'spreadsheets' : 'documents',
    CategoryBadge: typeName.includes('Spreadsheet') ? 'Sheet' : 'Doc',
    Icon: 'fa-solid fa-file-lines',
    LatestVersionNumber: 1,
    LatestVersionId: `ver-${id}`,
    ContentMode: 'Text',
    UpdatedAt: new Date(),
    CreatedAt: new Date(),
    CollectionIds: collectionIds,
    CollectionNames: [],
    CanRead: true,
    CanEdit: true,
    CanDelete: false,
    CanShare: false,
    IsOwnedByCurrentUser: true,
    IsSharedWithMe: false,
    IsStarred: false,
  };
}

describe('Library Multi-Artifact Synthesis UI & Service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LibraryCreationService.SynthesizeArtifactFromSources calls GraphQL mutation with expected variables and handles errors', async () => {
    const service = Object.create(LibraryCreationService.prototype) as LibraryCreationService;
    const executeGQL = vi.fn(async () => ({
      SynthesizeArtifactFromSources: {
        Success: true,
        ArtifactID: 'new-synth-art-1',
        VersionID: 'new-synth-ver-1',
        VersionNumber: 1,
        Title: 'Executive Synthesis',
        ArtifactTypeName: 'Presentation',
        LinkedChartCount: 2,
        SourceCount: 3,
        Warnings: [],
        UsedFallback: false,
      },
    }));

    const providerStub = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    const result = await service.SynthesizeArtifactFromSources({
      TargetKind: 'presentation',
      Goal: 'Synthesize board KPIs',
      SourceArtifactIds: ['a1', 'a2', 'a3'],
      CollectionID: 'col-1',
      Title: 'Executive Synthesis',
      LinkChartsAndRanges: true,
      CurrentUser: TEST_USER,
      Provider: providerStub,
    });

    expect(executeGQL).toHaveBeenCalledTimes(1);
    const [query, variables] = executeGQL.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(query).toContain('mutation SynthesizeArtifactFromSources');
    expect(variables).toEqual({
      targetKind: 'presentation',
      goal: 'Synthesize board KPIs',
      sourceArtifactIds: ['a1', 'a2', 'a3'],
      collectionId: 'col-1',
      title: 'Executive Synthesis',
      agentHandle: null,
      linkChartsAndRanges: true,
    });
    expect(result.ArtifactID).toBe('new-synth-art-1');
    expect(result.LinkedChartCount).toBe(2);

    const denyProvider = {
      ExecuteGQL: vi.fn(async () => ({
        SynthesizeArtifactFromSources: {
          Success: false,
          AccessDenied: true,
          ErrorMessage: 'Permission denied on restricted source',
        },
      })),
    } as unknown as IMetadataProvider;

    await expect(
      service.SynthesizeArtifactFromSources({
        TargetKind: 'document',
        Goal: 'Summary',
        SourceArtifactIds: ['restricted-id'],
        CurrentUser: TEST_USER,
        Provider: denyProvider,
      }),
    ).rejects.toThrow('Permission denied on restricted source');
  });

  it('LibraryCreateDialogComponent manages synthesize tab state, UserInfoEngine target preference, and submits SynthesizeArtifactFromSources', async () => {
    const dialog = Object.create(LibraryCreateDialogComponent.prototype) as LibraryCreateDialogComponent;
    dialog.StarterTiles = [];
    dialog.SynthesisTargetOptions = [
      { Kind: 'presentation', Label: 'Presentation', Icon: 'fa-solid fa-person-chalkboard' },
      { Kind: 'document', Label: 'Markdown Document', Icon: 'fa-solid fa-file-lines' },
      { Kind: 'spreadsheet', Label: 'Excel Spreadsheet', Icon: 'fa-solid fa-table-cells' },
    ];
    dialog.SynthesisGoalPresets = [];
    dialog.SynthesisTargetKind = 'presentation';
    dialog.SynthesisGoal = 'Synthesize board KPIs';
    dialog.LinkChartsAndRanges = true;
    dialog.Collections = [];
    dialog.ArtifactTypes = [];
    dialog.Synthesized = new EventEmitter<SynthesizeArtifactFromSourcesResult>();
    dialog.Created = new EventEmitter();
    dialog.Cancelled = new EventEmitter();

    const getSettingSpy = vi
      .spyOn(UserInfoEngine.Instance, 'GetSetting')
      .mockReturnValue('document');
    const setSettingSpy = vi
      .spyOn(UserInfoEngine.Instance, 'SetSettingDebounced')
      .mockImplementation(() => undefined);

    const synthesizeSpy = vi.fn(async () => ({
      Success: true,
      ArtifactID: 'synth-art-99',
      VersionID: 'synth-ver-1',
      VersionNumber: 1,
      Title: 'Q1 Executive Memo',
      ArtifactTypeName: 'Markdown Document',
      LinkedChartCount: 1,
      SourceCount: 2,
      Warnings: [],
      UsedFallback: false,
    }));

    const internal = dialog as unknown as {
      creationService: {
        SynthesizeArtifactFromSources: typeof synthesizeSpy;
        LoadEnabledArtifactTypes: () => Promise<[]>;
      };
      notifications: { CreateSimpleNotification: ReturnType<typeof vi.fn> };
      cdr: { detectChanges: ReturnType<typeof vi.fn> };
    };
    internal.creationService = {
      SynthesizeArtifactFromSources: synthesizeSpy,
      LoadEnabledArtifactTypes: vi.fn(async () => []),
    };
    internal.notifications = { CreateSimpleNotification: vi.fn() };
    internal.cdr = { detectChanges: vi.fn() };

    const items = [
      makeItem('art-1', 'Q1 Strategy Brief', 'Markdown Document', ['col-board']),
      makeItem('art-2', 'Revenue Workbook', 'Excel Spreadsheet', ['col-board']),
      makeItem('art-3', 'Unrelated Notes', 'Markdown Document', []),
    ];
    dialog.AvailableItems = items;
    dialog.DefaultSelectedArtifactIds = ['art-1', 'art-2'];
    dialog.DefaultCollectionId = 'col-board';
    dialog.InitialTab = 'synthesize';
    dialog.CurrentUser = TEST_USER;
    dialog.IsOpen = true;

    dialog.ngOnChanges({
      IsOpen: new SimpleChange(false, true, true),
    });

    expect(getSettingSpy).toHaveBeenCalledWith('Library/LastSynthesisTargetKind');
    expect(dialog.SynthesisTargetKind).toBe('document');
    expect(dialog.SelectedSourceIds.has('art-1')).toBe(true);
    expect(dialog.SelectedSourceIds.has('art-2')).toBe(true);
    expect(dialog.SelectedSourceIds.has('art-3')).toBe(false);
    expect(dialog.CanSubmit).toBe(true);

    dialog.SelectSynthesisTarget('presentation');
    expect(setSettingSpy).toHaveBeenCalledWith('Library/LastSynthesisTargetKind', 'presentation');

    const emitted: SynthesizeArtifactFromSourcesResult[] = [];
    dialog.Synthesized.subscribe((res) => emitted.push(res));

    dialog.Title = 'Board Deck';
    await dialog.Submit();

    expect(synthesizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        TargetKind: 'presentation',
        SourceArtifactIds: ['art-1', 'art-2'],
        CollectionID: 'col-board',
        Title: 'Board Deck',
      }),
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0].ArtifactID).toBe('synth-art-99');
  });

  it('LibraryWorkspaceComponent OpenSynthesizeDialog pre-selects collection items and opens Studio on completion', async () => {
    const workspace = Object.create(LibraryWorkspaceComponent.prototype) as LibraryWorkspaceComponent;
    workspace.SelectedCollectionId = 'col-board';
    workspace.CategoryFilter = 'all';
    workspace.OwnershipFilter = 'all';
    workspace.SearchQuery = '';
    workspace.UnifiedScope;
    workspace.AllItems = [
      makeItem('art-1', 'Board Memo', 'Markdown Document', ['col-board']),
      makeItem('art-2', 'ARR Forecast', 'Excel Spreadsheet', ['col-board']),
      makeItem('art-3', 'Other Item', 'Markdown Document', ['col-other']),
    ];

    const wInternal = workspace as unknown as {
      cdr: { detectChanges: ReturnType<typeof vi.fn> };
      ReloadWorkspaceData: ReturnType<typeof vi.fn>;
      OpenArtifactStudio: ReturnType<typeof vi.fn>;
    };
    wInternal.cdr = { detectChanges: vi.fn() };
    wInternal.ReloadWorkspaceData = vi.fn(async () => undefined);
    wInternal.OpenArtifactStudio = vi.fn();

    Object.defineProperty(workspace, 'UnifiedScope', { get: () => 'collection' });
    Object.defineProperty(workspace, 'SelectedDrive', { get: () => null });

    workspace.OpenSynthesizeDialog();
    expect(workspace.CreateDialogTab).toBe('synthesize');
    expect(workspace.IsCreateDialogOpen).toBe(true);
    expect(workspace.DefaultSynthesisArtifactIds).toEqual(['art-1', 'art-2']);

    await workspace.OnArtifactSynthesized({
      Success: true,
      ArtifactID: 'synth-deck-1',
      VersionID: 'synth-ver-1',
      VersionNumber: 1,
      Title: 'Synthesized Deck',
      ArtifactTypeName: 'Presentation',
      LinkedChartCount: 1,
      SourceCount: 2,
      Warnings: [],
      UsedFallback: false,
    });

    expect(workspace.IsCreateDialogOpen).toBe(false);
    expect(wInternal.ReloadWorkspaceData).toHaveBeenCalledTimes(1);
    expect(wInternal.OpenArtifactStudio).toHaveBeenCalledWith('synth-deck-1', { fullCanvas: true });
  });
});
