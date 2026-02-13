import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { WindowRef } from '@progress/kendo-angular-dialog';
import { Subject, BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { FormControl } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { MJNotificationService } from '@memberjunction/ng-notifications';

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
  selectedPrompts: AIPromptEntityExtended[];
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
export class PromptSelectorDialogComponent implements OnInit, OnDestroy {
  
  // Input configuration
  config: PromptSelectorConfig = { title: 'Select Prompts' };
  
  // State management
  private destroy$ = new Subject<void>();
  public result = new Subject<PromptSelectorResult | null>();
  
  // Data and UI state
  isLoading$ = new BehaviorSubject<boolean>(false);
  prompts$ = new BehaviorSubject<AIPromptEntityExtended[]>([]);
  filteredPrompts$ = new BehaviorSubject<AIPromptEntityExtended[]>([]);
  
  // Search and selection
  searchControl = new FormControl('');
  selectedPrompts: Set<string> = new Set();
  linkedPrompts: Set<string> = new Set();
  
  // View mode
  viewMode: 'grid' | 'list' = 'list';

  constructor(
    private dialogRef: WindowRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.setupSearch();
    this.loadPrompts();
    
    // Initialize selected prompts if provided
    if (this.config.selectedPromptIds) {
      this.selectedPrompts = new Set(this.config.selectedPromptIds);
    }
    
    // Initialize linked prompts if provided
    if (this.config.linkedPromptIds) {
      this.linkedPrompts = new Set(this.config.linkedPromptIds);
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
        this.filterPrompts(searchTerm || '');
      });
  }

  private async loadPrompts() {
    this.isLoading$.next(true);
    
    try {
      const rv = new RunView();
      
      // Build filter - default to active prompts
      let filter = "Status = 'Active'";
      if (this.config.extraFilter) {
        filter += ` AND ${this.config.extraFilter}`;
      }
      
      const result = await rv.RunView<AIPromptEntityExtended>({
        EntityName: 'MJ: AI Prompts',
        ExtraFilter: filter,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (result.Success) {
        const prompts = result.Results || [];
        this.prompts$.next(prompts);
        this.filteredPrompts$.next(prompts);
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
      this.prompts$.next([]);
      this.filteredPrompts$.next([]);
    } finally {
      this.isLoading$.next(false);
    }
  }

  private filterPrompts(searchTerm: string) {
    const allPrompts = this.prompts$.value;
    
    if (!searchTerm.trim()) {
      this.filteredPrompts$.next(allPrompts);
      return;
    }

    const filtered = allPrompts.filter(prompt => 
      prompt.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.Description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    this.filteredPrompts$.next(filtered);
  }

  // === Selection Management ===

  togglePromptSelection(prompt: AIPromptEntityExtended) {
    // Prevent selection of already linked prompts
    if (this.isPromptLinked(prompt)) {
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${prompt.Name}" is already linked to this agent`,
        'info',
        2000
      );
      return;
    }
    
    if (this.config.multiSelect) {
      if (this.selectedPrompts.has(prompt.ID)) {
        this.selectedPrompts.delete(prompt.ID);
      } else {
        this.selectedPrompts.add(prompt.ID);
      }
    } else {
      // Single select - replace current selection
      this.selectedPrompts.clear();
      this.selectedPrompts.add(prompt.ID);
    }
  }

  isPromptSelected(prompt: AIPromptEntityExtended): boolean {
    return this.selectedPrompts.has(prompt.ID);
  }

  isPromptLinked(prompt: AIPromptEntityExtended): boolean {
    return this.linkedPrompts.has(prompt.ID);
  }

  getSelectedPromptObjects(): AIPromptEntityExtended[] {
    const allPrompts = this.prompts$.value;
    return allPrompts.filter(prompt => this.selectedPrompts.has(prompt.ID));
  }

  // === UI Helpers ===

  toggleViewMode() {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  getPromptStatusColor(prompt: AIPromptEntityExtended): string {
    switch (prompt.Status) {
      case 'Active': return '#28a745';
      case 'Pending': return '#ffc107';
      case 'Disabled': return '#6c757d';
      default: return '#6c757d';
    }
  }

  getPromptStatusText(prompt: AIPromptEntityExtended): string {
    return prompt.Status || 'Unknown';
  }

  // === Dialog Actions ===

  selectPrompts() {
    const selectedPromptObjects = this.getSelectedPromptObjects();
    
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

    this.result.next(result);
    this.dialogRef.close();
  }

  createNew() {
    const result: PromptSelectorResult = {
      selectedPrompts: [],
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