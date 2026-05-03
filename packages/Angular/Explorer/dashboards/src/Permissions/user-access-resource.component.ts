import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Metadata, NormalizedPermission, PermissionAction } from '@memberjunction/core';
import { PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

import {
    PermissionsDomainGroup,
    PermissionsUserOption,
    groupPermissionsByDomain,
    loadPermissionsUsers,
    resolvePermissionsUser,
} from './permissions-shared';

/**
 * User Access Report resource — one of three tabs in the Permissions admin application.
 * Lets an admin pick any user and see every resource that user has access to across
 * every registered permission domain. Powered by `PermissionEngine.GetAllUserPermissions`.
 */
@RegisterClass(BaseResourceComponent, 'PermissionsUserAccessResource')
@Component({
    standalone: false,
    selector: 'mj-permissions-user-access-resource',
    templateUrl: './user-access-resource.component.html',
    styleUrls: ['./permissions-resource.component.css'],
})
export class PermissionsUserAccessResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    Users: PermissionsUserOption[] = [];
    SelectedUserId: string | null = null;
    SelectedUserRoles: string[] = [];
    DomainGroups: PermissionsDomainGroup[] = [];
    IsLoadingUsers = true;
    IsLoadingPermissions = false;
    ErrorMessage: string | null = null;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'User Access Report';
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-user';
    }

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        await this.loadUsers();
        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    async loadUsers(): Promise<void> {
        this.IsLoadingUsers = true;
        this.ErrorMessage = null;
        try {
            this.Users = await loadPermissionsUsers();
            const md = this.ProviderToUse;
            this.SelectedUserId = md.CurrentUser?.ID ?? null;
            if (this.SelectedUserId) {
                await this.loadPermissionsForSelectedUser();
            }
        } catch (e) {
            this.ErrorMessage = `Error loading users: ${e instanceof Error ? e.message : String(e)}`;
        }
        this.IsLoadingUsers = false;
        this.cdr.detectChanges();
    }

    async OnUserChanged(userId: string): Promise<void> {
        this.SelectedUserId = userId;
        await this.loadPermissionsForSelectedUser();
    }

    private async loadPermissionsForSelectedUser(): Promise<void> {
        this.IsLoadingPermissions = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const user = await resolvePermissionsUser(this.SelectedUserId!, this.Users);
            if (!user) {
                this.ErrorMessage = 'Could not load roles for the selected user.';
                this.DomainGroups = [];
                this.IsLoadingPermissions = false;
                this.cdr.detectChanges();
                return;
            }

            this.SelectedUserRoles = (user.UserRoles ?? []).map((ur) => ur.Role).filter((n): n is string => !!n);
            const rows = await PermissionEngine.Instance.GetAllUserPermissions(user);
            const orderMap = new Map<string, number>();
            for (const d of PermissionEngine.Instance.Domains) {
                orderMap.set(d.Name, d.DisplayOrder ?? 999);
            }
            this.DomainGroups = groupPermissionsByDomain(rows, orderMap);
        } catch (e) {
            this.ErrorMessage = `Error loading permissions: ${e instanceof Error ? e.message : String(e)}`;
            this.DomainGroups = [];
        }

        this.IsLoadingPermissions = false;
        this.cdr.detectChanges();
    }

    ToggleGroup(group: PermissionsDomainGroup): void {
        group.Expanded = !group.Expanded;
        this.cdr.detectChanges();
    }

    TrackByDomain(_index: number, group: PermissionsDomainGroup): string {
        return group.DomainName;
    }

    TrackByPermission(_index: number, row: NormalizedPermission): string {
        return row.SourceRecordID ?? `${row.DomainName}|${row.ResourceType}|${row.ResourceID ?? ''}|${row.GranteeID ?? ''}`;
    }

    ActionsLabel(actions: PermissionAction[]): string {
        return actions.join(', ');
    }

    get TotalCount(): number {
        return this.DomainGroups.reduce((sum, g) => sum + g.Count, 0);
    }
}

/** Tree-shaking prevention — referenced from `public-api.ts`. */
export function LoadPermissionsUserAccessResource(): void {
    // intentionally empty
}
