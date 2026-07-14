import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { RegisterClass, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { MJListFormComponent } from '../../generated/Entities/MJList/mjlist.form.component';
import { MJListEntity, MJListDetailEntity, MJListDetailEntityExtended, MJListCategoryEntity, MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { CompositeKey, Metadata, RunView, RunViewResult, EntityInfo, LogError, LogStatus } from '@memberjunction/core';
import { ListShareDialogConfig, ListShareDialogResult } from '@memberjunction/ng-list-management';
import { MJConfirmService } from '@memberjunction/ng-ui-components';

export type ListSection = 'overview' | 'items' | 'sharing' | 'activity' | 'settings';

export interface ListItemViewModel {
    detail: MJListDetailEntity;
    recordName: string;
    isLoading: boolean;
}

export interface ListStats {
    itemCount: number;
    shareCount: number;
    invitationCount: number;
    lastUpdated: Date | null;
}

/**
 * Represents a record that can be added to a list
 */
export interface AddableRecord {
    ID: string;
    Name: string;
    isInList: boolean;
    isSelected: boolean;
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
    public activeSection: ListSection = 'overview';
    public navItems = [
        { id: 'overview' as ListSection, icon: 'fa-solid fa-house', label: 'Overview' },
        { id: 'items' as ListSection, icon: 'fa-solid fa-list', label: 'Items', badge: 0 },
        { id: 'sharing' as ListSection, icon: 'fa-solid fa-share-nodes', label: 'Sharing', badge: 0, disabled: false },
        { id: 'activity' as ListSection, icon: 'fa-solid fa-clock-rotate-left', label: 'Activity' },
        { id: 'settings' as ListSection, icon: 'fa-solid fa-gear', label: 'Settings' }
    ];

    // Data
    public listItems: ListItemViewModel[] = [];
    public categories: MJListCategoryEntity[] = [];
    public entityInfo: EntityInfo | null = null;
    public stats: ListStats = {
        itemCount: 0,
        shareCount: 0,
        invitationCount: 0,
        lastUpdated: null
    };

    // Loading states
    public isLoadingItems = false;
    public isLoadingStats = false;
    public explorerError: string | null = null;

    // Items section
    public itemSearchTerm = '';
    public selectedItems = new Set<string>();
    public isSelectAllChecked = false;

    // Items pagination — the Items grid loads one page at a time so large
    // lists (thousands of members) don't pull the entire membership into the
    // browser. Display-name resolution is likewise batched per page.
    public itemsPage = 0;
    public readonly itemsPageSize = 100;

    // Edit state
    public isEditingName = false;
    public isEditingDescription = false;
    public editingName = '';
    public editingDescription = '';

    // Add Records dialog
    public showAddRecordsDialog = false;
    public addDialogLoading = false;
    public addDialogSaving = false;
    public addableRecords: AddableRecord[] = [];
    public addRecordsSearchFilter = '';
    public existingListDetailIds = new Set<string>();
    public addProgress = 0;
    public addTotal = 0;
    private searchSubject = new Subject<string>();

    // Add From View dialog
    public showAddFromViewDialog = false;
    public showAddFromViewLoader = false;
    public userViews: MJUserViewEntityExtended[] | null = null;
    public userViewsToAdd: MJUserViewEntityExtended[] = [];
    /**
     * Normalized-UUID set of the IDs in {@link userViewsToAdd}, kept in sync with that
     * array. Lets {@link isViewSelected} (bound per-row in the dialog's @for, ~2x/row)
     * do an O(1) lookup instead of scanning the array with UUIDsEqual on every check.
     */
    private userViewsToAddIds: Set<string> = new Set<string>();
    public addFromViewProgress = 0;
    public addFromViewTotal = 0;
    public fetchingRecordsToSave = false;

    // Share dialog
    public showShareDialog = false;
    public shareDialogConfig: ListShareDialogConfig | null = null;

    // Invitations / audit log dialogs — opened from the share dialog.
    public showInvitationsDialog = false;
    public showAuditLogDialog = false;

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
            this.explorerError = 'Failed to load list data';
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
            this.categories = result.Results;
        }
    }

    private async loadItems(page: number = 0): Promise<void> {
        if (!this.record?.IsSaved) return;

        this.isLoadingItems = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJListDetailEntity>({
                EntityName: 'MJ: List Details',
                ExtraFilter: `ListID = '${this.record.ID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                StartRow: page * this.itemsPageSize,
                MaxRows: this.itemsPageSize,
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.itemsPage = page;
                this.listItems = result.Results.map(detail => ({
                    detail,
                    recordName: detail.RecordID || 'Loading...',
                    isLoading: true
                }));
                this.selectedItems.clear();
                this.isSelectAllChecked = false;

                // Resolve display names for this page in one batched query
                await this.loadRecordNames();
            }
        } catch (error) {
            console.error('Error loading list items:', error);
        } finally {
            this.isLoadingItems = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Resolves display names for the current page of items with a single
     * batched `PK IN (...)` query per 250 items — never one query per item.
     */
    private async loadRecordNames(): Promise<void> {
        const finish = () => {
            for (const item of this.listItems) item.isLoading = false;
            this.cdr.detectChanges();
        };

        if (!this.entityInfo || this.listItems.length === 0) {
            finish();
            return;
        }

        const nameFieldInfo = this.entityInfo.NameField;
        const pkName = this.entityInfo.FirstPrimaryKey?.Name || 'ID';
        if (!nameFieldInfo) {
            // Entity has no name field — the record ID is the best label available
            for (const item of this.listItems) {
                item.recordName = item.detail.RecordID || 'Unknown';
            }
            finish();
            return;
        }

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const nameMap = new Map<string, string>();
        const ids = this.listItems
            .map(i => i.detail.RecordID)
            .filter((id): id is string => !!id);

        const CHUNK_SIZE = 250;
        for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
            const chunk = ids.slice(start, start + CHUNK_SIZE);
            const inList = chunk.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
            try {
                const result = await rv.RunView({
                    EntityName: this.entityInfo.Name,
                    ExtraFilter: `${pkName} IN (${inList})`,
                    Fields: [pkName, nameFieldInfo.Name],
                    ResultType: 'simple'
                });
                if (result.Success) {
                    for (const row of result.Results as Array<Record<string, string>>) {
                        nameMap.set(NormalizeUUID(String(row[pkName])), row[nameFieldInfo.Name]);
                    }
                }
            } catch (error) {
                // Fall through — unresolved items display their RecordID
            }
        }

        for (const item of this.listItems) {
            const name = item.detail.RecordID ? nameMap.get(NormalizeUUID(item.detail.RecordID)) : undefined;
            item.recordName = name || item.detail.RecordID || 'Unknown';
        }
        finish();
    }

    // === Items pagination ===

    public get totalPages(): number {
        return Math.max(1, Math.ceil(this.stats.itemCount / this.itemsPageSize));
    }

    public async goToPage(page: number): Promise<void> {
        if (page < 0 || page >= this.totalPages || page === this.itemsPage) return;
        await this.loadItems(page);
    }

    private async loadStats(): Promise<void> {
        if (!this.record?.IsSaved) return;

        this.isLoadingStats = true;

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

            this.stats = {
                itemCount: itemsResult.Success ? itemsResult.TotalRowCount : 0,
                shareCount: sharesResult.Success ? sharesResult.TotalRowCount : 0,
                invitationCount: invitationsResult.Success ? invitationsResult.TotalRowCount : 0,
                lastUpdated: this.record.__mj_UpdatedAt
            };
        } catch (error) {
            console.error('Error loading stats:', error);
        } finally {
            this.isLoadingStats = false;
            this.cdr.detectChanges();
        }
    }

    private updateNavBadges(): void {
        this.navItems = this.navItems.map(item => {
            switch (item.id) {
                case 'items':
                    return { ...item, badge: this.stats.itemCount };
                case 'sharing':
                    return { ...item, badge: this.stats.shareCount + this.stats.invitationCount };
                default:
                    return item;
            }
        });
    }

    // === Navigation ===

    public setActiveSection(section: ListSection): void {
        const navItem = this.navItems.find(n => n.id === section);
        if (navItem?.disabled) return;

        this.activeSection = section;
        this.cdr.detectChanges();
    }

    // === Items Management ===

    public get filteredItems(): ListItemViewModel[] {
        if (!this.itemSearchTerm) return this.listItems;

        const term = this.itemSearchTerm.toLowerCase();
        return this.listItems.filter(item =>
            item.recordName.toLowerCase().includes(term) ||
            item.detail.RecordID?.toLowerCase().includes(term)
        );
    }

    public toggleItemSelection(item: ListItemViewModel): void {
        const id = item.detail.ID;
        if (this.selectedItems.has(id)) {
            this.selectedItems.delete(id);
        } else {
            this.selectedItems.add(id);
        }
        this.updateSelectAllState();
        this.cdr.detectChanges();
    }

    public toggleSelectAll(): void {
        if (this.isSelectAllChecked) {
            this.selectedItems.clear();
        } else {
            for (const item of this.filteredItems) {
                this.selectedItems.add(item.detail.ID);
            }
        }
        this.isSelectAllChecked = !this.isSelectAllChecked;
        this.cdr.detectChanges();
    }

    private updateSelectAllState(): void {
        this.isSelectAllChecked = this.filteredItems.length > 0 &&
            this.filteredItems.every(item => this.selectedItems.has(item.detail.ID));
    }

    public async removeSelectedItems(): Promise<void> {
        if (this.selectedItems.size === 0) return;

        const count = this.selectedItems.size;
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
            for (const id of this.selectedItems) {
                const item = this.listItems.find(i => UUIDsEqual(i.detail.ID, id));
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

            this.selectedItems.clear();
            await this.loadStats();
            await this.loadItems(Math.min(this.itemsPage, this.totalPages - 1));
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

    public openRecord(item: ListItemViewModel): void {
        if (!this.entityInfo || !item.detail.RecordID) return;

        if (this.entityInfo.PrimaryKeys.length > 1) {
            // ListDetail.RecordID stores a single-PK value; composite-PK
            // entities aren't representable here
            this.showNotification('Cannot open records for entities with composite primary keys', 'info', 3000);
            return;
        }
        SharedService.Instance.OpenEntityRecord(this.entityInfo.Name, CompositeKey.FromID(item.detail.RecordID));
    }

    // === Inline Editing ===

    public startEditingName(): void {
        this.editingName = this.record.Name;
        this.isEditingName = true;
        this.cdr.detectChanges();
    }

    public async saveNameEdit(): Promise<void> {
        if (!this.editingName.trim()) {
            this.cancelNameEdit();
            return;
        }

        this.record.Name = this.editingName.trim();
        const saved = await this.record.Save();

        if (saved) {
            this.showNotification('Name updated', 'success', 2000);
        } else {
            this.showNotification('Failed to update name', 'error', 3000);
        }

        this.isEditingName = false;
        this.cdr.detectChanges();
    }

    public cancelNameEdit(): void {
        this.isEditingName = false;
        this.cdr.detectChanges();
    }

    public startEditingDescription(): void {
        this.editingDescription = this.record.Description || '';
        this.isEditingDescription = true;
        this.cdr.detectChanges();
    }

    public async saveDescriptionEdit(): Promise<void> {
        this.record.Description = this.editingDescription.trim() || null;
        const saved = await this.record.Save();

        if (saved) {
            this.showNotification('Description updated', 'success', 2000);
        } else {
            this.showNotification('Failed to update description', 'error', 3000);
        }

        this.isEditingDescription = false;
        this.cdr.detectChanges();
    }

    public cancelDescriptionEdit(): void {
        this.isEditingDescription = false;
        this.cdr.detectChanges();
    }

    // === Helpers ===

    public get entityDisplayName(): string {
        return this.entityInfo?.DisplayName || this.entityInfo?.Name || this.record?.Entity || 'Unknown';
    }

    public get entityIcon(): string {
        return this.entityInfo?.Icon || 'fa-solid fa-table';
    }

    public get categoryName(): string {
        if (!this.record?.CategoryID) return 'Uncategorized';
        const category = this.categories.find(c => UUIDsEqual(c.ID, this.record.CategoryID));
        return category?.Name || 'Unknown';
    }

    public get formattedItemCount(): string {
        return this.stats.itemCount.toLocaleString();
    }

    public get formattedLastUpdated(): string {
        if (!this.stats.lastUpdated) return 'Never';
        const date = new Date(this.stats.lastUpdated);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    public getOwnerName(): string {
        return this.record?.User || 'Unknown';
    }

    public isCurrentUserOwner(): boolean {
        return UUIDsEqual(this.record?.UserID, this.metadata.CurrentUser?.ID);
    }

    public async onCategoryChange(categoryId: string | null): Promise<void> {
        this.record.CategoryID = categoryId;
        const saved = await this.record.Save();

        if (saved) {
            this.showNotification('Category updated', 'success', 2000);
        } else {
            this.showNotification('Failed to update category', 'error', 3000);
        }

        this.cdr.detectChanges();
    }

    public async refreshItems(): Promise<void> {
        await this.loadStats();
        await this.loadItems(Math.min(this.itemsPage, this.totalPages - 1));
        this.updateNavBadges();
    }

    // ==========================================
    // Add Records Dialog
    // ==========================================

    public async openAddRecordsDialog(): Promise<void> {
        this.showAddRecordsDialog = true;
        this.addableRecords = [];
        this.addRecordsSearchFilter = '';
        this.addDialogLoading = true;
        this.addDialogSaving = false;

        // Load existing list detail IDs to mark which records are already in the list
        await this.loadExistingListDetailIds();
        this.addDialogLoading = false;
        this.cdr.detectChanges();
    }

    public closeAddRecordsDialog(): void {
        this.showAddRecordsDialog = false;
        this.addableRecords = [];
        this.addRecordsSearchFilter = '';
        this.existingListDetailIds.clear();
        this.addDialogSaving = false;
        this.addProgress = 0;
        this.addTotal = 0;
        this.cdr.detectChanges();
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
            this.existingListDetailIds = new Set(result.Results.map(r => NormalizeUUID(r.RecordID)));
        }
    }

    public onAddRecordsSearchChange(value: string): void {
        this.addRecordsSearchFilter = value;
        this.searchSubject.next(value);
    }

    private async searchRecords(searchText: string): Promise<void> {
        if (!this.record || !searchText || searchText.length < 2) {
            this.addableRecords = [];
            this.cdr.detectChanges();
            return;
        }

        this.addDialogLoading = true;
        this.cdr.detectChanges();

        const sourceEntityInfo = this.metadata.EntityByID(this.record.EntityID);
        if (!sourceEntityInfo) {
            this.addDialogLoading = false;
            this.cdr.detectChanges();
            return;
        }

        const nameField = sourceEntityInfo.Fields.find(field => field.IsNameField);
        const pkField = sourceEntityInfo.FirstPrimaryKey?.Name || 'ID';

        let filter: string | undefined;
        if (nameField) {
            filter = `${nameField.Name} LIKE '%${searchText}%'`;
        }

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result: RunViewResult = await rv.RunView({
            EntityName: this.record.Entity,
            ExtraFilter: filter,
            MaxRows: 100,
            ResultType: 'simple'
        });

        if (result.Success) {
            this.addableRecords = result.Results.map((record: Record<string, unknown>) => {
                const recordId = String(record[pkField]);
                return {
                    ID: recordId,
                    Name: nameField ? String(record[nameField.Name]) : recordId,
                    isInList: this.existingListDetailIds.has(NormalizeUUID(recordId)),
                    isSelected: false
                };
            });
        }

        this.addDialogLoading = false;
        this.cdr.detectChanges();
    }

    public toggleRecordSelection(record: AddableRecord): void {
        if (record.isInList) return; // Can't select records already in list
        record.isSelected = !record.isSelected;
        this.cdr.detectChanges();
    }

    public get selectedAddableRecords(): AddableRecord[] {
        return this.addableRecords.filter(r => r.isSelected);
    }

    public selectAllAddable(): void {
        this.addableRecords.forEach(r => {
            if (!r.isInList) r.isSelected = true;
        });
        this.cdr.detectChanges();
    }

    public deselectAllAddable(): void {
        this.addableRecords.forEach(r => r.isSelected = false);
        this.cdr.detectChanges();
    }

    public async confirmAddRecords(): Promise<void> {
        const recordsToAdd = this.selectedAddableRecords;
        if (recordsToAdd.length === 0 || !this.record) return;

        this.addDialogSaving = true;
        this.addTotal = recordsToAdd.length;
        this.addProgress = 0;
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
            this.addProgress = this.addTotal;
            this.showNotification(
                `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
                'success',
                2500
            );
            this.closeAddRecordsDialog();
            await this.refreshItems();
        } else {
            LogError('Error adding records to list');
            this.showNotification('Failed to add some records', 'error', 2500);
            this.addDialogSaving = false;
            this.cdr.detectChanges();
        }
    }

    // ==========================================
    // Add From View Dialog
    // ==========================================

    public async openAddFromViewDialog(): Promise<void> {
        this.showAddFromViewDialog = true;
        this.userViewsToAdd = [];
        this.userViewsToAddIds.clear();
        this.cdr.detectChanges();

        if (!this.userViews) {
            await this.loadEntityViews();
        }
    }

    public closeAddFromViewDialog(): void {
        this.showAddFromViewDialog = false;
        this.userViewsToAdd = [];
        this.userViewsToAddIds.clear();
        this.showAddFromViewLoader = false;
        this.addFromViewProgress = 0;
        this.addFromViewTotal = 0;
        this.cdr.detectChanges();
    }

    private async loadEntityViews(): Promise<void> {
        if (!this.record || !this.record.Entity) return;

        this.showAddFromViewLoader = true;
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
            this.userViews = runViewResult.Results;
        }

        this.showAddFromViewLoader = false;
        this.cdr.detectChanges();
    }

    public toggleViewSelection(view: MJUserViewEntityExtended): void {
        const index = this.userViewsToAdd.findIndex(v => UUIDsEqual(v.ID, view.ID));
        if (index >= 0) {
            this.userViewsToAdd.splice(index, 1);
            this.userViewsToAddIds.delete(NormalizeUUID(view.ID));
        } else {
            this.userViewsToAdd.push(view);
            this.userViewsToAddIds.add(NormalizeUUID(view.ID));
        }
        this.cdr.detectChanges();
    }

    public isViewSelected(view: MJUserViewEntityExtended): boolean {
        return this.userViewsToAddIds.has(NormalizeUUID(view.ID));
    }

    public async confirmAddFromView(): Promise<void> {
        if (!this.record || this.userViewsToAdd.length === 0) return;

        this.showAddFromViewLoader = true;
        this.fetchingRecordsToSave = true;
        this.cdr.detectChanges();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);

        // Collect all unique record IDs from selected views
        const recordIdSet = new Set<string>();

        for (const userView of this.userViewsToAdd) {
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
        const recordsToAdd = [...recordIdSet].filter(id => !this.existingListDetailIds.has(id));

        this.addFromViewTotal = recordsToAdd.length;
        this.addFromViewProgress = 0;
        this.fetchingRecordsToSave = false;
        this.cdr.detectChanges();

        if (recordsToAdd.length === 0) {
            this.showNotification('All records already in list', 'info', 2500);
            this.showAddFromViewLoader = false;
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
            this.addFromViewProgress = this.addFromViewTotal;
            this.showNotification(
                `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
                'success',
                2500
            );
            this.closeAddFromViewDialog();
            await this.refreshItems();
        } else {
            LogError('Error adding records from view to list');
            this.showNotification('Failed to add some records', 'error', 2500);
            this.showAddFromViewLoader = false;
            this.cdr.detectChanges();
        }
    }

    // ==========================================
    // Share Dialog
    // ==========================================

    public openShareDialog(): void {
        if (!this.record?.IsSaved) return;

        this.shareDialogConfig = {
            listId: this.record.ID,
            listName: this.record.Name,
            currentUserId: this.metadata.CurrentUser.ID,
            isOwner: this.isCurrentUserOwner()
        };
        this.showShareDialog = true;
        this.cdr.detectChanges();
    }

    public onShareDialogComplete(result: ListShareDialogResult): void {
        this.showShareDialog = false;
        this.shareDialogConfig = null;

        if (result.action === 'apply') {
            // Refresh stats to update share counts
            this.loadStats().then(() => {
                this.updateNavBadges();
                this.cdr.detectChanges();
            });
        }
        this.cdr.detectChanges();
    }

    public onShareDialogCancel(): void {
        this.showShareDialog = false;
        this.shareDialogConfig = null;
        this.cdr.detectChanges();
    }

    // ==========================================
    // Invitations / Audit Log dialogs (mockups 16, 18)
    // ==========================================

    public openInvitationsDialog(): void {
        // Closing share dialog so it doesn't stack visually. User can
        // reopen via toolbar; the share dialog isn't stateful enough to
        // need preservation across this transition.
        this.showShareDialog = false;
        this.showInvitationsDialog = true;
        this.cdr.detectChanges();
    }

    public closeInvitationsDialog(): void {
        this.showInvitationsDialog = false;
        this.cdr.detectChanges();
    }

    public openAuditLogDialog(): void {
        this.showShareDialog = false;
        this.showAuditLogDialog = true;
        this.cdr.detectChanges();
    }

    public closeAuditLogDialog(): void {
        this.showAuditLogDialog = false;
        this.cdr.detectChanges();
    }
}
