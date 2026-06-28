import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { PermissionAuditEntry } from '@memberjunction/core';
import { MJPermissionDomainEntity, PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

import { PermissionsUserOption, loadPermissionsUsers, parseAuditFilterParams } from './permissions-shared';

/**
 * Audit Log resource — one of three tabs in the Permissions admin application.
 * Chronological log of Create / Update / Delete events against any permission
 * record across every registered domain. Powered by `PermissionEngine.GetAuditTimeline`.
 */
@RegisterClass(BaseResourceComponent, 'PermissionsAuditLogResource')
@Component({
    standalone: false,
    selector: 'mj-permissions-audit-log-resource',
    templateUrl: './audit-log-resource.component.html',
    styleUrls: ['./permissions-resource.component.css'],
})
export class PermissionsAuditLogResourceComponent extends BaseResourceComponent implements OnInit, AfterViewInit, OnDestroy {
    Domains: MJPermissionDomainEntity[] = [];
    Users: PermissionsUserOption[] = [];

    DomainFilter: string | '' = '';
    UserFilter: string | '' = '';
    StartDate: string = '';
    EndDate: string = '';
    Entries: PermissionAuditEntry[] = [];
    IsLoading = false;
    HasRunQuery = false;
    ErrorMessage: string | null = null;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Audit Log';
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-clock-rotate-left';
    }

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.Domains = PermissionEngine.Instance.Domains;
        try {
            this.Users = await loadPermissionsUsers();
        } catch (e) {
            this.ErrorMessage = `Error loading users: ${e instanceof Error ? e.message : String(e)}`;
        }
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
    // 🚨 SAFETY BOUNDARY — READ-ONLY / VIEW & FILTER ONLY 🚨
    // The Audit Log is a security-sensitive surface that reveals the history of
    // permission changes. The agent context and client tools registered here are
    // strictly READ-ONLY: run the timeline query with view-only filters (domain,
    // user, date range) and reset those filters. The agent CANNOT create, update,
    // or delete audit records, grant/revoke permissions, mutate any domain,
    // impersonate a user, or bulk-export effective permissions — those operations
    // are DELIBERATELY NOT exposed and must remain human-initiated. Context exposes
    // only the active filter values, the entry count, and the loading flags.
    // ================================================================

    /**
     * Publish the current audit-log state to the AI agent. Re-invoked on every
     * meaningful state change (query run, filter reset).
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            DomainFilter: this.DomainFilter || null,
            UserFilter: this.UserFilter || null,
            StartDate: this.StartDate || null,
            EndDate: this.EndDate || null,
            EntryCount: this.Entries.length,
            IsLoading: this.IsLoading,
            HasRunQuery: this.HasRunQuery,
        });
    }

    /**
     * Register the read-only / view client tools the agent may invoke. Every
     * Handler is tolerant: validates input and returns
     * `{ Success: false, ErrorMessage }` rather than throwing.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RunAuditTimelineQuery',
                Description:
                    'Run the permission audit timeline with view-only filters and display the matching change history. Read-only — does not create, edit, or delete any record. All filters are optional: domainName, userId, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD).',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        domainName: { type: 'string', description: 'Limit to a specific permission domain' },
                        userId: { type: 'string', description: 'Limit to changes made by this user ID' },
                        startDate: { type: 'string', description: 'Start of date range (YYYY-MM-DD)' },
                        endDate: { type: 'string', description: 'End of date range (YYYY-MM-DD)' },
                    },
                },
                Handler: async (params: Record<string, unknown>) => this.handleRunQueryTool(params),
            },
            {
                Name: 'ResetAuditFilters',
                Description:
                    'Clear all audit log filters (domain, user, date range) and the displayed results. Read-only — does not mutate any data.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleResetFiltersTool(),
            },
        ]);
    }

    private async handleRunQueryTool(
        params: Record<string, unknown>
    ): Promise<{ Success: boolean; Data?: unknown; ErrorMessage?: string }> {
        const parsed = parseAuditFilterParams(params);
        if (!parsed.ok) {
            return { Success: false, ErrorMessage: parsed.error };
        }

        if (parsed.value.DomainName && !this.Domains.some((d) => d.Name === parsed.value.DomainName)) {
            return { Success: false, ErrorMessage: `Unknown permission domain "${parsed.value.DomainName}".` };
        }
        if (parsed.value.ChangedByUserID && !this.Users.some((u) => u.ID === parsed.value.ChangedByUserID)) {
            return { Success: false, ErrorMessage: `Unknown user ID "${parsed.value.ChangedByUserID}".` };
        }

        this.DomainFilter = parsed.value.DomainName;
        this.UserFilter = parsed.value.ChangedByUserID;
        this.StartDate = parsed.value.StartDate;
        this.EndDate = parsed.value.EndDate;

        await this.OnRunQuery();
        this.publishAgentContext();

        if (this.ErrorMessage) {
            return { Success: false, ErrorMessage: this.ErrorMessage };
        }
        return { Success: true, Data: { EntryCount: this.Entries.length } };
    }

    private handleResetFiltersTool(): { Success: boolean } {
        this.OnResetFilters();
        this.publishAgentContext();
        return { Success: true };
    }

    async OnRunQuery(): Promise<void> {
        this.ErrorMessage = null;
        this.IsLoading = true;
        this.Entries = [];
        this.cdr.detectChanges();

        try {
            const filter: Parameters<typeof PermissionEngine.Instance.GetAuditTimeline>[0] = {
                MaxRows: 500,
            };
            if (this.DomainFilter) filter.DomainName = this.DomainFilter;
            if (this.UserFilter) filter.ChangedByUserID = this.UserFilter;
            if (this.StartDate) filter.StartDate = new Date(this.StartDate);
            if (this.EndDate) {
                // End-of-day semantics — include everything on the selected day
                const d = new Date(this.EndDate);
                d.setHours(23, 59, 59, 999);
                filter.EndDate = d;
            }

            this.Entries = await PermissionEngine.Instance.GetAuditTimeline(filter);
            this.HasRunQuery = true;
        } catch (e) {
            this.ErrorMessage = `Error loading audit timeline: ${e instanceof Error ? e.message : String(e)}`;
        }

        this.IsLoading = false;
        this.cdr.detectChanges();
        this.publishAgentContext();
    }

    OnResetFilters(): void {
        this.DomainFilter = '';
        this.UserFilter = '';
        this.StartDate = '';
        this.EndDate = '';
        this.Entries = [];
        this.HasRunQuery = false;
        this.cdr.detectChanges();
        this.publishAgentContext();
    }

    TrackByAuditEntry(_index: number, entry: PermissionAuditEntry): string {
        return entry.SourceRecordChangeID;
    }

    ChangeIcon(type: PermissionAuditEntry['ChangeType']): string {
        switch (type) {
            case 'Create':
                return 'fa-solid fa-plus';
            case 'Update':
                return 'fa-solid fa-pen';
            case 'Delete':
                return 'fa-solid fa-trash';
            case 'Snapshot':
                return 'fa-solid fa-camera';
            default:
                return 'fa-solid fa-circle';
        }
    }
}

/** Tree-shaking prevention — referenced from `public-api.ts`. */
export function LoadPermissionsAuditLogResource(): void {
    // intentionally empty
}
