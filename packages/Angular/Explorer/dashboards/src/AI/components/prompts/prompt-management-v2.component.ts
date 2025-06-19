import { Component, OnInit, OnDestroy, Output, EventEmitter, Input } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AIPromptEntity, AIPromptTypeEntity, AIPromptCategoryEntity, TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';

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

  constructor(
    private sharedService: SharedService
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
          OrderBy: 'Name',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'AI Prompt Categories',
          OrderBy: 'Name',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'AI Prompt Types',
          OrderBy: 'Name',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Templates',
          ExtraFilter: `EntityID IN (SELECT ID FROM AIPrompt)`,
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Template Contents',
          MaxRows: 5000,
          ResultType: 'entity_object'
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

      // Combine the data
      this.prompts = (promptResults.Results as AIPromptEntity[]).map(prompt => {
        const template = templateMap.get(prompt.ID);
        
        // Use GetAll() to get all properties as a plain object since BaseEntity uses getters
        return {
          ...prompt.GetAll(),
          TemplateEntity: template,
          TemplateContents: template ? (templateContentMap.get(template.ID) || []) : [],
          CategoryName: prompt.CategoryID ? categoryMap.get(prompt.CategoryID) || 'Unknown' : 'Uncategorized',
          TypeName: prompt.TypeID ? typeMap.get(prompt.TypeID) || 'Unknown' : 'Untyped'
        } as PromptWithTemplate;
      });

      this.filteredPrompts = [...this.prompts];
      this.applyFilters();
      this.emitStateChange();
    } catch (error) {
      console.error('Error loading prompt data:', error);
      this.sharedService.CreateSimpleNotification('Error loading prompts', 'error', 3000);
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

  public async createNewPrompt(): Promise<void> {
    try {
      const md = new Metadata();
      const newPrompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts');
      
      if (newPrompt) {
        newPrompt.Name = 'New Prompt';
        newPrompt.Status = 'Active';
        
        if (await newPrompt.Save()) {
          this.openEntityRecord.emit({
            entityName: 'AI Prompts',
            recordId: newPrompt.ID
          });
          
          // Reload the data
          await this.loadInitialData();
        }
      }
    } catch (error) {
      console.error('Error creating new prompt:', error);
      this.sharedService.CreateSimpleNotification('Error creating prompt', 'error', 3000);
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
    // Cast PromptWithTemplate[] to AIPromptEntity[] for the priority matrix
    return this.filteredPrompts as unknown as AIPromptEntity[];
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