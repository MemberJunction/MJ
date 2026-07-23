import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, IRunViewProvider, LogStatus, RunView, UserInfo } from "@memberjunction/core";
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
 *
 * ## Boot payload is bounded by design
 *
 * Only **artifact types** are eagerly loaded at `Config()` time — a small,
 * fixed registry. Artifacts and artifact versions are NOT bulk-loaded: a
 * version's `Content` column holds arbitrarily large payloads (base64 blobs,
 * snapshots, etc.), so eager-loading every version made cold boot download the
 * entire artifact corpus and — because the result dwarfed the local cache
 * budget — wiped the whole client cache on each login. Instead, artifacts and
 * versions are fetched **on demand** for a specific artifact via
 * {@link LoadVersionsForArtifact} / {@link GetVersionContent}, keeping startup
 * cost independent of how much artifact content a deployment has accumulated.
 *
 * The on-demand results are memoized in per-ID maps so the synchronous
 * accessors ({@link FindArtifactByID}, {@link FindArtifactVersionByID},
 * {@link GetVersionsForArtifact}) serve anything already fetched this session.
 * A cache miss is not an error — callers fall back to a direct entity load.
 */
export class ArtifactMetadataEngine extends BaseEngine<ArtifactMetadataEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): ArtifactMetadataEngine {
       return super.getInstance<ArtifactMetadataEngine>();
    }

    private _artifactTypes: MJArtifactTypeEntity[] = [];

    // On-demand caches — populated lazily by the loaders below, NOT at boot.
    // Keyed by lowercased ID for case-insensitive lookup across SQL Server
    // (uppercase UUIDs) and PostgreSQL (lowercase UUIDs).
    private _artifactCache = new Map<string, MJArtifactEntity>();
    private _versionCache = new Map<string, MJArtifactVersionEntity>();
    private _versionsByArtifact = new Map<string, MJArtifactVersionEntity[]>();

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
        return this.GetConfigData<MJArtifactTypeEntity>('_artifactTypes');
    }

    /**
     * Artifacts fetched on demand this session (via {@link LoadVersionsForArtifact}).
     * NOT the full system corpus — artifacts are no longer bulk-loaded at boot.
     */
    public get Artifacts(): MJArtifactEntity[] {
        return Array.from(this._artifactCache.values());
    }

    /**
     * Artifact versions fetched on demand this session (via
     * {@link LoadVersionsForArtifact} / {@link GetVersionContent}). NOT the full
     * system corpus — versions are no longer bulk-loaded at boot.
     */
    public get ArtifactVersions(): MJArtifactVersionEntity[] {
        return Array.from(this._versionCache.values());
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

    /**
     * Find an artifact by its ID among those fetched on demand this session.
     * Returns undefined on a cache miss — call {@link LoadVersionsForArtifact}
     * first, or fall back to a direct entity load.
     */
    public FindArtifactByID(id: string): MJArtifactEntity | undefined {
        if (!id) return undefined;
        return this._artifactCache.get(id.trim().toLowerCase());
    }

    /**
     * Find an artifact version by its ID among those fetched on demand this
     * session. Returns undefined on a cache miss — call {@link GetVersionContent}
     * or {@link LoadVersionsForArtifact} first, or fall back to a direct load.
     */
    public FindArtifactVersionByID(id: string): MJArtifactVersionEntity | undefined {
        if (!id) return undefined;
        return this._versionCache.get(id.trim().toLowerCase());
    }

    /**
     * Get all versions for a given artifact that were fetched on demand this
     * session, sorted by VersionNumber descending. Returns [] if
     * {@link LoadVersionsForArtifact} has not been called for this artifact —
     * this is a synchronous cache read, not a loader.
     */
    public GetVersionsForArtifact(artifactId: string): MJArtifactVersionEntity[] {
        if (!artifactId) return [];
        const cached = this._versionsByArtifact.get(artifactId.trim().toLowerCase());
        return cached ? [...cached] : [];
    }

    /**
     * Loads all versions (including the `Content` column) for a single artifact
     * from the database and memoizes them. This is the on-demand replacement
     * for the former boot-time bulk load: the payload is bounded to one
     * artifact's versions rather than the entire corpus.
     *
     * @param artifactId - the artifact whose versions to load
     * @param contextUser - required server-side for correct user scoping
     * @param provider - optional non-default provider (multi-provider clients)
     * @param forceRefresh - re-query even if already cached this session
     * @returns the artifact's versions, sorted by VersionNumber descending
     */
    public async LoadVersionsForArtifact(
        artifactId: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
        forceRefresh?: boolean
    ): Promise<MJArtifactVersionEntity[]> {
        if (!artifactId) return [];
        const key = artifactId.trim().toLowerCase();
        if (!forceRefresh && this._versionsByArtifact.has(key)) {
            return this.GetVersionsForArtifact(artifactId);
        }

        const rvProvider = (provider as unknown as IRunViewProvider) ?? this.RunViewProviderToUse;
        const rv = new RunView(rvProvider);
        const result = await rv.RunView<MJArtifactVersionEntity>({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID='${artifactId.replace(/'/g, "''")}'`,
            OrderBy: 'VersionNumber DESC',
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            LogStatus(`WARN ArtifactMetadataEngine.LoadVersionsForArtifact: failed to load versions for artifact ${artifactId}: ${result.ErrorMessage}`);
            return this.GetVersionsForArtifact(artifactId);
        }

        const versions = result.Results || [];
        this._versionsByArtifact.set(key, versions);
        for (const v of versions) {
            this._versionCache.set(v.ID.trim().toLowerCase(), v);
        }
        return [...versions];
    }

    /**
     * Loads a single artifact version (including `Content`) by ID on demand and
     * memoizes it. Returns undefined if the version can't be loaded.
     *
     * @param versionId - the artifact version to load
     * @param contextUser - required server-side for correct user scoping
     * @param provider - optional non-default provider (multi-provider clients)
     * @param forceRefresh - re-load even if already cached this session
     */
    public async GetVersionContent(
        versionId: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
        forceRefresh?: boolean
    ): Promise<MJArtifactVersionEntity | undefined> {
        if (!versionId) return undefined;
        const key = versionId.trim().toLowerCase();
        if (!forceRefresh) {
            const existing = this._versionCache.get(key);
            if (existing) return existing;
        }

        const p = provider ?? this.ProviderToUse;
        const version = await p.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', contextUser);
        const loaded = await version.Load(versionId);
        if (!loaded) {
            LogStatus(`WARN ArtifactMetadataEngine.GetVersionContent: failed to load version ${versionId}`);
            return undefined;
        }
        this._versionCache.set(key, version);
        return version;
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
