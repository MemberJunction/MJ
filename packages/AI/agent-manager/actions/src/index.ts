// Export all agent management actions
export * from './actions/base-agent-management.action';
export * from './actions/create-agent.action';
export * from './actions/create-sub-agent.action';
export * from './actions/update-agent.action';
export * from './actions/list-agents.action';
export * from './actions/associate-action-with-agent.action';
export * from './actions/list-actions.action';

// Core types should be imported from the core package directly

// Load all actions to ensure registration
import { LoadCreateAgentAction } from './actions/create-agent.action';
import { LoadCreateSubAgentAction } from './actions/create-sub-agent.action';
import { LoadUpdateAgentAction } from './actions/update-agent.action';
import { LoadListAgentsAction } from './actions/list-agents.action';
import { LoadAssociateActionWithAgentAction } from './actions/associate-action-with-agent.action';
import { LoadListActionsAction } from './actions/list-actions.action';

// Execute all loaders to register actions
export function LoadAgentManagementActions() {
    LoadCreateAgentAction();
    LoadCreateSubAgentAction();
    LoadUpdateAgentAction();
    LoadListAgentsAction();
    LoadAssociateActionWithAgentAction();
    LoadListActionsAction();
    
    // Additional actions to be implemented:
    // - DeactivateAgentAction
    // - SetAgentPromptAction
    // - ValidateAgentConfigurationAction
    // - ExportAgentBundleAction
}

// Auto-load on import
LoadAgentManagementActions();