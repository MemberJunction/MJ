import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, inject } from '@angular/core';
import { RunView, UserInfo } from '@memberjunction/core';
import { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

export interface ArtifactSelectionResult {
  artifact: MJArtifactEntity;
  action: 'new-version' | 'update-version';
  versionToUpdate?: MJArtifactVersionEntity;
}

@Component({
  standalone: false,
  selector: 'app-artifact-selection-dialog',
  templateUrl: './artifact-selection-dialog.component.html',
  styleUrl: './artifact-selection-dialog.component.css'
})
export class ArtifactSelectionDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() Visible = false;
  @Output() Close = new EventEmitter<ArtifactSelectionResult | undefined>();

  // Data
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

  // Paging State
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

  // UI State
  isLoading = true;
  SearchTerm = '';

  /** @deprecated Use {@link SearchTerm}. */
  get searchTerm() {
    return this.SearchTerm;
  }
  /** @deprecated Use {@link SearchTerm}. */
  set searchTerm(value) {
    this.SearchTerm = value;
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
  SelectedArtifactType = '';

  /** @deprecated Use {@link SelectedArtifactType}. */
  get selectedArtifactType() {
    return this.SelectedArtifactType;
  }
  /** @deprecated Use {@link SelectedArtifactType}. */
  set selectedArtifactType(value) {
    this.SelectedArtifactType = value;
  }
  ShowNewArtifactForm = false;

  /** @deprecated Use {@link ShowNewArtifactForm}. */
  get showNewArtifactForm() {
    return this.ShowNewArtifactForm;
  }
  /** @deprecated Use {@link ShowNewArtifactForm}. */
  set showNewArtifactForm(value) {
    this.ShowNewArtifactForm = value;
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


  // Selection State
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
  VersionAction: 'new' | 'update' = 'new';

  /** @deprecated Use {@link VersionAction}. */
  get versionAction(): 'new' | 'update' {
    return this.VersionAction;
  }
  /** @deprecated Use {@link VersionAction}. */
  set versionAction(value: 'new' | 'update') {
    this.VersionAction = value;
  }
  
  // New Artifact Form
  NewArtifactName = '';

  /** @deprecated Use {@link NewArtifactName}. */
  get newArtifactName() {
    return this.NewArtifactName;
  }
  /** @deprecated Use {@link NewArtifactName}. */
  set newArtifactName(value) {
    this.NewArtifactName = value;
  }
  NewArtifactDescription = '';

  /** @deprecated Use {@link NewArtifactDescription}. */
  get newArtifactDescription() {
    return this.NewArtifactDescription;
  }
  /** @deprecated Use {@link NewArtifactDescription}. */
  set newArtifactDescription(value) {
    this.NewArtifactDescription = value;
  }
  
  private get metadata() { return this.ProviderToUse; }
  private currentUser: UserInfo | null = null;
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  private notificationService = inject(MJNotificationService);
  private confirmService = inject(MJConfirmService);
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
    
    await this.FilterArtifacts();
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

      // Calculate StartRow for server-side paging
      const startRow = this.CurrentPage * this.pageSize;

      // Load artifacts with paging
      const result = await rv.RunView<MJArtifactEntity>({
        ExtraFilter: this._artifactFilter,
        EntityName: 'MJ: Artifacts',
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: this.pageSize,
        StartRow: startRow,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.Artifacts = result.Results;

        // Calculate total pages using TotalRowCount from server
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

  private _artifactFilter: string | undefined= undefined;
  public async FilterArtifacts() {
    // Reset to first page when filters change
    this.CurrentPage = 0;
    
    const filters: string[] = [];
    
    // Filter by search term
    if (this.SearchTerm?.trim()) {
      const term = this.SearchTerm.toLowerCase();
      filters.push(`(Name LIKE '%${term}%' OR Description LIKE '%${term}%')`);
    }
    
    // Filter by artifact type
    if (this.SelectedArtifactType) {
      filters.push(`ArtifactTypeID IN (SELECT ID FROM __mj.vwArtifactTypes WHERE Name = '${this.SelectedArtifactType}')`);
    }
    
    // Filter by user email if provided
    if (this.UserEmail?.trim()) {
      const md = this.ProviderToUse;
      const schemaName = md.EntityByName("MJ: Users")?.SchemaName || "__mj";
      const userFilter = `UserID IN (SELECT ID FROM ${schemaName}.vwUsers WHERE Email LIKE '%${this.UserEmail.trim()}%')`;
      filters.push(userFilter);
    }
    
    // Combine all filters
    this._artifactFilter = filters.length > 0 ? filters.join(' AND ') : undefined;

    await this.LoadArtifacts();
  }

  /** @deprecated Use {@link FilterArtifacts}. */
  public async filterArtifacts() {
    return this.FilterArtifacts();
  }

  SelectCreateNew() {
    this.ShowNewArtifactForm = true;
    this.SelectedArtifact = null;
    this.SelectedVersion = null;
  }

  /** @deprecated Use {@link SelectCreateNew}. */
  selectCreateNew() {
    return this.SelectCreateNew();
  }

  async SelectArtifact(artifact: MJArtifactEntity) {
    this.SelectedArtifact = artifact;
    this.ShowNewArtifactForm = false;
    this.VersionAction = 'new';
    this.SelectedVersion = null;
    this.cdr.detectChanges();

    // Load versions for this artifact
    await this.LoadVersions(artifact.ID);
  }

  /** @deprecated Use {@link SelectArtifact}. */
  async selectArtifact(artifact: MJArtifactEntity) {
    return this.SelectArtifact(artifact);
  }

  async LoadVersions(artifactId: string) {
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
      }
    } catch (error) {
      console.error('Error loading versions:', error);
      this.ArtifactVersions = [];
    } finally {
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link LoadVersions}. */
  async loadVersions(artifactId: string) {
    return this.LoadVersions(artifactId);
  }

  GetNextVersionNumber(): number {
    if (this.ArtifactVersions.length === 0) return 1;
    return Math.max(...this.ArtifactVersions.map(v => v.VersionNumber)) + 1;
  }

  /** @deprecated Use {@link GetNextVersionNumber}. */
  getNextVersionNumber(): number {
    return this.GetNextVersionNumber();
  }

  // Paging methods
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

  OnSearchInput() {
    this.searchSubject.next(this.SearchTerm);
  }

  /** @deprecated Use {@link OnSearchInput}. */
  onSearchInput() {
    return this.OnSearchInput();
  }

  OnArtifactTypeChange() {
    // Clear selected artifact when type changes
    this.SelectedArtifact = null;
    this.SelectedVersion = null;
    this.ArtifactVersions = [];
    this.FilterArtifacts();
  }

  /** @deprecated Use {@link OnArtifactTypeChange}. */
  onArtifactTypeChange() {
    return this.OnArtifactTypeChange();
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

  CanSave(): boolean {
    if (this.ShowNewArtifactForm) {
      return this.NewArtifactName.trim().length > 0;
    }
    
    if (!this.SelectedArtifact) return false;
    
    if (this.VersionAction === 'update') {
      return this.SelectedVersion !== null;
    }
    
    return true;
  }

  /** @deprecated Use {@link CanSave}. */
  canSave(): boolean {
    return this.CanSave();
  }

  GetSaveButtonText(): string {
    if (this.ShowNewArtifactForm) {
      return 'Create & Save';
    }

    if (this.VersionAction === 'update' && this.SelectedVersion) {
      return `Update Version ${this.SelectedVersion.VersionNumber}`;
    }

    return `Save as Version ${this.GetNextVersionNumber()}`;
  }

  /** @deprecated Use {@link GetSaveButtonText}. */
  getSaveButtonText(): string {
    return this.GetSaveButtonText();
  }

  cancel() {
    this.Close.emit(undefined);
  }

  async save() {
    if (!this.CanSave()) return;
    
    // Handle new artifact creation
    if (this.ShowNewArtifactForm) {
      const newArtifact = await this.createNewArtifact();
      if (newArtifact) {
        const result: ArtifactSelectionResult = {
          artifact: newArtifact,
          action: 'new-version'
        };
        this.Close.emit(result);
      }
      return;
    }
    
    // Handle existing artifact selection
    if (this.SelectedArtifact) {
      const result: ArtifactSelectionResult = {
        artifact: this.SelectedArtifact,
        action: this.VersionAction === 'update' ? 'update-version' : 'new-version',
        versionToUpdate: this.VersionAction === 'update' ? this.SelectedVersion! : undefined
      };
      
      // If updating, show confirmation
      if (this.VersionAction === 'update') {
        const confirmed = await this.confirmService.Confirm({ title: 'Overwrite version', message: `Overwrite version ${this.SelectedVersion!.VersionNumber}?`, detail: 'This action cannot be undone.' });
        if (!confirmed) return;
      }

      this.Close.emit(result);
    }
  }

  private async createNewArtifact(): Promise<MJArtifactEntity | null> {
    try {
      const artifact = await this.metadata.GetEntityObject<MJArtifactEntity>('MJ: Artifacts');
      artifact.Name = this.NewArtifactName;
      artifact.Description = this.NewArtifactDescription || null;

      // Get Component artifact type
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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

  /** Case-insensitive UUID check whether an artifact is the currently selected artifact. */
  IsArtifactSelected(artifact: MJArtifactEntity): boolean {
    return UUIDsEqual(this.SelectedArtifact?.ID, artifact.ID);
  }

  /** Case-insensitive UUID check whether a version is the currently selected version. */
  IsVersionSelected(version: MJArtifactVersionEntity): boolean {
    return UUIDsEqual(this.SelectedVersion?.ID, version.ID);
  }
}