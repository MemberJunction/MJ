import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, LogStatus, UserInfo } from "@memberjunction/core";
import {
    MJArtifactTypeEntity,
    MJArtifactEntity,
    MJArtifactVersionEntity
} from "../generated/entity_subclasses";
import {
    ResolveArtifactTypeByMime,
    FindArtifactTypeConflicts,
    type ArtifactTypeMatcher,
} from "./artifact-mime-resolver";

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
        return this.GetConfigData<MJArtifactTypeEntity>('_artifactTypes');
    }

    /** All artifacts in the system */
    public get Artifacts(): MJArtifactEntity[] {
        return this.GetConfigData<MJArtifactEntity>('_artifacts');
    }

    /** All artifact versions in the system */
    public get ArtifactVersions(): MJArtifactVersionEntity[] {
        return this.GetConfigData<MJArtifactVersionEntity>('_artifactVersions');
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

    /** Find an artifact type by its ID */
    public FindArtifactTypeByID(id: string): MJArtifactTypeEntity | undefined {
        if (!id) return undefined;
        const lower = id.trim().toLowerCase();
        return this._artifactTypes.find(t => t.ID.trim().toLowerCase() === lower);
    }

    /**
     * Returns true if the given artifact version stores its content as a binary
     * file in MJStorage (ContentMode === 'File') rather than inline text.
     */
    public IsFileArtifact(version: MJArtifactVersionEntity): boolean {
        return version?.ContentMode === 'File';
    }

    /**
     * Resolves an upload's MIME type (and optional file extension) to the
     * highest-priority registered Artifact Type. Supports exact matches and
     * subtype wildcards (e.g. `text/*`, `image/*`), with deterministic
     * tiebreaking via Priority → SystemSupplied → ID. See
     * `artifact-mime-resolver.ts` for the full algorithm.
     */
    public GetArtifactTypeByMimeType(mimeType: string, fileExtension?: string): MJArtifactTypeEntity | undefined {
        const matchers = this._artifactTypes.map(t => this.toMatcher(t));
        const found = ResolveArtifactTypeByMime(matchers, mimeType, fileExtension);
        return found ? this.FindArtifactTypeByID(found.id) : undefined;
    }

    /**
     * Logs WARN for any pair of registered Artifact Types that share an
     * identical (ContentType, Priority, SystemSupplied) triple — almost always
     * a configuration mistake, and the ID-tiebreaker would otherwise hide it.
     * Call after Config() to surface registry ambiguity at boot.
     */
    public LogArtifactTypeRegistryConflicts(): void {
        const matchers = this._artifactTypes.map(t => this.toMatcher(t));
        const conflicts = FindArtifactTypeConflicts(matchers);
        for (const c of conflicts) {
            LogStatus(
                `WARN ArtifactMetadataEngine: ${c.matcherNames.length} Artifact Types share (ContentType=${c.contentType}, Priority=${c.priority}, SystemSupplied=${c.systemSupplied}): ${c.matcherNames.join(', ')}. Resolution will use lowest-ID tiebreaker — set Priority explicitly to disambiguate.`
            );
        }
    }

    private toMatcher(t: MJArtifactTypeEntity): ArtifactTypeMatcher {
        return {
            id: t.ID,
            name: t.Name,
            contentType: t.ContentType,
            priority: t.Priority,
            systemSupplied: t.SystemSupplied,
        };
    }
}
