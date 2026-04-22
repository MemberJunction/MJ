import {
    BaseEngine,
    BaseEnginePropertyConfig,
    IMetadataProvider,
    LogError,
    LogStatus,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    RegisterForStartup,
    UserInfo,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

import { MJPermissionDomainEntity } from '../generated/entity_subclasses';

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
        LogStatus(
            `PermissionEngine configured with ${this._providers.size} provider(s) ` +
                `out of ${activeDomains.length} active domain(s).`
        );
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

    /** For unit tests: swap the provider map with a caller-supplied one. */
    public _SetProvidersForTesting(providers: Map<string, PermissionProviderBase>): void {
        this._providers = providers;
    }
}
