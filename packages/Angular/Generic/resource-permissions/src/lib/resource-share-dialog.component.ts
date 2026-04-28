import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    RESOURCE_SHARE_LEVELS,
    ResourceShareAdapter,
    ResourceShareContext,
    ResourceShareLevel,
    ResourceSharePermissionModel
} from './resource-share-adapter';

/**
 * Result emitted when {@link GenericShareDialogComponent} closes.
 */
export interface ResourceShareDialogResult {
    Action: 'save' | 'cancel';
}

/**
 * Resource-type-agnostic share dialog. Every resource's sharing UX collapses to
 * three tiers — View / Edit / Owner — so the dialog exposes a single level
 * selector per grantee rather than a grab bag of `Can*` checkboxes. Adapters
 * translate the level to whatever shape their backing entity actually persists.
 */
@Component({
    standalone: false,
    selector: 'mj-resource-share-dialog',
    templateUrl: './resource-share-dialog.component.html',
    styleUrls: ['./resource-share-dialog.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class GenericShareDialogComponent implements OnChanges {
    @Input() Visible = false;
    @Input() Context: ResourceShareContext | null = null;
    @Input() Adapter: ResourceShareAdapter | null = null;
    @Output() Result = new EventEmitter<ResourceShareDialogResult>();

    public readonly Levels = RESOURCE_SHARE_LEVELS;

    public UserShares: ResourceSharePermissionModel[] = [];
    public AvailableUsers: MJUserEntity[] = [];
    private allUsers: MJUserEntity[] = [];

    public IsLoading = false;
    public Error: string | null = null;
    public UserSearchFilter = '';

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Visible'] && this.Visible && this.Context && this.Adapter) {
            this.resetDialog();
            this.loadData();
        }
    }

    private resetDialog(): void {
        this.Error = null;
        this.IsLoading = false;
        this.UserShares = [];
        this.AvailableUsers = [];
        this.UserSearchFilter = '';
    }

    private async loadData(): Promise<void> {
        if (!this.Context || !this.Adapter) return;

        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = new RunView();
            const usersResult = await rv.RunView<MJUserEntity>({
                EntityName: 'MJ: Users',
                ExtraFilter: 'IsActive = 1',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });
            this.allUsers = usersResult.Success ? usersResult.Results : [];

            this.UserShares = await this.Adapter.LoadShares(this.Context);
            this.UserShares.forEach((s) => (s._InitialLevel = s.Level));
            this.updateAvailableUsers();
        } catch (error) {
            console.error('Error loading share data:', error);
            this.Error = 'Failed to load sharing data. Please try again.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private updateAvailableUsers(): void {
        if (!this.Context) return;
        const sharedUserIds = new Set(
            this.UserShares.filter((s) => !s.MarkedForRemoval).map((s) => s.User.ID)
        );
        const ownerId = this.Context.OwnerUserID;
        this.AvailableUsers = this.allUsers.filter((user) => {
            if (ownerId && UUIDsEqual(user.ID, ownerId)) return false;
            return !sharedUserIds.has(user.ID);
        });
    }

    public get FilteredAvailableUsers(): MJUserEntity[] {
        if (!this.UserSearchFilter.trim()) {
            return this.AvailableUsers.slice(0, 10);
        }
        const filter = this.UserSearchFilter.toLowerCase();
        return this.AvailableUsers
            .filter((u) => u.Name.toLowerCase().includes(filter) || (u.Email && u.Email.toLowerCase().includes(filter)))
            .slice(0, 10);
    }

    public get HasChanges(): boolean {
        return this.UserShares.some(
            (s) => s.IsNew || s.MarkedForRemoval || s.Level !== s._InitialLevel
        );
    }

    public get ActiveShares(): ResourceSharePermissionModel[] {
        return this.UserShares.filter((s) => !s.MarkedForRemoval);
    }

    public get RemovedShares(): ResourceSharePermissionModel[] {
        return this.UserShares.filter((s) => s.MarkedForRemoval);
    }

    /** Highlight rows whose level has been changed from their loaded state. */
    public isModified(share: ResourceSharePermissionModel): boolean {
        return !share.IsNew && share.Level !== share._InitialLevel;
    }

    public async addUserShare(user: MJUserEntity): Promise<void> {
        if (!this.Context || !this.Adapter) return;
        const row = await this.Adapter.CreateShare(this.Context, user);
        row._InitialLevel = row.Level;
        this.UserShares.push(row);
        this.updateAvailableUsers();
        this.UserSearchFilter = '';
        this.cdr.detectChanges();
    }

    public removeUserShare(share: ResourceSharePermissionModel): void {
        if (share.IsNew) {
            this.UserShares = this.UserShares.filter((s) => s !== share);
        } else {
            share.MarkedForRemoval = true;
        }
        this.updateAvailableUsers();
        this.cdr.detectChanges();
    }

    public undoRemove(share: ResourceSharePermissionModel): void {
        share.MarkedForRemoval = false;
        this.updateAvailableUsers();
        this.cdr.detectChanges();
    }

    public setLevel(share: ResourceSharePermissionModel, level: ResourceShareLevel): void {
        share.Level = level;
        this.cdr.detectChanges();
    }

    public async onSave(): Promise<void> {
        if (!this.Adapter || !this.Context) return;
        if (!this.HasChanges) {
            this.onCancel();
            return;
        }
        this.IsLoading = true;
        this.Error = null;
        this.cdr.detectChanges();

        try {
            for (const share of this.UserShares.filter((s) => s.MarkedForRemoval && !s.IsNew)) {
                const deleted = await share.PermissionEntity.Delete();
                if (!deleted) {
                    throw new Error(
                        `Failed to remove share for ${share.User.Name}: ${
                            share.PermissionEntity.LatestResult?.Message ?? 'unknown error'
                        }`
                    );
                }
            }

            const dirtyRows = this.UserShares.filter(
                (s) => !s.MarkedForRemoval && (s.IsNew || s.Level !== s._InitialLevel)
            );
            for (const share of dirtyRows) {
                this.Adapter.SyncLevelToEntity(share);
                const saved = await share.PermissionEntity.Save();
                if (!saved) {
                    throw new Error(
                        `Failed to save share for ${share.User.Name}: ${
                            share.PermissionEntity.LatestResult?.Message ?? 'unknown error'
                        }`
                    );
                }
            }

            if (this.Adapter.AfterSave) {
                await this.Adapter.AfterSave(this.Context);
            }

            this.Result.emit({ Action: 'save' });
        } catch (error) {
            console.error('Error saving shares:', error);
            this.Error = error instanceof Error ? error.message : 'Failed to save sharing settings.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    public onCancel(): void {
        this.Result.emit({ Action: 'cancel' });
    }

    public getUserInitials(user: MJUserEntity): string {
        const name = user.Name || user.Email || '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
}
