import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { Subject, BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { FormControl } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { MJNotificationService } from '@memberjunction/ng-notifications';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface PromptSelectorConfig {
  /** Title for the dialog */
  title: string;
  /** Whether to show the "Create New" option */
  showCreateNew?: boolean;
  /** Filter criteria for prompts */
  extraFilter?: string;
  /** Allow multiple selection */
  multiSelect?: boolean;
  /** Pre-selected prompt IDs */
  selectedPromptIds?: string[];
  /** Already linked prompt IDs (will be grayed out and not selectable) */
  linkedPromptIds?: string[];
}

export interface PromptSelectorResult {
  /** Selected prompts */
  selectedPrompts: MJAIPromptEntityExtended[];
  /** Whether user chose to create new */
  createNew?: boolean;
}

/**
 * Unified prompt selector dialog that can be used for:
 * - Selecting context compression prompts (single select)
 * - Adding general prompts to agents (multi-select)
 * - Any other prompt selection scenario
 */
@Component({
  standalone: false,
  selector: 'mj-prompt-selector-dialog',
  templateUrl: './prompt-selector-dialog.component.html',
  styleUrls: ['./prompt-selector-dialog.component.css']
})
export class PromptSelectorDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Input configuration
  config: PromptSelectorConfig = { title: 'Select Prompts' };
  
  // State management
  private destroy$ = new Subject<void>();
  public Result = new Subject<PromptSelectorResult | null>();

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
  Prompts$ = new BehaviorSubject<MJAIPromptEntityExtended[]>([]);

  /** @deprecated Use {@link Prompts$}. */
  get prompts$() {
    return this.Prompts$;
  }
  /** @deprecated Use {@link Prompts$}. */
  set prompts$(value) {
    this.Prompts$ = value;
  }
  FilteredPrompts$ = new BehaviorSubject<MJAIPromptEntityExtended[]>([]);

  /** @deprecated Use {@link FilteredPrompts$}. */
  get filteredPrompts$() {
    return this.FilteredPrompts$;
  }
  /** @deprecated Use {@link FilteredPrompts$}. */
  set filteredPrompts$(value) {
    this.FilteredPrompts$ = value;
  }
  
  // Search and selection
  SearchControl = new FormControl('');

  /** @deprecated Use {@link SearchControl}. */
  get searchControl() {
    return this.SearchControl;
  }
  /** @deprecated Use {@link SearchControl}. */
  set searchControl(value) {
    this.SearchControl = value;
  }
  SelectedPrompts: Set<string> = new Set();

  /** @deprecated Use {@link SelectedPrompts}. */
  get selectedPrompts(): Set<string> {
    return this.SelectedPrompts;
  }
  /** @deprecated Use {@link SelectedPrompts}. */
  set selectedPrompts(value: Set<string>) {
    this.SelectedPrompts = value;
  }
  LinkedPrompts: Set<string> = new Set();

  /** @deprecated Use {@link LinkedPrompts}. */
  get linkedPrompts(): Set<string> {
    return this.LinkedPrompts;
  }
  /** @deprecated Use {@link LinkedPrompts}. */
  set linkedPrompts(value: Set<string>) {
    this.LinkedPrompts = value;
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
    this.loadPrompts();
    
    // Initialize selected prompts if provided
    if (this.config.selectedPromptIds) {
      this.SelectedPrompts = new Set(this.config.selectedPromptIds);
    }
    
    // Initialize linked prompts if provided
    if (this.config.linkedPromptIds) {
      this.LinkedPrompts = new Set(this.config.linkedPromptIds);
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
        this.filterPrompts(searchTerm || '');
      });
  }

  private async loadPrompts() {
    this.IsLoading$.next(true);
    
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      // Build filter - default to active prompts
      let filter = "Status = 'Active'";
      if (this.config.extraFilter) {
        filter += ` AND ${this.config.extraFilter}`;
      }
      
      const result = await rv.RunView<MJAIPromptEntityExtended>({
        EntityName: 'MJ: AI Prompts',
        ExtraFilter: filter,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (result.Success) {
        const prompts = result.Results || [];
        this.Prompts$.next(prompts);
        this.FilteredPrompts$.next(prompts);
      } else {
        throw new Error(result.ErrorMessage || 'Failed to load prompts');
      }
    } catch (error) {
      console.error('Error loading prompts:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading prompts. Please try again.',
        'error',
        3000
      );
      this.Prompts$.next([]);
      this.FilteredPrompts$.next([]);
    } finally {
      this.IsLoading$.next(false);
    }
  }

  private filterPrompts(searchTerm: string) {
    const allPrompts = this.Prompts$.value;
    
    if (!searchTerm.trim()) {
      this.FilteredPrompts$.next(allPrompts);
      return;
    }

    const filtered = allPrompts.filter(prompt => 
      prompt.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.Description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    this.FilteredPrompts$.next(filtered);
  }

  // === Selection Management ===

  TogglePromptSelection(prompt: MJAIPromptEntityExtended) {
    // Prevent selection of already linked prompts
    if (this.IsPromptLinked(prompt)) {
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${prompt.Name}" is already linked to this agent`,
        'info',
        2000
      );
      return;
    }
    
    if (this.config.multiSelect) {
      if (this.SelectedPrompts.has(prompt.ID)) {
        this.SelectedPrompts.delete(prompt.ID);
      } else {
        this.SelectedPrompts.add(prompt.ID);
      }
    } else {
      // Single select - replace current selection
      this.SelectedPrompts.clear();
      this.SelectedPrompts.add(prompt.ID);
    }
  }

  /** @deprecated Use {@link TogglePromptSelection}. */
  togglePromptSelection(prompt: MJAIPromptEntityExtended) {
    return this.TogglePromptSelection(prompt);
  }

  IsPromptSelected(prompt: MJAIPromptEntityExtended): boolean {
    return this.SelectedPrompts.has(prompt.ID);
  }

  /** @deprecated Use {@link IsPromptSelected}. */
  isPromptSelected(prompt: MJAIPromptEntityExtended): boolean {
    return this.IsPromptSelected(prompt);
  }

  IsPromptLinked(prompt: MJAIPromptEntityExtended): boolean {
    return this.LinkedPrompts.has(prompt.ID);
  }

  /** @deprecated Use {@link IsPromptLinked}. */
  isPromptLinked(prompt: MJAIPromptEntityExtended): boolean {
    return this.IsPromptLinked(prompt);
  }

  GetSelectedPromptObjects(): MJAIPromptEntityExtended[] {
    const allPrompts = this.Prompts$.value;
    return allPrompts.filter(prompt => this.SelectedPrompts.has(prompt.ID));
  }

  /** @deprecated Use {@link GetSelectedPromptObjects}. */
  getSelectedPromptObjects(): MJAIPromptEntityExtended[] {
    return this.GetSelectedPromptObjects();
  }

  // === UI Helpers ===

  ToggleViewMode() {
    this.ViewMode = this.ViewMode === 'grid' ? 'list' : 'grid';
  }

  /** @deprecated Use {@link ToggleViewMode}. */
  toggleViewMode() {
    return this.ToggleViewMode();
  }

  GetPromptStatusColor(prompt: MJAIPromptEntityExtended): string {
    switch (prompt.Status) {
      case 'Active': return 'var(--mj-status-success)';
      case 'Pending': return 'var(--mj-status-warning)';
      case 'Disabled': return 'var(--mj-text-muted)';
      default: return 'var(--mj-text-muted)';
    }
  }

  /** @deprecated Use {@link GetPromptStatusColor}. */
  getPromptStatusColor(prompt: MJAIPromptEntityExtended): string {
    return this.GetPromptStatusColor(prompt);
  }

  GetPromptStatusText(prompt: MJAIPromptEntityExtended): string {
    return prompt.Status || 'Unknown';
  }

  /** @deprecated Use {@link GetPromptStatusText}. */
  getPromptStatusText(prompt: MJAIPromptEntityExtended): string {
    return this.GetPromptStatusText(prompt);
  }

  // === Dialog Actions ===

  SelectPrompts() {
    const selectedPromptObjects = this.GetSelectedPromptObjects();
    
    if (selectedPromptObjects.length === 0) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please select at least one prompt',
        'warning',
        2000
      );
      return;
    }

    const result: PromptSelectorResult = {
      selectedPrompts: selectedPromptObjects
    };

    this.Result.next(result);
    this.DialogClose.emit();
  }

  /** @deprecated Use {@link SelectPrompts}. */
  selectPrompts() {
    return this.SelectPrompts();
  }

  CreateNew() {
    const result: PromptSelectorResult = {
      selectedPrompts: [],
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