/**
 * @fileoverview Default client tool metadata definitions.
 *
 * These are the built-in client tools available to all agents with client tool
 * support enabled. They cover the most common browser-side UI interactions:
 * navigation, tab switching, and search.
 *
 * Apps can register additional tools at runtime via AgentClientSession.AddClientTool().
 *
 * @module @memberjunction/ai-core-plus
 */

import { ClientToolMetadata } from './agent-types';

/**
 * Navigate to a specific entity record in the UI.
 */
export const NavigateToRecordTool: ClientToolMetadata = {
    Name: 'NavigateToRecord',
    Description: 'Open a specific entity record in a new tab for the user to view or edit',
    InputSchema: {
        type: 'object',
        properties: {
            EntityName: { type: 'string', description: 'The entity name (e.g., "Members", "MJ: Actions")' },
            RecordID: { type: 'string', description: 'The primary key value of the record' }
        },
        required: ['EntityName', 'RecordID']
    },
    OutputSchema: {
        type: 'object',
        properties: {
            navigated: { type: 'boolean' }
        }
    },
    Category: 'navigation'
};

/**
 * Switch the active tab in the current application dashboard.
 */
export const SwitchDashboardTabTool: ClientToolMetadata = {
    Name: 'SwitchDashboardTab',
    Description: 'Switch the active tab in the current application dashboard',
    InputSchema: {
        type: 'object',
        properties: {
            TabName: { type: 'string', description: 'The name of the tab to switch to' }
        },
        required: ['TabName']
    },
    OutputSchema: {
        type: 'object',
        properties: {
            switched: { type: 'boolean' }
        }
    },
    Category: 'navigation'
};

/**
 * Navigate to the Knowledge Hub search tab and execute a search query.
 */
export const ShowSearchResultsTool: ClientToolMetadata = {
    Name: 'ShowSearchResults',
    Description: 'Navigate to the Knowledge Hub search tab and execute a search query',
    InputSchema: {
        type: 'object',
        properties: {
            Query: { type: 'string', description: 'The search query to execute' }
        },
        required: ['Query']
    },
    OutputSchema: {
        type: 'object',
        properties: {
            resultCount: { type: 'number' },
            navigated: { type: 'boolean' }
        }
    },
    Category: 'display'
};

/**
 * All default client tools. Agents get these by default when client tools are enabled.
 */
export const DefaultClientTools: ClientToolMetadata[] = [
    NavigateToRecordTool,
    SwitchDashboardTabTool,
    ShowSearchResultsTool
];
