import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import {
  MJArtifactEntity,
  MJArtifactVersionEntity,
  MJCollectionEntity,
  MJCollectionArtifactEntity
} from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { UUIDsEqual } from '@memberjunction/global';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

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
export class ArtifactLoadDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() Visible = false;
  @Output() Close = new EventEmitter<ArtifactLoadResult | undefined>();

  // Tab state
  activeTab = 0; // 0 = Artifacts, 1 = Collections

  // Artifacts data
  artifacts: MJArtifactEntity[] = [];
  artifactVersions: MJArtifactVersionEntity[] = [];
  selectedArtifact: MJArtifactEntity | null = null;
  selectedVersion: MJArtifactVersionEntity | null = null;

  // Collections data
  collections: MJCollectionEntity[] = [];
  selectedCollection: MJCollectionEntity | null = null;
  collectionArtifacts: MJArtifactEntity[] = [];

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

  private get metadata() { return this.ProviderToUse; }
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();
  private cdr = inject(ChangeDetectorRef);

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
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const startRow = this.currentPage * this.pageSize;

      const result = await rv.RunView<MJArtifactEntity>({
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
      this.cdr.detectChanges();
    }
  }

  async loadCollections() {
    this.isLoadingCollections = true;
    this.cdr.detectChanges();
    try {
      const currentUserId = this.metadata.CurrentUser?.ID;
      if (!currentUserId) {
        this.collections = [];
        return;
      }

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJCollectionEntity>({
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
      this.cdr.detectChanges();
    }
  }

  async selectCollection(collection: MJCollectionEntity) {
    this.selectedCollection = collection;
    this.selectedArtifact = null;
    this.selectedVersion = null;
    this.artifactVersions = [];
    this.cdr.detectChanges();

    // Load artifacts in this collection
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJArtifactEntity>({
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
    } finally {
      this.cdr.detectChanges();
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
      const md = this.ProviderToUse;
      const schemaName = md.EntityByName("MJ: Users")?.SchemaName || "__mj";
      filters.push(`UserID IN (SELECT ID FROM ${schemaName}.vwUsers WHERE Email LIKE '%${this.userEmail.trim()}%')`);
    }

    return filters.length > 0 ? filters.join(' AND ') : '';
  }

  async selectArtifact(artifact: MJArtifactEntity) {
    this.selectedArtifact = artifact;
    this.selectedVersion = null;
    this.previewSpec = null;
    this.previewError = null;
    this.cdr.detectChanges();

    await this.loadVersions(artifact.ID);
  }

  async loadVersions(artifactId: string) {
    this.isLoadingVersions = true;
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJArtifactVersionEntity>({
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
      this.cdr.detectChanges();
    }
  }

  async selectVersion(version: MJArtifactVersionEntity) {
    this.selectedVersion = version;
    await this.loadPreview(version);
  }

  async loadPreview(version: MJArtifactVersionEntity) {
    try {
      this.previewError = null;

      const raw = version.Content ?? version.Configuration;
      if (!raw) {
        this.previewSpec = null;
        this.previewError = 'No content found in this version';
        return;
      }

      const spec = this.unwrapSpec(JSON.parse(raw));
      if (!spec) {
        this.previewSpec = null;
        this.previewError = 'Artifact content is not a recognized component spec';
        return;
      }

      const hasCode = typeof spec.code === 'string' && spec.code.trim().length > 0;
      const hasDeps = Array.isArray(spec.dependencies) && spec.dependencies.length > 0;
      const isRegistryRef = spec.location === 'registry' && !!spec.registry && !!spec.namespace && !!spec.name;
      if (!hasCode && !hasDeps && !isRegistryRef) {
        this.previewSpec = null;
        this.previewError = 'Artifact contains no component code, dependencies, or registry reference';
        return;
      }

      this.previewSpec = spec;
    } catch (error) {
      this.previewError = `Failed to parse: ${error}`;
      this.previewSpec = null;
    } finally {
      this.cdr.detectChanges();
    }
  }

  /**
   * Skip emits artifact content as a `SkipAPIAnalysisCompleteResponse` envelope whose
   * actual ComponentSpec lives at `componentOptions[0].option`. Older saves may put the
   * envelope in `Configuration`; newer saves put it in `Content`. Either field can also
   * contain a raw spec, so this helper handles both shapes.
   */
  private unwrapSpec(parsed: unknown): ComponentSpec | null {
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as { componentOptions?: Array<{ option?: ComponentSpec }> };
    if (Array.isArray(obj.componentOptions) && obj.componentOptions.length > 0 && obj.componentOptions[0]?.option) {
      return obj.componentOptions[0].option;
    }
    return parsed as ComponentSpec;
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
    this.Close.emit(undefined);
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

    this.Close.emit(result);
  }

  onTabSelect(index: number) {
    this.activeTab = index;
  }

  getArtifactsByTab(): MJArtifactEntity[] {
    return this.activeTab === 0 ? this.artifacts : this.collectionArtifacts;
  }

  getPreviewJSON(): string {
    return this.previewSpec ? JSON.stringify(this.previewSpec, null, 2) : '';
  }

  /** Case-insensitive UUID check whether an artifact is the currently selected artifact. */
  IsArtifactSelected(artifact: MJArtifactEntity): boolean {
    return UUIDsEqual(this.selectedArtifact?.ID, artifact.ID);
  }

  /** Case-insensitive UUID check whether a collection is the currently selected collection. */
  IsCollectionSelected(collection: MJCollectionEntity): boolean {
    return UUIDsEqual(this.selectedCollection?.ID, collection.ID);
  }

  /** Case-insensitive UUID check whether a version is the currently selected version. */
  IsVersionSelected(version: MJArtifactVersionEntity): boolean {
    return UUIDsEqual(this.selectedVersion?.ID, version.ID);
  }
}
