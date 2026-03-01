import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { ResourceData, MJCredentialEntity, MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CredentialEditPanelComponent } from '@memberjunction/ng-credentials';
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
    public credentials: MJCredentialEntity[] = [];
    public filteredCredentials: MJCredentialEntity[] = [];
    public types: MJCredentialTypeEntity[] = [];

    // View state
    public viewMode: ViewMode = 'grid';
    public searchText = '';
    public selectedTypeFilter = '';
    public selectedStatusFilter: StatusFilter = '';
    public showActiveOnly = false;

    // Selection for bulk operations
    public selectedCredentials = new Set<string>();
    private _isAllSelected = false;

    // Permissions
    private _metadata = new Metadata();
    private _permissionCache = new Map<string, boolean>();

    private destroy$ = new Subject<void>();

    @ViewChild('editPanel') editPanel!: CredentialEditPanelComponent;

    constructor(
        private cdr: ChangeDetectorRef
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
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

            const rv = new RunView();

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
                this.credentials = credResult.Results as MJCredentialEntity[];
            }

            if (typeResult.Success) {
                this.types = typeResult.Results as MJCredentialTypeEntity[];
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
            this.selectedTypeFilter = config.typeId as string;
            this.applyFilters();
        }

        if (config.openCreatePanel) {
            // Open create panel (optionally with type/category pre-selected)
            setTimeout(() => {
                if (config.categoryId) {
                    this.createNewCredentialWithType(config.typeId as string, config.categoryId as string);
                } else if (config.typeId) {
                    this.createNewCredentialWithType(config.typeId as string);
                } else {
                    this.createNewCredential();
                }
            }, 100);
        }
    }

    // === CRUD Operations ===

    public createNewCredential(): void {
        if (this.editPanel) {
            this.editPanel.open(null);
        }
    }

    public createNewCredentialWithType(typeId?: string, categoryId?: string): void {
        if (this.editPanel) {
            this.editPanel.open(null, typeId, categoryId);
        }
    }

    public editCredential(credential: MJCredentialEntity, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.editPanel) {
            this.editPanel.open(credential);
        }
    }

    public onCredentialSaved(credential: MJCredentialEntity): void {
        // Check if it's a new credential or update
        const existingIndex = this.credentials.findIndex(c => UUIDsEqual(c.ID, credential.ID))
        if (existingIndex >= 0) {
            // Update existing
            this.credentials[existingIndex] = credential;
        } else {
            // Add new
            this.credentials.unshift(credential);
        }
        this.applyFilters();
        this.cdr.markForCheck();
    }

    public onCredentialDeleted(credentialId: string): void {
        this.credentials = this.credentials.filter(c => !UUIDsEqual(c.ID, credentialId))
        this.selectedCredentials.delete(credentialId);
        this.applyFilters();
        this.cdr.markForCheck();
    }

    public async deleteCredential(credential: MJCredentialEntity, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }

        if (!this.UserCanDelete) {
            MJNotificationService.Instance.CreateSimpleNotification('You do not have permission to delete credentials', 'warning', 3000);
            return;
        }

        const confirmed = confirm(`Are you sure you want to delete "${credential.Name}"? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            const success = await credential.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(`Credential "${credential.Name}" deleted successfully`, 'success', 3000);
                this.credentials = this.credentials.filter(c => !UUIDsEqual(c.ID, credential.ID))
                this.selectedCredentials.delete(credential.ID);
                this.applyFilters();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to delete credential', 'error', 3000);
            }
        } catch (error) {
            console.error('Error deleting credential:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error deleting credential', 'error', 3000);
        }
    }

    public async toggleCredentialActive(credential: MJCredentialEntity, event?: Event): Promise<void> {
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

    // === Selection ===

    public toggleSelection(credential: MJCredentialEntity, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.selectedCredentials.has(credential.ID)) {
            this.selectedCredentials.delete(credential.ID);
        } else {
            this.selectedCredentials.add(credential.ID);
        }
        this.updateAllSelectedState();
        this.cdr.markForCheck();
    }

    public toggleSelectAll(): void {
        if (this._isAllSelected) {
            this.selectedCredentials.clear();
        } else {
            this.filteredCredentials.forEach(c => this.selectedCredentials.add(c.ID));
        }
        this._isAllSelected = !this._isAllSelected;
        this.cdr.markForCheck();
    }

    public isAllSelected(): boolean {
        return this._isAllSelected;
    }

    public isSelected(credential: MJCredentialEntity): boolean {
        return this.selectedCredentials.has(credential.ID);
    }

    public clearSelection(): void {
        this.selectedCredentials.clear();
        this._isAllSelected = false;
        this.cdr.markForCheck();
    }

    private updateAllSelectedState(): void {
        this._isAllSelected = this.filteredCredentials.length > 0 &&
            this.filteredCredentials.every(c => this.selectedCredentials.has(c.ID));
    }

    public async deleteSelected(): Promise<void> {
        if (!this.UserCanDelete || this.selectedCredentials.size === 0) return;

        const count = this.selectedCredentials.size;
        const confirmed = confirm(`Are you sure you want to delete ${count} credential(s)? This action cannot be undone.`);
        if (!confirmed) return;

        let successCount = 0;
        let failCount = 0;

        for (const credId of this.selectedCredentials) {
            const credential = this.credentials.find(c => UUIDsEqual(c.ID, credId))
            if (credential) {
                try {
                    const success = await credential.Delete();
                    if (success) {
                        successCount++;
                        this.credentials = this.credentials.filter(c => !UUIDsEqual(c.ID, credId))
                    } else {
                        failCount++;
                    }
                } catch {
                    failCount++;
                }
            }
        }

        this.selectedCredentials.clear();
        this.applyFilters();

        if (successCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `${successCount} credential(s) deleted${failCount > 0 ? `, ${failCount} failed` : ''}`,
                failCount > 0 ? 'warning' : 'success',
                3000
            );
        } else {
            MJNotificationService.Instance.CreateSimpleNotification('Failed to delete credentials', 'error', 3000);
        }
    }

    // === Filtering ===

    public onSearchChange(value: string): void {
        this.searchText = value;
        this.applyFilters();
    }

    public onTypeFilterChange(typeId: string): void {
        this.selectedTypeFilter = typeId;
        this.applyFilters();
    }

    public onStatusFilterChange(status: StatusFilter): void {
        this.selectedStatusFilter = status;
        this.applyFilters();
    }

    public onActiveFilterChange(showActive: boolean): void {
        this.showActiveOnly = showActive;
        this.applyFilters();
    }

    public clearFilters(): void {
        this.searchText = '';
        this.selectedTypeFilter = '';
        this.selectedStatusFilter = '';
        this.showActiveOnly = false;
        this.applyFilters();
    }

    public get hasActiveFilters(): boolean {
        return this.searchText !== '' ||
            this.selectedTypeFilter !== '' ||
            this.selectedStatusFilter !== '' ||
            this.showActiveOnly;
    }

    private applyFilters(): void {
        let filtered = [...this.credentials];
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        // Filter by active status
        if (this.showActiveOnly) {
            filtered = filtered.filter(c => c.IsActive);
        }

        // Filter by status
        if (this.selectedStatusFilter) {
            filtered = filtered.filter(c => {
                const statusClass = this.getStatusClass(c);
                switch (this.selectedStatusFilter) {
                    case 'active': return statusClass === 'active';
                    case 'inactive': return statusClass === 'inactive';
                    case 'expired': return statusClass === 'expired';
                    case 'expiring': return statusClass === 'expiring';
                    default: return true;
                }
            });
        }

        // Filter by type
        if (this.selectedTypeFilter) {
            filtered = filtered.filter(c => UUIDsEqual(c.CredentialTypeID, this.selectedTypeFilter))
        }

        // Filter by search text
        if (this.searchText.trim()) {
            const search = this.searchText.toLowerCase().trim();
            filtered = filtered.filter(c =>
                c.Name.toLowerCase().includes(search) ||
                (c.Description && c.Description.toLowerCase().includes(search)) ||
                (c.CredentialType && c.CredentialType.toLowerCase().includes(search))
            );
        }

        this.filteredCredentials = filtered;
        this.updateAllSelectedState();
        this.cdr.markForCheck();
    }

    // === View Mode ===

    public setViewMode(mode: ViewMode): void {
        this.viewMode = mode;
        this.cdr.markForCheck();
    }

    // === Helpers ===

    public getTypeById(typeId: string): MJCredentialTypeEntity | undefined {
        return this.types.find(t => UUIDsEqual(t.ID, typeId))
    }

    public getTypesByCategory(): Map<string, MJCredentialTypeEntity[]> {
        const grouped = new Map<string, MJCredentialTypeEntity[]>();
        for (const type of this.types) {
            const category = type.Category;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(type);
        }
        return grouped;
    }

    public getStatusClass(credential: MJCredentialEntity): string {
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

    public getStatusLabel(credential: MJCredentialEntity): string {
        const statusClass = this.getStatusClass(credential);
        const labels: Record<string, string> = {
            'active': 'Active',
            'inactive': 'Inactive',
            'expired': 'Expired',
            'expiring': 'Expiring Soon'
        };
        return labels[statusClass] || 'Unknown';
    }

    public getStatusIcon(credential: MJCredentialEntity): string {
        const statusClass = this.getStatusClass(credential);
        const icons: Record<string, string> = {
            'active': 'fa-solid fa-check-circle',
            'inactive': 'fa-solid fa-minus-circle',
            'expired': 'fa-solid fa-times-circle',
            'expiring': 'fa-solid fa-clock'
        };
        return icons[statusClass] || 'fa-solid fa-circle';
    }

    public formatDate(date: Date | null | undefined): string {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    public formatDateTime(date: Date | null | undefined): string {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    public getTimeAgo(date: Date | null | undefined): string {
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

    public getTypeIcon(credential: MJCredentialEntity): string {
        const type = this.getTypeById(credential.CredentialTypeID);
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

    public refresh(): void {
        this.selectedCredentials.clear();
        this.loadData();
    }

    // === Stats ===

    public get activeCount(): number {
        return this.credentials.filter(c => c.IsActive).length;
    }

    public getActiveCount(): number {
        return this.activeCount;
    }

    public get expiringCount(): number {
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        return this.credentials.filter(c =>
            c.ExpiresAt &&
            new Date(c.ExpiresAt) >= now &&
            new Date(c.ExpiresAt) <= thirtyDaysFromNow &&
            c.IsActive
        ).length;
    }

    public getExpiringSoonCount(): number {
        return this.expiringCount;
    }

    public get expiredCount(): number {
        const now = new Date();
        return this.credentials.filter(c =>
            c.ExpiresAt && new Date(c.ExpiresAt) < now
        ).length;
    }

    public getExpiredCount(): number {
        return this.expiredCount;
    }

    // === Status Helpers ===

    public isExpired(credential: MJCredentialEntity): boolean {
        if (!credential.ExpiresAt) return false;
        return new Date(credential.ExpiresAt) < new Date();
    }

    public isExpiringSoon(credential: MJCredentialEntity): boolean {
        if (!credential.ExpiresAt) return false;
        const expiresAt = new Date(credential.ExpiresAt);
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        return expiresAt >= now && expiresAt <= thirtyDaysFromNow;
    }

    // === Bulk Operations ===

    public async bulkToggleActive(active: boolean): Promise<void> {
        if (!this.UserCanUpdate || this.selectedCredentials.size === 0) return;

        let successCount = 0;
        let failCount = 0;

        for (const credId of this.selectedCredentials) {
            const credential = this.credentials.find(c => UUIDsEqual(c.ID, credId))
            if (credential && credential.IsActive !== active) {
                try {
                    credential.IsActive = active;
                    const success = await credential.Save();
                    if (success) {
                        successCount++;
                    } else {
                        credential.IsActive = !active;
                        failCount++;
                    }
                } catch {
                    credential.IsActive = !active;
                    failCount++;
                }
            }
        }

        this.clearSelection();
        this.applyFilters();

        const action = active ? 'activated' : 'deactivated';
        if (successCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `${successCount} credential(s) ${action}${failCount > 0 ? `, ${failCount} failed` : ''}`,
                failCount > 0 ? 'warning' : 'success',
                3000
            );
        } else if (failCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(`Failed to ${action.slice(0, -1)} credentials`, 'error', 3000);
        }
    }

    public async bulkDelete(): Promise<void> {
        if (!this.UserCanDelete || this.selectedCredentials.size === 0) return;

        const count = this.selectedCredentials.size;
        const confirmed = confirm(`Are you sure you want to delete ${count} credential(s)? This action cannot be undone.`);
        if (!confirmed) return;

        let successCount = 0;
        let failCount = 0;

        for (const credId of this.selectedCredentials) {
            const credential = this.credentials.find(c => UUIDsEqual(c.ID, credId))
            if (credential) {
                try {
                    const success = await credential.Delete();
                    if (success) {
                        successCount++;
                        this.credentials = this.credentials.filter(c => !UUIDsEqual(c.ID, credId))
                    } else {
                        failCount++;
                    }
                } catch {
                    failCount++;
                }
            }
        }

        this.clearSelection();
        this.applyFilters();

        if (successCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `${successCount} credential(s) deleted${failCount > 0 ? `, ${failCount} failed` : ''}`,
                failCount > 0 ? 'warning' : 'success',
                3000
            );
        } else {
            MJNotificationService.Instance.CreateSimpleNotification('Failed to delete credentials', 'error', 3000);
        }
    }
}
