import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { ListEntity, UserEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { TabService } from '@memberjunction/ng-base-application';

export function LoadListsBrowseResource() {
  const test = new ListsBrowseResource(null!, null!);
}

interface BrowseListItem {
  list: ListEntity;
  itemCount: number;
  entityName: string;
  ownerName: string;
  isOwner: boolean;
}

@RegisterClass(BaseResourceComponent, 'ListsBrowseResource')
@Component({
  selector: 'mj-lists-browse-resource',
  template: `
    <div class="lists-browse-container">
      <!-- Header -->
      <div class="browse-header">
        <div class="header-title">
          <i class="fa-solid fa-folder-open"></i>
          <h2>Browse Lists</h2>
        </div>
        <div class="header-subtitle">
          <p>Discover and explore lists across the organization. <em>Sharing features coming soon!</em></p>
        </div>
        <div class="header-actions">
          <div class="search-box">
            <i class="fa-solid fa-search"></i>
            <input
              type="text"
              placeholder="Search all lists..."
              [(ngModel)]="searchTerm"
              (ngModelChange)="onSearchChange($event)" />
            <button *ngIf="searchTerm" class="clear-search" (click)="clearSearch()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="filter-group">
            <label>Entity:</label>
            <kendo-dropdownlist
              [data]="entityOptions"
              [textField]="'name'"
              [valueField]="'value'"
              [(ngModel)]="selectedEntity"
              (valueChange)="onEntityFilterChange($event)"
              [valuePrimitive]="true">
            </kendo-dropdownlist>
          </div>
          <div class="filter-group">
            <label>Owner:</label>
            <kendo-dropdownlist
              [data]="ownerOptions"
              [textField]="'name'"
              [valueField]="'value'"
              [(ngModel)]="selectedOwner"
              (valueChange)="onOwnerFilterChange($event)"
              [valuePrimitive]="true">
            </kendo-dropdownlist>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-container" *ngIf="isLoading">
        <mj-loading text="Loading lists..." size="medium"></mj-loading>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!isLoading && filteredLists.length === 0 && !searchTerm">
        <div class="empty-state-icon-wrapper">
          <div class="icon-bg"></div>
          <i class="fa-solid fa-folder-open"></i>
        </div>
        <h3>No Lists Found</h3>
        <p>There are no lists in the organization yet.</p>
        <p class="empty-hint">Lists created by you or shared with you will appear here.</p>
      </div>

      <!-- No Results State -->
      <div class="empty-state search-empty" *ngIf="!isLoading && filteredLists.length === 0 && searchTerm">
        <div class="empty-state-icon-wrapper search">
          <i class="fa-solid fa-filter-circle-xmark"></i>
        </div>
        <h3>No Results Found</h3>
        <p>No lists match your current filters.</p>
        <p class="empty-hint">Try adjusting your search or filters.</p>
        <button class="btn-clear" (click)="clearFilters()">Clear All Filters</button>
      </div>

      <!-- Results -->
      <div class="browse-content" *ngIf="!isLoading && filteredLists.length > 0">
        <div class="results-header">
          <span class="result-count">{{filteredLists.length}} list{{filteredLists.length !== 1 ? 's' : ''}}</span>
          <div class="sort-options">
            <label>Sort by:</label>
            <kendo-dropdownlist
              [data]="sortOptions"
              [textField]="'name'"
              [valueField]="'value'"
              [(ngModel)]="selectedSort"
              (valueChange)="onSortChange($event)"
              [valuePrimitive]="true">
            </kendo-dropdownlist>
          </div>
        </div>

        <div class="lists-table">
          <table>
            <thead>
              <tr>
                <th class="col-name">Name</th>
                <th class="col-entity">Entity</th>
                <th class="col-items">Items</th>
                <th class="col-owner">Owner</th>
                <th class="col-updated">Updated</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredLists" (click)="openList(item)" class="list-row">
                <td class="col-name">
                  <div class="name-cell">
                    <div class="list-icon" [style.background-color]="getEntityColor(item.entityName)">
                      <i [class]="getEntityIcon(item.entityName)"></i>
                    </div>
                    <div class="name-content">
                      <span class="list-name">{{item.list.Name}}</span>
                      <span class="list-desc" *ngIf="item.list.Description">{{item.list.Description}}</span>
                    </div>
                  </div>
                </td>
                <td class="col-entity">
                  <span class="entity-badge">{{item.entityName}}</span>
                </td>
                <td class="col-items">{{item.itemCount}}</td>
                <td class="col-owner">
                  <span class="owner-name" [class.is-me]="item.isOwner">
                    {{item.isOwner ? 'You' : item.ownerName}}
                  </span>
                </td>
                <td class="col-updated">{{formatDate(item.list.__mj_UpdatedAt)}}</td>
                <td class="col-actions">
                  <button
                    class="action-btn"
                    *ngIf="!item.isOwner"
                    (click)="requestAccess($event, item)"
                    title="Request access (coming soon)"
                    disabled>
                    <i class="fa-solid fa-lock"></i>
                  </button>
                  <button
                    class="action-btn"
                    *ngIf="item.isOwner"
                    (click)="openList(item)"
                    title="Open list">
                    <i class="fa-solid fa-arrow-right"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Future Sharing Banner -->
      <div class="sharing-banner" *ngIf="!isLoading && filteredLists.length > 0">
        <i class="fa-solid fa-share-nodes"></i>
        <div class="banner-content">
          <strong>Sharing Coming Soon</strong>
          <p>Soon you'll be able to share lists with other users and discover lists shared with you.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .lists-browse-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f5f7fa;
      overflow: hidden;
    }

    /* Header */
    .browse-header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
      flex-shrink: 0;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-title i {
      font-size: 24px;
      color: #2196F3;
    }

    .header-title h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    .header-subtitle p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 200px;
      max-width: 300px;
    }

    .search-box i.fa-search {
      position: absolute;
      left: 12px;
      color: #999;
    }

    .search-box input {
      padding: 8px 36px;
      border: 1px solid #ddd;
      border-radius: 20px;
      font-size: 14px;
      width: 100%;
    }

    .search-box input:focus {
      outline: none;
      border-color: #2196F3;
      box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
    }

    .clear-search {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-group label {
      font-size: 13px;
      color: #666;
    }

    /* Loading */
    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 48px 40px;
      text-align: center;
      max-width: 420px;
      margin: 0 auto;
    }

    .empty-state-icon-wrapper {
      position: relative;
      margin-bottom: 24px;
    }

    .empty-state-icon-wrapper .icon-bg {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(33, 150, 243, 0.05) 100%);
    }

    .empty-state-icon-wrapper > i {
      position: relative;
      font-size: 48px;
      color: #2196F3;
      z-index: 1;
    }

    .empty-state-icon-wrapper.search > i {
      font-size: 42px;
      color: #9e9e9e;
    }

    .empty-state h3 {
      margin: 0 0 12px;
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    .empty-state p {
      margin: 0 0 8px;
      color: #666;
      font-size: 14px;
      line-height: 1.5;
    }

    .empty-state p:last-of-type {
      margin-bottom: 20px;
    }

    .empty-hint {
      color: #999 !important;
      font-size: 13px !important;
    }

    .search-empty .empty-state-icon-wrapper {
      margin-bottom: 20px;
    }

    .btn-clear {
      padding: 10px 20px;
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      color: #555;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .btn-clear:hover {
      background: #eeeeee;
      border-color: #d0d0d0;
    }

    /* Content */
    .browse-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .result-count {
      font-size: 14px;
      color: #666;
    }

    .sort-options {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sort-options label {
      font-size: 13px;
      color: #666;
    }

    /* Table */
    .lists-table {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    .lists-table table {
      width: 100%;
      border-collapse: collapse;
    }

    .lists-table th {
      text-align: left;
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .lists-table td {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
      color: #333;
    }

    .list-row {
      cursor: pointer;
      transition: background 0.15s;
    }

    .list-row:hover {
      background: #f5f5f5;
    }

    .list-row:last-child td {
      border-bottom: none;
    }

    .col-name { width: 35%; }
    .col-entity { width: 15%; }
    .col-items { width: 10%; text-align: center; }
    .col-owner { width: 15%; }
    .col-updated { width: 15%; }
    .col-actions { width: 10%; text-align: right; }

    .name-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .list-icon {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
      flex-shrink: 0;
    }

    .name-content {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .list-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .list-desc {
      font-size: 12px;
      color: #999;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .entity-badge {
      display: inline-block;
      padding: 2px 8px;
      background: #e8f4fd;
      border-radius: 4px;
      font-size: 12px;
      color: #1976D2;
    }

    .owner-name {
      color: #666;
    }

    .owner-name.is-me {
      color: #2196F3;
      font-weight: 500;
    }

    .action-btn {
      background: none;
      border: none;
      padding: 6px 10px;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .action-btn:hover:not(:disabled) {
      background: #e0e0e0;
      color: #666;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Sharing Banner */
    .sharing-banner {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 0 24px 16px;
      padding: 16px 20px;
      background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
      border-radius: 8px;
      border: 1px solid #bbdefb;
    }

    .sharing-banner i {
      font-size: 24px;
      color: #7c4dff;
    }

    .banner-content {
      flex: 1;
    }

    .banner-content strong {
      display: block;
      color: #333;
      margin-bottom: 4px;
    }

    .banner-content p {
      margin: 0;
      font-size: 13px;
      color: #666;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .header-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .search-box {
        max-width: none;
      }

      .filter-group {
        width: 100%;
      }

      .filter-group kendo-dropdownlist {
        flex: 1;
      }

      .lists-table {
        overflow-x: auto;
      }

      .col-entity, .col-items, .col-updated {
        display: none;
      }
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ListsBrowseResource extends BaseResourceComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  isLoading = true;
  searchTerm = '';
  selectedEntity = 'all';
  selectedOwner = 'all';
  selectedSort = 'name';

  allLists: BrowseListItem[] = [];
  filteredLists: BrowseListItem[] = [];

  entityOptions: Array<{ name: string; value: string }> = [{ name: 'All Entities', value: 'all' }];
  ownerOptions: Array<{ name: string; value: string }> = [
    { name: 'All Owners', value: 'all' },
    { name: 'My Lists', value: 'mine' },
    { name: 'Others', value: 'others' }
  ];
  sortOptions: Array<{ name: string; value: string }> = [
    { name: 'Name', value: 'name' },
    { name: 'Recently Updated', value: 'updated' },
    { name: 'Most Items', value: 'items' },
    { name: 'Entity', value: 'entity' }
  ];

  private entityColorMap: Map<string, string> = new Map();
  private entityIconMap: Map<string, string> = new Map();
  private currentUserId: string = '';

  constructor(
    private cdr: ChangeDetectorRef,
    private tabService: TabService
  ) {
    super();
  }

  async ngOnInit() {
    await this.loadData();
    this.NotifyLoadComplete();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadData() {
    this.isLoading = true;

    try {
      const md = new Metadata();
      const rv = new RunView();
      this.currentUserId = md.CurrentUser?.ID || '';

      // Load all lists (later this will be filtered by permissions)
      const [listsResult, detailsResult, usersResult] = await rv.RunViews([
        {
          EntityName: 'Lists',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'List Details',
          ResultType: 'simple'
        },
        {
          EntityName: 'Users',
          Fields: ['ID', 'Name'],
          ResultType: 'simple'
        }
      ]);

      if (!listsResult.Success) {
        console.error('Failed to load lists');
        return;
      }

      const lists = listsResult.Results as ListEntity[];
      const details = detailsResult.Results as Array<{ ListID: string }>;
      const users = usersResult.Results as Array<{ ID: string; Name: string }>;

      // Build user map
      const userMap = new Map<string, string>();
      for (const user of users) {
        userMap.set(user.ID, user.Name);
      }

      // Count items per list
      const itemCounts = new Map<string, number>();
      for (const detail of details) {
        const count = itemCounts.get(detail.ListID) || 0;
        itemCounts.set(detail.ListID, count + 1);
      }

      // Build entity info
      const entities = md.Entities;
      const entitySet = new Set<string>();

      for (const entity of entities) {
        this.entityColorMap.set(entity.Name, this.generateEntityColor(entity.Name));
        this.entityIconMap.set(entity.Name, entity.Icon || 'fa-solid fa-table');
      }

      // Build list items
      this.allLists = lists.map(list => {
        const entityName = list.Entity || 'Unknown';
        entitySet.add(entityName);
        return {
          list,
          itemCount: itemCounts.get(list.ID) || 0,
          entityName,
          ownerName: userMap.get(list.UserID) || 'Unknown',
          isOwner: list.UserID === this.currentUserId
        };
      });

      // Build entity filter options
      this.entityOptions = [
        { name: 'All Entities', value: 'all' },
        ...Array.from(entitySet).sort().map(e => ({ name: e, value: e }))
      ];

      this.applyFilters();
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  onSearchChange(term: string) {
    this.applyFilters();
  }

  onEntityFilterChange(value: string) {
    this.applyFilters();
  }

  onOwnerFilterChange(value: string) {
    this.applyFilters();
  }

  onSortChange(value: string) {
    this.applyFilters();
  }

  clearSearch() {
    this.searchTerm = '';
    this.applyFilters();
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedEntity = 'all';
    this.selectedOwner = 'all';
    this.applyFilters();
  }

  private applyFilters() {
    let result = [...this.allLists];

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(item =>
        item.list.Name.toLowerCase().includes(term) ||
        (item.list.Description && item.list.Description.toLowerCase().includes(term)) ||
        item.entityName.toLowerCase().includes(term) ||
        item.ownerName.toLowerCase().includes(term)
      );
    }

    // Entity filter
    if (this.selectedEntity !== 'all') {
      result = result.filter(item => item.entityName === this.selectedEntity);
    }

    // Owner filter
    if (this.selectedOwner === 'mine') {
      result = result.filter(item => item.isOwner);
    } else if (this.selectedOwner === 'others') {
      result = result.filter(item => !item.isOwner);
    }

    // Sort
    switch (this.selectedSort) {
      case 'name':
        result.sort((a, b) => a.list.Name.localeCompare(b.list.Name));
        break;
      case 'updated':
        result.sort((a, b) => {
          const dateA = new Date(a.list.__mj_UpdatedAt).getTime();
          const dateB = new Date(b.list.__mj_UpdatedAt).getTime();
          return dateB - dateA;
        });
        break;
      case 'items':
        result.sort((a, b) => b.itemCount - a.itemCount);
        break;
      case 'entity':
        result.sort((a, b) => a.entityName.localeCompare(b.entityName));
        break;
    }

    this.filteredLists = result;
  }

  getEntityColor(entityName: string): string {
    return this.entityColorMap.get(entityName) || '#607D8B';
  }

  getEntityIcon(entityName: string): string {
    return this.entityIconMap.get(entityName) || 'fa-solid fa-table';
  }

  private generateEntityColor(entityName: string): string {
    let hash = 0;
    for (let i = 0; i < entityName.length; i++) {
      hash = entityName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336',
      '#00BCD4', '#795548', '#607D8B', '#E91E63', '#3F51B5'
    ];
    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(date: Date): string {
    if (!date) return '';
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  }

  openList(item: BrowseListItem) {
    if (item.isOwner) {
      // Get the application ID from the resource data
      const appId = this.Data?.ApplicationId || '';

      // Open the list in a new tab using the ListDetailResource
      this.tabService.OpenList(item.list.ID, item.list.Name, appId);
    }
  }

  requestAccess(event: Event, item: BrowseListItem) {
    event.stopPropagation();
    // This will be implemented with the sharing system
    console.log('Request access to:', item.list.Name);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Browse Lists';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-open';
  }
}
