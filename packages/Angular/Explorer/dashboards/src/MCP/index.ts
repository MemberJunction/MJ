/**
 * @fileoverview MCP Module Exports
 *
 * Public API exports for the MCP management module.
 */

// Module
export { MCPModule, LoadMCPModule } from './mcp.module';

// Dashboard Component
export {
    MCPDashboardComponent,
    LoadMCPDashboard,
    MCPServerData,
    MCPConnectionData,
    MCPToolData,
    MCPExecutionLogData,
    MCPDashboardFilters,
    MCPDashboardStats,
    MCPDashboardTab
} from './mcp-dashboard.component';

// Dialog Components
export {
    MCPServerDialogComponent,
    LoadMCPServerDialog,
    ServerDialogResult,
    TRANSPORT_TYPES,
    AUTH_TYPES
} from './components/mcp-server-dialog.component';

export {
    MCPConnectionDialogComponent,
    LoadMCPConnectionDialog,
    ConnectionDialogResult
} from './components/mcp-connection-dialog.component';

// Services
export {
    MCPToolsService,
    LoadMCPToolsService,
    MCPSyncResult,
    MCPSyncProgress,
    MCPSyncState
} from './services/mcp-tools.service';
