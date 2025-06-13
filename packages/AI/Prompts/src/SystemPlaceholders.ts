/**
 * @fileoverview System placeholders for AI prompt templates.
 * 
 * This module provides a flexible system for defining placeholders that are automatically
 * available in all AI prompt templates. These placeholders can provide dynamic values
 * like current date/time, prompt metadata, user context, and more.
 * 
 * @module @memberjunction/ai-prompts
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { AIPromptParams } from './AIPromptRunner';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Defines a system placeholder that can be used in prompt templates.
 * 
 * @interface SystemPlaceholder
 * @property {string} name - The placeholder name (e.g., '_CURRENT_DATE')
 * @property {string} [description] - Optional description of what this placeholder provides
 * @property {SystemPlaceholderFunction} getValue - Async function that returns the placeholder value
 */
export interface SystemPlaceholder {
    name: string;
    description?: string;
    getValue: SystemPlaceholderFunction;
}

/**
 * Function type for system placeholder value resolution.
 * Receives the current prompt parameters and returns a string value.
 * 
 * @typedef {Function} SystemPlaceholderFunction
 * @param {AIPromptParams} params - The current prompt execution parameters
 * @returns {Promise<string>} The resolved placeholder value
 */
export type SystemPlaceholderFunction = (params: AIPromptParams) => Promise<string>;

/**
 * Default system placeholders available in all prompt templates.
 * These cover common needs like date/time, prompt metadata, and user context.
 */
export const DEFAULT_SYSTEM_PLACEHOLDERS: SystemPlaceholder[] = [
    // Date/Time placeholders
    {
        name: '_CURRENT_DATE',
        description: 'Current date in YYYY-MM-DD format',
        getValue: async (params: AIPromptParams) => {
            return format(new Date(), 'yyyy-MM-dd');
        }
    },
    {
        name: '_CURRENT_TIME',
        description: 'Current time in HH:MM AM/PM format with timezone',
        getValue: async (params: AIPromptParams) => {
            const now = new Date();
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return formatInTimeZone(now, timeZone, 'h:mm a zzz');
        }
    },
    {
        name: '_CURRENT_DATE_AND_TIME',
        description: 'Full timestamp with date and time',
        getValue: async (params: AIPromptParams) => {
            const now = new Date();
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return formatInTimeZone(now, timeZone, 'yyyy-MM-dd h:mm a zzz');
        }
    },
    {
        name: '_CURRENT_DAY_OF_WEEK',
        description: 'Current day name (e.g., Monday, Tuesday)',
        getValue: async (params: AIPromptParams) => {
            return format(new Date(), 'EEEE');
        }
    },
    {
        name: '_CURRENT_TIMEZONE',
        description: 'Current timezone identifier',
        getValue: async (params: AIPromptParams) => {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
    },
    {
        name: '_CURRENT_TIMESTAMP_UTC',
        description: 'Current UTC timestamp in ISO format',
        getValue: async (params: AIPromptParams) => {
            return new Date().toISOString();
        }
    },

    // Prompt metadata placeholders
    {
        name: '_OUTPUT_EXAMPLE',
        description: 'The expected output example from the prompt configuration',
        getValue: async (params: AIPromptParams) => {
            return params.prompt.OutputExample || '';
        }
    },
    {
        name: '_PROMPT_NAME',
        description: 'The name of the current prompt',
        getValue: async (params: AIPromptParams) => {
            return params.prompt.Name || '';
        }
    },
    {
        name: '_PROMPT_DESCRIPTION',
        description: 'The description of the current prompt',
        getValue: async (params: AIPromptParams) => {
            return params.prompt.Description || '';
        }
    },
    {
        name: '_EXPECTED_OUTPUT_TYPE',
        description: 'The expected output type (string, object, number, etc.)',
        getValue: async (params: AIPromptParams) => {
            return params.prompt.OutputType || 'string';
        }
    },
    {
        name: '_RESPONSE_FORMAT',
        description: 'The expected response format from the prompt',
        getValue: async (params: AIPromptParams) => {
            return params.prompt.ResponseFormat || 'Any';
        }
    },

    // User context placeholders
    {
        name: '_USER_NAME',
        description: 'Current user\'s full name',
        getValue: async (params: AIPromptParams) => {
            if (params.contextUser?.Name) {
                return params.contextUser.Name;
            }
            if (params.contextUser?.FirstName || params.contextUser?.LastName) {
                return `${params.contextUser.FirstName || ''} ${params.contextUser.LastName || ''}`.trim();
            }
            return 'Unknown User';
        }
    },
    {
        name: '_USER_EMAIL',
        description: 'Current user\'s email address',
        getValue: async (params: AIPromptParams) => {
            return params.contextUser?.Email || '';
        }
    },
    {
        name: '_USER_ID',
        description: 'Current user\'s unique identifier',
        getValue: async (params: AIPromptParams) => {
            return params.contextUser?.ID || '';
        }
    },

    // Environment placeholders
    {
        name: '_ENVIRONMENT',
        description: 'Current environment (development, staging, production)',
        getValue: async (params: AIPromptParams) => {
            // This could be enhanced to read from process.env or configuration
            return process.env.NODE_ENV || 'development';
        }
    },
    {
        name: '_API_VERSION',
        description: 'Current API version',
        getValue: async (params: AIPromptParams) => {
            // This could be enhanced to read from package.json or configuration
            return process.env.API_VERSION || '2.49.0';
        }
    },

    // Execution context placeholders
    {
        name: '_MODEL_ID',
        description: 'The AI model ID being used for this execution',
        getValue: async (params: AIPromptParams) => {
            return params.modelId || '';
        }
    },
    {
        name: '_VENDOR_ID',
        description: 'The AI vendor ID being used for this execution',
        getValue: async (params: AIPromptParams) => {
            return params.vendorId || '';
        }
    },
    {
        name: '_CONFIGURATION_ID',
        description: 'The configuration ID for environment-specific behavior',
        getValue: async (params: AIPromptParams) => {
            return params.configurationId || '';
        }
    },
    {
        name: '_AGENT_RUN_ID',
        description: 'The parent agent run ID if this prompt is part of an agent execution',
        getValue: async (params: AIPromptParams) => {
            return params.agentRunId || '';
        }
    },
    {
        name: '_HAS_CONVERSATION_CONTEXT',
        description: 'Whether conversation messages are provided',
        getValue: async (params: AIPromptParams) => {
            return (params.conversationMessages && params.conversationMessages.length > 0) ? 'true' : 'false';
        }
    },
    {
        name: '_CONVERSATION_LENGTH',
        description: 'Number of messages in the conversation context',
        getValue: async (params: AIPromptParams) => {
            return String(params.conversationMessages?.length || 0);
        }
    },
    {
        name: '_TEMPLATE_MESSAGE_ROLE',
        description: 'How the template will be added to conversation (system, user, or none)',
        getValue: async (params: AIPromptParams) => {
            return params.templateMessageRole || 'system';
        }
    },
    {
        name: '_IS_CHILD_PROMPT',
        description: 'Whether this prompt is being executed as a child of another prompt',
        getValue: async (params: AIPromptParams) => {
            // We can infer this from whether childPrompts exist in the params
            return params.childPrompts ? 'false' : 'possibly';
        }
    },
    {
        name: '_VALIDATION_ENABLED',
        description: 'Whether output validation is enabled',
        getValue: async (params: AIPromptParams) => {
            return params.skipValidation ? 'false' : 'true';
        }
    }
];

/**
 * Manager class for system placeholders.
 * Provides methods to get, add, remove, and resolve placeholders.
 * 
 * @class SystemPlaceholderManager
 */
export class SystemPlaceholderManager {
    /**
     * Array of system placeholders. Protected to allow extension by subclasses.
     * @protected
     */
    protected static placeholders: SystemPlaceholder[] = [...DEFAULT_SYSTEM_PLACEHOLDERS];

    /**
     * Gets the current array of system placeholders.
     * Returns a reference to the array, allowing direct manipulation.
     * 
     * @returns {SystemPlaceholder[]} The array of system placeholders
     * 
     * @example
     * ```typescript
     * const placeholders = SystemPlaceholderManager.getPlaceholders();
     * placeholders.push({
     *   name: '_CUSTOM_VALUE',
     *   description: 'My custom value',
     *   getValue: async (params) => 'custom result'
     * });
     * ```
     */
    public static getPlaceholders(): SystemPlaceholder[] {
        return this.placeholders;
    }

    /**
     * Adds a new system placeholder.
     * 
     * @param {SystemPlaceholder} placeholder - The placeholder to add
     * @throws {Error} If a placeholder with the same name already exists
     * 
     * @example
     * ```typescript
     * SystemPlaceholderManager.addPlaceholder({
     *   name: '_ORGANIZATION_NAME',
     *   description: 'Current organization name',
     *   getValue: async (params) => {
     *     // Custom logic to get organization name
     *     return 'My Organization';
     *   }
     * });
     * ```
     */
    public static addPlaceholder(placeholder: SystemPlaceholder): void {
        const existing = this.placeholders.find(p => p.name === placeholder.name);
        if (existing) {
            throw new Error(`System placeholder '${placeholder.name}' already exists`);
        }
        this.placeholders.push(placeholder);
    }

    /**
     * Removes a system placeholder by name.
     * 
     * @param {string} name - The name of the placeholder to remove
     * @returns {boolean} True if removed, false if not found
     */
    public static removePlaceholder(name: string): boolean {
        const index = this.placeholders.findIndex(p => p.name === name);
        if (index >= 0) {
            this.placeholders.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Resolves all system placeholders for the given prompt parameters.
     * Returns a map of placeholder names to their resolved values.
     * 
     * @param {AIPromptParams} params - The prompt parameters
     * @returns {Promise<Record<string, string>>} Map of placeholder names to values
     * 
     * @internal
     */
    public static async resolveAllPlaceholders(params: AIPromptParams): Promise<Record<string, string>> {
        // Create promise array with placeholder name for mapping
        const resolvePromises = this.placeholders.map(async (placeholder) => {
            try {
                const value = await placeholder.getValue(params);
                return { name: placeholder.name, value };
            } catch (error) {
                console.error(`Error resolving system placeholder '${placeholder.name}':`, error);
                return { name: placeholder.name, value: '' }; // Default to empty string on error
            }
        });

        // Execute all promises in parallel
        const results = await Promise.all(resolvePromises);
        
        // Convert array of results to object
        const resolved: Record<string, string> = {};
        for (const result of results) {
            resolved[result.name] = result.value;
        }
        
        return resolved;
    }

    /**
     * Gets a specific placeholder by name.
     * 
     * @param {string} name - The placeholder name
     * @returns {SystemPlaceholder | undefined} The placeholder if found
     */
    public static getPlaceholder(name: string): SystemPlaceholder | undefined {
        return this.placeholders.find(p => p.name === name);
    }

    /**
     * Clears all custom placeholders and resets to defaults.
     * Useful for testing or resetting state.
     */
    public static resetToDefaults(): void {
        this.placeholders = [...DEFAULT_SYSTEM_PLACEHOLDERS];
    }
}