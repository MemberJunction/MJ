import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MJAIPromptTypeEntity, MJAIPromptCategoryEntity, MJTemplateEntity, MJTemplateContentEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { SharedService, BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';

interface PromptWithTemplate extends Omit<MJAIPromptEntityExtended, 'Template'> {
  Template: string; // From MJAIPromptEntityExtended (view field)
  MJTemplateEntity?: MJTemplateEntity; // Our added field for the actual template entity
  TemplateContents?: MJTemplateContentEntity[];
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
  public ViewMode: 'grid' | 'list' | 'priority-matrix' = 'grid';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'grid' | 'list' | 'priority-matrix' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'grid' | 'list' | 'priority-matrix') {
    this.ViewMode = value;
  }
  public isLoading = true;
  public ShowFilters = true;

  /** @deprecated Use {@link ShowFilters}. */
  public get showFilters() {
    return this.ShowFilters;
  }
  /** @deprecated Use {@link ShowFilters}. */
  public set showFilters(value) {
    this.ShowFilters = value;
  }
  public ExpandedPromptId: string | null = null;

  /** @deprecated Use {@link ExpandedPromptId}. */
  public get expandedPromptId(): string | null {
    return this.ExpandedPromptId;
  }
  /** @deprecated Use {@link ExpandedPromptId}. */
  public set expandedPromptId(value: string | null) {
    this.ExpandedPromptId = value;
  }

  // Data
  public Prompts: PromptWithTemplate[] = [];

  /** @deprecated Use {@link Prompts}. */
  public get prompts(): PromptWithTemplate[] {
    return this.Prompts;
  }
  /** @deprecated Use {@link Prompts}. */
  public set prompts(value: PromptWithTemplate[]) {
    this.Prompts = value;
  }
  public FilteredPrompts: PromptWithTemplate[] = [];

  /** @deprecated Use {@link FilteredPrompts}. */
  public get filteredPrompts(): PromptWithTemplate[] {
    return this.FilteredPrompts;
  }
  /** @deprecated Use {@link FilteredPrompts}. */
  public set filteredPrompts(value: PromptWithTemplate[]) {
    this.FilteredPrompts = value;
  }
  public Categories: MJAIPromptCategoryEntity[] = [];

  /** @deprecated Use {@link Categories}. */
  public get categories(): MJAIPromptCategoryEntity[] {
    return this.Categories;
  }
  /** @deprecated Use {@link Categories}. */
  public set categories(value: MJAIPromptCategoryEntity[]) {
    this.Categories = value;
  }
  public Types: MJAIPromptTypeEntity[] = [];

  /** @deprecated Use {@link Types}. */
  public get types(): MJAIPromptTypeEntity[] {
    return this.Types;
  }
  /** @deprecated Use {@link Types}. */
  public set types(value: MJAIPromptTypeEntity[]) {
    this.Types = value;
  }

  // Filtering
  public SearchTerm = '';

  /** @deprecated Use {@link SearchTerm}. */
  public get searchTerm() {
    return this.SearchTerm;
  }
  /** @deprecated Use {@link SearchTerm}. */
  public set searchTerm(value) {
    this.SearchTerm = value;
  }
  private searchSubject = new BehaviorSubject<string>('');
  public SelectedCategory = 'all';

  /** @deprecated Use {@link SelectedCategory}. */
  public get selectedCategory() {
    return this.SelectedCategory;
  }
  /** @deprecated Use {@link SelectedCategory}. */
  public set selectedCategory(value) {
    this.SelectedCategory = value;
  }
  public SelectedType = 'all';

  /** @deprecated Use {@link SelectedType}. */
  public get selectedType() {
    return this.SelectedType;
  }
  /** @deprecated Use {@link SelectedType}. */
  public set selectedType(value) {
    this.SelectedType = value;
  }
  public SelectedStatus = 'all';

  /** @deprecated Use {@link SelectedStatus}. */
  public get selectedStatus() {
    return this.SelectedStatus;
  }
  /** @deprecated Use {@link SelectedStatus}. */
  public set selectedStatus(value) {
    this.SelectedStatus = value;
  }

  // Detail panel
  public SelectedPrompt: PromptWithTemplate | null = null;

  /** @deprecated Use {@link SelectedPrompt}. */
  public get selectedPrompt(): PromptWithTemplate | null {
    return this.SelectedPrompt;
  }
  /** @deprecated Use {@link SelectedPrompt}. */
  public set selectedPrompt(value: PromptWithTemplate | null) {
    this.SelectedPrompt = value;
  }
  public DetailPanelVisible = false;

  /** @deprecated Use {@link DetailPanelVisible}. */
  public get detailPanelVisible() {
    return this.DetailPanelVisible;
  }
  /** @deprecated Use {@link DetailPanelVisible}. */
  public set detailPanelVisible(value) {
    this.DetailPanelVisible = value;
  }

  // Sorting
  public SortColumn: string = 'Name';

  /** @deprecated Use {@link SortColumn}. */
  public get sortColumn(): string {
    return this.SortColumn;
  }
  /** @deprecated Use {@link SortColumn}. */
  public set sortColumn(value: string) {
    this.SortColumn = value;
  }
  public SortDirection: 'asc' | 'desc' = 'asc';

  /** @deprecated Use {@link SortDirection}. */
  public get sortDirection(): 'asc' | 'desc' {
    return this.SortDirection;
  }
  /** @deprecated Use {@link SortDirection}. */
  public set sortDirection(value: 'asc' | 'desc') {
    this.SortDirection = value;
  }

  // Loading messages
  public LoadingMessages = [
    'Loading AI prompts...',
    'Fetching templates...',
    'Organizing categories...',
    'Almost there...'
  ];

  /** @deprecated Use {@link LoadingMessages}. */
  public get loadingMessages() {
    return this.LoadingMessages;
  }
  /** @deprecated Use {@link LoadingMessages}. */
  public set loadingMessages(value) {
    this.LoadingMessages = value;
  }
  public CurrentLoadingMessage = this.LoadingMessages[0];

  /** @deprecated Use {@link CurrentLoadingMessage}. */
  public get currentLoadingMessage() {
    return this.CurrentLoadingMessage;
  }
  /** @deprecated Use {@link CurrentLoadingMessage}. */
  public set currentLoadingMessage(value) {
    this.CurrentLoadingMessage = value;
  }
  private loadingMessageIndex = 0;
  private loadingMessageInterval: any;

  protected override destroy$ = new Subject<void>();
  public SelectedPromptForTest: MJAIPromptEntityExtended | null = null;

  /** @deprecated Use {@link SelectedPromptForTest}. */
  public get selectedPromptForTest(): MJAIPromptEntityExtended | null {
    return this.SelectedPromptForTest;
  }
  /** @deprecated Use {@link SelectedPromptForTest}. */
  public set selectedPromptForTest(value: MJAIPromptEntityExtended | null) {
    this.SelectedPromptForTest = value;
  }

  // === Permission Checks ===
  /** Cache for permission checks to avoid repeated calculations */
  private _permissionCache = new Map<string, boolean>();
  private _metadata = this.ProviderToUse;

  /** Check if user can create AI Prompts */
  public get UserCanCreatePrompts(): boolean {
    return this.checkEntityPermission('MJ: AI Prompts', 'Create');
  }

  /** Check if user can read AI Prompts */
  public get UserCanReadPrompts(): boolean {
    return this.checkEntityPermission('MJ: AI Prompts', 'Read');
  }

  /** Check if user can update AI Prompts */
  public get UserCanUpdatePrompts(): boolean {
    return this.checkEntityPermission('MJ: AI Prompts', 'Update');
  }

  /** Check if user can delete AI Prompts */
  public get UserCanDeletePrompts(): boolean {
    return this.checkEntityPermission('MJ: AI Prompts', 'Delete');
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
  public ClearPermissionCache(): void {
    this._permissionCache.clear();
  }

  /** @deprecated Use {@link ClearPermissionCache}. */
  public clearPermissionCache(): void {
    return this.ClearPermissionCache();
  }

  constructor(
    private sharedService: SharedService,
    private testHarnessService: AITestHarnessDialogService,
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
    super.ngOnInit();
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
    super.ngOnDestroy();
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
      this.SearchTerm = searchTerm;
      this.ApplyFilters();
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
      this.ViewMode = prefs.viewMode;
    }
    if (prefs.showFilters !== undefined) {
      this.ShowFilters = prefs.showFilters;
    }
    if (prefs.searchTerm) {
      this.SearchTerm = prefs.searchTerm;
    }
    if (prefs.selectedCategory) {
      this.SelectedCategory = prefs.selectedCategory;
    }
    if (prefs.selectedType) {
      this.SelectedType = prefs.selectedType;
    }
    if (prefs.selectedStatus) {
      this.SelectedStatus = prefs.selectedStatus;
    }
    if (prefs.sortColumn) {
      this.SortColumn = prefs.sortColumn;
    }
    if (prefs.sortDirection) {
      this.SortDirection = prefs.sortDirection;
    }
  }

  /**
   * Get current preferences as an object for saving
   */
  private getCurrentPreferences(): PromptManagementUserPreferences {
    return {
      viewMode: this.ViewMode,
      showFilters: this.ShowFilters,
      searchTerm: this.SearchTerm,
      selectedCategory: this.SelectedCategory,
      selectedType: this.SelectedType,
      selectedStatus: this.SelectedStatus,
      sortColumn: this.SortColumn,
      sortDirection: this.SortDirection
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
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % this.LoadingMessages.length;
      this.CurrentLoadingMessage = this.LoadingMessages[this.loadingMessageIndex];
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
      this.Categories = AIEngineBase.Instance.PromptCategories;
      this.Types = AIEngineBase.Instance.PromptTypes;

      // Get cached data from TemplateEngineBase
      const templates = TemplateEngineBase.Instance.Templates as MJTemplateEntity[];
      const templateContents = TemplateEngineBase.Instance.TemplateContents;
      
      // Create lookup maps
      const templateMap = new Map(templates.map(t => [t.ID, t]));
      const templateContentMap = new Map<string, MJTemplateContentEntity[]>();
      
      templateContents.forEach(tc => {
        const contents = templateContentMap.get(tc.TemplateID) || [];
        contents.push(tc);
        templateContentMap.set(tc.TemplateID, contents);
      });

      const categoryMap = new Map(this.Categories.map(c => [c.ID, c.Name]));
      const typeMap = new Map(this.Types.map(t => [t.ID, t.Name]));

      // Combine the data - keep the actual entity objects
      this.Prompts = prompts.map(prompt => {
        const template = templateMap.get(prompt.ID);
        
        // Add the extra properties directly to the entity
        (prompt as any).MJTemplateEntity = template;
        (prompt as any).TemplateContents = template ? (templateContentMap.get(template.ID) || []) : [];
        (prompt as any).CategoryName = prompt.CategoryID ? categoryMap.get(prompt.CategoryID) || 'Unknown' : 'Uncategorized';
        (prompt as any).TypeName = prompt.TypeID ? typeMap.get(prompt.TypeID) || 'Unknown' : 'Untyped';
        
        return prompt as PromptWithTemplate;
      });

      this.FilteredPrompts = [...this.Prompts];
      this.ApplyFilters();
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
    if (state.viewMode) this.ViewMode = state.viewMode;
    if (state.showFilters !== undefined) this.ShowFilters = state.showFilters;
    if (state.searchTerm) this.SearchTerm = state.searchTerm;
    if (state.selectedCategory) this.SelectedCategory = state.selectedCategory;
    if (state.selectedType) this.SelectedType = state.selectedType;
    if (state.selectedStatus) this.SelectedStatus = state.selectedStatus;
  }

  public OnSearchChange(value: string): void {
    this.searchSubject.next(value);
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(value: string): void {
    return this.OnSearchChange(value);
  }

  public ToggleFilters(): void {
    this.ShowFilters = !this.ShowFilters;
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ToggleFilters}. */
  public toggleFilters(): void {
    return this.ToggleFilters();
  }

  public ToggleFilterPanel(): void {
    this.ShowFilters = !this.ShowFilters;
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ToggleFilterPanel}. */
  public toggleFilterPanel(): void {
    return this.ToggleFilterPanel();
  }

  public SetViewMode(mode: 'grid' | 'list' | 'priority-matrix'): void {
    this.ViewMode = mode;
    this.ExpandedPromptId = null;
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link SetViewMode}. */
  public setViewMode(mode: 'grid' | 'list' | 'priority-matrix'): void {
    return this.SetViewMode(mode);
  }

  public TogglePromptExpansion(promptId: string): void {
    this.ExpandedPromptId = this.ExpandedPromptId === promptId ? null : promptId;
  }

  /** @deprecated Use {@link TogglePromptExpansion}. */
  public togglePromptExpansion(promptId: string): void {
    return this.TogglePromptExpansion(promptId);
  }

  public ApplyFilters(): void {
    this.FilteredPrompts = this.Prompts.filter(prompt => {
      // Search filter
      if (this.SearchTerm) {
        const searchLower = this.SearchTerm.toLowerCase();
        const matchesSearch = 
          prompt.Name?.toLowerCase().includes(searchLower) ||
          prompt.Description?.toLowerCase().includes(searchLower) ||
          prompt.CategoryName?.toLowerCase().includes(searchLower) ||
          prompt.TypeName?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Category filter
      if (this.SelectedCategory !== 'all' && !UUIDsEqual(prompt.CategoryID, this.SelectedCategory)) {
        return false;
      }

      // Type filter
      if (this.SelectedType !== 'all' && !UUIDsEqual(prompt.TypeID, this.SelectedType)) {
        return false;
      }

      // Status filter
      if (this.SelectedStatus !== 'all') {
        const isActive = prompt.Status === 'Active';
        if (this.SelectedStatus === 'active' && !isActive) return false;
        if (this.SelectedStatus === 'inactive' && isActive) return false;
      }

      return true;
    });

    // Apply sorting
    this.FilteredPrompts = this.applySorting(this.FilteredPrompts);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ApplyFilters}. */
  public applyFilters(): void {
    return this.ApplyFilters();
  }

  /**
   * Sort the prompts by the specified column
   */
  public SortBy(column: string): void {
    if (this.SortColumn === column) {
      // Toggle direction if same column
      this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.SortColumn = column;
      this.SortDirection = 'asc';
    }
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link SortBy}. */
  public sortBy(column: string): void {
    return this.SortBy(column);
  }

  /**
   * Apply sorting to the filtered list
   */
  private applySorting(prompts: PromptWithTemplate[]): PromptWithTemplate[] {
    return prompts.sort((a, b) => {
      let valueA: string | boolean | null | undefined;
      let valueB: string | boolean | null | undefined;

      switch (this.SortColumn) {
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
      return this.SortDirection === 'desc' ? -comparison : comparison;
    });
  }

  public OnCategoryChange(categoryId: string): void {
    this.SelectedCategory = categoryId;
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnCategoryChange}. */
  public onCategoryChange(categoryId: string): void {
    return this.OnCategoryChange(categoryId);
  }

  public OnTypeChange(typeId: string): void {
    this.SelectedType = typeId;
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnTypeChange}. */
  public onTypeChange(typeId: string): void {
    return this.OnTypeChange(typeId);
  }

  public OnStatusChange(status: string): void {
    this.SelectedStatus = status;
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnStatusChange}. */
  public onStatusChange(status: string): void {
    return this.OnStatusChange(status);
  }

  public OpenPrompt(promptId: string): void {
    this.navigationService.OpenEntityRecord('MJ: AI Prompts', CompositeKey.FromID(promptId));
  }

  /** @deprecated Use {@link OpenPrompt}. */
  public openPrompt(promptId: string): void {
    return this.OpenPrompt(promptId);
  }

  /**
   * Show the detail panel for a prompt
   */
  public ShowPromptDetails(prompt: PromptWithTemplate, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.SelectedPrompt = prompt;
    this.DetailPanelVisible = true;
  }

  /** @deprecated Use {@link ShowPromptDetails}. */
  public showPromptDetails(prompt: PromptWithTemplate, event?: Event): void {
    return this.ShowPromptDetails(prompt, event);
  }

  /**
   * Close the detail panel
   */
  public CloseDetailPanel(): void {
    this.DetailPanelVisible = false;
    // Delay clearing selectedPrompt for smoother animation
    setTimeout(() => {
      if (!this.DetailPanelVisible) {
        this.SelectedPrompt = null;
      }
    }, 300);
  }

  /** @deprecated Use {@link CloseDetailPanel}. */
  public closeDetailPanel(): void {
    return this.CloseDetailPanel();
  }

  /**
   * Open the full entity record from the detail panel
   */
  public OpenPromptFromPanel(): void {
    if (this.SelectedPrompt) {
      this.OpenPrompt(this.SelectedPrompt.ID);
    }
    // Intent moved to the full record — a lingering panel paints over the
    // records view and greets the user with stale chrome on return.
    this.CloseDetailPanel();
  }

  /** @deprecated Use {@link OpenPromptFromPanel}. */
  public openPromptFromPanel(): void {
    return this.OpenPromptFromPanel();
  }

  public TestPrompt(promptId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    
    // Use the test harness service for window management features
    this.testHarnessService.openForPrompt(promptId);
  }

  /** @deprecated Use {@link TestPrompt}. */
  public testPrompt(promptId: string, event?: Event): void {
    return this.TestPrompt(promptId, event);
  }

  public CloseTestHarness(): void {
    // No longer needed - window manages its own closure
    this.SelectedPromptForTest = null;
  }

  /** @deprecated Use {@link CloseTestHarness}. */
  public closeTestHarness(): void {
    return this.CloseTestHarness();
  }

  public CreateNewPrompt(): void {
    // Use the standard MemberJunction pattern to open a new AI Prompt form
    // Empty CompositeKey indicates a new record
    this.navigationService.OpenEntityRecord('MJ: AI Prompts', new CompositeKey([]));
  }

  /** @deprecated Use {@link CreateNewPrompt}. */
  public createNewPrompt(): void {
    return this.CreateNewPrompt();
  }

  public GetPromptIcon(prompt: PromptWithTemplate): string {
    if (prompt.TypeName?.toLowerCase().includes('system')) {
      return 'fa-solid fa-cogs';
    } else if (prompt.TypeName?.toLowerCase().includes('user')) {
      return 'fa-solid fa-user';
    } else if (prompt.TypeName?.toLowerCase().includes('chat')) {
      return 'fa-solid fa-comments';
    }
    return 'fa-solid fa-comment-dots';
  }

  /** @deprecated Use {@link GetPromptIcon}. */
  public getPromptIcon(prompt: PromptWithTemplate): string {
    return this.GetPromptIcon(prompt);
  }

  public GetStatusClass(status: string): string {
    return status === 'Active' ? 'active' : 'inactive';
  }

  /** @deprecated Use {@link GetStatusClass}. */
  public getStatusClass(status: string): string {
    return this.GetStatusClass(status);
  }

  public get HasActiveFilters(): boolean {
    return this.SearchTerm !== '' ||
           this.SelectedCategory !== 'all' ||
           this.SelectedType !== 'all' ||
           this.SelectedStatus !== 'all';
  }

  /** @deprecated Use {@link HasActiveFilters}. */
  public get hasActiveFilters(): boolean {
    return this.HasActiveFilters;
  }

  /** Number of currently-applied filter criteria inside the popover (excludes searchTerm — surfaced separately in the header toolbar). */
  public get ActiveFilterCount(): number {
    let n = 0;
    if (this.SelectedCategory && this.SelectedCategory !== 'all') n++;
    if (this.SelectedType && this.SelectedType !== 'all') n++;
    if (this.SelectedStatus && this.SelectedStatus !== 'all') n++;
    return n;
  }

  /** Reset only the filters inside the popover (not the toolbar search). */
  public ResetPopoverFilters(): void {
    this.SelectedCategory = 'all';
    this.SelectedType = 'all';
    this.SelectedStatus = 'all';
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ResetPopoverFilters}. */
  public resetPopoverFilters(): void {
    return this.ResetPopoverFilters();
  }

  /** View-mode options for the shared <mj-view-toggle>. */
  public readonly PromptViewOptions = [
    { key: 'grid', icon: 'fa-solid fa-grip', title: 'Grid View' },
    { key: 'list', icon: 'fa-solid fa-list', title: 'List View' },
  ];

  /** @deprecated Use {@link PromptViewOptions}. */
  public get promptViewOptions() {
    return this.PromptViewOptions;
  }

  /** Values record consumed by the centralized <mj-filter-panel> (excludes searchTerm — surfaced in the page-header toolbar). */
  public get PromptFilterValues(): Record<string, unknown> {
    return {
      categoryId: this.SelectedCategory,
      typeId: this.SelectedType,
      status: this.SelectedStatus,
    };
  }

  /** @deprecated Use {@link PromptFilterValues}. */
  public get promptFilterValues(): Record<string, unknown> {
    return this.PromptFilterValues;
  }

  /** Field config consumed by the centralized <mj-filter-panel>. */
  public get PromptFilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'categoryId',
        type: 'dropdown',
        label: 'Category',
        icon: 'fa-solid fa-folder',
        filterable: this.Categories.length > 10,
        options: [
          { text: 'All Categories', value: 'all' },
          ...this.Categories.map(c => ({ text: c.Name ?? '', value: c.ID })),
        ],
      },
      {
        key: 'typeId',
        type: 'dropdown',
        label: 'Type',
        icon: 'fa-solid fa-tag',
        options: [
          { text: 'All Types', value: 'all' },
          ...this.Types.map(t => ({ text: t.Name ?? '', value: t.ID })),
        ],
      },
      {
        key: 'status',
        type: 'dropdown',
        label: 'Status',
        icon: 'fa-solid fa-toggle-on',
        options: [
          { text: 'All Statuses', value: 'all' },
          { text: 'Active',       value: 'active' },
          { text: 'Inactive',     value: 'inactive' },
        ],
      },
    ];
  }

  /** @deprecated Use {@link PromptFilterFields}. */
  public get promptFilterFields(): FilterFieldConfig[] {
    return this.PromptFilterFields;
  }

  /** Receive the updated values record from <mj-filter-panel> and apply it. */
  public OnFilterValuesChange(values: Record<string, unknown>): void {
    this.SelectedCategory = (values['categoryId'] as string) ?? 'all';
    this.SelectedType     = (values['typeId']     as string) ?? 'all';
    this.SelectedStatus   = (values['status']     as string) ?? 'all';
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnFilterValuesChange}. */
  public onFilterValuesChange(values: Record<string, unknown>): void {
    return this.OnFilterValuesChange(values);
  }

  public get FilteredPromptsAsEntities(): MJAIPromptEntityExtended[] {
    // The prompts are already MJAIPromptEntityExtended instances with extra properties
    return this.FilteredPrompts as MJAIPromptEntityExtended[];
  }

  /** @deprecated Use {@link FilteredPromptsAsEntities}. */
  public get filteredPromptsAsEntities(): MJAIPromptEntityExtended[] {
    return this.FilteredPromptsAsEntities;
  }

  public ClearFilters(): void {
    this.SearchTerm = '';
    this.SelectedCategory = 'all';
    this.SelectedType = 'all';
    this.SelectedStatus = 'all';
    this.searchSubject.next('');
    this.ApplyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ClearFilters}. */
  public clearFilters(): void {
    return this.ClearFilters();
  }

  /** Empty-state CTA: clear filters when the list is narrowed, otherwise create. */
  public OnEmptyStateAction(): void {
    if (this.HasActiveFilters) {
      this.ClearFilters();
    } else {
      this.CreateNewPrompt();
    }
  }

  /** @deprecated Use {@link OnEmptyStateAction}. */
  public onEmptyStateAction(): void {
    return this.OnEmptyStateAction();
  }

  // BaseResourceComponent abstract method implementations
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Prompts';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comment-dots';
  }
}