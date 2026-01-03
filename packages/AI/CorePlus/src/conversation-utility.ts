/**
 * @fileoverview Utility class for parsing and formatting special content in conversation messages.
 *
 * This module provides centralized logic for handling @{...} syntax in conversation messages,
 * supporting multiple content types (mentions, forms, attachments, etc.) with context-aware rendering.
 *
 * This is the SINGLE SOURCE OF TRUTH for all message content handling across:
 * - Frontend (Angular components)
 * - Backend (Agent execution)
 * - Storage (Database persistence)
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.118.0
 */

import {
    ChatMessageContent,
    ChatMessageContentBlock,
    parseBase64DataUrl,
    createBase64DataUrl
} from '@memberjunction/ai';

/**
 * Utility class for parsing and formatting special content in conversation messages
 * Handles @{...} syntax for mentions, forms, and other structured content
 *
 * All content uses the @{...} wrapper with a _mode field to distinguish types.
 * If _mode is omitted, defaults to "mention" for backward compatibility.
 *
 * @example Parsing message content
 * ```typescript
 * const tokens = ConversationUtility.ParseSpecialContent(message);
 * const plainText = ConversationUtility.ToPlainText(message, agents, users);
 * const agentContext = ConversationUtility.ToAgentContext(message, agents, users);
 * const html = ConversationUtility.ToHTML(message, agents, users);
 * ```
 */
export class ConversationUtility {

  /**
   * Parse all @{...} tokens in a message
   * Returns array of parsed content with their positions
   *
   * @param text - The message text to parse
   * @returns Array of parsed tokens with positions and content
   */
  public static ParseSpecialContent(text: string): SpecialContentToken[] {
    if (!text) return [];

    const tokens: SpecialContentToken[] = [];

    // Find all @{ tokens and manually parse to handle nested braces
    let index = 0;
    while (index < text.length) {
      const atIndex = text.indexOf('@{', index);
      if (atIndex === -1) break;

      // Find the matching closing brace by counting brace depth
      // Start at atIndex + 2 (after '@{') and look for the first '{'
      let braceDepth = 0;
      let endIndex = -1;
      for (let i = atIndex + 2; i < text.length; i++) {
        if (text[i] === '{') {
          braceDepth++;
        } else if (text[i] === '}') {
          if (braceDepth === 0) {
            endIndex = i;
            break;
          }
          braceDepth--;
        }
      }

      if (endIndex === -1) {
        // No matching closing brace found
        break;
      }

      const fullMatch = text.substring(atIndex, endIndex + 1); // @{...}
      const jsonString = fullMatch.substring(2, fullMatch.length - 1); // Remove @{ and }
      const content = this.parseToken(jsonString);

      if (content) {
        const mode = this.getMode(content);
        tokens.push({
          mode: mode,
          content: content,
          startIndex: atIndex,
          endIndex: endIndex + 1,
          originalText: fullMatch
        });
      }

      index = endIndex + 1;
    }

    return tokens;
  }

  /**
   * Convert message to plain text (for display/export)
   * - Mentions: "@Agent Name" or "@User Name"
   * - Forms: "Form Response: Field1=Value1, Field2=Value2"
   *
   * @param text - The message text to convert
   * @param agents - Optional array of agent information for name lookup
   * @param users - Optional array of user information for name lookup
   * @returns Plain text representation of the message
   */
  public static ToPlainText(text: string, agents?: AgentInfo[], users?: UserInfo[]): string {
    if (!text) return '';

    const tokens = this.ParseSpecialContent(text);
    if (tokens.length === 0) return text;

    // Replace tokens in reverse order to maintain indices
    let result = text;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      let replacement = '';

      switch (token.mode) {
        case 'mention':
          replacement = this.mentionToPlainText(token.content as MentionContent, agents, users);
          break;
        case 'form':
          replacement = this.formToPlainText(token.content as FormResponseContent);
          break;
        default:
          // Unknown mode, leave original text
          replacement = token.originalText;
      }

      result = result.substring(0, token.startIndex) + replacement + result.substring(token.endIndex);
    }

    return result;
  }

  /**
   * Convert message for agent consumption (LLM input)
   * - Mentions: Just the name "Agent Name" (no @ prefix)
   * - Forms: Full JSON for agent to understand context
   *
   * @param text - The message text to convert
   * @param agents - Optional array of agent information for name lookup
   * @param users - Optional array of user information for name lookup
   * @returns Agent-friendly representation of the message
   */
  public static ToAgentContext(text: string, agents?: AgentInfo[], users?: UserInfo[]): string {
    if (!text) return '';

    const tokens = this.ParseSpecialContent(text);
    if (tokens.length === 0) return text;

    // Replace tokens in reverse order to maintain indices
    let result = text;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      let replacement = '';

      switch (token.mode) {
        case 'mention':
          replacement = this.mentionToAgentContext(token.content as MentionContent, agents, users);
          break;
        case 'form':
          replacement = this.formToAgentContext(token.content as FormResponseContent);
          break;
        case 'attachment':
          // Attachment tokens are stripped from text - the actual attachment data
          // is added as separate content blocks by BuildChatMessageContent
          replacement = '';
          break;
        default:
          // Unknown mode, leave original text
          replacement = token.originalText;
      }

      result = result.substring(0, token.startIndex) + replacement + result.substring(token.endIndex);
    }

    return result;
  }


  /**
   * Create a form response token string
   *
   * @param action - The action being performed (e.g., "createRecord")
   * @param fields - Array of field name/value pairs
   * @param title - Optional form title for display
   * @returns Formatted @{...} string for the form response
   */
  public static CreateFormResponse(
    action: string,
    fields: Array<{ name: string; value: any; label?: string }>,
    title?: string
  ): string {
    const content: FormResponseContent = {
      _mode: 'form',
      action,
      fields,
      title
    };
    // Use JSON.stringify directly - keep the braces
    return `@${JSON.stringify(content)}`;
  }

  /**
   * Check if a message contains form response syntax (@{"_mode":"form",...})
   * Useful for fast-path routing decisions without running full LLM inference.
   *
   * Form responses should always be routed back to the agent that requested the form,
   * so this can be used to skip intent-checking prompts entirely.
   *
   * @param text - The message text to check
   * @returns true if the message contains form response syntax
   */
  public static ContainsFormResponse(text: string): boolean {
    if (!text) return false;
    const tokens = this.ParseSpecialContent(text);
    return tokens.some(token => token.mode === 'form');
  }

  /**
   * Create a mention token string
   *
   * @param type - Type of mention (agent or user)
   * @param id - ID of the mentioned entity
   * @param name - Name of the mentioned entity
   * @param configurationId - Optional agent configuration ID
   * @param configurationName - Optional agent configuration name
   * @returns Formatted @{...} string for the mention
   */
  public static CreateMention(
    type: 'agent' | 'user',
    id: string,
    name: string,
    configurationId?: string,
    configurationName?: string
  ): string {
    const content: MentionContent = {
      _mode: 'mention',
      type,
      id,
      name,
      configurationId,
      configurationName
    };
    // Use JSON.stringify directly - keep the braces
    return `@${JSON.stringify(content)}`;
  }

  // ==================== Attachment Methods ====================

  /**
   * Create an attachment reference token string
   *
   * @param attachment - The attachment content object
   * @returns Formatted @{...} string for the attachment reference
   */
  public static CreateAttachmentReference(attachment: AttachmentContent): string {
    const content: AttachmentContent = {
      ...attachment,
      _mode: 'attachment'
    };
    return `@${JSON.stringify(content)}`;
  }

  /**
   * Check if a message contains attachment references
   *
   * @param text - The message text to check
   * @returns true if the message contains attachment syntax
   */
  public static ContainsAttachments(text: string): boolean {
    if (!text) return false;
    const tokens = this.ParseSpecialContent(text);
    return tokens.some(token => token.mode === 'attachment');
  }

  /**
   * Get all attachment references from a message
   *
   * @param text - The message text to parse
   * @returns Array of attachment content objects
   */
  public static GetAttachmentReferences(text: string): AttachmentContent[] {
    if (!text) return [];
    const tokens = this.ParseSpecialContent(text);
    return tokens
      .filter(token => token.mode === 'attachment')
      .map(token => token.content as AttachmentContent);
  }

  /**
   * Build ChatMessageContent from text and attachment data.
   * This is the primary method for converting stored messages to AI-ready format.
   *
   * @param messageText - The message text (may contain @{...} tokens)
   * @param attachmentData - Array of attachment data with content
   * @param agents - Optional agents for mention resolution
   * @param users - Optional users for mention resolution
   * @returns ChatMessageContent ready for AI provider
   */
  public static BuildChatMessageContent(
    messageText: string,
    attachmentData: AttachmentData[],
    agents?: AgentInfo[],
    users?: UserInfo[]
  ): ChatMessageContent {
    // If no attachments, return processed text
    if (!attachmentData || attachmentData.length === 0) {
      return this.ToAgentContext(messageText, agents, users);
    }

    // Build content blocks array
    const blocks: ChatMessageContentBlock[] = [];

    // Add text content if present
    const processedText = this.ToAgentContext(messageText, agents, users);
    if (processedText?.trim()) {
      blocks.push({
        type: 'text',
        content: processedText
      });
    }

    // Add attachment content blocks
    for (const att of attachmentData) {
      const block = this.attachmentToContentBlock(att);
      if (block) {
        blocks.push(block);
      }
    }

    // If only one text block, return as string for simplicity
    if (blocks.length === 1 && blocks[0].type === 'text') {
      return blocks[0].content;
    }

    return blocks;
  }

  /**
   * Validate an attachment against size and count limits.
   * Uses the cascade: agent → model → system defaults
   *
   * @param attachment - The attachment to validate
   * @param currentCounts - Current counts of attachments in the message
   * @param agentLimits - Agent-level limit overrides (optional)
   * @param modelLimits - Model-level limits (optional)
   * @param systemDefaults - System default limits
   * @returns Validation result with allowed flag and optional reason
   */
  public static ValidateAttachment(
    attachment: { type: AttachmentType; sizeBytes: number },
    currentCounts: { images: number; videos: number; audios: number; documents: number },
    agentLimits: Partial<AttachmentLimits> | null,
    modelLimits: Partial<AttachmentLimits> | null,
    systemDefaults: AttachmentDefaults
  ): AttachmentValidationResult {
    const type = attachment.type.toLowerCase();

    // Get effective size limit
    let maxSizeField: keyof AttachmentLimits;
    let maxCountField: keyof AttachmentLimits;
    let currentCount: number;

    switch (type) {
      case 'image':
        maxSizeField = 'maxImageSizeBytes';
        maxCountField = 'maxImagesPerMessage';
        currentCount = currentCounts.images;
        break;
      case 'video':
        maxSizeField = 'maxVideoSizeBytes';
        maxCountField = 'maxVideosPerMessage';
        currentCount = currentCounts.videos;
        break;
      case 'audio':
        maxSizeField = 'maxAudioSizeBytes';
        maxCountField = 'maxAudiosPerMessage';
        currentCount = currentCounts.audios;
        break;
      default:
        // Documents use image limits as fallback
        maxSizeField = 'maxImageSizeBytes';
        maxCountField = 'maxImagesPerMessage';
        currentCount = currentCounts.documents;
    }

    // Get effective limits using cascade
    const maxSize = this.GetEffectiveLimit(maxSizeField, agentLimits, modelLimits, systemDefaults);
    const maxCount = this.GetEffectiveLimit(maxCountField, agentLimits, modelLimits, systemDefaults);

    // Check size
    if (attachment.sizeBytes > maxSize) {
      const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
      const actualMB = (attachment.sizeBytes / (1024 * 1024)).toFixed(1);
      return {
        allowed: false,
        reason: `${attachment.type} size (${actualMB}MB) exceeds maximum (${maxMB}MB)`
      };
    }

    // Check count
    if (currentCount >= maxCount) {
      return {
        allowed: false,
        reason: `Maximum ${maxCount} ${type}(s) per message reached`
      };
    }

    return { allowed: true };
  }

  /**
   * Get the effective limit value using cascade: agent → model → system
   *
   * @param limitName - The name of the limit to get
   * @param agentLimits - Agent-level overrides
   * @param modelLimits - Model-level limits
   * @param systemDefaults - System defaults
   * @returns The effective limit value
   */
  public static GetEffectiveLimit(
    limitName: keyof AttachmentLimits,
    agentLimits: Partial<AttachmentLimits> | null,
    modelLimits: Partial<AttachmentLimits> | null,
    systemDefaults: AttachmentDefaults
  ): number {
    // Agent override takes precedence
    if (agentLimits?.[limitName] != null) {
      return agentLimits[limitName]!;
    }

    // Then model setting
    if (modelLimits?.[limitName] != null) {
      return modelLimits[limitName]!;
    }

    // Finally system default
    return systemDefaults[limitName];
  }

  /**
   * Determine if an attachment should be stored inline or in MJStorage
   *
   * @param sizeBytes - Size of the attachment in bytes
   * @param agentThreshold - Agent-level threshold override (optional)
   * @param systemThreshold - System default threshold
   * @returns true if should be stored inline, false if should use MJStorage
   */
  public static ShouldStoreInline(
    sizeBytes: number,
    agentThreshold: number | null | undefined,
    systemThreshold: number
  ): boolean {
    const threshold = agentThreshold ?? systemThreshold;
    return sizeBytes <= threshold;
  }

  /**
   * Determine the attachment type from a MIME type
   *
   * @param mimeType - The MIME type of the file
   * @returns The attachment type category
   */
  public static GetAttachmentTypeFromMime(mimeType: string): AttachmentType {
    if (!mimeType) return 'Document';

    const lower = mimeType.toLowerCase();
    if (lower.startsWith('image/')) return 'Image';
    if (lower.startsWith('video/')) return 'Video';
    if (lower.startsWith('audio/')) return 'Audio';
    return 'Document';
  }

  /**
   * Get the ChatMessageContentBlock type from attachment type
   *
   * @param attachmentType - The attachment type
   * @returns The corresponding content block type
   */
  public static GetContentBlockType(
    attachmentType: AttachmentType
  ): 'image_url' | 'video_url' | 'audio_url' | 'file_url' {
    switch (attachmentType) {
      case 'Image': return 'image_url';
      case 'Video': return 'video_url';
      case 'Audio': return 'audio_url';
      default: return 'file_url';
    }
  }

  // ==================== Private Helper Methods ====================

  /**
   * Convert attachment data to a ChatMessageContentBlock
   */
  private static attachmentToContentBlock(data: AttachmentData): ChatMessageContentBlock | null {
    if (!data.content) return null;

    const blockType = this.GetContentBlockType(data.type);

    return {
      type: blockType,
      content: data.content,
      mimeType: data.mimeType,
      fileName: data.fileName,
      fileSize: data.sizeBytes,
      width: data.width,
      height: data.height
    };
  }

  /**
   * Parse a single @{...} token
   * Returns typed object based on _mode
   */
  private static parseToken(jsonString: string): SpecialContent | null {
    try {
      // If the jsonString already starts with '{', use it directly
      // Otherwise, wrap it in braces for parsing
      const jsonToParse = jsonString.trim().startsWith('{') ? jsonString : `{${jsonString}}`;
      const parsed = JSON.parse(jsonToParse);

      // Determine mode (default to 'mention' for backward compatibility)
      const mode = parsed._mode || 'mention';

      // Validate based on mode
      if (mode === 'mention') {
        if (parsed.type && parsed.id && parsed.name) {
          return parsed as MentionContent;
        }
      } else if (mode === 'form') {
        if (parsed.action && Array.isArray(parsed.fields)) {
          return parsed as FormResponseContent;
        }
      } else if (mode === 'attachment') {
        if (parsed.id && parsed.type && parsed.mimeType) {
          return parsed as AttachmentContent;
        }
      }

      // Unknown or invalid format
      return null;
    } catch (error) {
      console.warn('Failed to parse special content token:', jsonString, error);
      return null;
    }
  }

  /**
   * Get the mode from a parsed content object
   */
  private static getMode(content: SpecialContent): string {
    return content._mode || 'mention';
  }

  /**
   * Escape HTML special characters
   * Works in both browser and Node.js environments
   */
  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape regex special characters
   */
  private static escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ==================== Plain Text Conversion Methods ====================

  /**
   * Convert mention content to plain text
   * Format: "@Agent Name" or "@User Name"
   */
  private static mentionToPlainText(content: MentionContent, agents?: AgentInfo[], users?: UserInfo[]): string {
    let name = content.name;

    // Try to look up actual name if ID provided
    if (content.type === 'agent' && agents) {
      const agent = agents.find(a => a.ID === content.id);
      if (agent) name = agent.Name;
    } else if (content.type === 'user' && users) {
      const user = users.find(u => u.ID === content.id);
      if (user) name = user.Name;
    }

    return `@${name}`;
  }

  /**
   * Convert mention content to agent context (no @ prefix)
   * Format: "Agent Name"
   */
  private static mentionToAgentContext(content: MentionContent, agents?: AgentInfo[], users?: UserInfo[]): string {
    let name = content.name;

    // Try to look up actual name if ID provided
    if (content.type === 'agent' && agents) {
      const agent = agents.find(a => a.ID === content.id);
      if (agent) name = agent.Name;
    } else if (content.type === 'user' && users) {
      const user = users.find(u => u.ID === content.id);
      if (user) name = user.Name;
    }

    return name;
  }

  /**
   * Convert form response to plain text
   * Format: "Form Response: Field1=Value1, Field2=Value2"
   */
  private static formToPlainText(content: FormResponseContent): string {
    if (content.fields.length === 1) {
      // Single field - simple format
      const field = content.fields[0];
      const label = field.label || field.name;
      return `${label}: ${field.value}`;
    } else {
      // Multiple fields - list format
      const fieldStrings = content.fields.map(f => {
        const label = f.label || f.name;
        return `${label}=${f.value}`;
      });
      return `Form Response: ${fieldStrings.join(', ')}`;
    }
  }

  /**
   * Convert form response for agent context
   * Format: JSON string for agent to understand
   */
  private static formToAgentContext(content: FormResponseContent): string {
    return `User submitted form with: ${JSON.stringify(content)}`;
  }
}

// ==================== Type Definitions ====================

/**
 * Parsed token with position information
 */
export interface SpecialContentToken {
  /** The mode of the content (mention, form, etc.) */
  mode: string;
  /** The parsed content object */
  content: SpecialContent;
  /** Start index in the original text */
  startIndex: number;
  /** End index in the original text */
  endIndex: number;
  /** The original @{...} text */
  originalText: string;
}

/**
 * Union type of all special content types
 */
export type SpecialContent = MentionContent | FormResponseContent | AttachmentContent;

/**
 * Mention content (@agent or @user)
 */
export interface MentionContent {
  /** Mode identifier (optional for backward compatibility) */
  _mode?: 'mention';
  /** Type of mention */
  type: 'agent' | 'user';
  /** ID of the mentioned entity */
  id: string;
  /** Name of the mentioned entity */
  name: string;
  /** Optional agent configuration ID */
  configurationId?: string;
  /** Optional agent configuration display name */
  configurationName?: string;
}

/**
 * Form response content
 */
export interface FormResponseContent {
  /** Mode identifier */
  _mode: 'form';
  /** Action being performed */
  action: string;
  /** Optional form title for display */
  title?: string;
  /** Array of field responses */
  fields: Array<{
    /** Field name */
    name: string;
    /** Field value */
    value: any;
    /** Optional display label for the question */
    label?: string;
    /** Optional field type for formatting (date, datetime, slider, etc.) */
    type?: string;
    /** Optional display value (e.g., option label for choice fields) */
    displayValue?: string;
  }>;
}

/**
 * Agent information for mention lookup
 */
export interface AgentInfo {
  /** Agent ID */
  ID: string;
  /** Agent name */
  Name: string;
  /** Optional icon class (Font Awesome, etc.) */
  IconClass?: string;
  /** Optional logo image URL */
  LogoURL?: string;
}

/**
 * User information for mention lookup
 */
export interface UserInfo {
  /** User ID */
  ID: string;
  /** User name */
  Name: string;
}

// ==================== Attachment Type Definitions ====================

/**
 * Attachment type categories
 */
export type AttachmentType = 'Image' | 'Video' | 'Audio' | 'Document';

/**
 * Attachment content stored as @{...} reference in messages.
 * This is what gets persisted in the ConversationDetail.Message field.
 */
export interface AttachmentContent {
  /** Mode identifier */
  _mode: 'attachment';
  /** Unique ID of the attachment (ConversationDetailAttachment.ID) */
  id: string;
  /** Type category of the attachment */
  type: AttachmentType;
  /** MIME type (e.g., "image/png", "video/mp4") */
  mimeType: string;
  /** Original filename */
  fileName?: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Width in pixels (for images/videos) */
  width?: number;
  /** Height in pixels (for images/videos) */
  height?: number;
  /** Duration in seconds (for audio/video) */
  durationSeconds?: number;
  /** Base64-encoded thumbnail for preview (small images only) */
  thumbnailBase64?: string;
}

/**
 * Attachment data with actual content for building ChatMessageContent.
 * Used when loading attachments from storage to pass to AI providers.
 */
export interface AttachmentData {
  /** Type category of the attachment */
  type: AttachmentType;
  /** MIME type (e.g., "image/png", "video/mp4") */
  mimeType: string;
  /** Original filename */
  fileName?: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Width in pixels (for images/videos) */
  width?: number;
  /** Height in pixels (for images/videos) */
  height?: number;
  /** Duration in seconds (for audio/video) */
  durationSeconds?: number;
  /** The actual content: data URL (data:mime;base64,xxx) or pre-authenticated URL */
  content: string;
}

/**
 * Attachment size and count limits.
 * Used for agent and model limit overrides (all fields optional).
 */
export interface AttachmentLimits {
  /** Maximum image size in bytes */
  maxImageSizeBytes?: number;
  /** Maximum video size in bytes */
  maxVideoSizeBytes?: number;
  /** Maximum audio size in bytes */
  maxAudioSizeBytes?: number;
  /** Maximum number of images per message */
  maxImagesPerMessage?: number;
  /** Maximum number of videos per message */
  maxVideosPerMessage?: number;
  /** Maximum number of audio files per message */
  maxAudiosPerMessage?: number;
}

/**
 * System default limits for attachments (all fields required).
 * These are used when agent and model don't specify limits.
 */
export interface AttachmentDefaults {
  /** Maximum image size in bytes (default: 5MB) */
  maxImageSizeBytes: number;
  /** Maximum video size in bytes (default: 20MB) */
  maxVideoSizeBytes: number;
  /** Maximum audio size in bytes (default: 10MB) */
  maxAudioSizeBytes: number;
  /** Maximum number of images per message (default: 10) */
  maxImagesPerMessage: number;
  /** Maximum number of videos per message (default: 5) */
  maxVideosPerMessage: number;
  /** Maximum number of audio files per message (default: 5) */
  maxAudiosPerMessage: number;
}

/**
 * Result of attachment validation
 */
export interface AttachmentValidationResult {
  /** Whether the attachment is allowed */
  allowed: boolean;
  /** Reason for rejection (if not allowed) */
  reason?: string;
}

/**
 * System-wide default attachment limits.
 * These can be overridden at the model or agent level.
 */
export const DEFAULT_ATTACHMENT_LIMITS: AttachmentDefaults = {
  maxImageSizeBytes: 5 * 1024 * 1024,      // 5MB
  maxVideoSizeBytes: 20 * 1024 * 1024,     // 20MB
  maxAudioSizeBytes: 10 * 1024 * 1024,     // 10MB
  maxImagesPerMessage: 10,
  maxVideosPerMessage: 5,
  maxAudiosPerMessage: 5
};

/**
 * Default threshold for inline storage (1MB).
 * Files smaller than this are stored as base64 in the database.
 * Files larger use MJStorage (S3, Azure, etc.).
 */
export const DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES = 1 * 1024 * 1024;
