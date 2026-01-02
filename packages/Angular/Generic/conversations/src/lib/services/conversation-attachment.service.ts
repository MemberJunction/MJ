import { Injectable } from '@angular/core';
import { RunView, Metadata, UserInfo } from '@memberjunction/core';
import {
  ConversationDetailAttachmentEntity,
  AIModalityEntity
} from '@memberjunction/core-entities';
import {
  ConversationUtility,
  AttachmentContent,
  AttachmentType
} from '@memberjunction/ai-core-plus';
import { MessageAttachment } from '../components/message/message-item.component';
import { PendingAttachment } from '../components/mention/mention-editor.component';

/**
 * Service for managing conversation attachments.
 * Handles loading, saving, and converting attachments between different formats.
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationAttachmentService {
  private modalityCache: Map<string, AIModalityEntity> = new Map();
  private modalityByNameCache: Map<string, AIModalityEntity> = new Map();

  constructor() {}

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
      const rv = new RunView();
      const idList = conversationDetailIds.map(id => `'${id}'`).join(',');

      const attachmentResult = await rv.RunView<ConversationDetailAttachmentEntity>({
        EntityName: 'MJ: Conversation Detail Attachments',
        ExtraFilter: `ConversationDetailID IN (${idList})`,
        OrderBy: 'DisplayOrder ASC, __mj_CreatedAt ASC',
        ResultType: 'entity_object'
      }, contextUser);

      if (attachmentResult.Success && attachmentResult.Results) {
        for (const attachment of attachmentResult.Results) {
          const detailId = attachment.ConversationDetailID;

          if (!result.has(detailId)) {
            result.set(detailId, []);
          }

          const messageAttachment = this.convertToMessageAttachment(attachment);
          result.get(detailId)!.push(messageAttachment);
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
  ): Promise<ConversationDetailAttachmentEntity[]> {
    const savedAttachments: ConversationDetailAttachmentEntity[] = [];
    const md = new Metadata();

    // Ensure modality cache is loaded
    await this.ensureModalityCacheLoaded(contextUser);

    for (let i = 0; i < pendingAttachments.length; i++) {
      const pending = pendingAttachments[i];

      try {
        const attachment = await md.GetEntityObject<ConversationDetailAttachmentEntity>(
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

        // Store inline data - extract base64 from data URL
        if (pending.dataUrl) {
          const base64Data = this.extractBase64FromDataUrl(pending.dataUrl);
          attachment.InlineData = base64Data;
        }

        const saved = await attachment.Save();
        if (saved) {
          savedAttachments.push(attachment);
        } else {
          console.error('Failed to save attachment:', attachment.LatestResult);
        }
      } catch (error) {
        console.error('Error saving attachment:', error);
      }
    }

    return savedAttachments;
  }

  /**
   * Create attachment reference tokens for message text.
   * These tokens are stored in the Message field to reference attachments.
   */
  createAttachmentReferences(attachments: ConversationDetailAttachmentEntity[]): string {
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
  private convertToMessageAttachment(entity: ConversationDetailAttachmentEntity): MessageAttachment {
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
    const modality = this.modalityCache.get(modalityId);
    if (!modality) return 'Document';

    const name = modality.Name?.toLowerCase() || '';
    if (name === 'image') return 'Image';
    if (name === 'video') return 'Video';
    if (name === 'audio') return 'Audio';
    return 'Document';
  }

  /**
   * Get the modality ID for an attachment type
   */
  private getModalityIdForType(type: AttachmentType): string {
    const modalityName = type.toLowerCase();
    const modality = this.modalityByNameCache.get(modalityName);

    if (modality) {
      return modality.ID;
    }

    // Fallback to 'file' modality if specific type not found
    const fileModality = this.modalityByNameCache.get('file');
    return fileModality?.ID || '';
  }

  /**
   * Ensure the modality cache is loaded
   */
  private async ensureModalityCacheLoaded(contextUser?: UserInfo): Promise<void> {
    if (this.modalityCache.size > 0) {
      return; // Already loaded
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<AIModalityEntity>({
        EntityName: 'MJ: AI Modalities',
        ResultType: 'entity_object'
      }, contextUser);

      if (result.Success && result.Results) {
        for (const modality of result.Results) {
          this.modalityCache.set(modality.ID, modality);
          this.modalityByNameCache.set(modality.Name.toLowerCase(), modality);
        }
      }
    } catch (error) {
      console.error('Error loading modalities:', error);
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
