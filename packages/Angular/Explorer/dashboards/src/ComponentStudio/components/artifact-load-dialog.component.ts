import { Component, OnInit, OnDestroy } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { RunView, Metadata } from '@memberjunction/core';
import {
  ArtifactEntity,
  ArtifactVersionEntity,
  CollectionEntity,
  CollectionArtifactEntity
} from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface ArtifactLoadResult {
  spec: ComponentSpec;
  artifactID: string;
  versionID: string;
  versionNumber: number;
  artifactName: string;
}

@Component({
  standalone: false,
  selector: 'app-artifact-load-dialog',
  templateUrl: './artifact-load-dialog.component.html',
  styleUrl: './artifact-load-dialog.component.css'
})
export class ArtifactLoadDialogComponent implements OnInit, OnDestroy {
  // Tab state
  activeTab = 0; // 0 = Artifacts, 1 = Collections

  // Artifacts data
  artifacts: ArtifactEntity[] = [];
  artifactVersions: ArtifactVersionEntity[] = [];
  selectedArtifact: ArtifactEntity | null = null;
  selectedVersion: ArtifactVersionEntity | null = null;

  // Collections data
  collections: CollectionEntity[] = [];
  selectedCollection: CollectionEntity | null = null;
  collectionArtifacts: ArtifactEntity[] = [];

  // Search and filter
  searchTerm = '';
  selectedArtifactType = '';
  userEmail = '';

  // Paging
  currentPage = 0;
  pageSize = 25;
  totalArtifacts = 0;
  hasMorePages = false;

  // UI state
  isLoading = true;
  isLoadingVersions = false;
  isLoadingCollections = false;
  isFilterPanelCollapsed = false;

  // Preview
  previewSpec: ComponentSpec | null = null;
  previewError: string | null = null;
  showJsonPreview = false;

  private metadata = new Metadata();
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(public dialog: DialogRef) {}

  async ngOnInit() {
    // Setup search debouncing
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.filterArtifacts();
    });

    await Promise.all([
      this.loadArtifacts(),
      this.loadCollections()
    ]);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadArtifacts() {
    this.isLoading = true;
    try {
      const rv = new RunView();
      const startRow = this.currentPage * this.pageSize;

      const result = await rv.RunView<ArtifactEntity>({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: this.buildArtifactFilter(),
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: this.pageSize,
        StartRow: startRow,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.artifacts = result.Results;
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

  async loadCollections() {
    this.isLoadingCollections = true;
    try {
      const currentUserId = this.metadata.CurrentUser?.ID;
      if (!currentUserId) {
        this.collections = [];
        return;
      }

      const rv = new RunView();
      const result = await rv.RunView<CollectionEntity>({
        EntityName: 'MJ: Collections',
        ExtraFilter: `UserID = '${currentUserId}' OR ID IN (
          SELECT CollectionID FROM __mj.vwCollectionPermissions
          WHERE UserID = '${currentUserId}' AND CanRead = 1
        )`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.collections = result.Results || [];
      }
    } catch (error) {
      console.error('Error loading collections:', error);
      this.collections = [];
    } finally {
      this.isLoadingCollections = false;
    }
  }

  async selectCollection(collection: CollectionEntity) {
    this.selectedCollection = collection;
    this.selectedArtifact = null;
    this.selectedVersion = null;
    this.artifactVersions = [];

    // Load artifacts in this collection
    try {
      const rv = new RunView();
      const result = await rv.RunView<ArtifactEntity>({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID IN (
          SELECT DISTINCT av.ArtifactID
          FROM __mj.vwArtifactVersions av
          INNER JOIN __mj.vwCollectionArtifacts ca ON ca.ArtifactVersionID = av.ID
          WHERE ca.CollectionID = '${collection.ID}'
        )`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.collectionArtifacts = result.Results || [];
      }
    } catch (error) {
      console.error('Error loading collection artifacts:', error);
      this.collectionArtifacts = [];
    }
  }

  private buildArtifactFilter(): string {
    const filters: string[] = [];

    // Always filter to Component type by default
    if (this.selectedArtifactType) {
      filters.push(`TypeID IN (SELECT ID FROM __mj.vwArtifactTypes WHERE Name = '${this.selectedArtifactType}')`);
    } else {
      filters.push(`TypeID IN (SELECT ID FROM __mj.vwArtifactTypes WHERE Name = 'Component')`);
    }

    // Search filter
    if (this.searchTerm?.trim()) {
      const term = this.searchTerm.toLowerCase();
      filters.push(`(Name LIKE '%${term}%' OR Description LIKE '%${term}%')`);
    }

    // User email filter
    if (this.userEmail?.trim()) {
      const md = new Metadata();
      const schemaName = md.EntityByName("Users")?.SchemaName || "__mj";
      filters.push(`UserID IN (SELECT ID FROM ${schemaName}.vwUsers WHERE Email LIKE '%${this.userEmail.trim()}%')`);
    }

    return filters.length > 0 ? filters.join(' AND ') : '';
  }

  async selectArtifact(artifact: ArtifactEntity) {
    this.selectedArtifact = artifact;
    this.selectedVersion = null;
    this.previewSpec = null;
    this.previewError = null;

    await this.loadVersions(artifact.ID);
  }

  async loadVersions(artifactId: string) {
    this.isLoadingVersions = true;
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

        // Auto-select the latest version
        if (this.artifactVersions.length > 0) {
          await this.selectVersion(this.artifactVersions[0]);
        }
      }
    } catch (error) {
      console.error('Error loading versions:', error);
      this.artifactVersions = [];
    } finally {
      this.isLoadingVersions = false;
    }
  }

  async selectVersion(version: ArtifactVersionEntity) {
    this.selectedVersion = version;
    await this.loadPreview(version);
  }

  async loadPreview(version: ArtifactVersionEntity) {
    try {
      this.previewError = null;

      // Try Content field first (new schema)
      if (version.Content) {
        this.previewSpec = JSON.parse(version.Content) as ComponentSpec;
      }
      // Fallback to Configuration field (legacy)
      else if (version.Configuration) {
        const config = JSON.parse(version.Configuration);

        // Extract from SkipAPIAnalysisCompleteResponse if needed
        if (config.componentOptions && config.componentOptions.length > 0) {
          this.previewSpec = config.componentOptions[0].option;
        } else {
          this.previewSpec = config;
        }
      }
      else {
        this.previewError = 'No content found in this version';
      }
    } catch (error) {
      this.previewError = `Failed to parse: ${error}`;
      this.previewSpec = null;
    }
  }

  async filterArtifacts() {
    this.currentPage = 0;
    await this.loadArtifacts();
  }

  onSearchInput() {
    this.searchSubject.next(this.searchTerm);
  }

  onArtifactTypeChange() {
    this.selectedArtifact = null;
    this.selectedVersion = null;
    this.artifactVersions = [];
    this.filterArtifacts();
  }

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

  getActiveFilterCount(): number {
    let count = 0;
    if (this.searchTerm?.trim()) count++;
    if (this.selectedArtifactType) count++;
    if (this.userEmail?.trim()) count++;
    return count;
  }

  canLoad(): boolean {
    return this.selectedArtifact !== null &&
           this.selectedVersion !== null &&
           this.previewSpec !== null;
  }

  cancel() {
    this.dialog.close(undefined);
  }

  load() {
    if (!this.canLoad()) return;

    const result: ArtifactLoadResult = {
      spec: this.previewSpec!,
      artifactID: this.selectedArtifact!.ID,
      versionID: this.selectedVersion!.ID,
      versionNumber: this.selectedVersion!.VersionNumber,
      artifactName: this.selectedArtifact!.Name
    };

    this.dialog.close(result);
  }

  onTabSelect(index: number) {
    this.activeTab = index;
  }

  getArtifactsByTab(): ArtifactEntity[] {
    return this.activeTab === 0 ? this.artifacts : this.collectionArtifacts;
  }

  toggleJsonPreview(): void {
    this.showJsonPreview = !this.showJsonPreview;
  }

  getPreviewJSON(): string {
    return this.previewSpec ? JSON.stringify(this.previewSpec, null, 2) : '';
  }
}
