import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { UserInfo, RunView, Metadata } from '@memberjunction/global';
import { CollectionEntity, ArtifactEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { CollectionStateService } from '../../services/collection-state.service';
import { CollectionPermissionService, CollectionPermission } from '../../services/collection-permission.service';
import { Subject, takeUntil } from 'rxjs';

/**
 * Full-panel Collections view component
 * Comprehensive collection management with artifacts display
 */
@Component({
  selector: 'mj-collections-full-view',
  template: `
    <div class="collections-view">
      <div class="collections-header">
        <div class="collections-breadcrumb">
          <div class="breadcrumb-item">
            <i class="fas fa-home"></i>
            <a class="breadcrumb-link" (click)="navigateToRoot()">Collections</a>
          </div>
          <span class="breadcrumb-path" *ngIf="breadcrumbs.length > 0">
            <ng-container *ngFor="let crumb of breadcrumbs; let last = last">
              <i class="fas fa-chevron-right breadcrumb-separator"></i>
              <a class="breadcrumb-link"
                 [class.active]="last"
                 (click)="navigateTo(crumb)">
                {{ crumb.name }}
              </a>
            </ng-container>
          </span>
        </div>
        <div class="collections-actions">
          <button class="btn-primary" (click)="createCollection()" *ngIf="canEditCurrent()" title="New Collection">
            <i class="fas fa-folder-plus"></i>
            New Collection
          </button>
          <button class="btn-secondary" (click)="refresh()" title="Refresh">
            <i class="fas fa-sync"></i>
          </button>
        </div>
      </div>

      <div class="collections-content">
        <div *ngIf="isLoading" class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading collections...</p>
        </div>

        <div *ngIf="!isLoading" class="content-grid">
          <!-- Sub-collections -->
          <div class="section">
            <div class="section-header">
              <h3>Collections</h3>
              <span class="section-count">{{ filteredCollections.length }}</span>
              <button class="btn-primary btn-sm" (click)="createCollection()" *ngIf="canEditCurrent()">
                <i class="fas fa-plus"></i>
                New Collection
              </button>
            </div>
            <div class="collection-grid" *ngIf="filteredCollections.length > 0">
              <div *ngFor="let collection of filteredCollections"
                   class="collection-card"
                   (click)="openCollection(collection)">
                <div class="card-icon">
                  <i class="fas fa-folder"></i>
                  <!-- Shared indicator -->
                  <div class="shared-badge" *ngIf="isShared(collection)" title="Shared with you">
                    <i class="fas fa-users"></i>
                  </div>
                </div>
                <div class="card-content">
                  <div class="card-name">{{ collection.Name }}</div>
                  <div class="card-owner" *ngIf="isShared(collection) && collection.Owner">
                    <i class="fas fa-user"></i>
                    <span>{{ collection.Owner }}</span>
                  </div>
                  <div class="card-description" *ngIf="collection.Description">
                    {{ collection.Description }}
                  </div>
                </div>
                <div class="card-actions" (click)="$event.stopPropagation()">
                  <button class="card-action-btn" *ngIf="canShare(collection)" (click)="shareCollection(collection)" title="Share">
                    <i class="fas fa-share-alt"></i>
                  </button>
                  <button class="card-action-btn" *ngIf="canEdit(collection)" (click)="editCollection(collection)" title="Edit">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="card-action-btn danger" *ngIf="canDelete(collection)" (click)="deleteCollection(collection)" title="Delete">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Artifacts in current collection -->
          <div class="section" *ngIf="currentCollectionId">
            <div class="section-header">
              <h3>Artifacts</h3>
              <span class="section-count">{{ filteredArtifacts.length }}</span>
              <button class="btn-primary btn-sm" (click)="addArtifact()" *ngIf="canEditCurrent()">
                <i class="fas fa-plus"></i>
                Add Artifact
              </button>
            </div>
            <div class="artifact-grid" *ngIf="filteredArtifacts.length > 0">
              <div *ngFor="let artifact of filteredArtifacts"
                   class="artifact-card"
                   (click)="viewArtifact(artifact)">
                <div class="card-icon artifact-icon">
                  <i class="fas fa-file-alt"></i>
                </div>
                <div class="card-content">
                  <div class="card-name">{{ artifact.Name }}</div>
                  <div class="card-meta">
                    <span class="artifact-type">{{ artifact.Type || 'Unknown' }}</span>
                  </div>
                </div>
                <div class="card-actions" (click)="$event.stopPropagation()">
                  <button class="card-action-btn" (click)="removeArtifact(artifact)" title="Remove from collection" *ngIf="canDeleteCurrent()">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collection Form Modal -->
    <mj-collection-form-modal
      [isOpen]="isFormModalOpen"
      [collection]="editingCollection"
      [parentCollection]="currentCollection || undefined"
      [environmentId]="environmentId"
      [currentUser]="currentUser"
      (saved)="onCollectionSaved($event)"
      (cancelled)="onFormCancelled()">
    </mj-collection-form-modal>

    <!-- Artifact Create Modal -->
    <mj-artifact-create-modal
      [isOpen]="isArtifactModalOpen"
      [collectionId]="currentCollectionId || ''"
      [environmentId]="environmentId"
      [currentUser]="currentUser"
      (saved)="onArtifactSaved($event)"
      (cancelled)="onArtifactModalCancelled()">
    </mj-artifact-create-modal>

    <!-- Share Modal -->
    <mj-collection-share-modal
      [isOpen]="isShareModalOpen"
      [collection]="sharingCollection"
      [currentUser]="currentUser"
      [currentUserPermissions]="sharingCollection ? userPermissions.get(sharingCollection.ID) || null : null"
      (saved)="onPermissionsChanged()"
      (cancelled)="onShareModalCancelled()">
    </mj-collection-share-modal>
  `,
  styles: [
    `
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

    .collections-actions {
      display: flex;
      gap: 8px;
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: #1e40af;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: background 150ms ease;
    }

    .btn-primary:hover {
      background: #1e3a8a;
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

    .btn-sm {
      padding: 6px 12px;
      font-size: 13px;
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
      max-width: 400px;
      margin: 0 auto;
      text-align: center;
      padding: 48px 24px;
    }

    .loading-state i {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state i {
      font-size: 64px;
      margin-bottom: 24px;
      opacity: 0.3;
      color: #D1D5DB;
    }

    .empty-state h3 {
      margin: 0 0 8px 0;
      color: #374151;
      font-size: 20px;
      font-weight: 600;
    }

    .empty-state p {
      margin: 0 0 24px 0;
      font-size: 14px;
      color: #6B7280;
      line-height: 1.5;
    }

    .loading-state p {
      margin: 0;
      font-size: 14px;
    }

    .empty-state .btn-primary {
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .empty-state .btn-primary:hover {
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    }

    .content-grid {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .section-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }

    .section-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 8px;
      background: #EFF6FF;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      color: #1e40af;
    }

    .collection-grid, .artifact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .collection-card, .artifact-card {
      display: flex;
      align-items: start;
      gap: 16px;
      padding: 20px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      cursor: pointer;
      transition: all 150ms ease;
      position: relative;
    }

    .collection-card:hover, .artifact-card:hover {
      border-color: #1e40af;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .card-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #EFF6FF;
      border-radius: 8px;
      flex-shrink: 0;
      position: relative;
    }

    .card-icon i {
      font-size: 20px;
      color: #1e40af;
    }

    .shared-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 18px;
      height: 18px;
      background: #10B981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
    }

    .shared-badge i {
      font-size: 9px;
      color: white;
    }

    .artifact-icon {
      background: #F0FDF4;
    }

    .artifact-icon i {
      color: #059669;
    }

    .card-content {
      flex: 1;
      min-width: 0;
    }

    .card-name {
      font-size: 15px;
      font-weight: 500;
      color: #111827;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-owner {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 12px;
      color: #6B7280;
    }

    .card-owner i {
      font-size: 10px;
    }

    .card-description {
      font-size: 13px;
      color: #6B7280;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta {
      font-size: 12px;
      color: #9CA3AF;
    }

    .artifact-type {
      padding: 2px 8px;
      background: #F3F4F6;
      border-radius: 4px;
      font-weight: 500;
    }

    .card-actions {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 150ms ease;
    }

    .collection-card:hover .card-actions,
    .artifact-card:hover .card-actions {
      opacity: 1;
    }

    .card-action-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      color: #6B7280;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .card-action-btn:hover {
      background: #F9FAFB;
      color: #111827;
      border-color: #D1D5DB;
    }

    .card-action-btn.danger:hover {
      background: #FEE2E2;
      color: #DC2626;
      border-color: #FCA5A5;
    }
  `,
  ],
})
export class CollectionsFullViewComponent implements OnInit, OnDestroy {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Output() collectionNavigated = new EventEmitter<{
    collectionId: string | null;
    artifactId?: string | null;
  }>();

  public collections: CollectionEntity[] = [];
  public artifacts: ArtifactEntity[] = [];
  public filteredCollections: CollectionEntity[] = [];
  public filteredArtifacts: ArtifactEntity[] = [];
  public isLoading: boolean = false;
  public breadcrumbs: Array<{ id: string; name: string }> = [];
  public currentCollectionId: string | null = null;
  public currentCollection: CollectionEntity | null = null;

  public isFormModalOpen: boolean = false;
  public editingCollection?: CollectionEntity;
  public isArtifactModalOpen: boolean = false;

  public userPermissions: Map<string, CollectionPermission> = new Map();
  public isShareModalOpen: boolean = false;
  public sharingCollection: CollectionEntity | null = null;

  private destroy$ = new Subject<void>();
  private isNavigatingProgrammatically = false;

  constructor(
    private dialogService: DialogService,
    private artifactState: ArtifactStateService,
    private collectionState: CollectionStateService,
    private permissionService: CollectionPermissionService
  ) {}

  ngOnInit() {
    this.loadData();

    // Subscribe to collection state changes for deep linking
    this.subscribeToCollectionState();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Subscribe to collection state changes for deep linking support
   */
  private subscribeToCollectionState(): void {
    // Watch for external navigation requests (e.g., from search or URL)
    this.collectionState.activeCollectionId$.pipe(takeUntil(this.destroy$)).subscribe((collectionId) => {
      // Ignore state changes that we triggered ourselves
      if (this.isNavigatingProgrammatically) {
        return;
      }

      // Only navigate if the state is different from our current state
      if (collectionId !== this.currentCollectionId) {
        if (collectionId) {
          console.log('📁 Collection state changed, navigating to:', collectionId);
          this.navigateToCollectionById(collectionId);
        } else {
          console.log('📁 Collection state cleared, navigating to root');
          this.navigateToRoot();
        }
      }
    });
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      await Promise.all([this.loadCollections(), this.loadArtifacts(), this.loadCurrentCollectionPermission()]);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadCollections(): Promise<void> {
    try {
      const rv = new RunView();

      // Load collections where user is owner OR has permissions
      const ownerFilter = `OwnerID='${this.currentUser.ID}'`;
      const permissionSubquery = `ID IN (
        SELECT CollectionID
        FROM [__mj].[vwCollectionPermissions]
        WHERE UserID='${this.currentUser.ID}'
      )`;

      const baseFilter =
        `EnvironmentID='${this.environmentId}'` +
        (this.currentCollectionId ? ` AND ParentID='${this.currentCollectionId}'` : ' AND ParentID IS NULL');

      const filter = `${baseFilter} AND (OwnerID IS NULL OR ${ownerFilter} OR ${permissionSubquery})`;

      const result = await rv.RunView<CollectionEntity>(
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: filter,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object',
        },
        this.currentUser
      );

      if (result.Success) {
        this.collections = result.Results || [];
        await this.loadUserPermissions();
        this.filteredCollections = [...this.collections];
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  }

  private async loadUserPermissions(): Promise<void> {
    this.userPermissions.clear();

    for (const collection of this.collections) {
      const permission = await this.permissionService.checkPermission(collection.ID, this.currentUser.ID, this.currentUser);

      if (permission) {
        this.userPermissions.set(collection.ID, permission);
      }
    }
  }

  private async loadCurrentCollectionPermission(): Promise<void> {
    if (!this.currentCollectionId || !this.currentCollection) {
      return;
    }

    const permission = await this.permissionService.checkPermission(this.currentCollectionId, this.currentUser.ID, this.currentUser);

    if (permission) {
      this.userPermissions.set(this.currentCollectionId, permission);
    }
  }

  private async loadArtifacts(): Promise<void> {
    if (!this.currentCollectionId) {
      this.artifacts = [];
      this.filteredArtifacts = [];
      return;
    }

    try {
      this.artifacts = await this.artifactState.loadArtifactsForCollection(this.currentCollectionId, this.currentUser);
      this.filteredArtifacts = [...this.artifacts];
    } catch (error) {
      console.error('Failed to load artifacts:', error);
    }
  }

  async openCollection(collection: CollectionEntity): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      this.breadcrumbs.push({ id: collection.ID, name: collection.Name });
      this.currentCollectionId = collection.ID;
      this.currentCollection = collection;
      await this.loadData();

      // Update state service
      this.collectionState.setActiveCollection(collection.ID);

      // Emit navigation event
      this.collectionNavigated.emit({
        collectionId: collection.ID,
        artifactId: null,
      });
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  async navigateTo(crumb: { id: string; name: string }): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      const index = this.breadcrumbs.findIndex((b) => b.id === crumb.id);
      if (index !== -1) {
        this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
        this.currentCollectionId = crumb.id;

        // Load the collection entity
        const md = new Metadata();
        this.currentCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
        await this.currentCollection.Load(crumb.id);

        await this.loadData();

        // Update state service
        this.collectionState.setActiveCollection(crumb.id);

        // Emit navigation event
        this.collectionNavigated.emit({
          collectionId: crumb.id,
          artifactId: null,
        });
      }
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  async navigateToRoot(): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      this.breadcrumbs = [];
      this.currentCollectionId = null;
      this.currentCollection = null;
      await this.loadData();

      // Update state service
      this.collectionState.setActiveCollection(null);

      // Emit navigation event
      this.collectionNavigated.emit({
        collectionId: null,
        artifactId: null,
      });
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  /**
   * Navigate to a collection by ID, building the breadcrumb trail
   * Used for deep linking from search results or URL parameters
   */
  async navigateToCollectionById(collectionId: string): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      console.log('📁 Navigating to collection by ID:', collectionId);

      // Load the target collection
      const md = new Metadata();
      const targetCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
      await targetCollection.Load(collectionId);

      if (!targetCollection || !targetCollection.ID) {
        console.error('❌ Failed to load collection:', collectionId);
        return;
      }

      // Build breadcrumb trail by traversing parent hierarchy
      // Note: breadcrumbs includes ALL collections in the path including the current one
      const trail: Array<{ id: string; name: string }> = [];
      let currentId: string | null = targetCollection.ParentID;

      while (currentId) {
        const parentCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
        await parentCollection.Load(currentId);

        if (parentCollection && parentCollection.ID) {
          // Add to front of trail (we're working backwards)
          trail.unshift({
            id: parentCollection.ID,
            name: parentCollection.Name,
          });
          currentId = parentCollection.ParentID;
        } else {
          break;
        }
      }

      // Add the target collection to the trail (breadcrumbs includes current collection)
      trail.push({
        id: targetCollection.ID,
        name: targetCollection.Name,
      });

      // Update component state
      this.breadcrumbs = trail;
      this.currentCollectionId = targetCollection.ID;
      this.currentCollection = targetCollection;

      // Load collections and artifacts for this collection
      await this.loadData();

      // Update state service
      this.collectionState.setActiveCollection(targetCollection.ID);

      // Emit navigation event
      // NOTE: We don't emit artifactId here because this is for deep linking/programmatic navigation
      // Artifact state is managed separately by the artifact state service
      this.collectionNavigated.emit({
        collectionId: targetCollection.ID,
      });

      console.log('✅ Successfully navigated to collection with breadcrumb trail:', trail);
    } catch (error) {
      console.error('❌ Error navigating to collection:', error);
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  refresh(): void {
    this.loadData();
  }

  async createCollection(): Promise<void> {
    // Validate user can edit current collection (or at root level)
    if (this.currentCollection) {
      const canEdit = await this.validatePermission(this.currentCollection, 'edit');
      if (!canEdit) return;
    }

    this.editingCollection = undefined;
    this.isFormModalOpen = true;
  }

  async editCollection(collection: CollectionEntity): Promise<void> {
    const canEdit = await this.validatePermission(collection, 'edit');
    if (!canEdit) return;

    this.editingCollection = collection;
    this.isFormModalOpen = true;
  }

  async deleteCollection(collection: CollectionEntity): Promise<void> {
    console.log('deleteCollection called for:', collection.Name, collection.ID);

    // Validate user has delete permission
    const canDelete = await this.validatePermission(collection, 'delete');
    if (!canDelete) return;

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Collection',
      message: `Are you sure you want to delete "${collection.Name}"? This will also delete all child collections and remove all artifacts. This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      dangerous: true,
    });

    console.log('Delete confirmed:', confirmed);

    if (confirmed) {
      try {
        console.log('Attempting to delete collection and all children...');
        await this.deleteCollectionRecursive(collection.ID);
        await this.loadCollections();
      } catch (error) {
        console.error('Error deleting collection:', error);
        await this.dialogService.alert('Error', `An error occurred while deleting the collection: ${error}`);
      }
    }
  }

  private async deleteCollectionRecursive(collectionId: string): Promise<void> {
    const rv = new RunView();

    // Step 1: Find and delete all child collections recursively
    const childrenResult = await rv.RunView<CollectionEntity>(
      {
        EntityName: 'MJ: Collections',
        ExtraFilter: `ParentID='${collectionId}'`,
        MaxRows: 1000,
        ResultType: 'entity_object',
      },
      this.currentUser
    );

    if (childrenResult.Success && childrenResult.Results) {
      for (const child of childrenResult.Results) {
        await this.deleteCollectionRecursive(child.ID);
      }
    }

    // Step 2: Delete all permissions for this collection
    await this.permissionService.deleteAllPermissions(collectionId, this.currentUser);

    // Step 3: Delete all artifact links for this collection
    const artifactsResult = await rv.RunView<any>(
      {
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${collectionId}'`,
        MaxRows: 1000,
        ResultType: 'entity_object',
      },
      this.currentUser
    );

    if (artifactsResult.Success && artifactsResult.Results) {
      for (const ca of artifactsResult.Results) {
        await ca.Delete();
      }
    }

    // Step 4: Delete the collection itself
    const md = new Metadata();
    const collection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
    await collection.Load(collectionId);
    const deleted = await collection.Delete();

    if (!deleted) {
      throw new Error(`Failed to delete collection: ${collection.LatestResult?.Message || 'Unknown error'}`);
    }
  }

  async onCollectionSaved(collection: CollectionEntity): Promise<void> {
    this.isFormModalOpen = false;
    this.editingCollection = undefined;
    await this.loadCollections();
    // Reload current collection permission (it was cleared by loadUserPermissions)
    await this.loadCurrentCollectionPermission();
  }

  onFormCancelled(): void {
    this.isFormModalOpen = false;
    this.editingCollection = undefined;
  }

  async addArtifact(): Promise<void> {
    // Validate user can edit current collection
    if (this.currentCollection) {
      const canEdit = await this.validatePermission(this.currentCollection, 'edit');
      if (!canEdit) return;
    }

    this.isArtifactModalOpen = true;
  }

  async onArtifactSaved(artifact: ArtifactEntity): Promise<void> {
    this.isArtifactModalOpen = false;
    await this.loadArtifacts();
  }

  onArtifactModalCancelled(): void {
    this.isArtifactModalOpen = false;
  }

  async removeArtifact(artifact: ArtifactEntity): Promise<void> {
    if (!this.currentCollectionId) return;

    // Validate user has delete permission on current collection
    if (this.currentCollection) {
      const canDelete = await this.validatePermission(this.currentCollection, 'delete');
      if (!canDelete) return;
    }

    const confirmed = await this.dialogService.confirm({
      title: 'Remove Artifact',
      message: `Remove "${artifact.Name}" from this collection?`,
      okText: 'Remove',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      try {
        await this.artifactState.removeFromCollection(artifact.ID, this.currentCollectionId, this.currentUser);
        await this.loadArtifacts();
      } catch (error) {
        console.error('Error removing artifact:', error);
        await this.dialogService.alert('Error', 'Failed to remove artifact from collection.');
      }
    }
  }

  viewArtifact(artifact: ArtifactEntity): void {
    this.artifactState.openArtifact(artifact.ID);

    // Emit navigation event with both collection and artifact
    this.collectionNavigated.emit({
      collectionId: this.currentCollectionId,
      artifactId: artifact.ID,
    });
  }

  // Permission validation and checking methods
  private async validatePermission(collection: CollectionEntity | null, requiredPermission: 'edit' | 'delete' | 'share'): Promise<boolean> {
    // Owner has all permissions (including backwards compatibility for null OwnerID)
    if (!collection?.OwnerID || collection.OwnerID === this.currentUser.ID) {
      return true;
    }

    const permission = this.userPermissions.get(collection.ID);
    if (!permission) {
      await this.dialogService.alert('Permission Denied', 'You do not have permission to perform this action.');
      return false;
    }

    const hasPermission =
      (requiredPermission === 'edit' && permission.canEdit) ||
      (requiredPermission === 'delete' && permission.canDelete) ||
      (requiredPermission === 'share' && permission.canShare);

    if (!hasPermission) {
      const permissionName = requiredPermission.charAt(0).toUpperCase() + requiredPermission.slice(1);
      await this.dialogService.alert('Permission Denied', `You do not have ${permissionName} permission for this collection.`);
      return false;
    }

    return true;
  }

  canEdit(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canEdit || false;
  }

  canDelete(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canDelete || false;
  }

  canShare(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canShare || false;
  }

  canEditCurrent(): boolean {
    // At root level, anyone can create
    if (!this.currentCollectionId || !this.currentCollection) {
      return true;
    }
    return this.canEdit(this.currentCollection);
  }

  canDeleteCurrent(): boolean {
    // At root level, no delete needed
    if (!this.currentCollectionId || !this.currentCollection) {
      return false;
    }
    return this.canDelete(this.currentCollection);
  }

  isShared(collection: CollectionEntity): boolean {
    // Collection is shared if user is not the owner and OwnerID is set
    return collection.OwnerID != null && collection.OwnerID !== this.currentUser.ID;
  }

  // Sharing methods
  async shareCollection(collection: CollectionEntity): Promise<void> {
    // Validate user has share permission
    const canShare = await this.validatePermission(collection, 'share');
    if (!canShare) return;

    this.sharingCollection = collection;
    this.isShareModalOpen = true;
  }

  async onPermissionsChanged(): Promise<void> {
    // Reload collections and permissions after sharing changes
    await this.loadCollections();
  }

  onShareModalCancelled(): void {
    this.isShareModalOpen = false;
    this.sharingCollection = null;
  }
}
