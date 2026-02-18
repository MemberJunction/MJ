/**
 * @fileoverview MCP Module Exports
 *
 * Public API exports for the MCP management module.
 */

// Module
export { MCPModule } from './mcp.module';

// Dashboard Component
export {
    MCPDashboardComponent,
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
    ServerDialogResult,
    TRANSPORT_TYPES,
    AUTH_TYPES
} from './components/mcp-server-dialog.component';

export {
    MCPConnectionDialogComponent,
    ConnectionDialogResult
} from './components/mcp-connection-dialog.component';

// Services
export {
    MCPToolsService,
    MCPSyncResult,
    MCPSyncProgress,
    MCPSyncState
} from './services/mcp-tools.service';
