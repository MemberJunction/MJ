import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
    RESOURCE_SHARE_LEVELS,
    ResourceShareAdapter,
    ResourceShareContext,
    ResourceShareGrant,
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
export class GenericShareDialogComponent extends BaseAngularComponent implements OnChanges {
    @Input() Visible = false;
    /** The single resource being shared. Ignored when `Contexts` is supplied. */
    @Input() Context: ResourceShareContext | null = null;
    /** Several resources to share at once; every action applies to all of them. */
    @Input() Contexts: ResourceShareContext[] | null = null;
    @Input() Adapter: ResourceShareAdapter | null = null;
    /** Singular noun for the title when sharing several ("3 conversations"). */
    @Input() ResourceLabel = 'item';
    /** Optional line shown above the dialog body — e.g. what the caller left out. */
    @Input() Notice: string | null = null;
    @Output() Result = new EventEmitter<ResourceShareDialogResult>();

    public readonly Levels = RESOURCE_SHARE_LEVELS;

    public Grants: ResourceShareGrant[] = [];
    public AvailableUsers: MJUserEntity[] = [];
    private allUsers: MJUserEntity[] = [];

    public IsLoading = false;
    public Error: string | null = null;
    public UserSearchFilter = '';

    /** Every resource this dialog is operating on. */
    public get ActiveContexts(): ResourceShareContext[] {
        if (this.Contexts && this.Contexts.length > 0) return this.Contexts;
        return this.Context ? [this.Context] : [];
    }

    /** The resource whose owner row is shown — only meaningful for a single resource. */
    public get PrimaryContext(): ResourceShareContext | null {
        const contexts = this.ActiveContexts;
        return contexts.length === 1 ? contexts[0] : null;
    }

    public get Title(): string {
        const contexts = this.ActiveContexts;
        if (contexts.length === 1) return `Share "${contexts[0].ResourceName}"`;
        return `Share ${contexts.length} ${this.ResourceLabel}s`;
    }

    /** Message for the no-results empty-state, echoing the current search term. */
    public get NoUsersFoundMessage(): string {
        return `No users found matching "${this.UserSearchFilter}"`;
    }

    constructor(private cdr: ChangeDetectorRef) {
        super();}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Visible'] && this.Visible && this.ActiveContexts.length > 0 && this.Adapter) {
            this.resetDialog();
            void this.Reload();
        }
    }

    private resetDialog(): void {
        this.Error = null;
        this.IsLoading = false;
        this.Grants = [];
        this.AvailableUsers = [];
        this.UserSearchFilter = '';
    }

    /** Loads the people list and every resource's existing shares, merged per person. */
    public async Reload(): Promise<void> {
        const contexts = this.ActiveContexts;
        if (contexts.length === 0 || !this.Adapter) return;

        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            await this.loadUsers();
            const perResource = await Promise.all(contexts.map((ctx) => this.Adapter!.LoadShares(ctx)));
            this.Grants = this.mergeIntoGrants(contexts, perResource);
            this.updateAvailableUsers();
        } catch (error) {
            console.error('Error loading share data:', error);
            this.Error = 'Failed to load sharing data. Please try again.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private async loadUsers(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const usersResult = await rv.RunView<MJUserEntity>({
            EntityName: 'MJ: Users',
            ExtraFilter: 'IsActive = 1',
            OrderBy: 'Name',
            ResultType: 'entity_object'
        });
        this.allUsers = usersResult.Success ? usersResult.Results : [];
    }

    /** One grant per person, carrying their row on each resource that has one. */
    private mergeIntoGrants(
        contexts: ResourceShareContext[],
        perResource: ResourceSharePermissionModel[][]
    ): ResourceShareGrant[] {
        const byUser = new Map<string, ResourceShareGrant>();

        perResource.forEach((rows, index) => {
            const resourceId = contexts[index].ResourceID;
            for (const row of rows) {
                row._InitialLevel = row.Level;
                const key = row.UserID.toLowerCase();
                const grant = byUser.get(key) ?? {
                    User: row.User,
                    UserID: row.UserID,
                    Rows: new Map<string, ResourceSharePermissionModel>(),
                    InitialLevel: row.Level,
                    Level: row.Level,
                    LevelTouched: false,
                    IsNew: false,
                    MarkedForRemoval: false
                };
                grant.Rows.set(resourceId, row);
                if (grant.InitialLevel !== row.Level) {
                    grant.InitialLevel = null; // levels differ across resources
                }
                byUser.set(key, grant);
            }
        });

        // A person on some but not all resources has no single level to show either.
        for (const grant of byUser.values()) {
            grant.Level = grant.InitialLevel ?? 'View';
        }
        return Array.from(byUser.values());
    }

    /** Everyone who isn't the owner and doesn't already hold a (live) grant. */
    private updateAvailableUsers(): void {
        const sharedUserIds = new Set(
            this.Grants.filter((g) => !g.MarkedForRemoval).map((g) => g.User.ID)
        );
        const ownerId = this.PrimaryContext?.OwnerUserID ?? null;
        this.AvailableUsers = this.allUsers.filter((user) => {
            if (ownerId && UUIDsEqual(user.ID, ownerId)) return false;
            return !sharedUserIds.has(user.ID);
        });
    }

    /** The first ten matches for the search box, or the first ten people. */
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
        return this.Grants.some((g) => g.IsNew || g.MarkedForRemoval || g.LevelTouched);
    }

    public get ActiveShares(): ResourceShareGrant[] {
        return this.Grants.filter((g) => !g.MarkedForRemoval);
    }

    public get RemovedShares(): ResourceShareGrant[] {
        return this.Grants.filter((g) => g.MarkedForRemoval);
    }

    /** Highlight grants whose level has been changed from their loaded state. */
    public isModified(grant: ResourceShareGrant): boolean {
        return !grant.IsNew && grant.LevelTouched;
    }

    /** A level button lights up only when the grant has one level to show. */
    public isLevelActive(grant: ResourceShareGrant, level: ResourceShareLevel): boolean {
        if (!grant.LevelTouched && grant.InitialLevel === null && !grant.IsNew) return false;
        return grant.Level === level;
    }

    /**
     * Why a grant does not simply read as "everyone, one level": levels that
     * differ across resources, or access held on only some of them.
     */
    public scopeLabel(grant: ResourceShareGrant): string {
        if (grant.IsNew || this.ActiveContexts.length < 2) return '';
        const parts: string[] = [];
        if (!grant.LevelTouched && grant.InitialLevel === null) parts.push('Mixed');
        if (grant.Rows.size < this.ActiveContexts.length) {
            parts.push(`${grant.Rows.size} of ${this.ActiveContexts.length}`);
        }
        return parts.join(' · ');
    }

    /** Adds a person, to every resource the dialog is sharing. */
    public async addUserShare(user: MJUserEntity): Promise<void> {
        if (this.ActiveContexts.length === 0 || !this.Adapter) return;
        this.Grants = [
            ...this.Grants,
            {
                User: user,
                UserID: user.ID,
                Rows: new Map<string, ResourceSharePermissionModel>(),
                InitialLevel: null,
                Level: 'View',
                LevelTouched: false,
                IsNew: true,
                MarkedForRemoval: false
            }
        ];
        this.updateAvailableUsers();
        this.UserSearchFilter = '';
        this.cdr.detectChanges();
    }

    public removeUserShare(grant: ResourceShareGrant): void {
        if (grant.IsNew) {
            this.Grants = this.Grants.filter((g) => g !== grant);
        } else {
            grant.MarkedForRemoval = true;
        }
        this.updateAvailableUsers();
        this.cdr.detectChanges();
    }

    public undoRemove(grant: ResourceShareGrant): void {
        grant.MarkedForRemoval = false;
        this.updateAvailableUsers();
        this.cdr.detectChanges();
    }

    /** Sets one level for the person across every resource, filling in any gaps. */
    public setLevel(grant: ResourceShareGrant, level: ResourceShareLevel): void {
        grant.Level = level;
        grant.LevelTouched = true;
        this.cdr.detectChanges();
    }

    public async onSave(): Promise<void> {
        const contexts = this.ActiveContexts;
        if (!this.Adapter || contexts.length === 0) return;
        if (!this.HasChanges) {
            this.onCancel();
            return;
        }
        this.IsLoading = true;
        this.Error = null;
        this.cdr.detectChanges();

        try {
            for (const grant of this.Grants.filter((g) => g.MarkedForRemoval && !g.IsNew)) {
                await this.withdrawGrant(grant);
            }
            for (const grant of this.Grants.filter((g) => !g.MarkedForRemoval && (g.IsNew || g.LevelTouched))) {
                await this.applyGrant(grant, contexts);
            }

            if (this.Adapter.AfterSave) {
                for (const context of contexts) {
                    await this.Adapter.AfterSave(context);
                }
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

    /** Withdraws a person's access from every resource that granted it. */
    private async withdrawGrant(grant: ResourceShareGrant): Promise<void> {
        for (const row of grant.Rows.values()) {
            const deleted = await row.PermissionEntity.Delete();
            if (!deleted) {
                throw new Error(
                    `Failed to remove share for ${grant.User.Name}: ${
                        row.PermissionEntity.LatestResult?.Message ?? 'unknown error'
                    }`
                );
            }
        }
    }

    /**
     * Writes the grant's level to every resource, creating a permission row for
     * the ones this person did not already have access to.
     */
    private async applyGrant(grant: ResourceShareGrant, contexts: ResourceShareContext[]): Promise<void> {
        for (const context of contexts) {
            let row = grant.Rows.get(context.ResourceID);
            if (!row) {
                row = await this.Adapter!.CreateShare(context, grant.User);
                row._InitialLevel = row.Level;
                grant.Rows.set(context.ResourceID, row);
            } else if (!grant.LevelTouched) {
                continue; // nothing changed for this resource
            }

            row.Level = grant.Level;
            this.Adapter!.SyncLevelToEntity(row);
            const saved = await row.PermissionEntity.Save();
            if (!saved) {
                throw new Error(
                    `Failed to save share for ${grant.User.Name}: ${
                        row.PermissionEntity.LatestResult?.Message ?? 'unknown error'
                    }`
                );
            }
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
