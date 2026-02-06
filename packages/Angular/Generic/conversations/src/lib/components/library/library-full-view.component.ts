import { Component, Input, OnInit } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { CollectionEntity } from '@memberjunction/core-entities';

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
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <p>{{ searchQuery ? 'No collections found' : 'No collections yet' }}</p>
          </div>
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

    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #9CA3AF;
    }

    .empty-state i {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state p {
      margin: 0;
      font-size: 14px;
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
export class LibraryFullViewComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public collections: CollectionEntity[] = [];
  public filteredCollections: CollectionEntity[] = [];
  public searchQuery: string = '';
  public isLoading: boolean = false;
  public breadcrumbs: Array<{ id: string; name: string }> = [];
  public currentCollectionId: string | null = null;

  constructor() {}

  ngOnInit() {
    this.loadCollections();
  }

  async loadCollections(): Promise<void> {
    this.isLoading = true;
    try {
      const rv = new RunView();
      const filter = `EnvironmentID='${this.environmentId}'` +
                     (this.currentCollectionId ? ` AND ParentID='${this.currentCollectionId}'` : ' AND ParentID IS NULL');

      const result = await rv.RunView<CollectionEntity>(
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: filter,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.collections = result.Results || [];
        this.applySearch();
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    } finally {
      this.isLoading = false;
    }
  }

  onSearchChange(query: string): void {
    this.applySearch();
  }

  private applySearch(): void {
    if (!this.searchQuery.trim()) {
      this.filteredCollections = [...this.collections];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredCollections = this.collections.filter(c =>
        c.Name.toLowerCase().includes(query) ||
        (c.Description && c.Description.toLowerCase().includes(query))
      );
    }
  }

  openCollection(collection: CollectionEntity): void {
    this.breadcrumbs.push({ id: collection.ID, name: collection.Name });
    this.currentCollectionId = collection.ID;
    this.searchQuery = '';
    this.loadCollections();
  }

  navigateTo(crumb: { id: string; name: string }): void {
    const index = this.breadcrumbs.findIndex(b => b.id === crumb.id);
    if (index !== -1) {
      this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
      this.currentCollectionId = crumb.id;
      this.searchQuery = '';
      this.loadCollections();
    }
  }

  navigateToRoot(): void {
    this.breadcrumbs = [];
    this.currentCollectionId = null;
    this.searchQuery = '';
    this.loadCollections();
  }

  refresh(): void {
    this.loadCollections();
  }
}
