import { Component, Input, OnInit } from '@angular/core';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { CollectionEntity, ArtifactEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ArtifactStateService } from '../../services/artifact-state.service';

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
        <div class="collections-search">
          <i class="fas fa-search"></i>
          <input type="text"
                 [(ngModel)]="searchQuery"
                 (ngModelChange)="onSearchChange($event)"
                 placeholder="Search collections and artifacts..."
                 class="collection-search-input">
        </div>
        <div class="collections-actions">
          <button class="btn-primary" (click)="createCollection()" title="New Collection">
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

        <div *ngIf="!isLoading && collections.length === 0 && artifacts.length === 0 && !searchQuery" class="empty-state">
          <i class="fas fa-folder-open"></i>
          <h3>No collections yet</h3>
          <p>Create your first collection to organize artifacts</p>
          <button class="btn-primary" (click)="createCollection()">
            <i class="fas fa-folder-plus"></i>
            Create Collection
          </button>
        </div>

        <div *ngIf="!isLoading && collections.length === 0 && artifacts.length === 0 && searchQuery" class="empty-state">
          <i class="fas fa-search"></i>
          <p>No collections or artifacts found</p>
        </div>

        <div *ngIf="!isLoading && (filteredCollections.length > 0 || filteredArtifacts.length > 0)" class="content-grid">
          <!-- Sub-collections -->
          <div class="section" *ngIf="filteredCollections.length > 0">
            <div class="section-header">
              <h3>Collections</h3>
              <span class="section-count">{{ filteredCollections.length }}</span>
            </div>
            <div class="collection-grid">
              <div *ngFor="let collection of filteredCollections"
                   class="collection-card"
                   (click)="openCollection(collection)">
                <div class="card-icon">
                  <i class="fas fa-folder"></i>
                </div>
                <div class="card-content">
                  <div class="card-name">{{ collection.Name }}</div>
                  <div class="card-description" *ngIf="collection.Description">
                    {{ collection.Description }}
                  </div>
                </div>
                <div class="card-actions" (click)="$event.stopPropagation()">
                  <button class="card-action-btn" (click)="editCollection(collection)" title="Edit">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="card-action-btn danger" (click)="deleteCollection(collection)" title="Delete">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Artifacts in current collection -->
          <div class="section" *ngIf="filteredArtifacts.length > 0 || currentCollectionId">
            <div class="section-header">
              <h3>Artifacts</h3>
              <span class="section-count">{{ filteredArtifacts.length }}</span>
              <button class="btn-primary btn-sm" (click)="addArtifact()" *ngIf="currentCollectionId">
                <i class="fas fa-plus"></i>
                Add Artifact
              </button>
            </div>
            <div class="artifact-grid">
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
                  <button class="card-action-btn" (click)="removeArtifact(artifact)" title="Remove from collection" *ngIf="currentCollectionId">
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

    .collection-search-input {
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      flex: 1;
      color: #111827;
    }

    .collection-search-input::placeholder {
      color: #9CA3AF;
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
    }

    .card-icon i {
      font-size: 20px;
      color: #1e40af;
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
  `]
})
export class CollectionsFullViewComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public collections: CollectionEntity[] = [];
  public artifacts: ArtifactEntity[] = [];
  public filteredCollections: CollectionEntity[] = [];
  public filteredArtifacts: ArtifactEntity[] = [];
  public searchQuery: string = '';
  public isLoading: boolean = false;
  public breadcrumbs: Array<{ id: string; name: string }> = [];
  public currentCollectionId: string | null = null;
  public currentCollection: CollectionEntity | null = null;

  public isFormModalOpen: boolean = false;
  public editingCollection?: CollectionEntity;
  public isArtifactModalOpen: boolean = false;

  constructor(
    private dialogService: DialogService,
    private artifactState: ArtifactStateService
  ) {}

  ngOnInit() {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      await Promise.all([
        this.loadCollections(),
        this.loadArtifacts()
      ]);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadCollections(): Promise<void> {
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
    }
  }

  private async loadArtifacts(): Promise<void> {
    if (!this.currentCollectionId) {
      this.artifacts = [];
      this.filteredArtifacts = [];
      return;
    }

    try {
      this.artifacts = await this.artifactState.loadArtifactsForCollection(
        this.currentCollectionId,
        this.currentUser
      );
      this.applySearch();
    } catch (error) {
      console.error('Failed to load artifacts:', error);
    }
  }

  onSearchChange(query: string): void {
    this.applySearch();
  }

  private applySearch(): void {
    if (!this.searchQuery.trim()) {
      this.filteredCollections = [...this.collections];
      this.filteredArtifacts = [...this.artifacts];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredCollections = this.collections.filter(c =>
        c.Name.toLowerCase().includes(query) ||
        (c.Description && c.Description.toLowerCase().includes(query))
      );
      this.filteredArtifacts = this.artifacts.filter(a =>
        a.Name.toLowerCase().includes(query)
      );
    }
  }

  async openCollection(collection: CollectionEntity): Promise<void> {
    this.breadcrumbs.push({ id: collection.ID, name: collection.Name });
    this.currentCollectionId = collection.ID;
    this.currentCollection = collection;
    this.searchQuery = '';
    await this.loadData();
  }

  async navigateTo(crumb: { id: string; name: string }): Promise<void> {
    const index = this.breadcrumbs.findIndex(b => b.id === crumb.id);
    if (index !== -1) {
      this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
      this.currentCollectionId = crumb.id;

      // Load the collection entity
      const md = new Metadata();
      this.currentCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
      await this.currentCollection.Load(crumb.id);

      this.searchQuery = '';
      await this.loadData();
    }
  }

  async navigateToRoot(): Promise<void> {
    this.breadcrumbs = [];
    this.currentCollectionId = null;
    this.currentCollection = null;
    this.searchQuery = '';
    await this.loadData();
  }

  refresh(): void {
    this.loadData();
  }

  createCollection(): void {
    this.editingCollection = undefined;
    this.isFormModalOpen = true;
  }

  editCollection(collection: CollectionEntity): void {
    this.editingCollection = collection;
    this.isFormModalOpen = true;
  }

  async deleteCollection(collection: CollectionEntity): Promise<void> {
    console.log('deleteCollection called for:', collection.Name, collection.ID);

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Collection',
      message: `Are you sure you want to delete "${collection.Name}"? This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      dangerous: true
    });

    console.log('Delete confirmed:', confirmed);

    if (confirmed) {
      try {
        console.log('Attempting to delete collection...');
        const deleted = await collection.Delete();
        console.log('Delete result:', deleted);

        if (deleted) {
          await this.loadCollections();
        } else {
          await this.dialogService.alert('Error', 'Failed to delete collection.');
        }
      } catch (error) {
        console.error('Error deleting collection:', error);
        await this.dialogService.alert('Error', `An error occurred while deleting the collection: ${error}`);
      }
    }
  }

  async onCollectionSaved(collection: CollectionEntity): Promise<void> {
    this.isFormModalOpen = false;
    this.editingCollection = undefined;
    await this.loadCollections();
  }

  onFormCancelled(): void {
    this.isFormModalOpen = false;
    this.editingCollection = undefined;
  }

  async addArtifact(): Promise<void> {
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

    const confirmed = await this.dialogService.confirm({
      title: 'Remove Artifact',
      message: `Remove "${artifact.Name}" from this collection?`,
      okText: 'Remove',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      try {
        await this.artifactState.removeFromCollection(
          artifact.ID,
          this.currentCollectionId,
          this.currentUser
        );
        await this.loadArtifacts();
      } catch (error) {
        console.error('Error removing artifact:', error);
        await this.dialogService.alert('Error', 'Failed to remove artifact from collection.');
      }
    }
  }

  viewArtifact(artifact: ArtifactEntity): void {
    this.artifactState.openArtifact(artifact.ID);
  }
}
