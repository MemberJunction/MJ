import { MJArtifactEntity, MJArtifactVersionEntity, ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { Metadata, UserInfo } from '@memberjunction/core';

/**
 * Represents artifact information with lazy-loading capabilities.
 * Stores minimal display data initially (from query) and loads full entities on-demand.
 *
 * For full entity access, delegates to {@link ArtifactMetadataEngine} which is kept
 * in sync automatically via BaseEngine's MJGlobal event listener. When any
 * BaseEntity save/delete fires in the same process, the engine's in-memory
 * arrays are updated immediately — so callers always get the freshest data
 * without tight coupling between the conversation layer and artifact editors.
 *
 * A one-time direct load fallback is used when the engine hasn't loaded yet
 * or the entity is brand-new and hasn't propagated to the engine's cache.
 */
export class LazyArtifactInfo {
  // Display data (always available from initial query - no lazy loading needed)
  public readonly conversationDetailId: string;
  public readonly direction: string;
  public readonly artifactVersionId: string;
  public readonly versionNumber: number;
  public readonly versionName: string | null;
  public readonly versionDescription: string | null;
  public readonly versionCreatedAt: Date;
  public readonly artifactId: string;
  public readonly artifactName: string;
  public readonly artifactType: string;
  public readonly artifactDescription: string;
  public readonly visibility: string;

  // Fallback entities loaded directly when engine doesn't have them yet
  private _fallbackArtifact: MJArtifactEntity | null = null;
  private _fallbackVersion: MJArtifactVersionEntity | null = null;
  private _fallbackLoadPromise: Promise<void> | null = null;

  constructor(
    queryResult: Record<string, unknown>,
    private currentUser: UserInfo,
    preloadedArtifact?: MJArtifactEntity,
    preloadedVersion?: MJArtifactVersionEntity
  ) {
    // Populate display data from query result
    // These fields come from GetConversationComplete query
    this.conversationDetailId = queryResult.ConversationDetailID as string;
    this.direction = queryResult.Direction as string;
    this.artifactVersionId = queryResult.ArtifactVersionID as string;
    this.versionNumber = queryResult.VersionNumber as number;
    this.versionName = (queryResult.VersionName as string) || null;
    this.versionDescription = (queryResult.VersionDescription as string) || null;
    this.versionCreatedAt = queryResult.VersionCreatedAt ? new Date(queryResult.VersionCreatedAt as string) : new Date();
    this.artifactId = queryResult.ArtifactID as string;
    this.artifactName = queryResult.ArtifactName as string;
    this.artifactType = queryResult.ArtifactType as string;
    this.artifactDescription = (queryResult.ArtifactDescription as string) || '';
    this.visibility = (queryResult.Visibility as string) || 'User';

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
  async getArtifact(): Promise<MJArtifactEntity> {
    // Try the engine first — it stays in sync via BaseEntity events
    const engine = ArtifactMetadataEngine.Instance;
    if (engine.Loaded) {
      const fromEngine = engine.FindArtifactByID(this.artifactId);
      if (fromEngine) {
        return fromEngine;
      }
    }

    // Engine doesn't have it yet — use fallback
    return this.loadArtifactFallback();
  }

  /**
   * Gets the full ArtifactVersion entity including Content field.
   * Checks ArtifactMetadataEngine first (always fresh), falls back to direct load.
   */
  async getVersion(): Promise<MJArtifactVersionEntity> {
    // Try the engine first — it stays in sync via BaseEntity events
    const engine = ArtifactMetadataEngine.Instance;
    if (engine.Loaded) {
      const fromEngine = engine.FindArtifactVersionByID(this.artifactVersionId);
      if (fromEngine) {
        return fromEngine;
      }
    }

    // Engine doesn't have it yet — use fallback
    return this.loadVersionFallback();
  }

  /**
   * Checks if the artifact entities can be accessed without triggering a load.
   * True if the engine has them or fallbacks are populated.
   */
  get isLoaded(): boolean {
    const engine = ArtifactMetadataEngine.Instance;
    if (engine.Loaded) {
      const hasArtifact = !!engine.FindArtifactByID(this.artifactId);
      const hasVersion = !!engine.FindArtifactVersionByID(this.artifactVersionId);
      if (hasArtifact && hasVersion) {
        return true;
      }
    }
    return this._fallbackArtifact !== null && this._fallbackVersion !== null;
  }

  /**
   * Checks if a fallback load is currently in progress.
   */
  get isLoading(): boolean {
    return this._fallbackLoadPromise !== null;
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
      const md = new Metadata();
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

  private async loadSingleArtifact(md: Metadata): Promise<MJArtifactEntity> {
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.currentUser);
    await artifact.Load(this.artifactId);
    return artifact;
  }

  private async loadSingleVersion(md: Metadata): Promise<MJArtifactVersionEntity> {
    const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser);
    await version.Load(this.artifactVersionId);
    return version;
  }
}
