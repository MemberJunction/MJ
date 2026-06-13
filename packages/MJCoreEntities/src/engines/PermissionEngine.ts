import {
    BaseEngine,
    BaseEnginePropertyConfig,
    IMetadataProvider,
    LogError,
    LogStatusEx,
    NormalizedPermission,
    PermissionAction,
    PermissionAuditEntry,
    PermissionAuditFilter,
    PermissionCheckResult,
    PermissionDeniedError,
    PermissionProviderBase,
    RegisterForStartup,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

import { MJPermissionDomainEntity } from '../generated/entity_subclasses';

/**
 * The permission-backing entity names we aggregate in `GetAuditTimeline`. Each entry
 * pairs a `PermissionDomain.Name` with the physical entity whose RecordChange rows
 * describe audit events. New providers added after Phase 2b should register here too.
 */
const DOMAIN_TO_AUDIT_ENTITIES: Record<string, string[]> = {
    'Entity Permissions': ['MJ: Entity Permissions'],
    'Application Roles': ['MJ: Application Roles'],
    'Dashboard Permissions': ['MJ: Dashboard Permissions', 'MJ: Dashboard Category Permissions'],
    'Resource Permissions': ['MJ: Resource Permissions'],
    'Artifact Permissions': ['MJ: Artifact Permissions'],
    'Collection Permissions': ['MJ: Collection Permissions'],
    'AI Agent Permissions': ['MJ: AI Agent Permissions'],
    'Query Permissions': ['MJ: Query Permissions'],
    'Access Control Rules': ['MJ: Access Control Rules'],
};

/**
 * Canonical Font Awesome class for each permission domain. Exported so the admin
 * Permissions app and the end-user Sharing Center render the same glyph for each
 * domain without drifting. Consumers should call
 * {@link PermissionEngine.DomainIconFor} rather than reading the map directly so
 * unknown domains get the lock fallback.
 */
export const PERMISSION_DOMAIN_ICONS: Record<string, string> = {
    'Entity Permissions': 'fa-solid fa-database',
    'Application Roles': 'fa-solid fa-shield-halved',
    'Dashboard Permissions': 'fa-solid fa-chart-line',
    'Resource Permissions': 'fa-solid fa-share-nodes',
    'Artifact Permissions': 'fa-solid fa-file-lines',
    'Collection Permissions': 'fa-solid fa-folder-open',
    'AI Agent Permissions': 'fa-solid fa-robot',
    'Query Permissions': 'fa-solid fa-magnifying-glass',
    'Access Control Rules': 'fa-solid fa-lock',
};

/** Fallback icon used when a domain isn't in the catalog (e.g., a Phase-3 provider). */
export const PERMISSION_DOMAIN_ICON_FALLBACK = 'fa-solid fa-lock';

/**
 * PermissionEngine is the unified entry point for permission queries across every registered
 * permission subsystem. At startup it loads the {@link MJPermissionDomainEntity} catalog, then
 * instantiates each active domain's provider via ClassFactory (keyed on `ProviderClassName`).
 *
 * Typical usage:
 * ```typescript
 * // "Can this user read entity X?"
 * const result = PermissionEngine.Instance.CheckPermission(
 *     user, 'Entity Permissions', 'Users', null, 'Read'
 * );
 *
 * // "Show me everything this user has access to"
 * const all = PermissionEngine.Instance.GetAllUserPermissions(user);
 *
 * // "Who has access to this resource?"
 * const rows = PermissionEngine.Instance.GetResourcePermissions(
 *     'Dashboard Permissions', 'Dashboards', dashboardId
 * );
 * ```
 *
 * Priority 15 so it configures after default-priority engines (e.g., UserInfoEngine at 10);
 * providers lazy-resolve their backing engines on first use, so even if a backing engine
 * has not been configured yet at provider construction time, permission checks still work
 * once the backing engine comes online.
 */
@RegisterForStartup({ priority: 15, severity: 'warn', description: 'PermissionEngine — unified permission provider registry' })
export class PermissionEngine extends BaseEngine<PermissionEngine> {
    public static get Instance(): PermissionEngine {
        return super.getInstance<PermissionEngine>();
    }

    private _domains: MJPermissionDomainEntity[] = [];
    private _providers: Map<string, PermissionProviderBase> = new Map();

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Permission Domains',
                PropertyName: '_domains',
                CacheLocal: true,
            },
        ];
        await super.Load(configs, provider, forceRefresh, contextUser);

        this.instantiateProviders();
    }

    /**
     * Walks the loaded domain catalog and instantiates each active provider via ClassFactory.
     * Called on every `Config()` so a `forceRefresh` re-wires the provider map.
     */
    private instantiateProviders(): void {
        this._providers.clear();
        const activeDomains = this._domains.filter((d) => d.IsActive);
        for (const domain of activeDomains) {
            try {
                const instance = MJGlobal.Instance.ClassFactory.CreateInstance<PermissionProviderBase>(
                    PermissionProviderBase,
                    domain.ProviderClassName
                );
                if (instance) {
                    this._providers.set(domain.Name, instance);
                } else {
                    LogError(
                        `PermissionEngine: no provider registered for ProviderClassName '${domain.ProviderClassName}' ` +
                            `(domain '${domain.Name}'). Domain will be skipped until a provider is registered.`
                    );
                }
            } catch (err) {
                LogError(`PermissionEngine: failed to instantiate provider '${domain.ProviderClassName}': ${err}`);
            }
        }
        LogStatusEx({
            message:
                `PermissionEngine configured with ${this._providers.size} provider(s) ` +
                `out of ${activeDomains.length} active domain(s).`,
            verboseOnly: true,
        });
    }

    /**
     * Check whether a user has a specific permission on a specific resource within a domain.
     * Returns `{Allowed: false, Reason: 'Unknown domain'}` if the domain is not registered
     * (either because no catalog row exists or because its provider failed to load).
     */
    public async CheckPermission(
        user: UserInfo,
        domainName: string,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        const provider = this._providers.get(domainName);
        if (!provider) {
            return {
                Allowed: false,
                DomainName: domainName,
                Reason: `Unknown permission domain '${domainName}'`,
            };
        }
        return provider.CheckPermission(user, resourceType, resourceId, action);
    }

    /**
     * Aggregate every resource the user has access to across all registered providers.
     * Providers are queried in parallel; failures from individual providers are logged and skipped.
     * Powers the Sharing Center "User Access Report" view.
     */
    public async GetAllUserPermissions(user: UserInfo): Promise<NormalizedPermission[]> {
        const providers = Array.from(this._providers.values());
        const settled = await Promise.allSettled(providers.map((p) => p.GetUserResources(user)));

        const results: NormalizedPermission[] = [];
        settled.forEach((outcome, i) => {
            const provider = providers[i];
            if (outcome.status === 'fulfilled') {
                if (outcome.value?.length) results.push(...outcome.value);
            } else {
                LogError(`PermissionEngine.GetAllUserPermissions: provider '${provider.DomainName}' threw: ${outcome.reason}`);
            }
        });
        return results;
    }

    /**
     * Aggregate every permission this user has granted to *other* users across all
     * registered providers. Powers the end-user Sharing Center's "Shared by me" tab.
     *
     * Role-only providers (Entity Permissions, Application Roles, AI Agent Permissions,
     * Query Permissions) contribute nothing — their base-class default returns `[]`.
     * Providers are queried in parallel; failures are logged and skipped.
     */
    public async GetPermissionsGrantedByUser(grantor: UserInfo): Promise<NormalizedPermission[]> {
        const providers = Array.from(this._providers.values());
        const settled = await Promise.allSettled(providers.map((p) => p.GetPermissionsGrantedByUser(grantor)));

        const results: NormalizedPermission[] = [];
        settled.forEach((outcome, i) => {
            const provider = providers[i];
            if (outcome.status === 'fulfilled') {
                if (outcome.value?.length) results.push(...outcome.value);
            } else {
                LogError(
                    `PermissionEngine.GetPermissionsGrantedByUser: provider '${provider.DomainName}' threw: ${outcome.reason}`
                );
            }
        });
        return results;
    }

    /**
     * Aggregate every permission where this user is the grantee AND someone else is the
     * grantor — the "shared with me" view. Excludes self-owned resources and role-inherited
     * access. Providers are queried in parallel; failures are logged and skipped.
     */
    public async GetPermissionsSharedWithUser(grantee: UserInfo): Promise<NormalizedPermission[]> {
        const providers = Array.from(this._providers.values());
        const settled = await Promise.allSettled(providers.map((p) => p.GetPermissionsSharedWithUser(grantee)));

        const results: NormalizedPermission[] = [];
        settled.forEach((outcome, i) => {
            const provider = providers[i];
            if (outcome.status === 'fulfilled') {
                if (outcome.value?.length) results.push(...outcome.value);
            } else {
                LogError(
                    `PermissionEngine.GetPermissionsSharedWithUser: provider '${provider.DomainName}' threw: ${outcome.reason}`
                );
            }
        });
        return results;
    }

    /**
     * Get every grantee's permissions on a specific resource within a domain.
     * Powers the Sharing Center "Resource Access Report" view.
     */
    public async GetResourcePermissions(
        domainName: string,
        resourceType: string,
        resourceId: string
    ): Promise<NormalizedPermission[]> {
        const provider = this._providers.get(domainName);
        if (!provider) return [];
        return provider.GetResourcePermissions(resourceType, resourceId);
    }

    /** All active, loaded domain catalog records. */
    public get Domains(): MJPermissionDomainEntity[] {
        return this._domains.filter((d) => d.IsActive);
    }

    /** Look up the provider for a specific domain by name; returns undefined when not loaded. */
    public GetProvider(domainName: string): PermissionProviderBase | undefined {
        return this._providers.get(domainName);
    }

    /**
     * The resource type names supported by the given permission domain — sourced
     * from the provider's `GetResourceTypes()`. Returns `[]` when the domain is
     * unknown or the provider doesn't enumerate its types. Used by admin UIs
     * (e.g., the Resource Access Report) to populate the Resource Type picker
     * after a Domain is selected.
     */
    public GetResourceTypes(domainName: string, provider?: IMetadataProvider): string[] {
        return this._providers.get(domainName)?.GetResourceTypes(provider ?? this.ProviderToUse) ?? [];
    }

    /**
     * Font Awesome class for a permission domain, with a lock fallback for
     * unknown domains. Drives the icon shown next to domain groups in both the
     * admin Permissions app and the end-user Sharing Center.
     */
    public static DomainIconFor(domainName: string): string {
        return PERMISSION_DOMAIN_ICONS[domainName] ?? PERMISSION_DOMAIN_ICON_FALLBACK;
    }

    /** For unit tests: swap the provider map with a caller-supplied one. */
    public _SetProvidersForTesting(providers: Map<string, PermissionProviderBase>): void {
        this._providers = providers;
    }

    /**
     * Convenience wrapper around {@link CheckPermission} that throws a typed
     * {@link PermissionDeniedError} when the action is not permitted. Intended for
     * programmatic callers — Actions, AI Agents, custom server code — that want
     * "fail loudly on denial" semantics instead of branching on a boolean result.
     *
     * @example
     * ```typescript
     * await PermissionEngine.Instance.AuthorizeOrThrow(
     *     user, 'Dashboard Permissions', 'Dashboards', dashboardId, 'Share'
     * );
     * // If we reach this line, the user can share the dashboard.
     * ```
     *
     * @throws {@link PermissionDeniedError} when the provider returns `Allowed: false`
     *         or when the domain is not registered.
     */
    public async AuthorizeOrThrow(
        user: UserInfo,
        domainName: string,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<void> {
        const result = await this.CheckPermission(user, domainName, resourceType, resourceId, action);
        if (!result.Allowed) {
            throw new PermissionDeniedError({ ...result, ResourceType: resourceType, ResourceID: resourceId, Action: action });
        }
    }

    /**
     * Query RecordChange for audit events against every permission-backing entity.
     * Supports filtering by domain, date range, changed-by user, or a specific
     * record. Results are sorted newest-first and capped at `filter.MaxRows`
     * (default 500).
     *
     * Relies on each permission entity having `TrackRecordChanges=1` in its
     * Entity metadata row. Domains whose backing entities do not track changes
     * contribute nothing to the timeline.
     */
    public async GetAuditTimeline(filter: PermissionAuditFilter = {}): Promise<PermissionAuditEntry[]> {
        const targetEntities = this.resolveAuditEntityNames(filter.DomainName);
        if (targetEntities.length === 0) return [];

        const clauses: string[] = [
            `Entity IN (${targetEntities.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')})`,
        ];
        if (filter.StartDate) clauses.push(`ChangedAt >= '${filter.StartDate.toISOString()}'`);
        if (filter.EndDate) clauses.push(`ChangedAt <= '${filter.EndDate.toISOString()}'`);
        if (filter.ChangedByUserID) clauses.push(`UserID = '${filter.ChangedByUserID}'`);
        if (filter.RecordID) clauses.push(`RecordID = '${filter.RecordID.replace(/'/g, "''")}'`);

        const maxRows = filter.MaxRows ?? 500;
        const rv = new RunView();
        const result = await rv.RunView<{
            ID: string;
            Entity: string;
            RecordID: string;
            UserID: string | null;
            User: string | null;
            Type: 'Create' | 'Update' | 'Delete' | 'Snapshot';
            ChangedAt: Date;
            ChangesDescription: string | null;
        }>({
            EntityName: 'MJ: Record Changes',
            ExtraFilter: clauses.join(' AND '),
            OrderBy: 'ChangedAt DESC',
            MaxRows: maxRows,
            Fields: ['ID', 'Entity', 'RecordID', 'UserID', 'User', 'Type', 'ChangedAt', 'ChangesDescription'],
            ResultType: 'simple',
        });

        if (!result.Success) {
            LogError(`PermissionEngine.GetAuditTimeline: ${result.ErrorMessage}`);
            return [];
        }

        return (result.Results ?? []).map((row) => ({
            ChangedAt: new Date(row.ChangedAt),
            ChangedByUserID: row.UserID,
            ChangedByUserName: row.User ?? undefined,
            DomainName: this.resolveDomainForEntity(row.Entity),
            EntityName: row.Entity,
            RecordID: row.RecordID,
            ChangeType: row.Type,
            Summary: row.ChangesDescription ?? undefined,
            SourceRecordChangeID: row.ID,
        }));
    }

    /**
     * Map a domain-name filter to the set of backing entity names to query.
     * When no filter is given, every known permission entity is included.
     */
    private resolveAuditEntityNames(domainName?: string): string[] {
        if (domainName) return DOMAIN_TO_AUDIT_ENTITIES[domainName] ?? [];
        const all: string[] = [];
        for (const list of Object.values(DOMAIN_TO_AUDIT_ENTITIES)) {
            all.push(...list);
        }
        return all;
    }

    /**
     * Reverse lookup: given a backing entity name, return the owning domain.
     * Falls back to the entity name itself when we can't resolve (e.g., a
     * caller added a new permission entity to the map but no provider yet).
     */
    private resolveDomainForEntity(entityName: string): string {
        for (const [domain, entities] of Object.entries(DOMAIN_TO_AUDIT_ENTITIES)) {
            if (entities.includes(entityName)) return domain;
        }
        return entityName;
    }
}
