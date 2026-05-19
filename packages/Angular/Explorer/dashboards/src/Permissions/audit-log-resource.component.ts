import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { PermissionAuditEntry } from '@memberjunction/core';
import { MJPermissionDomainEntity, PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

import { PermissionsUserOption, loadPermissionsUsers } from './permissions-shared';

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
export class PermissionsAuditLogResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
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

    override ngOnDestroy(): void {
        super.ngOnDestroy();
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
    }

    OnResetFilters(): void {
        this.DomainFilter = '';
        this.UserFilter = '';
        this.StartDate = '';
        this.EndDate = '';
        this.Entries = [];
        this.HasRunQuery = false;
        this.cdr.detectChanges();
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
