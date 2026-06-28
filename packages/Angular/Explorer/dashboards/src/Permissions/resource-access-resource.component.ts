import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NormalizedPermission } from '@memberjunction/core';
import { MJPermissionDomainEntity, PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

import { validateStringParam } from '../shared/agent-tool-validation';

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
export class PermissionsResourceAccessResourceComponent extends BaseResourceComponent implements OnInit, AfterViewInit, OnDestroy {
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
    // 🚨 SAFETY BOUNDARY — READ-ONLY / LOOKUP ONLY 🚨
    // Resource Access Report is a security-sensitive surface that reveals WHO can
    // access a given resource. The agent context and client tools registered here
    // are strictly READ-ONLY: pick a permission domain and look up the grantees on
    // a (domain, resource type, resource ID) triple. The agent CANNOT grant or
    // revoke access, mutate any domain, impersonate a user, alter audit records, or
    // bulk-export effective permissions — those operations are DELIBERATELY NOT
    // exposed and must remain human-initiated. Context exposes only the current
    // selection and the row count of the last lookup.
    // ================================================================

    /**
     * Publish the current resource-access state to the AI agent. Re-invoked on
     * every meaningful state change (domain change, lookup completion).
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            SelectedDomainName: this.SelectedDomainName,
            ResourceTypeInput: this.ResourceTypeInput || null,
            ResourceIdInput: this.ResourceIdInput || null,
            ResourceAccessRowCount: this.ResourceAccessRows.length,
            IsLoading: this.IsLoading,
        });
    }

    /**
     * Register the read-only / lookup client tools the agent may invoke. Every
     * Handler is tolerant: validates input and returns
     * `{ Success: false, ErrorMessage }` rather than throwing.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'LookupResourcePermissions',
                Description:
                    'Look up the grantees (who can access) for a specific resource. Read-only — does not grant or revoke any access. Requires the permission domain name, resource type, and resource ID.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        domainName: { type: 'string', description: 'The permission domain name' },
                        resourceType: { type: 'string', description: 'The resource type within the domain' },
                        resourceId: { type: 'string', description: 'The ID of the resource to inspect' },
                    },
                    required: ['domainName', 'resourceType', 'resourceId'],
                },
                Handler: async (params: Record<string, unknown>) => this.handleLookupResourceTool(params),
            },
            {
                Name: 'ChangeDomain',
                Description:
                    'Select a different permission domain for resource lookups. Read-only — only changes the active selection, does not mutate any domain.',
                ParameterSchema: {
                    type: 'object',
                    properties: { domainName: { type: 'string', description: 'The permission domain name to select' } },
                    required: ['domainName'],
                },
                Handler: async (params: Record<string, unknown>) => this.handleChangeDomainTool(params),
            },
        ]);
    }

    private async handleLookupResourceTool(
        params: Record<string, unknown>
    ): Promise<{ Success: boolean; Data?: unknown; ErrorMessage?: string }> {
        const domain = validateStringParam(params?.['domainName'], 'domainName');
        if (!domain.ok) return domain.result;
        const type = validateStringParam(params?.['resourceType'], 'resourceType');
        if (!type.ok) return type.result;
        const id = validateStringParam(params?.['resourceId'], 'resourceId');
        if (!id.ok) return id.result;

        if (!domain.value.trim() || !type.value.trim() || !id.value.trim()) {
            return { Success: false, ErrorMessage: 'domainName, resourceType, and resourceId are all required.' };
        }

        const known = this.Domains.some((d) => d.Name === domain.value.trim());
        if (!known) {
            return {
                Success: false,
                ErrorMessage: `Unknown permission domain "${domain.value.trim()}".`,
            };
        }

        this.SelectedDomainName = domain.value.trim();
        this.loadResourceTypesForDomain(this.SelectedDomainName);
        this.ResourceTypeInput = type.value.trim();
        this.ResourceIdInput = id.value.trim();

        await this.OnLookupResource();
        this.publishAgentContext();

        if (this.ErrorMessage) {
            return { Success: false, ErrorMessage: this.ErrorMessage };
        }
        return { Success: true, Data: { ResourceAccessRowCount: this.ResourceAccessRows.length } };
    }

    private handleChangeDomainTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const domain = validateStringParam(params?.['domainName'], 'domainName');
        if (!domain.ok) return domain.result;

        const known = this.Domains.some((d) => d.Name === domain.value.trim());
        if (!known) {
            return { Success: false, ErrorMessage: `Unknown permission domain "${domain.value.trim()}".` };
        }

        this.OnDomainChanged(domain.value.trim());
        this.publishAgentContext();
        return { Success: true };
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
        this.publishAgentContext();
    }

    OnDomainChanged(domainName: string): void {
        this.SelectedDomainName = domainName;
        this.loadResourceTypesForDomain(domainName);
        this.ResourceAccessRows = [];
        this.LastQueryLabel = null;
        this.cdr.detectChanges();
        this.publishAgentContext();
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
