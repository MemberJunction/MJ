/**
 * @fileoverview Component interaction tool definitions for the Angular Agent Client.
 *
 * Pre-built tool definitions for manipulating Knowledge Hub UI components
 * from agent commands (opening panels, applying filters, etc.).
 *
 * @module @memberjunction/ng-agent-client
 */

import { ClientToolDefinition, ClientToolResult } from '@memberjunction/ai-agent-client';

/**
 * Create an "open_search_panel" tool definition.
 * Opens or focuses the search panel in the Knowledge Hub.
 */
export function CreateOpenSearchPanelTool(): ClientToolDefinition {
    return {
        Name: 'open_search_panel',
        Description: 'Open or focus the search panel in the Knowledge Hub',
        ParameterSchema: {
            type: 'object',
            properties: {
                Query: { type: 'string', description: 'Optional search query to pre-fill' },
            },
        },
        Handler: async (params: Record<string, unknown>): Promise<ClientToolResult> => {
            const query = params['Query'] != null ? String(params['Query']) : undefined;
            // In a real implementation, this would emit an event picked up by the
            // Knowledge Hub shell component. For now, return success with the intent.
            return {
                Success: true,
                Data: { Action: 'open_search_panel', Query: query },
            };
        },
    };
}

/**
 * Create an "apply_search_filter" tool definition.
 * Applies filters to the current Knowledge Hub search results.
 */
export function CreateApplySearchFilterTool(): ClientToolDefinition {
    return {
        Name: 'apply_search_filter',
        Description: 'Apply filters to the current Knowledge Hub search results',
        ParameterSchema: {
            type: 'object',
            properties: {
                EntityNames: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter to specific entity names',
                },
                SourceTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter to specific source types',
                },
                Tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter to specific tags',
                },
            },
        },
        Handler: async (params: Record<string, unknown>): Promise<ClientToolResult> => {
            return {
                Success: true,
                Data: {
                    Action: 'apply_search_filter',
                    EntityNames: params['EntityNames'],
                    SourceTypes: params['SourceTypes'],
                    Tags: params['Tags'],
                },
            };
        },
    };
}

/**
 * Create a "show_entity_details" tool definition.
 * Opens a details panel for a specific entity record.
 */
export function CreateShowEntityDetailsTool(): ClientToolDefinition {
    return {
        Name: 'show_entity_details',
        Description: 'Open a details panel for a specific entity record',
        ParameterSchema: {
            type: 'object',
            properties: {
                EntityName: { type: 'string', description: 'The MJ entity name' },
                RecordID: { type: 'string', description: 'The record ID to show details for' },
            },
            required: ['EntityName', 'RecordID'],
        },
        Handler: async (params: Record<string, unknown>): Promise<ClientToolResult> => {
            return {
                Success: true,
                Data: {
                    Action: 'show_entity_details',
                    EntityName: String(params['EntityName']),
                    RecordID: String(params['RecordID']),
                },
            };
        },
    };
}
