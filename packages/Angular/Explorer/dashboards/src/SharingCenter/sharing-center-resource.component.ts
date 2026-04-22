import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import {
    Metadata,
    NormalizedPermission,
    PermissionAction,
    RunView,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import { MJPermissionDomainEntity, PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

interface UserOption {
    ID: string;
    Name: string;
    Email: string;
}

interface DomainGroup {
    DomainName: string;
    Icon: string;
    Count: number;
    Expanded: boolean;
    Rows: NormalizedPermission[];
}

const DOMAIN_ICONS: Record<string, string> = {
    'Entity Permissions': 'fa-solid fa-database',
    'Application Roles': 'fa-solid fa-shield-alt',
    'Dashboard Permissions': 'fa-solid fa-chart-line',
    'Resource Permissions': 'fa-solid fa-share-nodes',
    'Artifact Permissions': 'fa-solid fa-file-lines',
    'Collection Permissions': 'fa-solid fa-folder-open',
    'AI Agent Permissions': 'fa-solid fa-robot',
    'Query Permissions': 'fa-solid fa-magnifying-glass',
    'Access Control Rules': 'fa-solid fa-lock',
};

type TabName = 'UserAccess' | 'ResourceAccess';

/**
 * Sharing Center dashboard. Two tabs:
 *
 * - **User Access Report** — for an arbitrary user, shows every resource they have access to
 *   across every registered permission domain. Powered by `PermissionEngine.GetAllUserPermissions`.
 * - **Resource Access Report** — for a specific (domain, resource) pair, shows every grantee
 *   and their actions. Powered by `PermissionEngine.GetResourcePermissions`.
 *
 * Audit Log (Phase 2c) is not yet implemented.
 */
@RegisterClass(BaseResourceComponent, 'SharingCenterResource')
@Component({
    standalone: false,
    selector: 'mj-sharing-center-resource',
    templateUrl: './sharing-center-resource.component.html',
    styleUrls: ['./sharing-center-resource.component.css'],
})
export class SharingCenterResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    // Shared state
    ActiveTab: TabName = 'UserAccess';
    ErrorMessage: string | null = null;

    // ---- User Access Report state ----
    Users: UserOption[] = [];
    SelectedUserId: string | null = null;
    SelectedUserRoles: string[] = [];
    UserDomainGroups: DomainGroup[] = [];
    IsLoadingUsers = true;
    IsLoadingUserPermissions = false;

    // ---- Resource Access Report state ----
    Domains: MJPermissionDomainEntity[] = [];
    SelectedDomainName: string | null = null;
    ResourceTypeInput = '';
    ResourceIdInput = '';
    ResourceAccessRows: NormalizedPermission[] = [];
    IsLoadingResourcePermissions = false;
    LastResourceQueryLabel: string | null = null;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Sharing Center';
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-share-nodes';
    }

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        await this.loadUsers();
        this.Domains = PermissionEngine.Instance.Domains;
        if (this.Domains.length > 0) {
            this.SelectedDomainName = this.Domains[0].Name;
        }
        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    SwitchTab(tab: TabName): void {
        this.ActiveTab = tab;
        this.ErrorMessage = null;
        this.cdr.detectChanges();
    }

    // =========================================================================
    // User Access Report
    // =========================================================================

    async loadUsers(): Promise<void> {
        this.IsLoadingUsers = true;
        this.ErrorMessage = null;
        try {
            const rv = new RunView();
            const result = await rv.RunView<UserOption>({
                EntityName: 'MJ: Users',
                Fields: ['ID', 'Name', 'Email'],
                OrderBy: 'Name',
                ResultType: 'simple',
            });
            if (result.Success) {
                this.Users = result.Results ?? [];
                const md = new Metadata();
                this.SelectedUserId = md.CurrentUser?.ID ?? null;
                if (this.SelectedUserId) {
                    await this.loadPermissionsForSelectedUser();
                }
            } else {
                this.ErrorMessage = result.ErrorMessage ?? 'Failed to load users';
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
        this.IsLoadingUserPermissions = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const user = await this.resolveUser(this.SelectedUserId!);
            if (!user) {
                this.ErrorMessage = 'Could not load roles for the selected user.';
                this.UserDomainGroups = [];
                this.IsLoadingUserPermissions = false;
                this.cdr.detectChanges();
                return;
            }

            this.SelectedUserRoles = (user.UserRoles ?? []).map((ur) => ur.Role).filter((n): n is string => !!n);
            const rows = await PermissionEngine.Instance.GetAllUserPermissions(user);
            this.UserDomainGroups = this.groupByDomain(rows);
        } catch (e) {
            this.ErrorMessage = `Error loading permissions: ${e instanceof Error ? e.message : String(e)}`;
            this.UserDomainGroups = [];
        }

        this.IsLoadingUserPermissions = false;
        this.cdr.detectChanges();
    }

    private async resolveUser(userId: string): Promise<UserInfo | null> {
        const md = new Metadata();
        if (md.CurrentUser && UUIDsEqual(md.CurrentUser.ID, userId)) {
            return md.CurrentUser;
        }

        const rv = new RunView();
        const rolesResult = await rv.RunView<{
            ID: string;
            UserID: string;
            RoleID: string;
            Role: string;
        }>({
            EntityName: 'MJ: User Roles',
            ExtraFilter: `UserID='${userId}'`,
            Fields: ['ID', 'UserID', 'RoleID', 'Role'],
            ResultType: 'simple',
        });

        const userInfoLike = this.Users.find((u) => UUIDsEqual(u.ID, userId));
        if (!userInfoLike) return null;

        const userRoles: UserRoleInfo[] = (rolesResult.Results ?? []).map(
            (r) =>
                new UserRoleInfo({
                    ID: r.ID,
                    UserID: r.UserID,
                    RoleID: r.RoleID,
                    Role: r.Role,
                })
        );

        return new UserInfo(undefined, {
            ID: userInfoLike.ID,
            Name: userInfoLike.Name,
            Email: userInfoLike.Email,
            UserRoles: userRoles,
        });
    }

    private groupByDomain(rows: NormalizedPermission[]): DomainGroup[] {
        const bucket = new Map<string, NormalizedPermission[]>();
        for (const row of rows) {
            const list = bucket.get(row.DomainName) ?? [];
            list.push(row);
            bucket.set(row.DomainName, list);
        }

        const groups: DomainGroup[] = [];
        for (const [domainName, list] of bucket) {
            groups.push({
                DomainName: domainName,
                Icon: DOMAIN_ICONS[domainName] ?? 'fa-solid fa-lock',
                Count: list.length,
                Expanded: list.length <= 10,
                Rows: list.sort((a, b) => (a.ResourceName ?? '').localeCompare(b.ResourceName ?? '')),
            });
        }

        // Stable order: use the catalog's DisplayOrder
        const orderMap = new Map<string, number>();
        for (const d of PermissionEngine.Instance.Domains) {
            orderMap.set(d.Name, d.DisplayOrder ?? 999);
        }
        groups.sort((a, b) => (orderMap.get(a.DomainName) ?? 999) - (orderMap.get(b.DomainName) ?? 999));
        return groups;
    }

    ToggleGroup(group: DomainGroup): void {
        group.Expanded = !group.Expanded;
        this.cdr.detectChanges();
    }

    TrackByDomain(_index: number, group: DomainGroup): string {
        return group.DomainName;
    }

    TrackByPermission(_index: number, row: NormalizedPermission): string {
        return row.SourceRecordID ?? `${row.DomainName}|${row.ResourceType}|${row.ResourceID ?? ''}|${row.GranteeID ?? ''}`;
    }

    ActionsLabel(actions: PermissionAction[]): string {
        return actions.join(', ');
    }

    get TotalUserCount(): number {
        return this.UserDomainGroups.reduce((sum, g) => sum + g.Count, 0);
    }

    // =========================================================================
    // Resource Access Report
    // =========================================================================

    async OnLookupResource(): Promise<void> {
        if (!this.SelectedDomainName) {
            this.ErrorMessage = 'Pick a permission domain first.';
            return;
        }
        if (!this.ResourceTypeInput.trim() || !this.ResourceIdInput.trim()) {
            this.ErrorMessage = 'Resource type and resource ID are both required.';
            return;
        }

        this.ErrorMessage = null;
        this.IsLoadingResourcePermissions = true;
        this.ResourceAccessRows = [];
        this.LastResourceQueryLabel = null;
        this.cdr.detectChanges();

        try {
            const rows = await PermissionEngine.Instance.GetResourcePermissions(
                this.SelectedDomainName,
                this.ResourceTypeInput.trim(),
                this.ResourceIdInput.trim()
            );
            this.ResourceAccessRows = rows.sort((a, b) =>
                (a.GranteeName ?? '').localeCompare(b.GranteeName ?? '')
            );
            this.LastResourceQueryLabel = `${this.SelectedDomainName} / ${this.ResourceTypeInput.trim()} / ${this.ResourceIdInput.trim()}`;
        } catch (e) {
            this.ErrorMessage = `Error looking up resource: ${e instanceof Error ? e.message : String(e)}`;
        }

        this.IsLoadingResourcePermissions = false;
        this.cdr.detectChanges();
    }

    OnResourceDomainChanged(domainName: string): void {
        this.SelectedDomainName = domainName;
        this.ResourceAccessRows = [];
        this.LastResourceQueryLabel = null;
        this.cdr.detectChanges();
    }

    TrackByResourceRow(_index: number, row: NormalizedPermission): string {
        return row.SourceRecordID ?? `${row.GranteeType}|${row.GranteeID ?? ''}`;
    }
}

/** Tree-shaking prevention — called from public-api. */
export function LoadSharingCenterResource(): void {
    // intentionally empty
}
