import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { RunView, Metadata, LogError, LogStatus } from '@memberjunction/core';
import { AIPromptEntity, AIPromptCategoryEntity, AIPromptTypeEntity, TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';

interface PromptWithTemplate {
  prompt: AIPromptEntity;
  template: TemplateEntity | null;
  templateContent: TemplateContentEntity | null;
  category: AIPromptCategoryEntity | null;
  type: AIPromptTypeEntity | null;
}

@Component({
  selector: 'app-prompt-management',
  templateUrl: './prompt-management.component.html',
  styleUrls: ['./prompt-management.component.scss']
})
export class PromptManagementComponent implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();
  @Output() stateChange = new EventEmitter<any>();

  // Data properties
  public prompts: AIPromptEntity[] = [];
  public categories: AIPromptCategoryEntity[] = [];
  public types: AIPromptTypeEntity[] = [];
  public templates: TemplateEntity[] = [];
  public templateContents: TemplateContentEntity[] = [];
  public promptsWithTemplates: PromptWithTemplate[] = [];
  public filteredPrompts: PromptWithTemplate[] = [];

  // UI state
  public isLoading = false;
  public loadingMessage = 'Loading prompts...';
  public error: string | null = null;
  public currentView: 'list' | 'editor' = 'list';
  public currentSubView: 'list' | 'priority-matrix' | 'version-control' = 'list';
  public selectedPrompt: PromptWithTemplate | null = null;
  public isEditing = false;
  public isDirty = false;

  // Editor state
  public editorContent = '';
  public editorMode = 'nunjucks';
  public showPreview = false;
  public supportedLanguages: LanguageDescription[] = languages;
  public editorLanguage = 'jinja2';
  
  // Category creation
  public newCategoryName = '';
  public showNewCategoryInput = false;
  
  // Splitter panel width
  public promptDetailsPanelWidth = 300;
  
  // Filter panel visibility
  public filterPanelVisible = true;
  
  // Current filters object for the filter panel
  public currentFilters = {
    searchTerm: '',
    categoryId: 'all',
    typeId: 'all',
    status: 'all'
  };

  // Filter state
  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedCategory$ = new BehaviorSubject<string>('all');
  public selectedType$ = new BehaviorSubject<string>('all');
  public selectedStatus$ = new BehaviorSubject<string>('all');

  public categoryOptions: Array<{text: string; value: string}> = [];
  public typeOptions: Array<{text: string; value: string}> = [];
  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Pending', value: 'Pending' },
    { text: 'Disabled', value: 'Disabled' }
  ];

  private destroy$ = new Subject<void>();

  constructor(private mjNotificationsService: MJNotificationService) {}
  
  public toggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;
    this.emitStateChange();
  }
  
  public onMainSplitterChange(event: any): void {
    // Handle main splitter layout changes if needed
    this.emitStateChange();
  }
  
  public onFiltersChange(filters: any): void {
    this.currentFilters = { ...filters };
    // Update the BehaviorSubjects to match the filter panel
    this.searchTerm$.next(filters.searchTerm);
    this.selectedCategory$.next(filters.categoryId);
    this.selectedType$.next(filters.typeId);
    this.selectedStatus$.next(filters.status);
  }
  
  public onFilterChange(): void {
    // This will be called by the filter panel, filtering is handled by existing logic
  }
  
  public onResetFilters(): void {
    this.currentFilters = {
      searchTerm: '',
      categoryId: 'all',
      typeId: 'all',
      status: 'all'
    };
    this.searchTerm$.next('');
    this.selectedCategory$.next('all');
    this.selectedType$.next('all');
    this.selectedStatus$.next('all');
  }

  ngOnInit(): void {
    this.setupFilters();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFilters(): void {
    combineLatest([
      this.searchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.selectedCategory$.pipe(distinctUntilChanged()),
      this.selectedType$.pipe(distinctUntilChanged()),
      this.selectedStatus$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      this.loadingMessage = 'Loading prompts and templates...';

      const [prompts, categories, types, templates, templateContents] = await Promise.all([
        this.loadPrompts(),
        this.loadCategories(),
        this.loadTypes(),
        this.loadTemplates(),
        this.loadTemplateContents()
      ]);

      this.prompts = prompts;
      this.categories = categories;
      this.types = types;
      this.templates = templates;
      this.templateContents = templateContents;

      this.buildPromptTemplateRelationships();
      this.buildFilterOptions();
      this.applyFilters();

      LogStatus('Prompt management data loaded successfully');
    } catch (error) {
      this.error = 'Failed to load prompt data. Please try again.';
      LogError('Error loading prompt management data', undefined, error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPrompts(): Promise<AIPromptEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'AI Prompts',
      ExtraFilter: '',
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });

    if (result && result.Success && result.Results) {
      return result.Results as AIPromptEntity[];
    } else {
      throw new Error('Failed to load AI prompts');
    }
  }

  private async loadCategories(): Promise<AIPromptCategoryEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'AI Prompt Categories',
      ExtraFilter: '',
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });

    if (result && result.Success && result.Results) {
      return result.Results as AIPromptCategoryEntity[];
    } else {
      throw new Error('Failed to load AI prompt categories');
    }
  }

  private async loadTypes(): Promise<AIPromptTypeEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'AI Prompt Types',
      ExtraFilter: '',
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });

    if (result && result.Success && result.Results) {
      return result.Results as AIPromptTypeEntity[];
    } else {
      throw new Error('Failed to load AI prompt types');
    }
  }

  private async loadTemplates(): Promise<TemplateEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Templates',
      ExtraFilter: '',
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });

    if (result && result.Success && result.Results) {
      return result.Results as TemplateEntity[];
    } else {
      throw new Error('Failed to load templates');
    }
  }

  private async loadTemplateContents(): Promise<TemplateContentEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Template Contents',
      ExtraFilter: '',
      OrderBy: 'TemplateID',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });

    if (result && result.Success && result.Results) {
      return result.Results as TemplateContentEntity[];
    } else {
      throw new Error('Failed to load template contents');
    }
  }

  private buildPromptTemplateRelationships(): void {
    this.promptsWithTemplates = this.prompts.map(prompt => {
      const template = this.templates.find(t => t.ID === prompt.TemplateID) || null;
      const templateContent = template ? 
        this.templateContents.find(tc => tc.TemplateID === template.ID) || null : null;
      const category = this.categories.find(c => c.ID === prompt.CategoryID) || null;
      const type = this.types.find(t => t.ID === prompt.TypeID) || null;

      return {
        prompt,
        template,
        templateContent,
        category,
        type
      };
    });
  }

  private buildFilterOptions(): void {
    this.categoryOptions = [
      { text: 'All Categories', value: 'all' },
      ...this.categories.map(cat => ({ text: cat.Name, value: cat.ID }))
    ];

    this.typeOptions = [
      { text: 'All Types', value: 'all' },
      ...this.types.map(type => ({ text: type.Name, value: type.ID }))
    ];
  }

  private applyFilters(): void {
    let filtered = [...this.promptsWithTemplates];

    // Apply search filter
    const searchTerm = this.searchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.prompt.Name.toLowerCase().includes(searchTerm) ||
        (item.prompt.Description || '').toLowerCase().includes(searchTerm) ||
        (item.category?.Name || '').toLowerCase().includes(searchTerm) ||
        (item.template?.Name || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply category filter
    const categoryId = this.selectedCategory$.value;
    if (categoryId !== 'all') {
      filtered = filtered.filter(item => item.prompt.CategoryID === categoryId);
    }

    // Apply type filter
    const typeId = this.selectedType$.value;
    if (typeId !== 'all') {
      filtered = filtered.filter(item => item.prompt.TypeID === typeId);
    }

    // Apply status filter
    const status = this.selectedStatus$.value;
    if (status !== 'all') {
      filtered = filtered.filter(item => item.prompt.Status === status);
    }

    this.filteredPrompts = filtered;
  }

  // Event handlers
  public onSearchChange(searchTerm: string): void {
    this.searchTerm$.next(searchTerm);
  }

  public onCategoryFilterChange(categoryId: string): void {
    this.selectedCategory$.next(categoryId);
  }

  public onTypeFilterChange(typeId: string): void {
    this.selectedType$.next(typeId);
  }

  public onStatusFilterChange(status: string): void {
    this.selectedStatus$.next(status);
  }

  // Navigation methods
  public viewPrompt(promptWithTemplate: PromptWithTemplate): void {
    this.selectedPrompt = promptWithTemplate;
    this.currentView = 'editor';
    this.isEditing = false;
    this.isDirty = false;
    this.editorContent = promptWithTemplate.templateContent?.TemplateText || '';
    this.emitStateChange();
  }

  public editPrompt(promptWithTemplate: PromptWithTemplate): void {
    this.selectedPrompt = promptWithTemplate;
    this.currentView = 'editor';
    this.isEditing = true;
    this.isDirty = false;
    this.editorContent = promptWithTemplate.templateContent?.TemplateText || '';
    this.emitStateChange();
  }

  public async createNewCategory(): Promise<string | null> {
    if (!this.newCategoryName.trim()) return null;
    
    try {
      const md = new Metadata();
      if (!md) throw new Error('Metadata provider not available');
      
      const category = await md.GetEntityObject<AIPromptCategoryEntity>('AI Prompt Categories', md.CurrentUser);
      category.Name = this.newCategoryName.trim();
      category.Description = 'Category created during prompt editing';
      
      const result = await category.Save();
      if (result) {
        LogStatus('Category created successfully');
        this.mjNotificationsService.CreateSimpleNotification('Category created successfully', 'success', 2000);
        await this.loadCategories();
        this.buildFilterOptions();
        // Update filter panel categories
        this.updateFilterPanelCategories();
        this.newCategoryName = '';
        this.showNewCategoryInput = false;
        return category.ID;
      } else {
        // Handle save failure
        const errorMessage = category.LatestResult?.Message || 'Unknown error occurred while saving category';
        console.error('Category save failed:', category.LatestResult);
        LogError('Category save failed', undefined, category.LatestResult);
        this.mjNotificationsService.CreateSimpleNotification(errorMessage, 'error', 3500);
        this.error = `Failed to create category: ${errorMessage}`;
        return null;
      }
    } catch (error) {
      LogError('Error creating category', undefined, error);
      this.mjNotificationsService.CreateSimpleNotification('Failed to create category. Please try again.', 'error', 3500);
      this.error = 'Failed to create category. Please try again.';
      return null;
    }
  }
  
  private updateFilterPanelCategories(): void {
    // Trigger update of filter panel categories when new ones are created
    // This ensures the filter panel dropdown is updated
  }
  
  public onCategoryChange(categoryId: string): void {
    if (categoryId === 'new') {
      this.showNewCategoryInput = true;
      this.selectedPrompt!.prompt.CategoryID = ''; // Reset to empty when creating new
    } else {
      this.showNewCategoryInput = false;
      this.isDirty = true;
    }
  }
  
  public async onCreateNewCategoryKeyup(event: KeyboardEvent): Promise<void> {
    if (event.key === 'Enter') {
      await this.createAndSelectNewCategory();
    } else if (event.key === 'Escape') {
      this.newCategoryName = '';
      this.showNewCategoryInput = false;
    }
  }
  
  public cancelNewCategory(): void {
    this.newCategoryName = '';
    this.showNewCategoryInput = false;
  }
  
  public async createAndSelectNewCategory(): Promise<void> {
    const newCategoryId = await this.createNewCategory();
    if (newCategoryId && this.selectedPrompt) {
      this.selectedPrompt.prompt.CategoryID = newCategoryId;
      this.isDirty = true;
    }
  }

  public async createNewPrompt(): Promise<void> {
    // Create a new prompt structure
    const md = new Metadata();
    if (!md) return;
    
    const promptEntity = await md.GetEntityObject<AIPromptEntity>('AI Prompts', md.CurrentUser);
    promptEntity.Name = 'New Prompt';
    promptEntity.Description = '';
    promptEntity.CategoryID = '';
    promptEntity.TypeID = '';
    promptEntity.Status = 'Pending';
    promptEntity.TemplateID = '';
    
    const newPrompt: PromptWithTemplate = {
      prompt: promptEntity,
      template: null,
      templateContent: null,
      category: null,
      type: null
    };

    this.selectedPrompt = newPrompt;
    this.currentView = 'editor';
    this.isEditing = true;
    this.isDirty = false;
    this.editorContent = '';
  }

  public backToList(): void {
    if (this.isDirty) {
      const confirm = window.confirm('You have unsaved changes. Are you sure you want to go back?');
      if (!confirm) return;
    }
    
    this.currentView = 'list';
    this.selectedPrompt = null;
    this.isEditing = false;
    this.isDirty = false;
    this.showNewCategoryInput = false;
    this.newCategoryName = '';
    this.emitStateChange();
  }

  public toggleEdit(): void {
    this.isEditing = !this.isEditing;
    if (!this.isEditing) {
      this.showNewCategoryInput = false;
      this.newCategoryName = '';
    }
  }
  
  public onEditorContentChange(content: string): void {
    // don't modify our modle, it is directly bound to the editor
    this.isDirty = true;
  }
  
  public onEditorSplitterChange(event: any): void {
    // Update the panel width when user resizes
    if (event.panes && event.panes.length > 0) {
      const firstPane = event.panes[0];
      if (firstPane.size) {
        // Extract numeric value from size (could be '300px' or just 300)
        const sizeValue = typeof firstPane.size === 'string' ? 
          parseInt(firstPane.size.replace('px', '')) : firstPane.size;
        if (!isNaN(sizeValue)) {
          this.promptDetailsPanelWidth = sizeValue;
          this.emitStateChange();
        }
      }
    }
  }
  
  private emitStateChange(): void {
    const state = {
      currentView: this.currentView,
      currentSubView: this.currentSubView,
      selectedPromptId: this.selectedPrompt?.prompt.ID || null,
      isEditing: this.isEditing,
      promptDetailsPanelWidth: this.promptDetailsPanelWidth,
      filterPanelVisible: this.filterPanelVisible,
      searchTerm: this.searchTerm$.value,
      selectedCategory: this.selectedCategory$.value,
      selectedType: this.selectedType$.value,
      selectedStatus: this.selectedStatus$.value
    };
    this.stateChange.emit(state);
  }

  public async savePrompt(): Promise<void> {
    if (!this.selectedPrompt || !this.isEditing) return;

    try {
      this.isLoading = true;
      const md = new Metadata();
      if (!md) 
        throw new Error('Metadata provider not available');

      // Save or create template content first
      let templateContentId = this.selectedPrompt.templateContent?.ID;
      
      if (!templateContentId) {
        // Create new template content
        const templateContent = await md.GetEntityObject<TemplateContentEntity>('Template Contents', md.CurrentUser);
        templateContent.TemplateText = this.editorContent;

        // make sure the template engine metadata is set correctly
        await TemplateEngineBase.Instance.Config(false);
        const tcType = TemplateEngineBase.Instance.TemplateContentTypes.find(tct => tct.Name.trim().toLowerCase() === 'text');
        if (!tcType) {
          throw new Error('Template content type "text" not found');
        }
        templateContent.TypeID = tcType.ID;
        templateContent.Priority = 0; // Default priority

        // We need to link to a template, create one if needed
        if (!this.selectedPrompt.template) {
          const template = await md.GetEntityObject<TemplateEntity>('Templates', md.CurrentUser);
          template.Name = this.selectedPrompt.prompt.Name + ' Template';
          template.Description = 'Template for ' + this.selectedPrompt.prompt.Name;
          template.UserID = md.CurrentUser.ID;
          
          if (await template.Save()) {
            templateContent.TemplateID = template.ID;
            this.selectedPrompt.template = template;
          }
          else {
            // we have an error saving the template
            const errorMessage = template.LatestResult?.Message || 'Unknown error occurred while saving template';
            console.error('Template save failed:', errorMessage);
            LogError('Template save failed', undefined, errorMessage);
            this.mjNotificationsService.CreateSimpleNotification(errorMessage, 'error', 3500);
            this.error = `Failed to save template: ${errorMessage}`;
            return;
          }
        } else {
          templateContent.TemplateID = this.selectedPrompt.template.ID;
        }
        
        if (await templateContent.Save()) {
          templateContentId = templateContent.ID;
          this.selectedPrompt.templateContent = templateContent;
        }
        else {
          // Handle save failure
          const errorMessage = templateContent.LatestResult?.Message || 'Unknown error occurred while saving template content';
          console.error('Template content save failed:', errorMessage);
          LogError('Template content save failed', undefined, errorMessage);
          this.mjNotificationsService.CreateSimpleNotification(errorMessage, 'error', 3500);
          this.error = `Failed to save template content: ${errorMessage}`;
          return;
        }
      } else {
        // Update existing template content
        const templateContent = await md.GetEntityObject<TemplateContentEntity>('Template Contents');
        await templateContent.Load(templateContentId);
        templateContent.TemplateText = this.editorContent;
        if (!await templateContent.Save()) {
          // Handle save failure
          const errorMessage = templateContent.LatestResult?.Message || 'Unknown error occurred while saving template content';
          console.error('Template content update failed:', errorMessage);
          LogError('Template content update failed', undefined, errorMessage);
          this.mjNotificationsService.CreateSimpleNotification(errorMessage, 'error', 3500);
          this.error = `Failed to update template content: ${errorMessage}`;
          return;
        }
      }

      // Save the prompt
      let prompt: AIPromptEntity;
      if (this.selectedPrompt.prompt.ID) {
        // Update existing prompt
        prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts', md.CurrentUser);
        await prompt.Load(this.selectedPrompt.prompt.ID);
      } else {
        // Create new prompt
        prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts', md.CurrentUser);
      }

      // Update prompt properties
      prompt.Name = this.selectedPrompt.prompt.Name;
      prompt.Description = this.selectedPrompt.prompt.Description;
      prompt.CategoryID = this.selectedPrompt.prompt.CategoryID;
      prompt.TypeID = this.selectedPrompt.prompt.TypeID;
      prompt.Status = this.selectedPrompt.prompt.Status;
      prompt.TemplateID = this.selectedPrompt.template?.ID || '';

      const promptResult = await prompt.Save();
      
      if (promptResult) {
        this.isDirty = false;
        this.isEditing = false;
        LogStatus('Prompt saved successfully');
        
        // Reload data to get the updated state
        await this.loadData();
        
        // Find and select the updated prompt
        this.selectedPrompt = this.promptsWithTemplates.find(p => p.prompt.ID === prompt.ID) || null;
      } else {
        // Handle save failure
        const errorMessage = prompt.LatestResult?.Message || 'Unknown error occurred while saving prompt';
        console.error('Prompt save failed:', errorMessage);
        LogError('Prompt save failed', undefined, errorMessage);
        this.mjNotificationsService.CreateSimpleNotification(errorMessage,'error',3500);
        this.error = `Failed to save prompt: ${errorMessage}`;
      }

    } catch (error) {
      LogError('Error saving prompt', undefined, error);
      this.error = 'Failed to save prompt. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  public async deletePrompt(promptWithTemplate: PromptWithTemplate): Promise<void> {
    if (!promptWithTemplate.prompt.ID) return;
    
    const confirm = window.confirm(`Are you sure you want to delete "${promptWithTemplate.prompt.Name}"?`);
    if (!confirm) return;

    try {
      this.isLoading = true;
      const md = Metadata.Provider;
      if (!md) throw new Error('Metadata provider not available');

      const prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts', md.CurrentUser);
      await prompt.Load(promptWithTemplate.prompt.ID);
      const result = await prompt.Delete();

      if (result) {
        LogStatus('Prompt deleted successfully');
        await this.loadData();
        
        if (this.selectedPrompt?.prompt.ID === promptWithTemplate.prompt.ID) {
          this.backToList();
        }
      }

    } catch (error) {
      LogError('Error deleting prompt', undefined, error);
      this.error = 'Failed to delete prompt. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }


  // Utility methods
  public getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' {
    switch (status) {
      case 'Active': return 'success';
      case 'Pending': return 'warning';
      case 'Disabled': return 'error';
      default: return 'info';
    }
  }

  public getPromptIcon(): string {
    return 'fa-solid fa-comment-dots';
  }

  public getCategoryName(categoryId: string | null): string {
    if (!categoryId || categoryId === '') return 'No Category';
    return this.categories.find(c => c.ID === categoryId)?.Name || 'Unknown Category';
  }

  public getTypeName(typeId: string | null): string {
    if (!typeId || typeId === '') return 'No Type';
    return this.types.find(t => t.ID === typeId)?.Name || 'Unknown Type';
  }

  public setSubView(subView: 'list' | 'priority-matrix' | 'version-control'): void {
    this.currentSubView = subView;
    this.emitStateChange();
  }


  public onPromptSelectedFromMatrix(prompt: AIPromptEntity): void {
    const promptWithTemplate = this.promptsWithTemplates.find(p => p.prompt.ID === prompt.ID);
    if (promptWithTemplate) {
      this.viewPrompt(promptWithTemplate);
    }
  }

  public onVersionSelected(version: any): void {
    // Handle version selection from version control component
    console.log('Version selected:', version);
    if (version && this.selectedPrompt) {
      this.editorContent = version.content || '';
      this.isDirty = true;
    }
  }

  public get promptsForMatrix(): AIPromptEntity[] {
    return this.filteredPrompts.map(p => p.prompt);
  }
}