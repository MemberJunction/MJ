import { Injectable } from '@angular/core';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * Item in the autocomplete dropdown
 */
export interface MentionSuggestion {
  type: 'agent' | 'user';
  id: string;
  name: string;
  displayName: string;
  description?: string;
  avatarUrl?: string; // Deprecated, use imageUrl
  imageUrl?: string; // For agent LogoURL or user avatar
  icon?: string; // For agents (FontAwesome class)
}

/**
 * Service for autocomplete suggestions when typing @mentions
 */
@Injectable({
  providedIn: 'root'
})
export class MentionAutocompleteService {
  private agentsCache: AIAgentEntityExtended[] = [];
  private usersCache: UserInfo[] = [];
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {}

  /**
   * Initialize the service by loading agents and users
   * Prevents concurrent initialization with promise lock
   */
  async initialize(currentUser: UserInfo): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Create initialization promise and store it
    this.initializationPromise = this._initializeInternal(currentUser);

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  private async _initializeInternal(currentUser: UserInfo): Promise<void> {
    try {
      // Load agents from AIEngineBase
      await AIEngineBase.Instance.Config(false);

      const allAgents = AIEngineBase.Instance.Agents || [];

      this.agentsCache = allAgents.filter(
        a => !a.ParentID && a.Status === 'Active' && a.InvocationMode !== 'Sub-Agent' && !a.IsRestricted
      );

      // Load users from the system (optional - can be expanded later)
      // For now, we'll just use the current user
      this.usersCache = [currentUser];

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize MentionAutocompleteService:', error);
      throw error;
    }
  }

  /**
   * Get suggestions based on search query
   * @param query The search text after @ symbol
   * @param includeUsers Whether to include users in suggestions
   * @returns Filtered and ranked suggestions
   */
  getSuggestions(query: string, includeUsers: boolean = true): MentionSuggestion[] {
    const lowerQuery = query.toLowerCase().trim();
    const suggestions: MentionSuggestion[] = [];

    // Add agent suggestions
    for (const agent of this.agentsCache) {
      const score = this.calculateMatchScore(agent.Name || '', lowerQuery);
      if (score > 0 || !lowerQuery) {
        suggestions.push({
          type: 'agent',
          id: agent.ID,
          name: agent.Name || 'Unknown',
          displayName: agent.Name || 'Unknown',
          description: agent.Description || undefined,
          imageUrl: agent.LogoURL || undefined, // Agent logo/avatar image
          icon: this.getAgentIcon(agent)
        });
      }
    }

    // Add user suggestions (if enabled)
    if (includeUsers) {
      for (const user of this.usersCache) {
        const score = this.calculateMatchScore(user.Name, lowerQuery);
        if (score > 0 || !lowerQuery) {
          suggestions.push({
            type: 'user',
            id: user.ID,
            name: user.Name,
            displayName: user.Name,
            description: user.Email || undefined,
            avatarUrl: undefined // Future: load user avatars
          });
        }
      }
    }

    // Sort by relevance: exact match > starts with > contains
    return suggestions.sort((a, b) => {
      const scoreA = this.calculateMatchScore(a.name, lowerQuery);
      const scoreB = this.calculateMatchScore(b.name, lowerQuery);
      if (scoreB !== scoreA) return scoreB - scoreA;

      // If scores are equal, sort agents before users
      if (a.type !== b.type) return a.type === 'agent' ? -1 : 1;

      // Otherwise alphabetically
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Calculate match score for ranking
   * Higher score = better match
   */
  private calculateMatchScore(name: string, query: string): number {
    if (!query) return 1; // Show all if no query

    const lowerName = name.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // Exact match
    if (lowerName === lowerQuery) return 100;

    // Starts with
    if (lowerName.startsWith(lowerQuery)) return 50;

    // Contains
    if (lowerName.includes(lowerQuery)) return 25;

    // Word boundary match (e.g., "MA" matches "Marketing Agent")
    const words = lowerName.split(/\s+/);
    for (const word of words) {
      if (word.startsWith(lowerQuery)) return 40;
    }

    return 0; // No match
  }

  /**
   * Get icon for agent based on type/name
   */
  private getAgentIcon(agent: AIAgentEntityExtended): string {
    // Use agent's icon if available, otherwise default based on type
    if (agent.IconClass) return agent.IconClass;

    // Default icons based on agent name patterns
    const name = agent.Name?.toLowerCase() || '';
    if (name.includes('marketing')) return 'fa-megaphone';
    if (name.includes('data') || name.includes('analysis')) return 'fa-chart-line';
    if (name.includes('code') || name.includes('developer')) return 'fa-code';
    if (name.includes('design')) return 'fa-palette';
    if (name.includes('conversation') || name.includes('manager')) return 'fa-comments';

    return 'fa-robot'; // Default
  }

  /**
   * Get available agents for parsing
   */
  getAvailableAgents(): AIAgentEntityExtended[] {
    return this.agentsCache;
  }

  /**
   * Get available users for parsing
   */
  getAvailableUsers(): UserInfo[] {
    return this.usersCache;
  }

  /**
   * Refresh the caches
   * Resets initialization state and reloads agents
   */
  async refresh(currentUser: UserInfo): Promise<void> {
    this.isInitialized = false;
    this.initializationPromise = null;
    await this.initialize(currentUser);
  }
}
