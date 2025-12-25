/**
 * @fileoverview Utility class for parsing and formatting special content in conversation messages.
 *
 * This module provides centralized logic for handling @{...} syntax in conversation messages,
 * supporting multiple content types (mentions, forms, etc.) with context-aware rendering.
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.118.0
 */

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

  // ==================== Private Helper Methods ====================

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
export type SpecialContent = MentionContent | FormResponseContent;

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
