import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CollectionEntity, ArtifactEntity, ArtifactVersionEntity, CollectionArtifactEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'date' | 'type';

@Component({
  standalone: false,
  selector: 'mj-collection-view',
  template: `
    <div class="collection-view">
      <div class="view-header">
        <h2>{{ collection.Name || 'Collection' }}</h2>
        <div class="header-actions">
          <div class="view-mode-toggle">
            <button
              class="mode-btn"
              [class.active]="viewMode === 'grid'"
              (click)="viewMode = 'grid'"
              title="Grid View">
              <i class="fas fa-grid"></i>
            </button>
            <button
              class="mode-btn"
              [class.active]="viewMode === 'list'"
              (click)="viewMode = 'list'"
              title="List View">
              <i class="fas fa-list"></i>
            </button>
          </div>
    
          <kendo-dropdownlist
            [data]="sortOptions"
            [textField]="'label'"
            [valueField]="'value'"
            [(value)]="sortBy"
            (valueChange)="onSortChange()"
            [style.width.px]="150"
            placeholder="Sort by...">
          </kendo-dropdownlist>
    
          @if (canEdit) {
            <button class="btn-add" (click)="onAddArtifact()" title="Add Artifact">
              <i class="fas fa-plus"></i> Add
            </button>
          }
        </div>
      </div>
    
      <div class="view-content" [class.grid-mode]="viewMode === 'grid'" [class.list-mode]="viewMode === 'list'">
        @if (artifactVersions.length === 0) {
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <p>This collection is empty</p>
            @if (canEdit) {
              <button class="btn-add-primary" (click)="onAddArtifact()">
                <i class="fas fa-plus"></i> Add Artifact
              </button>
            }
          </div>
        }
    
        @for (item of artifactVersions; track item.version.ID) {
          <mj-collection-artifact-card
            [artifact]="item.artifact"
            [version]="item.version"
            (selected)="onArtifactSelected(item)"
            (viewed)="onViewArtifact(item)"
            (edited)="onEditArtifact(item)"
            (removed)="onRemoveArtifact(item)">
          </mj-collection-artifact-card>
        }
      </div>
    </div>
    
    <!-- Artifact Viewer Panel -->
    @if (showArtifactViewer && selectedArtifactId) {
      <div class="artifact-viewer-overlay" (click)="onCloseArtifactViewer()">
        <div class="artifact-viewer-container" (click)="$event.stopPropagation()">
          <mj-artifact-viewer-panel
            [artifactId]="selectedArtifactId"
            [versionNumber]="selectedVersionNumber"
            [currentUser]="currentUser"
            [environmentId]="environmentId"
            [viewContext]="'collection'"
            [contextCollectionId]="collection.ID"
            (closed)="onCloseArtifactViewer()">
          </mj-artifact-viewer-panel>
        </div>
      </div>
    }
    `,
  styles: [`
    .collection-view { display: flex; flex-direction: column; height: 100%; background: white; }

    .view-header { padding: 20px 24px; border-bottom: 1px solid #D9D9D9; display: flex; justify-content: space-between; align-items: center; }
    .view-header h2 { margin: 0; font-size: 20px; flex: 1; }

    .header-actions { display: flex; align-items: center; gap: 12px; }

    .view-mode-toggle { display: flex; border: 1px solid #D9D9D9; border-radius: 4px; overflow: hidden; }
    .mode-btn { padding: 8px 12px; background: white; border: none; border-right: 1px solid #D9D9D9; cursor: pointer; color: #666; transition: all 150ms ease; }
    .mode-btn:last-child { border-right: none; }
    .mode-btn:hover { background: #F4F4F4; }
    .mode-btn.active { background: #0076B6; color: white; }

    .btn-add { padding: 8px 16px; background: #0076B6; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .btn-add:hover { background: #005A8C; }

    .view-content { flex: 1; overflow-y: auto; padding: 24px; }
    .view-content.grid-mode { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .view-content.list-mode { display: flex; flex-direction: column; gap: 12px; }

    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 24px; color: #999; }
    .empty-state i { font-size: 64px; margin-bottom: 24px; }
    .empty-state p { margin: 0 0 24px 0; font-size: 16px; }
    .btn-add-primary { padding: 12px 24px; background: #0076B6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; }
    .btn-add-primary:hover { background: #005A8C; }

    .artifact-viewer-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; }
    .artifact-viewer-container { width: 90%; max-width: 1200px; height: 90vh; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); }
  `]
})
export class CollectionViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() collection!: CollectionEntity;
  @Input() currentUser!: UserInfo;
  @Input() environmentId!: string;
  @Input() canEdit: boolean = true;

  // Store versions with parent artifact info for display
  public artifactVersions: Array<{
    version: ArtifactVersionEntity;
    artifact: ArtifactEntity;
  }> = [];
  public viewMode: ViewMode = 'grid';
  public sortBy: SortBy = 'date';
  public selectedArtifactId: string | null = null;
  public selectedVersionNumber: number | undefined = undefined;
  public showArtifactViewer = false;

  public sortOptions = [
    { label: 'Name', value: 'name' },
    { label: 'Date Modified', value: 'date' },
    { label: 'Type', value: 'type' }
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadArtifacts();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['collection'] && !changes['collection'].firstChange) {
      this.loadArtifacts();
    }
  }

  ngOnDestroy() {
    // Close artifact viewer when navigating away from collection
    if (this.showArtifactViewer) {
      this.onCloseArtifactViewer();
    }
  }

  private async loadArtifacts(): Promise<void> {
    if (!this.collection) return;

    try {
      const rv = new RunView();
      const md = new Metadata();

      // Load ALL VERSIONS in this collection (no DISTINCT - each version is separate)
      const versionResult = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ID IN (
          SELECT ca.ArtifactVersionID
          FROM [__mj].[vwCollectionArtifacts] ca
          WHERE ca.CollectionID='${this.collection.ID}'
        )`,
        OrderBy: this.getVersionOrderBy(),
        ResultType: 'entity_object'
      }, this.currentUser);

      if (versionResult.Success && versionResult.Results) {
        // Get unique artifact IDs
        const artifactIds = [...new Set(versionResult.Results.map(v => v.ArtifactID))];

        // Load parent artifact info (just for display metadata - no visibility filtering)
        const artifactMap = new Map<string, ArtifactEntity>();
        if (artifactIds.length > 0) {
          const artifactFilter = artifactIds.map(id => `ID='${id}'`).join(' OR ');
          const artifactResult = await rv.RunView<ArtifactEntity>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: artifactFilter,
            ResultType: 'entity_object'
          }, this.currentUser);

          if (artifactResult.Success && artifactResult.Results) {
            artifactResult.Results.forEach(a => artifactMap.set(a.ID, a));
          }
        }

        // Combine version + artifact info
        this.artifactVersions = versionResult.Results
          .map(version => ({
            version,
            artifact: artifactMap.get(version.ArtifactID)!
          }))
          .filter(item => item.artifact != null); // Filter out any without parent artifact
      } else {
        this.artifactVersions = [];
      }
    } catch (error) {
      console.error('Failed to load collection artifacts:', error);
      this.artifactVersions = [];
    }
  }

  private getVersionOrderBy(): string {
    switch (this.sortBy) {
      case 'name':
        return 'Name ASC, VersionNumber DESC';
      case 'type':
        // Will sort by parent artifact type (handled in template)
        return 'ArtifactID ASC, VersionNumber DESC';
      case 'date':
      default:
        return '__mj_UpdatedAt DESC';
    }
  }

  onSortChange(): void {
    this.loadArtifacts();
  }

  onArtifactSelected(item: { version: ArtifactVersionEntity; artifact: ArtifactEntity }): void {
    // TODO: Emit event or navigate to artifact detail view
  }

  onViewArtifact(item: { version: ArtifactVersionEntity; artifact: ArtifactEntity }): void {
    this.selectedArtifactId = item.artifact.ID;
    this.selectedVersionNumber = item.version.VersionNumber;
    // Force change detection to ensure Input bindings propagate before component creation
    this.cdr.detectChanges();
    this.showArtifactViewer = true;
  }

  onCloseArtifactViewer(): void {
    this.showArtifactViewer = false;
    this.selectedArtifactId = null;
    this.selectedVersionNumber = undefined;
  }

  onEditArtifact(item: { version: ArtifactVersionEntity; artifact: ArtifactEntity }): void {
    // TODO: Open artifact editor
  }

  async onRemoveArtifact(item: { version: ArtifactVersionEntity; artifact: ArtifactEntity }): Promise<void> {
    const versionLabel = `"${item.artifact.Name}" v${item.version.VersionNumber}`;
    if (!confirm(`Remove ${versionLabel} from this collection?`)) return;

    try {
      // Delete THIS SPECIFIC VERSION from the collection
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${this.collection.ID}' AND ArtifactVersionID='${item.version.ID}'`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        // Delete this version association
        for (const joinRecord of result.Results) {
          await joinRecord.Delete();
        }
        await this.loadArtifacts();
        MJNotificationService.Instance.CreateSimpleNotification(
          `Removed ${versionLabel} from collection`,
          'success',
          3000
        );
      }
    } catch (error) {
      console.error('Failed to remove artifact version from collection:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Failed to remove artifact version from collection',
        'error'
      );
    }
  }

  async onAddArtifact(): Promise<void> {
    // TODO: Open artifact picker dialog
    // For now, just show a simple prompt
    const name = prompt('Enter artifact name:');
    if (!name) return;

    try {
      // Create new artifact
      const md = new Metadata();
      const artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.currentUser);

      artifact.Name = name;
      // Type is read-only, set via TypeID instead
      // For now, skip setting type - it has a default

      const saved = await artifact.Save();
      if (saved) {
        // Get the latest version of this artifact to add to collection
        const rv = new RunView();
        const versionResult = await rv.RunView({
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${artifact.ID}'`,
          OrderBy: 'VersionNumber DESC',
          MaxRows: 1,
          ResultType: 'entity_object'
        }, this.currentUser);

        if (!versionResult.Success || !versionResult.Results || versionResult.Results.length === 0) {
          alert('Failed to get artifact version');
          return;
        }

        // Add to collection via join table using version ID
        const joinRecord = await md.GetEntityObject<CollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);
        joinRecord.CollectionID = this.collection.ID;
        joinRecord.ArtifactVersionID = versionResult.Results[0].ID;

        await joinRecord.Save();
        await this.loadArtifacts();
      }
    } catch (error) {
      console.error('Failed to add artifact:', error);
      alert('Failed to add artifact');
    }
  }
}