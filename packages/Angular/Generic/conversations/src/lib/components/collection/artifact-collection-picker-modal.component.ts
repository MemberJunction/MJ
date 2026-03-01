import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { MJCollectionEntity } from '@memberjunction/core-entities';
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ToastService } from '../../services/toast.service';
import { CollectionPermissionService, CollectionPermission } from '../../services/collection-permission.service';
import { UUIDsEqual } from '@memberjunction/global';

interface CollectionNode {
  collection: MJCollectionEntity;
  selected: boolean;
  hasChildren: boolean;
  alreadyContainsArtifact: boolean;
}

/**
 * Modal for selecting collections to save artifacts to.
 * Features:
 * - Permission-aware: only shows collections where user has Edit permission
 * - Hierarchical navigation: start with root collections, drill down as needed
 * - Search by name
 * - Multi-selection support
 * - Create new collection with proper permission logic
 */
@Component({
  selector: 'mj-artifact-collection-picker-modal',
  standalone: true,
  imports: [
    FormsModule,
    DialogModule,
    ButtonsModule,
    InputsModule,
    SharedGenericModule
],
  template: `
    @if (isOpen) {
      <kendo-dialog
        title="Save to Collection"
        (close)="onCancel()"
        [width]="700"
        [minWidth]="500">
        <div class="picker-modal">
          <!-- Breadcrumb Navigation -->
          @if (navigationPath.length > 0) {
            <div class="breadcrumb-nav">
              <button class="breadcrumb-btn" (click)="navigateToRoot()">
                <i class="fas fa-home"></i> Root
              </button>
              @for (item of navigationPath; track item.collection.ID) {
                <i class="fas fa-chevron-right breadcrumb-separator"></i>
                <button class="breadcrumb-btn" (click)="navigateToCollection(item.collection)">
                  {{ item.collection.Name }}
                </button>
              }
            </div>
          }
          <!-- Search Bar -->
          <div class="search-bar">
            <i class="fas fa-search search-icon"></i>
            <input
              type="text"
              class="k-textbox search-input"
              [(ngModel)]="searchQuery"
              (input)="onSearchChange()"
              placeholder="Search collections..."
              [disabled]="isLoading">
          </div>
          <!-- Collections List -->
          @if (!isLoading && !errorMessage) {
            <div class="collections-list">
              @if (displayedCollections.length === 0) {
                <div class="empty-state">
                  @if (searchQuery) {
                    <i class="fas fa-search"></i>
                    <p>No collections found matching "{{ searchQuery }}"</p>
                  } @else if (currentParentId) {
                    <i class="fas fa-folder-open"></i>
                    <p>No sub-collections available</p>
                  } @else {
                    <i class="fas fa-folder"></i>
                    <p>No collections available</p>
                    <p class="hint">Create a new collection to get started</p>
                  }
                </div>
              } @else {
                @for (node of displayedCollections; track node.collection.ID) {
                  <div class="collection-item"
                    [class.already-added]="node.alreadyContainsArtifact"
                    (click)="toggleSelection(node)">
                    <div class="collection-checkbox">
                      <input
                        type="checkbox"
                        [checked]="node.selected"
                        [disabled]="node.alreadyContainsArtifact"
                        (click)="$event.stopPropagation(); toggleSelection(node)">
                    </div>
                    <i class="fas fa-folder collection-icon" [style.color]="node.collection.Color || '#0076B6'"></i>
                    <span class="collection-name">{{ node.collection.Name }}</span>
                    @if (node.alreadyContainsArtifact) {
                      <span class="already-added-badge">
                        <i class="fas fa-check-circle"></i> Already added
                      </span>
                    }
                    @if (node.hasChildren) {
                      <button
                        class="drill-down-btn"
                        (click)="$event.stopPropagation(); drillIntoCollection(node.collection)"
                        title="View sub-collections">
                        <i class="fas fa-chevron-right"></i>
                      </button>
                    }
                  </div>
                }
              }
            </div>
          }
          <!-- Loading State -->
          @if (isLoading) {
            <div class="loading-state">
              <mj-loading text="Loading collections..." size="medium"></mj-loading>
            </div>
          }
          <!-- Error State -->
          @if (errorMessage) {
            <div class="error-state">
              <i class="fas fa-exclamation-triangle"></i>
              <span>{{ errorMessage }}</span>
            </div>
          }
          <!-- Selected Collections Summary -->
          @if (selectedCollections.length > 0) {
            <div class="selected-summary">
              <i class="fas fa-check-circle"></i>
              <span>{{ selectedCollections.length }} collection(s) selected</span>
            </div>
          }
          <!-- Create New Collection Section -->
          <div class="create-section">
            <div class="divider">
              <span>OR CREATE NEW</span>
            </div>
            @if (!showCreateForm) {
              <button class="btn-create-collection" (click)="showCreateForm = true">
                <i class="fas fa-plus"></i>
                Create New Collection
              </button>
            } @else {
              <div class="create-form">
                <input
                  type="text"
                  class="k-textbox create-input"
                  [(ngModel)]="newCollectionName"
                  placeholder="Enter collection name"
                  (keydown.enter)="createCollection()"
                  #newCollectionInput>
                <div class="create-actions">
                  <button class="btn-create" kendoButton (click)="createCollection()" [disabled]="isCreatingCollection || !newCollectionName.trim()">
                    @if (isCreatingCollection) {
                      <i class="fas fa-spinner fa-spin"></i>
                    } @else {
                      Create
                    }
                  </button>
                  <button class="btn-cancel" kendoButton (click)="showCreateForm = false; newCollectionName = ''">
                    Cancel
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
        <kendo-dialog-actions>
          <button kendoButton (click)="onCancel()">
            Cancel
          </button>
          <button kendoButton
            [primary]="true"
            (click)="onSave()"
            [disabled]="selectedCollections.length === 0 || isSaving">
            @if (isSaving) {
              <i class="fas fa-spinner fa-spin"></i> Saving...
            } @else {
              <i class="fas fa-save"></i> Save to {{ selectedCollections.length }} Collection(s)
            }
          </button>
        </kendo-dialog-actions>
      </kendo-dialog>
    }
    `,
  styles: [`
    .picker-modal {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px 0;
      min-height: 400px;
      max-height: 600px;
    }

    .breadcrumb-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      overflow-x: auto;
    }

    .breadcrumb-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: #0076B6;
      cursor: pointer;
      white-space: nowrap;
      font-size: 14px;
    }

    .breadcrumb-btn:hover {
      background: #E5E7EB;
    }

    .breadcrumb-separator {
      color: #9CA3AF;
      font-size: 12px;
    }

    .search-bar {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      color: #9CA3AF;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding-left: 36px;
    }

    .collections-list {
      flex: 1;
      overflow-y: auto;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      min-height: 250px;
      max-height: 350px;
    }

    .collection-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #F3F4F6;
      cursor: pointer;
      transition: background 0.2s;
    }

    .collection-item:hover {
      background: #F9FAFB;
    }

    .collection-item:last-child {
      border-bottom: none;
    }

    .collection-item.already-added {
      background: #F9FAFB;
      opacity: 0.7;
      cursor: not-allowed;
    }

    .collection-item.already-added:hover {
      background: #F9FAFB;
    }

    .collection-checkbox {
      display: flex;
      align-items: center;
    }

    .collection-checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .collection-icon {
      font-size: 18px;
      flex-shrink: 0;
    }

    .collection-name {
      flex: 1;
      font-size: 14px;
      color: #1F2937;
    }

    .already-added-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: #DBEAFE;
      border: 1px solid #93C5FD;
      border-radius: 12px;
      color: #1E40AF;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
    }

    .already-added-badge i {
      font-size: 12px;
      color: #2563EB;
    }

    .drill-down-btn {
      padding: 6px 10px;
      background: transparent;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.2s;
    }

    .drill-down-btn:hover {
      background: #F3F4F6;
      border-color: #9CA3AF;
      color: #374151;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: #6B7280;
      text-align: center;
    }

    .empty-state i {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.4;
    }

    .empty-state p {
      margin: 4px 0;
      font-size: 14px;
    }

    .empty-state .hint {
      font-size: 13px;
      color: #9CA3AF;
    }

    .loading-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      gap: 12px;
      color: #6B7280;
    }

    .error-state i {
      font-size: 32px;
    }

    .error-state {
      color: #DC2626;
    }

    .selected-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #DBEAFE;
      border: 1px solid #93C5FD;
      border-radius: 6px;
      color: #1E40AF;
      font-size: 14px;
      font-weight: 500;
    }

    .selected-summary i {
      color: #2563EB;
    }

    .create-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      color: #9CA3AF;
      font-size: 12px;
      font-weight: 500;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #E5E7EB;
    }

    .divider span {
      padding: 0 12px;
    }

    .btn-create-collection {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      background: #F9FAFB;
      border: 2px dashed #D1D5DB;
      border-radius: 6px;
      color: #0076B6;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-create-collection:hover {
      background: #F3F4F6;
      border-color: #0076B6;
    }

    .btn-create-collection i {
      font-size: 16px;
    }

    .create-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
    }

    .create-input {
      width: 100%;
    }

    .create-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn-create, .btn-cancel {
      padding: 8px 16px;
      font-size: 14px;
    }
  `]
})
export class ArtifactCollectionPickerModalComponent implements OnInit, OnChanges {
  @Input() isOpen: boolean = false;
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() excludeCollectionIds: string[] = []; // Collections to exclude (e.g., already contains artifact)

  @Output() saved = new EventEmitter<string[]>(); // Emits selected collection IDs
  @Output() cancelled = new EventEmitter<void>();

  public allCollections: MJCollectionEntity[] = [];
  public displayedCollections: CollectionNode[] = [];
  public selectedCollections: MJCollectionEntity[] = [];
  public userPermissions: Map<string, CollectionPermission> = new Map();

  public navigationPath: CollectionNode[] = []; // Breadcrumb trail
  public currentParentId: string | null = null;
  public currentParentCollection: MJCollectionEntity | undefined = undefined;

  public searchQuery: string = '';
  public isLoading: boolean = false;
  public isSaving: boolean = false;
  public errorMessage: string = '';

  // Create collection form state
  public showCreateForm: boolean = false;
  public newCollectionName: string = '';
  public isCreatingCollection: boolean = false;

  constructor(
    private toastService: ToastService,
    private permissionService: CollectionPermissionService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    if (this.isOpen) {
      await this.loadCollections();
    }
  }

  async ngOnChanges(changes: any) {
    if (changes['isOpen'] && this.isOpen) {
      this.reset();
      await this.loadCollections();
    }
  }

  private reset(): void {
    this.allCollections = [];
    this.displayedCollections = [];
    this.selectedCollections = [];
    this.userPermissions.clear();
    this.navigationPath = [];
    this.currentParentId = null;
    this.currentParentCollection = undefined;
    this.searchQuery = '';
    this.errorMessage = '';
  }

  private async loadCollections(): Promise<void> {
    try {
      this.isLoading = true;
      this.errorMessage = '';

      // Load all collections in environment
      const rv = new RunView();
      const result = await rv.RunView<MJCollectionEntity>({
        EntityName: 'MJ: Collections',
        ExtraFilter: `EnvironmentID='${this.environmentId}'`,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (!result.Success) {
        this.errorMessage = result.ErrorMessage || 'Failed to load collections';
        return;
      }

      this.allCollections = result.Results || [];

      // Load user permissions for all collections
      await this.loadUserPermissions();

      // Filter to collections with Edit permission
      // Include collections that already contain the artifact (will be shown as disabled)
      const editableCollections = this.allCollections.filter(c => {
        return this.canEdit(c);
      });

      // Show root collections initially
      this.displayRootCollections(editableCollections);

    } catch (error) {
      console.error('Error loading collections:', error);
      this.errorMessage = 'An error occurred while loading collections';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadUserPermissions(): Promise<void> {
    // Load permissions for collections not owned by current user
    const nonOwnedCollections = this.allCollections.filter(
      c => c.OwnerID && !UUIDsEqual(c.OwnerID, this.currentUser.ID)
    );

    if (nonOwnedCollections.length === 0) {
      return;
    }

    const collectionIds = nonOwnedCollections.map(c => c.ID);
    const permissions = await this.permissionService.checkBulkPermissions(
      collectionIds,
      this.currentUser.ID,
      this.currentUser
    );

    permissions.forEach((permission, collectionId) => {
      this.userPermissions.set(collectionId, permission);
    });
  }

  private displayRootCollections(editableCollections: MJCollectionEntity[]): void {
    const rootCollections = editableCollections.filter(c => !c.ParentID);
    this.displayedCollections = rootCollections.map(c => this.createNode(c, editableCollections));
  }

  private displayChildCollections(parentId: string, editableCollections: MJCollectionEntity[]): void {
    const childCollections = editableCollections.filter(c => UUIDsEqual(c.ParentID, parentId))
    this.displayedCollections = childCollections.map(c => this.createNode(c, editableCollections));
  }

  private createNode(collection: MJCollectionEntity, allEditableCollections: MJCollectionEntity[]): CollectionNode {
    const hasChildren = allEditableCollections.some(c => UUIDsEqual(c.ParentID, collection.ID))
    const alreadyContainsArtifact = this.excludeCollectionIds.includes(collection.ID);
    return {
      collection,
      selected: this.selectedCollections.some(sc => UUIDsEqual(sc.ID, collection.ID)),
      hasChildren,
      alreadyContainsArtifact
    };
  }

  canEdit(collection: MJCollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || UUIDsEqual(collection.OwnerID, this.currentUser.ID)) {
      return true;
    }

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canEdit || false;
  }

  toggleSelection(node: CollectionNode): void {
    // Don't allow selection of collections that already contain the artifact
    if (node.alreadyContainsArtifact) {
      return;
    }

    const index = this.selectedCollections.findIndex(c => UUIDsEqual(c.ID, node.collection.ID))
    if (index >= 0) {
      this.selectedCollections.splice(index, 1);
      node.selected = false;
    } else {
      this.selectedCollections.push(node.collection);
      node.selected = true;
    }
  }

  drillIntoCollection(collection: MJCollectionEntity): void {
    // Add current location to navigation path
    const editableCollections = this.allCollections.filter(c => {
      return this.canEdit(c);
    });

    const node = this.createNode(collection, editableCollections);
    this.navigationPath.push(node);

    this.currentParentId = collection.ID;
    this.currentParentCollection = collection;

    // Display child collections
    this.displayChildCollections(collection.ID, editableCollections);

    // Clear search when drilling down
    this.searchQuery = '';
  }

  navigateToRoot(): void {
    this.navigationPath = [];
    this.currentParentId = null;
    this.currentParentCollection = undefined;

    const editableCollections = this.allCollections.filter(c => {
      return this.canEdit(c);
    });

    this.displayRootCollections(editableCollections);
    this.searchQuery = '';
  }

  navigateToCollection(collection: MJCollectionEntity): void {
    // Find the index of this collection in the navigation path
    const index = this.navigationPath.findIndex(n => UUIDsEqual(n.collection.ID, collection.ID))

    if (index >= 0) {
      // Trim navigation path to this level
      this.navigationPath = this.navigationPath.slice(0, index + 1);
      this.currentParentId = collection.ID;
      this.currentParentCollection = collection;

      const editableCollections = this.allCollections.filter(c => {
        return this.canEdit(c);
      });

      this.displayChildCollections(collection.ID, editableCollections);
      this.searchQuery = '';
    }
  }

  onSearchChange(): void {
    if (!this.searchQuery.trim()) {
      // Reset to current navigation context
      if (this.currentParentId) {
        const editableCollections = this.allCollections.filter(c => {
          return this.canEdit(c);
        });
        this.displayChildCollections(this.currentParentId, editableCollections);
      } else {
        const editableCollections = this.allCollections.filter(c => {
          return this.canEdit(c);
        });
        this.displayRootCollections(editableCollections);
      }
      return;
    }

    // Search across all editable collections
    const query = this.searchQuery.toLowerCase();
    const editableCollections = this.allCollections.filter(c => {
      return this.canEdit(c) && c.Name.toLowerCase().includes(query);
    });

    this.displayedCollections = editableCollections.map(c => this.createNode(c, editableCollections));
  }

  async createCollection(): Promise<void> {
    if (!this.newCollectionName.trim()) {
      this.toastService.warning('Please enter a collection name');
      return;
    }

    try {
      this.isCreatingCollection = true;
      const md = new Metadata();
      const collection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);

      collection.Name = this.newCollectionName.trim();
      collection.EnvironmentID = this.environmentId;

      // Set parent and owner based on current navigation context
      if (this.currentParentCollection) {
        // Creating sub-collection - inherit parent's owner
        collection.ParentID = this.currentParentCollection.ID;
        collection.OwnerID = this.currentParentCollection.OwnerID || this.currentUser.ID;
      } else {
        // Creating root collection - current user becomes owner
        collection.OwnerID = this.currentUser.ID;
      }

      const saved = await collection.Save();

      if (saved) {
        // Create owner permission or copy parent permissions
        if (this.currentParentCollection) {
          // Copy permissions from parent
          await this.permissionService.copyParentPermissions(
            this.currentParentCollection.ID,
            collection.ID,
            this.currentUser
          );
        } else {
          // Create owner permission
          await this.permissionService.createOwnerPermission(
            collection.ID,
            this.currentUser.ID,
            this.currentUser
          );
        }

        this.toastService.success('Collection created successfully');

        // Reset form
        this.showCreateForm = false;
        this.newCollectionName = '';

        // Reload collections to include the new one
        await this.loadCollections();

        // Auto-select the newly created collection
        this.selectedCollections.push(collection);
      } else {
        this.toastService.error(collection.LatestResult?.Message || 'Failed to create collection');
      }
    } catch (error) {
      console.error('Error creating collection:', error);
      this.toastService.error('An error occurred while creating the collection');
    } finally {
      this.isCreatingCollection = false;
      this.cdr.detectChanges();
    }
  }

  async onSave(): Promise<void> {
    if (this.selectedCollections.length === 0) {
      this.toastService.warning('Please select at least one collection');
      return;
    }

    this.isSaving = true;

    try {
      // Emit the selected collection IDs - parent handles actual saving and modal close
      const collectionIds = this.selectedCollections.map(c => c.ID);
      this.saved.emit(collectionIds);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
