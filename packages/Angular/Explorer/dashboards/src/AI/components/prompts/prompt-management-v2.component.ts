import { Component, OnInit, OnDestroy, Output, EventEmitter, Input } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AIPromptEntity, AIPromptTypeEntity, AIPromptCategoryEntity, TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { MJNotificationService } from '@memberjunction/ng-notifications';

interface PromptWithTemplate extends Omit<AIPromptEntity, 'Template'> {
  Template: string; // From AIPromptEntity (view field)
  TemplateEntity?: TemplateEntity; // Our added field for the actual template entity
  TemplateContents?: TemplateContentEntity[];
  CategoryName?: string;
  TypeName?: string;
}

@Component({
  selector: 'app-prompt-management-v2',
  templateUrl: './prompt-management-v2.component.html',
  styleUrls: ['./prompt-management-v2.component.scss']
})
export class PromptManagementV2Component implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();
  @Output() stateChange = new EventEmitter<any>();
  @Input() initialState: any = null;

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
  public selectedPromptForTest: AIPromptEntity | null = null;

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
    private router: Router
  ) {}

  ngOnInit(): void {
    this.setupSearchListener();
    this.startLoadingMessages();
    this.loadInitialData();
    
    if (this.initialState) {
      this.applyInitialState(this.initialState);
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
    });
  }

  private startLoadingMessages(): void {
    this.loadingMessageInterval = setInterval(() => {
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % this.loadingMessages.length;
      this.currentLoadingMessage = this.loadingMessages[this.loadingMessageIndex];
    }, 2000);
  }

  private async loadInitialData(): Promise<void> {
    try {
      const rv = new RunView();
      const md = new Metadata();

      // Load all data in parallel using RunViews
      const [promptResults, categoryResults, typeResults, templateResults, templateContentResults] = await rv.RunViews([
        {
          EntityName: 'AI Prompts',
          OrderBy: 'Name' 
        },
        {
          EntityName: 'AI Prompt Categories',
          OrderBy: 'Name', 
        },
        {
          EntityName: 'AI Prompt Types',
          OrderBy: 'Name' 
        },
        {
          EntityName: 'Templates',
          ExtraFilter: `ID IN (SELECT TemplateID FROM __mj.AIPrompt)` 
        },
        {
          EntityName: 'Template Contents' 
        }
      ]);

      this.categories = categoryResults.Results as AIPromptCategoryEntity[];
      this.types = typeResults.Results as AIPromptTypeEntity[];

      // Combine prompts with their templates
      const templates = templateResults.Results as TemplateEntity[];
      const templateContents = templateContentResults.Results as TemplateContentEntity[];
      
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
      this.prompts = (promptResults.Results as AIPromptEntity[]).map(prompt => {
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
      this.emitStateChange();
    } catch (error) {
      console.error('Error loading prompt data:', error);
      MJNotificationService.Instance.CreateSimpleNotification('Error loading prompts', 'error', 3000);
    } finally {
      this.isLoading = false;
      if (this.loadingMessageInterval) {
        clearInterval(this.loadingMessageInterval);
      }
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
    this.emitStateChange();
  }

  public toggleFilterPanel(): void {
    this.showFilters = !this.showFilters;
    this.emitStateChange();
  }

  public setViewMode(mode: 'grid' | 'list' | 'priority-matrix'): void {
    this.viewMode = mode;
    this.expandedPromptId = null;
    this.emitStateChange();
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

    this.emitStateChange();
  }

  public onCategoryChange(categoryId: string): void {
    this.selectedCategory = categoryId;
    this.applyFilters();
  }

  public onTypeChange(typeId: string): void {
    this.selectedType = typeId;
    this.applyFilters();
  }

  public onStatusChange(status: string): void {
    this.selectedStatus = status;
    this.applyFilters();
  }

  public openPrompt(promptId: string): void {
    this.openEntityRecord.emit({
      entityName: 'AI Prompts',
      recordId: promptId
    });
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
    try {
      // Navigate to new record form using the MemberJunction pattern
      // Empty third parameter means new record
      this.router.navigate(
        ['resource', 'record', ''], // Empty record ID = new record
        { 
          queryParams: { 
            Entity: 'AI Prompts'
            // Could add NewRecordValues here for pre-populated defaults if needed
          } 
        }
      );
    } catch (error) {
      console.error('Error navigating to new prompt form:', error);
      MJNotificationService.Instance.CreateSimpleNotification('Error opening new prompt form', 'error', 3000);
    }
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

  private emitStateChange(): void {
    this.stateChange.emit({
      viewMode: this.viewMode,
      showFilters: this.showFilters,
      searchTerm: this.searchTerm,
      selectedCategory: this.selectedCategory,
      selectedType: this.selectedType,
      selectedStatus: this.selectedStatus,
      promptCount: this.filteredPrompts.length
    });
  }

  public get hasActiveFilters(): boolean {
    return this.searchTerm !== '' || 
           this.selectedCategory !== 'all' || 
           this.selectedType !== 'all' || 
           this.selectedStatus !== 'all';
  }

  public get filteredPromptsAsEntities(): AIPromptEntity[] {
    // The prompts are already AIPromptEntity instances with extra properties
    return this.filteredPrompts as AIPromptEntity[];
  }

  public clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = 'all';
    this.selectedType = 'all';
    this.selectedStatus = 'all';
    this.searchSubject.next('');
    this.applyFilters();
  }
}