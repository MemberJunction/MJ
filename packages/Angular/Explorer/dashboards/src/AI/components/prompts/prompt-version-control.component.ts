import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { Metadata, CompositeKey, LogError, LogStatus } from '@memberjunction/core';
import { RecordChangeEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';

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
  templateContent?: TemplateContentEntity;
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
  selector: 'app-prompt-version-control',
  templateUrl: './prompt-version-control.component.html',
  styleUrls: ['./prompt-version-control.component.css']
})
export class PromptVersionControlComponent implements OnInit, OnDestroy {
  @Input() prompt: AIPromptEntityExtended | null = null;
  @Input() autoLoad = true;
  @Input() showRestoreActions = true;
  @Input() showComparison = true;
  @Input() maxVersions = 50;
  
  @Output() versionSelected = new EventEmitter<PromptVersion>();
  @Output() versionRestored = new EventEmitter<AIPromptEntityExtended>();
  @Output() versionCompared = new EventEmitter<VersionComparison>();
  
  // Data
  public versions: PromptVersion[] = [];
  public recordChanges: RecordChangeEntity[] = [];
  public templateContents: Map<string, TemplateContentEntity> = new Map();
  public availablePrompts: AIPromptEntityExtended[] = [];
  public filteredAvailablePrompts: AIPromptEntityExtended[] = [];
  
  // UI State
  public isLoading = false;
  public loadingMessage = '';
  public error: string | null = null;
  public currentView: 'timeline' | 'comparison' | 'details' = 'timeline';
  public selectedVersion: PromptVersion | null = null;
  public compareFromVersion: PromptVersion | null = null;
  public compareToVersion: PromptVersion | null = null;
  public comparisonResult: VersionComparison | null = null;
  
  // Filtering and sorting
  public filterBy: 'all' | 'updates' | 'major' | 'template' = 'all';
  public sortDirection: 'asc' | 'desc' = 'desc';
  public searchTerm$ = new BehaviorSubject<string>('');
  public promptSearchTerm$ = new BehaviorSubject<string>('');
  public showSystemChanges = false;
  
  // Timeline configuration
  public timelineConfig = {
    showThumbnails: true,
    showDiffs: true,
    compactMode: false,
    groupByDate: true
  };
  
  private destroy$ = new Subject<void>();
  
  constructor(private notificationService: MJNotificationService) {}
  
  ngOnInit(): void {
    this.loadAvailablePrompts();
    this.setupPromptFiltering();
    
    if (this.autoLoad && this.prompt) {
      this.loadVersionHistory();
    }
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  public async loadVersionHistory(): Promise<void> {
    if (!this.prompt) {
      this.error = 'No prompt specified for version history';
      return;
    }
    
    try {
      this.isLoading = true;
      this.error = null;
      this.loadingMessage = 'Loading version history...';
      
      const md = new Metadata();
      const primaryKey = new CompositeKey();
      primaryKey.KeyValuePairs.push({ FieldName: 'ID', Value: this.prompt.ID });
      
      // Get record changes using the new method
      this.recordChanges = await md.GetRecordChanges<RecordChangeEntity>('AI Prompts', primaryKey);
      
      if (this.recordChanges.length === 0) {
        this.versions = [];
        LogStatus(`No version history found for prompt: ${this.prompt.Name}`);
        return;
      }
      
      // Load template contents for versions that have template changes
      await this.loadTemplateContents();
      
      // Process record changes into version objects
      this.processRecordChanges();
      
      // Apply current filters
      this.applyFilters();
      
      LogStatus(`Loaded ${this.versions.length} versions for prompt: ${this.prompt.Name}`);
      
    } catch (error) {
      this.error = 'Failed to load version history. Please try again.';
      LogError('Error loading prompt version history', undefined, error);
    } finally {
      this.isLoading = false;
    }
  }
  
  private async loadTemplateContents(): Promise<void> {
    const templateIds = new Set<string>();
    
    // Extract template IDs from record changes
    this.recordChanges.forEach(change => {
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
      this.loadingMessage = 'Loading template content history...';
      
      // Note: We would need a way to get historical template content
      // For now, we'll get current template content and note this limitation
      const md = new Metadata();
      for (const templateId of templateIds) {
        try {
          const templateContent = await md.GetEntityObject<TemplateContentEntity>('Template Contents', md.CurrentUser);
          const loaded = await templateContent.Load(templateId);
          if (loaded) {
            this.templateContents.set(templateId, templateContent);
          }
        } catch (e) {
          // Template content might not exist anymore
          LogError(`Failed to load template content for ID: ${templateId}`, undefined, e);
        }
      }
    }
  }
  
  private processRecordChanges(): void {
    this.versions = this.recordChanges.map((change, index) => {
      let templateContent: TemplateContentEntity | undefined;
      
      try {
        const fullRecord = JSON.parse(change.FullRecordJSON);
        if (fullRecord.TemplateID) {
          templateContent = this.templateContents.get(fullRecord.TemplateID);
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      const version: PromptVersion = {
        id: change.ID,
        version: this.recordChanges.length - index, // Version number (newest = highest)
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
    let filtered = [...this.versions];
    
    // Apply filter by type
    switch (this.filterBy) {
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
    if (!this.showSystemChanges) {
      filtered = filtered.filter(v => v.changeSource !== 'External');
    }
    
    // Apply search term
    const searchTerm = this.searchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(v => 
        v.changesDescription.toLowerCase().includes(searchTerm) ||
        v.changedBy.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      const comparison = a.changedAt.getTime() - b.changedAt.getTime();
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
    
    this.versions = filtered;
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
  
  public onVersionSelect(version: PromptVersion): void {
    this.selectedVersion = version;
    this.versionSelected.emit(version);
  }
  
  public onVersionRestore(version: PromptVersion): Promise<void> {
    return this.restoreVersion(version);
  }
  
  public getObjectKeys(obj: any): string[] {
    return Object.keys(obj || {});
  }

  public getFieldDisplayNamePublic(fieldName: string): string {
    return this.getFieldDisplayName(fieldName);
  }

  public generateComparisonPublic(): void {
    this.generateComparison();
  }

  public applyFiltersPublic(): void {
    this.applyFilters();
  }

  public async restoreVersion(version: PromptVersion): Promise<void> {
    if (!version.canRestore || !this.prompt) {
      this.notificationService.CreateSimpleNotification('Cannot restore this version', 'warning', 3000);
      return;
    }
    
    const confirm = window.confirm(`Are you sure you want to restore to version ${version.version} from ${version.changedAt.toLocaleString()}? This will overwrite the current prompt.`);
    if (!confirm) return;
    
    try {
      this.isLoading = true;
      this.loadingMessage = 'Restoring version...';
      
      const md = new Metadata();
      const promptToRestore = await md.GetEntityObject<AIPromptEntityExtended>('AI Prompts', md.CurrentUser);
      await promptToRestore.Load(this.prompt.ID);
      
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
          this.versionRestored.emit(promptToRestore);
          
          // Reload version history to reflect the new change
          await this.loadVersionHistory();
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
  
  public startComparison(fromVersion: PromptVersion, toVersion?: PromptVersion): void {
    this.compareFromVersion = fromVersion;
    this.compareToVersion = toVersion || (this.versions.find(v => v.version === fromVersion.version + 1) || this.versions[0]);
    this.currentView = 'comparison';
    this.generateComparison();
  }
  
  private generateComparison(): void {
    if (!this.compareFromVersion || !this.compareToVersion) return;
    
    const differences: FieldDifference[] = [];
    
    // Compare prompt fields
    const fromData = this.compareFromVersion.fullRecordJSON || {};
    const toData = this.compareToVersion.fullRecordJSON || {};
    
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
    
    this.comparisonResult = {
      fromVersion: this.compareFromVersion,
      toVersion: this.compareToVersion,
      differences
    };
    
    this.versionCompared.emit(this.comparisonResult);
  }
  
  private compareTemplateContent(differences: FieldDifference[]): void {
    const fromTemplate = this.compareFromVersion?.templateContent;
    const toTemplate = this.compareToVersion?.templateContent;
    
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
    this.filterBy = filter as any;
    this.applyFilters();
  }
  
  public onSortDirectionChange(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
  }
  
  public onSearchChange(term: string): void {
    this.searchTerm$.next(term);
    this.applyFilters();
  }
  
  public onViewChange(view: string): void {
    this.currentView = view as any;
    if (view === 'comparison' && !this.comparisonResult && this.versions.length >= 2) {
      this.startComparison(this.versions[1], this.versions[0]);
    }
  }
  
  public getChangeTypeIcon(changeType: string): string {
    switch (changeType) {
      case 'Create': return 'fa-plus-circle';
      case 'Update': return 'fa-edit';
      case 'Delete': return 'fa-trash';
      default: return 'fa-question-circle';
    }
  }
  
  public getChangeTypeClass(changeType: string): string {
    switch (changeType) {
      case 'Create': return 'change-create';
      case 'Update': return 'change-update';
      case 'Delete': return 'change-delete';
      default: return 'change-unknown';
    }
  }
  
  public formatChangeValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'string' && value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return String(value);
  }
  
  public getVersionLabel(version: PromptVersion): string {
    let label = `v${version.version}`;
    if (version.isActive) label += ' (Current)';
    if (version.changeType === 'Create') label += ' (Initial)';
    return label;
  }
  
  public exportVersionHistory(): void {
    const exportData = {
      promptId: this.prompt?.ID,
      promptName: this.prompt?.Name,
      exportedAt: new Date().toISOString(),
      versions: this.versions.map(v => ({
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
    a.download = `prompt-version-history-${this.prompt?.Name || 'unknown'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  public refreshHistory(): void {
    this.loadVersionHistory();
  }

  private async loadAvailablePrompts(): Promise<void> {
    try {
      const metadata = new Metadata();
      const promptEntity = await metadata.GetEntityObject<AIPromptEntityExtended>('AI Prompts');
      const prompts = await promptEntity.GetAll();
      this.availablePrompts = prompts.sort((a: AIPromptEntityExtended, b: AIPromptEntityExtended) => a.Name.localeCompare(b.Name));
      this.filteredAvailablePrompts = [...this.availablePrompts];
    } catch (error) {
      console.error('Failed to load available prompts:', error);
      LogError('Failed to load available prompts', undefined, error);
    }
  }

  private setupPromptFiltering(): void {
    this.promptSearchTerm$.subscribe(searchTerm => {
      this.filterAvailablePrompts(searchTerm);
    });
  }

  private filterAvailablePrompts(searchTerm: string): void {
    if (!searchTerm || searchTerm.trim() === '') {
      this.filteredAvailablePrompts = [...this.availablePrompts];
    } else {
      const term = searchTerm.toLowerCase().trim();
      this.filteredAvailablePrompts = this.availablePrompts.filter(prompt =>
        prompt.Name.toLowerCase().includes(term) ||
        (prompt.Description && prompt.Description.toLowerCase().includes(term))
      );
    }
  }

  public onPromptSearchChange(searchTerm: string): void {
    this.promptSearchTerm$.next(searchTerm);
  }

  public selectPromptForHistory(prompt: AIPromptEntityExtended): void {
    this.prompt = prompt;
    this.loadVersionHistory();
  }
}