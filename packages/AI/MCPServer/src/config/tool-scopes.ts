/**
 * Tool Scope Mapping Configuration
 *
 * Defines which scopes are required to access each type of MCP tool.
 * Supports wildcard patterns for dynamic tool names.
 *
 * Scope Format: "category:action"
 * - entities:read, entities:create, entities:update, entities:delete
 * - agents:discover, agents:execute
 * - admin:* (grants all permissions)
 */

export interface ToolScopeRequirement {
    /**
     * Tool name or pattern (supports wildcards: Get_*_Record)
     */
    pattern: string;

    /**
     * Required scopes (user must have at least ONE of these)
     */
    requiredScopes: string[];

    /**
     * Description of what this tool does
     */
    description?: string;
}

/**
 * Scope requirements for all MCP tools
 */
export const TOOL_SCOPE_REQUIREMENTS: ToolScopeRequirement[] = [
    // Entity Read Operations
    {
        pattern: 'Get_*_Record',
        requiredScopes: ['entities:read', 'admin:*'],
        description: 'Retrieve a single record by ID'
    },
    {
        pattern: 'Run_*_View',
        requiredScopes: ['entities:read', 'admin:*'],
        description: 'Query records with filtering and sorting'
    },

    // Entity Create Operations
    {
        pattern: 'Create_*_Record',
        requiredScopes: ['entities:write', 'admin:*'],
        description: 'Create a new record'
    },

    // Entity Update Operations
    {
        pattern: 'Update_*_Record',
        requiredScopes: ['entities:write', 'admin:*'],
        description: 'Update an existing record'
    },

    // Entity Delete Operations
    {
        pattern: 'Delete_*_Record',
        requiredScopes: ['entities:write', 'admin:*'],
        description: 'Delete a record by ID'
    },

    // Metadata Tools
    {
        pattern: 'Get_All_Entities',
        requiredScopes: ['entities:read', 'admin:*'],
        description: 'List all available entities'
    },
    {
        pattern: 'Get_Entity_Details',
        requiredScopes: ['entities:read', 'admin:*'],
        description: 'Get detailed field information for an entity'
    },

    // Agent Tools
    {
        pattern: 'List_Available_Agents',
        requiredScopes: ['agents:discover', 'admin:*'],
        description: 'List all available AI agents'
    },
    {
        pattern: 'Run_Agent',
        requiredScopes: ['agents:execute', 'admin:*'],
        description: 'Execute an AI agent'
    },
    {
        pattern: 'Get_Agent_Run_*',
        requiredScopes: ['agents:execute', 'admin:*'],
        description: 'Retrieve agent run details and diagnostics'
    }
];

/**
 * Check if a tool name matches a pattern (supports wildcards)
 */
export function matchesPattern(toolName: string, pattern: string): boolean {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
        .replace(/\*/g, '.*')  // * becomes .*
        .replace(/\?/g, '.');   // ? becomes .

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(toolName);
}

/**
 * Get required scopes for a tool name
 * Returns empty array if no scope requirements found (tool is public)
 */
export function getRequiredScopes(toolName: string): string[] {
    for (const requirement of TOOL_SCOPE_REQUIREMENTS) {
        if (matchesPattern(toolName, requirement.pattern)) {
            return requirement.requiredScopes;
        }
    }
    return []; // No scope requirements - tool is accessible to all
}

/**
 * Check if user has at least one of the required scopes
 */
export function hasRequiredScope(userScopes: string[], requiredScopes: string[]): boolean {
    if (requiredScopes.length === 0) {
        return true; // No requirements
    }

    return requiredScopes.some(requiredScope => {
        // Check for exact match
        if (userScopes.includes(requiredScope)) {
            return true;
        }

        // Check for wildcard matches (e.g., entities:* matches entities:read)
        return userScopes.some(userScope => {
            if (userScope.endsWith(':*')) {
                const category = userScope.slice(0, -2); // Remove ':*'
                return requiredScope.startsWith(category + ':');
            }
            return false;
        });
    });
}
