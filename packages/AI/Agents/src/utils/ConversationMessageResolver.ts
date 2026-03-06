/**
 * @fileoverview Utility for resolving conversation message references in agent mappings.
 *
 * Provides flexible syntax for accessing conversation messages in action input mappings
 * and sub-agent downstream mappings. Supports filtering by role, selecting by position,
 * and extracting specific properties.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.120.0
 */

import { ChatMessage } from '@memberjunction/ai';

/**
 * Utility class for resolving conversation message references.
 *
 * Supports a flexible syntax for accessing conversation messages:
 * - `conversation.all` - All messages
 * - `conversation.user.last` - Last user message
 * - `conversation.ai.first` - First assistant message
 * - `conversation.all.last[3]` - Last 3 messages
 * - `conversation.user.last[5]` - Last 5 user messages
 * - `conversation.user.last.content` - Content of last user message
 *
 * @example
 * ```typescript
 * const messages = [
 *   { role: 'user', content: 'Hello' },
 *   { role: 'assistant', content: 'Hi there!' },
 *   { role: 'user', content: 'How are you?' }
 * ];
 *
 * // Get last user message
 * const last = ConversationMessageResolver.resolve('conversation.user.last', messages);
 * // Returns: { role: 'user', content: 'How are you?' }
 *
 * // Get last 2 messages
 * const lastTwo = ConversationMessageResolver.resolve('conversation.all.last[2]', messages);
 * // Returns: [{ role: 'assistant', ... }, { role: 'user', ... }]
 *
 * // Get content of last user message
 * const content = ConversationMessageResolver.resolve('conversation.user.last.content', messages);
 * // Returns: 'How are you?'
 * ```
 */
export class ConversationMessageResolver {
    /**
     * Resolves conversation message references.
     *
     * Syntax: `conversation.<role>.<position>[count].<property>`
     *
     * - `<role>`: all, user, assistant (or ai as alias), system
     * - `<position>`: last, first
     * - `[count]`: Optional number in brackets - returns that many messages
     * - `<property>`: Optional property path to extract from message(s)
     *
     * @param conversationPath - The conversation reference path to resolve
     * @param conversationMessages - Array of chat messages to resolve from
     * @returns Resolved message(s) or property value(s), or undefined if invalid path
     */
    public static resolve(
        conversationPath: string,
        conversationMessages: ChatMessage[]
    ): ChatMessage | ChatMessage[] | any | undefined {

        // Parse: conversation.<role>.<position>[count].<property>
        const parts = conversationPath.split('.');

        if (parts[0]?.toLowerCase() !== 'conversation') {
            return undefined;
        }

        // Extract role (all, user, assistant/ai, system)
        const roleSpec = parts[1]?.toLowerCase();
        if (!roleSpec) {
            return undefined;
        }

        // If just "conversation.all", return all messages
        if (roleSpec === 'all' && parts.length === 2) {
            return conversationMessages;
        }

        // Filter by role
        const roleFilter = this.getRoleFilter(roleSpec);
        const filteredMessages = roleFilter
            ? conversationMessages.filter(roleFilter)
            : conversationMessages;

        // Extract position and count
        const positionSpec = parts[2];
        if (!positionSpec) {
            // Just "conversation.user" - return all of that role
            return filteredMessages;
        }

        // Parse position and optional count: "last[3]" or "first[2]"
        const match = positionSpec.match(/^(first|last)(?:\[(\d+)\])?$/i);
        if (!match) {
            // Not a position spec, might be a property on the array
            // e.g., "conversation.all.length"
            return this.getValueFromPath(filteredMessages, positionSpec);
        }

        const position = match[1].toLowerCase();
        const count = match[2] ? parseInt(match[2], 10) : 1;

        // Get messages based on position
        let result: ChatMessage | ChatMessage[] | undefined;
        if (position === 'last') {
            const selected = filteredMessages.slice(-count);
            result = count === 1 ? selected[0] : selected;
        } else if (position === 'first') {
            const selected = filteredMessages.slice(0, count);
            result = count === 1 ? selected[0] : selected;
        }

        if (result === undefined) {
            return undefined;
        }

        // Check if there's a property path to extract
        if (parts.length > 3) {
            const propertyPath = parts.slice(3).join('.');
            if (Array.isArray(result)) {
                // Map property over array
                return result.map(item => this.getValueFromPath(item, propertyPath));
            } else {
                // Get property from single object
                return this.getValueFromPath(result, propertyPath);
            }
        }

        return result;
    }

    /**
     * Gets the role filter function for a given role specification.
     *
     * @param roleSpec - Role specification (all, user, assistant, ai, system)
     * @returns Filter function or null for 'all'
     * @private
     */
    private static getRoleFilter(roleSpec: string): ((msg: ChatMessage) => boolean) | null {
        switch (roleSpec) {
            case 'all':
                return null; // No filtering
            case 'user':
                return (msg) => msg.role === 'user';
            case 'assistant':
            case 'ai':
                return (msg) => msg.role === 'assistant';
            case 'system':
                return (msg) => msg.role === 'system';
            default:
                return null;
        }
    }

    /**
     * Checks if a mapping value is a conversation reference.
     *
     * @param value - The value to check
     * @returns True if the value is a conversation reference
     */
    public static isConversationReference(value: string): boolean {
        return typeof value === 'string' &&
               value.trim().toLowerCase().startsWith('conversation.');
    }

    /**
     * Helper method to get a value from a nested object path.
     * Supports both dot notation (obj.prop) and array indexing (arr[0]).
     *
     * @param obj - The object to extract value from
     * @param path - The property path (e.g., "user.name" or "items[0].title")
     * @returns The value at the path, or undefined if not found
     * @private
     */
    private static getValueFromPath(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (!part) continue;

            // Check if this part contains array indexing like "arrayName[0]"
            const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);

            if (arrayMatch) {
                // Extract array name and index
                const arrayName = arrayMatch[1];
                const index = parseInt(arrayMatch[2], 10);

                // Navigate to the array
                if (current && typeof current === 'object' && arrayName in current) {
                    current = current[arrayName];

                    // Access the array element
                    if (Array.isArray(current) && index >= 0 && index < current.length) {
                        current = current[index];
                    } else {
                        return undefined;
                    }
                } else {
                    return undefined;
                }
            } else {
                // Regular property access
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return undefined;
                }
            }
        }

        return current;
    }
}

