import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AIPromptTypeEntity, AIPromptCategoryEntity, TemplateEntity, TemplateContentEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { SharedService, BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { RegisterClass } from '@memberjunction/global';
import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';

interface PromptWithTemplate extends Omit<AIPromptEntityExtended, 'Template'> {
  Template: string; // From AIPromptEntityExtended (view field)
  TemplateEntity?: TemplateEntity; // Our added field for the actual template entity
  TemplateContents?: TemplateContentEntity[];
  CategoryName?: string;
  TypeName?: string;
}

/**
 * User preferences for the Prompt Management dashboard
 */
interface PromptManagementUserPreferences {
  viewMode: 'grid' | 'list' | 'priority-matrix';
  showFilters: boolean;
  searchTerm: string;
  selectedCategory: string;
  selectedType: string;
  selectedStatus: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}
/**
 * AI Prompts Resource - displays AI prompt management
 * Extends BaseResourceComponent to work with the resource type system
 */
@RegisterClass(BaseResourceComponent, 'AIPromptsResource')
@Component({
  standalone: false,
  selector: 'app-prompt-management',
  templateUrl: './prompt-management.component.html',
  styleUrls: ['./prompt-management.component.css']
})
export class PromptManagementComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  // Settings persistence
  private readonly USER_SETTINGS_KEY = 'AI.Prompts.UserPreferences';
  private settingsPersistSubject = new Subject<void>();
  private settingsLoaded = false;

  // View state
  public viewMode: 'grid' | 'list' | 'priority-matrix' = 'grid';
  public isLoading = true;
  public showFilters = true;
  public expandedPromptId: string | null = null;

  // Data
  public prompts: PromptWithTemplate[] = [];
  public filteredPrompts: PromptWithTemplate[] = [];
  public categories: AIPromptCategoryEntity[] = [];
  public types: AIPromptTypeEntity[] = [];

  // Filtering
  public searchTerm = '';
  private searchSubject = new BehaviorSubject<string>('');
  public selectedCategory = 'all';
  public selectedType = 'all';
  public selectedStatus = 'all';

  // Detail panel
  public selectedPrompt: PromptWithTemplate | null = null;
  public detailPanelVisible = false;

  // Sorting
  public sortColumn: string = 'Name';
  public sortDirection: 'asc' | 'desc' = 'asc';

  // Loading messages
  public loadingMessages = [
    'Loading AI prompts...',
    'Fetching templates...',
    'Organizing categories...',
    'Almost there...'
  ];
  public currentLoadingMessage = this.loadingMessages[0];
  private loadingMessageIndex = 0;
  private loadingMessageInterval: any;

  private destroy$ = new Subject<void>();
  public selectedPromptForTest: AIPromptEntityExtended | null = null;

  // === Permission Checks ===
  /** Cache for permission checks to avoid repeated calculations */
  private _permissionCache = new Map<string, boolean>();
  private _metadata = new Metadata();

  /** Check if user can create AI Prompts */
  public get UserCanCreatePrompts(): boolean {
    return this.checkEntityPermission('AI Prompts', 'Create');
  }

  /** Check if user can read AI Prompts */
  public get UserCanReadPrompts(): boolean {
    return this.checkEntityPermission('AI Prompts', 'Read');
  }

  /** Check if user can update AI Prompts */
  public get UserCanUpdatePrompts(): boolean {
    return this.checkEntityPermission('AI Prompts', 'Update');
  }

  /** Check if user can delete AI Prompts */
  public get UserCanDeletePrompts(): boolean {
    return this.checkEntityPermission('AI Prompts', 'Delete');
  }

  /**
   * Helper method to check entity permissions with caching
   * @param entityName - The name of the entity to check permissions for
   * @param permissionType - The type of permission to check (Create, Read, Update, Delete)
   * @returns boolean indicating if user has the permission
   */
  private checkEntityPermission(entityName: string, permissionType: 'Create' | 'Read' | 'Update' | 'Delete'): boolean {
    const cacheKey = `${entityName}_${permissionType}`;
    
    if (this._permissionCache.has(cacheKey)) {
      return this._permissionCache.get(cacheKey)!;
    }

    try {
      const entityInfo = this._metadata.Entities.find(e => e.Name === entityName);
      
      if (!entityInfo) {
        console.warn(`Entity '${entityName}' not found for permission check`);
        this._permissionCache.set(cacheKey, false);
        return false;
      }

      const userPermissions = entityInfo.GetUserPermisions(this._metadata.CurrentUser);
      let hasPermission = false;

      switch (permissionType) {
        case 'Create':
          hasPermission = userPermissions.CanCreate;
          break;
        case 'Read':
          hasPermission = userPermissions.CanRead;
          break;
        case 'Update':
          hasPermission = userPermissions.CanUpdate;
          break;
        case 'Delete':
          hasPermission = userPermissions.CanDelete;
          break;
      }

      this._permissionCache.set(cacheKey, hasPermission);
      return hasPermission;
    } catch (error) {
      console.error(`Error checking ${permissionType} permission for ${entityName}:`, error);
      this._permissionCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * Clears the permission cache. Call this when user context changes or permissions are updated.
   */
  public clearPermissionCache(): void {
    this._permissionCache.clear();
  }

  constructor(
    private sharedService: SharedService,
    private testHarnessService: AITestHarnessDialogService,
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {
    super();

    // Set up debounced settings persistence
    this.settingsPersistSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.persistUserPreferences();
    });
  }

  ngOnInit(): void {
    // Load saved user preferences first
    this.loadUserPreferences();

    this.setupSearchListener();
    this.startLoadingMessages();
    this.loadInitialData();

    // Apply initial state from resource configuration if provided (overrides saved prefs)
    if (this.Data?.Configuration) {
      this.applyInitialState(this.Data.Configuration);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.loadingMessageInterval) {
      clearInterval(this.loadingMessageInterval);
    }
  }

  private setupSearchListener(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.searchTerm = searchTerm;
      this.applyFilters();
      this.saveUserPreferencesDebounced();
    });
  }

  // ========================================
  // User Settings Persistence
  // ========================================

  /**
   * Load saved user preferences from the UserInfoEngine
   */
  private loadUserPreferences(): void {
    try {
      const savedPrefs = UserInfoEngine.Instance.GetSetting(this.USER_SETTINGS_KEY);
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs) as PromptManagementUserPreferences;
        this.applyUserPreferencesFromStorage(prefs);
      }
    } catch (error) {
      console.warn('[PromptManagement] Failed to load user preferences:', error);
    } finally {
      this.settingsLoaded = true;
    }
  }

  /**
   * Apply loaded preferences to component state
   */
  private applyUserPreferencesFromStorage(prefs: PromptManagementUserPreferences): void {
    if (prefs.viewMode) {
      this.viewMode = prefs.viewMode;
    }
    if (prefs.showFilters !== undefined) {
      this.showFilters = prefs.showFilters;
    }
    if (prefs.searchTerm) {
      this.searchTerm = prefs.searchTerm;
    }
    if (prefs.selectedCategory) {
      this.selectedCategory = prefs.selectedCategory;
    }
    if (prefs.selectedType) {
      this.selectedType = prefs.selectedType;
    }
    if (prefs.selectedStatus) {
      this.selectedStatus = prefs.selectedStatus;
    }
    if (prefs.sortColumn) {
      this.sortColumn = prefs.sortColumn;
    }
    if (prefs.sortDirection) {
      this.sortDirection = prefs.sortDirection;
    }
  }

  /**
   * Get current preferences as an object for saving
   */
  private getCurrentPreferences(): PromptManagementUserPreferences {
    return {
      viewMode: this.viewMode,
      showFilters: this.showFilters,
      searchTerm: this.searchTerm,
      selectedCategory: this.selectedCategory,
      selectedType: this.selectedType,
      selectedStatus: this.selectedStatus,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection
    };
  }

  /**
   * Persist user preferences to storage (debounced)
   */
  private saveUserPreferencesDebounced(): void {
    if (!this.settingsLoaded) return; // Don't save during initial load
    this.settingsPersistSubject.next();
  }

  /**
   * Actually persist user preferences to the UserInfoEngine
   */
  private async persistUserPreferences(): Promise<void> {
    try {
      const prefs = this.getCurrentPreferences();
      await UserInfoEngine.Instance.SetSetting(this.USER_SETTINGS_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn('[PromptManagement] Failed to persist user preferences:', error);
    }
  }

  private startLoadingMessages(): void {
    this.loadingMessageInterval = setInterval(() => {
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % this.loadingMessages.length;
      this.currentLoadingMessage = this.loadingMessages[this.loadingMessageIndex];
    }, 2000);
  }

  private async loadInitialData(): Promise<void> {
    try {
      // Configure both engines in parallel (no-op if already loaded)
      await Promise.all([
        AIEngineBase.Instance.Config(false),
        TemplateEngineBase.Instance.Config(false)
      ]);

      // Get cached data from AIEngineBase
      const prompts = AIEngineBase.Instance.Prompts;
      this.categories = AIEngineBase.Instance.PromptCategories;
      this.types = AIEngineBase.Instance.PromptTypes;

      // Get cached data from TemplateEngineBase
      const templates = TemplateEngineBase.Instance.Templates as TemplateEntity[];
      const templateContents = TemplateEngineBase.Instance.TemplateContents;
      
      // Create lookup maps
      const templateMap = new Map(templates.map(t => [t.ID, t]));
      const templateContentMap = new Map<string, TemplateContentEntity[]>();
      
      templateContents.forEach(tc => {
        const contents = templateContentMap.get(tc.TemplateID) || [];
        contents.push(tc);
        templateContentMap.set(tc.TemplateID, contents);
      });

      const categoryMap = new Map(this.categories.map(c => [c.ID, c.Name]));
      const typeMap = new Map(this.types.map(t => [t.ID, t.Name]));

      // Combine the data - keep the actual entity objects
      this.prompts = prompts.map(prompt => {
        const template = templateMap.get(prompt.ID);
        
        // Add the extra properties directly to the entity
        (prompt as any).TemplateEntity = template;
        (prompt as any).TemplateContents = template ? (templateContentMap.get(template.ID) || []) : [];
        (prompt as any).CategoryName = prompt.CategoryID ? categoryMap.get(prompt.CategoryID) || 'Unknown' : 'Uncategorized';
        (prompt as any).TypeName = prompt.TypeID ? typeMap.get(prompt.TypeID) || 'Unknown' : 'Untyped';
        
        return prompt as PromptWithTemplate;
      });

      this.filteredPrompts = [...this.prompts];
      this.applyFilters();
    } catch (error) {
      console.error('Error loading prompt data:', error);
      MJNotificationService.Instance.CreateSimpleNotification('Error loading prompts', 'error', 3000);
    } finally {
      this.isLoading = false;
      if (this.loadingMessageInterval) {
        clearInterval(this.loadingMessageInterval);
      }
      this.NotifyLoadComplete();
    }
  }

  private applyInitialState(state: any): void {
    if (state.viewMode) this.viewMode = state.viewMode;
    if (state.showFilters !== undefined) this.showFilters = state.showFilters;
    if (state.searchTerm) this.searchTerm = state.searchTerm;
    if (state.selectedCategory) this.selectedCategory = state.selectedCategory;
    if (state.selectedType) this.selectedType = state.selectedType;
    if (state.selectedStatus) this.selectedStatus = state.selectedStatus;
  }

  public onSearchChange(value: string): void {
    this.searchSubject.next(value);
  }

  public toggleFilters(): void {
    this.showFilters = !this.showFilters;
    this.saveUserPreferencesDebounced();
  }

  public toggleFilterPanel(): void {
    this.showFilters = !this.showFilters;
    this.saveUserPreferencesDebounced();
  }

  public setViewMode(mode: 'grid' | 'list' | 'priority-matrix'): void {
    this.viewMode = mode;
    this.expandedPromptId = null;
    this.saveUserPreferencesDebounced();
  }

  public togglePromptExpansion(promptId: string): void {
    this.expandedPromptId = this.expandedPromptId === promptId ? null : promptId;
  }

  public applyFilters(): void {
    this.filteredPrompts = this.prompts.filter(prompt => {
      // Search filter
      if (this.searchTerm) {
        const searchLower = this.searchTerm.toLowerCase();
        const matchesSearch = 
          prompt.Name?.toLowerCase().includes(searchLower) ||
          prompt.Description?.toLowerCase().includes(searchLower) ||
          prompt.CategoryName?.toLowerCase().includes(searchLower) ||
          prompt.TypeName?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Category filter
      if (this.selectedCategory !== 'all' && prompt.CategoryID !== this.selectedCategory) {
        return false;
      }

      // Type filter
      if (this.selectedType !== 'all' && prompt.TypeID !== this.selectedType) {
        return false;
      }

      // Status filter
      if (this.selectedStatus !== 'all') {
        const isActive = prompt.Status === 'Active';
        if (this.selectedStatus === 'active' && !isActive) return false;
        if (this.selectedStatus === 'inactive' && isActive) return false;
      }

      return true;
    });

    // Apply sorting
    this.filteredPrompts = this.applySorting(this.filteredPrompts);
    this.cdr.detectChanges();
  }

  /**
   * Sort the prompts by the specified column
   */
  public sortBy(column: string): void {
    if (this.sortColumn === column) {
      // Toggle direction if same column
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /**
   * Apply sorting to the filtered list
   */
  private applySorting(prompts: PromptWithTemplate[]): PromptWithTemplate[] {
    return prompts.sort((a, b) => {
      let valueA: string | boolean | null | undefined;
      let valueB: string | boolean | null | undefined;

      switch (this.sortColumn) {
        case 'Name':
          valueA = a.Name;
          valueB = b.Name;
          break;
        case 'Category':
          valueA = a.CategoryName;
          valueB = b.CategoryName;
          break;
        case 'Type':
          valueA = a.TypeName;
          valueB = b.TypeName;
          break;
        case 'Status':
          valueA = a.Status;
          valueB = b.Status;
          break;
        default:
          valueA = a.Name;
          valueB = b.Name;
      }

      // Handle null/undefined values
      const strA = (valueA ?? '').toString().toLowerCase();
      const strB = (valueB ?? '').toString().toLowerCase();

      let comparison = strA.localeCompare(strB);
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
  }

  public onCategoryChange(categoryId: string): void {
    this.selectedCategory = categoryId;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public onTypeChange(typeId: string): void {
    this.selectedType = typeId;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public onStatusChange(status: string): void {
    this.selectedStatus = status;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public openPrompt(promptId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: promptId }]);
    this.navigationService.OpenEntityRecord('AI Prompts', compositeKey);
  }

  /**
   * Show the detail panel for a prompt
   */
  public showPromptDetails(prompt: PromptWithTemplate, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedPrompt = prompt;
    this.detailPanelVisible = true;
  }

  /**
   * Close the detail panel
   */
  public closeDetailPanel(): void {
    this.detailPanelVisible = false;
    // Delay clearing selectedPrompt for smoother animation
    setTimeout(() => {
      if (!this.detailPanelVisible) {
        this.selectedPrompt = null;
      }
    }, 300);
  }

  /**
   * Open the full entity record from the detail panel
   */
  public openPromptFromPanel(): void {
    if (this.selectedPrompt) {
      this.openPrompt(this.selectedPrompt.ID);
    }
  }

  public testPrompt(promptId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    
    // Use the test harness service for window management features
    this.testHarnessService.openForPrompt(promptId);
  }

  public closeTestHarness(): void {
    // No longer needed - window manages its own closure
    this.selectedPromptForTest = null;
  }

  public createNewPrompt(): void {
    // Use the standard MemberJunction pattern to open a new AI Prompt form
    // Empty CompositeKey indicates a new record
    this.navigationService.OpenEntityRecord('AI Prompts', new CompositeKey([]));
  }

  public getPromptIcon(prompt: PromptWithTemplate): string {
    if (prompt.TypeName?.toLowerCase().includes('system')) {
      return 'fa-solid fa-cogs';
    } else if (prompt.TypeName?.toLowerCase().includes('user')) {
      return 'fa-solid fa-user';
    } else if (prompt.TypeName?.toLowerCase().includes('chat')) {
      return 'fa-solid fa-comments';
    }
    return 'fa-solid fa-comment-dots';
  }

  public getStatusClass(status: string): string {
    return status === 'Active' ? 'active' : 'inactive';
  }

  public get hasActiveFilters(): boolean {
    return this.searchTerm !== '' || 
           this.selectedCategory !== 'all' || 
           this.selectedType !== 'all' || 
           this.selectedStatus !== 'all';
  }

  public get filteredPromptsAsEntities(): AIPromptEntityExtended[] {
    // The prompts are already AIPromptEntityExtended instances with extra properties
    return this.filteredPrompts as AIPromptEntityExtended[];
  }

  public clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = 'all';
    this.selectedType = 'all';
    this.selectedStatus = 'all';
    this.searchSubject.next('');
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  // BaseResourceComponent abstract method implementations
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Prompts';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comment-dots';
  }
}