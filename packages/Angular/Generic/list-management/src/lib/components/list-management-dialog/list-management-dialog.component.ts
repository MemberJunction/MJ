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
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { Metadata } from '@memberjunction/core';
import { MJListEntity, MJListCategoryEntity } from '@memberjunction/core-entities';
import { ListManagementService } from '../../services/list-management.service';
import { UUIDsEqual } from '@memberjunction/global';
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
  standalone: false,
  selector: 'mj-list-management-dialog',
  templateUrl: './list-management-dialog.component.html',
  styleUrls: ['./list-management-dialog.component.css']
})
export class ListManagementDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy  {
  /**
   * Configuration for the dialog.
   *
   * Initialization is deliberately order-independent with {@link visible}:
   * Angular assigns inputs in template attribute order, so a host binding
   * `[visible]` before `[config]` would otherwise open the dialog while
   * `config` is still undefined — `loadData()` would bail silently and the
   * dialog would render permanently empty.
   */
  @Input()
  get config(): ListManagementDialogConfig {
    return this._config;
  }
  set config(value: ListManagementDialogConfig) {
    this._config = value;
    this.tryInitialize();
  }
  private _config!: ListManagementDialogConfig;

  /**
   * Controls dialog visibility
   */
  @Input()
  get Visible(): boolean {
    return this._visible;
  }
  set Visible(value: boolean) {
    if (value && !this._visible) {
      this._pendingInit = true;
    }
    this._visible = value;
    this.tryInitialize();
  }

  /** @deprecated Use {@link Visible}. */
  get visible(): boolean {
    return this.Visible;
  }
  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: boolean) {
    this.Visible = value;
  }
  private _visible = false;

  /** Set on each closed→open transition; cleared once init actually runs (requires config). */
  private _pendingInit = false;

  /** Runs initialization once per open, as soon as BOTH visible and config are available. */
  private tryInitialize(): void {
    if (this._pendingInit && this._visible && this._config) {
      this._pendingInit = false;
      void this.initializeDialog();
    }
  }

  /**
   * Emitted when dialog is closed with results
   */
  @Output() Complete = new EventEmitter<ListManagementResult>();

  /**
   * @deprecated Use {@link Complete}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (complete) keeps working. Must stay AFTER Complete: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() complete = this.Complete;

  /**
   * Emitted when dialog is cancelled
   */
  @Output() cancel = new EventEmitter<void>();

  // State
  Loading = false;

  /** @deprecated Use {@link Loading}. */
  get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  set loading(value) {
    this.Loading = value;
  }
  saving = false;
  SearchText = '';

  /** @deprecated Use {@link SearchText}. */
  get searchText() {
    return this.SearchText;
  }
  /** @deprecated Use {@link SearchText}. */
  set searchText(value) {
    this.SearchText = value;
  }
  ActiveTab: ListFilterTab = 'all';

  /** @deprecated Use {@link ActiveTab}. */
  get activeTab(): ListFilterTab {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  set activeTab(value: ListFilterTab) {
    this.ActiveTab = value;
  }
  SortOption: ListSortOption = 'name';

  /** @deprecated Use {@link SortOption}. */
  get sortOption(): ListSortOption {
    return this.SortOption;
  }
  /** @deprecated Use {@link SortOption}. */
  set sortOption(value: ListSortOption) {
    this.SortOption = value;
  }
  ShowCreateForm = false;

  /** @deprecated Use {@link ShowCreateForm}. */
  get showCreateForm() {
    return this.ShowCreateForm;
  }
  /** @deprecated Use {@link ShowCreateForm}. */
  set showCreateForm(value) {
    this.ShowCreateForm = value;
  }

  // Data
  AllLists: ListItemViewModel[] = [];

  /** @deprecated Use {@link AllLists}. */
  get allLists(): ListItemViewModel[] {
    return this.AllLists;
  }
  /** @deprecated Use {@link AllLists}. */
  set allLists(value: ListItemViewModel[]) {
    this.AllLists = value;
  }
  FilteredLists: ListItemViewModel[] = [];

  /** @deprecated Use {@link FilteredLists}. */
  get filteredLists(): ListItemViewModel[] {
    return this.FilteredLists;
  }
  /** @deprecated Use {@link FilteredLists}. */
  set filteredLists(value: ListItemViewModel[]) {
    this.FilteredLists = value;
  }
  Categories: MJListCategoryEntity[] = [];

  /** @deprecated Use {@link Categories}. */
  get categories(): MJListCategoryEntity[] {
    return this.Categories;
  }
  /** @deprecated Use {@link Categories}. */
  set categories(value: MJListCategoryEntity[]) {
    this.Categories = value;
  }

  // Create form state
  NewListName = '';

  /** @deprecated Use {@link NewListName}. */
  get newListName() {
    return this.NewListName;
  }
  /** @deprecated Use {@link NewListName}. */
  set newListName(value) {
    this.NewListName = value;
  }
  NewListDescription = '';

  /** @deprecated Use {@link NewListDescription}. */
  get newListDescription() {
    return this.NewListDescription;
  }
  /** @deprecated Use {@link NewListDescription}. */
  set newListDescription(value) {
    this.NewListDescription = value;
  }
  NewListCategoryId: string | null = null;

  /** @deprecated Use {@link NewListCategoryId}. */
  get newListCategoryId(): string | null {
    return this.NewListCategoryId;
  }
  /** @deprecated Use {@link NewListCategoryId}. */
  set newListCategoryId(value: string | null) {
    this.NewListCategoryId = value;
  }

  // Track changes
  private originalMembership = new Map<string, boolean>();
  public AddedToLists: Set<string> = new Set();

  /** @deprecated Use {@link AddedToLists}. */
  public get addedToLists(): Set<string> {
    return this.AddedToLists;
  }
  /** @deprecated Use {@link AddedToLists}. */
  public set addedToLists(value: Set<string>) {
    this.AddedToLists = value;
  }
  public RemovedFromLists: Set<string> = new Set();

  /** @deprecated Use {@link RemovedFromLists}. */
  public get removedFromLists(): Set<string> {
    return this.RemovedFromLists;
  }
  /** @deprecated Use {@link RemovedFromLists}. */
  public set removedFromLists(value: Set<string>) {
    this.RemovedFromLists = value;
  }
  public NewlyCreatedLists: MJListEntity[] = [];

  /** @deprecated Use {@link NewlyCreatedLists}. */
  public get newlyCreatedLists(): MJListEntity[] {
    return this.NewlyCreatedLists;
  }
  /** @deprecated Use {@link NewlyCreatedLists}. */
  public set newlyCreatedLists(value: MJListEntity[]) {
    this.NewlyCreatedLists = value;
  }

  // Cleanup
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(
    private listService: ListManagementService,
    private cdr: ChangeDetectorRef
  ) {
  super();}

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
  get DialogTitle(): string {
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

  /** @deprecated Use {@link DialogTitle}. */
  get dialogTitle(): string {
    return this.DialogTitle;
  }

  /**
   * Get subtitle showing context
   */
  get DialogSubtitle(): string {
    const recordCount = this.config?.recordIds?.length || 0;
    const entityName = this.config?.entityName || 'records';

    if (recordCount === 1 && this.config?.recordDisplayNames?.[0]) {
      return `"${this.config.recordDisplayNames[0]}" from ${entityName}`;
    }

    return `${recordCount} ${entityName} record${recordCount !== 1 ? 's' : ''}`;
  }

  /** @deprecated Use {@link DialogSubtitle}. */
  get dialogSubtitle(): string {
    return this.DialogSubtitle;
  }

  /**
   * Check if there are pending changes
   */
  get HasChanges(): boolean {
    return this.AddedToLists.size > 0 || this.RemovedFromLists.size > 0;
  }

  /** @deprecated Use {@link HasChanges}. */
  get hasChanges(): boolean {
    return this.HasChanges;
  }

  /**
   * Get count of lists to add to
   */
  get AddCount(): number {
    return this.AddedToLists.size;
  }

  /** @deprecated Use {@link AddCount}. */
  get addCount(): number {
    return this.AddCount;
  }

  /**
   * Get count of lists to remove from
   */
  get RemoveCount(): number {
    return this.RemovedFromLists.size;
  }

  /** @deprecated Use {@link RemoveCount}. */
  get removeCount(): number {
    return this.RemoveCount;
  }

  /**
   * Setup search with debounce
   */
  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe((searchText: string) => {
      this.SearchText = searchText;
      this.applyFilters();
    });
  }

  /**
   * Initialize dialog when opened
   */
  private async initializeDialog(): Promise<void> {
    // Per ListManagementService's multi-provider contract: thread this
    // component's Provider input into the (root-injected) service. Null is
    // fine — the service falls back to the global provider.
    this.listService.Provider = this.Provider;
    this.resetState();
    await this.loadData();
  }

  /**
   * Reset all state
   */
  private resetState(): void {
    this.SearchText = '';
    this.ActiveTab = 'all';
    this.SortOption = 'name';
    this.ShowCreateForm = false;
    this.NewListName = '';
    this.NewListDescription = '';
    this.NewListCategoryId = null;
    this.AddedToLists.clear();
    this.RemovedFromLists.clear();
    this.NewlyCreatedLists = [];
    this.originalMembership.clear();
  }

  /**
   * Load lists and membership data
   */
  private async loadData(): Promise<void> {
    if (!this.config) return;

    this.Loading = true;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;

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

      this.Categories = categories;

      // Build view models
      this.AllLists = await this.listService.buildListViewModels(
        lists,
        this.config.recordIds,
        membership
      );

      // Store original membership state
      for (const vm of this.AllLists) {
        this.originalMembership.set(vm.list.ID, vm.isFullMember || vm.isPartialMember);
      }

      // Pre-select lists if configured
      if (this.config.preSelectedListIds) {
        for (const listId of this.config.preSelectedListIds) {
          const vm = this.AllLists.find(l => UUIDsEqual(l.list.ID, listId));
          if (vm) {
            vm.isSelectedForAdd = true;
            this.AddedToLists.add(listId);
          }
        }
      }

      this.applyFilters();
    } catch (error) {
      console.error('Error loading list data:', error);
    } finally {
      this.Loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle search input
   */
  OnSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  /** @deprecated Use {@link OnSearchInput}. */
  onSearchInput(event: Event): void {
    return this.OnSearchInput(event);
  }

  /**
   * Clear search
   */
  ClearSearch(): void {
    this.SearchText = '';
    this.searchSubject.next('');
  }

  /** @deprecated Use {@link ClearSearch}. */
  clearSearch(): void {
    return this.ClearSearch();
  }

  /**
   * Change active tab
   */
  SetActiveTab(tab: ListFilterTab): void {
    this.ActiveTab = tab;
    this.applyFilters();
  }

  /** @deprecated Use {@link SetActiveTab}. */
  setActiveTab(tab: ListFilterTab): void {
    return this.SetActiveTab(tab);
  }

  /**
   * Change sort option
   */
  SetSortOption(option: ListSortOption): void {
    this.SortOption = option;
    this.applyFilters();
  }

  /** @deprecated Use {@link SetSortOption}. */
  setSortOption(option: ListSortOption): void {
    return this.SetSortOption(option);
  }

  /**
   * Apply all filters and sorting
   */
  private applyFilters(): void {
    let result = [...this.AllLists];

    // Apply search filter
    if (this.SearchText.trim()) {
      const search = this.SearchText.toLowerCase();
      result = result.filter(vm =>
        vm.list.Name.toLowerCase().includes(search) ||
        (vm.list.Description?.toLowerCase().includes(search))
      );
    }

    // Apply tab filter
    switch (this.ActiveTab) {
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
    switch (this.SortOption) {
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

    this.FilteredLists = result;
    this.cdr.detectChanges();
  }

  /**
   * Toggle list selection for adding
   */
  ToggleListForAdd(vm: ListItemViewModel): void {
    if (this.config?.mode === 'remove') return;

    const listId = vm.list.ID;

    if (vm.isSelectedForAdd || this.AddedToLists.has(listId)) {
      // Deselect
      vm.isSelectedForAdd = false;
      this.AddedToLists.delete(listId);
    } else {
      // Select for add
      vm.isSelectedForAdd = true;
      vm.isSelectedForRemove = false;
      this.AddedToLists.add(listId);
      this.RemovedFromLists.delete(listId);
    }

    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link ToggleListForAdd}. */
  toggleListForAdd(vm: ListItemViewModel): void {
    return this.ToggleListForAdd(vm);
  }

  /**
   * Toggle list selection for removal
   */
  ToggleListForRemove(vm: ListItemViewModel): void {
    if (this.config?.mode === 'add') return;
    if (!this.config?.allowRemove && this.config?.mode !== 'manage') return;

    const listId = vm.list.ID;

    if (vm.isSelectedForRemove || this.RemovedFromLists.has(listId)) {
      // Deselect
      vm.isSelectedForRemove = false;
      this.RemovedFromLists.delete(listId);
    } else {
      // Select for remove
      vm.isSelectedForRemove = true;
      vm.isSelectedForAdd = false;
      this.RemovedFromLists.add(listId);
      this.AddedToLists.delete(listId);
    }

    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link ToggleListForRemove}. */
  toggleListForRemove(vm: ListItemViewModel): void {
    return this.ToggleListForRemove(vm);
  }

  /**
   * Get membership indicator class
   */
  GetMembershipClass(vm: ListItemViewModel): string {
    if (vm.isFullMember) return 'full-member';
    if (vm.isPartialMember) return 'partial-member';
    return 'not-member';
  }

  /** @deprecated Use {@link GetMembershipClass}. */
  getMembershipClass(vm: ListItemViewModel): string {
    return this.GetMembershipClass(vm);
  }

  /**
   * Get membership indicator text
   */
  GetMembershipText(vm: ListItemViewModel): string {
    if (vm.isFullMember) {
      return `${vm.membershipCount}/${vm.totalSelectedRecords}`;
    }
    if (vm.isPartialMember) {
      return `${vm.membershipCount}/${vm.totalSelectedRecords}`;
    }
    return `0/${vm.totalSelectedRecords}`;
  }

  /** @deprecated Use {@link GetMembershipText}. */
  getMembershipText(vm: ListItemViewModel): string {
    return this.GetMembershipText(vm);
  }

  /**
   * Get membership icon
   */
  GetMembershipIcon(vm: ListItemViewModel): string {
    if (vm.isFullMember) return 'fa-solid fa-check-circle';
    if (vm.isPartialMember) return 'fa-solid fa-circle-half-stroke';
    return 'fa-regular fa-circle';
  }

  /** @deprecated Use {@link GetMembershipIcon}. */
  getMembershipIcon(vm: ListItemViewModel): string {
    return this.GetMembershipIcon(vm);
  }

  /**
   * Show create list form
   */
  ShowCreateListForm(): void {
    this.ShowCreateForm = true;
    this.NewListName = '';
    this.NewListDescription = '';
    this.NewListCategoryId = null;
  }

  /** @deprecated Use {@link ShowCreateListForm}. */
  showCreateListForm(): void {
    return this.ShowCreateListForm();
  }

  /**
   * Cancel create list form
   */
  CancelCreateList(): void {
    this.ShowCreateForm = false;
    this.NewListName = '';
    this.NewListDescription = '';
    this.NewListCategoryId = null;
  }

  /** @deprecated Use {@link CancelCreateList}. */
  cancelCreateList(): void {
    return this.CancelCreateList();
  }

  /**
   * Create a new list
   */
  async CreateList(): Promise<void> {
    if (!this.NewListName.trim() || !this.config) return;

    this.saving = true;

    try {
      const createConfig: CreateListConfig = {
        name: this.NewListName.trim(),
        description: this.NewListDescription.trim() || undefined,
        categoryId: this.NewListCategoryId || undefined,
        entityId: this.config.entityId
      };

      const newList = await this.listService.createList(createConfig);

      if (newList) {
        this.NewlyCreatedLists.push(newList);

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

        this.AllLists.unshift(vm);
        this.AddedToLists.add(newList.ID);

        this.ShowCreateForm = false;
        this.NewListName = '';
        this.NewListDescription = '';
        this.NewListCategoryId = null;

        this.applyFilters();
      }
    } catch (error) {
      console.error('Error creating list:', error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link CreateList}. */
  async createList(): Promise<void> {
    return this.CreateList();
  }

  /**
   * Apply changes and close dialog
   */
  async ApplyChanges(): Promise<void> {
    if (!this.config) return;

    this.saving = true;

    const result: ListManagementResult = {
      action: 'apply',
      added: [],
      removed: [],
      newListsCreated: this.NewlyCreatedLists,
      summary: { added: 0, removed: 0, skipped: 0, failed: 0 }
    };

    try {
      // Process additions
      if (this.AddedToLists.size > 0) {
        const addResult = await this.listService.addRecordsToLists(
          [...this.AddedToLists],
          this.config.recordIds,
          true // Skip duplicates
        );
        result.summary!.added += addResult.success;
        result.summary!.skipped += addResult.skipped;
        result.summary!.failed += addResult.failed;

        for (const listId of this.AddedToLists) {
          const vm = this.AllLists.find(l => UUIDsEqual(l.list.ID, listId));
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
      if (this.RemovedFromLists.size > 0) {
        const removeResult = await this.listService.removeRecordsFromLists(
          [...this.RemovedFromLists],
          this.config.recordIds
        );
        result.summary!.removed += removeResult.success;
        result.summary!.failed += removeResult.failed;

        for (const listId of this.RemovedFromLists) {
          const vm = this.AllLists.find(l => UUIDsEqual(l.list.ID, listId));
          if (vm) {
            result.removed.push({
              listId,
              listName: vm.list.Name,
              recordIds: this.config.recordIds
            });
          }
        }
      }

      this.Complete.emit(result);
    } catch (error) {
      console.error('Error applying changes:', error);
    } finally {
      this.saving = false;
      this._visible = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link ApplyChanges}. */
  async applyChanges(): Promise<void> {
    return this.ApplyChanges();
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
  ShowAddButton(vm: ListItemViewModel): boolean {
    if (this.config?.mode === 'remove') return false;
    return !vm.isFullMember || !this.originalMembership.get(vm.list.ID);
  }

  /** @deprecated Use {@link ShowAddButton}. */
  showAddButton(vm: ListItemViewModel): boolean {
    return this.ShowAddButton(vm);
  }

  /**
   * Check if we should show the remove button for a list
   */
  ShowRemoveButton(vm: ListItemViewModel): boolean {
    if (this.config?.mode === 'add') return false;
    if (!this.config?.allowRemove && this.config?.mode !== 'manage') return false;
    return vm.isFullMember || vm.isPartialMember || this.originalMembership.get(vm.list.ID) === true;
  }

  /** @deprecated Use {@link ShowRemoveButton}. */
  showRemoveButton(vm: ListItemViewModel): boolean {
    return this.ShowRemoveButton(vm);
  }
}
