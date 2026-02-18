import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionService } from './artifact-permission.service';

/**
 * State management for artifacts and the artifact panel
 * Handles artifact CRUD operations and caching with permission enforcement
 */
@Injectable({
  providedIn: 'root'
})
export class ArtifactStateService {
  private _activeArtifactId$ = new BehaviorSubject<string | null>(null);
  private _activeVersionNumber$ = new BehaviorSubject<number | null>(null);
  private _artifacts$ = new BehaviorSubject<Map<string, MJArtifactEntity>>(new Map());
  private _isPanelOpen$ = new BehaviorSubject<boolean>(false);
  private _panelMode$ = new BehaviorSubject<'view' | 'edit'>('view');

  // Public observable streams
  public readonly activeArtifactId$ = this._activeArtifactId$.asObservable();
  public readonly activeVersionNumber$ = this._activeVersionNumber$.asObservable();
  public readonly isPanelOpen$ = this._isPanelOpen$.asObservable();
  public readonly panelMode$ = this._panelMode$.asObservable();

  // Derived observable for active artifact
  public readonly activeArtifact$: Observable<MJArtifactEntity | null> = combineLatest([
    this.activeArtifactId$,
    this._artifacts$
  ]).pipe(
    map(([id, artifacts]) => id ? artifacts.get(id) || null : null),
    shareReplay(1)
  );

  constructor(private artifactPermissionService: ArtifactPermissionService) {}

  /**
   * Check if current user can read an artifact
   * @param artifactId The artifact ID
   * @param currentUser The current user context
   * @returns True if user has read permission
   */
  async canReadArtifact(artifactId: string, currentUser: UserInfo): Promise<boolean> {
    return this.artifactPermissionService.checkPermission(artifactId, currentUser.ID, 'read', currentUser);
  }

  /**
   * Check if current user can edit an artifact
   * @param artifactId The artifact ID
   * @param currentUser The current user context
   * @returns True if user has edit permission
   */
  async canEditArtifact(artifactId: string, currentUser: UserInfo): Promise<boolean> {
    return this.artifactPermissionService.checkPermission(artifactId, currentUser.ID, 'edit', currentUser);
  }

  /**
   * Check if current user can share an artifact
   * @param artifactId The artifact ID
   * @param currentUser The current user context
   * @returns True if user has share permission
   */
  async canShareArtifact(artifactId: string, currentUser: UserInfo): Promise<boolean> {
    return this.artifactPermissionService.checkPermission(artifactId, currentUser.ID, 'share', currentUser);
  }

  /**
   * Opens an artifact in the panel
   * @param id The artifact ID
   * @param versionNumber Optional specific version number
   */
  openArtifact(id: string, versionNumber?: number): void {
    this._activeArtifactId$.next(id);
    this._activeVersionNumber$.next(versionNumber || null);
    this._isPanelOpen$.next(true);
  }

  /**
   * Opens an artifact by version ID
   * @param versionId The artifact version ID
   */
  async openArtifactByVersionId(versionId: string): Promise<void> {
    try {
      const md = new Metadata();
      const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions');
      const loaded = await version.Load(versionId);

      if (loaded) {
        // Open the artifact with the specific version number
        this.openArtifact(version.ArtifactID, version.VersionNumber);
      } else {
        console.error('Failed to load artifact version:', versionId);
      }
    } catch (error) {
      console.error('Error loading artifact version:', error);
    }
  }

  /**
   * Closes the artifact panel
   */
  closeArtifact(): void {
    this._activeArtifactId$.next(null);
    this._activeVersionNumber$.next(null);
    this._isPanelOpen$.next(false);
    this._panelMode$.next('view');
  }

  /**
   * Toggles the panel open/closed state
   */
  togglePanel(): void {
    this._isPanelOpen$.next(!this._isPanelOpen$.value);
  }

  /**
   * Sets the panel mode
   * @param mode The mode ('view' or 'edit')
   */
  setPanelMode(mode: 'view' | 'edit'): void {
    this._panelMode$.next(mode);
  }

  /**
   * Caches an artifact in memory
   * @param artifact The artifact to cache
   */
  cacheArtifact(artifact: MJArtifactEntity): void {
    const current = this._artifacts$.value;
    current.set(artifact.ID, artifact);
    this._artifacts$.next(new Map(current));
  }

  /**
   * Removes an artifact from cache
   * @param id The artifact ID
   */
  removeCachedArtifact(id: string): void {
    const current = this._artifacts$.value;
    current.delete(id);
    this._artifacts$.next(new Map(current));
  }

  /**
   * Clears all cached artifacts
   */
  clearCache(): void {
    this._artifacts$.next(new Map());
  }

  /**
   * Loads artifacts for a conversation
   * @param conversationId The conversation ID
   * @param currentUser The current user context
   * @returns Array of artifacts
   */
  async loadArtifactsForConversation(conversationId: string, currentUser: UserInfo): Promise<MJArtifactEntity[]> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJArtifactEntity>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `ConversationID='${conversationId}'`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        currentUser
      );

      if (result.Success && result.Results) {
        // Cache all artifacts
        result.Results.forEach(artifact => this.cacheArtifact(artifact));
        return result.Results;
      }
      return [];
    } catch (error) {
      console.error('Error loading artifacts:', error);
      return [];
    }
  }

  /**
   * Loads artifacts for a collection
   * @param collectionId The collection ID
   * @param currentUser The current user context
   * @returns Array of artifacts
   */
  async loadArtifactsForCollection(collectionId: string, currentUser: UserInfo): Promise<MJArtifactEntity[]> {
    try {
      const rv = new RunView();
      // Load artifacts through the collection join - use subquery to get artifact IDs from versions
      const artifactsResult = await rv.RunView<MJArtifactEntity>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `ID IN (
            SELECT DISTINCT av.ArtifactID
            FROM [__mj].[vwArtifactVersions] av
            INNER JOIN [__mj].[vwCollectionArtifacts] ca ON ca.ArtifactVersionID = av.ID
            WHERE ca.CollectionID = '${collectionId}'
          )`,
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object'
        },
        currentUser
      );

      if (artifactsResult.Success && artifactsResult.Results) {
        artifactsResult.Results.forEach(artifact => this.cacheArtifact(artifact));
        return artifactsResult.Results;
      }
      return [];
    } catch (error) {
      console.error('Error loading collection artifacts:', error);
      return [];
    }
  }

  /**
   * Loads artifact VERSIONS for a collection (all versions, not deduplicated by artifact ID)
   * This method returns each version as a separate item with its parent artifact metadata
   * @param collectionId The collection ID
   * @param currentUser The current user context
   * @returns Array of objects containing version and parent artifact info
   */
  async loadArtifactVersionsForCollection(
    collectionId: string,
    currentUser: UserInfo
  ): Promise<Array<{ version: MJArtifactVersionEntity; artifact: MJArtifactEntity }>> {
    try {
      const rv = new RunView();

      // Load ALL versions in collection (no DISTINCT - each version is separate)
      const versionResult = await rv.RunView<MJArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ID IN (
          SELECT ca.ArtifactVersionID
          FROM [__mj].[vwCollectionArtifacts] ca
          WHERE ca.CollectionID='${collectionId}'
        )`,
        OrderBy: '__mj_UpdatedAt DESC',
        ResultType: 'entity_object'
      }, currentUser);

      if (!versionResult.Success || !versionResult.Results) {
        return [];
      }

      // Load parent artifacts for display metadata
      const artifactIds = [...new Set(versionResult.Results.map(v => v.ArtifactID))];
      const artifactMap = new Map<string, MJArtifactEntity>();

      if (artifactIds.length > 0) {
        const artifactFilter = artifactIds.map(id => `ID='${id}'`).join(' OR ');
        const artifactResult = await rv.RunView<MJArtifactEntity>({
          EntityName: 'MJ: Artifacts',
          ExtraFilter: artifactFilter,
          ResultType: 'entity_object'
        }, currentUser);

        if (artifactResult.Success && artifactResult.Results) {
          artifactResult.Results.forEach(a => {
            artifactMap.set(a.ID, a);
            this.cacheArtifact(a); // Cache parent artifacts
          });
        }
      }

      // Combine version + artifact
      return versionResult.Results
        .map(version => ({
          version,
          artifact: artifactMap.get(version.ArtifactID)!
        }))
        .filter(item => item.artifact != null);
    } catch (error) {
      console.error('Error loading collection artifact versions:', error);
      return [];
    }
  }

  /**
   * Loads a single artifact by ID
   * @param id The artifact ID
   * @param currentUser The current user context
   * @returns The artifact entity or null
   */
  async loadArtifact(id: string, currentUser: UserInfo): Promise<MJArtifactEntity | null> {
    try {
      const md = new Metadata();
      const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', currentUser);
      const loaded = await artifact.Load(id);

      if (loaded) {
        this.cacheArtifact(artifact);
        return artifact;
      }
      return null;
    } catch (error) {
      console.error('Error loading artifact:', error);
      return null;
    }
  }

  /**
   * Creates a new artifact
   * @param data Artifact data
   * @param currentUser The current user context
   * @returns The created artifact
   */
  async createArtifact(data: Partial<MJArtifactEntity>, currentUser: UserInfo): Promise<MJArtifactEntity> {
    const md = new Metadata();
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', currentUser);

    Object.assign(artifact, data);

    const saved = await artifact.Save();
    if (saved) {
      this.cacheArtifact(artifact);
      return artifact;
    } else {
      throw new Error(artifact.LatestResult?.Message || 'Failed to create artifact');
    }
  }

  /**
   * Updates an artifact
   * @param id The artifact ID
   * @param updates The fields to update
   * @param currentUser The current user context
   * @returns True if successful
   */
  async updateArtifact(id: string, updates: Partial<MJArtifactEntity>, currentUser: UserInfo): Promise<boolean> {
    // Check edit permission
    const canEdit = await this.artifactPermissionService.checkPermission(id, currentUser.ID, 'edit', currentUser);
    if (!canEdit) {
      throw new Error('You do not have permission to edit this artifact');
    }

    const md = new Metadata();
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', currentUser);

    const loaded = await artifact.Load(id);
    if (!loaded) {
      throw new Error('Artifact not found');
    }

    Object.assign(artifact, updates);

    const saved = await artifact.Save();
    if (saved) {
      this.cacheArtifact(artifact);
      return true;
    } else {
      throw new Error(artifact.LatestResult?.Message || 'Failed to update artifact');
    }
  }

  /**
   * Deletes an artifact
   * @param id The artifact ID
   * @param currentUser The current user context
   * @returns True if successful
   */
  async deleteArtifact(id: string, currentUser: UserInfo): Promise<boolean> {
    // Check edit permission (required for deletion)
    const canEdit = await this.artifactPermissionService.checkPermission(id, currentUser.ID, 'edit', currentUser);
    if (!canEdit) {
      throw new Error('You do not have permission to delete this artifact');
    }

    const md = new Metadata();
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', currentUser);

    const loaded = await artifact.Load(id);
    if (!loaded) {
      throw new Error('Artifact not found');
    }

    const deleted = await artifact.Delete();
    if (deleted) {
      this.removeCachedArtifact(id);
      if (this._activeArtifactId$.value === id) {
        this.closeArtifact();
      }
      return true;
    } else {
      throw new Error(artifact.LatestResult?.Message || 'Failed to delete artifact');
    }
  }

  /**
   * Adds an artifact version to a collection
   * @param artifactId The artifact ID (for permission checking)
   * @param collectionId The collection ID
   * @param currentUser The current user context
   * @param versionId Optional specific version ID. If not provided, uses latest version
   */
  async addToCollection(artifactId: string, collectionId: string, currentUser: UserInfo, versionId?: string): Promise<void> {
    // Check edit permission (required to modify collection membership)
    const canEdit = await this.artifactPermissionService.checkPermission(artifactId, currentUser.ID, 'edit', currentUser);
    if (!canEdit) {
      throw new Error('You do not have permission to add this artifact to a collection');
    }

    // Get version ID if not provided
    let targetVersionId = versionId;
    if (!targetVersionId) {
      const rv = new RunView();
      const versionResult = await rv.RunView<any>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${artifactId}'`,
          OrderBy: 'VersionNumber DESC',
          MaxRows: 1,
          ResultType: 'entity_object'
        },
        currentUser
      );

      if (!versionResult.Success || !versionResult.Results || versionResult.Results.length === 0) {
        throw new Error('No versions found for artifact');
      }

      targetVersionId = versionResult.Results[0].ID;
    }

    const md = new Metadata();
    const collectionArtifact = await md.GetEntityObject('MJ: Collection Artifacts', currentUser);

    (collectionArtifact as any).CollectionID = collectionId;
    (collectionArtifact as any).ArtifactVersionID = targetVersionId;

    const saved = await collectionArtifact.Save();
    if (!saved) {
      throw new Error('Failed to add artifact to collection');
    }
  }

  /**
   * Removes all versions of an artifact from a collection
   * @param artifactId The artifact ID
   * @param collectionId The collection ID
   * @param currentUser The current user context
   */
  async removeFromCollection(artifactId: string, collectionId: string, currentUser: UserInfo): Promise<void> {
    // Check edit permission (required to modify collection membership)
    const canEdit = await this.artifactPermissionService.checkPermission(artifactId, currentUser.ID, 'edit', currentUser);
    if (!canEdit) {
      throw new Error('You do not have permission to remove this artifact from a collection');
    }

    const rv = new RunView();
    // Find all versions of this artifact in the collection
    const result = await rv.RunView<any>(
      {
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${collectionId}' AND ArtifactVersionID IN (
          SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${artifactId}'
        )`,
        ResultType: 'entity_object'
      },
      currentUser
    );

    if (!result.Success) {
      throw new Error(result.ErrorMessage || 'Failed to find collection artifact');
    }

    if (!result.Results || result.Results.length === 0) {
      throw new Error('Collection artifact link not found');
    }

    // Delete all version associations
    for (const collectionArtifact of result.Results) {
      const deleted = await collectionArtifact.Delete();
      if (!deleted) {
        const errorMsg = collectionArtifact.LatestResult?.Message || 'Failed to remove artifact from collection';
        throw new Error(errorMsg);
      }
    }
  }
}