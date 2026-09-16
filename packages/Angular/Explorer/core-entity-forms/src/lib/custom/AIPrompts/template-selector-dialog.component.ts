import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { Subject, BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { MJTemplateEntity, MJTemplateCategoryEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface TemplateSelectorConfig {
  /** Title for the dialog */
  Title: string;
  /** Whether to show the "Create New" option */
  ShowCreateNew?: boolean;
  /** Filter criteria for templates */
  ExtraFilter?: string;
  /** Allow multiple selection */
  MultiSelect?: boolean;
  /** Pre-selected template IDs */
  SelectedTemplateIds?: string[];
  /** Show only active templates */
  ShowActiveOnly?: boolean;
}

export interface TemplateSelectorResult {
  /** Selected templates */
  SelectedTemplates: MJTemplateEntity[];
  /** Whether user chose to create new */
  createNew?: boolean;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/**
 * Template selector dialog that allows users to search and select from existing templates.
 * This dialog provides a searchable interface with category filtering and template preview.
 */
@Component({
  selector: 'mj-template-selector-dialog',
  templateUrl: './template-selector-dialog.component.html',
  styleUrls: ['./template-selector-dialog.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class TemplateSelectorDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Input configuration
  config: TemplateSelectorConfig = { Title: 'Select Template' };
  
  // State management
  private destroy$ = new Subject<void>();
  public Result = new Subject<TemplateSelectorResult | null>();

  /** @deprecated Use {@link Result}. */
  public get result() {
    return this.Result;
  }
  /** @deprecated Use {@link Result}. */
  public set result(value) {
    this.Result = value;
  }
  
  // Data and UI state
  IsLoading$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }
  /** @deprecated Use {@link IsLoading$}. */
  set isLoading$(value) {
    this.IsLoading$ = value;
  }
  Templates$ = new BehaviorSubject<MJTemplateEntity[]>([]);

  /** @deprecated Use {@link Templates$}. */
  get templates$() {
    return this.Templates$;
  }
  /** @deprecated Use {@link Templates$}. */
  set templates$(value) {
    this.Templates$ = value;
  }
  FilteredTemplates$ = new BehaviorSubject<MJTemplateEntity[]>([]);

  /** @deprecated Use {@link FilteredTemplates$}. */
  get filteredTemplates$() {
    return this.FilteredTemplates$;
  }
  /** @deprecated Use {@link FilteredTemplates$}. */
  set filteredTemplates$(value) {
    this.FilteredTemplates$ = value;
  }
  Categories$ = new BehaviorSubject<MJTemplateCategoryEntity[]>([]);

  /** @deprecated Use {@link Categories$}. */
  get categories$() {
    return this.Categories$;
  }
  /** @deprecated Use {@link Categories$}. */
  set categories$(value) {
    this.Categories$ = value;
  }
  
  // Search and filtering
  SearchControl = new FormControl('');

  /** @deprecated Use {@link SearchControl}. */
  get searchControl() {
    return this.SearchControl;
  }
  /** @deprecated Use {@link SearchControl}. */
  set searchControl(value) {
    this.SearchControl = value;
  }
  SelectedCategory: string | null = null;

  /** @deprecated Use {@link SelectedCategory}. */
  get selectedCategory(): string | null {
    return this.SelectedCategory;
  }
  /** @deprecated Use {@link SelectedCategory}. */
  set selectedCategory(value: string | null) {
    this.SelectedCategory = value;
  }
  SelectedTemplates: Set<string> = new Set();

  /** @deprecated Use {@link SelectedTemplates}. */
  get selectedTemplates(): Set<string> {
    return this.SelectedTemplates;
  }
  /** @deprecated Use {@link SelectedTemplates}. */
  set selectedTemplates(value: Set<string>) {
    this.SelectedTemplates = value;
  }
  
  // View mode
  ViewMode: 'grid' | 'list' = 'list';

  /** @deprecated Use {@link ViewMode}. */
  get viewMode(): 'grid' | 'list' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  set viewMode(value: 'grid' | 'list') {
    this.ViewMode = value;
  }

  @Output() DialogClose = new EventEmitter<void>();

  constructor(
    private cdr: ChangeDetectorRef
  ) {
    super();}

  ngOnInit() {
    this.setupSearch();
    this.loadData();
    
    // Initialize selected templates if provided
    if (this.config.SelectedTemplateIds) {
      this.SelectedTemplates = new Set(this.config.SelectedTemplateIds);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch() {
    this.SearchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.filterTemplates(searchTerm || '');
      });
  }

  private async loadData() {
    this.IsLoading$.next(true);
    
    try {
      // Load both templates and categories in parallel
      await Promise.all([
        this.loadTemplates(),
        this.loadCategories()
      ]);
    } catch (error) {
      console.error('Error loading template data:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading templates. Please try again.',
        'error',
        3000
      );
    } finally {
      this.IsLoading$.next(false);
    }
  }

  private async loadTemplates() {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      // Build filter
      let filter = '';
      if (this.config.ShowActiveOnly !== false) {
        filter = "IsActive = 1";
      }
      if (this.config.ExtraFilter) {
        filter += filter ? ` AND ${this.config.ExtraFilter}` : this.config.ExtraFilter;
      }
      
      const result = await rv.RunView<MJTemplateEntity>({
        EntityName: 'MJ: Templates',
        ExtraFilter: filter,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (result.Success) {
        const templates = result.Results || [];
        this.Templates$.next(templates);
        this.FilteredTemplates$.next(templates);
      } else {
        throw new Error(result.ErrorMessage || 'Failed to load templates');
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      this.Templates$.next([]);
      this.FilteredTemplates$.next([]);
    }
  }

  private async loadCategories() {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      const result = await rv.RunView<MJTemplateCategoryEntity>({
        EntityName: 'MJ: Template Categories',
        ExtraFilter: '',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (result.Success) {
        const categories = result.Results || [];
        this.Categories$.next(categories);
      } else {
        throw new Error(result.ErrorMessage || 'Failed to load categories');
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      this.Categories$.next([]);
    }
  }

  private filterTemplates(searchTerm: string) {
    const allTemplates = this.Templates$.value;
    let filtered = allTemplates;
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(template => 
        template.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.Description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply category filter
    if (this.SelectedCategory) {
      filtered = filtered.filter(template => 
        UUIDsEqual(template.CategoryID, this.SelectedCategory)
      );
    }
    
    this.FilteredTemplates$.next(filtered);
  }

  // === Category Management ===

  OnCategoryChange(categoryId: string | null) {
    this.SelectedCategory = categoryId === '' ? null : categoryId;
    this.filterTemplates(this.SearchControl.value || '');
  }

  /** @deprecated Use {@link OnCategoryChange}. */
  onCategoryChange(categoryId: string | null) {
    return this.OnCategoryChange(categoryId);
  }

  GetCategoryDisplayName(categoryId: string): string {
    const category = this.Categories$.value.find(c => UUIDsEqual(c.ID, categoryId));
    return category?.Name || 'Unknown Category';
  }

  /** @deprecated Use {@link GetCategoryDisplayName}. */
  getCategoryDisplayName(categoryId: string): string {
    return this.GetCategoryDisplayName(categoryId);
  }

  // === Selection Management ===

  ToggleTemplateSelection(template: MJTemplateEntity) {
    if (this.config.MultiSelect) {
      if (this.SelectedTemplates.has(template.ID)) {
        this.SelectedTemplates.delete(template.ID);
      } else {
        this.SelectedTemplates.add(template.ID);
      }
    } else {
      // Single select - replace current selection
      this.SelectedTemplates.clear();
      this.SelectedTemplates.add(template.ID);
    }
  }

  /** @deprecated Use {@link ToggleTemplateSelection}. */
  toggleTemplateSelection(template: MJTemplateEntity) {
    return this.ToggleTemplateSelection(template);
  }

  IsTemplateSelected(template: MJTemplateEntity): boolean {
    return this.SelectedTemplates.has(template.ID);
  }

  /** @deprecated Use {@link IsTemplateSelected}. */
  isTemplateSelected(template: MJTemplateEntity): boolean {
    return this.IsTemplateSelected(template);
  }

  GetSelectedTemplateObjects(): MJTemplateEntity[] {
    const allTemplates = this.Templates$.value;
    return allTemplates.filter(template => this.SelectedTemplates.has(template.ID));
  }

  /** @deprecated Use {@link GetSelectedTemplateObjects}. */
  getSelectedTemplateObjects(): MJTemplateEntity[] {
    return this.GetSelectedTemplateObjects();
  }

  // === UI Helpers ===

  ToggleViewMode() {
    this.ViewMode = this.ViewMode === 'grid' ? 'list' : 'grid';
  }

  /** @deprecated Use {@link ToggleViewMode}. */
  toggleViewMode() {
    return this.ToggleViewMode();
  }

  GetTemplateStatusColor(template: MJTemplateEntity): string {
    if (!template.IsActive) return '#6c757d';
    if (template.DisabledAt && new Date(template.DisabledAt) <= new Date()) return '#dc3545';
    if (template.ActiveAt && new Date(template.ActiveAt) > new Date()) return '#ffc107';
    return '#28a745';
  }

  /** @deprecated Use {@link GetTemplateStatusColor}. */
  getTemplateStatusColor(template: MJTemplateEntity): string {
    return this.GetTemplateStatusColor(template);
  }

  GetTemplateStatusText(template: MJTemplateEntity): string {
    if (!template.IsActive) return 'Inactive';
    if (template.DisabledAt && new Date(template.DisabledAt) <= new Date()) return 'Disabled';
    if (template.ActiveAt && new Date(template.ActiveAt) > new Date()) return 'Scheduled';
    return 'Active';
  }

  /** @deprecated Use {@link GetTemplateStatusText}. */
  getTemplateStatusText(template: MJTemplateEntity): string {
    return this.GetTemplateStatusText(template);
  }

  GetTemplatePreview(template: MJTemplateEntity): string {
    if (!template.Description) return 'No description available';
    return template.Description.length > 100 
      ? template.Description.substring(0, 100) + '...' 
      : template.Description;
  }

  /** @deprecated Use {@link GetTemplatePreview}. */
  getTemplatePreview(template: MJTemplateEntity): string {
    return this.GetTemplatePreview(template);
  }

  formatDate(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString();
  }

  // === Dialog Actions ===

  SelectTemplates() {
    const selectedTemplateObjects = this.GetSelectedTemplateObjects();
    
    if (selectedTemplateObjects.length === 0) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please select at least one template',
        'warning',
        2000
      );
      return;
    }

    const result: TemplateSelectorResult = {
      SelectedTemplates: selectedTemplateObjects
    };

    this.Result.next(result);
    this.DialogClose.emit();
  }

  /** @deprecated Use {@link SelectTemplates}. */
  selectTemplates() {
    return this.SelectTemplates();
  }

  CreateNew() {
    const result: TemplateSelectorResult = {
      SelectedTemplates: [],
      createNew: true
    };

    this.Result.next(result);
    this.DialogClose.emit();
  }

  /** @deprecated Use {@link CreateNew}. */
  createNew() {
    return this.CreateNew();
  }

  cancel() {
    this.Result.next(null);
    this.DialogClose.emit();
  }
}