import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CollectionEntity, ArtifactEntity, CollectionArtifactEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'date' | 'type';

@Component({
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

          <button class="btn-add" (click)="onAddArtifact()" title="Add Artifact">
            <i class="fas fa-plus"></i> Add
          </button>
        </div>
      </div>

      <div class="view-content" [class.grid-mode]="viewMode === 'grid'" [class.list-mode]="viewMode === 'list'">
        <div *ngIf="artifacts.length === 0" class="empty-state">
          <i class="fas fa-folder-open"></i>
          <p>This collection is empty</p>
          <button class="btn-add-primary" (click)="onAddArtifact()">
            <i class="fas fa-plus"></i> Add Artifact
          </button>
        </div>

        <mj-collection-artifact-card
          *ngFor="let artifact of artifacts"
          [artifact]="artifact"
          (selected)="onArtifactSelected($event)"
          (viewed)="onViewArtifact($event)"
          (edited)="onEditArtifact($event)"
          (removed)="onRemoveArtifact($event)">
        </mj-collection-artifact-card>
      </div>
    </div>
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
  `]
})
export class CollectionViewComponent implements OnInit, OnChanges {
  @Input() collection!: CollectionEntity;
  @Input() currentUser!: UserInfo;

  public artifacts: ArtifactEntity[] = [];
  public viewMode: ViewMode = 'grid';
  public sortBy: SortBy = 'date';

  public sortOptions = [
    { label: 'Name', value: 'name' },
    { label: 'Date Modified', value: 'date' },
    { label: 'Type', value: 'type' }
  ];

  ngOnInit() {
    this.loadArtifacts();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['collection'] && !changes['collection'].firstChange) {
      this.loadArtifacts();
    }
  }

  private async loadArtifacts(): Promise<void> {
    if (!this.collection) return;

    try {
      const rv = new RunView();

      // Load artifacts through the CollectionArtifacts join table
      const result = await rv.RunView<ArtifactEntity>({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID IN (SELECT ArtifactID FROM [__mj].[MJ: Collection Artifacts] WHERE CollectionID='${this.collection.ID}')`,
        OrderBy: this.getOrderBy(),
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success) {
        this.artifacts = result.Results || [];
      }
    } catch (error) {
      console.error('Failed to load collection artifacts:', error);
    }
  }

  private getOrderBy(): string {
    switch (this.sortBy) {
      case 'name':
        return 'Name ASC';
      case 'type':
        return 'Type ASC, Name ASC';
      case 'date':
      default:
        return '__mj_UpdatedAt DESC';
    }
  }

  onSortChange(): void {
    this.loadArtifacts();
  }

  onArtifactSelected(artifact: ArtifactEntity): void {
    console.log('Artifact selected:', artifact.ID);
    // TODO: Emit event or navigate to artifact detail view
  }

  onViewArtifact(artifact: ArtifactEntity): void {
    console.log('View artifact:', artifact.ID);
    // TODO: Open artifact viewer modal or panel
  }

  onEditArtifact(artifact: ArtifactEntity): void {
    console.log('Edit artifact:', artifact.ID);
    // TODO: Open artifact editor
  }

  async onRemoveArtifact(artifact: ArtifactEntity): Promise<void> {
    if (!confirm(`Remove "${artifact.Name}" from this collection?`)) return;

    try {
      // Find and delete the CollectionArtifact join record
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${this.collection.ID}' AND ArtifactID='${artifact.ID}'`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        const joinRecord = result.Results[0];
        await joinRecord.Delete();
        await this.loadArtifacts();
      }
    } catch (error) {
      console.error('Failed to remove artifact from collection:', error);
      alert('Failed to remove artifact from collection');
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
        // Add to collection via join table
        const joinRecord = await md.GetEntityObject<CollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);
        joinRecord.CollectionID = this.collection.ID;
        joinRecord.ArtifactID = artifact.ID;

        await joinRecord.Save();
        await this.loadArtifacts();
      }
    } catch (error) {
      console.error('Failed to add artifact:', error);
      alert('Failed to add artifact');
    }
  }
}