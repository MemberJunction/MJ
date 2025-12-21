import { Component, OnInit, OnDestroy } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { RunView, Metadata, UserInfo } from '@memberjunction/core';
import { ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export interface ArtifactSelectionResult {
  artifact: ArtifactEntity;
  action: 'new-version' | 'update-version';
  versionToUpdate?: ArtifactVersionEntity;
}

@Component({
  standalone: false,
  selector: 'app-artifact-selection-dialog',
  templateUrl: './artifact-selection-dialog.component.html',
  styleUrl: './artifact-selection-dialog.component.css'
})
export class ArtifactSelectionDialogComponent implements OnInit, OnDestroy {
  // Data
  artifacts: ArtifactEntity[] = [];
  artifactVersions: ArtifactVersionEntity[] = [];

  // Paging State
  currentPage = 0;
  pageSize = 25;
  totalArtifacts = 0;
  hasMorePages = false;

  // UI State
  isLoading = true;
  searchTerm = '';
  userEmail = '';
  selectedArtifactType = '';
  showNewArtifactForm = false;
  isFilterPanelCollapsed = false;


  // Selection State
  selectedArtifact: ArtifactEntity | null = null;
  selectedVersion: ArtifactVersionEntity | null = null;
  versionAction: 'new' | 'update' = 'new';
  
  // New Artifact Form
  newArtifactName = '';
  newArtifactDescription = '';
  
  private metadata = new Metadata();
  private currentUser: UserInfo | null = null;
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(
    public dialog: DialogRef,
    private notificationService: MJNotificationService
  ) {}

  async ngOnInit() {
    // Setup search debouncing
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.filterArtifacts();
    });
    
    await this.filterArtifacts();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadArtifacts() {
    this.isLoading = true;
    try {
      const rv = new RunView();

      // Calculate StartRow for server-side paging
      const startRow = this.currentPage * this.pageSize;

      // Load artifacts with paging
      const result = await rv.RunView<ArtifactEntity>({
        ExtraFilter: this._artifactFilter,
        EntityName: 'MJ: Artifacts',
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: this.pageSize,
        StartRow: startRow,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.artifacts = result.Results;

        // Calculate total pages using TotalRowCount from server
        this.totalArtifacts = result.TotalRowCount || 0;
        const totalPages = Math.ceil(this.totalArtifacts / this.pageSize);
        this.hasMorePages = this.currentPage < totalPages - 1;
      }
    } catch (error) {
      console.error('Error loading artifacts:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private _artifactFilter: string | undefined= undefined;
  public async filterArtifacts() {
    // Reset to first page when filters change
    this.currentPage = 0;
    
    const filters: string[] = [];
    
    // Filter by search term
    if (this.searchTerm?.trim()) {
      const term = this.searchTerm.toLowerCase();
      filters.push(`(Name LIKE '%${term}%' OR Description LIKE '%${term}%')`);
    }
    
    // Filter by artifact type
    if (this.selectedArtifactType) {
      filters.push(`ArtifactTypeID IN (SELECT ID FROM __mj.vwArtifactTypes WHERE Name = '${this.selectedArtifactType}')`);
    }
    
    // Filter by user email if provided
    if (this.userEmail?.trim()) {
      const md = new Metadata();
      const schemaName = md.EntityByName("Users")?.SchemaName || "__mj";
      const userFilter = `UserID IN (SELECT ID FROM ${schemaName}.vwUsers WHERE Email LIKE '%${this.userEmail.trim()}%')`;
      filters.push(userFilter);
    }
    
    // Combine all filters
    this._artifactFilter = filters.length > 0 ? filters.join(' AND ') : undefined;

    await this.loadArtifacts();
  }

  selectCreateNew() {
    this.showNewArtifactForm = true;
    this.selectedArtifact = null;
    this.selectedVersion = null;
  }

  async selectArtifact(artifact: ArtifactEntity) {
    this.selectedArtifact = artifact;
    this.showNewArtifactForm = false;
    this.versionAction = 'new';
    this.selectedVersion = null;

    // Load versions for this artifact
    await this.loadVersions(artifact.ID);
  }

  async loadVersions(artifactId: string) {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID = '${artifactId}'`,
        OrderBy: 'VersionNumber DESC',
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.artifactVersions = result.Results;
      }
    } catch (error) {
      console.error('Error loading versions:', error);
      this.artifactVersions = [];
    }
  }

  getNextVersionNumber(): number {
    if (this.artifactVersions.length === 0) return 1;
    return Math.max(...this.artifactVersions.map(v => v.VersionNumber)) + 1;
  }

  // Paging methods
  async nextPage() {
    if (this.hasMorePages) {
      this.currentPage++;
      await this.loadArtifacts();
    }
  }

  async previousPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      await this.loadArtifacts();
    }
  }

  canGoNext(): boolean {
    return this.hasMorePages;
  }

  canGoPrevious(): boolean {
    return this.currentPage > 0;
  }

  getTotalPages(): number {
    return Math.ceil(this.totalArtifacts / this.pageSize);
  }

  toggleFilterPanel() {
    this.isFilterPanelCollapsed = !this.isFilterPanelCollapsed;
  }

  onSearchInput() {
    this.searchSubject.next(this.searchTerm);
  }

  onArtifactTypeChange() {
    // Clear selected artifact when type changes
    this.selectedArtifact = null;
    this.selectedVersion = null;
    this.artifactVersions = [];
    this.filterArtifacts();
  }

  getActiveFilterCount(): number {
    let count = 0;
    if (this.searchTerm?.trim()) count++;
    if (this.selectedArtifactType) count++;
    if (this.userEmail?.trim()) count++;
    return count;
  }

  canSave(): boolean {
    if (this.showNewArtifactForm) {
      return this.newArtifactName.trim().length > 0;
    }
    
    if (!this.selectedArtifact) return false;
    
    if (this.versionAction === 'update') {
      return this.selectedVersion !== null;
    }
    
    return true;
  }

  getSaveButtonText(): string {
    if (this.showNewArtifactForm) {
      return 'Create & Save';
    }

    if (this.versionAction === 'update' && this.selectedVersion) {
      return `Update Version ${this.selectedVersion.VersionNumber}`;
    }

    return `Save as Version ${this.getNextVersionNumber()}`;
  }

  cancel() {
    this.dialog.close(undefined);
  }

  async save() {
    if (!this.canSave()) return;
    
    // Handle new artifact creation
    if (this.showNewArtifactForm) {
      const newArtifact = await this.createNewArtifact();
      if (newArtifact) {
        const result: ArtifactSelectionResult = {
          artifact: newArtifact,
          action: 'new-version'
        };
        this.dialog.close(result);
      }
      return;
    }
    
    // Handle existing artifact selection
    if (this.selectedArtifact) {
      const result: ArtifactSelectionResult = {
        artifact: this.selectedArtifact,
        action: this.versionAction === 'update' ? 'update-version' : 'new-version',
        versionToUpdate: this.versionAction === 'update' ? this.selectedVersion! : undefined
      };
      
      // If updating, show confirmation
      if (this.versionAction === 'update') {
        const confirm = window.confirm(
          `Are you sure you want to overwrite version ${this.selectedVersion!.VersionNumber}? This action cannot be undone.`
        );

        if (!confirm) return;
      }

      this.dialog.close(result);
    }
  }

  private async createNewArtifact(): Promise<ArtifactEntity | null> {
    try {
      const artifact = await this.metadata.GetEntityObject<ArtifactEntity>('MJ: Artifacts');
      artifact.Name = this.newArtifactName;
      artifact.Description = this.newArtifactDescription || null;

      // Get Component artifact type
      const rv = new RunView();
      const typeResult = await rv.RunView({
        EntityName: 'MJ: Artifact Types',
        ExtraFilter: `Name = 'Component'`,
        MaxRows: 1
      });

      if (typeResult.Success && typeResult.Results?.length > 0) {
        artifact.TypeID = typeResult.Results[0].ID;
      }

      // Set default environment if available from current user
      // Environment ID is optional - will be set by server if not provided
      const envId = (this.metadata.CurrentUser as any)?.EnvironmentID;
      if (envId) {
        artifact.EnvironmentID = envId;
      }

      artifact.Comments = 'Created from Component Studio';

      const saveResult = await artifact.Save();
      if (saveResult) {
        this.notificationService.CreateSimpleNotification(
          `Artifact "${artifact.Name}" created successfully`,
          'success',
          3000
        );
        return artifact;
      } else {
        console.error('Failed to create artifact - Full LatestResult:', artifact.LatestResult);
        this.notificationService.CreateSimpleNotification(
          'Failed to create artifact',
          'error'
        );
        return null;
      }
    } catch (error) {
      console.error('Error creating artifact:', error);
      this.notificationService.CreateSimpleNotification(
        'Error creating artifact',
        'error'
      );
      return null;
    }
  }
}