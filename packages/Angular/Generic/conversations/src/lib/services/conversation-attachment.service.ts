import { Injectable } from '@angular/core';
import { RunView, Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import {
  MJConversationDetailAttachmentEntity,
  MJConversationDetailArtifactEntity,
  MJArtifactVersionEntity,
  MJArtifactEntity,
  MJAIModalityEntity,
  ArtifactMetadataEngine
} from '@memberjunction/core-entities';
import {
  ConversationUtility,
  AttachmentContent,
  AttachmentType
} from '@memberjunction/ai-core-plus';
import { MessageAttachment } from '../components/message/message-item.component';
import { PendingAttachment } from '../components/mention/mention-editor.component';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Service for managing conversation attachments.
 * Handles loading, saving, and converting attachments between different formats.
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationAttachmentService {
  private _provider: IMetadataProvider | null = null;

  constructor() {}

  /**
   * Set the metadata provider this service should use. When unset, falls back to Metadata.Provider.
   */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  /**
   * Load all attachments for a list of conversation detail IDs.
   * Returns a map of ConversationDetailID -> MessageAttachment[]
   */
  async loadAttachmentsForMessages(
    conversationDetailIds: string[],
    contextUser?: UserInfo
  ): Promise<Map<string, MessageAttachment[]>> {
    const result = new Map<string, MessageAttachment[]>();

    if (!conversationDetailIds || conversationDetailIds.length === 0) {
      return result;
    }

    try {
      const rv = RunView.FromMetadataProvider(this.Provider);
      const idList = conversationDetailIds.map(id => `'${id}'`).join(',');

      // Load input artifacts (ConversationDetailArtifact with Direction='Input').
      // Since the backfill migration (V202605271400__Backfill_Attachment_Artifacts)
      // converted all legacy ConversationDetailAttachment rows to artifact pairs,
      // the artifact junction is the single source of truth — no separate attachment
      // query needed.
      const artifactLinksResult = await rv.RunView<MJConversationDetailArtifactEntity>({
        EntityName: 'MJ: Conversation Detail Artifacts',
        ExtraFilter: `ConversationDetailID IN (${idList}) AND Direction = 'Input'`,
        ResultType: 'entity_object'
      }, contextUser);

      if (artifactLinksResult.Success && artifactLinksResult.Results && artifactLinksResult.Results.length > 0) {
        // Load the referenced artifact versions AND their parent artifacts in parallel
        // so we can resolve the semantic artifact-type name for the tile badge.
        const versionIds = artifactLinksResult.Results.map(l => `'${l.ArtifactVersionID}'`).join(',');
        const versionsResult = await rv.RunView<MJArtifactVersionEntity>({
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ID IN (${versionIds})`,
          ResultType: 'entity_object'
        }, contextUser);

        if (versionsResult.Success && versionsResult.Results) {
          const versionMap = new Map<string, MJArtifactVersionEntity>();
          for (const v of versionsResult.Results) {
            versionMap.set(v.ID, v);
          }

          // Bulk-load parent artifacts to get TypeID, then resolve type names via cached engine.
          const artifactIds = Array.from(new Set(versionsResult.Results.map(v => v.ArtifactID).filter(Boolean)));
          const artifactMap = new Map<string, MJArtifactEntity>();
          if (artifactIds.length > 0) {
            const artifactIdList = artifactIds.map(id => `'${id}'`).join(',');
            const artifactsResult = await rv.RunView<MJArtifactEntity>({
              EntityName: 'MJ: Artifacts',
              ExtraFilter: `ID IN (${artifactIdList})`,
              ResultType: 'entity_object'
            }, contextUser);
            if (artifactsResult.Success && artifactsResult.Results) {
              for (const a of artifactsResult.Results) {
                artifactMap.set(a.ID, a);
              }
            }
            // Ensure the artifact-type cache is populated so FindArtifactTypeByID resolves.
            await ArtifactMetadataEngine.Instance.Config(false, contextUser);
          }

          for (const link of artifactLinksResult.Results) {
            const version = versionMap.get(link.ArtifactVersionID);
            if (version) {
              const parentArtifact = artifactMap.get(version.ArtifactID);
              const artifactType = parentArtifact
                ? ArtifactMetadataEngine.Instance.FindArtifactTypeByID(parentArtifact.TypeID)
                : undefined;
              const detailId = link.ConversationDetailID;
              if (!result.has(detailId)) {
                result.set(detailId, []);
              }
              result.get(detailId)!.push({
                id: link.ID,
                type: version.ContentMode === 'File' ? this.getMimeAttachmentType(version.MimeType || '') : 'Document',
                mimeType: version.MimeType || 'text/plain',
                fileName: version.FileName || version.Name || 'Artifact',
                sizeBytes: version.ContentSizeBytes || 0,
                source: 'artifact',
                artifactId: version.ArtifactID || undefined,
                artifactVersionId: version.ID,
                artifactTypeName: artifactType?.Name || undefined
              } as MessageAttachment);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading attachments:', error);
    }

    return result;
  }

  /**
   * Load attachments for a single message
   */
  async loadAttachmentsForMessage(
    conversationDetailId: string,
    contextUser?: UserInfo
  ): Promise<MessageAttachment[]> {
    const map = await this.loadAttachmentsForMessages([conversationDetailId], contextUser);
    return map.get(conversationDetailId) || [];
  }

  /**
   * Save pending attachments to the database.
   * Returns the saved attachment entities.
   *
   * @param conversationDetailId - ID of the conversation detail to attach to
   * @param pendingAttachments - Array of pending attachments from the mention editor
   * @param contextUser - User context for the operation
   */
  async saveAttachments(
    conversationDetailId: string,
    pendingAttachments: PendingAttachment[],
    contextUser?: UserInfo
  ): Promise<MJConversationDetailAttachmentEntity[]> {
    const savedAttachments: MJConversationDetailAttachmentEntity[] = [];
    const rejectionMessages: string[] = [];
    const md = this.Provider;

    for (let i = 0; i < pendingAttachments.length; i++) {
      const pending = pendingAttachments[i];

      try {
        const attachment = await md.GetEntityObject<MJConversationDetailAttachmentEntity>(
          'MJ: Conversation Detail Attachments',
          contextUser
        );

        // Determine attachment type from MIME type
        const attachmentType = ConversationUtility.GetAttachmentTypeFromMime(pending.mimeType);

        attachment.ConversationDetailID = conversationDetailId;
        attachment.ModalityID = this.getModalityIdForType(attachmentType);
        attachment.MimeType = pending.mimeType;
        attachment.FileName = pending.fileName;
        attachment.FileSizeBytes = pending.sizeBytes;
        attachment.Width = pending.width ?? null;
        attachment.Height = pending.height ?? null;
        attachment.DurationSeconds = null; // PendingAttachment doesn't have duration
        attachment.DisplayOrder = i;
        attachment.ThumbnailBase64 = pending.thumbnailUrl ?? null;

        // For artifact references, create a ConversationDetailArtifact with Direction='Input'
        // instead of a ConversationDetailAttachment
        if (pending.source === 'artifact' && pending.artifactVersionId) {
          const artifactLink = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts',
            contextUser
          );
          artifactLink.ConversationDetailID = conversationDetailId;
          artifactLink.ArtifactVersionID = pending.artifactVersionId;
          artifactLink.Direction = 'Input';
          const artifactSaved = await artifactLink.Save();
          if (!artifactSaved) {
            console.error('Failed to save artifact input link:', artifactLink.LatestResult);
          }
          continue; // Skip creating a ConversationDetailAttachment for artifacts
        }

        // Store inline data for uploaded files
        if (pending.dataUrl) {
          const base64Data = this.extractBase64FromDataUrl(pending.dataUrl);
          attachment.InlineData = base64Data;
        }

        const saved = await attachment.Save();
        if (saved) {
          savedAttachments.push(attachment);
        } else {
          const message = attachment.LatestResult?.CompleteMessage
            ?? `Attachment "${pending.fileName}" was rejected by the server.`;
          console.error('Failed to save attachment:', attachment.LatestResult);
          rejectionMessages.push(message);
        }
      } catch (error) {
        console.error('Error saving attachment:', error);
        rejectionMessages.push(
          `Attachment "${pending.fileName}" failed to upload: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Surface server-side rejections (e.g. unregistered MIME types) to the
    // caller — throwing here lets the message-input toast pipeline display
    // the actual server message rather than silently dropping the file.
    if (rejectionMessages.length > 0) {
      throw new Error(rejectionMessages.join('\n'));
    }

    return savedAttachments;
  }

  /**
   * Create attachment reference tokens for message text.
   * These tokens are stored in the Message field to reference attachments.
   */
  createAttachmentReferences(attachments: MJConversationDetailAttachmentEntity[]): string {
    return attachments
      .map(att => {
        const content: AttachmentContent = {
          _mode: 'attachment',
          id: att.ID,
          type: this.getAttachmentTypeFromModality(att.ModalityID),
          mimeType: att.MimeType,
          fileName: att.FileName ?? undefined,
          sizeBytes: att.FileSizeBytes,
          width: att.Width ?? undefined,
          height: att.Height ?? undefined,
          durationSeconds: att.DurationSeconds ?? undefined,
          thumbnailBase64: att.ThumbnailBase64 ?? undefined
        };
        return ConversationUtility.CreateAttachmentReference(content);
      })
      .join(' ');
  }

  /**
   * Convert a database entity to a MessageAttachment for display
   */
  private convertToMessageAttachment(entity: MJConversationDetailAttachmentEntity): MessageAttachment {
    // Determine content URL
    let contentUrl: string | undefined;
    let thumbnailUrl: string | undefined;

    if (entity.InlineData) {
      // Create data URL from inline data
      contentUrl = `data:${entity.MimeType};base64,${entity.InlineData}`;
    } else if (entity.FileID) {
      // TODO: Integrate with MJStorage to get pre-authenticated URL
      contentUrl = undefined; // Will need to be loaded separately
    }

    // Use thumbnail if available
    if (entity.ThumbnailBase64) {
      thumbnailUrl = entity.ThumbnailBase64.startsWith('data:')
        ? entity.ThumbnailBase64
        : `data:image/jpeg;base64,${entity.ThumbnailBase64}`;
    }

    return {
      id: entity.ID,
      type: this.getAttachmentTypeFromModality(entity.ModalityID),
      mimeType: entity.MimeType,
      fileName: entity.FileName,
      sizeBytes: entity.FileSizeBytes,
      width: entity.Width ?? undefined,
      height: entity.Height ?? undefined,
      thumbnailUrl: thumbnailUrl,
      contentUrl: contentUrl
    };
  }

  /**
   * Get the AttachmentType from a modality ID
   */
  private getAttachmentTypeFromModality(modalityId: string): AttachmentType {
    const modality = AIEngineBase.Instance.Modalities.find(m => UUIDsEqual(m.ID, modalityId))

    const name = modality?.Name?.toLowerCase() || '';

    if (name === 'image') return 'Image';
    if (name === 'video') return 'Video';
    if (name === 'audio') return 'Audio';

    return 'Document';
  }

  /**
   * Get the AttachmentType from a MIME type string
   */
  private getMimeAttachmentType(mimeType: string): 'Image' | 'Video' | 'Audio' | 'Document' {
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    return 'Document';
  }

  /**
   * Get the modality ID for an attachment type
   */
  private getModalityIdForType(type: AttachmentType): string {
    // Map AttachmentType to modality name
    // AttachmentType is 'Image' | 'Video' | 'Audio' | 'Document'
    // Modality names are 'Image', 'Audio', 'Video', 'File'
    let modalityName = type.toLowerCase().trim();
    if (modalityName === 'document') {
      modalityName = 'file';
    }

    const modality = AIEngineBase.Instance.Modalities.find(m => m.Name?.trim().toLowerCase() === modalityName);
    if (modality) {
      return modality.ID;
    }

    // Fallback to 'file' modality if specific type not found
    // recursive call, so long as the current modality isn't file as that
    // would cause infinite recursion/stack overflow
    if (modalityName !== 'file') {
      return this.getModalityIdForType('Document');
    }
    else {
      return '';
    }
  }
 
  /**
   * Extract base64 data from a data URL
   */
  private extractBase64FromDataUrl(dataUrl: string): string {
    const matches = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    return matches ? matches[1] : dataUrl;
  }

  /**
   * Create a thumbnail from an image file.
   * Returns a base64 data URL of the thumbnail.
   */
  async createThumbnail(
    file: File,
    maxSize: number = 200
  ): Promise<string | null> {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Scale down to maxSize
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          } else {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Get image dimensions from a file
   */
  async getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => resolve(null);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Process a file and create a PendingAttachment.
   * This creates the data structure needed for the mention editor component.
   */
  async processFile(file: File): Promise<PendingAttachment> {
    // Read file data URL
    const dataUrl = await this.fileToDataUrl(file);

    const pending: PendingAttachment = {
      id: this.generateTempId(),
      file: file,
      dataUrl: dataUrl,
      mimeType: file.type,
      fileName: file.name,
      sizeBytes: file.size
    };

    // Get image dimensions and create thumbnail
    const type = ConversationUtility.GetAttachmentTypeFromMime(file.type);
    if (type === 'Image') {
      const dimensions = await this.getImageDimensions(file);
      if (dimensions) {
        pending.width = dimensions.width;
        pending.height = dimensions.height;
      }

      const thumbnail = await this.createThumbnail(file);
      if (thumbnail) {
        pending.thumbnailUrl = thumbnail;
      }
    }

    return pending;
  }

  /**
   * Convert a file to a data URL
   */
  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Generate a temporary ID for pending attachments
   */
  private generateTempId(): string {
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
