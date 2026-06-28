import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NormalizedPermission } from '@memberjunction/core';
import { MJPermissionDomainEntity, PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Resource Access Report resource — one of three tabs in the Permissions admin application.
 * Given a (domain, resource type, resource ID) triple, lists every grantee on that resource
 * with their effective actions, effect (Allow/Deny), and optional expiration.
 * Powered by `PermissionEngine.GetResourcePermissions`.
 */
@RegisterClass(BaseResourceComponent, 'PermissionsResourceAccessResource')
@Component({
    standalone: false,
    selector: 'mj-permissions-resource-access-resource',
    templateUrl: './resource-access-resource.component.html',
    styleUrls: ['./permissions-resource.component.css'],
})
export class PermissionsResourceAccessResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    Domains: MJPermissionDomainEntity[] = [];
    SelectedDomainName: string | null = null;
    /** Auto-populated whenever the selected domain changes. Empty = adapter doesn't enumerate its types. */
    ResourceTypes: string[] = [];
    ResourceTypeInput = '';
    ResourceIdInput = '';
    ResourceAccessRows: NormalizedPermission[] = [];
    IsLoading = false;
    LastQueryLabel: string | null = null;
    ErrorMessage: string | null = null;

    /** Message shown when a lookup returns no grantees (echoes the query). */
    public get NoGranteesMessage(): string {
        return `No grantees found for ${this.LastQueryLabel ?? 'this resource'}.`;
    }

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Resource Access Report';
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-cube';
    }

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.Domains = PermissionEngine.Instance.Domains;
        if (this.Domains.length > 0) {
            this.SelectedDomainName = this.Domains[0].Name;
            this.loadResourceTypesForDomain(this.SelectedDomainName);
        }
        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

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
        this.IsLoading = true;
        this.ResourceAccessRows = [];
        this.LastQueryLabel = null;
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
            this.LastQueryLabel = `${this.SelectedDomainName} / ${this.ResourceTypeInput.trim()} / ${this.ResourceIdInput.trim()}`;
        } catch (e) {
            this.ErrorMessage = `Error looking up resource: ${e instanceof Error ? e.message : String(e)}`;
        }

        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    OnDomainChanged(domainName: string): void {
        this.SelectedDomainName = domainName;
        this.loadResourceTypesForDomain(domainName);
        this.ResourceAccessRows = [];
        this.LastQueryLabel = null;
        this.cdr.detectChanges();
    }

    /**
     * Populate {@link ResourceTypes} from the provider behind `domainName`. If the
     * current `ResourceTypeInput` isn't a member of the new list, clear it — the
     * previous choice doesn't make sense against a different domain. When a
     * domain has exactly one supported type we auto-select it so the user
     * doesn't have to open the picker for a trivial choice.
     */
    private loadResourceTypesForDomain(domainName: string | null): void {
        if (!domainName) {
            this.ResourceTypes = [];
            this.ResourceTypeInput = '';
            return;
        }
        this.ResourceTypes = PermissionEngine.Instance.GetResourceTypes(domainName, this.ProviderToUse);
        if (this.ResourceTypes.length === 1) {
            this.ResourceTypeInput = this.ResourceTypes[0];
        } else if (!this.ResourceTypes.includes(this.ResourceTypeInput)) {
            this.ResourceTypeInput = '';
        }
    }

    TrackByResourceRow(_index: number, row: NormalizedPermission): string {
        return row.SourceRecordID ?? `${row.GranteeType}|${row.GranteeID ?? ''}`;
    }
}

/** Tree-shaking prevention — referenced from `public-api.ts`. */
export function LoadPermissionsResourceAccessResource(): void {
    // intentionally empty
}
