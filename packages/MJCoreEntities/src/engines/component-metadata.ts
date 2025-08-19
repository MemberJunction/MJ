import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, UserInfo } from "@memberjunction/core";
import { ComponentEntityExtended } from "../custom/ComponentEntityExtended";
import { ComponentLibraryEntity, ComponentLibraryLinkEntity } from "../generated/entity_subclasses";

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

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Components',
                PropertyName: "_components"
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Component Libraries',
                PropertyName: "_componentLibraries"
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Component Library Links',
                PropertyName: "_componentLibraryLinks"
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
}
