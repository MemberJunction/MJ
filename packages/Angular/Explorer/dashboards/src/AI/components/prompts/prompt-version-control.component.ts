import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CompositeKey, LogError, LogStatus, Metadata } from '@memberjunction/core';
import { MJRecordChangeEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

interface PromptVersion {
  id: string;
  version: number;
  changedAt: Date;
  changedBy: string;
  changeType: 'Create' | 'Update' | 'Delete';
  changeSource: 'Internal' | 'External';
  changesDescription: string;
  changesJSON: any;
  fullRecordJSON: any;
  templateContent?: MJTemplateContentEntity;
  isActive: boolean;
  canRestore: boolean;
}

interface VersionComparison {
  fromVersion: PromptVersion;
  toVersion: PromptVersion;
  differences: FieldDifference[];
}

interface FieldDifference {
  fieldName: string;
  displayName: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'modified' | 'removed';
  isTemplate: boolean;
}

@Component({
  standalone: false,
  selector: 'app-prompt-version-control',
  templateUrl: './prompt-version-control.component.html',
  styleUrls: ['./prompt-version-control.component.css']
})
export class PromptVersionControlComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() Prompt: MJAIPromptEntityExtended | null = null;

  /** @deprecated Use {@link Prompt}. */
  @Input() set prompt(value: MJAIPromptEntityExtended | null) {
    this.Prompt = value;
  }
  /** @deprecated Use {@link Prompt}. */
  get prompt(): MJAIPromptEntityExtended | null {
    return this.Prompt;
  }
  @Input() AutoLoad = true;

  /** @deprecated Use {@link AutoLoad}. */
  @Input() set autoLoad(value: PromptVersionControlComponent['AutoLoad']) {
    this.AutoLoad = value;
  }
  /** @deprecated Use {@link AutoLoad}. */
  get autoLoad(): PromptVersionControlComponent['AutoLoad'] {
    return this.AutoLoad;
  }
  @Input() ShowRestoreActions = true;

  /** @deprecated Use {@link ShowRestoreActions}. */
  @Input() set showRestoreActions(value: PromptVersionControlComponent['ShowRestoreActions']) {
    this.ShowRestoreActions = value;
  }
  /** @deprecated Use {@link ShowRestoreActions}. */
  get showRestoreActions(): PromptVersionControlComponent['ShowRestoreActions'] {
    return this.ShowRestoreActions;
  }
  @Input() ShowComparison = true;

  /** @deprecated Use {@link ShowComparison}. */
  @Input() set showComparison(value: PromptVersionControlComponent['ShowComparison']) {
    this.ShowComparison = value;
  }
  /** @deprecated Use {@link ShowComparison}. */
  get showComparison(): PromptVersionControlComponent['ShowComparison'] {
    return this.ShowComparison;
  }
  @Input() MaxVersions = 50;

  /** @deprecated Use {@link MaxVersions}. */
  @Input() set maxVersions(value: PromptVersionControlComponent['MaxVersions']) {
    this.MaxVersions = value;
  }
  /** @deprecated Use {@link MaxVersions}. */
  get maxVersions(): PromptVersionControlComponent['MaxVersions'] {
    return this.MaxVersions;
  }
  
  @Output() VersionSelected = new EventEmitter<PromptVersion>();

  /**
   * @deprecated Use {@link VersionSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (versionSelected) keeps working. Must stay AFTER VersionSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() versionSelected = this.VersionSelected;
  @Output() VersionRestored = new EventEmitter<MJAIPromptEntityExtended>();

  /**
   * @deprecated Use {@link VersionRestored}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (versionRestored) keeps working. Must stay AFTER VersionRestored: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() versionRestored = this.VersionRestored;
  @Output() VersionCompared = new EventEmitter<VersionComparison>();

  /**
   * @deprecated Use {@link VersionCompared}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (versionCompared) keeps working. Must stay AFTER VersionCompared: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() versionCompared = this.VersionCompared;
  
  // Data
  public Versions: PromptVersion[] = [];

  /** @deprecated Use {@link Versions}. */
  public get versions(): PromptVersion[] {
    return this.Versions;
  }
  /** @deprecated Use {@link Versions}. */
  public set versions(value: PromptVersion[]) {
    this.Versions = value;
  }
  public RecordChanges: MJRecordChangeEntity[] = [];

  /** @deprecated Use {@link RecordChanges}. */
  public get recordChanges(): MJRecordChangeEntity[] {
    return this.RecordChanges;
  }
  /** @deprecated Use {@link RecordChanges}. */
  public set recordChanges(value: MJRecordChangeEntity[]) {
    this.RecordChanges = value;
  }
  public TemplateContents: Map<string, MJTemplateContentEntity> = new Map();

  /** @deprecated Use {@link TemplateContents}. */
  public get templateContents(): Map<string, MJTemplateContentEntity> {
    return this.TemplateContents;
  }
  /** @deprecated Use {@link TemplateContents}. */
  public set templateContents(value: Map<string, MJTemplateContentEntity>) {
    this.TemplateContents = value;
  }
  public AvailablePrompts: MJAIPromptEntityExtended[] = [];

  /** @deprecated Use {@link AvailablePrompts}. */
  public get availablePrompts(): MJAIPromptEntityExtended[] {
    return this.AvailablePrompts;
  }
  /** @deprecated Use {@link AvailablePrompts}. */
  public set availablePrompts(value: MJAIPromptEntityExtended[]) {
    this.AvailablePrompts = value;
  }
  public FilteredAvailablePrompts: MJAIPromptEntityExtended[] = [];

  /** @deprecated Use {@link FilteredAvailablePrompts}. */
  public get filteredAvailablePrompts(): MJAIPromptEntityExtended[] {
    return this.FilteredAvailablePrompts;
  }
  /** @deprecated Use {@link FilteredAvailablePrompts}. */
  public set filteredAvailablePrompts(value: MJAIPromptEntityExtended[]) {
    this.FilteredAvailablePrompts = value;
  }
  
  // UI State
  public isLoading = false;
  public LoadingMessage = '';

  /** @deprecated Use {@link LoadingMessage}. */
  public get loadingMessage() {
    return this.LoadingMessage;
  }
  /** @deprecated Use {@link LoadingMessage}. */
  public set loadingMessage(value) {
    this.LoadingMessage = value;
  }
  public error: string | null = null;
  public CurrentView: 'timeline' | 'comparison' | 'details' = 'timeline';

  /** @deprecated Use {@link CurrentView}. */
  public get currentView(): 'timeline' | 'comparison' | 'details' {
    return this.CurrentView;
  }
  /** @deprecated Use {@link CurrentView}. */
  public set currentView(value: 'timeline' | 'comparison' | 'details') {
    this.CurrentView = value;
  }
  public SelectedVersion: PromptVersion | null = null;

  /** @deprecated Use {@link SelectedVersion}. */
  public get selectedVersion(): PromptVersion | null {
    return this.SelectedVersion;
  }
  /** @deprecated Use {@link SelectedVersion}. */
  public set selectedVersion(value: PromptVersion | null) {
    this.SelectedVersion = value;
  }
  public CompareFromVersion: PromptVersion | null = null;

  /** @deprecated Use {@link CompareFromVersion}. */
  public get compareFromVersion(): PromptVersion | null {
    return this.CompareFromVersion;
  }
  /** @deprecated Use {@link CompareFromVersion}. */
  public set compareFromVersion(value: PromptVersion | null) {
    this.CompareFromVersion = value;
  }
  public CompareToVersion: PromptVersion | null = null;

  /** @deprecated Use {@link CompareToVersion}. */
  public get compareToVersion(): PromptVersion | null {
    return this.CompareToVersion;
  }
  /** @deprecated Use {@link CompareToVersion}. */
  public set compareToVersion(value: PromptVersion | null) {
    this.CompareToVersion = value;
  }
  public ComparisonResult: VersionComparison | null = null;

  /** @deprecated Use {@link ComparisonResult}. */
  public get comparisonResult(): VersionComparison | null {
    return this.ComparisonResult;
  }
  /** @deprecated Use {@link ComparisonResult}. */
  public set comparisonResult(value: VersionComparison | null) {
    this.ComparisonResult = value;
  }
  
  // Filtering and sorting
  public FilterBy: 'all' | 'updates' | 'major' | 'template' = 'all';

  /** @deprecated Use {@link FilterBy}. */
  public get filterBy(): 'all' | 'updates' | 'major' | 'template' {
    return this.FilterBy;
  }
  /** @deprecated Use {@link FilterBy}. */
  public set filterBy(value: 'all' | 'updates' | 'major' | 'template') {
    this.FilterBy = value;
  }
  public SortDirection: 'asc' | 'desc' = 'desc';

  /** @deprecated Use {@link SortDirection}. */
  public get sortDirection(): 'asc' | 'desc' {
    return this.SortDirection;
  }
  /** @deprecated Use {@link SortDirection}. */
  public set sortDirection(value: 'asc' | 'desc') {
    this.SortDirection = value;
  }
  public SearchTerm$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link SearchTerm$}. */
  public get searchTerm$() {
    return this.SearchTerm$;
  }
  /** @deprecated Use {@link SearchTerm$}. */
  public set searchTerm$(value) {
    this.SearchTerm$ = value;
  }
  public PromptSearchTerm$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link PromptSearchTerm$}. */
  public get promptSearchTerm$() {
    return this.PromptSearchTerm$;
  }
  /** @deprecated Use {@link PromptSearchTerm$}. */
  public set promptSearchTerm$(value) {
    this.PromptSearchTerm$ = value;
  }
  public ShowSystemChanges = false;

  /** @deprecated Use {@link ShowSystemChanges}. */
  public get showSystemChanges() {
    return this.ShowSystemChanges;
  }
  /** @deprecated Use {@link ShowSystemChanges}. */
  public set showSystemChanges(value) {
    this.ShowSystemChanges = value;
  }
  
  // Timeline configuration
  public TimelineConfig = {
    showThumbnails: true,
    showDiffs: true,
    compactMode: false,
    groupByDate: true
  };

  /** @deprecated Use {@link TimelineConfig}. */
  public get timelineConfig() {
    return this.TimelineConfig;
  }
  /** @deprecated Use {@link TimelineConfig}. */
  public set timelineConfig(value) {
    this.TimelineConfig = value;
  }
  
  private destroy$ = new Subject<void>();
  
  constructor(private notificationService: MJNotificationService, private confirmService: MJConfirmService) { super(); }
  
  ngOnInit(): void {
    this.loadAvailablePrompts();
    this.setupPromptFiltering();
    
    if (this.AutoLoad && this.Prompt) {
      this.LoadVersionHistory();
    }
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  public async LoadVersionHistory(): Promise<void> {
    if (!this.Prompt) {
      this.error = 'No prompt specified for version history';
      return;
    }
    
    try {
      this.isLoading = true;
      this.error = null;
      this.LoadingMessage = 'Loading version history...';
      
      const md = this.ProviderToUse;
      const primaryKey = CompositeKey.FromID(this.Prompt.ID); // first-pk-ok: this.prompt is a typed MJAIPromptEntityExtended — AI Prompts is a core entity keyed by ID
      
      // Get record changes using the new method (GetRecordChanges is on Metadata, not IMetadataProvider)
      const mdForChanges = md as unknown as Metadata;
      this.RecordChanges = await mdForChanges.GetRecordChanges<MJRecordChangeEntity>('MJ: AI Prompts', primaryKey);
      
      if (this.RecordChanges.length === 0) {
        this.Versions = [];
        LogStatus(`No version history found for prompt: ${this.Prompt.Name}`);
        return;
      }
      
      // Load template contents for versions that have template changes
      await this.loadTemplateContents();
      
      // Process record changes into version objects
      this.processRecordChanges();
      
      // Apply current filters
      this.applyFilters();
      
      LogStatus(`Loaded ${this.Versions.length} versions for prompt: ${this.Prompt.Name}`);
      
    } catch (error) {
      this.error = 'Failed to load version history. Please try again.';
      LogError('Error loading prompt version history', undefined, error);
    } finally {
      this.isLoading = false;
    }
  }

  /** @deprecated Use {@link LoadVersionHistory}. */
  public async loadVersionHistory(): Promise<void> {
    return this.LoadVersionHistory();
  }
  
  private async loadTemplateContents(): Promise<void> {
    const templateIds = new Set<string>();
    
    // Extract template IDs from record changes
    this.RecordChanges.forEach(change => {
      try {
        const fullRecord = JSON.parse(change.FullRecordJSON);
        if (fullRecord.TemplateID) {
          templateIds.add(fullRecord.TemplateID);
        }
        
        // Also check changes JSON for template changes
        if (change.ChangesJSON) {
          const changes = JSON.parse(change.ChangesJSON);
          if (changes.TemplateID && changes.TemplateID.newValue) {
            templateIds.add(changes.TemplateID.newValue);
          }
          if (changes.TemplateID && changes.TemplateID.oldValue) {
            templateIds.add(changes.TemplateID.oldValue);
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });
    
    // Load template content entities
    if (templateIds.size > 0) {
      this.LoadingMessage = 'Loading template content history...';
      
      // Note: We would need a way to get historical template content
      // For now, we'll get current template content and note this limitation
      const md = this.ProviderToUse;
      for (const templateId of templateIds) {
        try {
          const templateContent = await md.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents', md.CurrentUser);
          const loaded = await templateContent.Load(templateId);
          if (loaded) {
            this.TemplateContents.set(templateId, templateContent);
          }
        } catch (e) {
          // Template content might not exist anymore
          LogError(`Failed to load template content for ID: ${templateId}`, undefined, e);
        }
      }
    }
  }
  
  private processRecordChanges(): void {
    this.Versions = this.RecordChanges.map((change, index) => {
      let templateContent: MJTemplateContentEntity | undefined;
      
      try {
        const fullRecord = JSON.parse(change.FullRecordJSON);
        if (fullRecord.TemplateID) {
          templateContent = this.TemplateContents.get(fullRecord.TemplateID);
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      const version: PromptVersion = {
        id: change.ID,
        version: this.RecordChanges.length - index, // Version number (newest = highest)
        changedAt: new Date(change.ChangedAt),
        changedBy: change.User || 'Unknown',
        changeType: change.Type as 'Create' | 'Update' | 'Delete',
        changeSource: change.Source as 'Internal' | 'External',
        changesDescription: change.ChangesDescription,
        changesJSON: this.safeParseJSON(change.ChangesJSON),
        fullRecordJSON: this.safeParseJSON(change.FullRecordJSON),
        templateContent,
        isActive: index === 0, // Most recent version is active
        canRestore: index > 0 && change.Type !== 'Delete' // Can restore if not current and not deleted
      };
      
      return version;
    });
  }
  
  private safeParseJSON(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return null;
    }
  }
  
  private applyFilters(): void {
    let filtered = [...this.Versions];
    
    // Apply filter by type
    switch (this.FilterBy) {
      case 'updates':
        filtered = filtered.filter(v => v.changeType === 'Update');
        break;
      case 'major':
        filtered = filtered.filter(v => this.isMajorChange(v));
        break;
      case 'template':
        filtered = filtered.filter(v => this.hasTemplateChanges(v));
        break;
    }
    
    // Apply system changes filter
    if (!this.ShowSystemChanges) {
      filtered = filtered.filter(v => v.changeSource !== 'External');
    }
    
    // Apply search term
    const searchTerm = this.SearchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(v => 
        v.changesDescription.toLowerCase().includes(searchTerm) ||
        v.changedBy.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      const comparison = a.changedAt.getTime() - b.changedAt.getTime();
      return this.SortDirection === 'desc' ? -comparison : comparison;
    });
    
    this.Versions = filtered;
  }
  
  private isMajorChange(version: PromptVersion): boolean {
    if (!version.changesJSON) return false;
    
    const majorFields = ['Name', 'Status', 'TemplateID', 'CategoryID', 'TypeID'];
    return majorFields.some(field => version.changesJSON[field]);
  }
  
  private hasTemplateChanges(version: PromptVersion): boolean {
    if (!version.changesJSON) return false;
    return !!version.changesJSON.TemplateID;
  }
  
  public OnVersionSelect(version: PromptVersion): void {
    this.SelectedVersion = version;
    this.VersionSelected.emit(version);
  }

  /** @deprecated Use {@link OnVersionSelect}. */
  public onVersionSelect(version: PromptVersion): void {
    return this.OnVersionSelect(version);
  }
  
  public OnVersionRestore(version: PromptVersion): Promise<void> {
    return this.RestoreVersion(version);
  }

  /** @deprecated Use {@link OnVersionRestore}. */
  public onVersionRestore(version: PromptVersion): Promise<void> {
    return this.OnVersionRestore(version);
  }
  
  public GetObjectKeys(obj: any): string[] {
    return Object.keys(obj || {});
  }

  /** @deprecated Use {@link GetObjectKeys}. */
  public getObjectKeys(obj: any): string[] {
    return this.GetObjectKeys(obj);
  }

  public GetFieldDisplayNamePublic(fieldName: string): string {
    return this.getFieldDisplayName(fieldName);
  }

  /** @deprecated Use {@link GetFieldDisplayNamePublic}. */
  public getFieldDisplayNamePublic(fieldName: string): string {
    return this.GetFieldDisplayNamePublic(fieldName);
  }

  public GenerateComparisonPublic(): void {
    this.generateComparison();
  }

  /** @deprecated Use {@link GenerateComparisonPublic}. */
  public generateComparisonPublic(): void {
    return this.GenerateComparisonPublic();
  }

  public ApplyFiltersPublic(): void {
    this.applyFilters();
  }

  /** @deprecated Use {@link ApplyFiltersPublic}. */
  public applyFiltersPublic(): void {
    return this.ApplyFiltersPublic();
  }

  public async RestoreVersion(version: PromptVersion): Promise<void> {
    if (!version.canRestore || !this.Prompt) {
      this.notificationService.CreateSimpleNotification('Cannot restore this version', 'warning', 3000);
      return;
    }
    
    const confirmed = await this.confirmService.Confirm({ title: 'Restore version', message: `Restore to version ${version.version} from ${version.changedAt.toLocaleString()}?`, detail: 'This will overwrite the current prompt.' });
    if (!confirmed) return;
    
    try {
      this.isLoading = true;
      this.LoadingMessage = 'Restoring version...';
      
      const md = this.ProviderToUse;
      const promptToRestore = await md.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', md.CurrentUser);
      await promptToRestore.Load(this.Prompt.ID);
      
      // Apply the historical data
      if (version.fullRecordJSON) {
        const historicalData = version.fullRecordJSON;
        
        // Update prompt fields (excluding system fields)
        const fieldsToRestore = ['Name', 'Description', 'CategoryID', 'TypeID', 'Status', 'TemplateID'];
        fieldsToRestore.forEach(field => {
          if (historicalData[field] !== undefined) {
            (promptToRestore as any)[field] = historicalData[field];
          }
        });
        
        const saved = await promptToRestore.Save();
        if (saved) {
          this.notificationService.CreateSimpleNotification(`Version ${version.version} restored successfully`, 'success', 3000);
          this.VersionRestored.emit(promptToRestore);
          
          // Reload version history to reflect the new change
          await this.LoadVersionHistory();
        } else {
          throw new Error('Failed to save restored version');
        }
      }
      
    } catch (error) {
      this.error = 'Failed to restore version. Please try again.';
      LogError('Error restoring prompt version', undefined, error);
      this.notificationService.CreateSimpleNotification('Failed to restore version', 'error', 4000);
    } finally {
      this.isLoading = false;
    }
  }

  /** @deprecated Use {@link RestoreVersion}. */
  public async restoreVersion(version: PromptVersion): Promise<void> {
    return this.RestoreVersion(version);
  }
  
  public StartComparison(fromVersion: PromptVersion, toVersion?: PromptVersion): void {
    this.CompareFromVersion = fromVersion;
    this.CompareToVersion = toVersion || (this.Versions.find(v => v.version === fromVersion.version + 1) || this.Versions[0]);
    this.CurrentView = 'comparison';
    this.generateComparison();
  }

  /** @deprecated Use {@link StartComparison}. */
  public startComparison(fromVersion: PromptVersion, toVersion?: PromptVersion): void {
    return this.StartComparison(fromVersion, toVersion);
  }
  
  private generateComparison(): void {
    if (!this.CompareFromVersion || !this.CompareToVersion) return;
    
    const differences: FieldDifference[] = [];
    
    // Compare prompt fields
    const fromData = this.CompareFromVersion.fullRecordJSON || {};
    const toData = this.CompareToVersion.fullRecordJSON || {};
    
    const allFields = new Set([...Object.keys(fromData), ...Object.keys(toData)]);
    
    allFields.forEach(fieldName => {
      if (fieldName.startsWith('__mj_') || fieldName === 'ID') return; // Skip system fields
      
      const oldValue = fromData[fieldName];
      const newValue = toData[fieldName];
      
      if (oldValue !== newValue) {
        let changeType: 'added' | 'modified' | 'removed' = 'modified';
        if (oldValue === undefined) changeType = 'added';
        if (newValue === undefined) changeType = 'removed';
        
        differences.push({
          fieldName,
          displayName: this.getFieldDisplayName(fieldName),
          oldValue,
          newValue,
          changeType,
          isTemplate: fieldName === 'TemplateID'
        });
      }
    });
    
    // Compare template content if available
    this.compareTemplateContent(differences);
    
    this.ComparisonResult = {
      fromVersion: this.CompareFromVersion,
      toVersion: this.CompareToVersion,
      differences
    };
    
    this.VersionCompared.emit(this.ComparisonResult);
  }
  
  private compareTemplateContent(differences: FieldDifference[]): void {
    const fromTemplate = this.CompareFromVersion?.templateContent;
    const toTemplate = this.CompareToVersion?.templateContent;
    
    if (fromTemplate || toTemplate) {
      const fromContent = fromTemplate?.TemplateText || '';
      const toContent = toTemplate?.TemplateText || '';
      
      if (fromContent !== toContent) {
        differences.push({
          fieldName: 'TemplateText',
          displayName: 'Template Content',
          oldValue: fromContent,
          newValue: toContent,
          changeType: fromContent === '' ? 'added' : (toContent === '' ? 'removed' : 'modified'),
          isTemplate: true
        });
      }
    }
  }
  
  private getFieldDisplayName(fieldName: string): string {
    const displayNames: { [key: string]: string } = {
      'Name': 'Name',
      'Description': 'Description',
      'CategoryID': 'Category',
      'TypeID': 'Type',
      'Status': 'Status',
      'TemplateID': 'Template',
      'TemplateText': 'Template Content'
    };
    
    return displayNames[fieldName] || fieldName;
  }
  
  public onFilterChange(filter: string): void {
    this.FilterBy = filter as any;
    this.applyFilters();
  }
  
  public OnSortDirectionChange(): void {
    this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
  }

  /** @deprecated Use {@link OnSortDirectionChange}. */
  public onSortDirectionChange(): void {
    return this.OnSortDirectionChange();
  }
  
  public OnSearchChange(term: string): void {
    this.SearchTerm$.next(term);
    this.applyFilters();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(term: string): void {
    return this.OnSearchChange(term);
  }
  
  public OnViewChange(view: string): void {
    this.CurrentView = view as any;
    if (view === 'comparison' && !this.ComparisonResult && this.Versions.length >= 2) {
      this.StartComparison(this.Versions[1], this.Versions[0]);
    }
  }

  /** @deprecated Use {@link OnViewChange}. */
  public onViewChange(view: string): void {
    return this.OnViewChange(view);
  }
  
  public GetChangeTypeIcon(changeType: string): string {
    switch (changeType) {
      case 'Create': return 'fa-plus-circle';
      case 'Update': return 'fa-edit';
      case 'Delete': return 'fa-trash';
      default: return 'fa-question-circle';
    }
  }

  /** @deprecated Use {@link GetChangeTypeIcon}. */
  public getChangeTypeIcon(changeType: string): string {
    return this.GetChangeTypeIcon(changeType);
  }
  
  public GetChangeTypeClass(changeType: string): string {
    switch (changeType) {
      case 'Create': return 'change-create';
      case 'Update': return 'change-update';
      case 'Delete': return 'change-delete';
      default: return 'change-unknown';
    }
  }

  /** @deprecated Use {@link GetChangeTypeClass}. */
  public getChangeTypeClass(changeType: string): string {
    return this.GetChangeTypeClass(changeType);
  }
  
  public FormatChangeValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'string' && value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return String(value);
  }

  /** @deprecated Use {@link FormatChangeValue}. */
  public formatChangeValue(value: any): string {
    return this.FormatChangeValue(value);
  }
  
  public GetVersionLabel(version: PromptVersion): string {
    let label = `v${version.version}`;
    if (version.isActive) label += ' (Current)';
    if (version.changeType === 'Create') label += ' (Initial)';
    return label;
  }

  /** @deprecated Use {@link GetVersionLabel}. */
  public getVersionLabel(version: PromptVersion): string {
    return this.GetVersionLabel(version);
  }
  
  public ExportVersionHistory(): void {
    const exportData = {
      promptId: this.Prompt?.ID,
      promptName: this.Prompt?.Name,
      exportedAt: new Date().toISOString(),
      versions: this.Versions.map(v => ({
        version: v.version,
        changedAt: v.changedAt.toISOString(),
        changedBy: v.changedBy,
        changeType: v.changeType,
        changesDescription: v.changesDescription,
        fullRecord: v.fullRecordJSON
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-version-history-${this.Prompt?.Name || 'unknown'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** @deprecated Use {@link ExportVersionHistory}. */
  public exportVersionHistory(): void {
    return this.ExportVersionHistory();
  }
  
  public RefreshHistory(): void {
    this.LoadVersionHistory();
  }

  /** @deprecated Use {@link RefreshHistory}. */
  public refreshHistory(): void {
    return this.RefreshHistory();
  }

  private async loadAvailablePrompts(): Promise<void> {
    try {
      const metadata = this.ProviderToUse;
      const promptEntity = await metadata.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
      const prompts = await promptEntity.GetAll();
      this.AvailablePrompts = prompts.sort((a: MJAIPromptEntityExtended, b: MJAIPromptEntityExtended) => a.Name.localeCompare(b.Name));
      this.FilteredAvailablePrompts = [...this.AvailablePrompts];
    } catch (error) {
      console.error('Failed to load available prompts:', error);
      LogError('Failed to load available prompts', undefined, error);
    }
  }

  private setupPromptFiltering(): void {
    this.PromptSearchTerm$.subscribe(searchTerm => {
      this.filterAvailablePrompts(searchTerm);
    });
  }

  private filterAvailablePrompts(searchTerm: string): void {
    if (!searchTerm || searchTerm.trim() === '') {
      this.FilteredAvailablePrompts = [...this.AvailablePrompts];
    } else {
      const term = searchTerm.toLowerCase().trim();
      this.FilteredAvailablePrompts = this.AvailablePrompts.filter(prompt =>
        prompt.Name.toLowerCase().includes(term) ||
        (prompt.Description && prompt.Description.toLowerCase().includes(term))
      );
    }
  }

  public OnPromptSearchChange(searchTerm: string): void {
    this.PromptSearchTerm$.next(searchTerm);
  }

  /** @deprecated Use {@link OnPromptSearchChange}. */
  public onPromptSearchChange(searchTerm: string): void {
    return this.OnPromptSearchChange(searchTerm);
  }

  public SelectPromptForHistory(prompt: MJAIPromptEntityExtended): void {
    this.Prompt = prompt;
    this.LoadVersionHistory();
  }

  /** @deprecated Use {@link SelectPromptForHistory}. */
  public selectPromptForHistory(prompt: MJAIPromptEntityExtended): void {
    return this.SelectPromptForHistory(prompt);
  }
}