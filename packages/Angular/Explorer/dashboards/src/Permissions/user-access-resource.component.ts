import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Metadata, NormalizedPermission, PermissionAction } from '@memberjunction/core';
import { PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

import { validateStringParam } from '../shared/agent-tool-validation';
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
export class PermissionsUserAccessResourceComponent extends BaseResourceComponent implements OnInit, AfterViewInit, OnDestroy {
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

    ngAfterViewInit(): void {
        this.registerAgentClientTools();
        this.publishAgentContext();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    // ================================================================
    // AI Agent Context & Client Tools
    //
    // 🚨 SAFETY BOUNDARY — READ-ONLY / REVIEW ONLY 🚨
    // User Access Report is a security-sensitive surface that reveals every
    // resource a chosen user can access across all permission domains. The agent
    // context and client tools registered here are strictly READ-ONLY: select a
    // user to review and expand/collapse a domain group. The agent CANNOT grant or
    // revoke permissions, mutate any domain, impersonate the selected user, alter
    // audit records, or bulk-export effective permissions — those operations are
    // DELIBERATELY NOT exposed and must remain human-initiated. Context exposes
    // only the selected user, group/permission counts, and the loading flag.
    // ================================================================

    /**
     * Publish the current user-access state to the AI agent. Re-invoked on every
     * meaningful state change (user selection, permission load, group toggle).
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            SelectedUserId: this.SelectedUserId,
            DomainGroupCount: this.DomainGroups.length,
            TotalPermissionCount: this.TotalCount,
            IsLoadingPermissions: this.IsLoadingPermissions,
        });
    }

    /**
     * Register the read-only / review client tools the agent may invoke. Every
     * Handler is tolerant: validates input and returns
     * `{ Success: false, ErrorMessage }` rather than throwing.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SelectUserForPermissionReview',
                Description:
                    'Select a user and load their effective permissions across all domains for review. Read-only — does not grant, revoke, or impersonate. Requires the user ID.',
                ParameterSchema: {
                    type: 'object',
                    properties: { userId: { type: 'string', description: 'The ID of the user to review' } },
                    required: ['userId'],
                },
                Handler: async (params: Record<string, unknown>) => this.handleSelectUserTool(params),
            },
            {
                Name: 'TogglePermissionDomainGroup',
                Description:
                    'Expand or collapse a permission domain group in the current report. Read-only UI control — does not mutate data. Requires the domain name.',
                ParameterSchema: {
                    type: 'object',
                    properties: { domainName: { type: 'string', description: 'The domain group name to toggle' } },
                    required: ['domainName'],
                },
                Handler: async (params: Record<string, unknown>) => this.handleToggleGroupTool(params),
            },
        ]);
    }

    private async handleSelectUserTool(
        params: Record<string, unknown>
    ): Promise<{ Success: boolean; Data?: unknown; ErrorMessage?: string }> {
        const user = validateStringParam(params?.['userId'], 'userId');
        if (!user.ok) return user.result;
        if (!user.value.trim()) {
            return { Success: false, ErrorMessage: 'userId is required.' };
        }

        const known = this.Users.some((u) => u.ID === user.value.trim());
        if (!known) {
            return { Success: false, ErrorMessage: `Unknown user ID "${user.value.trim()}".` };
        }

        await this.OnUserChanged(user.value.trim());
        this.publishAgentContext();

        if (this.ErrorMessage) {
            return { Success: false, ErrorMessage: this.ErrorMessage };
        }
        return { Success: true, Data: { TotalPermissionCount: this.TotalCount, DomainGroupCount: this.DomainGroups.length } };
    }

    private handleToggleGroupTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const domain = validateStringParam(params?.['domainName'], 'domainName');
        if (!domain.ok) return domain.result;

        const group = this.DomainGroups.find((g) => g.DomainName === domain.value.trim());
        if (!group) {
            return { Success: false, ErrorMessage: `No domain group named "${domain.value.trim()}" in the current report.` };
        }

        this.ToggleGroup(group);
        this.publishAgentContext();
        return { Success: true };
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
        this.publishAgentContext();
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
