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
  ActiveTab = 0;

  /** @deprecated Use {@link ActiveTab}. */
  get activeTab() {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  set activeTab(value) {
    this.ActiveTab = value;
  } // 0 = Artifacts, 1 = Collections

  // Artifacts data
  Artifacts: MJArtifactEntity[] = [];

  /** @deprecated Use {@link Artifacts}. */
  get artifacts(): MJArtifactEntity[] {
    return this.Artifacts;
  }
  /** @deprecated Use {@link Artifacts}. */
  set artifacts(value: MJArtifactEntity[]) {
    this.Artifacts = value;
  }
  ArtifactVersions: MJArtifactVersionEntity[] = [];

  /** @deprecated Use {@link ArtifactVersions}. */
  get artifactVersions(): MJArtifactVersionEntity[] {
    return this.ArtifactVersions;
  }
  /** @deprecated Use {@link ArtifactVersions}. */
  set artifactVersions(value: MJArtifactVersionEntity[]) {
    this.ArtifactVersions = value;
  }
  SelectedArtifact: MJArtifactEntity | null = null;

  /** @deprecated Use {@link SelectedArtifact}. */
  get selectedArtifact(): MJArtifactEntity | null {
    return this.SelectedArtifact;
  }
  /** @deprecated Use {@link SelectedArtifact}. */
  set selectedArtifact(value: MJArtifactEntity | null) {
    this.SelectedArtifact = value;
  }
  SelectedVersion: MJArtifactVersionEntity | null = null;

  /** @deprecated Use {@link SelectedVersion}. */
  get selectedVersion(): MJArtifactVersionEntity | null {
    return this.SelectedVersion;
  }
  /** @deprecated Use {@link SelectedVersion}. */
  set selectedVersion(value: MJArtifactVersionEntity | null) {
    this.SelectedVersion = value;
  }

  // Collections data
  Collections: MJCollectionEntity[] = [];

  /** @deprecated Use {@link Collections}. */
  get collections(): MJCollectionEntity[] {
    return this.Collections;
  }
  /** @deprecated Use {@link Collections}. */
  set collections(value: MJCollectionEntity[]) {
    this.Collections = value;
  }
  SelectedCollection: MJCollectionEntity | null = null;

  /** @deprecated Use {@link SelectedCollection}. */
  get selectedCollection(): MJCollectionEntity | null {
    return this.SelectedCollection;
  }
  /** @deprecated Use {@link SelectedCollection}. */
  set selectedCollection(value: MJCollectionEntity | null) {
    this.SelectedCollection = value;
  }
  CollectionArtifacts: MJArtifactEntity[] = [];

  /** @deprecated Use {@link CollectionArtifacts}. */
  get collectionArtifacts(): MJArtifactEntity[] {
    return this.CollectionArtifacts;
  }
  /** @deprecated Use {@link CollectionArtifacts}. */
  set collectionArtifacts(value: MJArtifactEntity[]) {
    this.CollectionArtifacts = value;
  }

  // Search and filter
  SearchTerm = '';

  /** @deprecated Use {@link SearchTerm}. */
  get searchTerm() {
    return this.SearchTerm;
  }
  /** @deprecated Use {@link SearchTerm}. */
  set searchTerm(value) {
    this.SearchTerm = value;
  }
  SelectedArtifactType = '';

  /** @deprecated Use {@link SelectedArtifactType}. */
  get selectedArtifactType() {
    return this.SelectedArtifactType;
  }
  /** @deprecated Use {@link SelectedArtifactType}. */
  set selectedArtifactType(value) {
    this.SelectedArtifactType = value;
  }
  UserEmail = '';

  /** @deprecated Use {@link UserEmail}. */
  get userEmail() {
    return this.UserEmail;
  }
  /** @deprecated Use {@link UserEmail}. */
  set userEmail(value) {
    this.UserEmail = value;
  }

  // Paging
  CurrentPage = 0;

  /** @deprecated Use {@link CurrentPage}. */
  get currentPage() {
    return this.CurrentPage;
  }
  /** @deprecated Use {@link CurrentPage}. */
  set currentPage(value) {
    this.CurrentPage = value;
  }
  pageSize = 25;
  TotalArtifacts = 0;

  /** @deprecated Use {@link TotalArtifacts}. */
  get totalArtifacts() {
    return this.TotalArtifacts;
  }
  /** @deprecated Use {@link TotalArtifacts}. */
  set totalArtifacts(value) {
    this.TotalArtifacts = value;
  }
  HasMorePages = false;

  /** @deprecated Use {@link HasMorePages}. */
  get hasMorePages() {
    return this.HasMorePages;
  }
  /** @deprecated Use {@link HasMorePages}. */
  set hasMorePages(value) {
    this.HasMorePages = value;
  }

  // UI state
  isLoading = true;
  IsLoadingVersions = false;

  /** @deprecated Use {@link IsLoadingVersions}. */
  get isLoadingVersions() {
    return this.IsLoadingVersions;
  }
  /** @deprecated Use {@link IsLoadingVersions}. */
  set isLoadingVersions(value) {
    this.IsLoadingVersions = value;
  }
  IsLoadingCollections = false;

  /** @deprecated Use {@link IsLoadingCollections}. */
  get isLoadingCollections() {
    return this.IsLoadingCollections;
  }
  /** @deprecated Use {@link IsLoadingCollections}. */
  set isLoadingCollections(value) {
    this.IsLoadingCollections = value;
  }
  IsFilterPanelCollapsed = false;

  /** @deprecated Use {@link IsFilterPanelCollapsed}. */
  get isFilterPanelCollapsed() {
    return this.IsFilterPanelCollapsed;
  }
  /** @deprecated Use {@link IsFilterPanelCollapsed}. */
  set isFilterPanelCollapsed(value) {
    this.IsFilterPanelCollapsed = value;
  }

  // Preview
  PreviewSpec: ComponentSpec | null = null;

  /** @deprecated Use {@link PreviewSpec}. */
  get previewSpec(): ComponentSpec | null {
    return this.PreviewSpec;
  }
  /** @deprecated Use {@link PreviewSpec}. */
  set previewSpec(value: ComponentSpec | null) {
    this.PreviewSpec = value;
  }
  PreviewError: string | null = null;

  /** @deprecated Use {@link PreviewError}. */
  get previewError(): string | null {
    return this.PreviewError;
  }
  /** @deprecated Use {@link PreviewError}. */
  set previewError(value: string | null) {
    this.PreviewError = value;
  }
  ShowJsonPreview = false;

  /** @deprecated Use {@link ShowJsonPreview}. */
  get showJsonPreview() {
    return this.ShowJsonPreview;
  }
  /** @deprecated Use {@link ShowJsonPreview}. */
  set showJsonPreview(value) {
    this.ShowJsonPreview = value;
  }

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
      this.FilterArtifacts();
    });

    await Promise.all([
      this.LoadArtifacts(),
      this.LoadCollections()
    ]);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async LoadArtifacts() {
    this.isLoading = true;
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const startRow = this.CurrentPage * this.pageSize;

      const result = await rv.RunView<MJArtifactEntity>({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: this.buildArtifactFilter(),
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: this.pageSize,
        StartRow: startRow,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.Artifacts = result.Results;
        this.TotalArtifacts = result.TotalRowCount || 0;
        const totalPages = Math.ceil(this.TotalArtifacts / this.pageSize);
        this.HasMorePages = this.CurrentPage < totalPages - 1;
      }
    } catch (error) {
      console.error('Error loading artifacts:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link LoadArtifacts}. */
  async loadArtifacts() {
    return this.LoadArtifacts();
  }

  async LoadCollections() {
    this.IsLoadingCollections = true;
    this.cdr.detectChanges();
    try {
      const currentUserId = this.metadata.CurrentUser?.ID;
      if (!currentUserId) {
        this.Collections = [];
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
        this.Collections = result.Results || [];
      }
    } catch (error) {
      console.error('Error loading collections:', error);
      this.Collections = [];
    } finally {
      this.IsLoadingCollections = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link LoadCollections}. */
  async loadCollections() {
    return this.LoadCollections();
  }

  async SelectCollection(collection: MJCollectionEntity) {
    this.SelectedCollection = collection;
    this.SelectedArtifact = null;
    this.SelectedVersion = null;
    this.ArtifactVersions = [];
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
        this.CollectionArtifacts = result.Results || [];
      }
    } catch (error) {
      console.error('Error loading collection artifacts:', error);
      this.CollectionArtifacts = [];
    } finally {
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link SelectCollection}. */
  async selectCollection(collection: MJCollectionEntity) {
    return this.SelectCollection(collection);
  }

  private buildArtifactFilter(): string {
    const filters: string[] = [];

    // Always filter to Component type by default
    if (this.SelectedArtifactType) {
      filters.push(`TypeID IN (SELECT ID FROM __mj.vwArtifactTypes WHERE Name = '${this.SelectedArtifactType}')`);
    } else {
      filters.push(`TypeID IN (SELECT ID FROM __mj.vwArtifactTypes WHERE Name = 'Component')`);
    }

    // Search filter
    if (this.SearchTerm?.trim()) {
      const term = this.SearchTerm.toLowerCase();
      filters.push(`(Name LIKE '%${term}%' OR Description LIKE '%${term}%')`);
    }

    // User email filter
    if (this.UserEmail?.trim()) {
      const md = this.ProviderToUse;
      const schemaName = md.EntityByName("MJ: Users")?.SchemaName || "__mj";
      filters.push(`UserID IN (SELECT ID FROM ${schemaName}.vwUsers WHERE Email LIKE '%${this.UserEmail.trim()}%')`);
    }

    return filters.length > 0 ? filters.join(' AND ') : '';
  }

  async SelectArtifact(artifact: MJArtifactEntity) {
    this.SelectedArtifact = artifact;
    this.SelectedVersion = null;
    this.PreviewSpec = null;
    this.PreviewError = null;
    this.cdr.detectChanges();

    await this.LoadVersions(artifact.ID);
  }

  /** @deprecated Use {@link SelectArtifact}. */
  async selectArtifact(artifact: MJArtifactEntity) {
    return this.SelectArtifact(artifact);
  }

  async LoadVersions(artifactId: string) {
    this.IsLoadingVersions = true;
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
        this.ArtifactVersions = result.Results;

        // Auto-select the latest version
        if (this.ArtifactVersions.length > 0) {
          await this.SelectVersion(this.ArtifactVersions[0]);
        }
      }
    } catch (error) {
      console.error('Error loading versions:', error);
      this.ArtifactVersions = [];
    } finally {
      this.IsLoadingVersions = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link LoadVersions}. */
  async loadVersions(artifactId: string) {
    return this.LoadVersions(artifactId);
  }

  async SelectVersion(version: MJArtifactVersionEntity) {
    this.SelectedVersion = version;
    await this.LoadPreview(version);
  }

  /** @deprecated Use {@link SelectVersion}. */
  async selectVersion(version: MJArtifactVersionEntity) {
    return this.SelectVersion(version);
  }

  async LoadPreview(version: MJArtifactVersionEntity) {
    try {
      this.PreviewError = null;

      const raw = version.Content ?? version.Configuration;
      if (!raw) {
        this.PreviewSpec = null;
        this.PreviewError = 'No content found in this version';
        return;
      }

      const spec = this.unwrapSpec(JSON.parse(raw));
      if (!spec) {
        this.PreviewSpec = null;
        this.PreviewError = 'Artifact content is not a recognized component spec';
        return;
      }

      const hasCode = typeof spec.code === 'string' && spec.code.trim().length > 0;
      const hasDeps = Array.isArray(spec.dependencies) && spec.dependencies.length > 0;
      const isRegistryRef = spec.location === 'registry' && !!spec.registry && !!spec.namespace && !!spec.name;
      if (!hasCode && !hasDeps && !isRegistryRef) {
        this.PreviewSpec = null;
        this.PreviewError = 'Artifact contains no component code, dependencies, or registry reference';
        return;
      }

      this.PreviewSpec = spec;
    } catch (error) {
      this.PreviewError = `Failed to parse: ${error}`;
      this.PreviewSpec = null;
    } finally {
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link LoadPreview}. */
  async loadPreview(version: MJArtifactVersionEntity) {
    return this.LoadPreview(version);
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

  async FilterArtifacts() {
    this.CurrentPage = 0;
    await this.LoadArtifacts();
  }

  /** @deprecated Use {@link FilterArtifacts}. */
  async filterArtifacts() {
    return this.FilterArtifacts();
  }

  OnSearchInput() {
    this.searchSubject.next(this.SearchTerm);
  }

  /** @deprecated Use {@link OnSearchInput}. */
  onSearchInput() {
    return this.OnSearchInput();
  }

  OnArtifactTypeChange() {
    this.SelectedArtifact = null;
    this.SelectedVersion = null;
    this.ArtifactVersions = [];
    this.FilterArtifacts();
  }

  /** @deprecated Use {@link OnArtifactTypeChange}. */
  onArtifactTypeChange() {
    return this.OnArtifactTypeChange();
  }

  async NextPage() {
    if (this.HasMorePages) {
      this.CurrentPage++;
      await this.LoadArtifacts();
    }
  }

  /** @deprecated Use {@link NextPage}. */
  async nextPage() {
    return this.NextPage();
  }

  async PreviousPage() {
    if (this.CurrentPage > 0) {
      this.CurrentPage--;
      await this.LoadArtifacts();
    }
  }

  /** @deprecated Use {@link PreviousPage}. */
  async previousPage() {
    return this.PreviousPage();
  }

  CanGoNext(): boolean {
    return this.HasMorePages;
  }

  /** @deprecated Use {@link CanGoNext}. */
  canGoNext(): boolean {
    return this.CanGoNext();
  }

  CanGoPrevious(): boolean {
    return this.CurrentPage > 0;
  }

  /** @deprecated Use {@link CanGoPrevious}. */
  canGoPrevious(): boolean {
    return this.CanGoPrevious();
  }

  GetTotalPages(): number {
    return Math.ceil(this.TotalArtifacts / this.pageSize);
  }

  /** @deprecated Use {@link GetTotalPages}. */
  getTotalPages(): number {
    return this.GetTotalPages();
  }

  ToggleFilterPanel() {
    this.IsFilterPanelCollapsed = !this.IsFilterPanelCollapsed;
  }

  /** @deprecated Use {@link ToggleFilterPanel}. */
  toggleFilterPanel() {
    return this.ToggleFilterPanel();
  }

  GetActiveFilterCount(): number {
    let count = 0;
    if (this.SearchTerm?.trim()) count++;
    if (this.SelectedArtifactType) count++;
    if (this.UserEmail?.trim()) count++;
    return count;
  }

  /** @deprecated Use {@link GetActiveFilterCount}. */
  getActiveFilterCount(): number {
    return this.GetActiveFilterCount();
  }

  CanLoad(): boolean {
    return this.SelectedArtifact !== null &&
           this.SelectedVersion !== null &&
           this.PreviewSpec !== null;
  }

  /** @deprecated Use {@link CanLoad}. */
  canLoad(): boolean {
    return this.CanLoad();
  }

  cancel() {
    this.Close.emit(undefined);
  }

  load() {
    if (!this.CanLoad()) return;

    const result: ArtifactLoadResult = {
      spec: this.PreviewSpec!,
      artifactID: this.SelectedArtifact!.ID,
      versionID: this.SelectedVersion!.ID,
      versionNumber: this.SelectedVersion!.VersionNumber,
      artifactName: this.SelectedArtifact!.Name
    };

    this.Close.emit(result);
  }

  OnTabSelect(index: number) {
    this.ActiveTab = index;
  }

  /** @deprecated Use {@link OnTabSelect}. */
  onTabSelect(index: number) {
    return this.OnTabSelect(index);
  }

  GetArtifactsByTab(): MJArtifactEntity[] {
    return this.ActiveTab === 0 ? this.Artifacts : this.CollectionArtifacts;
  }

  /** @deprecated Use {@link GetArtifactsByTab}. */
  getArtifactsByTab(): MJArtifactEntity[] {
    return this.GetArtifactsByTab();
  }

  GetPreviewJSON(): string {
    return this.PreviewSpec ? JSON.stringify(this.PreviewSpec, null, 2) : '';
  }

  /** @deprecated Use {@link GetPreviewJSON}. */
  getPreviewJSON(): string {
    return this.GetPreviewJSON();
  }

  /** Case-insensitive UUID check whether an artifact is the currently selected artifact. */
  IsArtifactSelected(artifact: MJArtifactEntity): boolean {
    return UUIDsEqual(this.SelectedArtifact?.ID, artifact.ID);
  }

  /** Case-insensitive UUID check whether a collection is the currently selected collection. */
  IsCollectionSelected(collection: MJCollectionEntity): boolean {
    return UUIDsEqual(this.SelectedCollection?.ID, collection.ID);
  }

  /** Case-insensitive UUID check whether a version is the currently selected version. */
  IsVersionSelected(version: MJArtifactVersionEntity): boolean {
    return UUIDsEqual(this.SelectedVersion?.ID, version.ID);
  }
}
