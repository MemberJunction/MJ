import { Injectable } from '@angular/core';
import { RunView, Metadata } from '@memberjunction/core';
import {
  ConversationEntity,
  ConversationArtifactEntity,
  ConversationArtifactVersionEntity
} from '@memberjunction/core-entities';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentStudioStateService } from './component-studio-state.service';

/**
 * Represents a single entry in the version history for a component artifact.
 */
export interface VersionHistoryEntry {
  ID: string;
  VersionNumber: number;
  Timestamp: Date;
  Comment: string;
  AuthorName?: string;
}

/**
 * Service that handles explicit, user-triggered versioning for Component Studio.
 * Follows a git-commit style model where each save creates a new immutable version.
 */
@Injectable()
export class ComponentVersionService {

  // --- State Tracking ---
  private _currentArtifactID: string | null = null;
  private _currentVersionNumber = 0;
  private _versionHistory: VersionHistoryEntry[] = [];
  private _componentArtifactTypeID: string | null = null;
  private _cachedConversationID: string | null = null;

  private metadata: Metadata = new Metadata();

  get CurrentArtifactID(): string | null { return this._currentArtifactID; }
  set CurrentArtifactID(value: string | null) { this._currentArtifactID = value; }

  get CurrentVersionNumber(): number { return this._currentVersionNumber; }

  get VersionHistory(): VersionHistoryEntry[] { return this._versionHistory; }

  constructor(private stateService: ComponentStudioStateService) {}

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Save current working state as a new version.
   * Creates the ConversationArtifact if one does not yet exist for this component.
   * @param comment - optional user comment describing the version
   * @returns true if the version was saved successfully
   */
  async SaveVersion(comment?: string): Promise<boolean> {
    try {
      const spec = this.stateService.GetCurrentSpec();
      if (!spec) {
        console.error('ComponentVersionService: No current spec available to save.');
        return false;
      }

      const artifactId = await this.ensureArtifactExists(spec);
      if (!artifactId) {
        console.error('ComponentVersionService: Failed to create or resolve artifact.');
        return false;
      }

      const nextVersion = await this.resolveNextVersionNumber(artifactId);
      const versionComment = comment || `Auto-saved at ${new Date().toISOString()}`;

      const saved = await this.createVersion(artifactId, nextVersion, spec, versionComment);
      if (saved) {
        this._currentArtifactID = artifactId;
        this._currentVersionNumber = nextVersion;
        // Refresh the cached history
        this._versionHistory = await this.fetchVersionHistory(artifactId);
        return true;
      }

      return false;
    } catch (error) {
      console.error('ComponentVersionService: Error saving version:', error);
      return false;
    }
  }

  /**
   * Update the current (latest) version in place instead of creating a new one.
   * @param comment - optional updated comment
   * @returns true if the version was updated successfully
   */
  async UpdateCurrentVersion(comment?: string): Promise<boolean> {
    try {
      if (!this._currentArtifactID || this._currentVersionNumber === 0) {
        console.error('ComponentVersionService: No current version to update.');
        return false;
      }

      const spec = this.stateService.GetCurrentSpec();
      if (!spec) {
        console.error('ComponentVersionService: No current spec available.');
        return false;
      }

      const latestVersion = await this.findLatestVersionEntity(this._currentArtifactID);
      if (!latestVersion) {
        console.error('ComponentVersionService: Could not find latest version entity.');
        return false;
      }

      latestVersion.Content = JSON.stringify(spec, null, 2);
      if (comment) {
        latestVersion.Comments = comment;
      }

      const saved = await latestVersion.Save();
      if (saved) {
        this._versionHistory = await this.fetchVersionHistory(this._currentArtifactID);
        return true;
      }
      return false;
    } catch (error) {
      console.error('ComponentVersionService: Error updating current version:', error);
      return false;
    }
  }

  /**
   * Load all versions for a given artifact, ordered by version number descending.
   * @param artifactId - the ConversationArtifact ID to load history for
   * @returns array of version history entries, newest first
   */
  async LoadVersionHistory(artifactId: string): Promise<VersionHistoryEntry[]> {
    const history = await this.fetchVersionHistory(artifactId);
    this._versionHistory = history;
    return history;
  }

  /**
   * Restore a previous version by creating a NEW version with the old content.
   * This preserves the full history chain rather than overwriting.
   * @param versionId - the ConversationArtifactVersion ID to restore
   * @returns true if the version was restored successfully
   */
  async RestoreVersion(versionId: string): Promise<boolean> {
    try {
      const versionEntity = await this.loadVersionEntity(versionId);
      if (!versionEntity) {
        console.error('ComponentVersionService: Could not load version', versionId);
        return false;
      }

      const spec = this.parseVersionContent(versionEntity);
      if (!spec) {
        console.error('ComponentVersionService: Could not parse version content');
        return false;
      }

      const restoredVersionNumber = versionEntity.Version;
      const restoreComment = `Restored from v${restoredVersionNumber}`;

      // Update the state with the restored spec before saving
      this.stateService.UpdateSpec(spec);

      // SaveVersion will pick up the restored spec from the state service
      return await this.SaveVersion(restoreComment);
    } catch (error) {
      console.error('ComponentVersionService: Error restoring version:', error);
      return false;
    }
  }

  /**
   * Load two versions and return their content for diffing.
   * @param versionId1 - the first version ID (typically the older one)
   * @param versionId2 - the second version ID (typically the newer one)
   * @returns an object with the before and after content strings
   */
  async GetVersionDiff(versionId1: string, versionId2: string): Promise<{ before: string; after: string }> {
    const [version1, version2] = await Promise.all([
      this.loadVersionEntity(versionId1),
      this.loadVersionEntity(versionId2)
    ]);

    return {
      before: version1?.Content || '',
      after: version2?.Content || ''
    };
  }

  /**
   * Reset the service state, typically when switching components.
   */
  Reset(): void {
    this._currentArtifactID = null;
    this._currentVersionNumber = 0;
    this._versionHistory = [];
    // Keep _cachedConversationID — it's user-level, not component-level
  }

  // ============================================================
  // PRIVATE: ARTIFACT MANAGEMENT
  // ============================================================

  /**
   * Ensures a ConversationArtifact record exists for the current component.
   * If CurrentArtifactID is already set, returns that. Otherwise creates a new one.
   */
  private async ensureArtifactExists(spec: ComponentSpec): Promise<string | null> {
    if (this._currentArtifactID) {
      return this._currentArtifactID;
    }

    return await this.createArtifact(spec);
  }

  /**
   * Creates a new ConversationArtifact for the given component spec.
   */
  private async createArtifact(spec: ComponentSpec): Promise<string | null> {
    try {
      const artifactTypeId = await this.resolveComponentArtifactTypeID();
      if (!artifactTypeId) {
        console.error('ComponentVersionService: Could not resolve "Component" artifact type.');
        return null;
      }

      const conversationId = await this.resolveConversationID();
      if (!conversationId) {
        console.error('ComponentVersionService: No conversation ID available for artifact creation.');
        return null;
      }

      const artifact = await this.metadata.GetEntityObject<ConversationArtifactEntity>('MJ: Conversation Artifacts');
      artifact.Name = spec.name || 'Untitled Component';
      artifact.Description = spec.description || null;
      artifact.ConversationID = conversationId;
      artifact.ArtifactTypeID = artifactTypeId;
      artifact.SharingScope = 'None';

      const saved = await artifact.Save();
      if (saved) {
        this._currentArtifactID = artifact.ID;
        return artifact.ID;
      }

      console.error('ComponentVersionService: Failed to save artifact.');
      return null;
    } catch (error) {
      console.error('ComponentVersionService: Error creating artifact:', error);
      return null;
    }
  }

  /**
   * Looks up the artifact type ID for "Component" from MJ: Artifact Types.
   * Caches the result to avoid repeated lookups.
   */
  private async resolveComponentArtifactTypeID(): Promise<string | null> {
    if (this._componentArtifactTypeID) {
      return this._componentArtifactTypeID;
    }

    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>({
      EntityName: 'MJ: Artifact Types',
      ExtraFilter: `Name='Component'`,
      Fields: ['ID'],
      ResultType: 'simple'
    });

    if (result.Success && result.Results.length > 0) {
      this._componentArtifactTypeID = result.Results[0].ID;
      return this._componentArtifactTypeID;
    }

    console.error('ComponentVersionService: "Component" artifact type not found.');
    return null;
  }

  /**
   * Resolves or creates a Conversation record for Component Studio artifacts.
   * Caches the result for subsequent saves within the same session.
   */
  private async resolveConversationID(): Promise<string | null> {
    if (this._cachedConversationID) {
      return this._cachedConversationID;
    }

    const currentUser = this.metadata.CurrentUser;
    if (!currentUser) {
      return null;
    }

    // Look for an existing Component Studio conversation for this user
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>({
      EntityName: 'Conversations',
      ExtraFilter: `UserID='${currentUser.ID}' AND Name='Component Studio'`,
      Fields: ['ID'],
      MaxRows: 1,
      ResultType: 'simple'
    });

    if (result.Success && result.Results.length > 0) {
      this._cachedConversationID = result.Results[0].ID;
      return this._cachedConversationID;
    }

    // Create a new conversation for Component Studio
    const conversation = await this.metadata.GetEntityObject<ConversationEntity>('Conversations');
    conversation.UserID = currentUser.ID;
    conversation.Name = 'Component Studio';
    conversation.Type = 'Skip';

    const saved = await conversation.Save();
    if (saved) {
      this._cachedConversationID = conversation.ID;
      return this._cachedConversationID;
    }

    console.error('ComponentVersionService: Failed to create Component Studio conversation.');
    return null;
  }

  // ============================================================
  // PRIVATE: VERSION MANAGEMENT
  // ============================================================

  /**
   * Determines the next version number for the given artifact.
   */
  private async resolveNextVersionNumber(artifactId: string): Promise<number> {
    const rv = new RunView();
    const result = await rv.RunView<{ Version: number }>({
      EntityName: 'MJ: Conversation Artifact Versions',
      ExtraFilter: `ConversationArtifactID='${artifactId}'`,
      Fields: ['Version'],
      OrderBy: 'Version DESC',
      MaxRows: 1,
      ResultType: 'simple'
    });

    if (result.Success && result.Results.length > 0) {
      return result.Results[0].Version + 1;
    }

    return 1;
  }

  /**
   * Creates and saves a new ConversationArtifactVersion record.
   */
  private async createVersion(
    artifactId: string,
    versionNumber: number,
    spec: ComponentSpec,
    comment: string
  ): Promise<boolean> {
    try {
      const version = await this.metadata.GetEntityObject<ConversationArtifactVersionEntity>(
        'MJ: Conversation Artifact Versions'
      );
      version.ConversationArtifactID = artifactId;
      version.Version = versionNumber;
      version.Content = JSON.stringify(spec, null, 2);
      version.Comments = comment;

      return await version.Save();
    } catch (error) {
      console.error('ComponentVersionService: Error creating version record:', error);
      return false;
    }
  }

  /**
   * Loads a single ConversationArtifactVersion entity by ID.
   */
  private async loadVersionEntity(versionId: string): Promise<ConversationArtifactVersionEntity | null> {
    try {
      const entity = await this.metadata.GetEntityObject<ConversationArtifactVersionEntity>(
        'MJ: Conversation Artifact Versions'
      );
      const loaded = await entity.Load(versionId);
      return loaded ? entity : null;
    } catch (error) {
      console.error('ComponentVersionService: Error loading version entity:', error);
      return null;
    }
  }

  /**
   * Finds the latest version entity for the given artifact.
   */
  private async findLatestVersionEntity(artifactId: string): Promise<ConversationArtifactVersionEntity | null> {
    const rv = new RunView();
    const result = await rv.RunView<ConversationArtifactVersionEntity>({
      EntityName: 'MJ: Conversation Artifact Versions',
      ExtraFilter: `ConversationArtifactID='${artifactId}'`,
      OrderBy: 'Version DESC',
      MaxRows: 1,
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results.length > 0) {
      return result.Results[0];
    }
    return null;
  }

  /**
   * Parses the Content field of a version entity back into a ComponentSpec.
   */
  private parseVersionContent(versionEntity: ConversationArtifactVersionEntity): ComponentSpec | null {
    try {
      const content = versionEntity.Content;
      if (!content) {
        return null;
      }
      return JSON.parse(content) as ComponentSpec;
    } catch (error) {
      console.error('ComponentVersionService: Failed to parse version content:', error);
      return null;
    }
  }

  // ============================================================
  // PRIVATE: HISTORY LOADING
  // ============================================================

  /**
   * Fetches the full version history for an artifact, ordered newest-first.
   */
  private async fetchVersionHistory(artifactId: string): Promise<VersionHistoryEntry[]> {
    const rv = new RunView();
    const result = await rv.RunView<ConversationArtifactVersionEntity>({
      EntityName: 'MJ: Conversation Artifact Versions',
      ExtraFilter: `ConversationArtifactID='${artifactId}'`,
      OrderBy: 'Version DESC',
      ResultType: 'entity_object'
    });

    if (!result.Success) {
      console.error('ComponentVersionService: Failed to load version history:', result.ErrorMessage);
      return [];
    }

    return result.Results.map(v => this.mapVersionToHistoryEntry(v));
  }

  /**
   * Maps a ConversationArtifactVersionEntity to a VersionHistoryEntry.
   */
  private mapVersionToHistoryEntry(version: ConversationArtifactVersionEntity): VersionHistoryEntry {
    return {
      ID: version.ID,
      VersionNumber: version.Version,
      Timestamp: version.__mj_CreatedAt,
      Comment: version.Comments || ''
    };
  }
}
