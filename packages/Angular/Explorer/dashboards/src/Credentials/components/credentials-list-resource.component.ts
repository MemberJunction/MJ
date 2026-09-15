import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { ResourceData, MJCredentialEntity, MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CredentialEditPanelComponent } from '@memberjunction/ng-credentials';
import { FilterFieldConfig, ViewToggleOption, MJConfirmService } from '@memberjunction/ng-ui-components';
type ViewMode = 'grid' | 'list';
type StatusFilter = '' | 'active' | 'inactive' | 'expired' | 'expiring';

@RegisterClass(BaseResourceComponent, 'CredentialsListResource')
@Component({
  standalone: false,
    selector: 'mj-credentials-list-resource',
    templateUrl: './credentials-list-resource.component.html',
    styleUrls: ['./credentials-list-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsListResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public Credentials: MJCredentialEntity[] = [];

    /** @deprecated Use {@link Credentials}. */
    public get credentials(): MJCredentialEntity[] {
      return this.Credentials;
    }
    /** @deprecated Use {@link Credentials}. */
    public set credentials(value: MJCredentialEntity[]) {
      this.Credentials = value;
    }
    public FilteredCredentials: MJCredentialEntity[] = [];

    /** @deprecated Use {@link FilteredCredentials}. */
    public get filteredCredentials(): MJCredentialEntity[] {
      return this.FilteredCredentials;
    }
    /** @deprecated Use {@link FilteredCredentials}. */
    public set filteredCredentials(value: MJCredentialEntity[]) {
      this.FilteredCredentials = value;
    }
    public Types: MJCredentialTypeEntity[] = [];

    /** @deprecated Use {@link Types}. */
    public get types(): MJCredentialTypeEntity[] {
      return this.Types;
    }
    /** @deprecated Use {@link Types}. */
    public set types(value: MJCredentialTypeEntity[]) {
      this.Types = value;
    }

    // View state
    public ViewMode: ViewMode = 'grid';

    /** @deprecated Use {@link ViewMode}. */
    public get viewMode(): ViewMode {
      return this.ViewMode;
    }
    /** @deprecated Use {@link ViewMode}. */
    public set viewMode(value: ViewMode) {
      this.ViewMode = value;
    }
    public SearchText = '';

    /** @deprecated Use {@link SearchText}. */
    public get searchText() {
      return this.SearchText;
    }
    /** @deprecated Use {@link SearchText}. */
    public set searchText(value) {
      this.SearchText = value;
    }
    public SelectedTypeFilter = '';

    /** @deprecated Use {@link SelectedTypeFilter}. */
    public get selectedTypeFilter() {
      return this.SelectedTypeFilter;
    }
    /** @deprecated Use {@link SelectedTypeFilter}. */
    public set selectedTypeFilter(value) {
      this.SelectedTypeFilter = value;
    }
    public SelectedStatusFilter: StatusFilter = '';

    /** @deprecated Use {@link SelectedStatusFilter}. */
    public get selectedStatusFilter(): StatusFilter {
      return this.SelectedStatusFilter;
    }
    /** @deprecated Use {@link SelectedStatusFilter}. */
    public set selectedStatusFilter(value: StatusFilter) {
      this.SelectedStatusFilter = value;
    }
    public ShowActiveOnly = false;

    /** @deprecated Use {@link ShowActiveOnly}. */
    public get showActiveOnly() {
      return this.ShowActiveOnly;
    }
    /** @deprecated Use {@link ShowActiveOnly}. */
    public set showActiveOnly(value) {
      this.ShowActiveOnly = value;
    }

    // Selection for bulk operations
    public SelectedCredentials = new Set<string>();

    /** @deprecated Use {@link SelectedCredentials}. */
    public get selectedCredentials() {
      return this.SelectedCredentials;
    }
    /** @deprecated Use {@link SelectedCredentials}. */
    public set selectedCredentials(value) {
      this.SelectedCredentials = value;
    }
    private _isAllSelected = false;

    // Permissions
    private _metadata = this.ProviderToUse;
    private _permissionCache = new Map<string, boolean>();

    protected override destroy$ = new Subject<void>();

    @ViewChild('editPanel') editPanel!: CredentialEditPanelComponent;

    public readonly ViewOptions: ViewToggleOption[] = [
        { key: 'grid', icon: 'fa-solid fa-grip', title: 'Grid view' },
        { key: 'list', icon: 'fa-solid fa-list', title: 'List view' }
    ];

    /** @deprecated Use {@link ViewOptions}. */
    public get viewOptions(): ViewToggleOption[] {
      return this.ViewOptions;
    }

    public get FilterFields(): FilterFieldConfig[] {
        const typeOptions = [
            { text: 'All Types', value: '' as const },
            ...this.Types.map(t => ({ text: t.Name, value: t.ID as string }))
        ];
        return [
            {
                key: 'typeFilter',
                type: 'dropdown',
                label: 'Type',
                icon: 'fa-solid fa-shapes',
                placeholder: 'All Types',
                filterable: true,
                options: typeOptions
            },
            {
                key: 'statusFilter',
                type: 'dropdown',
                label: 'Status',
                icon: 'fa-solid fa-circle-info',
                placeholder: 'All Statuses',
                options: [
                    { text: 'All Statuses', value: '' },
                    { text: 'Active', value: 'active' },
                    { text: 'Inactive', value: 'inactive' },
                    { text: 'Expiring Soon', value: 'expiring' },
                    { text: 'Expired', value: 'expired' }
                ]
            }
        ];
    }
    public get FilterValues(): Record<string, unknown> {
        return { typeFilter: this.SelectedTypeFilter, statusFilter: this.SelectedStatusFilter };
    }
    public get ActiveFilterCount(): number {
        let n = 0;
        if (this.SelectedTypeFilter) n++;
        if (this.SelectedStatusFilter) n++;
        return n;
    }
    public OnFilterValuesChange(v: Record<string, unknown>): void {
        const next = (v ?? {}) as { typeFilter?: string; statusFilter?: StatusFilter };
        if ((next.typeFilter ?? '') !== this.SelectedTypeFilter) {
            this.OnTypeFilterChange(next.typeFilter ?? '');
        }
        if ((next.statusFilter ?? '') !== this.SelectedStatusFilter) {
            this.OnStatusFilterChange(next.statusFilter ?? '');
        }
    }

    /** @deprecated Use {@link OnFilterValuesChange}. */
    public onFilterValuesChange(v: Record<string, unknown>): void {
      return this.OnFilterValuesChange(v);
    }
    public ResetFilters(): void {
        if (this.SelectedTypeFilter) this.OnTypeFilterChange('');
        if (this.SelectedStatusFilter) this.OnStatusFilterChange('');
    }

    /** @deprecated Use {@link ResetFilters}. */
    public resetFilters(): void {
      return this.ResetFilters();
    }

    constructor(
        private cdr: ChangeDetectorRef,
        private confirm: MJConfirmService
    ) {
        super();
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.loadData();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Credentials';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-key';
    }

    // === Permission Checks ===
    public get UserCanCreate(): boolean {
        return this.checkEntityPermission('MJ: Credentials', 'Create');
    }

    public get UserCanUpdate(): boolean {
        return this.checkEntityPermission('MJ: Credentials', 'Update');
    }

    public get UserCanDelete(): boolean {
        return this.checkEntityPermission('MJ: Credentials', 'Delete');
    }

    private checkEntityPermission(entityName: string, permissionType: 'Create' | 'Read' | 'Update' | 'Delete'): boolean {
        const cacheKey = `${entityName}_${permissionType}`;

        if (this._permissionCache.has(cacheKey)) {
            return this._permissionCache.get(cacheKey)!;
        }

        try {
            const entityInfo = this._metadata.Entities.find(e => e.Name === entityName);
            if (!entityInfo) {
                this._permissionCache.set(cacheKey, false);
                return false;
            }

            const userPermissions = entityInfo.GetUserPermisions(this._metadata.CurrentUser);
            let hasPermission = false;

            switch (permissionType) {
                case 'Create': hasPermission = userPermissions.CanCreate; break;
                case 'Read': hasPermission = userPermissions.CanRead; break;
                case 'Update': hasPermission = userPermissions.CanUpdate; break;
                case 'Delete': hasPermission = userPermissions.CanDelete; break;
            }

            this._permissionCache.set(cacheKey, hasPermission);
            return hasPermission;
        } catch (error) {
            this._permissionCache.set(cacheKey, false);
            return false;
        }
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);

            const [credResult, typeResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Credentials',
                    OrderBy: '__mj_UpdatedAt DESC',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Credential Types',
                    OrderBy: 'Category, Name',
                    ResultType: 'entity_object'
                }
            ]);

            if (credResult.Success) {
                this.Credentials = credResult.Results as MJCredentialEntity[];
            }

            if (typeResult.Success) {
                this.Types = typeResult.Results as MJCredentialTypeEntity[];
            }

            this.applyFilters();

        } catch (error) {
            console.error('Error loading credentials:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error loading credentials', 'error', 3000);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();

            // Handle navigation params from Data.Configuration (passed via NavigationService)
            this.handleNavigationConfig();
        }
    }

    // === Navigation Handling ===

    private handleNavigationConfig(): void {
        const config = this.Data?.Configuration;
        if (!config) {
            return;
        }

        // Apply filters from navigation config
        if (config.typeId) {
            this.SelectedTypeFilter = config.typeId as string;
            this.applyFilters();
        }

        if (config.openCreatePanel) {
            // Open create panel (optionally with type/category pre-selected)
            setTimeout(() => {
                if (config.categoryId) {
                    this.CreateNewCredentialWithType(config.typeId as string, config.categoryId as string);
                } else if (config.typeId) {
                    this.CreateNewCredentialWithType(config.typeId as string);
                } else {
                    this.CreateNewCredential();
                }
            }, 100);
        }
    }

    // === CRUD Operations ===

    public CreateNewCredential(): void {
        if (this.editPanel) {
            this.editPanel.open(null);
        }
    }

    /** @deprecated Use {@link CreateNewCredential}. */
    public createNewCredential(): void {
      return this.CreateNewCredential();
    }

    public CreateNewCredentialWithType(typeId?: string, categoryId?: string): void {
        if (this.editPanel) {
            this.editPanel.open(null, typeId, categoryId);
        }
    }

    /** @deprecated Use {@link CreateNewCredentialWithType}. */
    public createNewCredentialWithType(typeId?: string, categoryId?: string): void {
      return this.CreateNewCredentialWithType(typeId, categoryId);
    }

    public EditCredential(credential: MJCredentialEntity, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.editPanel) {
            this.editPanel.open(credential);
        }
    }

    /** @deprecated Use {@link EditCredential}. */
    public editCredential(credential: MJCredentialEntity, event?: Event): void {
      return this.EditCredential(credential, event);
    }

    public OnCredentialSaved(credential: MJCredentialEntity): void {
        // Check if it's a new credential or update
        const existingIndex = this.Credentials.findIndex(c => UUIDsEqual(c.ID, credential.ID));
        if (existingIndex >= 0) {
            // Update existing
            this.Credentials[existingIndex] = credential;
        } else {
            // Add new
            this.Credentials.unshift(credential);
        }
        this.applyFilters();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnCredentialSaved}. */
    public onCredentialSaved(credential: MJCredentialEntity): void {
      return this.OnCredentialSaved(credential);
    }

    public OnCredentialDeleted(credentialId: string): void {
        this.Credentials = this.Credentials.filter(c => !UUIDsEqual(c.ID, credentialId));
        this.SelectedCredentials.delete(credentialId);
        this.applyFilters();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnCredentialDeleted}. */
    public onCredentialDeleted(credentialId: string): void {
      return this.OnCredentialDeleted(credentialId);
    }

    public async DeleteCredential(credential: MJCredentialEntity, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }

        if (!this.UserCanDelete) {
            MJNotificationService.Instance.CreateSimpleNotification('You do not have permission to delete credentials', 'warning', 3000);
            return;
        }

        const confirmed = await this.confirm.ConfirmDelete({
            title: 'Delete credential',
            message: `Delete "${credential.Name}"?`,
            detail: 'This action cannot be undone.',
        });
        if (!confirmed) return;

        try {
            const success = await credential.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(`Credential "${credential.Name}" deleted successfully`, 'success', 3000);
                this.Credentials = this.Credentials.filter(c => !UUIDsEqual(c.ID, credential.ID));
                this.SelectedCredentials.delete(credential.ID);
                this.applyFilters();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to delete credential', 'error', 3000);
            }
        } catch (error) {
            console.error('Error deleting credential:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error deleting credential', 'error', 3000);
        }
    }

    /** @deprecated Use {@link DeleteCredential}. */
    public async deleteCredential(credential: MJCredentialEntity, event?: Event): Promise<void> {
      return this.DeleteCredential(credential, event);
    }

    public async ToggleCredentialActive(credential: MJCredentialEntity, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }

        if (!this.UserCanUpdate) {
            MJNotificationService.Instance.CreateSimpleNotification('You do not have permission to update credentials', 'warning', 3000);
            return;
        }

        try {
            credential.IsActive = !credential.IsActive;
            const success = await credential.Save();

            if (success) {
                const status = credential.IsActive ? 'activated' : 'deactivated';
                MJNotificationService.Instance.CreateSimpleNotification(`Credential "${credential.Name}" ${status}`, 'success', 2000);
                this.applyFilters();
            } else {
                // Revert on failure
                credential.IsActive = !credential.IsActive;
                MJNotificationService.Instance.CreateSimpleNotification('Failed to update credential', 'error', 3000);
            }
        } catch (error) {
            console.error('Error updating credential:', error);
            credential.IsActive = !credential.IsActive;
            MJNotificationService.Instance.CreateSimpleNotification('Error updating credential', 'error', 3000);
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleCredentialActive}. */
    public async toggleCredentialActive(credential: MJCredentialEntity, event?: Event): Promise<void> {
      return this.ToggleCredentialActive(credential, event);
    }

    // === Selection ===

    public ToggleSelection(credential: MJCredentialEntity, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.SelectedCredentials.has(credential.ID)) {
            this.SelectedCredentials.delete(credential.ID);
        } else {
            this.SelectedCredentials.add(credential.ID);
        }
        this.updateAllSelectedState();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleSelection}. */
    public toggleSelection(credential: MJCredentialEntity, event?: Event): void {
      return this.ToggleSelection(credential, event);
    }

    public ToggleSelectAll(): void {
        if (this._isAllSelected) {
            this.SelectedCredentials.clear();
        } else {
            this.FilteredCredentials.forEach(c => this.SelectedCredentials.add(c.ID));
        }
        this._isAllSelected = !this._isAllSelected;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleSelectAll}. */
    public toggleSelectAll(): void {
      return this.ToggleSelectAll();
    }

    public IsAllSelected(): boolean {
        return this._isAllSelected;
    }

    /** @deprecated Use {@link IsAllSelected}. */
    public isAllSelected(): boolean {
      return this.IsAllSelected();
    }

    public IsSelected(credential: MJCredentialEntity): boolean {
        return this.SelectedCredentials.has(credential.ID);
    }

    /** @deprecated Use {@link IsSelected}. */
    public isSelected(credential: MJCredentialEntity): boolean {
      return this.IsSelected(credential);
    }

    public ClearSelection(): void {
        this.SelectedCredentials.clear();
        this._isAllSelected = false;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ClearSelection}. */
    public clearSelection(): void {
      return this.ClearSelection();
    }

    private updateAllSelectedState(): void {
        this._isAllSelected = this.FilteredCredentials.length > 0 &&
            this.FilteredCredentials.every(c => this.SelectedCredentials.has(c.ID));
    }

    public async DeleteSelected(): Promise<void> {
        if (!this.UserCanDelete || this.SelectedCredentials.size === 0) return;

        const count = this.SelectedCredentials.size;
        const confirmed = await this.confirm.ConfirmDelete({
            title: 'Delete credentials',
            message: `Delete ${count} credential(s)?`,
            detail: 'This action cannot be undone.',
        });
        if (!confirmed) return;

        const toDelete = Array.from(this.SelectedCredentials)
            .map(id => this.Credentials.find(c => UUIDsEqual(c.ID, id)))
            .filter((c): c is MJCredentialEntity => c != null);

        if (toDelete.length === 0) return;

        const tg = await this._metadata.CreateTransactionGroup();
        for (const credential of toDelete) {
            credential.TransactionGroup = tg;
            await credential.Delete();
        }

        if (await tg.Submit()) {
            const deletedIds = new Set(toDelete.map(c => c.ID));
            this.Credentials = this.Credentials.filter(c => !deletedIds.has(c.ID));
            this.SelectedCredentials.clear();
            this.applyFilters();
            MJNotificationService.Instance.CreateSimpleNotification(
                `${toDelete.length} credential(s) deleted`,
                'success',
                3000
            );
        } else {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to delete credentials — all changes have been rolled back',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link DeleteSelected}. */
    public async deleteSelected(): Promise<void> {
      return this.DeleteSelected();
    }

    // === Filtering ===

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.applyFilters();
    }

    /** @deprecated Use {@link OnSearchChange}. */
    public onSearchChange(value: string): void {
      return this.OnSearchChange(value);
    }

    public OnTypeFilterChange(typeId: string): void {
        this.SelectedTypeFilter = typeId;
        this.applyFilters();
    }

    /** @deprecated Use {@link OnTypeFilterChange}. */
    public onTypeFilterChange(typeId: string): void {
      return this.OnTypeFilterChange(typeId);
    }

    public OnStatusFilterChange(status: StatusFilter): void {
        this.SelectedStatusFilter = status;
        this.applyFilters();
    }

    /** @deprecated Use {@link OnStatusFilterChange}. */
    public onStatusFilterChange(status: StatusFilter): void {
      return this.OnStatusFilterChange(status);
    }

    public OnActiveFilterChange(showActive: boolean): void {
        this.ShowActiveOnly = showActive;
        this.applyFilters();
    }

    /** @deprecated Use {@link OnActiveFilterChange}. */
    public onActiveFilterChange(showActive: boolean): void {
      return this.OnActiveFilterChange(showActive);
    }

    public ClearFilters(): void {
        this.SearchText = '';
        this.SelectedTypeFilter = '';
        this.SelectedStatusFilter = '';
        this.ShowActiveOnly = false;
        this.applyFilters();
    }

    /** @deprecated Use {@link ClearFilters}. */
    public clearFilters(): void {
      return this.ClearFilters();
    }

    /** True when search and/or any filter narrow the list. */
    public get IsListNarrowed(): boolean {
        return !!(this.SearchText || this.SelectedTypeFilter || this.SelectedStatusFilter);
    }

    /** Empty-state CTA: reset filters when narrowed, otherwise create. */
    public OnEmptyStateAction(): void {
        if (this.IsListNarrowed) {
            this.ClearFilters();
        } else {
            this.CreateNewCredential();
        }
    }

    /** @deprecated Use {@link OnEmptyStateAction}. */
    public onEmptyStateAction(): void {
      return this.OnEmptyStateAction();
    }

    public get HasActiveFilters(): boolean {
        return this.SearchText !== '' ||
            this.SelectedTypeFilter !== '' ||
            this.SelectedStatusFilter !== '' ||
            this.ShowActiveOnly;
    }

    /** @deprecated Use {@link HasActiveFilters}. */
    public get hasActiveFilters(): boolean {
      return this.HasActiveFilters;
    }

    private applyFilters(): void {
        let filtered = [...this.Credentials];
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        // Filter by active status
        if (this.ShowActiveOnly) {
            filtered = filtered.filter(c => c.IsActive);
        }

        // Filter by status
        if (this.SelectedStatusFilter) {
            filtered = filtered.filter(c => {
                const statusClass = this.GetStatusClass(c);
                switch (this.SelectedStatusFilter) {
                    case 'active': return statusClass === 'active';
                    case 'inactive': return statusClass === 'inactive';
                    case 'expired': return statusClass === 'expired';
                    case 'expiring': return statusClass === 'expiring';
                    default: return true;
                }
            });
        }

        // Filter by type
        if (this.SelectedTypeFilter) {
            filtered = filtered.filter(c => UUIDsEqual(c.CredentialTypeID, this.SelectedTypeFilter));
        }

        // Filter by search text
        if (this.SearchText.trim()) {
            const search = this.SearchText.toLowerCase().trim();
            filtered = filtered.filter(c =>
                c.Name.toLowerCase().includes(search) ||
                (c.Description && c.Description.toLowerCase().includes(search)) ||
                (c.CredentialType && c.CredentialType.toLowerCase().includes(search))
            );
        }

        this.FilteredCredentials = filtered;
        this.updateAllSelectedState();
        this.cdr.markForCheck();
    }

    // === View Mode ===

    public SetViewMode(mode: ViewMode): void {
        this.ViewMode = mode;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SetViewMode}. */
    public setViewMode(mode: ViewMode): void {
      return this.SetViewMode(mode);
    }

    // === Helpers ===

    public GetTypeById(typeId: string): MJCredentialTypeEntity | undefined {
        return this.Types.find(t => UUIDsEqual(t.ID, typeId));
    }

    /** @deprecated Use {@link GetTypeById}. */
    public getTypeById(typeId: string): MJCredentialTypeEntity | undefined {
      return this.GetTypeById(typeId);
    }

    public GetTypesByCategory(): Map<string, MJCredentialTypeEntity[]> {
        const grouped = new Map<string, MJCredentialTypeEntity[]>();
        for (const type of this.Types) {
            const category = type.Category;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(type);
        }
        return grouped;
    }

    /** @deprecated Use {@link GetTypesByCategory}. */
    public getTypesByCategory(): Map<string, MJCredentialTypeEntity[]> {
      return this.GetTypesByCategory();
    }

    public GetStatusClass(credential: MJCredentialEntity): string {
        if (!credential.IsActive) {
            return 'inactive';
        }
        if (credential.ExpiresAt) {
            const expiresAt = new Date(credential.ExpiresAt);
            const now = new Date();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            if (expiresAt < now) {
                return 'expired';
            }
            if (expiresAt.getTime() - now.getTime() < thirtyDays) {
                return 'expiring';
            }
        }
        return 'active';
    }

    /** @deprecated Use {@link GetStatusClass}. */
    public getStatusClass(credential: MJCredentialEntity): string {
      return this.GetStatusClass(credential);
    }

    public GetStatusLabel(credential: MJCredentialEntity): string {
        const statusClass = this.GetStatusClass(credential);
        const labels: Record<string, string> = {
            'active': 'Active',
            'inactive': 'Inactive',
            'expired': 'Expired',
            'expiring': 'Expiring Soon'
        };
        return labels[statusClass] || 'Unknown';
    }

    /** @deprecated Use {@link GetStatusLabel}. */
    public getStatusLabel(credential: MJCredentialEntity): string {
      return this.GetStatusLabel(credential);
    }

    public GetStatusIcon(credential: MJCredentialEntity): string {
        const statusClass = this.GetStatusClass(credential);
        const icons: Record<string, string> = {
            'active': 'fa-solid fa-check-circle',
            'inactive': 'fa-solid fa-minus-circle',
            'expired': 'fa-solid fa-times-circle',
            'expiring': 'fa-solid fa-clock'
        };
        return icons[statusClass] || 'fa-solid fa-circle';
    }

    /** @deprecated Use {@link GetStatusIcon}. */
    public getStatusIcon(credential: MJCredentialEntity): string {
      return this.GetStatusIcon(credential);
    }

    public formatDate(date: Date | null | undefined): string {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    public FormatDateTime(date: Date | null | undefined): string {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /** @deprecated Use {@link FormatDateTime}. */
    public formatDateTime(date: Date | null | undefined): string {
      return this.FormatDateTime(date);
    }

    public GetTimeAgo(date: Date | null | undefined): string {
        if (!date) return 'Never';
        const now = new Date();
        const then = new Date(date);
        const diffMs = now.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 30) return `${diffDays}d ago`;
        return this.formatDate(date);
    }

    /** @deprecated Use {@link GetTimeAgo}. */
    public getTimeAgo(date: Date | null | undefined): string {
      return this.GetTimeAgo(date);
    }

    public GetTypeIcon(credential: MJCredentialEntity): string {
        const type = this.GetTypeById(credential.CredentialTypeID);
        if (!type) return 'fa-solid fa-key';

        const iconMap: Record<string, string> = {
            'AI': 'fa-solid fa-brain',
            'Communication': 'fa-solid fa-envelope',
            'Storage': 'fa-solid fa-cloud',
            'Database': 'fa-solid fa-database',
            'Authentication': 'fa-solid fa-shield-halved',
            'Integration': 'fa-solid fa-plug'
        };
        return iconMap[type.Category] || 'fa-solid fa-key';
    }

    /** @deprecated Use {@link GetTypeIcon}. */
    public getTypeIcon(credential: MJCredentialEntity): string {
      return this.GetTypeIcon(credential);
    }

    public Refresh(): void {
        this.SelectedCredentials.clear();
        this.loadData();
    }

    /** @deprecated Use {@link Refresh}. */
    public refresh(): void {
      return this.Refresh();
    }

    // === Stats ===

    public get ActiveCount(): number {
        return this.Credentials.filter(c => c.IsActive).length;
    }

    /** @deprecated Use {@link ActiveCount}. */
    public get activeCount(): number {
      return this.ActiveCount;
    }

    public GetActiveCount(): number {
        return this.ActiveCount;
    }

    /** @deprecated Use {@link GetActiveCount}. */
    public getActiveCount(): number {
      return this.GetActiveCount();
    }

    public get ExpiringCount(): number {
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        return this.Credentials.filter(c =>
            c.ExpiresAt &&
            new Date(c.ExpiresAt) >= now &&
            new Date(c.ExpiresAt) <= thirtyDaysFromNow &&
            c.IsActive
        ).length;
    }

    /** @deprecated Use {@link ExpiringCount}. */
    public get expiringCount(): number {
      return this.ExpiringCount;
    }

    public GetExpiringSoonCount(): number {
        return this.ExpiringCount;
    }

    /** @deprecated Use {@link GetExpiringSoonCount}. */
    public getExpiringSoonCount(): number {
      return this.GetExpiringSoonCount();
    }

    public get ExpiredCount(): number {
        const now = new Date();
        return this.Credentials.filter(c =>
            c.ExpiresAt && new Date(c.ExpiresAt) < now
        ).length;
    }

    /** @deprecated Use {@link ExpiredCount}. */
    public get expiredCount(): number {
      return this.ExpiredCount;
    }

    public GetExpiredCount(): number {
        return this.ExpiredCount;
    }

    /** @deprecated Use {@link GetExpiredCount}. */
    public getExpiredCount(): number {
      return this.GetExpiredCount();
    }

    // === Status Helpers ===

    public IsExpired(credential: MJCredentialEntity): boolean {
        if (!credential.ExpiresAt) return false;
        return new Date(credential.ExpiresAt) < new Date();
    }

    /** @deprecated Use {@link IsExpired}. */
    public isExpired(credential: MJCredentialEntity): boolean {
      return this.IsExpired(credential);
    }

    public IsExpiringSoon(credential: MJCredentialEntity): boolean {
        if (!credential.ExpiresAt) return false;
        const expiresAt = new Date(credential.ExpiresAt);
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        return expiresAt >= now && expiresAt <= thirtyDaysFromNow;
    }

    /** @deprecated Use {@link IsExpiringSoon}. */
    public isExpiringSoon(credential: MJCredentialEntity): boolean {
      return this.IsExpiringSoon(credential);
    }

    // === Bulk Operations ===

    public async BulkToggleActive(active: boolean): Promise<void> {
        if (!this.UserCanUpdate || this.SelectedCredentials.size === 0) return;

        const toUpdate: MJCredentialEntity[] = [];
        for (const credId of this.SelectedCredentials) {
            const credential = this.Credentials.find(c => UUIDsEqual(c.ID, credId));
            if (credential && credential.IsActive !== active) {
                toUpdate.push(credential);
            }
        }

        const action = active ? 'activated' : 'deactivated';

        if (toUpdate.length === 0) {
            this.ClearSelection();
            return;
        }

        const tg = await this._metadata.CreateTransactionGroup();
        for (const credential of toUpdate) {
            credential.IsActive = active;
            credential.TransactionGroup = tg;
            await credential.Save();
        }

        if (await tg.Submit()) {
            this.ClearSelection();
            this.applyFilters();
            MJNotificationService.Instance.CreateSimpleNotification(
                `${toUpdate.length} credential(s) ${action}`,
                'success',
                3000
            );
        } else {
            // Server rolled back — revert the client-side state to match
            for (const credential of toUpdate) {
                credential.IsActive = !active;
            }
            this.ClearSelection();
            this.applyFilters();
            MJNotificationService.Instance.CreateSimpleNotification(
                `Failed to ${action.slice(0, -1)} credentials — all changes have been rolled back`,
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link BulkToggleActive}. */
    public async bulkToggleActive(active: boolean): Promise<void> {
      return this.BulkToggleActive(active);
    }

    public async BulkDelete(): Promise<void> {
        if (!this.UserCanDelete || this.SelectedCredentials.size === 0) return;

        const count = this.SelectedCredentials.size;
        const confirmed = await this.confirm.ConfirmDelete({
            title: 'Delete credentials',
            message: `Delete ${count} credential(s)?`,
            detail: 'This action cannot be undone.',
        });
        if (!confirmed) return;

        const toDelete = Array.from(this.SelectedCredentials)
            .map(id => this.Credentials.find(c => UUIDsEqual(c.ID, id)))
            .filter((c): c is MJCredentialEntity => c != null);

        if (toDelete.length === 0) return;

        const tg = await this._metadata.CreateTransactionGroup();
        for (const credential of toDelete) {
            credential.TransactionGroup = tg;
            await credential.Delete();
        }

        if (await tg.Submit()) {
            const deletedIds = new Set(toDelete.map(c => c.ID));
            this.Credentials = this.Credentials.filter(c => !deletedIds.has(c.ID));
            this.ClearSelection();
            this.applyFilters();
            MJNotificationService.Instance.CreateSimpleNotification(
                `${toDelete.length} credential(s) deleted`,
                'success',
                3000
            );
        } else {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to delete credentials — all changes have been rolled back',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link BulkDelete}. */
    public async bulkDelete(): Promise<void> {
      return this.BulkDelete();
    }
}
