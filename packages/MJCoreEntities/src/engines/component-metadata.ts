import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { MJComponentEntityExtended } from "../custom/MJComponentEntityExtended";
import {
    MJComponentLibraryEntity,
    MJComponentLibraryLinkEntity,
    MJComponentRegistryEntity,
    MJComponentDependencyEntity
} from "../generated/entity_subclasses";

/**
 * Caching of metadata for component libraries, registries, and dependencies.
 *
 * NOTE: The `MJ: Components` entity is intentionally NOT loaded by this engine.
 * Component records contain large nvarchar(MAX) columns (Specification, vectors,
 * prose fields) totaling ~150+ MB on production databases. Loading them via the
 * engine forced all that data into the browser on every page refresh (~20s cold
 * load) and poisoned the server-side LocalCacheManager by exceeding its memory
 * budget and evicting all other cached entries. Callers that need component data
 * should use RunView with targeted filters instead of bulk-loading all components.
 */
export class ComponentMetadataEngine extends BaseEngine<ComponentMetadataEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): ComponentMetadataEngine {
       return super.getInstance<ComponentMetadataEngine>();
    }

    private _componentLibraries: MJComponentLibraryEntity[];
    private _componentLibraryLinks: MJComponentLibraryLinkEntity[];
    private _componentRegistries: MJComponentRegistryEntity[];
    private _componentDependencies: MJComponentDependencyEntity[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Component Libraries',
                PropertyName: "_componentLibraries",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Component Library Links',
                PropertyName: "_componentLibraryLinks",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Component Registries',
                PropertyName: "_componentRegistries",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Component Dependencies',
                PropertyName: "_componentDependencies",
                CacheLocal: true
            }
        ]
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public get ComponentLibraries(): MJComponentLibraryEntity[] {
        return this._componentLibraries;
    }

    public get ComponentLibraryLinks(): MJComponentLibraryLinkEntity[] {
        return this._componentLibraryLinks;
    }

    public get ComponentRegistries(): MJComponentRegistryEntity[] {
        return this._componentRegistries;
    }

    public get ComponentDependencies(): MJComponentDependencyEntity[] {
        return this._componentDependencies;
    }

    /**
     * Finds a component by its primary key ID.
     * Performs a targeted RunView query instead of searching a bulk-loaded cache.
     */
    public async FindComponentByID(id: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<MJComponentEntityExtended | undefined> {
        const md = provider ?? new Metadata(); // global-provider-ok: fallback when no provider passed
        const entity = await md.GetEntityObject<MJComponentEntityExtended>('MJ: Components', contextUser);
        if (await entity.Load(id)) {
            return entity;
        }
        return undefined;
    }

    /**
     * Finds a component by name (case-insensitive), optionally filtered by namespace and registry.
     * Performs a targeted RunView query instead of searching a bulk-loaded cache.
     */
    public async FindComponent(name: string, namespace?: string, registry?: string, contextUser?: UserInfo): Promise<MJComponentEntityExtended | undefined> {
        const rv = new RunView();
        const filterParts = [`Name='${name.trim().replace(/'/g, "''")}'`];
        if (namespace) {
            filterParts.push(`Namespace='${namespace.trim().replace(/'/g, "''")}'`);
        }
        if (registry) {
            filterParts.push(`SourceRegistry='${registry.trim().replace(/'/g, "''")}'`);
        }

        const result = await rv.RunView<MJComponentEntityExtended>({
            EntityName: 'MJ: Components',
            ExtraFilter: filterParts.join(' AND '),
            MaxRows: 1,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        }
        return undefined;
    }
}
