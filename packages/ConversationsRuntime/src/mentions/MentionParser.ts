/**
 * @fileoverview Pure-TypeScript mention parser for conversation message text.
 *
 * Ported from `@memberjunction/ng-conversations/src/lib/services/mention-parser.service.ts`
 * — the original was already pure string + regex logic, the only Angular bit was the
 * `@Injectable()` decorator. Stripped that, kept everything else identical.
 *
 * Supports both formats currently in use in MJ conversations:
 * - **JSON format** (new): `@{"type":"agent","id":"<uuid>","name":"Sage","configId":"<uuid>"}`
 * - **Legacy text format**: `@AgentName` or `@"Agent Name With Spaces"`
 *
 * @module @memberjunction/conversations-runtime
 */

import { MJAIAgentEntityExtended, ConversationUtility } from '@memberjunction/ai-core-plus';
import { UserInfo } from '@memberjunction/core';

/** A single parsed mention. */
export interface Mention {
    type: 'agent' | 'user';
    id: string;
    name: string;
    /** Configuration preset ID — agent mentions only. */
    configurationId?: string;
}

/** Result of parsing all mentions out of a message. */
export interface MentionParseResult {
    /** All mentions, in order of appearance. */
    mentions: Mention[];
    /** First agent mention (if any). Conventionally the routing target. */
    agentMention: Mention | null;
    /** All user mentions. */
    userMentions: Mention[];
}

/**
 * Parses `@`-mentions out of conversation message text.
 *
 * Pure logic — no framework deps, no I/O, no observable state. Safe to call from
 * browser, Node, tests, or anywhere TypeScript runs.
 *
 * Consumers usually access this via `ConversationsRuntime.Instance.Mentions`.
 */
export class MentionParser {
    /** Matches JSON-encoded mentions like `@{"type":"agent","id":"…","name":"…"}`. */
    private readonly JSON_MENTION_REGEX = /@\{[^}]+\}/g;

    /** Matches legacy text mentions — quoted names with spaces or unquoted names. */
    private readonly LEGACY_MENTION_REGEX = /@"([^"]+)"|@(\S+)/g;

    /**
     * Parse every mention out of the supplied text.
     *
     * Tries JSON format first; if no JSON mentions are present, falls back to the legacy
     * text format and resolves names against `availableAgents` / `availableUsers`.
     *
     * @param text Message text to parse
     * @param availableAgents Agents to resolve legacy `@Name` references against
     * @param availableUsers Optional users to resolve legacy `@Name` references against
     * @returns Parsed mentions with agent/user separation
     *
     * @example
     * ```typescript
     * const result = parser.parseMentions(
     *     '@Sage help me with this',
     *     AIEngineBase.Instance.Agents
     * );
     * if (result.agentMention) {
     *     // Route the message to result.agentMention.id
     * }
     * ```
     */
    public parseMentions(
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
                const jsonStr = match[0].substring(1);
                const mentionData = JSON.parse(jsonStr);

                // Validate required fields
                if (mentionData.type && mentionData.id && mentionData.name) {
                    const mention: Mention = {
                        type: mentionData.type,
                        id: mentionData.id,
                        name: mentionData.name,
                    };

                    // Add configuration if present (for agents)
                    if (mentionData.configId) {
                        mention.configurationId = mentionData.configId;
                    }

                    mentions.push(mention);
                }
            } catch (error) {
                console.warn('MentionParser: failed to parse JSON mention:', match[0], error);
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
        }

        // Extract first agent mention and all user mentions
        const agentMention = mentions.find((m) => m.type === 'agent') || null;
        const userMentions = mentions.filter((m) => m.type === 'user');

        return { mentions, agentMention, userMentions };
    }

    /**
     * Validate every mention in `text`. Returns an array of mention names that could not be
     * resolved to a known agent or user.
     */
    public validateMentions(
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
                        const isUser = availableUsers
                            ? this.findUser(mentionName, availableUsers) !== null
                            : false;
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
                const isUser = availableUsers
                    ? this.findUser(mentionName, availableUsers) !== null
                    : false;

                if (!isAgent && !isUser) {
                    invalidMentions.push(mentionName);
                }
            }
        }

        return invalidMentions;
    }

    /**
     * Extract every raw mention name from `text` (no resolution against agents/users).
     */
    public extractMentionNames(text: string): string[] {
        // Check JSON mentions first
        const jsonMatches = Array.from(text.matchAll(this.JSON_MENTION_REGEX));
        if (jsonMatches.length > 0) {
            return jsonMatches
                .map((match) => {
                    try {
                        const jsonStr = match[0].substring(1);
                        const mentionData = JSON.parse(jsonStr);
                        return mentionData.name;
                    } catch (error) {
                        return '';
                    }
                })
                .filter(Boolean);
        }

        // Fall back to legacy format
        const matches = Array.from(text.matchAll(this.LEGACY_MENTION_REGEX));
        return matches.map((match) => match[1] || match[2]).filter(Boolean);
    }

    /**
     * Rewrite mentions in `text` to a canonical `@Name` format using the proper casing
     * from `mentions`. Useful when normalizing user-typed mentions before storage or display.
     */
    public formatMentions(text: string, mentions: Mention[]): string {
        let formattedText = text;

        for (const mention of mentions) {
            // Find the mention in the text and replace with proper name
            const patterns = [
                new RegExp(`@"${mention.name}"`, 'gi'),
                new RegExp(`@${mention.name.replace(/\s+/g, '\\s*')}`, 'gi'),
            ];

            for (const pattern of patterns) {
                formattedText = formattedText.replace(pattern, `@${mention.name}`);
            }
        }

        return formattedText;
    }

    /**
     * Convert a message containing JSON-encoded mentions to plain text — `@{…}` blocks
     * become simple `@Name` strings. Delegates to
     * {@link ConversationUtility.ToPlainText} which is the canonical implementation.
     *
     * @example
     * ```typescript
     * // Input:  '@{"type":"agent","id":"123","name":"Sage"} help me'
     * // Output: '@Sage help me'
     * ```
     */
    public toPlainText(
        text: string,
        agents?: MJAIAgentEntityExtended[],
        users?: UserInfo[]
    ): string {
        if (!text) return '';

        // Convert agents to the AgentInfo format expected by ConversationUtility
        const agentInfos = agents?.map((a) => ({
            ID: a.ID,
            Name: a.Name || 'Unknown',
        }));

        // Convert users to the UserInfo format expected by ConversationUtility
        const userInfos = users?.map((u) => ({
            ID: u.ID,
            Name: u.Name,
        }));

        return ConversationUtility.ToPlainText(text, agentInfos, userInfos);
    }

    /**
     * Find an agent by name (case-insensitive). Tries exact match first, then starts-with.
     * Explicitly does NOT do a contains-match — that would be ambiguous when multiple agent
     * names share a substring (`@Agent` matching `Marketing Agent`, `Data Agent`, …).
     */
    private findAgent(
        name: string,
        agents: MJAIAgentEntityExtended[]
    ): MJAIAgentEntityExtended | null {
        // Remove trailing punctuation and trim
        const cleanName = name.replace(/[.,;!?]+$/, '').trim();
        const lowerName = cleanName.toLowerCase();

        // Try exact match first
        let agent = agents.find((a) => (a.Name?.toLowerCase() || '') === lowerName);
        if (agent) return agent;

        // Try starts-with match
        agent = agents.find((a) => (a.Name?.toLowerCase() || '').startsWith(lowerName));
        return agent ?? null;
    }

    /**
     * Find a user by name (case-insensitive). Tries exact name, email, then starts-with name.
     * Same no-contains-match rule as {@link findAgent} for consistency.
     */
    private findUser(name: string, users: UserInfo[]): UserInfo | null {
        const lowerName = name.toLowerCase().trim();

        // Try exact match first
        let user = users.find((u) => u.Name.toLowerCase() === lowerName);
        if (user) return user;

        // Try email match
        user = users.find((u) => u.Email?.toLowerCase() === lowerName);
        if (user) return user;

        // Try starts-with match
        user = users.find((u) => u.Name.toLowerCase().startsWith(lowerName));
        return user ?? null;
    }
}
