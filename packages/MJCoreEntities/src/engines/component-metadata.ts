import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { ComponentEntityExtended } from "../custom/ComponentEntityExtended";
import { 
    ComponentLibraryEntity, 
    ComponentLibraryLinkEntity,
    ComponentRegistryEntity,
    ComponentDependencyEntity 
} from "../generated/entity_subclasses";

/**
 * Caching of metadata for components and related data
 */
export class ComponentMetadataEngine extends BaseEngine<ComponentMetadataEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): ComponentMetadataEngine {
       return super.getInstance<ComponentMetadataEngine>();
    }

    private _components: ComponentEntityExtended[];
    private _componentLibraries: ComponentLibraryEntity[];
    private _componentLibraryLinks: ComponentLibraryLinkEntity[];
    private _componentRegistries: ComponentRegistryEntity[];
    private _componentDependencies: ComponentDependencyEntity[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Components',
                PropertyName: "_components",
                CacheLocal: true
            },
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

    public get Components(): ComponentEntityExtended[] {
        return this._components;
    }

    public get ComponentLibraries(): ComponentLibraryEntity[] {
        return this._componentLibraries;
    }

    public get ComponentLibraryLinks(): ComponentLibraryLinkEntity[] {
        return this._componentLibraryLinks;
    }

    public get ComponentRegistries(): ComponentRegistryEntity[] {
        return this._componentRegistries;
    }

    public get ComponentDependencies(): ComponentDependencyEntity[] {
        return this._componentDependencies;
    }

    /**
     * Finds a component on a case-insensitive match of name and optionally, namespace and registry if provided
     */
    public FindComponent(name: string, namespace?: string, registry?: string): ComponentEntityExtended | undefined {
        const match =  this._components.find(c => c.Name.trim().toLowerCase() === name.trim().toLowerCase() && 
                                             c.Namespace?.trim().toLowerCase() === namespace?.trim().toLowerCase() && 
                                            (!registry || c.SourceRegistry?.trim().toLowerCase() === registry?.trim().toLowerCase()));
        return match;
    }
}
