import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Subject, debounceTime } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { ListFormComponent } from '../../generated/Entities/List/list.form.component';
import { ListEntity, ListDetailEntity, ListDetailEntityExtended, ListCategoryEntity, UserViewEntityExtended } from '@memberjunction/core-entities';
import { Metadata, RunView, RunViewResult, EntityInfo, LogError, LogStatus } from '@memberjunction/core';
import { ListShareDialogConfig, ListShareDialogResult } from '@memberjunction/ng-list-management';

export type ListSection = 'overview' | 'items' | 'sharing' | 'activity' | 'settings';

export interface ListItemViewModel {
    detail: ListDetailEntity;
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
@RegisterClass(BaseFormComponent, 'Lists')
@Component({
  standalone: false,
    selector: 'mj-list-form-extended',
    templateUrl: './list-form.component.html',
    styleUrls: ['./list-form.component.css', '../../../shared/form-styles.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListFormComponentExtended extends ListFormComponent implements OnInit, OnDestroy {
    public override record!: ListEntity;

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
    public categories: ListCategoryEntity[] = [];
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
    public userViews: UserViewEntityExtended[] | null = null;
    public userViewsToAdd: UserViewEntityExtended[] = [];
    public addFromViewProgress = 0;
    public addFromViewTotal = 0;
    public fetchingRecordsToSave = false;

    // Share dialog
    public showShareDialog = false;
    public shareDialogConfig: ListShareDialogConfig | null = null;

    private destroy$ = new Subject<void>();
    private metadata = new Metadata();

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        // Set up search debounce
        this.searchSubject
            .pipe(debounceTime(300))
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
                this.entityInfo = this.metadata.Entities.find(e => e.ID === this.record.EntityID) || null;
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
            this.cdr.markForCheck();
        }
    }

    private async loadCategories(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<ListCategoryEntity>({
            EntityName: 'List Categories',
            OrderBy: 'Name',
            ResultType: 'entity_object'
        });
        if (result.Success) {
            this.categories = result.Results;
        }
    }

    private async loadItems(): Promise<void> {
        if (!this.record?.IsSaved) return;

        this.isLoadingItems = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const result = await rv.RunView<ListDetailEntity>({
                EntityName: 'List Details',
                ExtraFilter: `ListID = '${this.record.ID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.listItems = result.Results.map(detail => ({
                    detail,
                    recordName: detail.RecordID || 'Loading...',
                    isLoading: true
                }));

                // Load record names asynchronously
                this.loadRecordNames();
            }
        } catch (error) {
            console.error('Error loading list items:', error);
        } finally {
            this.isLoadingItems = false;
            this.cdr.markForCheck();
        }
    }

    private async loadRecordNames(): Promise<void> {
        if (!this.entityInfo) return;

        const rv = new RunView();
        // Get the name field - NameField is EntityFieldInfo or undefined
        const nameFieldInfo = this.entityInfo.NameField;
        const nameFieldName = nameFieldInfo ? nameFieldInfo.Name : 'ID';

        for (const item of this.listItems) {
            try {
                const result = await rv.RunView({
                    EntityName: this.entityInfo.Name,
                    ExtraFilter: `ID = '${item.detail.RecordID}'`,
                    Fields: [nameFieldName],
                    ResultType: 'simple',
                    MaxRows: 1
                });

                if (result.Success && result.Results.length > 0) {
                    const record = result.Results[0] as Record<string, string>;
                    item.recordName = record[nameFieldName] || item.detail.RecordID || '';
                }
            } catch (error) {
                item.recordName = item.detail.RecordID || 'Unknown';
            } finally {
                item.isLoading = false;
            }
        }
        this.cdr.markForCheck();
    }

    private async loadStats(): Promise<void> {
        if (!this.record?.IsSaved) return;

        this.isLoadingStats = true;

        try {
            const rv = new RunView();
            const [itemsResult, sharesResult, invitationsResult] = await rv.RunViews([
                {
                    EntityName: 'List Details',
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
            this.cdr.markForCheck();
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
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
    }

    private updateSelectAllState(): void {
        this.isSelectAllChecked = this.filteredItems.length > 0 &&
            this.filteredItems.every(item => this.selectedItems.has(item.detail.ID));
    }

    public async removeSelectedItems(): Promise<void> {
        if (this.selectedItems.size === 0) return;

        const count = this.selectedItems.size;
        const confirmMessage = `Remove ${count} item${count > 1 ? 's' : ''} from this list?`;

        if (!confirm(confirmMessage)) return;

        try {
            for (const id of this.selectedItems) {
                const item = this.listItems.find(i => i.detail.ID === id);
                if (item) {
                    await item.detail.Delete();
                }
            }

            this.showNotification(
                `Removed ${count} item${count > 1 ? 's' : ''} from list`,
                'success',
                3000
            );

            this.selectedItems.clear();
            await this.loadItems();
            await this.loadStats();
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

        // Use SharedService to open the record
        this.sharedService.InvokeManualResize();
    }

    // === Inline Editing ===

    public startEditingName(): void {
        this.editingName = this.record.Name;
        this.isEditingName = true;
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
    }

    public cancelNameEdit(): void {
        this.isEditingName = false;
        this.cdr.markForCheck();
    }

    public startEditingDescription(): void {
        this.editingDescription = this.record.Description || '';
        this.isEditingDescription = true;
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
    }

    public cancelDescriptionEdit(): void {
        this.isEditingDescription = false;
        this.cdr.markForCheck();
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
        const category = this.categories.find(c => c.ID === this.record.CategoryID);
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
        return this.record?.UserID === this.metadata.CurrentUser?.ID;
    }

    public async onCategoryChange(categoryId: string | null): Promise<void> {
        this.record.CategoryID = categoryId;
        const saved = await this.record.Save();

        if (saved) {
            this.showNotification('Category updated', 'success', 2000);
        } else {
            this.showNotification('Failed to update category', 'error', 3000);
        }

        this.cdr.markForCheck();
    }

    public async refreshItems(): Promise<void> {
        await this.loadItems();
        await this.loadStats();
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
        this.cdr.markForCheck();
    }

    public closeAddRecordsDialog(): void {
        this.showAddRecordsDialog = false;
        this.addableRecords = [];
        this.addRecordsSearchFilter = '';
        this.existingListDetailIds.clear();
        this.addDialogSaving = false;
        this.addProgress = 0;
        this.addTotal = 0;
        this.cdr.markForCheck();
    }

    private async loadExistingListDetailIds(): Promise<void> {
        if (!this.record) return;

        const rv = new RunView();
        const result = await rv.RunView<{ RecordID: string }>({
            EntityName: 'List Details',
            ExtraFilter: `ListID = '${this.record.ID}'`,
            Fields: ['RecordID'],
            ResultType: 'simple'
        }, this.metadata.CurrentUser);

        if (result.Success) {
            this.existingListDetailIds = new Set(result.Results.map(r => r.RecordID));
        }
    }

    public onAddRecordsSearchChange(value: string): void {
        this.addRecordsSearchFilter = value;
        this.searchSubject.next(value);
    }

    private async searchRecords(searchText: string): Promise<void> {
        if (!this.record || !searchText || searchText.length < 2) {
            this.addableRecords = [];
            this.cdr.markForCheck();
            return;
        }

        this.addDialogLoading = true;
        this.cdr.markForCheck();

        const sourceEntityInfo = this.metadata.EntityByID(this.record.EntityID);
        if (!sourceEntityInfo) {
            this.addDialogLoading = false;
            this.cdr.markForCheck();
            return;
        }

        const nameField = sourceEntityInfo.Fields.find(field => field.IsNameField);
        const pkField = sourceEntityInfo.FirstPrimaryKey?.Name || 'ID';

        let filter: string | undefined;
        if (nameField) {
            filter = `${nameField.Name} LIKE '%${searchText}%'`;
        }

        const rv = new RunView();
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
                    isInList: this.existingListDetailIds.has(recordId),
                    isSelected: false
                };
            });
        }

        this.addDialogLoading = false;
        this.cdr.markForCheck();
    }

    public toggleRecordSelection(record: AddableRecord): void {
        if (record.isInList) return; // Can't select records already in list
        record.isSelected = !record.isSelected;
        this.cdr.markForCheck();
    }

    public get selectedAddableRecords(): AddableRecord[] {
        return this.addableRecords.filter(r => r.isSelected);
    }

    public selectAllAddable(): void {
        this.addableRecords.forEach(r => {
            if (!r.isInList) r.isSelected = true;
        });
        this.cdr.markForCheck();
    }

    public deselectAllAddable(): void {
        this.addableRecords.forEach(r => r.isSelected = false);
        this.cdr.markForCheck();
    }

    public async confirmAddRecords(): Promise<void> {
        const recordsToAdd = this.selectedAddableRecords;
        if (recordsToAdd.length === 0 || !this.record) return;

        this.addDialogSaving = true;
        this.addTotal = recordsToAdd.length;
        this.addProgress = 0;
        this.cdr.markForCheck();

        // Use transaction group for bulk insert
        const tg = await this.metadata.CreateTransactionGroup();

        for (const record of recordsToAdd) {
            const listDetail = await this.metadata.GetEntityObject<ListDetailEntityExtended>('List Details');
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
            this.cdr.markForCheck();
        }
    }

    // ==========================================
    // Add From View Dialog
    // ==========================================

    public async openAddFromViewDialog(): Promise<void> {
        this.showAddFromViewDialog = true;
        this.userViewsToAdd = [];
        this.cdr.markForCheck();

        if (!this.userViews) {
            await this.loadEntityViews();
        }
    }

    public closeAddFromViewDialog(): void {
        this.showAddFromViewDialog = false;
        this.userViewsToAdd = [];
        this.showAddFromViewLoader = false;
        this.addFromViewProgress = 0;
        this.addFromViewTotal = 0;
        this.cdr.markForCheck();
    }

    private async loadEntityViews(): Promise<void> {
        if (!this.record || !this.record.Entity) return;

        this.showAddFromViewLoader = true;
        this.cdr.markForCheck();

        const rv = new RunView();
        const runViewResult = await rv.RunView<UserViewEntityExtended>({
            EntityName: 'User Views',
            ExtraFilter: `UserID = '${this.metadata.CurrentUser.ID}' AND EntityID = '${this.record.EntityID}'`,
            ResultType: 'entity_object'
        }, this.metadata.CurrentUser);

        if (!runViewResult.Success) {
            LogError(`Error loading User Views for entity ${this.record.Entity}`);
        } else {
            this.userViews = runViewResult.Results;
        }

        this.showAddFromViewLoader = false;
        this.cdr.markForCheck();
    }

    public toggleViewSelection(view: UserViewEntityExtended): void {
        const index = this.userViewsToAdd.findIndex(v => v.ID === view.ID);
        if (index >= 0) {
            this.userViewsToAdd.splice(index, 1);
        } else {
            this.userViewsToAdd.push(view);
        }
        this.cdr.markForCheck();
    }

    public isViewSelected(view: UserViewEntityExtended): boolean {
        return this.userViewsToAdd.some(v => v.ID === view.ID);
    }

    public async confirmAddFromView(): Promise<void> {
        if (!this.record || this.userViewsToAdd.length === 0) return;

        this.showAddFromViewLoader = true;
        this.fetchingRecordsToSave = true;
        this.cdr.markForCheck();

        const rv = new RunView();

        // Collect all unique record IDs from selected views
        const recordIdSet = new Set<string>();

        for (const userView of this.userViewsToAdd) {
            const runViewResult = await rv.RunView({
                EntityName: 'User Views',
                ViewEntity: userView,
                Fields: ['ID']
            }, this.metadata.CurrentUser);

            if (runViewResult.Success) {
                const records = runViewResult.Results as Array<{ ID: string }>;
                records.forEach(r => recordIdSet.add(r.ID));
            }
        }

        // Filter out records already in the list
        await this.loadExistingListDetailIds();
        const recordsToAdd = [...recordIdSet].filter(id => !this.existingListDetailIds.has(id));

        this.addFromViewTotal = recordsToAdd.length;
        this.addFromViewProgress = 0;
        this.fetchingRecordsToSave = false;
        this.cdr.markForCheck();

        if (recordsToAdd.length === 0) {
            this.showNotification('All records already in list', 'info', 2500);
            this.showAddFromViewLoader = false;
            this.cdr.markForCheck();
            return;
        }

        LogStatus(`Adding ${recordsToAdd.length} records to list`);

        // Use transaction group for bulk insert
        const tg = await this.metadata.CreateTransactionGroup();

        for (const recordID of recordsToAdd) {
            const listDetail = await this.metadata.GetEntityObject<ListDetailEntityExtended>('List Details');
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
            this.cdr.markForCheck();
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
        this.cdr.markForCheck();
    }

    public onShareDialogComplete(result: ListShareDialogResult): void {
        this.showShareDialog = false;
        this.shareDialogConfig = null;

        if (result.action === 'apply') {
            // Refresh stats to update share counts
            this.loadStats().then(() => {
                this.updateNavBadges();
                this.cdr.markForCheck();
            });
        }
        this.cdr.markForCheck();
    }

    public onShareDialogCancel(): void {
        this.showShareDialog = false;
        this.shareDialogConfig = null;
        this.cdr.markForCheck();
    }
}

export function LoadListFormComponentExtended() {
    // Prevents tree-shaking
}
