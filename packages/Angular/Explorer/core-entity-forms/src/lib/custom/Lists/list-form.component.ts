import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { RegisterClass, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { MJListFormComponent } from '../../generated/Entities/MJList/mjlist.form.component';
import { MJListEntity, MJListDetailEntity, MJListDetailEntityExtended, MJListCategoryEntity, MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { CompositeKey, Metadata, RunView, RunViewResult, EntityInfo, LogError, LogStatus } from '@memberjunction/core';
import { ListShareDialogConfig, ListShareDialogResult, GetRecordDisplayField, IsTextSearchableField, FormatRecordDisplayValue } from '@memberjunction/ng-list-management';
import { MJConfirmService } from '@memberjunction/ng-ui-components';

export type ListSection = 'overview' | 'items' | 'sharing' | 'activity' | 'settings';

export interface ListItemViewModel {
    detail: MJListDetailEntity;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    recordName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    isLoading: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface ListStats {
    itemCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    shareCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    invitationCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    lastUpdated: Date | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Represents a record that can be added to a list
 */
export interface AddableRecord {
    ID: string;
    Name: string;
    isInList: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    isSelected: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * World-class List form component that provides a rich exploration experience
 * for managing lists in the MemberJunction system.
 *
 * Features:
 * - Overview with visual stats and entity context
 * - Items grid with inline record navigation
 * - Sharing management (coming soon)
 * - Activity history
 * - Settings and configuration
 */
@RegisterClass(BaseFormComponent, 'MJ: Lists')
@Component({
  standalone: false,
    selector: 'mj-list-form-extended',
    templateUrl: './list-form.component.html',
    styleUrls: ['./list-form.component.css', '../../../shared/form-styles.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJListFormComponentExtended extends MJListFormComponent implements OnInit, OnDestroy {
    private sharedService = inject(SharedService);
    private confirmService = inject(MJConfirmService);

    public override record!: MJListEntity;

    // Navigation
    public ActiveSection: ListSection = 'overview';

    /** @deprecated Use {@link ActiveSection}. */
    public get activeSection(): ListSection {
      return this.ActiveSection;
    }
    /** @deprecated Use {@link ActiveSection}. */
    public set activeSection(value: ListSection) {
      this.ActiveSection = value;
    }
    public NavItems = [
        { id: 'overview' as ListSection, icon: 'fa-solid fa-house', label: 'Overview' },
        { id: 'items' as ListSection, icon: 'fa-solid fa-list', label: 'Items', badge: 0 },
        { id: 'sharing' as ListSection, icon: 'fa-solid fa-share-nodes', label: 'Sharing', badge: 0, disabled: false },
        { id: 'activity' as ListSection, icon: 'fa-solid fa-clock-rotate-left', label: 'Activity' },
        { id: 'settings' as ListSection, icon: 'fa-solid fa-gear', label: 'Settings' }
    ];

    /** @deprecated Use {@link NavItems}. */
    public get navItems() {
      return this.NavItems;
    }
    /** @deprecated Use {@link NavItems}. */
    public set navItems(value) {
      this.NavItems = value;
    }

    // Data
    public ListItems: ListItemViewModel[] = [];

    /** @deprecated Use {@link ListItems}. */
    public get listItems(): ListItemViewModel[] {
      return this.ListItems;
    }
    /** @deprecated Use {@link ListItems}. */
    public set listItems(value: ListItemViewModel[]) {
      this.ListItems = value;
    }
    public Categories: MJListCategoryEntity[] = [];

    /** @deprecated Use {@link Categories}. */
    public get categories(): MJListCategoryEntity[] {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value: MJListCategoryEntity[]) {
      this.Categories = value;
    }
    public entityInfo: EntityInfo | null = null;  // case-violation-ok-legacy-back-compat: an ancestor class already declares the PascalCase name
    public Stats: ListStats = {
        itemCount: 0,
        shareCount: 0,
        invitationCount: 0,
        lastUpdated: null
    };

    /** @deprecated Use {@link Stats}. */
    public get stats(): ListStats {
      return this.Stats;
    }
    /** @deprecated Use {@link Stats}. */
    public set stats(value: ListStats) {
      this.Stats = value;
    }

    // Loading states
    public IsLoadingItems = false;

    /** @deprecated Use {@link IsLoadingItems}. */
    public get isLoadingItems() {
      return this.IsLoadingItems;
    }
    /** @deprecated Use {@link IsLoadingItems}. */
    public set isLoadingItems(value) {
      this.IsLoadingItems = value;
    }
    public IsLoadingStats = false;

    /** @deprecated Use {@link IsLoadingStats}. */
    public get isLoadingStats() {
      return this.IsLoadingStats;
    }
    /** @deprecated Use {@link IsLoadingStats}. */
    public set isLoadingStats(value) {
      this.IsLoadingStats = value;
    }
    public ExplorerError: string | null = null;

    /** @deprecated Use {@link ExplorerError}. */
    public get explorerError(): string | null {
      return this.ExplorerError;
    }
    /** @deprecated Use {@link ExplorerError}. */
    public set explorerError(value: string | null) {
      this.ExplorerError = value;
    }

    // Items section
    public ItemSearchTerm = '';

    /** @deprecated Use {@link ItemSearchTerm}. */
    public get itemSearchTerm() {
      return this.ItemSearchTerm;
    }
    /** @deprecated Use {@link ItemSearchTerm}. */
    public set itemSearchTerm(value) {
      this.ItemSearchTerm = value;
    }
    public SelectedItems = new Set<string>();

    /** @deprecated Use {@link SelectedItems}. */
    public get selectedItems() {
      return this.SelectedItems;
    }
    /** @deprecated Use {@link SelectedItems}. */
    public set selectedItems(value) {
      this.SelectedItems = value;
    }
    public IsSelectAllChecked = false;

    /** @deprecated Use {@link IsSelectAllChecked}. */
    public get isSelectAllChecked() {
      return this.IsSelectAllChecked;
    }
    /** @deprecated Use {@link IsSelectAllChecked}. */
    public set isSelectAllChecked(value) {
      this.IsSelectAllChecked = value;
    }

    // Items pagination — the Items grid loads one page at a time so large
    // lists (thousands of members) don't pull the entire membership into the
    // browser. Display-name resolution is likewise batched per page.
    public ItemsPage = 0;

    /** @deprecated Use {@link ItemsPage}. */
    public get itemsPage() {
      return this.ItemsPage;
    }
    /** @deprecated Use {@link ItemsPage}. */
    public set itemsPage(value) {
      this.ItemsPage = value;
    }
    public readonly ItemsPageSize = 100;

    /** @deprecated Use {@link ItemsPageSize}. */
    public get itemsPageSize() {
      return this.ItemsPageSize;
    }

    // Edit state
    public IsEditingName = false;

    /** @deprecated Use {@link IsEditingName}. */
    public get isEditingName() {
      return this.IsEditingName;
    }
    /** @deprecated Use {@link IsEditingName}. */
    public set isEditingName(value) {
      this.IsEditingName = value;
    }
    public IsEditingDescription = false;

    /** @deprecated Use {@link IsEditingDescription}. */
    public get isEditingDescription() {
      return this.IsEditingDescription;
    }
    /** @deprecated Use {@link IsEditingDescription}. */
    public set isEditingDescription(value) {
      this.IsEditingDescription = value;
    }
    public EditingName = '';

    /** @deprecated Use {@link EditingName}. */
    public get editingName() {
      return this.EditingName;
    }
    /** @deprecated Use {@link EditingName}. */
    public set editingName(value) {
      this.EditingName = value;
    }
    public EditingDescription = '';

    /** @deprecated Use {@link EditingDescription}. */
    public get editingDescription() {
      return this.EditingDescription;
    }
    /** @deprecated Use {@link EditingDescription}. */
    public set editingDescription(value) {
      this.EditingDescription = value;
    }

    // Add Records dialog
    public ShowAddRecordsDialog = false;

    /** @deprecated Use {@link ShowAddRecordsDialog}. */
    public get showAddRecordsDialog() {
      return this.ShowAddRecordsDialog;
    }
    /** @deprecated Use {@link ShowAddRecordsDialog}. */
    public set showAddRecordsDialog(value) {
      this.ShowAddRecordsDialog = value;
    }
    public AddDialogLoading = false;

    /** @deprecated Use {@link AddDialogLoading}. */
    public get addDialogLoading() {
      return this.AddDialogLoading;
    }
    /** @deprecated Use {@link AddDialogLoading}. */
    public set addDialogLoading(value) {
      this.AddDialogLoading = value;
    }
    public AddDialogSaving = false;

    /** @deprecated Use {@link AddDialogSaving}. */
    public get addDialogSaving() {
      return this.AddDialogSaving;
    }
    /** @deprecated Use {@link AddDialogSaving}. */
    public set addDialogSaving(value) {
      this.AddDialogSaving = value;
    }
    public AddableRecords: AddableRecord[] = [];

    /** @deprecated Use {@link AddableRecords}. */
    public get addableRecords(): AddableRecord[] {
      return this.AddableRecords;
    }
    /** @deprecated Use {@link AddableRecords}. */
    public set addableRecords(value: AddableRecord[]) {
      this.AddableRecords = value;
    }
    public AddRecordsSearchFilter = '';

    /** @deprecated Use {@link AddRecordsSearchFilter}. */
    public get addRecordsSearchFilter() {
      return this.AddRecordsSearchFilter;
    }
    /** @deprecated Use {@link AddRecordsSearchFilter}. */
    public set addRecordsSearchFilter(value) {
      this.AddRecordsSearchFilter = value;
    }
    public ExistingListDetailIds = new Set<string>();

    /** @deprecated Use {@link ExistingListDetailIds}. */
    public get existingListDetailIds() {
      return this.ExistingListDetailIds;
    }
    /** @deprecated Use {@link ExistingListDetailIds}. */
    public set existingListDetailIds(value) {
      this.ExistingListDetailIds = value;
    }
    public AddProgress = 0;

    /** @deprecated Use {@link AddProgress}. */
    public get addProgress() {
      return this.AddProgress;
    }
    /** @deprecated Use {@link AddProgress}. */
    public set addProgress(value) {
      this.AddProgress = value;
    }
    public AddTotal = 0;

    /** @deprecated Use {@link AddTotal}. */
    public get addTotal() {
      return this.AddTotal;
    }
    /** @deprecated Use {@link AddTotal}. */
    public set addTotal(value) {
      this.AddTotal = value;
    }
    private searchSubject = new Subject<string>();

    // Add From View dialog
    public ShowAddFromViewDialog = false;

    /** @deprecated Use {@link ShowAddFromViewDialog}. */
    public get showAddFromViewDialog() {
      return this.ShowAddFromViewDialog;
    }
    /** @deprecated Use {@link ShowAddFromViewDialog}. */
    public set showAddFromViewDialog(value) {
      this.ShowAddFromViewDialog = value;
    }
    public ShowAddFromViewLoader = false;

    /** @deprecated Use {@link ShowAddFromViewLoader}. */
    public get showAddFromViewLoader() {
      return this.ShowAddFromViewLoader;
    }
    /** @deprecated Use {@link ShowAddFromViewLoader}. */
    public set showAddFromViewLoader(value) {
      this.ShowAddFromViewLoader = value;
    }
    public UserViews: MJUserViewEntityExtended[] | null = null;

    /** @deprecated Use {@link UserViews}. */
    public get userViews(): MJUserViewEntityExtended[] | null {
      return this.UserViews;
    }
    /** @deprecated Use {@link UserViews}. */
    public set userViews(value: MJUserViewEntityExtended[] | null) {
      this.UserViews = value;
    }
    public UserViewsToAdd: MJUserViewEntityExtended[] = [];

    /** @deprecated Use {@link UserViewsToAdd}. */
    public get userViewsToAdd(): MJUserViewEntityExtended[] {
      return this.UserViewsToAdd;
    }
    /** @deprecated Use {@link UserViewsToAdd}. */
    public set userViewsToAdd(value: MJUserViewEntityExtended[]) {
      this.UserViewsToAdd = value;
    }
    /**
     * Normalized-UUID set of the IDs in {@link userViewsToAdd}, kept in sync with that
     * array. Lets {@link isViewSelected} (bound per-row in the dialog's @for, ~2x/row)
     * do an O(1) lookup instead of scanning the array with UUIDsEqual on every check.
     */
    private userViewsToAddIds: Set<string> = new Set<string>();
    public AddFromViewProgress = 0;

    /** @deprecated Use {@link AddFromViewProgress}. */
    public get addFromViewProgress() {
      return this.AddFromViewProgress;
    }
    /** @deprecated Use {@link AddFromViewProgress}. */
    public set addFromViewProgress(value) {
      this.AddFromViewProgress = value;
    }
    public AddFromViewTotal = 0;

    /** @deprecated Use {@link AddFromViewTotal}. */
    public get addFromViewTotal() {
      return this.AddFromViewTotal;
    }
    /** @deprecated Use {@link AddFromViewTotal}. */
    public set addFromViewTotal(value) {
      this.AddFromViewTotal = value;
    }
    public FetchingRecordsToSave = false;

    /** @deprecated Use {@link FetchingRecordsToSave}. */
    public get fetchingRecordsToSave() {
      return this.FetchingRecordsToSave;
    }
    /** @deprecated Use {@link FetchingRecordsToSave}. */
    public set fetchingRecordsToSave(value) {
      this.FetchingRecordsToSave = value;
    }

    // Share dialog
    public ShowShareDialog = false;

    /** @deprecated Use {@link ShowShareDialog}. */
    public get showShareDialog() {
      return this.ShowShareDialog;
    }
    /** @deprecated Use {@link ShowShareDialog}. */
    public set showShareDialog(value) {
      this.ShowShareDialog = value;
    }
    public ShareDialogConfig: ListShareDialogConfig | null = null;

    /** @deprecated Use {@link ShareDialogConfig}. */
    public get shareDialogConfig(): ListShareDialogConfig | null {
      return this.ShareDialogConfig;
    }
    /** @deprecated Use {@link ShareDialogConfig}. */
    public set shareDialogConfig(value: ListShareDialogConfig | null) {
      this.ShareDialogConfig = value;
    }

    // Invitations / audit log dialogs — opened from the share dialog.
    public ShowInvitationsDialog = false;

    /** @deprecated Use {@link ShowInvitationsDialog}. */
    public get showInvitationsDialog() {
      return this.ShowInvitationsDialog;
    }
    /** @deprecated Use {@link ShowInvitationsDialog}. */
    public set showInvitationsDialog(value) {
      this.ShowInvitationsDialog = value;
    }
    public ShowAuditLogDialog = false;

    /** @deprecated Use {@link ShowAuditLogDialog}. */
    public get showAuditLogDialog() {
      return this.ShowAuditLogDialog;
    }
    /** @deprecated Use {@link ShowAuditLogDialog}. */
    public set showAuditLogDialog(value) {
      this.ShowAuditLogDialog = value;
    }

    private destroy$ = new Subject<void>();
    private get metadata() { return this.ProviderToUse; }
    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        // Set up search debounce
        this.searchSubject
            .pipe(debounceTime(300), takeUntil(this.destroy$))
            .subscribe((searchText) => this.searchRecords(searchText));

        await this.loadExplorerData();
    }

    // Helper to show notifications using SharedService's deprecated method
    private showNotification(message: string, style: 'success' | 'error' | 'info' = 'info', duration: number = 3000): void {
        this.sharedService.CreateSimpleNotification(message, style, duration);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private async loadExplorerData(): Promise<void> {
        try {
            // Load entity info for context
            if (this.record?.EntityID) {
                this.entityInfo = this.metadata.Entities.find(e => UUIDsEqual(e.ID, this.record.EntityID)) || null;
            }

            // Load categories for dropdown
            await this.loadCategories();

            // Load items and stats in parallel
            await Promise.all([
                this.loadItems(),
                this.loadStats()
            ]);

            this.updateNavBadges();
        } catch (error) {
            console.error('Error loading list data:', error);
            this.ExplorerError = 'Failed to load list data';
        } finally {
            this.cdr.detectChanges();
        }
    }

    private async loadCategories(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<MJListCategoryEntity>({
            EntityName: 'MJ: List Categories',
            OrderBy: 'Name',
            ResultType: 'entity_object'
        });
        if (result.Success) {
            this.Categories = result.Results;
        }
    }

    private async loadItems(page: number = 0): Promise<void> {
        if (!this.record?.IsSaved) return;

        this.IsLoadingItems = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJListDetailEntity>({
                EntityName: 'MJ: List Details',
                ExtraFilter: `ListID = '${this.record.ID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                StartRow: page * this.ItemsPageSize,
                MaxRows: this.ItemsPageSize,
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.ItemsPage = page;
                this.ListItems = result.Results.map(detail => ({
                    detail,
                    recordName: detail.RecordID || 'Loading...',
                    isLoading: true
                }));
                this.SelectedItems.clear();
                this.IsSelectAllChecked = false;

                // Resolve display names for this page in one batched query
                await this.loadRecordNames();
            }
        } catch (error) {
            console.error('Error loading list items:', error);
        } finally {
            this.IsLoadingItems = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Resolves display names for the current page of items with a single
     * batched `PK IN (...)` query per 250 items — never one query per item.
     */
    private async loadRecordNames(): Promise<void> {
        const finish = () => {
            for (const item of this.ListItems) item.isLoading = false;
            this.cdr.detectChanges();
        };

        if (!this.entityInfo || this.ListItems.length === 0) {
            finish();
            return;
        }

        // NameField when the entity has one; otherwise the fallback field
        // (first non-PK/non-FK/non-system field), shown as "<id> — <value>"
        const displayField = GetRecordDisplayField(this.entityInfo);
        if (!displayField.Field) {
            // Entity has only key fields — the record ID is the best label available
            for (const item of this.ListItems) {
                item.recordName = item.detail.RecordID || 'Unknown';
            }
            finish();
            return;
        }

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const entityInfo = this.entityInfo;
        // Keyed by the compact key segment (raw value for a single-column key, "F1|v1||F2|v2" for a
        // composite one) — the same form ListDetail.RecordID stores, so the lookups below line up.
        const valueMap = new Map<string, unknown>();
        const ids = this.ListItems
            .map(i => i.detail.RecordID)
            .filter((id): id is string => !!id);

        const CHUNK_SIZE = 250;
        for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
            const chunk = ids.slice(start, start + CHUNK_SIZE);
            try {
                const result = await rv.RunView({
                    EntityName: entityInfo.Name,
                    ExtraFilter: this.buildRecordIdFilter(entityInfo, chunk),
                    Fields: [...entityInfo.PrimaryKeys.map(pk => pk.Name), displayField.Field.Name],
                    ResultType: 'simple'
                });
                if (result.Success) {
                    for (const row of result.Results as Array<Record<string, unknown>>) {
                        const key = CompositeKey.FromEntityRecord(entityInfo, row).ToCompactURLSegment();
                        valueMap.set(NormalizeUUID(key), row[displayField.Field.Name]);
                    }
                }
            } catch (error) {
                // Fall through — unresolved items display their RecordID
            }
        }

        for (const item of this.ListItems) {
            const id = item.detail.RecordID || 'Unknown';
            const value = item.detail.RecordID ? valueMap.get(NormalizeUUID(item.detail.RecordID)) : undefined;
            item.recordName = FormatRecordDisplayValue(id, value, displayField);
        }
        finish();
    }

    /**
     * Predicate selecting the records identified by compact key segments. A single-column key
     * collapses to one `<pk> IN (...)`; a composite key expands each segment to its full
     * `(F1='v1' AND F2='v2')` predicate and ORs them — an IN on the first column alone would
     * silently match the wrong rows.
     */
    private buildRecordIdFilter(entityInfo: EntityInfo, recordIds: string[]): string {
        if (entityInfo.PrimaryKeys.length === 1) {
            const inList = recordIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
            return `${entityInfo.FirstPrimaryKey.Name} IN (${inList})`; // first-pk-ok: guarded by PrimaryKeys.length === 1 above
        }
        return recordIds
            .map(id => `(${CompositeKey.FromURLSegment(entityInfo, id).ToWhereClause()})`)
            .join(' OR ');
    }

    // === Items pagination ===

    public get TotalPages(): number {
        return Math.max(1, Math.ceil(this.Stats.itemCount / this.ItemsPageSize));
    }

    /** @deprecated Use {@link TotalPages}. */
    public get totalPages(): number {
      return this.TotalPages;
    }

    public async GoToPage(page: number): Promise<void> {
        if (page < 0 || page >= this.TotalPages || page === this.ItemsPage) return;
        await this.loadItems(page);
    }

    /** @deprecated Use {@link GoToPage}. */
    public async goToPage(page: number): Promise<void> {
      return this.GoToPage(page);
    }

    private async loadStats(): Promise<void> {
        if (!this.record?.IsSaved) return;

        this.IsLoadingStats = true;

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [itemsResult, sharesResult, invitationsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: List Details',
                    ExtraFilter: `ListID = '${this.record.ID}'`,
                    ResultType: 'count_only'
                },
                {
                    EntityName: 'MJ: List Shares',
                    ExtraFilter: `ListID = '${this.record.ID}'`,
                    ResultType: 'count_only'
                },
                {
                    EntityName: 'MJ: List Invitations',
                    ExtraFilter: `ListID = '${this.record.ID}'`,
                    ResultType: 'count_only'
                }
            ]);

            this.Stats = {
                itemCount: itemsResult.Success ? itemsResult.TotalRowCount : 0,
                shareCount: sharesResult.Success ? sharesResult.TotalRowCount : 0,
                invitationCount: invitationsResult.Success ? invitationsResult.TotalRowCount : 0,
                lastUpdated: this.record.__mj_UpdatedAt
            };
        } catch (error) {
            console.error('Error loading stats:', error);
        } finally {
            this.IsLoadingStats = false;
            this.cdr.detectChanges();
        }
    }

    private updateNavBadges(): void {
        this.NavItems = this.NavItems.map(item => {
            switch (item.id) {
                case 'items':
                    return { ...item, badge: this.Stats.itemCount };
                case 'sharing':
                    return { ...item, badge: this.Stats.shareCount + this.Stats.invitationCount };
                default:
                    return item;
            }
        });
    }

    // === Navigation ===

    public SetActiveSection(section: ListSection): void {
        const navItem = this.NavItems.find(n => n.id === section);
        if (navItem?.disabled) return;

        this.ActiveSection = section;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link SetActiveSection}. */
    public setActiveSection(section: ListSection): void {
      return this.SetActiveSection(section);
    }

    // === Items Management ===

    public get FilteredItems(): ListItemViewModel[] {
        if (!this.ItemSearchTerm) return this.ListItems;

        const term = this.ItemSearchTerm.toLowerCase();
        return this.ListItems.filter(item =>
            item.recordName.toLowerCase().includes(term) ||
            item.detail.RecordID?.toLowerCase().includes(term)
        );
    }

    /** @deprecated Use {@link FilteredItems}. */
    public get filteredItems(): ListItemViewModel[] {
      return this.FilteredItems;
    }

    public ToggleItemSelection(item: ListItemViewModel): void {
        const id = item.detail.ID;
        if (this.SelectedItems.has(id)) {
            this.SelectedItems.delete(id);
        } else {
            this.SelectedItems.add(id);
        }
        this.updateSelectAllState();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleItemSelection}. */
    public toggleItemSelection(item: ListItemViewModel): void {
      return this.ToggleItemSelection(item);
    }

    public ToggleSelectAll(): void {
        if (this.IsSelectAllChecked) {
            this.SelectedItems.clear();
        } else {
            for (const item of this.FilteredItems) {
                this.SelectedItems.add(item.detail.ID);
            }
        }
        this.IsSelectAllChecked = !this.IsSelectAllChecked;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleSelectAll}. */
    public toggleSelectAll(): void {
      return this.ToggleSelectAll();
    }

    private updateSelectAllState(): void {
        this.IsSelectAllChecked = this.FilteredItems.length > 0 &&
            this.FilteredItems.every(item => this.SelectedItems.has(item.detail.ID));
    }

    public async RemoveSelectedItems(): Promise<void> {
        if (this.SelectedItems.size === 0) return;

        const count = this.SelectedItems.size;
        const confirmMessage = `Remove ${count} item${count > 1 ? 's' : ''} from this list?`;

        if (!(await this.confirmService.ConfirmDelete({ message: confirmMessage }))) return;

        try {
            // Queue all deletes in one TransactionGroup — one round trip
            // instead of one per selected item. Deliberately atomic (unlike
            // the server bulk paths, which trade atomicity for per-record
            // error isolation): if Submit() fails, the transaction rolled
            // back and NO rows were removed.
            const tg = await this.metadata.CreateTransactionGroup();
            let queued = 0;
            let failedToQueue = 0;
            for (const id of this.SelectedItems) {
                const item = this.ListItems.find(i => UUIDsEqual(i.detail.ID, id));
                if (item) {
                    item.detail.TransactionGroup = tg;
                    // With a TransactionGroup set, Delete() returns true once
                    // enqueued; false means a pre-enqueue failure (validation/
                    // permission) and the row never joined the transaction.
                    if (await item.detail.Delete()) {
                        queued++;
                    } else {
                        failedToQueue++;
                        LogError(`Failed to queue list item removal: ${item.detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                }
            }
            const success = queued === 0 || await tg.Submit();
            if (!success) {
                this.showNotification('Error removing items from list', 'error', 4000);
                return;
            }

            if (failedToQueue > 0) {
                this.showNotification(
                    `Removed ${queued} item${queued === 1 ? '' : 's'} from list; ${failedToQueue} failed`,
                    'error',
                    4000
                );
            } else {
                this.showNotification(
                    `Removed ${count} item${count > 1 ? 's' : ''} from list`,
                    'success',
                    3000
                );
            }

            this.SelectedItems.clear();
            await this.loadStats();
            await this.loadItems(Math.min(this.ItemsPage, this.TotalPages - 1));
            this.updateNavBadges();
        } catch (error) {
            console.error('Error removing items:', error);
            this.showNotification(
                'Error removing items from list',
                'error',
                4000
            );
        }
    }

    /** @deprecated Use {@link RemoveSelectedItems}. */
    public async removeSelectedItems(): Promise<void> {
      return this.RemoveSelectedItems();
    }

    public OpenRecord(item: ListItemViewModel): void {
        if (!this.entityInfo || !item.detail.RecordID) return;

        // ListDetail.RecordID is the compact CompositeKey segment: the raw value for a single-column
        // key (whatever the column is called), "F1|v1||F2|v2" for a composite key. FromURLSegment
        // reads both against this list's entity metadata — `FromID` assumed the column was `ID`.
        SharedService.Instance.OpenEntityRecord(this.entityInfo.Name, CompositeKey.FromURLSegment(this.entityInfo, item.detail.RecordID));
    }

    /** @deprecated Use {@link OpenRecord}. */
    public openRecord(item: ListItemViewModel): void {
      return this.OpenRecord(item);
    }

    // === Inline Editing ===

    public StartEditingName(): void {
        this.EditingName = this.record.Name;
        this.IsEditingName = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link StartEditingName}. */
    public startEditingName(): void {
      return this.StartEditingName();
    }

    public async SaveNameEdit(): Promise<void> {
        if (!this.EditingName.trim()) {
            this.CancelNameEdit();
            return;
        }

        this.record.Name = this.EditingName.trim();
        const saved = await this.record.Save();

        if (saved) {
            this.showNotification('Name updated', 'success', 2000);
        } else {
            this.showNotification('Failed to update name', 'error', 3000);
        }

        this.IsEditingName = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link SaveNameEdit}. */
    public async saveNameEdit(): Promise<void> {
      return this.SaveNameEdit();
    }

    public CancelNameEdit(): void {
        this.IsEditingName = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CancelNameEdit}. */
    public cancelNameEdit(): void {
      return this.CancelNameEdit();
    }

    public StartEditingDescription(): void {
        this.EditingDescription = this.record.Description || '';
        this.IsEditingDescription = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link StartEditingDescription}. */
    public startEditingDescription(): void {
      return this.StartEditingDescription();
    }

    public async SaveDescriptionEdit(): Promise<void> {
        this.record.Description = this.EditingDescription.trim() || null;
        const saved = await this.record.Save();

        if (saved) {
            this.showNotification('Description updated', 'success', 2000);
        } else {
            this.showNotification('Failed to update description', 'error', 3000);
        }

        this.IsEditingDescription = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link SaveDescriptionEdit}. */
    public async saveDescriptionEdit(): Promise<void> {
      return this.SaveDescriptionEdit();
    }

    public CancelDescriptionEdit(): void {
        this.IsEditingDescription = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CancelDescriptionEdit}. */
    public cancelDescriptionEdit(): void {
      return this.CancelDescriptionEdit();
    }

    // === Helpers ===

    public get EntityDisplayName(): string {
        return this.entityInfo?.DisplayName || this.entityInfo?.Name || this.record?.Entity || 'Unknown';
    }

    /** @deprecated Use {@link EntityDisplayName}. */
    public get entityDisplayName(): string {
      return this.EntityDisplayName;
    }

    public get EntityIcon(): string {
        return this.entityInfo?.Icon || 'fa-solid fa-table';
    }

    /** @deprecated Use {@link EntityIcon}. */
    public get entityIcon(): string {
      return this.EntityIcon;
    }

    public get CategoryName(): string {
        if (!this.record?.CategoryID) return 'Uncategorized';
        const category = this.Categories.find(c => UUIDsEqual(c.ID, this.record.CategoryID));
        return category?.Name || 'Unknown';
    }

    /** @deprecated Use {@link CategoryName}. */
    public get categoryName(): string {
      return this.CategoryName;
    }

    public get FormattedItemCount(): string {
        return this.Stats.itemCount.toLocaleString();
    }

    /** @deprecated Use {@link FormattedItemCount}. */
    public get formattedItemCount(): string {
      return this.FormattedItemCount;
    }

    public get FormattedLastUpdated(): string {
        if (!this.Stats.lastUpdated) return 'Never';
        const date = new Date(this.Stats.lastUpdated);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    /** @deprecated Use {@link FormattedLastUpdated}. */
    public get formattedLastUpdated(): string {
      return this.FormattedLastUpdated;
    }

    public GetOwnerName(): string {
        return this.record?.User || 'Unknown';
    }

    /** @deprecated Use {@link GetOwnerName}. */
    public getOwnerName(): string {
      return this.GetOwnerName();
    }

    public IsCurrentUserOwner(): boolean {
        return UUIDsEqual(this.record?.UserID, this.metadata.CurrentUser?.ID);
    }

    /** @deprecated Use {@link IsCurrentUserOwner}. */
    public isCurrentUserOwner(): boolean {
      return this.IsCurrentUserOwner();
    }

    public async OnCategoryChange(categoryId: string | null): Promise<void> {
        this.record.CategoryID = categoryId;
        const saved = await this.record.Save();

        if (saved) {
            this.showNotification('Category updated', 'success', 2000);
        } else {
            this.showNotification('Failed to update category', 'error', 3000);
        }

        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnCategoryChange}. */
    public async onCategoryChange(categoryId: string | null): Promise<void> {
      return this.OnCategoryChange(categoryId);
    }

    public async RefreshItems(): Promise<void> {
        await this.loadStats();
        await this.loadItems(Math.min(this.ItemsPage, this.TotalPages - 1));
        this.updateNavBadges();
    }

    /** @deprecated Use {@link RefreshItems}. */
    public async refreshItems(): Promise<void> {
      return this.RefreshItems();
    }

    // ==========================================
    // Add Records Dialog
    // ==========================================

    public async OpenAddRecordsDialog(): Promise<void> {
        this.ShowAddRecordsDialog = true;
        this.AddableRecords = [];
        this.AddRecordsSearchFilter = '';
        this.AddDialogLoading = true;
        this.AddDialogSaving = false;

        // Load existing list detail IDs to mark which records are already in the list
        await this.loadExistingListDetailIds();
        this.AddDialogLoading = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenAddRecordsDialog}. */
    public async openAddRecordsDialog(): Promise<void> {
      return this.OpenAddRecordsDialog();
    }

    public CloseAddRecordsDialog(): void {
        this.ShowAddRecordsDialog = false;
        this.AddableRecords = [];
        this.AddRecordsSearchFilter = '';
        this.ExistingListDetailIds.clear();
        this.AddDialogSaving = false;
        this.AddProgress = 0;
        this.AddTotal = 0;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseAddRecordsDialog}. */
    public closeAddRecordsDialog(): void {
      return this.CloseAddRecordsDialog();
    }

    private async loadExistingListDetailIds(): Promise<void> {
        if (!this.record) return;

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ RecordID: string }>({
            EntityName: 'MJ: List Details',
            ExtraFilter: `ListID = '${this.record.ID}'`,
            Fields: ['RecordID'],
            ResultType: 'simple'
        }, this.metadata.CurrentUser);

        if (result.Success) {
            this.ExistingListDetailIds = new Set(result.Results.map(r => NormalizeUUID(r.RecordID)));
        }
    }

    public OnAddRecordsSearchChange(value: string): void {
        this.AddRecordsSearchFilter = value;
        this.searchSubject.next(value);
    }

    /** @deprecated Use {@link OnAddRecordsSearchChange}. */
    public onAddRecordsSearchChange(value: string): void {
      return this.OnAddRecordsSearchChange(value);
    }

    private async searchRecords(searchText: string): Promise<void> {
        if (!this.record || !searchText || searchText.length < 2) {
            this.AddableRecords = [];
            this.cdr.detectChanges();
            return;
        }

        this.AddDialogLoading = true;
        this.cdr.detectChanges();

        const sourceEntityInfo = this.metadata.EntityByID(this.record.EntityID);
        if (!sourceEntityInfo) {
            this.AddDialogLoading = false;
            this.cdr.detectChanges();
            return;
        }

        // NameField when present; otherwise the fallback display field
        // (first non-PK/non-FK/non-system field). Text-typed fields also
        // drive the LIKE search so name-less entities remain searchable.
        const displayField = GetRecordDisplayField(sourceEntityInfo);

        let filter: string | undefined;
        if (displayField.Field && IsTextSearchableField(displayField.Field)) {
            filter = `${displayField.Field.Name} LIKE '%${searchText.replace(/'/g, "''")}%'`;
        }

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result: RunViewResult = await rv.RunView({
            EntityName: this.record.Entity,
            ExtraFilter: filter,
            MaxRows: 100,
            ResultType: 'simple'
        });

        if (result.Success) {
            this.AddableRecords = result.Results.map((record: Record<string, unknown>) => {
                // Compact key segment (raw value, or "F1|v1||F2|v2" for a composite key) — the form ListDetail.RecordID stores
                const recordId = CompositeKey.FromEntityRecord(sourceEntityInfo, record).ToCompactURLSegment();
                return {
                    ID: recordId,
                    Name: displayField.Field
                        ? FormatRecordDisplayValue(recordId, record[displayField.Field.Name], displayField)
                        : recordId,
                    isInList: this.ExistingListDetailIds.has(NormalizeUUID(recordId)),
                    isSelected: false
                };
            });
        }

        this.AddDialogLoading = false;
        this.cdr.detectChanges();
    }

    public ToggleRecordSelection(record: AddableRecord): void {
        if (record.isInList) return; // Can't select records already in list
        record.isSelected = !record.isSelected;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleRecordSelection}. */
    public toggleRecordSelection(record: AddableRecord): void {
      return this.ToggleRecordSelection(record);
    }

    public get SelectedAddableRecords(): AddableRecord[] {
        return this.AddableRecords.filter(r => r.isSelected);
    }

    /** @deprecated Use {@link SelectedAddableRecords}. */
    public get selectedAddableRecords(): AddableRecord[] {
      return this.SelectedAddableRecords;
    }

    public SelectAllAddable(): void {
        this.AddableRecords.forEach(r => {
            if (!r.isInList) r.isSelected = true;
        });
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link SelectAllAddable}. */
    public selectAllAddable(): void {
      return this.SelectAllAddable();
    }

    public DeselectAllAddable(): void {
        this.AddableRecords.forEach(r => r.isSelected = false);
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link DeselectAllAddable}. */
    public deselectAllAddable(): void {
      return this.DeselectAllAddable();
    }

    public async ConfirmAddRecords(): Promise<void> {
        const recordsToAdd = this.SelectedAddableRecords;
        if (recordsToAdd.length === 0 || !this.record) return;

        this.AddDialogSaving = true;
        this.AddTotal = recordsToAdd.length;
        this.AddProgress = 0;
        this.cdr.detectChanges();

        // Use transaction group for bulk insert
        const tg = await this.metadata.CreateTransactionGroup();

        for (const record of recordsToAdd) {
            const listDetail = await this.metadata.GetEntityObject<MJListDetailEntityExtended>('MJ: List Details');
            listDetail.ListID = this.record.ID;
            listDetail.RecordID = record.ID;
            listDetail.TransactionGroup = tg;
            await listDetail.Save();
        }

        const success = await tg.Submit();

        if (success) {
            this.AddProgress = this.AddTotal;
            this.showNotification(
                `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
                'success',
                2500
            );
            this.CloseAddRecordsDialog();
            await this.RefreshItems();
        } else {
            LogError('Error adding records to list');
            this.showNotification('Failed to add some records', 'error', 2500);
            this.AddDialogSaving = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link ConfirmAddRecords}. */
    public async confirmAddRecords(): Promise<void> {
      return this.ConfirmAddRecords();
    }

    // ==========================================
    // Add From View Dialog
    // ==========================================

    public async OpenAddFromViewDialog(): Promise<void> {
        this.ShowAddFromViewDialog = true;
        this.UserViewsToAdd = [];
        this.userViewsToAddIds.clear();
        this.cdr.detectChanges();

        if (!this.UserViews) {
            await this.loadEntityViews();
        }
    }

    /** @deprecated Use {@link OpenAddFromViewDialog}. */
    public async openAddFromViewDialog(): Promise<void> {
      return this.OpenAddFromViewDialog();
    }

    public CloseAddFromViewDialog(): void {
        this.ShowAddFromViewDialog = false;
        this.UserViewsToAdd = [];
        this.userViewsToAddIds.clear();
        this.ShowAddFromViewLoader = false;
        this.AddFromViewProgress = 0;
        this.AddFromViewTotal = 0;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseAddFromViewDialog}. */
    public closeAddFromViewDialog(): void {
      return this.CloseAddFromViewDialog();
    }

    private async loadEntityViews(): Promise<void> {
        if (!this.record || !this.record.Entity) return;

        this.ShowAddFromViewLoader = true;
        this.cdr.detectChanges();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const runViewResult = await rv.RunView<MJUserViewEntityExtended>({
            EntityName: 'MJ: User Views',
            ExtraFilter: `UserID = '${this.metadata.CurrentUser.ID}' AND EntityID = '${this.record.EntityID}'`,
            ResultType: 'entity_object'
        }, this.metadata.CurrentUser);

        if (!runViewResult.Success) {
            LogError(`Error loading User Views for entity ${this.record.Entity}`);
        } else {
            this.UserViews = runViewResult.Results;
        }

        this.ShowAddFromViewLoader = false;
        this.cdr.detectChanges();
    }

    public ToggleViewSelection(view: MJUserViewEntityExtended): void {
        const index = this.UserViewsToAdd.findIndex(v => UUIDsEqual(v.ID, view.ID));
        if (index >= 0) {
            this.UserViewsToAdd.splice(index, 1);
            this.userViewsToAddIds.delete(NormalizeUUID(view.ID));
        } else {
            this.UserViewsToAdd.push(view);
            this.userViewsToAddIds.add(NormalizeUUID(view.ID));
        }
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleViewSelection}. */
    public toggleViewSelection(view: MJUserViewEntityExtended): void {
      return this.ToggleViewSelection(view);
    }

    public IsViewSelected(view: MJUserViewEntityExtended): boolean {
        return this.userViewsToAddIds.has(NormalizeUUID(view.ID));
    }

    /** @deprecated Use {@link IsViewSelected}. */
    public isViewSelected(view: MJUserViewEntityExtended): boolean {
      return this.IsViewSelected(view);
    }

    public async ConfirmAddFromView(): Promise<void> {
        if (!this.record || this.UserViewsToAdd.length === 0) return;

        this.ShowAddFromViewLoader = true;
        this.FetchingRecordsToSave = true;
        this.cdr.detectChanges();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);

        // Collect all unique record IDs from selected views
        const recordIdSet = new Set<string>();

        for (const userView of this.UserViewsToAdd) {
            const runViewResult = await rv.RunView({
                ViewID: userView.ID,
                ViewEntity: userView,
                Fields: ['ID']
            }, this.metadata.CurrentUser);

            if (runViewResult.Success) {
                const records = runViewResult.Results as Array<Record<string, string>>;
                records.forEach(r => recordIdSet.add(NormalizeUUID(r.ID)));
            }
        }

        // Filter out records already in the list
        await this.loadExistingListDetailIds();
        const recordsToAdd = [...recordIdSet].filter(id => !this.ExistingListDetailIds.has(id));

        this.AddFromViewTotal = recordsToAdd.length;
        this.AddFromViewProgress = 0;
        this.FetchingRecordsToSave = false;
        this.cdr.detectChanges();

        if (recordsToAdd.length === 0) {
            this.showNotification('All records already in list', 'info', 2500);
            this.ShowAddFromViewLoader = false;
            this.cdr.detectChanges();
            return;
        }

        LogStatus(`Adding ${recordsToAdd.length} records to list`);

        // Use transaction group for bulk insert
        const tg = await this.metadata.CreateTransactionGroup();

        for (const recordID of recordsToAdd) {
            const listDetail = await this.metadata.GetEntityObject<MJListDetailEntityExtended>('MJ: List Details');
            listDetail.ListID = this.record.ID;
            listDetail.RecordID = recordID;
            listDetail.TransactionGroup = tg;
            await listDetail.Save();
        }

        const success = await tg.Submit();

        if (success) {
            this.AddFromViewProgress = this.AddFromViewTotal;
            this.showNotification(
                `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
                'success',
                2500
            );
            this.CloseAddFromViewDialog();
            await this.RefreshItems();
        } else {
            LogError('Error adding records from view to list');
            this.showNotification('Failed to add some records', 'error', 2500);
            this.ShowAddFromViewLoader = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link ConfirmAddFromView}. */
    public async confirmAddFromView(): Promise<void> {
      return this.ConfirmAddFromView();
    }

    // ==========================================
    // Share Dialog
    // ==========================================

    public OpenShareDialog(): void {
        if (!this.record?.IsSaved) return;

        this.ShareDialogConfig = {
            listId: this.record.ID,
            listName: this.record.Name,
            currentUserId: this.metadata.CurrentUser.ID,
            isOwner: this.IsCurrentUserOwner()
        };
        this.ShowShareDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenShareDialog}. */
    public openShareDialog(): void {
      return this.OpenShareDialog();
    }

    public OnShareDialogComplete(result: ListShareDialogResult): void {
        this.ShowShareDialog = false;
        this.ShareDialogConfig = null;

        if (result.action === 'apply') {
            // Refresh stats to update share counts
            this.loadStats().then(() => {
                this.updateNavBadges();
                this.cdr.detectChanges();
            });
        }
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnShareDialogComplete}. */
    public onShareDialogComplete(result: ListShareDialogResult): void {
      return this.OnShareDialogComplete(result);
    }

    public OnShareDialogCancel(): void {
        this.ShowShareDialog = false;
        this.ShareDialogConfig = null;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnShareDialogCancel}. */
    public onShareDialogCancel(): void {
      return this.OnShareDialogCancel();
    }

    // ==========================================
    // Invitations / Audit Log dialogs (mockups 16, 18)
    // ==========================================

    public OpenInvitationsDialog(): void {
        // Closing share dialog so it doesn't stack visually. User can
        // reopen via toolbar; the share dialog isn't stateful enough to
        // need preservation across this transition.
        this.ShowShareDialog = false;
        this.ShowInvitationsDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenInvitationsDialog}. */
    public openInvitationsDialog(): void {
      return this.OpenInvitationsDialog();
    }

    public CloseInvitationsDialog(): void {
        this.ShowInvitationsDialog = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseInvitationsDialog}. */
    public closeInvitationsDialog(): void {
      return this.CloseInvitationsDialog();
    }

    public OpenAuditLogDialog(): void {
        this.ShowShareDialog = false;
        this.ShowAuditLogDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenAuditLogDialog}. */
    public openAuditLogDialog(): void {
      return this.OpenAuditLogDialog();
    }

    public CloseAuditLogDialog(): void {
        this.ShowAuditLogDialog = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseAuditLogDialog}. */
    public closeAuditLogDialog(): void {
      return this.CloseAuditLogDialog();
    }
}
