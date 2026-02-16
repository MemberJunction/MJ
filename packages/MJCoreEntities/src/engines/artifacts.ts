import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import {
    MJArtifactTypeEntity
} from "../generated/entity_subclasses";

/**
 * Caching of metadata for components and related data
 */
export class ArtifactMetadataEngine extends BaseEngine<ArtifactMetadataEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): ArtifactMetadataEngine {
       return super.getInstance<ArtifactMetadataEngine>();
    }

    private _artifactTypes: MJArtifactTypeEntity[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Artifact Types',
                PropertyName: "_artifactTypes",
                CacheLocal: true
            }
        ]
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public get ArtifactTypes(): MJArtifactTypeEntity[] {
        return this._artifactTypes;
    }

    /**
     * Finds an artifact type on a case-insensitive match of name
     */
    public FindArtifactType(name: string): MJArtifactTypeEntity | undefined {
        if (!this._artifactTypes || !name) {
            return undefined;
        }
        const match = this._artifactTypes.find(c => c.Name.trim().toLowerCase() === name.trim().toLowerCase());
        return match;
    }
}
