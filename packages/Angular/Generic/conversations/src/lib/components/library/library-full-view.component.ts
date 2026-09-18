import { Component, Input, OnInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo, RunView } from '@memberjunction/core';
import { MJCollectionEntity } from '@memberjunction/core-entities';

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
            <i class="fas fa-home"></i>
            <a class="breadcrumb-link" (click)="navigateToRoot()">Collections</a>
          </div>
          @if (breadcrumbs.length > 0) {
            <span class="breadcrumb-path">
              @for (crumb of breadcrumbs; track crumb; let last = $last) {
                <i class="fas fa-chevron-right breadcrumb-separator"></i>
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
          <i class="fas fa-search"></i>
          <input type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Search collections and artifacts..."
            class="library-search-input">
        </div>
        <div class="collections-actions">
          <button class="btn-secondary" (click)="refresh()" title="Refresh">
            <i class="fas fa-sync"></i>
          </button>
        </div>
      </div>
      <div class="collections-content">
        @if (isLoading) {
          <div class="loading-state">
            <mj-loading text="Loading collections..." size="large"></mj-loading>
          </div>
        }
        @if (!isLoading && filteredCollections.length === 0) {
          <mj-empty-state
            [Variant]="searchQuery ? 'no-results' : 'empty'"
            Icon="fa-solid fa-folder-open"
            [Title]="searchQuery ? 'No collections found' : 'No collections yet'" />
        }
        @if (!isLoading && filteredCollections.length > 0) {
          <div class="library-folders">
            @for (collection of filteredCollections; track collection) {
              <div
                class="library-folder"
                (click)="openCollection(collection)">
                <div class="folder-icon">
                  <i class="fas fa-folder"></i>
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
      </div>
    </div>
    `,
  styles: [`
    .collections-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
    }

    .collections-header {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #E5E7EB;
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
      color: #6B7280;
      font-size: 14px;
    }

    .breadcrumb-link {
      color: #111827;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      transition: color 150ms ease;
    }

    .breadcrumb-link:hover {
      color: #1e40af;
    }

    .breadcrumb-link.active {
      color: #6B7280;
      cursor: default;
    }

    .breadcrumb-path {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
    }

    .breadcrumb-separator {
      color: #D1D5DB;
      font-size: 10px;
    }

    .collections-search {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 8px 12px;
      min-width: 300px;
    }

    .collections-search i {
      color: #9CA3AF;
      font-size: 14px;
    }

    .library-search-input {
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      flex: 1;
      color: #111827;
    }

    .library-search-input::placeholder {
      color: #9CA3AF;
    }

    .collections-actions {
      display: flex;
      gap: 8px;
    }

    .btn-secondary {
      padding: 8px 12px;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      cursor: pointer;
      color: #6B7280;
      transition: all 150ms ease;
    }

    .btn-secondary:hover {
      background: #F9FAFB;
      color: #111827;
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
      color: #9CA3AF;
    }

    .collections-content mj-empty-state {
      height: 100%;
    }

    .library-folders {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .library-folder {
      display: flex;
      align-items: start;
      gap: 16px;
      padding: 20px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .library-folder:hover {
      border-color: #1e40af;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .folder-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #EFF6FF;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .folder-icon i {
      font-size: 20px;
      color: #1e40af;
    }

    .folder-info {
      flex: 1;
      min-width: 0;
    }

    .folder-name {
      font-size: 15px;
      font-weight: 500;
      color: #111827;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .folder-meta {
      font-size: 13px;
      color: #6B7280;
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
  super();}

  ngOnInit() {
    this.LoadCollections();
  }

  async LoadCollections(): Promise<void> {
    this.isLoading = true;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const filter = `EnvironmentID='${this.EnvironmentId}'` +
                     (this.CurrentCollectionId ? ` AND ParentID='${this.CurrentCollectionId}'` : ' AND ParentID IS NULL');

      const result = await rv.RunView<MJCollectionEntity>(
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: filter,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.CurrentUser
      );

      if (result.Success) {
        this.Collections = result.Results || [];
        this.applySearch();
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /** @deprecated Use {@link LoadCollections}. */
  async loadCollections(): Promise<void> {
    return this.LoadCollections();
  }

  OnSearchChange(query: string): void {
    this.applySearch();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  onSearchChange(query: string): void {
    return this.OnSearchChange(query);
  }

  private applySearch(): void {
    if (!this.SearchQuery.trim()) {
      this.FilteredCollections = [...this.Collections];
    } else {
      const query = this.SearchQuery.toLowerCase();
      this.FilteredCollections = this.Collections.filter(c =>
        c.Name.toLowerCase().includes(query) ||
        (c.Description && c.Description.toLowerCase().includes(query))
      );
    }
  }

  OpenCollection(collection: MJCollectionEntity): void {
    this.Breadcrumbs.push({ id: collection.ID, name: collection.Name });
    this.CurrentCollectionId = collection.ID;
    this.SearchQuery = '';
    this.LoadCollections();
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
      this.LoadCollections();
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
    this.LoadCollections();
  }

  /** @deprecated Use {@link NavigateToRoot}. */
  navigateToRoot(): void {
    return this.NavigateToRoot();
  }

  Refresh(): void {
    this.LoadCollections();
  }

  /** @deprecated Use {@link Refresh}. */
  refresh(): void {
    return this.Refresh();
  }
}
