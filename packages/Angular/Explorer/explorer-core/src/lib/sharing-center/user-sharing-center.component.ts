import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    BaseEntity,
    CompositeKey,
    LogError,
    Metadata,
    NormalizedPermission,
    PermissionAction,
} from '@memberjunction/core';
import { PermissionEngine } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { MJDialogAction, MJDialogRef, MJDialogService } from '@memberjunction/ng-ui-components';
import { NavigationService } from '@memberjunction/ng-shared';

import { ResourceNavigationService } from './resource-navigation.service';

type Tab = 'shared-with-me' | 'shared-by-me';

interface DomainGroup {
    DomainName: string;
    Icon: string;
    Rows: NormalizedPermission[];
    Expanded: boolean;
}

// Domain → Font Awesome class is owned by `@memberjunction/core-entities` so the
// admin Permissions app and this end-user Sharing Center stay in sync automatically.

/**
 * End-user Sharing Center dialog — opened from the avatar menu.
 * Two tabs:
 *  - "Shared with me": every resource the current user has been granted direct
 *    (non-role) access to, grouped by permission domain. Rows are clickable and
 *    delegate to {@link ResourceNavigationService} for navigation.
 *  - "Shared by me": every permission record where the current user is the grantor.
 *    Rows can be revoked, which deletes the underlying permission record through
 *    Metadata → GetEntityObject → Delete.
 *
 * Distinct from the admin "Permissions" application: that dashboard is for admins
 * inspecting any user's access; this dialog is scoped to the current user.
 */
@Component({
    standalone: true,
    selector: 'mj-user-sharing-center',
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './user-sharing-center.component.html',
    styleUrls: ['./user-sharing-center.component.css'],
})
export class UserSharingCenterComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private dialogRef = inject(MJDialogRef, { optional: true });
    private navigationService = inject(NavigationService);
    private dialogService = inject(MJDialogService);

    private resourceNav: ResourceNavigationService = this.createResourceNav();

    ActiveTab: Tab = 'shared-with-me';

    SharedWithMe: DomainGroup[] = [];
    SharedByMe: DomainGroup[] = [];

    IsLoadingWithMe = false;
    IsLoadingByMe = false;

    ErrorMessage: string | null = null;

    async ngOnInit(): Promise<void> {
        await this.loadSharedWithMe();
    }

    private createResourceNav(): ResourceNavigationService {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<ResourceNavigationService>(
            ResourceNavigationService,
            ResourceNavigationService.name
        ) ?? new ResourceNavigationService();
        instance.Initialize(this.navigationService);
        return instance;
    }

    async OnTabClick(tab: Tab): Promise<void> {
        if (this.ActiveTab === tab) return;
        this.ActiveTab = tab;
        if (tab === 'shared-with-me' && this.SharedWithMe.length === 0 && !this.IsLoadingWithMe) {
            await this.loadSharedWithMe();
        } else if (tab === 'shared-by-me' && this.SharedByMe.length === 0 && !this.IsLoadingByMe) {
            await this.loadSharedByMe();
        }
    }

    private async loadSharedWithMe(): Promise<void> {
        const user = new Metadata().CurrentUser;
        if (!user) return;

        this.IsLoadingWithMe = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();
        try {
            const rows = await PermissionEngine.Instance.GetPermissionsSharedWithUser(user);
            this.SharedWithMe = this.groupByDomain(rows);
        } catch (e) {
            this.ErrorMessage = `Failed to load shares: ${e instanceof Error ? e.message : String(e)}`;
            LogError(this.ErrorMessage);
        }
        this.IsLoadingWithMe = false;
        this.cdr.detectChanges();
    }

    private async loadSharedByMe(): Promise<void> {
        const user = new Metadata().CurrentUser;
        if (!user) return;

        this.IsLoadingByMe = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();
        try {
            const rows = await PermissionEngine.Instance.GetPermissionsGrantedByUser(user);
            this.SharedByMe = this.groupByDomain(rows);
        } catch (e) {
            this.ErrorMessage = `Failed to load grants: ${e instanceof Error ? e.message : String(e)}`;
            LogError(this.ErrorMessage);
        }
        this.IsLoadingByMe = false;
        this.cdr.detectChanges();
    }

    private groupByDomain(rows: NormalizedPermission[]): DomainGroup[] {
        const bucket = new Map<string, NormalizedPermission[]>();
        for (const r of rows) {
            const list = bucket.get(r.DomainName) ?? [];
            list.push(r);
            bucket.set(r.DomainName, list);
        }
        const groups: DomainGroup[] = [];
        for (const [domainName, list] of bucket) {
            groups.push({
                DomainName: domainName,
                Icon: PermissionEngine.DomainIconFor(domainName),
                Rows: list.sort((a, b) => (a.ResourceName ?? '').localeCompare(b.ResourceName ?? '')),
                Expanded: list.length <= 10,
            });
        }
        // Sort domains alphabetically for consistency; admin dashboard uses the
        // catalog's DisplayOrder, but here we want a stable, predictable list.
        return groups.sort((a, b) => a.DomainName.localeCompare(b.DomainName));
    }

    ToggleGroup(group: DomainGroup): void {
        group.Expanded = !group.Expanded;
        this.cdr.detectChanges();
    }

    ActionsLabel(actions: PermissionAction[]): string {
        return actions.join(', ');
    }

    async OnRowClick(row: NormalizedPermission): Promise<void> {
        const opened = this.resourceNav.OpenResource(row);
        if (opened) {
            this.dialogRef?.Close();
        }
    }

    /**
     * Revoke a permission the current user granted. Confirms through MJDialogService
     * (no native window.confirm), then deletes the underlying permission record via
     * the entity's Delete() — going through BaseEntity so audit (RecordChange)
     * captures the revoke and the relevant engine cache is invalidated. After a
     * successful delete we refetch the tab's data to reflect the change.
     */
    async OnRevoke(row: NormalizedPermission, event: Event): Promise<void> {
        event.stopPropagation(); // don't navigate on the containing row
        if (!row.SourceRecordID) return;

        const entityName = this.sharingEntityName(row.DomainName);
        if (!entityName) return;

        const confirmed = await this.confirmRevoke(row);
        if (!confirmed) return;

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>(entityName);
            const key = new CompositeKey();
            key.KeyValuePairs.push({ FieldName: 'ID', Value: row.SourceRecordID });
            const loaded = await entity.InnerLoad(key);
            if (!loaded) {
                this.ErrorMessage = 'Could not load the permission record.';
                this.cdr.detectChanges();
                return;
            }
            const deleted = await entity.Delete();
            if (!deleted) {
                this.ErrorMessage = `Revoke failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`;
                this.cdr.detectChanges();
                return;
            }
            await this.loadSharedByMe();
        } catch (e) {
            this.ErrorMessage = `Revoke failed: ${e instanceof Error ? e.message : String(e)}`;
            this.cdr.detectChanges();
        }
    }

    private confirmRevoke(row: NormalizedPermission): Promise<boolean> {
        const resourceLabel = row.ResourceName ? `"${row.ResourceName}"` : 'this resource';
        const granteeLabel = row.GranteeName ?? 'this user';
        const message = `Revoke access to ${resourceLabel} for ${granteeLabel}? This cannot be undone.`;

        return new Promise<boolean>((resolve) => {
            const ref = this.dialogService.open({
                title: 'Revoke access',
                content: message,
                actions: [
                    { text: 'Revoke', primary: true, themeColor: 'error' },
                    { text: 'Cancel', primary: false },
                ],
                width: 420,
                minWidth: 300,
            });

            ref.Result.subscribe((result) => {
                const action = result as MJDialogAction | undefined;
                resolve(!!action && 'text' in action && action.text === 'Revoke');
            });
        });
    }

    private sharingEntityName(domainName: string): string | null {
        switch (domainName) {
            case 'Dashboard Permissions':
                return 'MJ: Dashboard Permissions';
            case 'Artifact Permissions':
                return 'MJ: Artifact Permissions';
            case 'Collection Permissions':
                return 'MJ: Collection Permissions';
            case 'Access Control Rules':
                return 'MJ: Access Control Rules';
            default:
                return null;
        }
    }

    OnClose(): void {
        this.dialogRef?.Close();
    }

    TrackByDomain(_idx: number, g: DomainGroup): string {
        return g.DomainName;
    }

    TrackByRow(_idx: number, r: NormalizedPermission): string {
        return r.SourceRecordID ?? `${r.DomainName}|${r.ResourceID ?? ''}|${r.GranteeID ?? ''}`;
    }
}
