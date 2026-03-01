import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Subject, BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { MJTemplateEntity, MJTemplateCategoryEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';

export interface TemplateSelectorConfig {
  /** Title for the dialog */
  title: string;
  /** Whether to show the "Create New" option */
  showCreateNew?: boolean;
  /** Filter criteria for templates */
  extraFilter?: string;
  /** Allow multiple selection */
  multiSelect?: boolean;
  /** Pre-selected template IDs */
  selectedTemplateIds?: string[];
  /** Show only active templates */
  showActiveOnly?: boolean;
}

export interface TemplateSelectorResult {
  /** Selected templates */
  selectedTemplates: MJTemplateEntity[];
  /** Whether user chose to create new */
  createNew?: boolean;
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
export class TemplateSelectorDialogComponent implements OnInit, OnDestroy {
  
  // Input configuration
  config: TemplateSelectorConfig = { title: 'Select Template' };
  
  // State management
  private destroy$ = new Subject<void>();
  public result = new Subject<TemplateSelectorResult | null>();
  
  // Data and UI state
  isLoading$ = new BehaviorSubject<boolean>(false);
  templates$ = new BehaviorSubject<MJTemplateEntity[]>([]);
  filteredTemplates$ = new BehaviorSubject<MJTemplateEntity[]>([]);
  categories$ = new BehaviorSubject<MJTemplateCategoryEntity[]>([]);
  
  // Search and filtering
  searchControl = new FormControl('');
  selectedCategory: string | null = null;
  selectedTemplates: Set<string> = new Set();
  
  // View mode
  viewMode: 'grid' | 'list' = 'list';

  constructor(
    private dialogRef: DialogRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.setupSearch();
    this.loadData();
    
    // Initialize selected templates if provided
    if (this.config.selectedTemplateIds) {
      this.selectedTemplates = new Set(this.config.selectedTemplateIds);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch() {
    this.searchControl.valueChanges
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
    this.isLoading$.next(true);
    
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
      this.isLoading$.next(false);
    }
  }

  private async loadTemplates() {
    try {
      const rv = new RunView();
      
      // Build filter
      let filter = '';
      if (this.config.showActiveOnly !== false) {
        filter = "IsActive = 1";
      }
      if (this.config.extraFilter) {
        filter += filter ? ` AND ${this.config.extraFilter}` : this.config.extraFilter;
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
        this.templates$.next(templates);
        this.filteredTemplates$.next(templates);
      } else {
        throw new Error(result.ErrorMessage || 'Failed to load templates');
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      this.templates$.next([]);
      this.filteredTemplates$.next([]);
    }
  }

  private async loadCategories() {
    try {
      const rv = new RunView();
      
      const result = await rv.RunView<MJTemplateCategoryEntity>({
        EntityName: 'MJ: Template Categories',
        ExtraFilter: '',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (result.Success) {
        const categories = result.Results || [];
        this.categories$.next(categories);
      } else {
        throw new Error(result.ErrorMessage || 'Failed to load categories');
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      this.categories$.next([]);
    }
  }

  private filterTemplates(searchTerm: string) {
    const allTemplates = this.templates$.value;
    let filtered = allTemplates;
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(template => 
        template.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.Description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply category filter
    if (this.selectedCategory) {
      filtered = filtered.filter(template => 
        UUIDsEqual(template.CategoryID, this.selectedCategory)
      );
    }
    
    this.filteredTemplates$.next(filtered);
  }

  // === Category Management ===

  onCategoryChange(categoryId: string | null) {
    this.selectedCategory = categoryId === '' ? null : categoryId;
    this.filterTemplates(this.searchControl.value || '');
  }

  getCategoryDisplayName(categoryId: string): string {
    const category = this.categories$.value.find(c => UUIDsEqual(c.ID, categoryId))
    return category?.Name || 'Unknown Category';
  }

  // === Selection Management ===

  toggleTemplateSelection(template: MJTemplateEntity) {
    if (this.config.multiSelect) {
      if (this.selectedTemplates.has(template.ID)) {
        this.selectedTemplates.delete(template.ID);
      } else {
        this.selectedTemplates.add(template.ID);
      }
    } else {
      // Single select - replace current selection
      this.selectedTemplates.clear();
      this.selectedTemplates.add(template.ID);
    }
  }

  isTemplateSelected(template: MJTemplateEntity): boolean {
    return this.selectedTemplates.has(template.ID);
  }

  getSelectedTemplateObjects(): MJTemplateEntity[] {
    const allTemplates = this.templates$.value;
    return allTemplates.filter(template => this.selectedTemplates.has(template.ID));
  }

  // === UI Helpers ===

  toggleViewMode() {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  getTemplateStatusColor(template: MJTemplateEntity): string {
    if (!template.IsActive) return '#6c757d';
    if (template.DisabledAt && new Date(template.DisabledAt) <= new Date()) return '#dc3545';
    if (template.ActiveAt && new Date(template.ActiveAt) > new Date()) return '#ffc107';
    return '#28a745';
  }

  getTemplateStatusText(template: MJTemplateEntity): string {
    if (!template.IsActive) return 'Inactive';
    if (template.DisabledAt && new Date(template.DisabledAt) <= new Date()) return 'Disabled';
    if (template.ActiveAt && new Date(template.ActiveAt) > new Date()) return 'Scheduled';
    return 'Active';
  }

  getTemplatePreview(template: MJTemplateEntity): string {
    if (!template.Description) return 'No description available';
    return template.Description.length > 100 
      ? template.Description.substring(0, 100) + '...' 
      : template.Description;
  }

  formatDate(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString();
  }

  // === Dialog Actions ===

  selectTemplates() {
    const selectedTemplateObjects = this.getSelectedTemplateObjects();
    
    if (selectedTemplateObjects.length === 0) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please select at least one template',
        'warning',
        2000
      );
      return;
    }

    const result: TemplateSelectorResult = {
      selectedTemplates: selectedTemplateObjects
    };

    this.result.next(result);
    this.dialogRef.close();
  }

  createNew() {
    const result: TemplateSelectorResult = {
      selectedTemplates: [],
      createNew: true
    };

    this.result.next(result);
    this.dialogRef.close();
  }

  cancel() {
    this.result.next(null);
    this.dialogRef.close();
  }
}