import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { MJDashboardEntity, MJDashboardPermissionEntity, DashboardEngine, MJUserEntity } from '@memberjunction/core-entities';

/**
 * Represents a user share with their permissions
 */
export interface UserSharePermission {
    /** The permission entity (may be new or existing) */
    Permission: MJDashboardPermissionEntity;
    /** The user being shared with */
    User: MJUserEntity;
    /** Whether this is a newly added share */
    IsNew: boolean;
    /** Whether this share has been marked for removal */
    MarkedForRemoval: boolean;
}

/**
 * Result emitted when the dialog is closed
 */
export interface ShareDialogResult {
    /** The action taken: 'save' or 'cancel' */
    Action: 'save' | 'cancel';
    /** The dashboard that was shared (only on save) */
    Dashboard?: MJDashboardEntity;
}

/**
 * Dialog component for sharing dashboards with other users.
 * Allows setting granular permissions (CanRead, CanEdit, CanDelete, CanShare).
 */
@Component({
  standalone: false,
    selector: 'mj-dashboard-share-dialog',
    templateUrl: './dashboard-share-dialog.component.html',
    styleUrls: ['./dashboard-share-dialog.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class DashboardShareDialogComponent implements OnChanges {
    @Input() Visible = false;
    @Input() Dashboard: MJDashboardEntity | null = null;
    @Output() Result = new EventEmitter<ShareDialogResult>();

    /** Current shares for this dashboard */
    public UserShares: UserSharePermission[] = [];

    /** All available users for sharing (excludes owner and already shared) */
    public AvailableUsers: MJUserEntity[] = [];

    /** All users in the system */
    private allUsers: MJUserEntity[] = [];

    /** Loading state */
    public IsLoading = false;

    /** Error message to display */
    public Error: string | null = null;

    /** Search filter for available users */
    public UserSearchFilter = '';

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Visible'] && this.Visible && this.Dashboard) {
            this.resetDialog();
            this.loadData();
        }
    }

    /**
     * Reset dialog state
     */
    private resetDialog(): void {
        this.Error = null;
        this.IsLoading = false;
        this.UserShares = [];
        this.AvailableUsers = [];
        this.UserSearchFilter = '';
    }

    /**
     * Load existing shares and available users
     */
    private async loadData(): Promise<void> {
        if (!this.Dashboard) return;

        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const rv = new RunView();

            // Load all users
            const usersResult = await rv.RunView<MJUserEntity>({
                EntityName: 'MJ: Users',
                ExtraFilter: "IsActive = 1",
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });

            if (usersResult.Success) {
                this.allUsers = usersResult.Results;
            }

            // Get existing shares from DashboardEngine
            const existingShares = DashboardEngine.Instance.GetDashboardShares(this.Dashboard.ID);

            // Build user shares list
            this.UserShares = [];
            for (const permission of existingShares) {
                const user = this.allUsers.find(u => u.ID === permission.UserID);
                if (user) {
                    this.UserShares.push({
                        Permission: permission,
                        User: user,
                        IsNew: false,
                        MarkedForRemoval: false
                    });
                }
            }

            // Update available users
            this.updateAvailableUsers();

        } catch (error) {
            console.error('Error loading share data:', error);
            this.Error = 'Failed to load sharing data. Please try again.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Update the list of available users (excludes owner and already shared)
     */
    private updateAvailableUsers(): void {
        if (!this.Dashboard) return;

        const sharedUserIds = new Set(
            this.UserShares
                .filter(s => !s.MarkedForRemoval)
                .map(s => s.User.ID)
        );

        // Exclude dashboard owner and already shared users
        this.AvailableUsers = this.allUsers.filter(user =>
            user.ID !== this.Dashboard!.UserID && !sharedUserIds.has(user.ID)
        );
    }

    /**
     * Get filtered available users based on search
     */
    public get FilteredAvailableUsers(): MJUserEntity[] {
        if (!this.UserSearchFilter.trim()) {
            return this.AvailableUsers.slice(0, 10); // Show first 10 by default
        }

        const filter = this.UserSearchFilter.toLowerCase();
        return this.AvailableUsers
            .filter(user =>
                user.Name.toLowerCase().includes(filter) ||
                (user.Email && user.Email.toLowerCase().includes(filter))
            )
            .slice(0, 10);
    }

    /**
     * Check if there are unsaved changes
     */
    public get HasChanges(): boolean {
        return this.UserShares.some(s => s.IsNew || s.MarkedForRemoval || s.Permission.Dirty);
    }

    /**
     * Add a user to the share list
     */
    public async addUserShare(user: MJUserEntity): Promise<void> {
        if (!this.Dashboard) return;

        const md = new Metadata();
        const permission = await md.GetEntityObject<MJDashboardPermissionEntity>('MJ: Dashboard Permissions');
        permission.NewRecord();
        permission.DashboardID = this.Dashboard.ID;
        permission.UserID = user.ID;
        permission.CanRead = true;  // Default to read access
        permission.CanEdit = false;
        permission.CanDelete = false;
        permission.CanShare = false;

        this.UserShares.push({
            Permission: permission,
            User: user,
            IsNew: true,
            MarkedForRemoval: false
        });

        this.updateAvailableUsers();
        this.UserSearchFilter = '';
        this.cdr.detectChanges();
    }

    /**
     * Mark a share for removal
     */
    public removeUserShare(share: UserSharePermission): void {
        if (share.IsNew) {
            // If it's new, just remove from the array
            this.UserShares = this.UserShares.filter(s => s !== share);
        } else {
            // Otherwise mark for removal
            share.MarkedForRemoval = true;
        }

        this.updateAvailableUsers();
        this.cdr.detectChanges();
    }

    /**
     * Undo removal of a share
     */
    public undoRemove(share: UserSharePermission): void {
        share.MarkedForRemoval = false;
        this.updateAvailableUsers();
        this.cdr.detectChanges();
    }

    /**
     * Get shares that are not marked for removal
     */
    public get ActiveShares(): UserSharePermission[] {
        return this.UserShares.filter(s => !s.MarkedForRemoval);
    }

    /**
     * Get shares marked for removal
     */
    public get RemovedShares(): UserSharePermission[] {
        return this.UserShares.filter(s => s.MarkedForRemoval);
    }

    /**
     * Toggle CanEdit permission (also enables CanRead)
     */
    public toggleCanEdit(share: UserSharePermission): void {
        share.Permission.CanEdit = !share.Permission.CanEdit;
        if (share.Permission.CanEdit) {
            share.Permission.CanRead = true;
        }
        this.cdr.detectChanges();
    }

    /**
     * Toggle CanDelete permission (also enables CanRead and CanEdit)
     */
    public toggleCanDelete(share: UserSharePermission): void {
        share.Permission.CanDelete = !share.Permission.CanDelete;
        if (share.Permission.CanDelete) {
            share.Permission.CanRead = true;
            share.Permission.CanEdit = true;
        }
        this.cdr.detectChanges();
    }

    /**
     * Toggle CanShare permission (also enables CanRead)
     */
    public toggleCanShare(share: UserSharePermission): void {
        share.Permission.CanShare = !share.Permission.CanShare;
        if (share.Permission.CanShare) {
            share.Permission.CanRead = true;
        }
        this.cdr.detectChanges();
    }

    /**
     * Save all permission changes
     */
    public async onSave(): Promise<void> {
        if (!this.HasChanges) {
            this.onCancel();
            return;
        }

        this.IsLoading = true;
        this.Error = null;
        this.cdr.detectChanges();

        try {
            // Process removals first
            for (const share of this.UserShares.filter(s => s.MarkedForRemoval && !s.IsNew)) {
                const deleted = await share.Permission.Delete();
                if (!deleted) {
                    throw new Error(`Failed to remove share for ${share.User.Name}`);
                }
            }

            // Process new and modified shares
            for (const share of this.UserShares.filter(s => !s.MarkedForRemoval && (s.IsNew || s.Permission.Dirty))) {
                const saved = await share.Permission.Save();
                if (!saved) {
                    throw new Error(`Failed to save share for ${share.User.Name}: ${share.Permission.LatestResult?.Message}`);
                }
            }

            // Refresh the engine cache
            await DashboardEngine.Instance.Config(true);

            this.Result.emit({
                Action: 'save',
                Dashboard: this.Dashboard!
            });

        } catch (error) {
            console.error('Error saving shares:', error);
            this.Error = error instanceof Error ? error.message : 'Failed to save sharing settings.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Cancel and close the dialog
     */
    public onCancel(): void {
        this.Result.emit({ Action: 'cancel' });
    }

    /**
     * Get initials for a user (for avatar display)
     */
    public getUserInitials(user: MJUserEntity): string {
        const name = user.Name || user.Email || '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
}
