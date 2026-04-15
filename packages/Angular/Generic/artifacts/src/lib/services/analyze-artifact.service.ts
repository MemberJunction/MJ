import { Injectable } from '@angular/core';
import { DataSnapshot, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  MJArtifactEntity,
  MJArtifactVersionEntity,
  MJConversationEntity,
  MJConversationDetailEntity,
  MJConversationDetailArtifactEntity,
} from '@memberjunction/core-entities';

/**
 * Arguments for {@link AnalyzeArtifactService.StartAnalysisConversation}.
 */
export interface StartAnalysisConversationArgs {
  /** The DataSnapshot captured from the source artifact's GetCurrentStateSnapshot(). */
  snapshot: DataSnapshot;
  /** Context user for all entity saves. */
  currentUser: UserInfo;
  /** Environment the new conversation and artifact belong to. */
  environmentId: string;
  /** Optional title override. Defaults to snapshot.title or 'Untitled Snapshot'. */
  title?: string;
  /** Optional initial user message text. Defaults to 'Analyze "<title>"'. */
  initialMessage?: string;
}

/**
 * Result of {@link AnalyzeArtifactService.StartAnalysisConversation}.
 */
export interface AnalyzeArtifactResult {
  conversationId: string;
  conversationDetailId: string;
  artifactId: string;
  artifactVersionId: string;
}

/**
 * Plumbing for the standalone "Analyze" flow (unified data layer plan §8.8).
 *
 * Given a captured {@link DataSnapshot} from any artifact viewer, creates a
 * fresh "Data Snapshot" artifact containing the snapshot JSON, a new
 * conversation, an initial user message, and a junction linking the artifact
 * version as `Direction='Input'` on that message. Agent kickoff and navigation
 * are the caller's responsibility.
 *
 * Consumers subscribe to `(analyzeRequested)` on `<mj-artifact-viewer-panel>`,
 * call `StartAnalysisConversation`, then route the user to the returned
 * `conversationId`.
 */
@Injectable({ providedIn: 'root' })
export class AnalyzeArtifactService {
  /**
   * Create a new analysis conversation seeded with the captured snapshot.
   * Performs six sequential saves; throws with the underlying entity error
   * message on any failure.
   */
  async StartAnalysisConversation(args: StartAnalysisConversationArgs): Promise<AnalyzeArtifactResult> {
    const { snapshot, currentUser, environmentId } = args;
    const title = args.title || snapshot.title || 'Untitled Snapshot';
    const initialMessage = args.initialMessage || `Analyze "${title}"`;

    // 1. Resolve the "Data Snapshot" artifact type
    const engine = ArtifactMetadataEngine.Instance;
    await engine.Config(false, currentUser);
    const snapshotType = engine.FindArtifactType('Data Snapshot');
    if (!snapshotType) {
      throw new Error(
        'AnalyzeArtifactService: "Data Snapshot" artifact type not found. Ensure metadata has been pushed.',
      );
    }

    const md = new Metadata();

    // 2. Create the artifact
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', currentUser);
    artifact.Name = title;
    artifact.Description = `Snapshot captured for analysis at ${new Date().toISOString()}`;
    artifact.TypeID = snapshotType.ID;
    artifact.UserID = currentUser.ID;
    artifact.EnvironmentID = environmentId;
    if (!(await artifact.Save())) {
      throw new Error(`Failed to save artifact: ${artifact.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    // 3. Create version 1 with the snapshot JSON inline
    const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', currentUser);
    version.ArtifactID = artifact.ID;
    version.VersionNumber = 1;
    version.Content = JSON.stringify(snapshot);
    version.UserID = currentUser.ID;
    version.Name = title;
    if (!(await version.Save())) {
      throw new Error(`Failed to save artifact version: ${version.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    // 4. Create the conversation
    const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', currentUser);
    conversation.Name = `Analyze: ${title}`;
    conversation.UserID = currentUser.ID;
    conversation.EnvironmentID = environmentId;
    if (!(await conversation.Save())) {
      throw new Error(`Failed to save conversation: ${conversation.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    // 5. Seed the initial user message
    const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', currentUser);
    detail.ConversationID = conversation.ID;
    detail.Role = 'User';
    detail.Message = initialMessage;
    if (!(await detail.Save())) {
      throw new Error(`Failed to save conversation detail: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    // 6. Link the snapshot as an input artifact on that message
    const junction = await md.GetEntityObject<MJConversationDetailArtifactEntity>('MJ: Conversation Detail Artifacts', currentUser);
    junction.ConversationDetailID = detail.ID;
    junction.ArtifactVersionID = version.ID;
    junction.Direction = 'Input';
    if (!(await junction.Save())) {
      throw new Error(`Failed to link artifact to conversation: ${junction.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    LogStatus(
      `[AnalyzeArtifactService] Created conversation ${conversation.ID} with input artifact ${artifact.ID} v${version.VersionNumber}`,
    );

    return {
      conversationId: conversation.ID,
      conversationDetailId: detail.ID,
      artifactId: artifact.ID,
      artifactVersionId: version.ID,
    };
  }
}
