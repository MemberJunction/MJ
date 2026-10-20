import { MJArtifactEntity, MJArtifactVersionEntity, ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';

/**
 * Represents artifact information with lazy-loading capabilities.
 * Stores minimal display data initially (from query) and loads full entities on-demand.
 *
 * For full entity access, this first checks {@link ArtifactMetadataEngine}'s
 * on-demand caches (populated when an artifact's versions were loaded earlier
 * this session) and otherwise loads the single artifact/version directly from
 * the database. Artifacts and versions are no longer bulk-loaded at boot — a
 * version's `Content` can be arbitrarily large — so a direct load is the normal
 * path here, not just a fallback.
 *
 * The direct load is coalesced via a shared promise so concurrent callers issue
 * a single query.
 */
export class LazyArtifactInfo {
  // Display data (always available from initial query - no lazy loading needed)
  public readonly ConversationDetailId: string;

  /** @deprecated Use {@link ConversationDetailId}. */
  public get conversationDetailId(): string {
    return this.ConversationDetailId;
  }
  public readonly Direction: string;

  /** @deprecated Use {@link Direction}. */
  public get direction(): string {
    return this.Direction;
  }
  public readonly ArtifactVersionId: string;

  /** @deprecated Use {@link ArtifactVersionId}. */
  public get artifactVersionId(): string {
    return this.ArtifactVersionId;
  }
  public readonly VersionNumber: number;

  /** @deprecated Use {@link VersionNumber}. */
  public get versionNumber(): number {
    return this.VersionNumber;
  }
  public readonly VersionName: string | null;

  /** @deprecated Use {@link VersionName}. */
  public get versionName(): string | null {
    return this.VersionName;
  }
  public readonly VersionDescription: string | null;

  /** @deprecated Use {@link VersionDescription}. */
  public get versionDescription(): string | null {
    return this.VersionDescription;
  }
  public readonly VersionCreatedAt: Date;

  /** @deprecated Use {@link VersionCreatedAt}. */
  public get versionCreatedAt(): Date {
    return this.VersionCreatedAt;
  }
  public readonly ArtifactId: string;

  /** @deprecated Use {@link ArtifactId}. */
  public get artifactId(): string {
    return this.ArtifactId;
  }
  public readonly ArtifactName: string;

  /** @deprecated Use {@link ArtifactName}. */
  public get artifactName(): string {
    return this.ArtifactName;
  }
  public readonly ArtifactType: string;

  /** @deprecated Use {@link ArtifactType}. */
  public get artifactType(): string {
    return this.ArtifactType;
  }
  public readonly ArtifactDescription: string;

  /** @deprecated Use {@link ArtifactDescription}. */
  public get artifactDescription(): string {
    return this.ArtifactDescription;
  }
  public readonly Visibility: string;

  /** @deprecated Use {@link Visibility}. */
  public get visibility(): string {
    return this.Visibility;
  }

  // Fallback entities loaded directly when engine doesn't have them yet
  private _fallbackArtifact: MJArtifactEntity | null = null;
  private _fallbackVersion: MJArtifactVersionEntity | null = null;
  private _fallbackLoadPromise: Promise<void> | null = null;

  constructor(
    queryResult: Record<string, unknown>,
    private currentUser: UserInfo,
    preloadedArtifact?: MJArtifactEntity,
    preloadedVersion?: MJArtifactVersionEntity,
    /**
     * The provider the fallback load reads through. A component constructing this in a
     * multi-provider tree passes its own `ProviderToUse`; omitting it falls back to the global
     * default, named explicitly rather than reached for via `new Metadata()`.
     */
    private provider?: IMetadataProvider
  ) {
    // Populate display data from query result
    // These fields come from GetConversationComplete query
    this.ConversationDetailId = queryResult.ConversationDetailID as string;
    this.Direction = queryResult.Direction as string;
    this.ArtifactVersionId = queryResult.ArtifactVersionID as string;
    this.VersionNumber = queryResult.VersionNumber as number;
    this.VersionName = (queryResult.VersionName as string) || null;
    this.VersionDescription = (queryResult.VersionDescription as string) || null;
    this.VersionCreatedAt = queryResult.VersionCreatedAt ? new Date(queryResult.VersionCreatedAt as string) : new Date();
    this.ArtifactId = queryResult.ArtifactID as string;
    this.ArtifactName = queryResult.ArtifactName as string;
    this.ArtifactType = queryResult.ArtifactType as string;
    this.ArtifactDescription = (queryResult.ArtifactDescription as string) || '';
    this.Visibility = (queryResult.Visibility as string) || 'User';

    // If entities were pre-loaded via batch query, store as fallbacks
    if (preloadedArtifact) {
      this._fallbackArtifact = preloadedArtifact;
    }
    if (preloadedVersion) {
      this._fallbackVersion = preloadedVersion;
    }
  }

  /**
   * Gets the full Artifact entity.
   * Checks ArtifactMetadataEngine first (always fresh), falls back to direct load.
   */
  async GetArtifact(): Promise<MJArtifactEntity> {
    // Try the engine first — it stays in sync via BaseEntity events
    const engine = ArtifactMetadataEngine.Instance;
    if (engine.Loaded) {
      const fromEngine = engine.FindCachedArtifactByID(this.ArtifactId);
      if (fromEngine) {
        return fromEngine;
      }
    }

    // Engine doesn't have it yet — use fallback
    return this.loadArtifactFallback();
  }

  /** @deprecated Use {@link GetArtifact}. */
  async getArtifact(): Promise<MJArtifactEntity> {
    return this.GetArtifact();
  }

  /**
   * Gets the full ArtifactVersion entity including Content field.
   * Checks ArtifactMetadataEngine first (always fresh), falls back to direct load.
   */
  async GetVersion(): Promise<MJArtifactVersionEntity> {
    // Try the engine first — it stays in sync via BaseEntity events
    const engine = ArtifactMetadataEngine.Instance;
    if (engine.Loaded) {
      const fromEngine = engine.FindCachedArtifactVersionByID(this.ArtifactVersionId);
      if (fromEngine) {
        return fromEngine;
      }
    }

    // Engine doesn't have it yet — use fallback
    return this.loadVersionFallback();
  }

  /** @deprecated Use {@link GetVersion}. */
  async getVersion(): Promise<MJArtifactVersionEntity> {
    return this.GetVersion();
  }

  /**
   * Checks if the artifact entities can be accessed without triggering a load.
   * True if the engine has them or fallbacks are populated.
   */
  get IsLoaded(): boolean {
    const engine = ArtifactMetadataEngine.Instance;
    if (engine.Loaded) {
      const hasArtifact = !!engine.FindCachedArtifactByID(this.ArtifactId);
      const hasVersion = !!engine.FindCachedArtifactVersionByID(this.ArtifactVersionId);
      if (hasArtifact && hasVersion) {
        return true;
      }
    }
    return this._fallbackArtifact !== null && this._fallbackVersion !== null;
  }

  /** @deprecated Use {@link IsLoaded}. */
  get isLoaded(): boolean {
    return this.IsLoaded;
  }

  /**
   * Checks if a fallback load is currently in progress.
   */
  get IsLoading(): boolean {
    return this._fallbackLoadPromise !== null;
  }

  /** @deprecated Use {@link IsLoading}. */
  get isLoading(): boolean {
    return this.IsLoading;
  }

  /**
   * Loads the artifact directly from the database as a fallback.
   * Uses a shared promise to coalesce concurrent calls.
   */
  private async loadArtifactFallback(): Promise<MJArtifactEntity> {
    if (this._fallbackArtifact) {
      return this._fallbackArtifact;
    }

    await this.ensureFallbacksLoaded();
    return this._fallbackArtifact!;
  }

  /**
   * Loads the artifact version directly from the database as a fallback.
   * Uses a shared promise to coalesce concurrent calls.
   */
  private async loadVersionFallback(): Promise<MJArtifactVersionEntity> {
    if (this._fallbackVersion) {
      return this._fallbackVersion;
    }

    await this.ensureFallbacksLoaded();
    return this._fallbackVersion!;
  }

  /**
   * Loads both artifact and version from database in parallel.
   * Called only when ArtifactMetadataEngine doesn't have the entities.
   * Shares a single promise across concurrent requests.
   */
  private async ensureFallbacksLoaded(): Promise<void> {
    if (this._fallbackArtifact && this._fallbackVersion) {
      return;
    }

    if (this._fallbackLoadPromise) {
      await this._fallbackLoadPromise;
      return;
    }

    this._fallbackLoadPromise = this.doFallbackLoad();
    try {
      await this._fallbackLoadPromise;
    } finally {
      this._fallbackLoadPromise = null;
    }
  }

  private async doFallbackLoad(): Promise<void> {
    try {
      const md = this.provider ?? Metadata.Provider;
      const [artifact, version] = await Promise.all([
        this._fallbackArtifact ? Promise.resolve(this._fallbackArtifact) : this.loadSingleArtifact(md),
        this._fallbackVersion ? Promise.resolve(this._fallbackVersion) : this.loadSingleVersion(md)
      ]);
      this._fallbackArtifact = artifact;
      this._fallbackVersion = version;
    } catch (error) {
      console.error('LazyArtifactInfo: Error loading fallback entities:', error);
      throw error;
    }
  }

  private async loadSingleArtifact(md: IMetadataProvider): Promise<MJArtifactEntity> {
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.currentUser);
    await artifact.Load(this.ArtifactId);
    return artifact;
  }

  private async loadSingleVersion(md: IMetadataProvider): Promise<MJArtifactVersionEntity> {
    const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser);
    await version.Load(this.ArtifactVersionId);
    return version;
  }
}
