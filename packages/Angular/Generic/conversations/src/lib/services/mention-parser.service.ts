import { Injectable } from '@angular/core';
import { Mention, MentionParseResult } from '../models/conversation-state.model';
import { AIAgentEntityExtended } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/global';

/**
 * Service for parsing @mentions from message text
 */
@Injectable({
  providedIn: 'root',
})
export class MentionParserService {
  // Regex to match @mentions - supports names with spaces if quoted: @"Agent Name" or @AgentName
  private readonly MENTION_REGEX = /@"([^"]+)"|@(\S+)/g;

  constructor() {}

  /**
   * Parse mentions from message text
   * @param text The message text to parse
   * @param availableAgents List of available agents for matching
   * @param availableUsers List of available users for matching (optional)
   * @returns Parsed mentions with agent and user separation
   */
  parseMentions(text: string, availableAgents: AIAgentEntityExtended[], availableUsers?: UserInfo[]): MentionParseResult {
    const mentions: Mention[] = [];
    const matches = Array.from(text.matchAll(this.MENTION_REGEX));

    for (const match of matches) {
      // Extract the mention name (either quoted or unquoted)
      const mentionName = match[1] || match[2];
      if (!mentionName) continue;

      // Try to match against agents first
      const agent = this.findAgent(mentionName, availableAgents);
      if (agent) {
        mentions.push({
          type: 'agent',
          id: agent.ID,
          name: agent.Name || 'Unknown',
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
            name: user.Name,
          });
        }
      }
    }

    // Extract first agent mention and all user mentions
    const agentMention = mentions.find((m) => m.type === 'agent') || null;
    const userMentions = mentions.filter((m) => m.type === 'user');

    return {
      mentions,
      agentMention,
      userMentions,
    };
  }

  /**
   * Find an agent by name (case-insensitive)
   * Uses exact match or starts-with match (no contains match to avoid ambiguity)
   */
  private findAgent(name: string, agents: AIAgentEntityExtended[]): AIAgentEntityExtended | null {
    // Remove trailing punctuation and trim
    const cleanName = name.replace(/[.,;!?]+$/, '').trim();
    const lowerName = cleanName.toLowerCase();

    // Try exact match first
    let agent = agents.find((a) => (a.Name?.toLowerCase() || '') === lowerName);
    if (agent) {
      return agent;
    }

    // Try starts with match
    agent = agents.find((a) => (a.Name?.toLowerCase() || '').startsWith(lowerName));
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
    let user = users.find((u) => u.Name.toLowerCase() === lowerName);
    if (user) return user;

    // Try email match
    user = users.find((u) => u.Email?.toLowerCase() === lowerName);
    if (user) return user;

    // Try starts with match
    user = users.find((u) => u.Name.toLowerCase().startsWith(lowerName));
    return user || null;

    // Note: Removed "contains" match for consistency with agent matching
  }

  /**
   * Validate mentions - check if all mentions are valid
   * Returns array of invalid mention names
   */
  validateMentions(text: string, availableAgents: AIAgentEntityExtended[], availableUsers?: UserInfo[]): string[] {
    const invalidMentions: string[] = [];
    const matches = Array.from(text.matchAll(this.MENTION_REGEX));

    for (const match of matches) {
      const mentionName = match[1] || match[2];
      if (!mentionName) continue;

      const isAgent = this.findAgent(mentionName, availableAgents) !== null;
      const isUser = availableUsers ? this.findUser(mentionName, availableUsers) !== null : false;

      if (!isAgent && !isUser) {
        invalidMentions.push(mentionName);
      }
    }

    return invalidMentions;
  }

  /**
   * Extract all mention names from text (raw strings)
   */
  extractMentionNames(text: string): string[] {
    const matches = Array.from(text.matchAll(this.MENTION_REGEX));
    return matches.map((match) => match[1] || match[2]).filter(Boolean);
  }

  /**
   * Replace mentions in text with formatted versions
   * Example: "@agent" -> "@Agent Name" (with proper casing)
   */
  formatMentions(text: string, mentions: Mention[]): string {
    let formattedText = text;

    for (const mention of mentions) {
      // Find the mention in the text and replace with proper name
      const patterns = [new RegExp(`@"${mention.name}"`, 'gi'), new RegExp(`@${mention.name.replace(/\s+/g, '\\s*')}`, 'gi')];

      for (const pattern of patterns) {
        formattedText = formattedText.replace(pattern, `@${mention.name}`);
      }
    }

    return formattedText;
  }
}
