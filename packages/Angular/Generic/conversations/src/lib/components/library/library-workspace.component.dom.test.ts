import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity, IMetadataProvider, IRunViewProvider, Metadata, RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  MJArtifactEntity,
  MJCollectionArtifactEntity,
  MJCollectionEntity,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import { LibraryWorkspaceComponent } from './library-workspace.component';
import { LibraryFullViewComponent } from './library-full-view.component';
import { LibraryCreationService } from '../../services/library-creation.service';
import type { LibraryItemSummary } from './library.models';

@Component({
  standalone: false,
  selector: 'mj-empty-state',
  template: `
    <div class="stub-empty-state" [attr.data-title]="Title">
      <span class="stub-empty-title">{{ Title }}</span>
      <span class="stub-empty-message">{{ Message }}</span>
    </div>
  `,
})
class StubEmptyStateComponent {
  @Input() public Variant = '';
  @Input() public Icon = '';
  @Input() public Title = '';
  @Input() public Message = '';
  @Input() public ActionText = '';
  @Input() public ActionIcon = '';
  @Output() public Action = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-loading',
  template: '<div class="stub-loading">{{ text }}</div>',
})
class StubLoadingComponent {
  @Input() public text = '';
  @Input() public size = '';
}

@Component({
  standalone: false,
  selector: 'mj-page-layout',
  template: '<div class="stub-page-layout"><ng-content></ng-content></div>',
})
class StubPageLayoutComponent {}

@Component({
  standalone: false,
  selector: 'mj-page-header',
  template: '<div class="stub-page-header"><ng-content></ng-content></div>',
})
class StubPageHeaderComponent {
  @Input() public Title = '';
  @Input() public Icon = '';
  @Input() public Subtitle = '';
}

@Component({
  standalone: false,
  selector: 'mj-page-body',
  template: '<div class="stub-page-body"><ng-content></ng-content></div>',
})
class StubPageBodyComponent {
  @Input() public Padding = false;
  @Input() public Flex = false;
  @Input() public Direction = 'row';
}

@Component({
  standalone: false,
  selector: 'mj-stat-badge',
  template: '<span class="stub-stat-badge">{{ Count }} {{ Label }}</span>',
})
class StubStatBadgeComponent {
  @Input() public Count = 0;
  @Input() public Label = '';
}

@Component({
  standalone: false,
  selector: 'mj-page-search',
  template: '<div class="stub-page-search"></div>',
})
class StubPageSearchComponent {
  @Input() public AriaLabel = '';
  @Input() public Placeholder = '';
  @Input() public Value = '';
  @Output() public ValueChange = new EventEmitter<string>();
}

@Component({
  standalone: false,
  selector: 'mj-filter-popover',
  template: '<div class="stub-filter-popover"><ng-content></ng-content></div>',
})
class StubFilterPopoverComponent {
  @Input() public Label = '';
  @Input() public ActiveCount = 0;
  @Output() public Cleared = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-filter-panel',
  template: '<div class="stub-filter-panel"></div>',
})
class StubFilterPanelComponent {
  @Input() public Fields: object[] = [];
  @Input() public Values: Record<string, string | number | boolean | null> = {};
  @Output() public ValuesChange = new EventEmitter<Record<string, string | number | boolean | null>>();
  @Output() public Reset = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-refresh-button',
  template: '<button type="button" class="stub-refresh-btn"></button>',
})
class StubRefreshButtonComponent {
  @Input() public Loading = false;
  @Output() public Clicked = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-artifact-type-plugin-viewer',
  template: '<div class="stub-plugin-viewer"></div>',
})
class StubArtifactTypePluginViewerComponent {
  @Input() public artifactVersion: object | null = null;
  @Input() public ArtifactTypeName = '';
  @Input() public DriverClass?: string;
  @Input() public PreVerifiedFrozenSnapshots: object | null = null;
  @Input() public GuestSnapshotMode = false;
  @Input() public readonly = true;
  @Input() public height = '100%';
}

@Component({
  standalone: false,
  selector: 'mj-artifact-viewer-panel',
  template: '<div class="stub-viewer-panel"></div>',
})
class StubArtifactViewerPanelComponent {
  @Input() public artifactId: string | null = null;
  @Input() public VersionNumber: number | null | undefined;
  @Input() public CurrentUser: object | null = null;
  @Input() public EnvironmentId = '';
  @Input() public ViewContext: string | null = null;
  @Input() public ContextCollectionId?: string;
  @Input() public canEdit = false;
  @Input() public canShare = false;
  @Input() public HasConnectedDriveLink = false;
  @Input() public IsMaximized = false;
  @Input() public ShowMaximizeButton = false;
  @Input() public ShowCloseButton = false;
  @Input() public RefreshTrigger: object | null = null;
  @Output() public Closed = new EventEmitter<void>();
  @Output() public MaximizeToggled = new EventEmitter<void>();
  @Output() public ShareRequested = new EventEmitter<object>();
  @Output() public SaveToCollectionRequested = new EventEmitter<object>();
  @Output() public OpenEntityRecord = new EventEmitter<object>();
  @Output() public NavigateToLink = new EventEmitter<object>();
  @Output() public VersionSaved = new EventEmitter<object>();
  @Output() public ConnectedDriveSyncRequested = new EventEmitter<object>();
}

@Component({
  standalone: false,
  selector: 'mj-library-remote-drive-pane',
  template: '<div class="stub-remote-drive-pane"></div>',
})
class StubRemoteDrivePaneComponent {
  @Input() public Account: object | null = null;
  @Input() public CurrentPrefix = '';
  @Input() public CurrentUser: object | null = null;
  @Input() public EnvironmentId = '';
  @Input() public Collections: object[] = [];
  @Input() public ShowBackButton = false;
  @Input() public StorageClientOverride: object | null = null;
  @Output() public PrefixChange = new EventEmitter<string>();
  @Output() public ArtifactConverted = new EventEmitter<object>();
}

@Component({
  standalone: false,
  selector: 'mj-library-create-dialog',
  template: '',
})
class StubLibraryCreateDialogComponent {
  @Input() public IsOpen = false;
  @Input() public InitialTab: string | null = null;
  @Input() public InitialStarterKind: string | null = null;
  @Input() public DefaultCollectionId: string | null = null;
  @Input() public Collections: object[] = [];
  @Input() public AvailableItems: object[] = [];
  @Input() public DefaultSelectedArtifactIds: string[] = [];
  @Input() public EnvironmentId = '';
  @Input() public CurrentUser: object | null = null;
  @Output() public Created = new EventEmitter<object>();
  @Output() public Synthesized = new EventEmitter<object>();
  @Output() public Cancelled = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-library-export-drive-dialog',
  template: '',
})
class StubLibraryExportDriveDialogComponent {
  @Input() public IsOpen = false;
  @Input() public Item: object | null = null;
  @Input() public VersionNumber: number | null | undefined;
  @Input() public Drives: object[] = [];
  @Input() public CurrentUser: object | null = null;
  @Input() public StorageClientOverride: object | null = null;
  @Output() public Published = new EventEmitter<void>();
  @Output() public Cancelled = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-collection-form-modal',
  template: '',
})
class StubCollectionFormModalComponent {
  @Input() public isOpen = false;
  @Input() public collection: object | null = null;
  @Input() public parentCollection: object | null = null;
  @Input() public environmentId = '';
  @Input() public currentUser: object | null = null;
  @Output() public saved = new EventEmitter<object>();
  @Output() public cancelled = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-collection-share-modal',
  template: '',
})
class StubCollectionShareModalComponent {
  @Input() public isOpen = false;
  @Input() public collection: object | null = null;
  @Input() public currentUser: object | null = null;
  @Input() public currentUserPermissions: object | null = null;
  @Output() public saved = new EventEmitter<void>();
  @Output() public cancelled = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-artifact-share-modal',
  template: '',
})
class StubArtifactShareModalComponent {
  @Input() public isOpen = false;
  @Input() public artifact: object | null = null;
  @Input() public currentUser: object | null = null;
  @Output() public saved = new EventEmitter<void>();
  @Output() public cancelled = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'mj-artifact-collection-picker-modal',
  template: '',
})
class StubArtifactCollectionPickerModalComponent {
  @Input() public isOpen = false;
  @Input() public artifactVersionId: string | null = null;
  @Input() public artifactName = '';
  @Input() public artifactVersionNumber: number | null = null;
  @Input() public excludeCollectionIds: string[] = [];
  @Input() public environmentId = '';
  @Input() public currentUser: object | null = null;
  @Output() public completed = new EventEmitter<void>();
  @Output() public cancelled = new EventEmitter<void>();
}

@Component({
  standalone: false,
  selector: 'as-split',
  template: '<div class="stub-split"><ng-content></ng-content></div>',
})
class StubSplitComponent {
  @Input() public direction = 'horizontal';
  @Input() public unit = 'percent';
}

@Component({
  standalone: false,
  selector: 'as-split-area',
  template: '<div class="stub-split-area"><ng-content></ng-content></div>',
})
class StubSplitAreaComponent {
  @Input() public size = 50;
  @Input() public minSize = 10;
}

const LIBRARY_WORKSPACE_STUB_DECLARATIONS = [
  StubEmptyStateComponent,
  StubLoadingComponent,
  StubPageLayoutComponent,
  StubPageHeaderComponent,
  StubPageBodyComponent,
  StubStatBadgeComponent,
  StubPageSearchComponent,
  StubFilterPopoverComponent,
  StubFilterPanelComponent,
  StubRefreshButtonComponent,
  StubArtifactTypePluginViewerComponent,
  StubArtifactViewerPanelComponent,
  StubRemoteDrivePaneComponent,
  StubLibraryCreateDialogComponent,
  StubLibraryExportDriveDialogComponent,
  StubCollectionFormModalComponent,
  StubCollectionShareModalComponent,
  StubArtifactShareModalComponent,
  StubArtifactCollectionPickerModalComponent,
  StubSplitComponent,
  StubSplitAreaComponent,
];

const TEST_USER = {
  ID: '11111111-1111-4111-8111-111111111111',
  Name: 'Amith',
  Email: 'amith@example.com',
} as UserInfo;

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 15));
}

function createWorkspaceProvider(overrides?: {
  artifacts?: Array<Partial<MJArtifactEntity>>;
  versions?: Array<Record<string, string | number | boolean | Date | null>>;
  collections?: Array<Partial<MJCollectionEntity>>;
  links?: Array<Record<string, string | number | boolean | Date | null>>;
  deletedIds?: string[];
  loadedArtifact?: Partial<MJArtifactEntity> | null;
}): Partial<IMetadataProvider> & Pick<IMetadataProvider, 'Entities' | 'EntityByName' | 'EntityByID'> & Pick<IRunViewProvider, 'RunView' | 'RunViews'> {
  return {
    CurrentUser: TEST_USER,
    Entities: [],
    EntityByName: vi.fn(() => undefined),
    EntityByID: vi.fn(() => undefined),
    RunView: <T>(params: RunViewParams, user?: UserInfo): Promise<RunViewResult<T>> =>
      RunView.FromMetadataProvider(Metadata.Provider).RunView<T>(params, user),
    RunViews: <T>(paramsList: RunViewParams[], user?: UserInfo): Promise<RunViewResult<T>[]> =>
      Promise.all(paramsList.map((p) => RunView.FromMetadataProvider(Metadata.Provider).RunView<T>(p, user))),
    GetEntityObject: vi.fn(async <T>(entityName: string) => {
      if (entityName === 'MJ: Artifacts') {
        const rec = {
          ID: overrides?.loadedArtifact?.ID ?? '',
          Name: overrides?.loadedArtifact?.Name ?? 'Hydrated Off-Page Doc',
          Description: overrides?.loadedArtifact?.Description ?? '',
          TypeID: overrides?.loadedArtifact?.TypeID ?? '',
          Type: overrides?.loadedArtifact?.Type ?? 'Markdown Document',
          UserID: overrides?.loadedArtifact?.UserID ?? TEST_USER.ID,
          EnvironmentID: 'env-1',
          __mj_UpdatedAt: new Date('2026-11-15T12:00:00Z'),
          Load: vi.fn(async (id: string) => Boolean(overrides?.loadedArtifact && overrides.loadedArtifact.ID === id)),
        } as Partial<MJArtifactEntity> as MJArtifactEntity;
        return rec as BaseEntity as T;
      }
      if (entityName === 'MJ: Collection Artifacts') {
        const link = {
          ID: '',
          Load: vi.fn(async (id: string) => {
            link.ID = id;
            return true;
          }),
          Delete: vi.fn(async () => {
            if (link.ID) {
              overrides?.deletedIds?.push(link.ID);
            }
            return true;
          }),
        } as Partial<MJCollectionArtifactEntity> as MJCollectionArtifactEntity;
        return link as BaseEntity as T;
      }
      return {
        Load: vi.fn(async () => false),
        Save: vi.fn(async () => true),
        Delete: vi.fn(async () => true),
      } as Partial<BaseEntity> as BaseEntity as T;
    }),
  };
}

describe('LibraryWorkspaceComponent & LibraryFullViewComponent (DOM)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setupTestBed(confirmMock = vi.fn().mockResolvedValue(true)) {
    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, MJButtonDirective],
      declarations: [LibraryWorkspaceComponent, ...LIBRARY_WORKSPACE_STUB_DECLARATIONS],
      providers: [
        {
          provide: ArtifactIconService,
          useValue: {
            GetIcon: () => 'fa-solid fa-file-lines',
            GetArtifactIcon: () => 'fa-solid fa-file-lines',
          },
        },
        {
          provide: MJNotificationService,
          useValue: { CreateSimpleNotification: vi.fn() },
        },
        {
          provide: MJConfirmService,
          useValue: { ConfirmDelete: confirmMock },
        },
        {
          provide: LibraryCreationService,
          useValue: {},
        },
      ],
    });
  }

  it('syncs collectionId in Hub mode, treats version=latest as undefined, and renders expired/revoked guest error banner', async () => {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([]);

    const colId = 'col-hub-42';
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
      async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Collections') {
          return {
            Success: true,
            Results: [{ ID: colId, Name: 'Product Specs', OwnerID: TEST_USER.ID, ParentID: null }] as T[],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
    );
    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(
      async function <T>(this: RunView, paramsList: RunViewParams[], user?: UserInfo): Promise<RunViewResult<T>[]> {
        return Promise.all(paramsList.map((p) => this.RunView<T>(p, user)));
      },
    );

    setupTestBed();
    const fixture = TestBed.createComponent(LibraryWorkspaceComponent);
    const comp = fixture.componentInstance;
    const emittedStates: Array<{ Mode: string; CollectionId: string | null; ActiveVersionNumber: number | null }> = [];
    comp.StateChange.subscribe((s) => emittedStates.push(s));
    comp.Provider = createWorkspaceProvider() as IMetadataProvider;
    comp.CurrentUser = TEST_USER;
    comp.EnvironmentId = 'env-1';
    comp.InitialMode = 'hub';

    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    // 1. Hub mode preserves collectionId and treats version='latest' as undefined
    comp.ApplyExternalRouteState({ mode: 'hub', collectionId: colId, version: 'latest' });
    expect(comp.SurfaceMode).toBe('hub');
    expect(comp.SelectedCollectionId).toBe(colId);
    expect(comp.ActiveVersionNumber).toBeUndefined();
    expect(emittedStates.at(-1)?.CollectionId).toBe(colId);
  });

  it('hydrates off-page ?artifactId= permissions cleanly so owners keep CanEdit/CanShare and resolves v1 collection link on v2+ removal', async () => {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([]);

    const offPageArtId = 'art-offpage-99';
    const v1Id = 'ver-old-1';
    const v2Id = 'ver-new-2';
    const linkRowId = 'col-art-link-1';
    const colId = 'col-target-1';
    const deletedIds: string[] = [];

    vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
      ArtifactID: offPageArtId,
      CanRead: true,
      CanEdit: true,
      CanDelete: true,
      CanShare: true,
      Source: 'Owner',
      Reason: 'Artifact owner',
    });

    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
      async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Artifact Versions') {
          return {
            Success: true,
            Results: [
              {
                ID: v2Id,
                ArtifactID: offPageArtId,
                VersionNumber: 2,
                Name: 'Off-page Doc v2',
                ContentMode: 'Text',
              },
              {
                ID: v1Id,
                ArtifactID: offPageArtId,
                VersionNumber: 1,
                Name: 'Off-page Doc v1',
                ContentMode: 'Text',
              },
            ] as T[],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        if (params.EntityName === 'MJ: Collection Artifacts') {
          return {
            Success: true,
            Results: [{ ID: linkRowId, CollectionID: colId, ArtifactVersionID: v1Id }] as T[],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
    );
    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(
      async function <T>(this: RunView, paramsList: RunViewParams[], user?: UserInfo): Promise<RunViewResult<T>[]> {
        return Promise.all(paramsList.map((p) => this.RunView<T>(p, user)));
      },
    );

    setupTestBed();
    const fixture = TestBed.createComponent(LibraryWorkspaceComponent);
    const comp = fixture.componentInstance;
    comp.Provider = createWorkspaceProvider({
      deletedIds,
      loadedArtifact: {
        ID: offPageArtId,
        Name: 'Off-page Doc',
        UserID: TEST_USER.ID,
        Type: 'Markdown Document',
      },
    }) as IMetadataProvider;
    comp.CurrentUser = TEST_USER;
    comp.EnvironmentId = 'env-1';

    fixture.detectChanges();
    await flushAsync();

    // Hydrate off-page artifact via deep-link
    comp.ApplyExternalRouteState({ artifactId: offPageArtId });
    await flushAsync();

    expect(comp.ActiveItem?.Id).toBe(offPageArtId);
    expect(comp.ActiveItem?.CanEdit).toBe(true);
    expect(comp.ActiveItem?.CanShare).toBe(true);

    // v2+ removal falls back to finding the v1 link in MJ: Collection Artifacts and deletes it
    comp.SelectedCollectionId = colId;
    const v2Item: LibraryItemSummary = {
      Id: offPageArtId,
      Name: 'Off-page Doc',
      Description: '',
      TypeId: 'type-doc-1',
      TypeName: 'Markdown Document',
      DriverClass: '',
      Icon: 'fa-solid fa-file-lines',
      Category: 'documents',
      CategoryBadge: 'Document',
      LatestVersionId: v2Id,
      LatestVersionNumber: 2,
      VersionCount: 2,
      ContentMode: 'Text',
      MimeType: null,
      FileName: null,
      ContentSnippet: '',
      UpdatedAt: new Date(),
      OwnerUserId: TEST_USER.ID,
      OwnerName: TEST_USER.Name,
      IsOwnedByCurrentUser: true,
      IsSharedWithMe: false,
      IsStarred: false,
      CanEdit: true,
      CanShare: true,
      CanDelete: true,
      CollectionIds: [colId],
      CollectionNames: [],
      ArtifactEntity: { ID: offPageArtId, Name: 'Off-page Doc' } as Partial<MJArtifactEntity> as MJArtifactEntity,
    };
    await comp.RemoveItemFromCurrentCollection(v2Item);
    expect(deletedIds).toEqual([linkRowId]);
  });

  it('LibraryFullViewComponent escapes SQL collection IDs, filters via BuildReadableArtifactIdSet, and loads leaf collection artifacts', async () => {
    const leafColId = "col-leaf-'quoted'";
    const readableArtId = 'art-leaf-readable';
    const deniedArtId = 'art-leaf-denied';
    const capturedFilters: string[] = [];

    vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions').mockResolvedValue({
      CollectionID: leafColId,
      CanRead: true,
      CanEdit: false,
      CanDelete: false,
      CanShare: false,
      Source: 'CollectionPermission',
      Reason: 'Test read-only collection',
    });
    vi.spyOn(ArtifactPermissionEngine.Instance, 'BuildReadableArtifactIdSet').mockResolvedValue(
      new Set([readableArtId]),
    );

    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
      async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        capturedFilters.push(String(params.ExtraFilter ?? ''));
        if (params.EntityName === 'MJ: Collections') {
          return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
        }
        if (params.EntityName === 'MJ: Collection Artifacts') {
          return {
            Success: true,
            Results: [
              { ID: 'ca-1', CollectionID: leafColId, ArtifactVersionID: 'ver-leaf-1' },
              { ID: 'ca-2', CollectionID: leafColId, ArtifactVersionID: 'ver-leaf-2' },
            ] as T[],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        if (params.EntityName === 'MJ: Artifact Versions') {
          return {
            Success: true,
            Results: [
              { ID: 'ver-leaf-1', ArtifactID: readableArtId, VersionNumber: 1 },
              { ID: 'ver-leaf-2', ArtifactID: deniedArtId, VersionNumber: 1 },
            ] as T[],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [
              { ID: readableArtId, Name: 'Readable Leaf Note', Type: 'Markdown Document' },
              { ID: deniedArtId, Name: 'Secret Leaf Note', Type: 'Markdown Document' },
            ] as T[],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
      },
    );

    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule],
      declarations: [LibraryFullViewComponent, StubEmptyStateComponent, StubLoadingComponent],
      providers: [
        { provide: ArtifactIconService, useValue: { GetIcon: () => 'fa-solid fa-file' } },
      ],
    });
    const fullViewFixture = TestBed.createComponent(LibraryFullViewComponent);
    const fullView = fullViewFixture.componentInstance;
    fullView.Provider = createWorkspaceProvider() as IMetadataProvider;
    fullView.CurrentUser = TEST_USER;
    fullView.EnvironmentId = 'env-1';
    fullView.CurrentCollectionId = leafColId;
    fullViewFixture.detectChanges();
    await flushAsync();

    // SQL single quote in collection ID was escaped cleanly
    expect(capturedFilters.some((f) => f.includes("col-leaf-''quoted''"))).toBe(true);
    // Leaf collection displays the readable artifact and excludes the unreadable one
    expect(fullView.Artifacts.map((a) => a.ID)).toEqual([readableArtId]);
  });
});
