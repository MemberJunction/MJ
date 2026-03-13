import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import {
    MJArtifactTypeEntity,
    MJArtifactEntity,
    MJArtifactVersionEntity
} from "../generated/entity_subclasses";

/**
 * Caching of metadata for artifacts, artifact versions, and artifact types.
 */
export class ArtifactMetadataEngine extends BaseEngine<ArtifactMetadataEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): ArtifactMetadataEngine {
       return super.getInstance<ArtifactMetadataEngine>();
    }

    private _artifactTypes: MJArtifactTypeEntity[] = [];
    private _artifacts: MJArtifactEntity[] = [];
    private _artifactVersions: MJArtifactVersionEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Artifact Types',
                PropertyName: "_artifactTypes",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Artifacts',
                PropertyName: "_artifacts",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Artifact Versions',
                PropertyName: "_artifactVersions",
                CacheLocal: true
            }
        ]
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public get ArtifactTypes(): MJArtifactTypeEntity[] {
        return this._artifactTypes;
    }

    /** All artifacts in the system */
    public get Artifacts(): MJArtifactEntity[] {
        return this._artifacts;
    }

    /** All artifact versions in the system */
    public get ArtifactVersions(): MJArtifactVersionEntity[] {
        return this._artifactVersions;
    }

    /**
     * Finds an artifact type on a case-insensitive match of name
     */
    public FindArtifactType(name: string): MJArtifactTypeEntity | undefined {
        if (!this._artifactTypes || !name) {
            return undefined;
        }
        return this._artifactTypes.find(c => c.Name.trim().toLowerCase() === name.trim().toLowerCase());
    }

    /** Find an artifact by its ID */
    public FindArtifactByID(id: string): MJArtifactEntity | undefined {
        if (!id) return undefined;
        const lower = id.trim().toLowerCase();
        return this._artifacts.find(a => a.ID.trim().toLowerCase() === lower);
    }

    /** Find an artifact version by its ID */
    public FindArtifactVersionByID(id: string): MJArtifactVersionEntity | undefined {
        if (!id) return undefined;
        const lower = id.trim().toLowerCase();
        return this._artifactVersions.find(v => v.ID.trim().toLowerCase() === lower);
    }

    /** Get all versions for a given artifact, sorted by VersionNumber descending */
    public GetVersionsForArtifact(artifactId: string): MJArtifactVersionEntity[] {
        if (!artifactId) return [];
        const lower = artifactId.trim().toLowerCase();
        return this._artifactVersions
            .filter(v => v.ArtifactID.trim().toLowerCase() === lower)
            .sort((a, b) => (b.VersionNumber || 0) - (a.VersionNumber || 0));
    }
}
