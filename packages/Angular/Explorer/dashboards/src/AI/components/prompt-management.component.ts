import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { AIPromptEntity, AIPromptCategoryEntity, AIPromptTypeEntity, AIPromptModelEntity, AIModelEntity, TemplateEntity } from '@memberjunction/core-entities';
import { Subject, combineLatest, BehaviorSubject } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';

export interface PromptFilter {
  searchTerm: string;
  categoryId: string | null;
  typeId: string | null;
  status: string | null;
  responseFormat: string | null;
  selectionStrategy: string | null;
}

export interface PromptDisplayData {
  prompt: AIPromptEntity;
  category: AIPromptCategoryEntity | null;
  type: AIPromptTypeEntity | null;
  template: TemplateEntity | null;
  modelCount: number;
  statusDisplay: string;
  responseFormatDisplay: string;
}

export interface PromptModelDisplayData {
  promptModel: AIPromptModelEntity;
  prompt: AIPromptEntity | null;
  aiModel: AIModelEntity | null;
  statusDisplay: string;
  priorityDisplay: string;
  executionGroupDisplay: string;
}

@Component({
  selector: 'app-prompt-management',
  templateUrl: './prompt-management.component.html',
  styleUrls: ['./prompt-management.component.scss']
})
export class PromptManagementComponent implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();

  // Data properties
  public prompts: AIPromptEntity[] = [];
  public categories: AIPromptCategoryEntity[] = [];
  public types: AIPromptTypeEntity[] = [];
  public templates: TemplateEntity[] = [];
  public models: AIModelEntity[] = [];
  public promptModels: AIPromptModelEntity[] = [];
  public filteredPrompts: PromptDisplayData[] = [];
  public selectedPromptModels: PromptModelDisplayData[] = [];
  
  // UI state
  public isLoading = false;
  public loadingMessage = 'Loading AI prompts...';
  public error: string | null = null;
  public filtersVisible = false;
  public selectedPrompt: AIPromptEntity | null = null;
  public activeView: 'prompts' | 'models' = 'prompts';
  
  // Filter state
  public filters: PromptFilter = {
    searchTerm: '',
    categoryId: null,
    typeId: null,
    status: null,
    responseFormat: null,
    selectionStrategy: null
  };
  
  // Additional UI state
  public filteredPromptModels: PromptModelDisplayData[] = [];
  
  // Search and filter subjects
  private searchSubject = new BehaviorSubject<string>('');
  private filterSubject = new BehaviorSubject<PromptFilter>(this.filters);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.setupFilterSubscriptions();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFilterSubscriptions(): void {
    // Debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.filters.searchTerm = searchTerm;
      this.applyFilters();
    });

    // Combined filter changes
    combineLatest([
      this.filterSubject.pipe(debounceTime(100)),
      this.searchSubject.pipe(debounceTime(300))
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  public async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      this.loadingMessage = 'Loading AI prompts...';

      // Load all required data in parallel
      const [promptsResult, categoriesResult, typesResult, templatesResult, modelsResult, promptModelsResult] = await Promise.all([
        this.loadPrompts(),
        this.loadCategories(),
        this.loadTypes(),
        this.loadTemplates(),
        this.loadModels(),
        this.loadPromptModels()
      ]);

      if (promptsResult && categoriesResult && typesResult && templatesResult && modelsResult && promptModelsResult) {
        this.applyFilters();
        LogStatus('Prompt management data loaded successfully');
      }
    } catch (error) {
      this.error = 'Failed to load prompt data. Please try again.';
      LogError('Error loading prompt management data: ' + String(error));
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPrompts(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Prompts',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.prompts = result.Results as AIPromptEntity[];
        return true;
      } else {
        throw new Error('Failed to load AI prompts');
      }
    } catch (error) {
      LogError('Error loading AI prompts: ' + String(error));
      return false;
    }
  }

  private async loadCategories(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Prompt Categories',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.categories = result.Results as AIPromptCategoryEntity[];
        return true;
      } else {
        throw new Error('Failed to load AI prompt categories');
      }
    } catch (error) {
      LogError('Error loading AI prompt categories: ' + String(error));
      return false;
    }
  }

  private async loadTypes(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Prompt Types',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.types = result.Results as AIPromptTypeEntity[];
        return true;
      } else {
        throw new Error('Failed to load AI prompt types');
      }
    } catch (error) {
      LogError('Error loading AI prompt types: ' + String(error));
      return false;
    }
  }

  private async loadTemplates(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'Templates',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.templates = result.Results as TemplateEntity[];
        return true;
      } else {
        throw new Error('Failed to load templates');
      }
    } catch (error) {
      LogError('Error loading templates: ' + String(error));
      return false;
    }
  }

  private async loadModels(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Models',
        ExtraFilter: '',
        OrderBy: 'Name',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.models = result.Results as AIModelEntity[];
        return true;
      } else {
        throw new Error('Failed to load AI models');
      }
    } catch (error) {
      LogError('Error loading AI models: ' + String(error));
      return false;
    }
  }

  private async loadPromptModels(): Promise<boolean> {
    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'AI Prompt Models',
        ExtraFilter: '',
        OrderBy: 'Priority DESC, ExecutionGroup',
        UserSearchString: '',
        OverrideExcludeFilter: '',
        SaveViewResults: false
      });

      if (result && result.Success && result.Results) {
        this.promptModels = result.Results as AIPromptModelEntity[];
        this.filteredPromptModels = this.promptModels.map(pm => this.transformPromptModelToDisplayData(pm));
        return true;
      } else {
        throw new Error('Failed to load AI prompt models');
      }
    } catch (error) {
      LogError('Error loading AI prompt models: ' + String(error));
      return false;
    }
  }

  public onSearchChange(searchTerm: string): void {
    this.searchSubject.next(searchTerm);
  }

  public onFilterChange(): void {
    this.filterSubject.next({ ...this.filters });
  }

  public toggleFiltersVisible(): void {
    this.filtersVisible = !this.filtersVisible;
  }

  public clearFilters(): void {
    this.filters = {
      searchTerm: '',
      categoryId: null,
      typeId: null,
      status: null,
      responseFormat: null,
      selectionStrategy: null
    };
    this.searchSubject.next('');
    this.filterSubject.next(this.filters);
  }

  public switchView(view: 'prompts' | 'models'): void {
    this.activeView = view;
    if (view === 'models' && this.selectedPrompt) {
      this.loadPromptModels();
    }
  }

  private applyFilters(): void {
    let filtered = [...this.prompts];

    // Apply search filter
    if (this.filters.searchTerm) {
      const searchLower = this.filters.searchTerm.toLowerCase();
      filtered = filtered.filter(prompt => 
        prompt.Name?.toLowerCase().includes(searchLower) ||
        prompt.Description?.toLowerCase().includes(searchLower) ||
        this.getCategoryName(prompt)?.toLowerCase().includes(searchLower) ||
        this.getTypeName(prompt)?.toLowerCase().includes(searchLower)
      );
    }

    // Apply category filter
    if (this.filters.categoryId) {
      filtered = filtered.filter(prompt => prompt.CategoryID === this.filters.categoryId);
    }

    // Apply type filter
    if (this.filters.typeId) {
      filtered = filtered.filter(prompt => prompt.TypeID === this.filters.typeId);
    }

    // Apply status filter
    if (this.filters.status) {
      filtered = filtered.filter(prompt => prompt.Status === this.filters.status);
    }

    // Apply response format filter
    if (this.filters.responseFormat) {
      filtered = filtered.filter(prompt => prompt.ResponseFormat === this.filters.responseFormat);
    }

    // Apply selection strategy filter
    if (this.filters.selectionStrategy) {
      filtered = filtered.filter(prompt => prompt.SelectionStrategy === this.filters.selectionStrategy);
    }

    // Transform to display data
    this.filteredPrompts = filtered.map(prompt => this.transformToDisplayData(prompt));
  }

  private transformToDisplayData(prompt: AIPromptEntity): PromptDisplayData {
    const modelCount = this.promptModels.filter(pm => pm.PromptID === prompt.ID).length;
    
    return {
      prompt,
      category: this.getCategory(prompt),
      type: this.getType(prompt),
      template: this.getTemplate(prompt),
      modelCount,
      statusDisplay: prompt.Status || 'Unknown',
      responseFormatDisplay: prompt.ResponseFormat || 'Any'
    };
  }

  private getCategory(prompt: AIPromptEntity): AIPromptCategoryEntity | null {
    return this.categories.find(c => c.ID === prompt.CategoryID) || null;
  }

  private getCategoryName(prompt: AIPromptEntity): string | null {
    const category = this.getCategory(prompt);
    return category?.Name || null;
  }

  private getType(prompt: AIPromptEntity): AIPromptTypeEntity | null {
    return this.types.find(t => t.ID === prompt.TypeID) || null;
  }

  private getTypeName(prompt: AIPromptEntity): string | null {
    const type = this.getType(prompt);
    return type?.Name || null;
  }

  private getTemplate(prompt: AIPromptEntity): TemplateEntity | null {
    return this.templates.find(t => t.ID === prompt.TemplateID) || null;
  }

  public onOpenPrompt(prompt: AIPromptEntity): void {
    this.openEntityRecord.emit({
      entityName: 'AI Prompts',
      recordId: prompt.ID!
    });
  }

  public onOpenPromptModel(promptModel: AIPromptModelEntity): void {
    this.openEntityRecord.emit({
      entityName: 'AI Prompt Models',
      recordId: promptModel.ID!
    });
  }

  public onSelectPrompt(prompt: AIPromptEntity): void {
    this.selectedPrompt = prompt;
    this.selectedPromptModels = this.promptModels
      .filter(pm => pm.PromptID === prompt.ID)
      .map(pm => this.transformPromptModelToDisplayData(pm));
  }

  private transformPromptModelToDisplayData(promptModel: AIPromptModelEntity): PromptModelDisplayData {
    return {
      promptModel,
      prompt: this.prompts.find(p => p.ID === promptModel.PromptID) || null,
      aiModel: this.models.find(m => m.ID === promptModel.ModelID) || null,
      statusDisplay: promptModel.Status || 'Unknown',
      priorityDisplay: `Priority: ${promptModel.Priority || 0}`,
      executionGroupDisplay: `Group: ${promptModel.ExecutionGroup || 0}`
    };
  }

  public async createNewPrompt(): Promise<void> {
    try {
      const md = Metadata.Provider;
      if (!md) {
        throw new Error('Metadata provider not available');
      }

      this.openEntityRecord.emit({
        entityName: 'AI Prompts',
        recordId: 'new'
      });
    } catch (error) {
      LogError('Error creating new AI prompt: ' + String(error));
    }
  }

  public async createNewPromptModel(): Promise<void> {
    try {
      const md = Metadata.Provider;
      if (!md) {
        throw new Error('Metadata provider not available');
      }

      this.openEntityRecord.emit({
        entityName: 'AI Prompt Models',
        recordId: 'new'
      });
    } catch (error) {
      LogError('Error creating new AI prompt model: ' + String(error));
    }
  }

  public setActiveView(view: 'prompts' | 'models'): void {
    this.activeView = view;
    if (view === 'models') {
      this.filteredPromptModels = this.promptModels.map(pm => this.transformPromptModelToDisplayData(pm));
    }
  }

  public updateFilter(key: keyof PromptFilter, value: string | null): void {
    (this.filters as any)[key] = value;
    this.filterSubject.next({ ...this.filters });
  }

  public onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateFilter('searchTerm', value);
  }

  public onCategoryChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter('categoryId', value || null);
  }

  public onTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter('typeId', value || null);
  }

  public onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter('status', value || null);
  }

  public onResponseFormatChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter('responseFormat', value || null);
  }

  public onSelectionStrategyChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilter('selectionStrategy', value || null);
  }

  public editPrompt(prompt: AIPromptEntity): void {
    this.openEntityRecord.emit({
      entityName: 'AI Prompts',
      recordId: prompt.ID!
    });
  }

  public editPromptModel(promptModel: AIPromptModelEntity, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.openEntityRecord.emit({
      entityName: 'AI Prompt Models', 
      recordId: promptModel.ID!
    });
  }

  public testPrompt(prompt: AIPromptEntity, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    // TODO: Implement prompt testing functionality
    console.log('Testing prompt:', prompt.Name);
  }

  public testPromptModel(promptModel: AIPromptModelEntity, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    // TODO: Implement prompt model testing functionality
    console.log('Testing prompt model:', promptModel.ID);
  }

  public duplicatePrompt(prompt: AIPromptEntity, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    // TODO: Implement prompt duplication functionality
    console.log('Duplicating prompt:', prompt.Name);
  }

  public async togglePromptStatus(prompt: AIPromptEntity, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    try {
      const md = Metadata.Provider;
      if (!md) {
        throw new Error('Metadata provider not available');
      }

      const promptToUpdate = await md.GetEntityObject<AIPromptEntity>('AI Prompts', md.CurrentUser);
      await promptToUpdate.Load(prompt.ID!);
      
      // Cycle through statuses: Active -> Disabled -> Pending -> Active
      switch (promptToUpdate.Status) {
        case 'Active':
          promptToUpdate.Status = 'Disabled';
          break;
        case 'Disabled':
          promptToUpdate.Status = 'Pending';
          break;
        case 'Pending':
        default:
          promptToUpdate.Status = 'Active';
          break;
      }
      
      const result = await promptToUpdate.Save();
      
      if (result) {
        // Update local data
        const index = this.prompts.findIndex(p => p.ID === prompt.ID);
        if (index >= 0) {
          this.prompts[index] = Object.assign({}, this.prompts[index], { Status: promptToUpdate.Status });
          this.applyFilters();
        }
        LogStatus(`Prompt ${promptToUpdate.Name} status changed to ${promptToUpdate.Status}`);
      }
    } catch (error) {
      LogError('Error updating prompt status: ' + String(error));
    }
  }
}