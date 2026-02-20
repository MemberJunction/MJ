import { Injectable } from '@angular/core';
import { Mention, MentionParseResult } from '../models/conversation-state.model';
import { MJAIAgentEntityExtended, ConversationUtility } from '@memberjunction/ai-core-plus';
import { UserInfo } from '@memberjunction/core';

/**
 * Service for parsing @mentions from message text
 * Supports both JSON format and legacy text format
 */
@Injectable({
  providedIn: 'root'
})
export class MentionParserService {
  // Regex to match JSON mentions: @{type:"agent",id:"uuid",name:"Name",configId:"uuid",config:"High"}
  private readonly JSON_MENTION_REGEX = /@\{[^}]+\}/g;
  // Regex to match legacy @mentions - supports names with spaces if quoted: @"Agent Name" or @AgentName
  private readonly LEGACY_MENTION_REGEX = /@"([^"]+)"|@(\S+)/g;

  constructor() {}

  /**
   * Parse mentions from message text
   * Supports both JSON format (@{type:"agent",id:"uuid",...}) and legacy text format (@AgentName)
   * @param text The message text to parse
   * @param availableAgents List of available agents for matching
   * @param availableUsers List of available users for matching (optional)
   * @returns Parsed mentions with agent and user separation
   */
  parseMentions(
    text: string,
    availableAgents: MJAIAgentEntityExtended[],
    availableUsers?: UserInfo[]
  ): MentionParseResult {
    const mentions: Mention[] = [];

    // First, try to parse JSON mentions (new format)
    const jsonMatches = Array.from(text.matchAll(this.JSON_MENTION_REGEX));

    for (const match of jsonMatches) {
      try {
        // Extract JSON string (remove @ prefix)
        const jsonStr = match[0].substring(1); // Remove '@'
        const mentionData = JSON.parse(jsonStr);

        // Validate required fields
        if (mentionData.type && mentionData.id && mentionData.name) {
          const mention: Mention = {
            type: mentionData.type,
            id: mentionData.id,
            name: mentionData.name
          };

          // Add configuration if present (for agents)
          if (mentionData.configId) {
            mention.configurationId = mentionData.configId;
          }

          mentions.push(mention);
        }
      } catch (error) {
        console.warn('Failed to parse JSON mention:', match[0], error);
        // Continue to next match
      }
    }

    // If no JSON mentions found, fall back to legacy text format
    if (mentions.length === 0) {
      const legacyMatches = Array.from(text.matchAll(this.LEGACY_MENTION_REGEX));

      for (const match of legacyMatches) {
        // Extract the mention name (either quoted or unquoted)
        const mentionName = match[1] || match[2];
        if (!mentionName) continue;

        // Try to match against agents first
        const agent = this.findAgent(mentionName, availableAgents);
        if (agent) {
          mentions.push({
            type: 'agent',
            id: agent.ID,
            name: agent.Name || 'Unknown'
          });
          continue;
        }

        // Try to match against users
        if (availableUsers) {
          const user = this.findUser(mentionName, availableUsers);
          if (user) {
            mentions.push({
              type: 'user',
              id: user.ID,
              name: user.Name
            });
          }
        }
      }
    }

    // Extract first agent mention and all user mentions
    const agentMention = mentions.find(m => m.type === 'agent') || null;
    const userMentions = mentions.filter(m => m.type === 'user');

    return {
      mentions,
      agentMention,
      userMentions
    };
  }

  /**
   * Find an agent by name (case-insensitive)
   * Uses exact match or starts-with match (no contains match to avoid ambiguity)
   */
  private findAgent(name: string, agents: MJAIAgentEntityExtended[]): MJAIAgentEntityExtended | null {
    // Remove trailing punctuation and trim
    const cleanName = name.replace(/[.,;!?]+$/, '').trim();
    const lowerName = cleanName.toLowerCase();

    // Try exact match first
    let agent = agents.find(a => (a.Name?.toLowerCase() || '') === lowerName);
    if (agent) {
      return agent;
    }

    // Try starts with match
    agent = agents.find(a => (a.Name?.toLowerCase() || '').startsWith(lowerName));
    if (agent) {
      return agent;
    }

    return null;

    // Note: Removed "contains" match to avoid ambiguous matches
    // e.g., "@Agent" would match multiple agents like "Marketing Agent", "Data Agent"
    // Future: Could add LLM-based disambiguation as fallback
  }

  /**
   * Find a user by name (case-insensitive)
   * Uses exact match, email match, or starts-with match (no contains match to avoid ambiguity)
   */
  private findUser(name: string, users: UserInfo[]): UserInfo | null {
    const lowerName = name.toLowerCase().trim();

    // Try exact match first
    let user = users.find(u => u.Name.toLowerCase() === lowerName);
    if (user) return user;

    // Try email match
    user = users.find(u => u.Email?.toLowerCase() === lowerName);
    if (user) return user;

    // Try starts with match
    user = users.find(u => u.Name.toLowerCase().startsWith(lowerName));
    return user || null;

    // Note: Removed "contains" match for consistency with agent matching
  }

  /**
   * Validate mentions - check if all mentions are valid
   * Returns array of invalid mention names
   * Supports both JSON and legacy mention formats
   */
  validateMentions(
    text: string,
    availableAgents: MJAIAgentEntityExtended[],
    availableUsers?: UserInfo[]
  ): string[] {
    const invalidMentions: string[] = [];

    // Check JSON mentions first
    const jsonMatches = Array.from(text.matchAll(this.JSON_MENTION_REGEX));
    if (jsonMatches.length > 0) {
      for (const match of jsonMatches) {
        try {
          const jsonStr = match[0].substring(1);
          const mentionData = JSON.parse(jsonStr);
          const mentionName = mentionData.name;

          if (mentionData.type === 'agent') {
            const isAgent = this.findAgent(mentionName, availableAgents) !== null;
            if (!isAgent) {
              invalidMentions.push(mentionName);
            }
          } else if (mentionData.type === 'user') {
            const isUser = availableUsers ? this.findUser(mentionName, availableUsers) !== null : false;
            if (!isUser) {
              invalidMentions.push(mentionName);
            }
          }
        } catch (error) {
          // Invalid JSON mention
          invalidMentions.push(match[0]);
        }
      }
    } else {
      // Fall back to legacy format
      const matches = Array.from(text.matchAll(this.LEGACY_MENTION_REGEX));

      for (const match of matches) {
        const mentionName = match[1] || match[2];
        if (!mentionName) continue;

        const isAgent = this.findAgent(mentionName, availableAgents) !== null;
        const isUser = availableUsers ? this.findUser(mentionName, availableUsers) !== null : false;

        if (!isAgent && !isUser) {
          invalidMentions.push(mentionName);
        }
      }
    }

    return invalidMentions;
  }

  /**
   * Extract all mention names from text (raw strings)
   * Supports both JSON and legacy mention formats
   */
  extractMentionNames(text: string): string[] {
    // Check JSON mentions first
    const jsonMatches = Array.from(text.matchAll(this.JSON_MENTION_REGEX));
    if (jsonMatches.length > 0) {
      return jsonMatches.map(match => {
        try {
          const jsonStr = match[0].substring(1);
          const mentionData = JSON.parse(jsonStr);
          return mentionData.name;
        } catch (error) {
          return '';
        }
      }).filter(Boolean);
    }

    // Fall back to legacy format
    const matches = Array.from(text.matchAll(this.LEGACY_MENTION_REGEX));
    return matches.map(match => match[1] || match[2]).filter(Boolean);
  }

  /**
   * Replace mentions in text with formatted versions
   * Example: "@agent" -> "@Agent Name" (with proper casing)
   */
  formatMentions(
    text: string,
    mentions: Mention[]
  ): string {
    let formattedText = text;

    for (const mention of mentions) {
      // Find the mention in the text and replace with proper name
      const patterns = [
        new RegExp(`@"${mention.name}"`, 'gi'),
        new RegExp(`@${mention.name.replace(/\s+/g, '\\s*')}`, 'gi')
      ];

      for (const pattern of patterns) {
        formattedText = formattedText.replace(pattern, `@${mention.name}`);
      }
    }

    return formattedText;
  }

  /**
   * Convert a message with JSON-encoded mentions to plain text.
   * Replaces @{...} JSON mentions with simple @Name format.
   * This is a wrapper around ConversationUtility.ToPlainText() for Angular injection.
   *
   * @param text - The message text containing JSON mentions
   * @param agents - Optional array of agents for name lookup
   * @param users - Optional array of users for name lookup
   * @returns Plain text with mentions converted to @Name format
   *
   * @example
   * // Input: '@{"type":"agent","id":"123","name":"Sage"} help me'
   * // Output: '@Sage help me'
   */
  toPlainText(
    text: string,
    agents?: MJAIAgentEntityExtended[],
    users?: UserInfo[]
  ): string {
    if (!text) return '';

    // Convert agents to the AgentInfo format expected by ConversationUtility
    const agentInfos = agents?.map(a => ({
      ID: a.ID,
      Name: a.Name || 'Unknown'
    }));

    // Convert users to the UserInfo format expected by ConversationUtility
    const userInfos = users?.map(u => ({
      ID: u.ID,
      Name: u.Name
    }));

    return ConversationUtility.ToPlainText(text, agentInfos, userInfos);
  }
}
