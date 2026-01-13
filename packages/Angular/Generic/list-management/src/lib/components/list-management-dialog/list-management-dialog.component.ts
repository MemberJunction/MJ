import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { Metadata } from '@memberjunction/core';
import { ListEntity, ListCategoryEntity } from '@memberjunction/core-entities';
import { ListManagementService } from '../../services/list-management.service';
import {
  ListManagementDialogConfig,
  ListManagementResult,
  ListItemViewModel,
  ListFilterTab,
  ListSortOption,
  CreateListConfig,
  ListOperationDetail
} from '../../models/list-management.models';

/**
 * A gorgeous, responsive dialog for managing list membership.
 * Supports adding/removing records from multiple lists with membership indicators.
 *
 * Features:
 * - Search and filter lists
 * - Visual membership indicators (full/partial/none)
 * - Inline list creation
 * - Mobile-responsive bottom sheet on small screens
 * - Batch operations with progress feedback
 */
@Component({
  selector: 'mj-list-management-dialog',
  templateUrl: './list-management-dialog.component.html',
  styleUrls: ['./list-management-dialog.component.css']
})
export class ListManagementDialogComponent implements OnInit, OnDestroy {
  /**
   * Configuration for the dialog
   */
  @Input() config!: ListManagementDialogConfig;

  /**
   * Controls dialog visibility
   */
  @Input()
  get visible(): boolean {
    return this._visible;
  }
  set visible(value: boolean) {
    if (value && !this._visible) {
      this.initializeDialog();
    }
    this._visible = value;
  }
  private _visible = false;

  /**
   * Emitted when dialog is closed with results
   */
  @Output() complete = new EventEmitter<ListManagementResult>();

  /**
   * Emitted when dialog is cancelled
   */
  @Output() cancel = new EventEmitter<void>();

  // State
  loading = false;
  saving = false;
  searchText = '';
  activeTab: ListFilterTab = 'all';
  sortOption: ListSortOption = 'name';
  showCreateForm = false;

  // Data
  allLists: ListItemViewModel[] = [];
  filteredLists: ListItemViewModel[] = [];
  categories: ListCategoryEntity[] = [];

  // Create form state
  newListName = '';
  newListDescription = '';
  newListCategoryId: string | null = null;

  // Track changes
  private originalMembership = new Map<string, boolean>();
  public addedToLists: Set<string> = new Set();
  public removedFromLists: Set<string> = new Set();
  public newlyCreatedLists: ListEntity[] = [];

  // Cleanup
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(
    private listService: ListManagementService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupSearchDebounce();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get dialog title based on config
   */
  get dialogTitle(): string {
    if (this.config?.dialogTitle) {
      return this.config.dialogTitle;
    }

    const recordCount = this.config?.recordIds?.length || 0;
    const recordText = recordCount === 1 ? '1 record' : `${recordCount} records`;

    switch (this.config?.mode) {
      case 'add':
        return `Add ${recordText} to Lists`;
      case 'remove':
        return `Remove ${recordText} from Lists`;
      default:
        return `Manage List Membership`;
    }
  }

  /**
   * Get subtitle showing context
   */
  get dialogSubtitle(): string {
    const recordCount = this.config?.recordIds?.length || 0;
    const entityName = this.config?.entityName || 'records';

    if (recordCount === 1 && this.config?.recordDisplayNames?.[0]) {
      return `"${this.config.recordDisplayNames[0]}" from ${entityName}`;
    }

    return `${recordCount} ${entityName} record${recordCount !== 1 ? 's' : ''}`;
  }

  /**
   * Check if there are pending changes
   */
  get hasChanges(): boolean {
    return this.addedToLists.size > 0 || this.removedFromLists.size > 0;
  }

  /**
   * Get count of lists to add to
   */
  get addCount(): number {
    return this.addedToLists.size;
  }

  /**
   * Get count of lists to remove from
   */
  get removeCount(): number {
    return this.removedFromLists.size;
  }

  /**
   * Setup search with debounce
   */
  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe((searchText: string) => {
      this.searchText = searchText;
      this.applyFilters();
    });
  }

  /**
   * Initialize dialog when opened
   */
  private async initializeDialog(): Promise<void> {
    this.resetState();
    await this.loadData();
  }

  /**
   * Reset all state
   */
  private resetState(): void {
    this.searchText = '';
    this.activeTab = 'all';
    this.sortOption = 'name';
    this.showCreateForm = false;
    this.newListName = '';
    this.newListDescription = '';
    this.newListCategoryId = null;
    this.addedToLists.clear();
    this.removedFromLists.clear();
    this.newlyCreatedLists = [];
    this.originalMembership.clear();
  }

  /**
   * Load lists and membership data
   */
  private async loadData(): Promise<void> {
    if (!this.config) return;

    this.loading = true;
    this.cdr.detectChanges();

    try {
      const md = new Metadata();

      // Load lists and membership in parallel
      const [lists, membership, categories] = await Promise.all([
        this.listService.getListsForEntity(
          this.config.entityId,
          md.CurrentUser.ID,
          true // Force refresh
        ),
        this.listService.getRecordMembership(
          this.config.entityId,
          this.config.recordIds
        ),
        this.listService.getListCategories()
      ]);

      this.categories = categories;

      // Build view models
      this.allLists = await this.listService.buildListViewModels(
        lists,
        this.config.recordIds,
        membership
      );

      // Store original membership state
      for (const vm of this.allLists) {
        this.originalMembership.set(vm.list.ID, vm.isFullMember || vm.isPartialMember);
      }

      // Pre-select lists if configured
      if (this.config.preSelectedListIds) {
        for (const listId of this.config.preSelectedListIds) {
          const vm = this.allLists.find(l => l.list.ID === listId);
          if (vm) {
            vm.isSelectedForAdd = true;
            this.addedToLists.add(listId);
          }
        }
      }

      this.applyFilters();
    } catch (error) {
      console.error('Error loading list data:', error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle search input
   */
  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchText = '';
    this.searchSubject.next('');
  }

  /**
   * Change active tab
   */
  setActiveTab(tab: ListFilterTab): void {
    this.activeTab = tab;
    this.applyFilters();
  }

  /**
   * Change sort option
   */
  setSortOption(option: ListSortOption): void {
    this.sortOption = option;
    this.applyFilters();
  }

  /**
   * Apply all filters and sorting
   */
  private applyFilters(): void {
    let result = [...this.allLists];

    // Apply search filter
    if (this.searchText.trim()) {
      const search = this.searchText.toLowerCase();
      result = result.filter(vm =>
        vm.list.Name.toLowerCase().includes(search) ||
        (vm.list.Description?.toLowerCase().includes(search))
      );
    }

    // Apply tab filter
    switch (this.activeTab) {
      case 'my-lists':
        // Already filtered by user in loadData
        break;
      case 'recent':
        // Sort by last updated and take top 10
        result = result
          .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
          .slice(0, 10);
        break;
      // 'all' and 'shared' - no additional filtering for now
    }

    // Apply sorting
    switch (this.sortOption) {
      case 'name':
        result.sort((a, b) => a.list.Name.localeCompare(b.list.Name));
        break;
      case 'recent':
        result.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
        break;
      case 'item-count':
        result.sort((a, b) => b.itemCount - a.itemCount);
        break;
    }

    this.filteredLists = result;
    this.cdr.detectChanges();
  }

  /**
   * Toggle list selection for adding
   */
  toggleListForAdd(vm: ListItemViewModel): void {
    if (this.config?.mode === 'remove') return;

    const listId = vm.list.ID;

    if (vm.isSelectedForAdd || this.addedToLists.has(listId)) {
      // Deselect
      vm.isSelectedForAdd = false;
      this.addedToLists.delete(listId);
    } else {
      // Select for add
      vm.isSelectedForAdd = true;
      vm.isSelectedForRemove = false;
      this.addedToLists.add(listId);
      this.removedFromLists.delete(listId);
    }

    this.cdr.detectChanges();
  }

  /**
   * Toggle list selection for removal
   */
  toggleListForRemove(vm: ListItemViewModel): void {
    if (this.config?.mode === 'add') return;
    if (!this.config?.allowRemove && this.config?.mode !== 'manage') return;

    const listId = vm.list.ID;

    if (vm.isSelectedForRemove || this.removedFromLists.has(listId)) {
      // Deselect
      vm.isSelectedForRemove = false;
      this.removedFromLists.delete(listId);
    } else {
      // Select for remove
      vm.isSelectedForRemove = true;
      vm.isSelectedForAdd = false;
      this.removedFromLists.add(listId);
      this.addedToLists.delete(listId);
    }

    this.cdr.detectChanges();
  }

  /**
   * Get membership indicator class
   */
  getMembershipClass(vm: ListItemViewModel): string {
    if (vm.isFullMember) return 'full-member';
    if (vm.isPartialMember) return 'partial-member';
    return 'not-member';
  }

  /**
   * Get membership indicator text
   */
  getMembershipText(vm: ListItemViewModel): string {
    if (vm.isFullMember) {
      return `${vm.membershipCount}/${vm.totalSelectedRecords}`;
    }
    if (vm.isPartialMember) {
      return `${vm.membershipCount}/${vm.totalSelectedRecords}`;
    }
    return `0/${vm.totalSelectedRecords}`;
  }

  /**
   * Get membership icon
   */
  getMembershipIcon(vm: ListItemViewModel): string {
    if (vm.isFullMember) return 'fa-solid fa-check-circle';
    if (vm.isPartialMember) return 'fa-solid fa-circle-half-stroke';
    return 'fa-regular fa-circle';
  }

  /**
   * Show create list form
   */
  showCreateListForm(): void {
    this.showCreateForm = true;
    this.newListName = '';
    this.newListDescription = '';
    this.newListCategoryId = null;
  }

  /**
   * Cancel create list form
   */
  cancelCreateList(): void {
    this.showCreateForm = false;
    this.newListName = '';
    this.newListDescription = '';
    this.newListCategoryId = null;
  }

  /**
   * Create a new list
   */
  async createList(): Promise<void> {
    if (!this.newListName.trim() || !this.config) return;

    this.saving = true;

    try {
      const createConfig: CreateListConfig = {
        name: this.newListName.trim(),
        description: this.newListDescription.trim() || undefined,
        categoryId: this.newListCategoryId || undefined,
        entityId: this.config.entityId
      };

      const newList = await this.listService.createList(createConfig);

      if (newList) {
        this.newlyCreatedLists.push(newList);

        // Add to view models and select for add
        const vm: ListItemViewModel = {
          list: newList,
          itemCount: 0,
          membershipCount: 0,
          totalSelectedRecords: this.config.recordIds.length,
          isFullMember: false,
          isPartialMember: false,
          isNotMember: true,
          lastUpdated: new Date(),
          isSelectedForAdd: true,
          isSelectedForRemove: false
        };

        this.allLists.unshift(vm);
        this.addedToLists.add(newList.ID);

        this.showCreateForm = false;
        this.newListName = '';
        this.newListDescription = '';
        this.newListCategoryId = null;

        this.applyFilters();
      }
    } catch (error) {
      console.error('Error creating list:', error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Apply changes and close dialog
   */
  async applyChanges(): Promise<void> {
    if (!this.config) return;

    this.saving = true;

    const result: ListManagementResult = {
      action: 'apply',
      added: [],
      removed: [],
      newListsCreated: this.newlyCreatedLists
    };

    try {
      // Process additions
      if (this.addedToLists.size > 0) {
        console.log(`[ListManagementDialog] Processing additions:`);
        console.log(`  - Lists to add to:`, [...this.addedToLists]);
        console.log(`  - Record IDs:`, this.config.recordIds);

        const addResult = await this.listService.addRecordsToLists(
          [...this.addedToLists],
          this.config.recordIds,
          true // Skip duplicates
        );

        console.log(`[ListManagementDialog] Add result:`, addResult);

        for (const listId of this.addedToLists) {
          const vm = this.allLists.find(l => l.list.ID === listId);
          if (vm) {
            result.added.push({
              listId,
              listName: vm.list.Name,
              recordIds: this.config.recordIds
            });
          }
        }
      }

      // Process removals
      if (this.removedFromLists.size > 0) {
        const removeResult = await this.listService.removeRecordsFromLists(
          [...this.removedFromLists],
          this.config.recordIds
        );

        for (const listId of this.removedFromLists) {
          const vm = this.allLists.find(l => l.list.ID === listId);
          if (vm) {
            result.removed.push({
              listId,
              listName: vm.list.Name,
              recordIds: this.config.recordIds
            });
          }
        }
      }

      this.complete.emit(result);
    } catch (error) {
      console.error('Error applying changes:', error);
    } finally {
      this.saving = false;
      this._visible = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Cancel and close dialog
   */
  onCancel(): void {
    const result: ListManagementResult = {
      action: 'cancel',
      added: [],
      removed: [],
      newListsCreated: []
    };

    this._visible = false;
    this.cancel.emit();
  }

  /**
   * Format date for display
   */
  formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Check if we should show the add button for a list
   */
  showAddButton(vm: ListItemViewModel): boolean {
    if (this.config?.mode === 'remove') return false;
    return !vm.isFullMember || !this.originalMembership.get(vm.list.ID);
  }

  /**
   * Check if we should show the remove button for a list
   */
  showRemoveButton(vm: ListItemViewModel): boolean {
    if (this.config?.mode === 'add') return false;
    if (!this.config?.allowRemove && this.config?.mode !== 'manage') return false;
    return vm.isFullMember || vm.isPartialMember || this.originalMembership.get(vm.list.ID) === true;
  }
}
