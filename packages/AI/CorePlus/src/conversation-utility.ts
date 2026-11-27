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
import { UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, type KeyValuePair } from '@memberjunction/core';
import { ReplaceWikiCitationsWithPlainText } from './conversation-citation-scanner';

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
    let result = text;

    if (tokens.length > 0) {
      // Replace tokens in reverse order to maintain indices
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
    }

    return ReplaceWikiCitationsWithPlainText(result);
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
   * @param type - Type of mention (agent, user, entity, or query)
   * @param id - ID of the mentioned entity
   * @param name - Name of the mentioned entity
   * @param configurationId - Optional agent configuration ID
   * @param configurationName - Optional agent configuration name
   * @returns Formatted @{...} string for the mention
   */
  public static CreateMention(
    type: 'agent' | 'user' | 'entity' | 'query',
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

  /**
   * Field names on a mention token that are never primary-key values.
   * Composite PK fields that collide with these go under `keys` instead.
   */
  public static readonly RECORD_LINK_RESERVED_KEYS = [
    '_mode',
    'type',
    'name',
    'entityName',
    'configurationId',
    'configurationName',
    'configId',
    'config',
    'keys',
    'id',
  ] as const;

  /**
   * Visible label for a `record` mention token: explicit `name`, else `entityName`, else `'record'`.
   */
  public static ResolveRecordLinkLabel(content: MentionContent): string {
    const n = (content.name ?? '').trim();
    return n || content.entityName || 'record';
  }

  /**
   * Converts `@{"_mode":...}` tokens in plain text or Markdown into readable plain text via
   * {@link ToPlainText}, omitting duplicate `record` mention pills that immediately follow the
   * same record title (e.g. `Northwind @{...}` → `Northwind`, `**Northwind** @{...}.` → `**Northwind**.`).
   *
   * @param text - Plain-text or Markdown string that may contain `@{...}` tokens
   * @param options - Optional agent/user lookup lists and custom record link label resolver
   * @returns Cleaned plain-text string with duplicate adjacent record pills removed
   */
  public static CleanMentions(text: string, options?: CleanMentionsOptions): string {
    if (!text) return '';

    const tokens = this.ParseSpecialContent(text);
    if (tokens.length === 0) {
      return this.ToPlainText(text, options?.agents, options?.users);
    }

    const resolveLabel = options?.recordLinkLabel ?? ConversationUtility.ResolveRecordLinkLabel;
    let deduplicated = '';
    let cursor = 0;

    for (const token of tokens) {
      deduplicated += text.slice(cursor, token.startIndex);
      cursor = token.endIndex;

      if (this.isRecordMentionToken(token)) {
        const label = resolveLabel(token.content);
        if (this.endsWithRecordTitle(deduplicated, label)) {
          const nextChar = text[token.endIndex] ?? '';
          if (nextChar === '' || /^[\s.,;:!?)\]}'"]/.test(nextChar)) {
            deduplicated = this.trimTrailingHorizontalWhitespace(deduplicated);
          }
          continue;
        }
      }

      deduplicated += token.originalText;
    }
    deduplicated += text.slice(cursor);

    return this.ToPlainText(deduplicated, options?.agents, options?.users);
  }

  /**
   * Sanitizes `@{"_mode":...}` (and HTML-entity-escaped `@{&quot;_mode&quot;:...}`) mention tokens
   * inside an HTML notification or message body without depending on DOM APIs.
   *
   * - Preserves HTML tags, attributes, comments, and `<script>` / `<style>` / `<code>` / `<pre>` blocks verbatim.
   * - Tracks visible text across inline formatting tags (e.g. `<strong>Northwind</strong> @{...}`)
   *   so adjacent duplicate record pills are omitted, while resetting across block boundaries.
   * - Escapes every rendered token replacement with HTML entities so mention labels cannot inject markup.
   *
   * @param html - HTML string (fragment or document body) that may contain mention tokens
   * @param options - Optional agent/user lookup lists and custom record link label resolver
   * @returns HTML string with mention tokens converted cleanly and safely
   */
  public static CleanHtmlMentions(html: string, options?: CleanMentionsOptions): string {
    if (!html) return '';
    if (!html.includes('@{')) return html;

    const resolveLabel = options?.recordLinkLabel ?? ConversationUtility.ResolveRecordLinkLabel;
    let out = '';
    let visiblePrefix = '';
    let cursor = 0;
    const len = html.length;
    const rawTagStack: string[] = [];

    while (cursor < len) {
      if (html[cursor] === '<') {
        // HTML comment: <!-- ... -->
        if (html.startsWith('<!--', cursor)) {
          const commentEnd = html.indexOf('-->', cursor + 4);
          const nextPos = commentEnd === -1 ? len : commentEnd + 3;
          out += html.slice(cursor, nextPos);
          cursor = nextPos;
          continue;
        }

        const tagEnd = this.findHtmlTagEnd(html, cursor);
        if (tagEnd === -1) {
          // Malformed unclosed '<' — treat remainder as text
          const chunk = html.slice(cursor);
          const cleaned = rawTagStack.length > 0
            ? { output: chunk, visiblePrefix }
            : this.cleanHtmlTextSegment(chunk, visiblePrefix, '', resolveLabel, options);
          out += cleaned.output;
          visiblePrefix = cleaned.visiblePrefix;
          break;
        }

        const rawTag = html.slice(cursor, tagEnd + 1);
        out += rawTag;

        const tagMatch = /^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(rawTag);
        if (tagMatch) {
          const isClosing = Boolean(tagMatch[1]);
          const tagName = tagMatch[2].toLowerCase();
          const isSelfClosing = !isClosing && /\/\s*>$/.test(rawTag);

          if (ConversationUtility.HTML_RAW_SKIP_TAGS.has(tagName)) {
            if (isClosing) {
              const stackIdx = rawTagStack.lastIndexOf(tagName);
              if (stackIdx !== -1) {
                rawTagStack.splice(stackIdx);
              }
            } else if (!isSelfClosing) {
              rawTagStack.push(tagName);
            }
          } else if (ConversationUtility.HTML_BLOCK_BOUNDARY_TAGS.has(tagName)) {
            visiblePrefix = '';
          }
        }

        cursor = tagEnd + 1;
        continue;
      }

      const nextTagIdx = html.indexOf('<', cursor);
      const textEnd = nextTagIdx === -1 ? len : nextTagIdx;
      const textSegment = html.slice(cursor, textEnd);
      const nextFollowing = nextTagIdx === -1 ? '' : html.slice(nextTagIdx, Math.min(len, nextTagIdx + 32));

      if (rawTagStack.length > 0) {
        out += textSegment;
      } else {
        const cleaned = this.cleanHtmlTextSegment(textSegment, visiblePrefix, nextFollowing, resolveLabel, options);
        out += cleaned.output;
        visiblePrefix = cleaned.visiblePrefix;
      }

      cursor = textEnd;
    }

    return out;
  }

  /**
   * Create a clickable record-link token for Chat `message`.
   * Primary-key fields are siblings named as in entity metadata.
   * Reserved names land in nested `keys`.
   *
   * `name` is the pill label. Omit it (or pass empty) for an icon-only pill —
   * the right call when surrounding prose already names the record.
   */
  public static CreateRecordLink(
    entityName: string,
    name: string | null | undefined,
    primaryKey: Record<string, string | number>
  ): string {
    const content: Record<string, unknown> = {
      _mode: 'mention',
      type: 'record',
      entityName,
    };
    const trimmedName = (name ?? '').trim();
    if (trimmedName) {
      content.name = trimmedName;
    }
    const nested: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(primaryKey)) {
      if ((ConversationUtility.RECORD_LINK_RESERVED_KEYS as readonly string[]).includes(k)) {
        nested[k] = v;
      } else {
        content[k] = v;
      }
    }
    if (Object.keys(nested).length > 0) {
      content.keys = nested;
    }
    return `@${JSON.stringify(content)}`;
  }

  /**
   * All PK-ish values on a record-link token: nested `keys`, sibling fields,
   * and `id` as an alias for `ID`.
   */
  public static RecordLinkKeyMap(content: MentionContent): Record<string, string | number> {
    const map: Record<string, string | number> = {};
    if (content.keys && typeof content.keys === 'object') {
      for (const [k, v] of Object.entries(content.keys)) {
        if (v != null && v !== '') {
          map[k] = v;
        }
      }
    }
    for (const [k, v] of Object.entries(content as unknown as Record<string, unknown>)) {
      if ((ConversationUtility.RECORD_LINK_RESERVED_KEYS as readonly string[]).includes(k)) {
        continue;
      }
      if (typeof v === 'string' || typeof v === 'number') {
        map[k] = v;
      }
    }
    if (map.ID == null && content.id) {
      map.ID = content.id;
    }
    return map;
  }

  /**
   * Build a CompositeKey from a record-link token using the entity's PK field names
   * (from `EntityInfo.PrimaryKeys`). Returns null if any PK part is missing.
   */
  public static CompositeKeyFromRecordLink(
    content: MentionContent,
    primaryKeyNames: string[]
  ): CompositeKey | null {
    if (content.type !== 'record' || primaryKeyNames.length === 0) {
      return null;
    }
    const map = this.RecordLinkKeyMap(content);
    const pairs: KeyValuePair[] = [];
    for (const name of primaryKeyNames) {
      const value = map[name] ?? (name === 'ID' ? map['id'] : undefined);
      if (value == null || value === '') {
        return null;
      }
      pairs.push({ FieldName: name, Value: String(value) });
    }
    return new CompositeKey(pairs);
  }

  /**
   * Build a CompositeKey from an `open:resource` Record command.
   * `keys` wins per field; `resourceId` fills a single PK (or a PK named ID).
   */
  public static CompositeKeyFromOpenResource(
    command: { resourceId?: string; keys?: Record<string, string | number> },
    primaryKeyNames: string[]
  ): CompositeKey | null {
    if (primaryKeyNames.length === 0) {
      return null;
    }
    const pairs: KeyValuePair[] = [];
    for (const name of primaryKeyNames) {
      const fromKeys = command.keys?.[name];
      const fromResourceId =
        name === 'ID' || primaryKeyNames.length === 1 ? command.resourceId : undefined;
      const value = fromKeys ?? fromResourceId;
      if (value == null || value === '') {
        return null;
      }
      pairs.push({ FieldName: name, Value: String(value) });
    }
    return new CompositeKey(pairs);
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
  public static async BuildChatMessageContent(
    messageText: string,
    attachmentData: AttachmentData[],
    agents?: AgentInfo[],
    users?: UserInfo[]
  ): Promise<ChatMessageContent> {
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
        if (parsed.type === 'record') {
          // `name` is optional: omit it for an icon-only pill.
          if (parsed.entityName) {
            return parsed as MentionContent;
          }
        } else if (parsed.type && parsed.id && parsed.name) {
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

  private static readonly HTML_RAW_SKIP_TAGS = new Set(['script', 'style', 'code', 'pre']);

  private static readonly HTML_BLOCK_BOUNDARY_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt',
    'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
  ]);

  private static isRecordMentionToken(
    token: SpecialContentToken
  ): token is SpecialContentToken & { content: MentionContent } {
    return token.mode === 'mention' && 'type' in token.content && token.content.type === 'record';
  }

  private static trimTrailingHorizontalWhitespace(text: string): string {
    let end = text.length;
    while (end > 0 && (text[end - 1] === ' ' || text[end - 1] === '\t')) {
      end--;
    }
    return end === text.length ? text : text.slice(0, end);
  }

  private static endsWithRecordTitle(prefix: string, label: string): boolean {
    if (!label) {
      return false;
    }
    const trimmed = this.trimTrailingHorizontalWhitespace(prefix);
    let end = trimmed.length;
    while (end > 0 && '*_`"\']'.includes(trimmed[end - 1])) {
      end--;
    }
    const start = end - label.length;
    if (start < 0) {
      return false;
    }
    if (trimmed.slice(start, end).toLowerCase() !== label.toLowerCase()) {
      return false;
    }
    if (start === 0) {
      return true;
    }
    const boundary = trimmed[start - 1];
    return /\s/.test(boundary) || '(["\'*_`>:'.includes(boundary);
  }

  private static decodeHtmlEntities(text: string): string {
    return text.replace(/&(amp|quot|apos|lt|gt|#34|#x22|#39|#x27);/gi, (match, entity: string) => {
      switch (entity.toLowerCase()) {
        case 'amp': return '&';
        case 'quot':
        case '#34':
        case '#x22': return '"';
        case 'apos':
        case '#39':
        case '#x27': return "'";
        case 'lt': return '<';
        case 'gt': return '>';
        default: return match;
      }
    });
  }

  private static findHtmlTagEnd(html: string, start: number): number {
    let quote: '"' | "'" | null = null;
    for (let i = start + 1; i < html.length; i++) {
      const ch = html[i];
      if (quote) {
        if (ch === quote) {
          quote = null;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        return i;
      }
    }
    return -1;
  }

  private static cleanHtmlTextSegment(
    segment: string,
    initialVisiblePrefix: string,
    nextFollowingHtml: string,
    resolveLabel: (content: MentionContent) => string,
    options?: CleanMentionsOptions
  ): { output: string; visiblePrefix: string } {
    if (!segment.includes('@{')) {
      return {
        output: segment,
        visiblePrefix: initialVisiblePrefix + this.decodeHtmlEntities(segment),
      };
    }

    let output = '';
    let visiblePrefix = initialVisiblePrefix;
    let index = 0;

    while (index < segment.length) {
      const atIndex = segment.indexOf('@{', index);
      if (atIndex === -1) {
        const tail = segment.slice(index);
        output += tail;
        visiblePrefix += this.decodeHtmlEntities(tail);
        break;
      }

      const before = segment.slice(index, atIndex);
      output += before;
      visiblePrefix += this.decodeHtmlEntities(before);

      let braceDepth = 0;
      let endIndex = -1;
      for (let i = atIndex + 2; i < segment.length; i++) {
        if (segment[i] === '{') {
          braceDepth++;
        } else if (segment[i] === '}') {
          if (braceDepth === 0) {
            endIndex = i;
            break;
          }
          braceDepth--;
        }
      }

      if (endIndex === -1) {
        const rest = segment.slice(atIndex);
        output += rest;
        visiblePrefix += this.decodeHtmlEntities(rest);
        break;
      }

      const fullMatch = segment.slice(atIndex, endIndex + 1);
      const rawJson = fullMatch.slice(2, -1);
      const decodedJson = this.decodeHtmlEntities(rawJson);
      const content = this.parseToken(decodedJson);

      if (!content) {
        output += fullMatch;
        visiblePrefix += this.decodeHtmlEntities(fullMatch);
        index = endIndex + 1;
        continue;
      }

      const mode = this.getMode(content);
      const token: SpecialContentToken = {
        mode,
        content,
        startIndex: atIndex,
        endIndex: endIndex + 1,
        originalText: `@{${decodedJson}}`,
      };

      if (this.isRecordMentionToken(token)) {
        const label = resolveLabel(token.content);
        if (this.endsWithRecordTitle(visiblePrefix, label)) {
          const nextChar = segment[endIndex + 1] ?? '';
          const followedByClosingOrBoundary =
            nextChar === ''
              ? nextFollowingHtml === '' || /^<\s*\//.test(nextFollowingHtml) || this.startsWithBlockBoundaryTag(nextFollowingHtml)
              : /^[\s.,;:!?)\]}'"]/.test(nextChar);
          if (followedByClosingOrBoundary) {
            output = this.trimTrailingHorizontalWhitespace(output);
            visiblePrefix = this.trimTrailingHorizontalWhitespace(visiblePrefix);
          }
          index = endIndex + 1;
          continue;
        }
      }

      const plainReplacement = this.ToPlainText(token.originalText, options?.agents, options?.users);
      output += this.escapeHtml(plainReplacement);
      visiblePrefix += plainReplacement;
      index = endIndex + 1;
    }

    return { output, visiblePrefix };
  }

  private static startsWithBlockBoundaryTag(htmlFragment: string): boolean {
    const match = /^<\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(htmlFragment);
    return match ? ConversationUtility.HTML_BLOCK_BOUNDARY_TAGS.has(match[1].toLowerCase()) : false;
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
    let name = content.name ?? '';

    if (content.type === 'record') {
      return ConversationUtility.ResolveRecordLinkLabel(content);
    }

    // Try to look up actual name if ID provided
    if (content.type === 'agent' && agents && content.id) {
      const agent = agents.find(a => UUIDsEqual(a.ID, content.id));
      if (agent) name = agent.Name;
    } else if (content.type === 'user' && users && content.id) {
      const user = users.find(u => UUIDsEqual(u.ID, content.id));
      if (user) name = user.Name;
    }

    // Entity and query mentions use a distinct '#' prefix; agents/users use '@'
    const prefix = content.type === 'entity' || content.type === 'query' ? '#' : '@';
    return `${prefix}${name}`;
  }

  /**
   * Convert mention content to agent context (no @ prefix)
   * Format: "Agent Name"
   */
  private static mentionToAgentContext(content: MentionContent, agents?: AgentInfo[], users?: UserInfo[]): string {
    let name = content.name ?? '';

    if (content.type === 'record') {
      const keys = this.RecordLinkKeyMap(content);
      const pk = Object.entries(keys).map(([k, v]) => `${k}=${v}`).join(', ');
      return `${ConversationUtility.ResolveRecordLinkLabel(content)} [${content.entityName || 'record'}${pk ? '; ' + pk : ''}]`;
    }

    // Try to look up actual name if ID provided
    if (content.type === 'agent' && agents && content.id) {
      const agent = agents.find(a => UUIDsEqual(a.ID, content.id));
      if (agent) name = agent.Name;
    } else if (content.type === 'user' && users && content.id) {
      const user = users.find(u => UUIDsEqual(u.ID, content.id));
      if (user) name = user.Name;
    } else if (content.type === 'query') {
      // Mark runnable-query mentions so downstream agent logic can act on them.
      // No dedicated resolver yet — name + ID gives a follow-up enough to run the query.
      return `query "${name}" (ID: ${content.id})`;
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
 * Options for {@link ConversationUtility.CleanMentions} and {@link ConversationUtility.CleanHtmlMentions}.
 */
export interface CleanMentionsOptions {
  /** Optional agent lookup list for resolving agent mention IDs to current names. */
  agents?: AgentInfo[];
  /** Optional user lookup list for resolving user mention IDs to current names. */
  users?: UserInfo[];
  /** Optional custom resolver for `record` mention labels (defaults to {@link ConversationUtility.ResolveRecordLinkLabel}). */
  recordLinkLabel?: (content: MentionContent) => string;
}

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
 * Mention content (@agent, @user, #entity, #query, or a clickable record row)
 */
export interface MentionContent {
  /** Mode identifier (optional for backward compatibility) */
  _mode?: 'mention';
  /** Type of mention. `record` is a row (opens via OpenEntityRecord), not an entity definition. */
  type: 'agent' | 'user' | 'entity' | 'query' | 'record';
  /** ID of the mentioned agent/user/entity/query. Optional on `record` (PK fields are siblings). */
  id?: string;
  /**
   * Display name. Required for agent/user/entity/query mentions.
   * Optional on `type: "record"` — omit (or leave empty) for an icon-only pill
   * when surrounding prose already names the record.
   */
  name?: string;
  /** Entity name from metadata. Required on `type: "record"`. */
  entityName?: string;
  /**
   * Escape hatch when a PK field name collides with a reserved mention key.
   * Normal record links put PK fields as siblings instead.
   */
  keys?: Record<string, string | number>;
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
