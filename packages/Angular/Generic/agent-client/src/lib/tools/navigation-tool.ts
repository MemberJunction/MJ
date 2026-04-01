/**
 * @fileoverview Navigation tool definitions for the Angular Agent Client.
 *
 * Pre-built tool definitions for navigating MJ Explorer from agent commands.
 * These are registered automatically by the AgentClientService.
 *
 * @module @memberjunction/ng-agent-client
 */

import { Router } from '@angular/router';
import { ClientToolDefinition, ClientToolResult } from '@memberjunction/ai-agent-client';

/**
 * Create a "navigate_to_record" tool definition bound to a specific Angular Router.
 */
export function CreateNavigateToRecordTool(router: Router): ClientToolDefinition {
    return {
        Name: 'navigate_to_record',
        Description: 'Navigate the browser to a specific entity record in MJ Explorer',
        ParameterSchema: {
            type: 'object',
            properties: {
                EntityName: { type: 'string', description: 'The MJ entity name' },
                RecordID: { type: 'string', description: 'The record ID to navigate to' },
            },
            required: ['EntityName', 'RecordID'],
        },
        Handler: async (params: Record<string, unknown>): Promise<ClientToolResult> => {
            const entityName = String(params['EntityName']);
            const recordId = String(params['RecordID']);

            try {
                await router.navigate(['/resource', 'entity', entityName, recordId]);
                return { Success: true, Data: { Navigated: true, EntityName: entityName, RecordID: recordId } };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return { Success: false, ErrorMessage: `Navigation failed: ${message}` };
            }
        },
    };
}

/**
 * Create a "navigate_to_app" tool definition bound to a specific Angular Router.
 */
export function CreateNavigateToAppTool(router: Router): ClientToolDefinition {
    return {
        Name: 'navigate_to_app',
        Description: 'Switch to a different MJ Explorer application by name',
        ParameterSchema: {
            type: 'object',
            properties: {
                AppName: { type: 'string', description: 'The application name to switch to' },
            },
            required: ['AppName'],
        },
        Handler: async (params: Record<string, unknown>): Promise<ClientToolResult> => {
            const appName = String(params['AppName']);

            try {
                await router.navigate(['/app', appName]);
                return { Success: true, Data: { Navigated: true, AppName: appName } };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return { Success: false, ErrorMessage: `Navigation failed: ${message}` };
            }
        },
    };
}
