/**
 * @fileoverview Service for managing conversation attachments.
 *
 * This service provides centralized attachment management including:
 * - Validation against size/count limits with cascade logic
 * - Inline vs MJStorage storage decisions
 * - Thumbnail generation for images
 * - CRUD operations for attachments
 *
 * @module @memberjunction/aiengine
 * @author MemberJunction.com
 * @since 2.130.0
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJFileStorageProviderEntity,
    MJFileEntity,
    MJAIAgentEntity,
    MJAIModelEntity,
    MJConversationDetailAttachmentEntity,
    MJAIModalityEntity
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { FileStorageBase } from '@memberjunction/storage';
import {
    ConversationUtility,
    AttachmentType,
    AttachmentLimits,
    AttachmentContent,
    DEFAULT_ATTACHMENT_LIMITS,
    DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES
} from '@memberjunction/ai-core-plus';
import { createBase64DataUrl, parseBase64DataUrl } from '@memberjunction/ai';

/**
 * Input for adding a new attachment
 */
export interface AddAttachmentInput {
    /** Base64 data URL or raw base64 string */
    data: string;
    /** MIME type (e.g., 'image/png') */
    mimeType: string;
    /** Original filename (optional) */
    fileName?: string;
    /** Width in pixels (for images/video) */
    width?: number;
    /** Height in pixels (for images/video) */
    height?: number;
    /** Duration in seconds (for audio/video) */
    durationSeconds?: number;
}

/**
 * Result of adding an attachment
 */
export interface AddAttachmentResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** The created attachment entity (if successful) */
    attachment?: MJConversationDetailAttachmentEntity;
    /** Error message (if failed) */
    error?: string;
}

/**
 * Attachment data with content for AI consumption
 */
export interface AttachmentWithData {
    attachment: MJConversationDetailAttachmentEntity;
    /** The full content as data URL or pre-auth download URL */
    contentUrl: string;
}

/**
 * Cached modality lookup
 */
interface ModalityCache {
    byName: Map<string, MJAIModalityEntity>;
    loaded: boolean;
}

/**
 * Service for managing conversation attachments.
 * Handles validation, storage, thumbnails, and CRUD operations.
 */
export class ConversationAttachmentService {
    private md: Metadata;
    private modalityCache: ModalityCache = { byName: new Map(), loaded: false };

    constructor() {
        this.md = new Metadata();
    }

    /**
     * Load and cache modalities for efficient lookup
     */
    private async loadModalitiesIfNeeded(contextUser: UserInfo): Promise<void> {
        if (this.modalityCache.loaded) {
            return;
        }

        const rv = new RunView();
        const result = await rv.RunView<MJAIModalityEntity>({
            EntityName: 'MJ: AI Modalities',
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results) {
            for (const modality of result.Results) {
                this.modalityCache.byName.set(modality.Name.toLowerCase(), modality);
            }
            this.modalityCache.loaded = true;
        }
    }

    /**
     * Get modality by name (e.g., 'Image', 'Audio', 'Video', 'File')
     */
    private async getModalityByName(name: string, contextUser: UserInfo): Promise<MJAIModalityEntity | null> {
        await this.loadModalitiesIfNeeded(contextUser);
        return this.modalityCache.byName.get(name.toLowerCase()) || null;
    }

    /**
     * Convert AttachmentType to modality name
     */
    private attachmentTypeToModalityName(attachmentType: AttachmentType): string {
        // AttachmentType is 'Image' | 'Video' | 'Audio' | 'Document'
        // Modality names are 'Image', 'Audio', 'Video', 'File' etc.
        if (attachmentType === 'Document') {
            return 'File';
        }
        return attachmentType;
    }

    /**
     * Add a new attachment to a conversation detail.
     * Handles validation, storage decision, thumbnail generation, and record creation.
     *
     * @param conversationDetailId - The ID of the conversation detail
     * @param input - The attachment data and metadata
     * @param agent - The AI agent (for limit overrides)
     * @param model - The AI model (for capability limits)
     * @param contextUser - The current user context
     * @param existingCounts - Current attachment counts for validation
     * @returns The result with created attachment or error
     */
    async addAttachment(
        conversationDetailId: string,
        input: AddAttachmentInput,
        agent: MJAIAgentEntity | null,
        model: MJAIModelEntity | null,
        contextUser: UserInfo,
        existingCounts: { images: number; videos: number; audios: number; documents: number } = { images: 0, videos: 0, audios: 0, documents: 0 }
    ): Promise<AddAttachmentResult> {
        // Parse data if it's a data URL
        const parsed = parseBase64DataUrl(input.data);
        const base64Data = parsed?.data || input.data;
        const mimeType = parsed?.mediaType || input.mimeType;

        // Calculate size from base64
        const sizeBytes = this.calculateBase64Size(base64Data);

        // Determine attachment type from MIME
        const attachmentType = ConversationUtility.GetAttachmentTypeFromMime(mimeType);

        // Get the modality entity for this attachment type
        const modalityName = this.attachmentTypeToModalityName(attachmentType);
        const modality = await this.getModalityByName(modalityName, contextUser);
        if (!modality) {
            return {
                success: false,
                error: `Unknown modality type: ${modalityName}`
            };
        }

        // Validate attachment against limits
        // For now, use default limits since agent/model don't have these specific fields
        const validation = ConversationUtility.ValidateAttachment(
            { type: attachmentType, sizeBytes },
            existingCounts,
            null, // Agent limits - not currently stored on entity
            null, // Model limits - not currently stored on entity
            DEFAULT_ATTACHMENT_LIMITS
        );

        if (!validation.allowed) {
            return {
                success: false,
                error: validation.reason
            };
        }

        // Determine storage mode using agent's threshold if available
        const agentThreshold = agent?.InlineStorageThresholdBytes ?? null;
        const storeInline = ConversationUtility.ShouldStoreInline(
            sizeBytes,
            agentThreshold,
            DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES
        );

        let inlineData: string | null = null;
        let fileId: string | null = null;

        if (storeInline) {
            // Store inline as base64
            inlineData = base64Data;
        } else {
            // Upload to MJStorage
            const uploadResult = await this.uploadToStorage(
                base64Data,
                mimeType,
                input.fileName || `attachment_${Date.now()}`,
                agent,
                contextUser
            );

            if (!uploadResult.success) {
                return {
                    success: false,
                    error: uploadResult.error || 'Failed to upload to storage'
                };
            }
            fileId = uploadResult.fileId!;
        }

        // Generate thumbnail for images
        let thumbnailBase64: string | null = null;
        if (attachmentType === 'Image') {
            thumbnailBase64 = await this.generateImageThumbnail(base64Data, mimeType);
        }

        // Create attachment record using strongly-typed entity
        const attachment = await this.createAttachmentRecord({
            conversationDetailId,
            modalityId: modality.ID,
            mimeType,
            fileName: input.fileName || null,
            sizeBytes,
            width: input.width || null,
            height: input.height || null,
            durationSeconds: input.durationSeconds || null,
            inlineData,
            fileId,
            thumbnailBase64,
            displayOrder: existingCounts.images + existingCounts.videos + existingCounts.audios + existingCounts.documents
        }, contextUser);

        if (!attachment) {
            return {
                success: false,
                error: 'Failed to create attachment record'
            };
        }

        return {
            success: true,
            attachment
        };
    }

    /**
     * Get attachment data with content URL.
     * For inline attachments, returns the base64 data URL.
     * For MJStorage attachments, returns a pre-authenticated download URL.
     *
     * @param attachment - The attachment entity
     * @param contextUser - The current user context
     * @returns The attachment with content URL
     */
    async getAttachmentData(
        attachment: MJConversationDetailAttachmentEntity,
        contextUser: UserInfo
    ): Promise<AttachmentWithData | null> {
        let contentUrl: string;

        if (attachment.InlineData) {
            // Inline data - convert to data URL
            contentUrl = createBase64DataUrl(attachment.InlineData, attachment.MimeType);
        } else if (attachment.FileID) {
            // MJStorage - get download URL
            const downloadUrl = await this.getDownloadUrl(attachment.FileID, contextUser);
            if (!downloadUrl) {
                return null;
            }
            contentUrl = downloadUrl;
        } else {
            return null;
        }

        return {
            attachment,
            contentUrl
        };
    }

    /**
     * Get a pre-authenticated download URL for an MJStorage file.
     *
     * @param fileId - The File entity ID
     * @param contextUser - The current user context
     * @returns The download URL or null if unavailable
     */
    async getDownloadUrl(fileId: string, contextUser: UserInfo): Promise<string | null> {
        // Load file entity
        const file = await this.md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        if (!await file.Load(fileId)) {
            return null;
        }

        // Load provider
        const provider = await this.md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', contextUser);
        if (!await provider.Load(file.ProviderID)) {
            return null;
        }

        // Get driver and create download URL
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            provider.ServerDriverKey
        );

        const objectKey = file.ProviderKey || file.Name;
        return driver.CreatePreAuthDownloadUrl(objectKey);
    }

    /**
     * Get all attachments for a conversation detail.
     *
     * @param conversationDetailId - The conversation detail ID
     * @param contextUser - The current user context
     * @returns Array of attachment entities
     */
    async getAttachments(
        conversationDetailId: string,
        contextUser: UserInfo
    ): Promise<MJConversationDetailAttachmentEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJConversationDetailAttachmentEntity>({
            EntityName: 'MJ: Conversation Detail Attachments',
            ExtraFilter: `ConversationDetailID='${conversationDetailId}'`,
            OrderBy: 'DisplayOrder ASC',
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success || !result.Results) {
            return [];
        }

        return result.Results;
    }

    /**
     * Get attachments for multiple conversation details (batch load).
     *
     * @param conversationDetailIds - Array of conversation detail IDs
     * @param contextUser - The current user context
     * @returns Map of conversation detail ID to attachments
     */
    async getAttachmentsBatch(
        conversationDetailIds: string[],
        contextUser: UserInfo
    ): Promise<Map<string, MJConversationDetailAttachmentEntity[]>> {
        if (conversationDetailIds.length === 0) {
            return new Map();
        }

        const idList = conversationDetailIds.map(id => `'${id}'`).join(',');

        const rv = new RunView();
        const result = await rv.RunView<MJConversationDetailAttachmentEntity>({
            EntityName: 'MJ: Conversation Detail Attachments',
            ExtraFilter: `ConversationDetailID IN (${idList})`,
            OrderBy: 'DisplayOrder ASC',
            ResultType: 'entity_object'
        }, contextUser);

        const map = new Map<string, MJConversationDetailAttachmentEntity[]>();

        if (!result.Success || !result.Results) {
            return map;
        }

        // Group by conversation detail ID
        for (const att of result.Results) {
            const existing = map.get(att.ConversationDetailID) || [];
            existing.push(att);
            map.set(att.ConversationDetailID, existing);
        }

        return map;
    }

    /**
     * Delete an attachment and its underlying storage.
     *
     * @param attachmentId - The attachment ID
     * @param contextUser - The current user context
     * @returns Whether deletion succeeded
     */
    async deleteAttachment(attachmentId: string, contextUser: UserInfo): Promise<boolean> {
        // Load attachment using strongly-typed entity
        const attachment = await this.md.GetEntityObject<MJConversationDetailAttachmentEntity>(
            'MJ: Conversation Detail Attachments',
            contextUser
        );

        if (!await attachment.Load(attachmentId)) {
            return false;
        }

        // If stored in MJStorage, delete the file
        if (attachment.FileID) {
            await this.deleteStorageFile(attachment.FileID, contextUser);
        }

        // Delete the attachment record
        return attachment.Delete();
    }

    /**
     * Create an AttachmentContent reference for embedding in messages.
     * Maps from entity to the content block type used in AI messages.
     *
     * @param attachment - The attachment entity
     * @returns The attachment content reference
     */
    createAttachmentReference(attachment: MJConversationDetailAttachmentEntity): AttachmentContent {
        // Map from modality to AttachmentType
        const modalityName = attachment.Modality?.toLowerCase() || 'file';
        let type: AttachmentType = 'Document';
        if (modalityName === 'image') type = 'Image';
        else if (modalityName === 'video') type = 'Video';
        else if (modalityName === 'audio') type = 'Audio';

        return {
            _mode: 'attachment',
            id: attachment.ID,
            type,
            mimeType: attachment.MimeType,
            fileName: attachment.FileName || undefined,
            sizeBytes: attachment.FileSizeBytes,
            width: attachment.Width || undefined,
            height: attachment.Height || undefined,
            durationSeconds: attachment.DurationSeconds || undefined,
            thumbnailBase64: attachment.ThumbnailBase64 || undefined
        };
    }

    // ==================== Private Helper Methods ====================

    /**
     * Calculate the decoded size of base64 data
     */
    private calculateBase64Size(base64Data: string): number {
        // Base64 encoding adds ~33% overhead
        // Length * 3/4 gives approximate decoded size
        // Account for padding characters
        const padding = (base64Data.match(/=/g) || []).length;
        return Math.floor((base64Data.length * 3) / 4) - padding;
    }

    /**
     * Upload data to MJStorage
     */
    private async uploadToStorage(
        base64Data: string,
        mimeType: string,
        fileName: string,
        agent: MJAIAgentEntity | null,
        contextUser: UserInfo
    ): Promise<{ success: boolean; fileId?: string; error?: string }> {
        // Get storage provider from agent config or use default
        const providerId = agent?.AttachmentStorageProviderID ?? null;
        if (!providerId) {
            return {
                success: false,
                error: 'No storage provider configured for attachments'
            };
        }

        // Load provider
        const provider = await this.md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', contextUser);
        if (!await provider.Load(providerId)) {
            return {
                success: false,
                error: 'Failed to load storage provider'
            };
        }

        // Get driver
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            provider.ServerDriverKey
        );

        // Determine storage path - use a default if agent doesn't have one
        const basePath = 'conversation-attachments';
        const timestamp = Date.now();
        const objectName = `${basePath}/${timestamp}_${fileName}`;

        // Convert base64 to buffer
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload
        const uploaded = await driver.PutObject(objectName, buffer, mimeType);
        if (!uploaded) {
            return {
                success: false,
                error: 'Failed to upload file to storage'
            };
        }

        // Create File entity record
        const file = await this.md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        file.Name = fileName;
        file.ProviderID = providerId;
        file.ContentType = mimeType;
        file.ProviderKey = objectName;
        file.Status = 'Uploaded';

        if (!await file.Save()) {
            // Try to clean up uploaded file
            await driver.DeleteObject(objectName);
            return {
                success: false,
                error: 'Failed to create file record'
            };
        }

        return {
            success: true,
            fileId: file.ID
        };
    }

    /**
     * Delete a file from MJStorage
     */
    private async deleteStorageFile(fileId: string, contextUser: UserInfo): Promise<boolean> {
        // Load file entity
        const file = await this.md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        if (!await file.Load(fileId)) {
            return false;
        }

        // Load provider
        const provider = await this.md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', contextUser);
        if (!await provider.Load(file.ProviderID)) {
            return false;
        }

        // Get driver and delete
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            provider.ServerDriverKey
        );

        const objectKey = file.ProviderKey || file.Name;
        const deleted = await driver.DeleteObject(objectKey);

        if (deleted) {
            // Delete file record
            await file.Delete();
        }

        return deleted;
    }

    /**
     * Generate a thumbnail for an image.
     * Returns base64-encoded thumbnail data.
     *
     * Note: This is a placeholder implementation.
     * In production, you'd use a library like sharp or Jimp for server-side
     * image processing, or Canvas API for client-side.
     */
    private async generateImageThumbnail(
        _base64Data: string,
        _mimeType: string,
        _maxDimension: number = 200,
        _quality: number = 0.7
    ): Promise<string | null> {
        // For small images, just return the original
        const size = this.calculateBase64Size(_base64Data);
        if (size < 50 * 1024) { // Less than 50KB
            return _base64Data;
        }

        // In a full implementation, you would:
        // 1. Decode the base64 image
        // 2. Resize to maxDimension while maintaining aspect ratio
        // 3. Compress with the specified quality
        // 4. Return as base64

        // For now, return null to indicate no thumbnail generated
        // The UI can fall back to displaying the full image
        return null;
    }

    /**
     * Create an attachment record in the database using strongly-typed entity.
     */
    private async createAttachmentRecord(
        data: {
            conversationDetailId: string;
            modalityId: string;
            mimeType: string;
            fileName: string | null;
            sizeBytes: number;
            width: number | null;
            height: number | null;
            durationSeconds: number | null;
            inlineData: string | null;
            fileId: string | null;
            thumbnailBase64: string | null;
            displayOrder: number;
        },
        contextUser: UserInfo
    ): Promise<MJConversationDetailAttachmentEntity | null> {
        const attachment = await this.md.GetEntityObject<MJConversationDetailAttachmentEntity>(
            'MJ: Conversation Detail Attachments',
            contextUser
        );

        // Use strongly-typed property setters
        attachment.ConversationDetailID = data.conversationDetailId;
        attachment.ModalityID = data.modalityId;
        attachment.MimeType = data.mimeType;
        attachment.FileName = data.fileName;
        attachment.FileSizeBytes = data.sizeBytes;
        attachment.Width = data.width;
        attachment.Height = data.height;
        attachment.DurationSeconds = data.durationSeconds;
        attachment.InlineData = data.inlineData;
        attachment.FileID = data.fileId;
        attachment.DisplayOrder = data.displayOrder;
        attachment.ThumbnailBase64 = data.thumbnailBase64;

        if (!await attachment.Save()) {
            return null;
        }

        return attachment;
    }
}

/**
 * Singleton instance of the attachment service
 */
let _attachmentServiceInstance: ConversationAttachmentService | null = null;

/**
 * Get the singleton instance of the ConversationAttachmentService.
 *
 * @returns The attachment service instance
 */
export function getAttachmentService(): ConversationAttachmentService {
    if (!_attachmentServiceInstance) {
        _attachmentServiceInstance = new ConversationAttachmentService();
    }
    return _attachmentServiceInstance;
}
