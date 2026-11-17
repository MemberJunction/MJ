import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactPermissionEngine,
  MJArtifactEntity,
  MJArtifactVersionEntity,
  MJCollectionArtifactEntity,
  MJCollectionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/**
 * Full-panel Collections view component
 * Replaces the main content area when Collections tab is selected
 */
@Component({
  standalone: false,
  selector: 'mj-library-full-view',
  template: `
    <div class="collections-view">
      <div class="collections-header">
        <div class="collections-breadcrumb">
          <div class="breadcrumb-item">
            <i class="fa-solid fa-house"></i>
            <a class="breadcrumb-link" (click)="navigateToRoot()">Collections</a>
          </div>
          @if (breadcrumbs.length > 0) {
            <span class="breadcrumb-path">
              @for (crumb of breadcrumbs; track crumb.id; let last = $last) {
                <i class="fa-solid fa-chevron-right breadcrumb-separator"></i>
                <a class="breadcrumb-link"
                  [class.active]="last"
                  (click)="navigateTo(crumb)">
                  {{ crumb.name }}
                </a>
              }
            </span>
          }
        </div>
        <div class="collections-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Search collections and artifacts..."
            class="library-search-input">
        </div>
        <div class="collections-actions">
          <button class="btn-secondary" (click)="refresh()" title="Refresh">
            <i class="fa-solid fa-rotate"></i>
          </button>
        </div>
      </div>
      <div class="collections-content">
        @if (isLoading) {
          <div class="loading-state">
            <mj-loading text="Loading collections..." size="large"></mj-loading>
          </div>
        }
        @if (!isLoading && filteredCollections.length === 0 && FilteredArtifacts.length === 0) {
          <mj-empty-state
            [Variant]="searchQuery ? 'no-results' : 'empty'"
            Icon="fa-solid fa-folder-open"
            [Title]="searchQuery ? 'No matching items found' : (CurrentCollectionId ? 'This collection is empty' : 'No collections yet')" />
        }
        @if (!isLoading && filteredCollections.length > 0) {
          <div class="library-folders">
            @for (collection of filteredCollections; track collection.ID) {
              <div
                class="library-folder"
                (click)="openCollection(collection)">
                <div class="folder-icon">
                  <i class="fa-solid fa-folder"></i>
                </div>
                <div class="folder-info">
                  <div class="folder-name">{{ collection.Name }}</div>
                  @if (collection.Description) {
                    <div class="folder-meta">
                      {{ collection.Description }}
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
        @if (!isLoading && CurrentCollectionId && FilteredArtifacts.length > 0) {
          <div class="library-artifacts-section">
            @if (filteredCollections.length > 0) {
              <h4 class="library-section-heading">Artifacts</h4>
            }
            <div class="library-folders">
              @for (artifact of FilteredArtifacts; track artifact.ID) {
                <div
                  class="library-folder library-artifact-card"
                  (click)="OpenArtifact(artifact)">
                  <div class="folder-icon artifact-icon">
                    <i class="fa-solid fa-file-lines"></i>
                  </div>
                  <div class="folder-info">
                    <div class="folder-name">{{ artifact.Name }}</div>
                    @if (artifact.Description) {
                      <div class="folder-meta">
                        {{ artifact.Description }}
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
    `,
  styles: [`
    .collections-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
    }

    .collections-header {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--mj-border-default);
      gap: 16px;
    }

    .collections-breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .breadcrumb-item i {
      color: var(--mj-text-secondary);
      font-size: 14px;
    }

    .breadcrumb-link {
      color: var(--mj-text-primary);
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      transition: color 150ms ease;
    }

    .breadcrumb-link:hover {
      color: var(--mj-brand-primary);
    }

    .breadcrumb-link.active {
      color: var(--mj-text-secondary);
      cursor: default;
    }

    .breadcrumb-path {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
    }

    .breadcrumb-separator {
      color: var(--mj-border-strong);
      font-size: 10px;
    }

    .collections-search {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      padding: 8px 12px;
      min-width: 300px;
    }

    .collections-search i {
      color: var(--mj-text-muted);
      font-size: 14px;
    }

    .library-search-input {
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      flex: 1;
      color: var(--mj-text-primary);
    }

    .library-search-input::placeholder {
      color: var(--mj-text-muted);
    }

    .collections-actions {
      display: flex;
      gap: 8px;
    }

    .btn-secondary {
      padding: 8px 12px;
      background: transparent;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      cursor: pointer;
      color: var(--mj-text-secondary);
      transition: all 150ms ease;
    }

    .btn-secondary:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }

    .collections-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--mj-text-muted);
    }

    .collections-content mj-empty-state {
      height: 100%;
    }

    .library-folders {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .library-artifacts-section {
      margin-top: 20px;
    }

    .library-section-heading {
      margin: 0 0 12px 0;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mj-text-secondary);
    }

    .library-folder {
      display: flex;
      align-items: start;
      gap: 16px;
      padding: 20px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .library-folder:hover {
      border-color: var(--mj-brand-primary);
      box-shadow: var(--mj-shadow-sm);
    }

    .folder-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      border-radius: 8px;
      flex-shrink: 0;
    }

    .folder-icon i {
      font-size: 20px;
      color: var(--mj-brand-primary);
    }

    .folder-info {
      flex: 1;
      min-width: 0;
    }

    .folder-name {
      font-size: 15px;
      font-weight: 500;
      color: var(--mj-text-primary);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .folder-meta {
      font-size: 13px;
      color: var(--mj-text-secondary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  `]
})
export class LibraryFullViewComponent extends BaseAngularComponent implements OnInit  {
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }

  @Output() ArtifactSelected = new EventEmitter<MJArtifactEntity>();

  public Collections: MJCollectionEntity[] = [];

  /** @deprecated Use {@link Collections}. */
  public get collections(): MJCollectionEntity[] {
    return this.Collections;
  }
  /** @deprecated Use {@link Collections}. */
  public set collections(value: MJCollectionEntity[]) {
    this.Collections = value;
  }
  public FilteredCollections: MJCollectionEntity[] = [];

  /** @deprecated Use {@link FilteredCollections}. */
  public get filteredCollections(): MJCollectionEntity[] {
    return this.FilteredCollections;
  }
  /** @deprecated Use {@link FilteredCollections}. */
  public set filteredCollections(value: MJCollectionEntity[]) {
    this.FilteredCollections = value;
  }
  public Artifacts: MJArtifactEntity[] = [];
  public FilteredArtifacts: MJArtifactEntity[] = [];
  public SearchQuery: string = '';

  /** @deprecated Use {@link SearchQuery}. */
  public get searchQuery(): string {
    return this.SearchQuery;
  }
  /** @deprecated Use {@link SearchQuery}. */
  public set searchQuery(value: string) {
    this.SearchQuery = value;
  }
  public isLoading: boolean = false;
  public Breadcrumbs: Array<{ id: string; name: string }> = [];

  /** @deprecated Use {@link Breadcrumbs}. */
  public get breadcrumbs(): Array<{ id: string; name: string }> {
    return this.Breadcrumbs;
  }
  /** @deprecated Use {@link Breadcrumbs}. */
  public set breadcrumbs(value: Array<{ id: string; name: string }>) {
    this.Breadcrumbs = value;
  }
  public CurrentCollectionId: string | null = null;

  /** @deprecated Use {@link CurrentCollectionId}. */
  public get currentCollectionId(): string | null {
    return this.CurrentCollectionId;
  }
  /** @deprecated Use {@link CurrentCollectionId}. */
  public set currentCollectionId(value: string | null) {
    this.CurrentCollectionId = value;
  }

  constructor() {
    super();
  }

  ngOnInit() {
    void this.LoadCollections();
  }

  async LoadCollections(): Promise<void> {
    this.isLoading = true;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const escapedEnv = EscapeSQLString(this.EnvironmentId || '');
      const envFilter = escapedEnv ? `EnvironmentID='${escapedEnv}'` : '1=1';

      const allCollectionsRes = await rv.RunView<MJCollectionEntity>(
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: envFilter,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.CurrentUser
      );

      if (allCollectionsRes.Success) {
        const allCollections = allCollectionsRes.Results || [];
        const parentFiltered = allCollections.filter((col) =>
          this.CurrentCollectionId
            ? UUIDsEqual(col.ParentID, this.CurrentCollectionId)
            : !col.ParentID
        );
        const readableIds = await this.resolveReadableCollectionIds(parentFiltered);
        this.Collections = parentFiltered.filter((col) =>
          readableIds.has(NormalizeUUID(col.ID))
        );
      } else {
        this.Collections = [];
      }

      this.Artifacts = this.CurrentCollectionId
        ? await this.loadCollectionArtifacts(rv, this.CurrentCollectionId)
        : [];

      this.applySearch();
    } catch (error) {
      console.error('Failed to load collections:', error);
      this.Collections = [];
      this.Artifacts = [];
      this.applySearch();
    } finally {
      this.isLoading = false;
    }
  }

  private async resolveReadableCollectionIds(
    collections: MJCollectionEntity[]
  ): Promise<Set<string>> {
    const readable = new Set<string>();
    const currentUserId = this.CurrentUser?.ID ? NormalizeUUID(this.CurrentUser.ID) : '';
    if (!currentUserId) {
      for (const c of collections) {
        readable.add(NormalizeUUID(c.ID));
      }
      return readable;
    }

    const provider = this.ProviderToUse ?? Metadata.Provider;
    const engine = ArtifactPermissionEngine.Instance;

    for (const col of collections) {
      const normId = NormalizeUUID(col.ID);
      if (UUIDsEqual(col.OwnerID, currentUserId)) {
        readable.add(normId);
        continue;
      }
      const effective = await engine.ResolveCollectionAncestryPermissions(
        provider,
        col.ID,
        this.CurrentUser
      );
      if (effective?.CanRead) {
        readable.add(normId);
      }
    }
    return readable;
  }

  private async loadCollectionArtifacts(
    rv: RunView,
    collectionId: string
  ): Promise<MJArtifactEntity[]> {
    const linksRes = await rv.RunView<MJCollectionArtifactEntity>(
      {
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${EscapeSQLString(collectionId)}'`,
        OrderBy: 'Sequence ASC, __mj_CreatedAt DESC',
        ResultType: 'entity_object'
      },
      this.CurrentUser
    );
    if (!linksRes.Success || !linksRes.Results?.length) {
      return [];
    }
    const versionIds = Array.from(
      new Set(linksRes.Results.map((l) => l.ArtifactVersionID).filter((id): id is string => Boolean(id)))
    );
    if (versionIds.length === 0) {
      return [];
    }

    const verInClause = versionIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const versionsRes = await rv.RunView<MJArtifactVersionEntity>(
      {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ID IN (${verInClause})`,
        ResultType: 'entity_object'
      },
      this.CurrentUser
    );
    if (!versionsRes.Success || !versionsRes.Results?.length) {
      return [];
    }

    const artifactIds = Array.from(
      new Set(versionsRes.Results.map((v) => v.ArtifactID).filter((id): id is string => Boolean(id)))
    );
    if (artifactIds.length === 0) {
      return [];
    }

    const inClause = artifactIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const envClause = this.EnvironmentId
      ? ` AND EnvironmentID='${EscapeSQLString(this.EnvironmentId)}'`
      : '';
    const artifactsRes = await rv.RunView<MJArtifactEntity>(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID IN (${inClause})${envClause} AND Visibility <> 'System Only'`,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object'
      },
      this.CurrentUser
    );
    if (!artifactsRes.Success || !artifactsRes.Results?.length) {
      return [];
    }

    const artifacts = artifactsRes.Results;
    if (!this.CurrentUser?.ID) {
      return artifacts;
    }

    const provider = this.ProviderToUse ?? Metadata.Provider;
    const readableArtifactIds = await ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(
      provider,
      this.CurrentUser
    );
    return artifacts.filter((a) => readableArtifactIds.has(NormalizeUUID(a.ID)));
  }

  /** @deprecated Use {@link LoadCollections}. */
  async loadCollections(): Promise<void> {
    return this.LoadCollections();
  }

  OnSearchChange(_query: string): void {
    this.applySearch();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  onSearchChange(query: string): void {
    return this.OnSearchChange(query);
  }

  private applySearch(): void {
    if (!this.SearchQuery.trim()) {
      this.FilteredCollections = [...this.Collections];
      this.FilteredArtifacts = [...this.Artifacts];
    } else {
      const query = this.SearchQuery.toLowerCase();
      this.FilteredCollections = this.Collections.filter(c =>
        c.Name.toLowerCase().includes(query) ||
        (c.Description && c.Description.toLowerCase().includes(query))
      );
      this.FilteredArtifacts = this.Artifacts.filter(a =>
        a.Name.toLowerCase().includes(query) ||
        (a.Description && a.Description.toLowerCase().includes(query))
      );
    }
  }

  OpenArtifact(artifact: MJArtifactEntity): void {
    this.ArtifactSelected.emit(artifact);
  }

  OpenCollection(collection: MJCollectionEntity): void {
    this.Breadcrumbs.push({ id: collection.ID, name: collection.Name });
    this.CurrentCollectionId = collection.ID;
    this.SearchQuery = '';
    void this.LoadCollections();
  }

  /** @deprecated Use {@link OpenCollection}. */
  openCollection(collection: MJCollectionEntity): void {
    return this.OpenCollection(collection);
  }

  NavigateTo(crumb: { id: string; name: string }): void {
    const index = this.Breadcrumbs.findIndex(b => b.id === crumb.id);
    if (index !== -1) {
      this.Breadcrumbs = this.Breadcrumbs.slice(0, index + 1);
      this.CurrentCollectionId = crumb.id;
      this.SearchQuery = '';
      void this.LoadCollections();
    }
  }

  /** @deprecated Use {@link NavigateTo}. */
  navigateTo(crumb: { id: string; name: string }): void {
    return this.NavigateTo(crumb);
  }

  NavigateToRoot(): void {
    this.Breadcrumbs = [];
    this.CurrentCollectionId = null;
    this.SearchQuery = '';
    void this.LoadCollections();
  }

  /** @deprecated Use {@link NavigateToRoot}. */
  navigateToRoot(): void {
    return this.NavigateToRoot();
  }

  Refresh(): void {
    void this.LoadCollections();
  }

  /** @deprecated Use {@link Refresh}. */
  refresh(): void {
    return this.Refresh();
  }
}
